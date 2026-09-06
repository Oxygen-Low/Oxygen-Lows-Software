import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RoomStorageService,
  ROOMS_INDEX_KEY,
  ROOM_PREFIX,
  ACTIVE_BACKGROUND_ROOM_KEY,
  EVENT_BACKGROUND_CHANGED,
  EVENT_ROOMS_UPDATED,
} from "./RoomStorageService";
import {
  COZY_BEDROOM_TEMPLATE,
  MODERN_STUDIO_TEMPLATE,
  NATURE_GARDEN_TEMPLATE,
  BLANK_CANVAS_TEMPLATE,
  DEFAULT_ROOM_TEMPLATES,
  instantiateRoomTemplate,
} from "./RoomTemplates";
import { RoomDocument, RoomDocumentSchema } from "@/types/threeDBackground";

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

describe("RoomTemplates Specification & Schema Validation", () => {
  it("should validate all 4 pre-made room templates against RoomDocumentSchema", () => {
    DEFAULT_ROOM_TEMPLATES.forEach((template) => {
      const result = RoomDocumentSchema.safeParse(template);
      expect(result.success, `Template ${template.name} failed schema validation`).toBe(true);
    });
  });

  it("should contain exactly 3 camera bookmarks per template", () => {
    [
      COZY_BEDROOM_TEMPLATE,
      MODERN_STUDIO_TEMPLATE,
      NATURE_GARDEN_TEMPLATE,
      BLANK_CANVAS_TEMPLATE,
    ].forEach((tpl) => {
      expect(tpl.cameraBookmarks.length).toBe(3);
      tpl.cameraBookmarks.forEach((bm) => {
        expect(bm.position).toHaveLength(3);
        expect(bm.target).toHaveLength(3);
        expect(bm.fov).toBeGreaterThan(0);
      });
    });
  });

  it("should have unique IDs across all templates and their objects", () => {
    const idSet = new Set<string>();
    DEFAULT_ROOM_TEMPLATES.forEach((tpl) => {
      expect(idSet.has(tpl.id)).toBe(false);
      idSet.add(tpl.id);
      tpl.objects.forEach((obj) => {
        expect(idSet.has(obj.id)).toBe(false);
        idSet.add(obj.id);
      });
    });
  });

  it("instantiateRoomTemplate should generate fresh UUIDs and deep clone without mutating the base template", () => {
    const original = COZY_BEDROOM_TEMPLATE;
    const origWindSpeed = original.environment.windSpeed;
    const origFirstObjPosX = original.objects[0].transform.position[0];
    const origBookmarkFov = original.cameraBookmarks[0].fov;

    const instance1 = instantiateRoomTemplate(original.id, "My Custom Bedroom");
    const instance2 = instantiateRoomTemplate(original.id, "Another Bedroom");

    expect(instance1.id).not.toBe(original.id);
    expect(instance1.id).not.toBe(instance2.id);
    expect(instance1.name).toBe("My Custom Bedroom");
    expect(instance1.objects[0].id).not.toBe(original.objects[0].id);
    expect(instance1.objects[0].id).not.toBe(instance2.objects[0].id);

    // Deep property mutation isolation check
    instance1.environment.windSpeed = 99.9;
    instance1.objects[0].transform.position[0] = 999;
    instance1.cameraBookmarks[0].fov = 115;

    expect(original.environment.windSpeed).toBe(origWindSpeed);
    expect(original.objects[0].transform.position[0]).toBe(origFirstObjPosX);
    expect(original.cameraBookmarks[0].fov).toBe(origBookmarkFov);
  });

  it("should ensure camera bookmark positions do not coincide with targets", () => {
    DEFAULT_ROOM_TEMPLATES.forEach((tpl) => {
      tpl.cameraBookmarks.forEach((bm) => {
        const dx = bm.position[0] - bm.target[0];
        const dy = bm.position[1] - bm.target[1];
        const dz = bm.position[2] - bm.target[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        expect(dist, `Bookmark ${bm.name} in ${tpl.name} has distance 0 to target`).toBeGreaterThan(0.1);
        expect(bm.fov).toBeGreaterThanOrEqual(10);
        expect(bm.fov).toBeLessThanOrEqual(120);
      });
    });
  });
});

describe("RoomStorageService", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    RoomStorageService.setStorageProvider(mockStorage);
    vi.restoreAllMocks();
  });

  describe("Index & Listing", () => {
    it("should initialize default index with built-in templates when empty", () => {
      const rooms = RoomStorageService.listRooms();
      expect(rooms.length).toBe(3);
      expect(rooms.map((r) => r.id)).toContain(COZY_BEDROOM_TEMPLATE.id);
      expect(rooms.map((r) => r.id)).toContain(MODERN_STUDIO_TEMPLATE.id);
      expect(rooms.map((r) => r.id)).toContain(NATURE_GARDEN_TEMPLATE.id);
      expect(rooms.every((r) => r.isBuiltIn)).toBe(true);
    });

    it("should self-heal and recover index when index JSON is corrupt", () => {
      mockStorage.setItem(ROOMS_INDEX_KEY, "INVALID_JSON_CORRUPT{{");
      const validRoom: RoomDocument = {
        ...COZY_BEDROOM_TEMPLATE,
        id: "c1f76d42-8888-4444-8888-123456789abc",
        name: "Recovered Custom Room",
      };
      mockStorage.setItem(ROOM_PREFIX + validRoom.id, JSON.stringify(validRoom));

      const rooms = RoomStorageService.listRooms();
      expect(rooms.some((r) => r.id === validRoom.id)).toBe(true);
      expect(rooms.some((r) => r.name === "Recovered Custom Room")).toBe(true);
    });
  });

  describe("CRUD Operations", () => {
    it("should load built-in templates directly without requiring prior save", () => {
      const bedroom = RoomStorageService.loadRoom(COZY_BEDROOM_TEMPLATE.id);
      expect(bedroom).not.toBeNull();
      expect(bedroom?.name).toBe("Cozy Bedroom");
      expect(bedroom?.objects.length).toBeGreaterThan(0);

      const blank = RoomStorageService.loadRoom(BLANK_CANVAS_TEMPLATE.id);
      expect(blank).not.toBeNull();
      expect(blank?.objects.length).toBe(1);
    });

    it("should save and reload custom room correctly", () => {
      const customRoom: RoomDocument = {
        ...BLANK_CANVAS_TEMPLATE,
        id: "a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d",
        name: "My Custom Room",
      };

      const result = RoomStorageService.saveRoom(customRoom);
      expect(result.success).toBe(true);

      const loaded = RoomStorageService.loadRoom(customRoom.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("My Custom Room");
      expect(loaded?.schemaVersion).toBe("1.0.0");

      const list = RoomStorageService.listRooms();
      expect(list.some((r) => r.id === customRoom.id)).toBe(true);
    });

    it("should reject save if schema validation fails", () => {
      const invalidRoom: any = {
        schemaVersion: "2.0.0",
        id: "not-a-uuid",
        name: "",
      };

      const result = RoomStorageService.saveRoom(invalidRoom);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should prevent deletion of built-in templates", () => {
      const deleted = RoomStorageService.deleteRoom(COZY_BEDROOM_TEMPLATE.id);
      expect(deleted).toBe(false);
      expect(RoomStorageService.loadRoom(COZY_BEDROOM_TEMPLATE.id)).not.toBeNull();
    });

    it("should delete custom room and remove from index", () => {
      const customRoom: RoomDocument = {
        ...BLANK_CANVAS_TEMPLATE,
        id: "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        name: "Temporary Room",
      };
      RoomStorageService.saveRoom(customRoom);
      expect(RoomStorageService.loadRoom(customRoom.id)).not.toBeNull();

      const deleted = RoomStorageService.deleteRoom(customRoom.id);
      expect(deleted).toBe(true);
      expect(RoomStorageService.loadRoom(customRoom.id)).toBeNull();
      expect(RoomStorageService.listRooms().some((r) => r.id === customRoom.id)).toBe(false);
    });

    it("should duplicate room with fresh UUIDs and non-colliding object IDs", () => {
      const duplicated = RoomStorageService.duplicateRoom(COZY_BEDROOM_TEMPLATE.id);
      expect(duplicated).not.toBeNull();
      expect(duplicated?.id).not.toBe(COZY_BEDROOM_TEMPLATE.id);
      expect(duplicated?.name).toContain("(Copy)");
      expect(duplicated?.objects.length).toBe(COZY_BEDROOM_TEMPLATE.objects.length);

      // Verify all object IDs are new
      const originalObjIds = new Set(COZY_BEDROOM_TEMPLATE.objects.map((o) => o.id));
      for (const obj of duplicated!.objects) {
        expect(originalObjIds.has(obj.id)).toBe(false);
      }
    });
  });

  describe("JSON Export & Import", () => {
    it("should import valid room JSON and reassign UUIDs", async () => {
      const jsonStr = JSON.stringify(COZY_BEDROOM_TEMPLATE);
      const importResult = await RoomStorageService.importRoomFromJson(jsonStr);

      expect(importResult.success).toBe(true);
      expect(importResult.room).toBeDefined();
      expect(importResult.room?.id).not.toBe(COZY_BEDROOM_TEMPLATE.id);
      expect(importResult.room?.schemaVersion).toBe("1.0.0");

      // Verify room was saved to storage
      const loaded = RoomStorageService.loadRoom(importResult.room!.id);
      expect(loaded).not.toBeNull();
    });

    it("should fail gracefully when importing invalid or malformed JSON", async () => {
      const malformedJson = "{ key: 'missing quotes' ";
      const result = await RoomStorageService.importRoomFromJson(malformedJson);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Malformed JSON");

      const invalidSchemaJson = JSON.stringify({ name: "Incomplete" });
      const result2 = await RoomStorageService.importRoomFromJson(invalidSchemaJson);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("Invalid room schema");
    });
  });

  describe("Active Background Room Preference", () => {
    it("should get and set active background room ID", () => {
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBeNull();

      RoomStorageService.setActiveBackgroundRoomId(COZY_BEDROOM_TEMPLATE.id);
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBe(COZY_BEDROOM_TEMPLATE.id);

      RoomStorageService.setActiveBackgroundRoomId(null);
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBeNull();
    });

    it("should reset active background room if room is deleted", () => {
      const customRoom: RoomDocument = {
        ...BLANK_CANVAS_TEMPLATE,
        id: "f1e2d3c4-b5a6-4f7e-8d9c-0b1a2c3d4e5f",
        name: "Active Background Room",
      };
      RoomStorageService.saveRoom(customRoom);
      RoomStorageService.setActiveBackgroundRoomId(customRoom.id);
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBe(customRoom.id);

      RoomStorageService.deleteRoom(customRoom.id);
      expect(RoomStorageService.getActiveBackgroundRoomId()).toBeNull();
    });
  });

  describe("Storage Quota Handling", () => {
    it("should return clean error object when quota is exceeded", () => {
      vi.spyOn(mockStorage, "setItem").mockImplementation(() => {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      });

      const customRoom: RoomDocument = {
        ...BLANK_CANVAS_TEMPLATE,
        id: "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
        name: "Oversized Room",
      };

      const result = RoomStorageService.saveRoom(customRoom);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Storage quota exceeded");
    });
  });
});
