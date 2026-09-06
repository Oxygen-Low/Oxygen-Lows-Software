import {
  RoomDocument,
  RoomDocumentSchema,
  RoomMetadata,
  RoomMetadataSchema,
} from "@/types/threeDBackground";
import { BUILT_IN_TEMPLATES, BLANK_CANVAS_TEMPLATE } from "./RoomTemplates";

// Storage Key Constants
export const ROOMS_INDEX_KEY = "oxygen_lows_rooms_index";
export const ROOM_PREFIX = "oxygen_lows_room_";
export const ACTIVE_BACKGROUND_ROOM_KEY = "oxygen_lows_active_background_room_id";

// Custom Browser Event Names for Reactivity
export const EVENT_BACKGROUND_CHANGED = "oxygen_lows_3d_background_changed";
export const EVENT_ROOMS_UPDATED = "oxygen_lows_rooms_updated";

/**
 * Robust UUIDv4 generator with RFC4122 fallback
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Utility: Safe string slugification for file downloads
 */
export function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-") // Replace spaces with -
      .replace(/[^\w-]+/g, "") // Remove all non-word chars
      .replace(/--+/g, "-") // Replace multiple - with single -
      .replace(/^-+/, "") // Trim - from start of text
      .replace(/-+$/, "") || "untitled" // Trim - from end of text
  );
}

/**
 * In-memory storage fallback for SSR or environments where localStorage is unavailable.
 */
export class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

export class RoomStorageService {
  private static storage: Storage =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : new MemoryStorage();

  /**
   * Internal helper: set storage provider (useful for Vitest test mocking)
   */
  public static setStorageProvider(provider: Storage): void {
    this.storage = provider;
  }

  /**
   * Resets storage provider to default localStorage or MemoryStorage
   */
  public static resetStorageProvider(): void {
    this.storage =
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : new MemoryStorage();
  }

  /**
   * Dispatches window custom event if in browser
   */
  private static dispatchEvent(eventName: string, detail?: unknown): void {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      } catch {
        // Safe ignore in headless or restricted environments
      }
    }
  }

  // ==========================================================================
  // Slot Index Management & Listing
  // ==========================================================================

  /**
   * Returns list of all stored room metadata headers, sorted by updatedAt descending.
   * Auto-recovers index if corrupted.
   */
  public static listRooms(): RoomMetadata[] {
    try {
      const rawIndex = this.storage.getItem(ROOMS_INDEX_KEY);
      if (!rawIndex) {
        // Initialize default index with built-in templates
        const initialIndex = this.seedBuiltInTemplates();
        return initialIndex;
      }

      const parsed = JSON.parse(rawIndex);
      if (!Array.isArray(parsed)) {
        return this.recoverIndexFromStorage();
      }

      // Validate each item
      const validMetadata: RoomMetadata[] = [];
      for (const item of parsed) {
        const check = RoomMetadataSchema.safeParse(item);
        if (check.success) {
          validMetadata.push(check.data);
        }
      }

      // If nothing valid was parsed from non-empty index, recover
      if (validMetadata.length === 0 && parsed.length > 0) {
        return this.recoverIndexFromStorage();
      }

      // Sort by updatedAt descending
      return validMetadata.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return this.recoverIndexFromStorage();
    }
  }

  /**
   * Self-healing: scans storage keys matching oxygen_lows_room_* to rebuild index
   */
  public static recoverIndexFromStorage(): RoomMetadata[] {
    const recovered: RoomMetadata[] = [];
    try {
      const len = this.storage.length;
      for (let i = 0; i < len; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(ROOM_PREFIX)) {
          const rawRoom = this.storage.getItem(key);
          if (rawRoom) {
            try {
              const doc = JSON.parse(rawRoom);
              const parseResult = RoomDocumentSchema.safeParse(doc);
              if (parseResult.success) {
                const r = parseResult.data;
                recovered.push({
                  id: r.id,
                  name: r.name,
                  createdAt: r.createdAt,
                  updatedAt: r.updatedAt,
                  objectCount: r.objects.length,
                  thumbnailDataUrl: r.thumbnailDataUrl,
                  isBuiltIn: false,
                });
              }
            } catch {
              // Ignore individual unparseable keys
            }
          }
        }
      }

      // Add built-in templates if not already present
      for (const tpl of BUILT_IN_TEMPLATES) {
        if (!recovered.some((r) => r.id === tpl.id)) {
          recovered.push({
            id: tpl.id,
            name: tpl.name,
            createdAt: tpl.createdAt,
            updatedAt: tpl.updatedAt,
            objectCount: tpl.objects.length,
            thumbnailDataUrl: tpl.thumbnailDataUrl,
            isBuiltIn: true,
          });
        }
      }

      recovered.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      this.storage.setItem(ROOMS_INDEX_KEY, JSON.stringify(recovered));
    } catch {
      // Return whatever was recovered
    }
    return recovered;
  }

  /**
   * Seeds built-in templates into storage index
   */
  private static seedBuiltInTemplates(): RoomMetadata[] {
    const metadataList: RoomMetadata[] = BUILT_IN_TEMPLATES.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      createdAt: tpl.createdAt,
      updatedAt: tpl.updatedAt,
      objectCount: tpl.objects.length,
      thumbnailDataUrl: tpl.thumbnailDataUrl,
      isBuiltIn: true,
    }));

    try {
      this.storage.setItem(ROOMS_INDEX_KEY, JSON.stringify(metadataList));
    } catch {
      // Storage unavailable or quota
    }
    return metadataList;
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Loads a complete RoomDocument by ID.
   * Checks built-in templates first, then localStorage.
   */
  public static loadRoom(id: string): RoomDocument | null {
    // Check built-in templates
    const builtIn = BUILT_IN_TEMPLATES.find((tpl) => tpl.id === id);
    if (builtIn) {
      return JSON.parse(JSON.stringify(builtIn));
    }

    if (id === BLANK_CANVAS_TEMPLATE.id) {
      return JSON.parse(JSON.stringify(BLANK_CANVAS_TEMPLATE));
    }

    // Check localStorage
    try {
      const raw = this.storage.getItem(ROOM_PREFIX + id);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const validation = RoomDocumentSchema.safeParse(parsed);
      if (!validation.success) {
        console.warn(
          `[RoomStorageService] Room ${id} failed validation:`,
          validation.error.format()
        );
        return null;
      }

      return validation.data;
    } catch (err) {
      console.error(`[RoomStorageService] Failed to load room ${id}:`, err);
      return null;
    }
  }

  /**
   * Saves or updates a RoomDocument.
   * Updates updatedAt timestamp, validates schema, updates slot index, and dispatches change event.
   */
  public static saveRoom(room: RoomDocument): { success: boolean; error?: string } {
    try {
      const now = new Date().toISOString();
      const roomToSave: RoomDocument = {
        ...room,
        updatedAt: now,
      };

      const validation = RoomDocumentSchema.safeParse(roomToSave);
      if (!validation.success) {
        const errorMsg = validation.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        return { success: false, error: `Validation error: ${errorMsg}` };
      }

      const validRoom = validation.data;

      // 1. Save room document
      const serialized = JSON.stringify(validRoom);
      this.storage.setItem(ROOM_PREFIX + validRoom.id, serialized);

      // 2. Update metadata index
      const index = this.listRooms();
      const existingIdx = index.findIndex((item) => item.id === validRoom.id);
      const metadataEntry: RoomMetadata = {
        id: validRoom.id,
        name: validRoom.name,
        createdAt: validRoom.createdAt,
        updatedAt: validRoom.updatedAt,
        objectCount: validRoom.objects.length,
        thumbnailDataUrl: validRoom.thumbnailDataUrl,
        isBuiltIn: false,
      };

      if (existingIdx >= 0) {
        index[existingIdx] = metadataEntry;
      } else {
        index.unshift(metadataEntry);
      }

      this.storage.setItem(ROOMS_INDEX_KEY, JSON.stringify(index));
      this.dispatchEvent(EVENT_ROOMS_UPDATED, { roomId: validRoom.id });

      return { success: true };
    } catch (err: any) {
      if (err?.name === "QuotaExceededError" || err?.code === 22) {
        return {
          success: false,
          error: "Storage quota exceeded. Please delete unused rooms or use smaller assets.",
        };
      }
      return { success: false, error: err?.message || "Failed to save room" };
    }
  }

  /**
   * Deletes a room by ID.
   * If the deleted room was the active background room, resets active background to null.
   */
  public static deleteRoom(id: string): boolean {
    try {
      // Prevent deleting built-in templates
      if (
        BUILT_IN_TEMPLATES.some((tpl) => tpl.id === id) ||
        id === BLANK_CANVAS_TEMPLATE.id
      ) {
        return false;
      }

      // Remove room document
      this.storage.removeItem(ROOM_PREFIX + id);

      // Update index
      const index = this.listRooms().filter((item) => item.id !== id);
      this.storage.setItem(ROOMS_INDEX_KEY, JSON.stringify(index));

      // Check active background room
      if (this.getActiveBackgroundRoomId() === id) {
        this.setActiveBackgroundRoomId(null);
      }

      this.dispatchEvent(EVENT_ROOMS_UPDATED, { deletedId: id });
      return true;
    } catch (err) {
      console.error(`[RoomStorageService] Failed to delete room ${id}:`, err);
      return false;
    }
  }

  /**
   * Duplicates an existing room.
   * Assigns fresh UUIDs to room and all objects, appends ' (Copy)', and saves.
   */
  public static duplicateRoom(id: string): RoomDocument | null {
    const source = this.loadRoom(id);
    if (!source) return null;

    const now = new Date().toISOString();
    const newRoomId = generateUUID();

    // Reassign UUIDs to all objects
    const remappedObjects = source.objects.map((obj) => ({
      ...obj,
      id: generateUUID(),
    }));

    // Reassign IDs to camera bookmarks
    const remappedBookmarks = source.cameraBookmarks.map((bm, idx) => ({
      ...bm,
      id: `bm_${idx}_${generateUUID().slice(0, 8)}`,
    }));

    const duplicatedRoom: RoomDocument = {
      ...source,
      id: newRoomId,
      name: `${source.name} (Copy)`.slice(0, 100),
      createdAt: now,
      updatedAt: now,
      objects: remappedObjects,
      cameraBookmarks: remappedBookmarks,
    };

    const saveResult = this.saveRoom(duplicatedRoom);
    if (!saveResult.success) {
      return null;
    }

    return duplicatedRoom;
  }

  // ==========================================================================
  // JSON File Export & Import
  // ==========================================================================

  /**
   * Serializes room document to JSON and triggers automated browser file download.
   */
  public static exportRoomAsJson(room: RoomDocument): void {
    const jsonString = JSON.stringify(room, null, 2);
    const filename = `${slugify(room.name)}-room.json`;

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Imports a room document from a JSON string.
   * Parses JSON, validates with Zod safeParse, assigns new UUIDs to prevent collision, and saves.
   */
  public static async importRoomFromJson(
    jsonString: string
  ): Promise<{ success: boolean; room?: RoomDocument; error?: string }> {
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        return { success: false, error: "Malformed JSON file: Syntax error during parsing" };
      }

      // Schema validation
      const validation = RoomDocumentSchema.safeParse(parsed);
      if (!validation.success) {
        const details = validation.error.issues
          .map((i) => `[${i.path.join(".") || "root"}]: ${i.message}`)
          .slice(0, 5)
          .join("; ");
        return { success: false, error: `Invalid room schema: ${details}` };
      }

      const imported = validation.data;
      const now = new Date().toISOString();

      // Collision prevention: Generate fresh UUID for room
      const newRoomId = generateUUID();

      // Collision prevention: Generate fresh UUIDs for all objects
      const remappedObjects = imported.objects.map((obj) => ({
        ...obj,
        id: generateUUID(),
      }));

      // Collision prevention: Generate fresh IDs for camera bookmarks
      const remappedBookmarks = imported.cameraBookmarks.map((bm, index) => ({
        ...bm,
        id: `bm_${index}_${generateUUID().slice(0, 8)}`,
      }));

      const finalRoom: RoomDocument = {
        ...imported,
        id: newRoomId,
        name: imported.name.slice(0, 90),
        createdAt: imported.createdAt || now,
        updatedAt: now,
        objects: remappedObjects,
        cameraBookmarks: remappedBookmarks,
      };

      const saveResult = this.saveRoom(finalRoom);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      return { success: true, room: finalRoom };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Unexpected error during room import",
      };
    }
  }

  // ==========================================================================
  // Active Background Room Preference
  // ==========================================================================

  /**
   * Retrieves active background room ID.
   * If configured ID no longer exists, falls back to null.
   */
  public static getActiveBackgroundRoomId(): string | null {
    try {
      const activeId = this.storage.getItem(ACTIVE_BACKGROUND_ROOM_KEY);
      if (!activeId) return null;

      // Verify room exists (either built-in or stored)
      const room = this.loadRoom(activeId);
      if (!room) {
        // Obsolete reference, clean up
        this.storage.removeItem(ACTIVE_BACKGROUND_ROOM_KEY);
        return null;
      }
      return activeId;
    } catch {
      return null;
    }
  }

  /**
   * Sets active background room ID and dispatches background change event.
   */
  public static setActiveBackgroundRoomId(id: string | null): void {
    try {
      if (id === null) {
        this.storage.removeItem(ACTIVE_BACKGROUND_ROOM_KEY);
      } else {
        this.storage.setItem(ACTIVE_BACKGROUND_ROOM_KEY, id);
      }
      this.dispatchEvent(EVENT_BACKGROUND_CHANGED, { roomId: id });
    } catch {
      // Storage unavailable
    }
  }
}
