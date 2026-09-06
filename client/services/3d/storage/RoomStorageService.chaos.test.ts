/**
 * RoomStorageService.chaos.test.ts
 * Empirical Stress, Chaos, and Adversarial Test Suite for Milestone 1.
 * Tests edge cases, corrupt payloads, prototype pollution, non-finite numbers,
 * extreme bounds, 500+ object serialization, index self-healing, and UUID collisions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RoomStorageService,
  ROOMS_INDEX_KEY,
  ROOM_PREFIX,
  ACTIVE_BACKGROUND_ROOM_KEY,
  slugify,
} from "./RoomStorageService";
import {
  COZY_BEDROOM_TEMPLATE,
  BLANK_CANVAS_TEMPLATE,
  BUILT_IN_TEMPLATES,
  instantiateRoomTemplate,
} from "./RoomTemplates";
import {
  RoomDocument,
  RoomDocumentSchema,
  HexColorSchema,
  Vector3TupleSchema,
  TransformSchema,
  CameraBookmarkSchema,
  EnvironmentSettingsSchema,
  RoomObject,
} from "@/types/threeDBackground";

class MockLocalStorage implements Storage {
  private data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.data).length;
  }

  clear(): void {
    this.data = {};
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  key(index: number): string | null {
    return Object.keys(this.data)[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }
}

describe("Adversarial Chaos & Stress Test Suite: RoomStorageService & RoomDocumentSchema", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    RoomStorageService.setStorageProvider(mockStorage);
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Corrupt JSON & Malformed Payloads
  // ==========================================================================
  describe("1. Corrupt JSON & Malformed Payloads", () => {
    it("should reject completely unparseable JSON strings", async () => {
      const corruptInputs = [
        "INVALID_JSON_{{{",
        "",
        "   ",
        "<xml><room>test</room></xml>",
        "undefined",
        "{ key: unquotedValue }",
        "{\"unterminated: \"string\"",
      ];

      for (const input of corruptInputs) {
        const result = await RoomStorageService.importRoomFromJson(input);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Malformed JSON");
      }
    });

    it("should reject valid JSON containing primitive or array non-objects", async () => {
      const nonObjectJson = [
        "12345",
        "true",
        "false",
        "null",
        "\"a string\"",
        "[]",
        "[\"array\", \"of\", \"strings\"]",
      ];

      for (const input of nonObjectJson) {
        const result = await RoomStorageService.importRoomFromJson(input);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should reject JSON missing mandatory top-level fields", async () => {
      const baseValid = JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE));

      const mandatoryFields = [
        "schemaVersion",
        "id",
        "name",
        "createdAt",
        "updatedAt",
        "environment",
        "cameraBookmarks",
      ];

      for (const field of mandatoryFields) {
        const payload = { ...baseValid };
        delete payload[field];

        const result = await RoomStorageService.importRoomFromJson(JSON.stringify(payload));
        expect(result.success, `Should reject when missing field: ${field}`).toBe(false);
        expect(result.error).toContain("Invalid room schema");
      }
    });

    it("should reject incompatible schema versions", async () => {
      const invalidVersions = ["0.9.0", "2.0.0", "1.0", "v1.0.0", ""];

      for (const version of invalidVersions) {
        const payload = {
          ...JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE)),
          schemaVersion: version,
        };

        const result = await RoomStorageService.importRoomFromJson(JSON.stringify(payload));
        expect(result.success).toBe(false);
      }
    });

    it("should reject non-UUID identifiers in room document and objects", async () => {
      const invalidUuids = [
        "not-a-uuid",
        "12345",
        "",
        "g1a7e430-1001-4d92-8001-000000000001", // invalid hex 'g'
        "b1a7e430-1001-4d92-8001-00000000000", // too short
        "b1a7e430-1001-4d92-8001-0000000000001", // too long
      ];

      for (const badId of invalidUuids) {
        const badRoom = {
          ...JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE)),
          id: badId,
        };
        const res1 = RoomDocumentSchema.safeParse(badRoom);
        expect(res1.success).toBe(false);

        const badObjRoom = JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE));
        badObjRoom.objects[0].id = badId;
        const res2 = RoomDocumentSchema.safeParse(badObjRoom);
        expect(res2.success).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 2. Prototype Pollution Resistance
  // ==========================================================================
  describe("2. Prototype Pollution Resistance", () => {
    it("should strip __proto__ and constructor properties during JSON import without polluting Object.prototype", async () => {
      const maliciousPayload = JSON.stringify({
        ...COZY_BEDROOM_TEMPLATE,
        __proto__: { pollutedKey: "injected_root" },
        constructor: { prototype: { admin: true } },
        objects: [
          {
            ...COZY_BEDROOM_TEMPLATE.objects[0],
            __proto__: { pollutedObjectKey: "injected_obj" },
            customProps: {
              ...COZY_BEDROOM_TEMPLATE.objects[0].customProps,
              __proto__: { pollutedCustomKey: "injected_custom" },
            },
          },
        ],
      });

      const importResult = await RoomStorageService.importRoomFromJson(maliciousPayload);
      expect(importResult.success).toBe(true);

      // Verify Object prototype was not polluted
      const cleanObj: any = {};
      expect(cleanObj.pollutedKey).toBeUndefined();
      expect(cleanObj.admin).toBeUndefined();
      expect(cleanObj.pollutedObjectKey).toBeUndefined();
      expect(cleanObj.pollutedCustomKey).toBeUndefined();

      // Verify imported room document does not have own malicious properties
      const room = importResult.room!;
      expect(Object.prototype.hasOwnProperty.call(room, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(room.objects[0], "__proto__")).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Non-Finite Numbers & Bounded Values
  // ==========================================================================
  describe("3. Non-Finite Numbers & Coordinate Bounds", () => {
    it("should reject NaN, Infinity, and -Infinity in coordinates and rotations", () => {
      const nonFiniteValues = [NaN, Infinity, -Infinity];

      for (const val of nonFiniteValues) {
        // Vector3Tuple position
        expect(Vector3TupleSchema.safeParse([val, 0, 0]).success).toBe(false);
        expect(Vector3TupleSchema.safeParse([0, val, 0]).success).toBe(false);
        expect(Vector3TupleSchema.safeParse([0, 0, val]).success).toBe(false);

        // Transform rotation
        const badTransform = {
          position: [0, 0, 0],
          rotation: [val, 0, 0],
          scale: [1, 1, 1],
        };
        expect(TransformSchema.safeParse(badTransform).success).toBe(false);
      }
    });

    it("should enforce scale bounds (0.001 <= s <= 100)", () => {
      const invalidScales = [
        [0, 1, 1],
        [-0.001, 1, 1],
        [-10, 1, 1],
        [100.001, 1, 1],
        [500, 1, 1],
      ];

      for (const scale of invalidScales) {
        const badTransform = {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: scale,
        };
        expect(TransformSchema.safeParse(badTransform).success).toBe(false);
      }

      // Valid boundary scales
      expect(
        TransformSchema.safeParse({
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [0.001, 0.001, 0.001],
        }).success
      ).toBe(true);

      expect(
        TransformSchema.safeParse({
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [100, 100, 100],
        }).success
      ).toBe(true);
    });

    it("should enforce strict bounds on environment settings", () => {
      const baseEnv = COZY_BEDROOM_TEMPLATE.environment;

      // windSpeed: 0 to 15
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windSpeed: -0.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windSpeed: 15.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windSpeed: 15.0 }).success).toBe(true);

      // windDirection: 0 to 360
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windDirection: -1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windDirection: 360.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windDirection: 360 }).success).toBe(true);

      // windGustiness: 0.0 to 1.0
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windGustiness: -0.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windGustiness: 1.01 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, windGustiness: 1.0 }).success).toBe(true);

      // sunIntensity: 0 to 10
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, sunIntensity: -0.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, sunIntensity: 10.1 }).success).toBe(false);

      // ambientIntensity: 0 to 5
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, ambientIntensity: -0.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, ambientIntensity: 5.1 }).success).toBe(false);

      // timeOfDay: 0 to 24
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, timeOfDay: -0.1 }).success).toBe(false);
      expect(EnvironmentSettingsSchema.safeParse({ ...baseEnv, timeOfDay: 24.1 }).success).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Hex Color Schema Validation
  // ==========================================================================
  describe("4. Hex Color Schema Validation", () => {
    it("should accept valid 3-digit, 6-digit, and 8-digit hex colors", () => {
      const validHex = [
        "#FFF",
        "#fff",
        "#000",
        "#123",
        "#FFFFFF",
        "#ffffff",
        "#1E3A8A",
        "#f4a261",
        "#FFFFFFFF", // 8-char RGBA
        "#1e3a8a80",
      ];

      for (const hex of validHex) {
        expect(HexColorSchema.safeParse(hex).success, `Expected valid: ${hex}`).toBe(true);
      }
    });

    it("should reject invalid color formats (short hex, named colors, rgb/hsl, non-hex chars)", () => {
      const invalidColors = [
        "#12", // 2 hex digits
        "#1234", // 4 hex digits
        "#12345", // 5 hex digits
        "#1234567", // 7 hex digits
        "#123456789", // 9 hex digits
        "red",
        "blue",
        "transparent",
        "rgb(255, 0, 0)",
        "rgba(0, 0, 0, 1)",
        "hsl(0, 100%, 50%)",
        "#GGGGGG", // non-hex
        "#ZZZ",
        "",
        "FFFFFF", // missing #
      ];

      for (const color of invalidColors) {
        expect(HexColorSchema.safeParse(color).success, `Expected invalid: ${color}`).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 5. Extreme Name Lengths & Camera Bookmark Bounds
  // ==========================================================================
  describe("5. Boundary Strings & Camera Bookmarks", () => {
    it("should enforce name length bounds on room and objects (1 to 100 chars)", () => {
      const validRoom = JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE));

      // Empty room name
      validRoom.name = "";
      expect(RoomDocumentSchema.safeParse(validRoom).success).toBe(false);

      // 100 chars: valid
      validRoom.name = "A".repeat(100);
      expect(RoomDocumentSchema.safeParse(validRoom).success).toBe(true);

      // 101 chars: invalid
      validRoom.name = "A".repeat(101);
      expect(RoomDocumentSchema.safeParse(validRoom).success).toBe(false);

      // Empty object name
      const validRoom2 = JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE));
      validRoom2.objects[0].name = "";
      expect(RoomDocumentSchema.safeParse(validRoom2).success).toBe(false);

      // 101 char object name
      validRoom2.objects[0].name = "B".repeat(101);
      expect(RoomDocumentSchema.safeParse(validRoom2).success).toBe(false);
    });

    it("should enforce camera bookmark fov bounds (10 to 120 degrees)", () => {
      const validBookmark = COZY_BEDROOM_TEMPLATE.cameraBookmarks[0];

      expect(CameraBookmarkSchema.safeParse({ ...validBookmark, fov: 9.9 }).success).toBe(false);
      expect(CameraBookmarkSchema.safeParse({ ...validBookmark, fov: 120.1 }).success).toBe(false);
      expect(CameraBookmarkSchema.safeParse({ ...validBookmark, fov: 10 }).success).toBe(true);
      expect(CameraBookmarkSchema.safeParse({ ...validBookmark, fov: 120 }).success).toBe(true);
      expect(CameraBookmarkSchema.safeParse({ ...validBookmark, fov: 50 }).success).toBe(true);
    });

    it("should require at least one camera bookmark in room document", () => {
      const noBookmarks = {
        ...JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE)),
        cameraBookmarks: [],
      };
      expect(RoomDocumentSchema.safeParse(noBookmarks).success).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Object Array Scaling & 500+ Object Stress Serialization
  // ==========================================================================
  describe("6. Object Array Stress & High Capacity", () => {
    it("should allow a room with 0 objects (blank room)", () => {
      const emptyRoom: RoomDocument = {
        ...JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE)),
        id: "d4e5f6a7-1111-4444-8888-000000000001",
        objects: [],
      };

      const result = RoomStorageService.saveRoom(emptyRoom);
      expect(result.success).toBe(true);

      const loaded = RoomStorageService.loadRoom(emptyRoom.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.objects).toHaveLength(0);
    });

    it("should serialize, validate, save, reload, and duplicate a room with 550 objects", () => {
      const heavyRoom: RoomDocument = {
        ...JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE)),
        id: "e5f6a7b8-2222-4444-8888-000000000002",
        name: "550 Object Stress Room",
        objects: [],
      };

      // Generate 550 distinct objects
      for (let i = 0; i < 550; i++) {
        const hexIndex = i.toString(16).padStart(12, "0");
        const obj: RoomObject = {
          id: `c021b3d0-5500-4000-8000-${hexIndex}`,
          name: `Stress Mesh ${i}`,
          catalogId: i % 2 === 0 ? "wall_straight" : "furniture_lamp_table",
          type: i % 2 === 0 ? "wall" : "furniture",
          transform: {
            position: [(i % 25) * 0.5 - 6, Math.floor(i / 25) * 0.2, (i % 10) * 0.5 - 2.5],
            rotation: [0, (i * 0.05) % (Math.PI * 2), 0],
            scale: [1, 1, 1],
          },
          customProps: {
            colorTint: "#4A90E2",
          },
          visible: true,
          locked: false,
        };
        heavyRoom.objects.push(obj);
      }

      expect(heavyRoom.objects.length).toBe(550);

      // 1. Validate Schema
      const validation = RoomDocumentSchema.safeParse(heavyRoom);
      expect(validation.success).toBe(true);

      // 2. Save Room
      const saveRes = RoomStorageService.saveRoom(heavyRoom);
      expect(saveRes.success).toBe(true);

      // 3. Check Metadata objectCount in Index
      const indexEntry = RoomStorageService.listRooms().find((r) => r.id === heavyRoom.id);
      expect(indexEntry).toBeDefined();
      expect(indexEntry?.objectCount).toBe(550);

      // 4. Load Room and verify object integrity
      const loaded = RoomStorageService.loadRoom(heavyRoom.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.objects.length).toBe(550);
      expect(loaded?.objects[549].name).toBe("Stress Mesh 549");

      // 5. Duplicate 550-object Room
      const duplicated = RoomStorageService.duplicateRoom(heavyRoom.id);
      expect(duplicated).not.toBeNull();
      expect(duplicated?.id).not.toBe(heavyRoom.id);
      expect(duplicated?.objects.length).toBe(550);

      // Verify duplicated object IDs are distinct from source
      const originalIds = new Set(heavyRoom.objects.map((o) => o.id));
      expect(originalIds.has(duplicated!.objects[0].id)).toBe(false);
      expect(originalIds.has(duplicated!.objects[549].id)).toBe(false);
    });
  });

  // ==========================================================================
  // 7. Storage Index Self-Healing Under Severe Corruption
  // ==========================================================================
  describe("7. Storage Index Self-Healing Under Severe Corruption", () => {
    it("should recover valid custom rooms when index is corrupted with invalid JSON", () => {
      // 1. Save two valid rooms directly to storage keys
      const room1: RoomDocument = {
        ...JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE)),
        id: "a1111111-1111-4111-8111-111111111111",
        name: "Survivor Room Alpha",
        updatedAt: "2026-09-06T12:00:00.000Z",
      };
      const room2: RoomDocument = {
        ...JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE)),
        id: "b2222222-2222-4222-8222-222222222222",
        name: "Survivor Room Beta",
        updatedAt: "2026-09-06T12:05:00.000Z",
      };

      mockStorage.setItem(ROOM_PREFIX + room1.id, JSON.stringify(room1));
      mockStorage.setItem(ROOM_PREFIX + room2.id, JSON.stringify(room2));

      // 2. Also inject a corrupt room key and unrelated storage keys
      mockStorage.setItem(ROOM_PREFIX + "corrupted_room_id", "CORRUPTED_ROOM_DATA{{{");
      mockStorage.setItem("unrelated_app_setting", "true");

      // 3. Corrupt index with completely invalid JSON
      mockStorage.setItem(ROOMS_INDEX_KEY, "SYNTAX_ERROR_CORRUPT_JSON_{{");

      // 4. listRooms() should auto-recover
      const list = RoomStorageService.listRooms();

      expect(list.some((r) => r.id === room1.id)).toBe(true);
      expect(list.some((r) => r.id === room2.id)).toBe(true);
      expect(list.some((r) => r.name === "Survivor Room Alpha")).toBe(true);
      expect(list.some((r) => r.name === "Survivor Room Beta")).toBe(true);

      // Built-in templates should also be restored
      expect(list.some((r) => r.id === COZY_BEDROOM_TEMPLATE.id)).toBe(true);

      // Verify that the index was rewritten with valid JSON
      const repairedIndexRaw = mockStorage.getItem(ROOMS_INDEX_KEY);
      expect(repairedIndexRaw).not.toBeNull();
      expect(() => JSON.parse(repairedIndexRaw!)).not.toThrow();
    });

    it("should recover index when index JSON is an empty or garbage array", () => {
      // Save valid custom room
      const room: RoomDocument = {
        ...JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE)),
        id: "c3333333-3333-4333-8333-333333333333",
        name: "Survivor Gamma",
      };
      mockStorage.setItem(ROOM_PREFIX + room.id, JSON.stringify(room));

      // Index is an array of non-metadata garbage
      mockStorage.setItem(
        ROOMS_INDEX_KEY,
        JSON.stringify([null, 42, "not-metadata", { invalidKey: true }])
      );

      const list = RoomStorageService.listRooms();
      expect(list.some((r) => r.id === room.id)).toBe(true);
      expect(list.some((r) => r.id === COZY_BEDROOM_TEMPLATE.id)).toBe(true);
    });

    it("should re-seed built-in templates when storage is completely empty", () => {
      mockStorage.clear();
      expect(mockStorage.getItem(ROOMS_INDEX_KEY)).toBeNull();

      const list = RoomStorageService.listRooms();
      expect(list.length).toBe(3);
      expect(list.map((r) => r.id)).toEqual(BUILT_IN_TEMPLATES.map((t) => t.id));

      const storedIndex = mockStorage.getItem(ROOMS_INDEX_KEY);
      expect(storedIndex).not.toBeNull();
    });
  });

  // ==========================================================================
  // 8. UUID Collision & Idempotency on Multiple Re-Imports
  // ==========================================================================
  describe("8. UUID Collision & Idempotency on Multiple Re-Imports", () => {
    it("should assign distinct UUIDs every time the same room JSON is imported", async () => {
      const sourceJson = JSON.stringify(COZY_BEDROOM_TEMPLATE);
      const IMPORT_COUNT = 5;
      const importedRooms: RoomDocument[] = [];

      for (let i = 0; i < IMPORT_COUNT; i++) {
        const result = await RoomStorageService.importRoomFromJson(sourceJson);
        expect(result.success).toBe(true);
        expect(result.room).toBeDefined();
        importedRooms.push(result.room!);
      }

      // 1. All room IDs must be distinct from source template
      for (const room of importedRooms) {
        expect(room.id).not.toBe(COZY_BEDROOM_TEMPLATE.id);
      }

      // 2. All imported room IDs must be mutually unique
      const roomIds = new Set(importedRooms.map((r) => r.id));
      expect(roomIds.size).toBe(IMPORT_COUNT);

      // 3. Object IDs across all instances must be mutually unique
      const allObjectIds = new Set<string>();
      for (const room of importedRooms) {
        for (const obj of room.objects) {
          expect(allObjectIds.has(obj.id), `Duplicate object ID detected: ${obj.id}`).toBe(false);
          allObjectIds.add(obj.id);
        }
      }

      // Total distinct object IDs = IMPORT_COUNT * COZY_BEDROOM_OBJECTS.length
      expect(allObjectIds.size).toBe(IMPORT_COUNT * COZY_BEDROOM_TEMPLATE.objects.length);

      // 4. Camera bookmark IDs across all instances must be mutually unique
      const allBookmarkIds = new Set<string>();
      for (const room of importedRooms) {
        for (const bm of room.cameraBookmarks) {
          expect(allBookmarkIds.has(bm.id), `Duplicate bookmark ID detected: ${bm.id}`).toBe(false);
          allBookmarkIds.add(bm.id);
        }
      }
      expect(allBookmarkIds.size).toBe(IMPORT_COUNT * COZY_BEDROOM_TEMPLATE.cameraBookmarks.length);

      // 5. All 5 imported rooms must coexist in listRooms()
      const currentList = RoomStorageService.listRooms();
      for (const room of importedRooms) {
        expect(currentList.some((r) => r.id === room.id)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 9. Active Background Reference Integrity
  // ==========================================================================
  describe("9. Active Background Preference Edge Cases", () => {
    it("should return null and clean storage when active background ID points to deleted room", () => {
      const ghostId = "99999999-9999-4999-8999-999999999999";
      mockStorage.setItem(ACTIVE_BACKGROUND_ROOM_KEY, ghostId);

      // loadRoom(ghostId) will return null
      const activeId = RoomStorageService.getActiveBackgroundRoomId();
      expect(activeId).toBeNull();

      // Should have cleared the obsolete key from storage
      expect(mockStorage.getItem(ACTIVE_BACKGROUND_ROOM_KEY)).toBeNull();
    });

    it("should allow built-in template as active background", () => {
      RoomStorageService.setActiveBackgroundRoomId(COZY_BEDROOM_TEMPLATE.id);
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBe(COZY_BEDROOM_TEMPLATE.id);
    });
  });

  // ==========================================================================
  // 10. Slugify Sanitization & Directory Traversal Protection
  // ==========================================================================
  describe("10. Slugify Sanitization & Directory Traversal Protection", () => {
    it("should sanitize file names and defend against path traversal attempts", () => {
      expect(slugify("../../../etc/passwd")).toBe("etcpasswd");
      expect(slugify("..\\..\\windows\\system32")).toBe("windowssystem32");
      expect(slugify("Room / With / Slashes")).toBe("room-with-slashes");
      expect(slugify("   Spaces   Around   ")).toBe("spaces-around");
      expect(slugify("!@#$%^&*()_+")).toBe("_");
      expect(slugify("")).toBe("untitled");
      expect(slugify("   ")).toBe("untitled");
      expect(slugify("---")).toBe("untitled");
      expect(slugify("Cozy Bedroom")).toBe("cozy-bedroom");
    });
  });
});
