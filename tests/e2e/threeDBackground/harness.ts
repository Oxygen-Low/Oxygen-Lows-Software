/**
 * @file tests/e2e/threeDBackground/harness.ts
 * @description Opaque-box E2E test harness and simulation engine for the 3D Room Creation & Decoration System.
 * Derived strictly from ORIGINAL_REQUEST.md and PROJECT.md specifications.
 */

import { z } from "zod";
import * as THREE from "three";
import {
  LOCALES,
  en,
  es,
  ja,
  ko,
  ru,
  zhCN,
  getLocaleDictionary,
} from "../../../client/locales/index.ts";

export { getLocaleDictionary, en };

// ============================================================================
// 1. Core Types & Zod Schemas (Interface Contracts from PROJECT.md)
// ============================================================================

export interface TransformData {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler radians
  scale: [number, number, number];
}

export interface CustomProps {
  imageUrl?: string;
  aspectRatio?: number;
  frameStyle?: "modern_black" | "oak_wood" | "brushed_gold" | "white_minimal" | "frameless";
  modelStoragePath?: string;
  glbDataBase64?: string;
  lightColor?: string;
  lightIntensity?: number;
  lightDistance?: number;
  colorTint?: string;
}

export interface RoomObject {
  id: string;
  name: string;
  catalogId: string;
  type: "wall" | "floor" | "door" | "window" | "furniture" | "decor" | "outdoor" | "custom_model";
  transform: TransformData;
  customProps?: CustomProps;
  visible: boolean;
  locked: boolean;
}

export interface EnvironmentSettings {
  preset: "day" | "sunset" | "night" | "studio";
  timeOfDay?: number; // 0.0 to 24.0
  sunPosition: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  ambientColor: string;
  ambientIntensity: number;
  skyColor: string;
  groundColor: string;
  windSpeed: number; // 0.0 to 10.0 m/s
  windDirection: number; // 0 to 360 degrees
  windGustiness: number; // 0.0 to 1.0
  grassDensity: "none" | "low" | "medium" | "high";
}

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  isPreset?: boolean;
}

export interface RoomDocument {
  schemaVersion: "1.0.0";
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl?: string;
  environment: EnvironmentSettings;
  cameraBookmarks: CameraBookmark[];
  activeBookmarkIndex: number;
  objects: RoomObject[];
}

export interface GraphicsPresetConfig {
  preset: "low" | "medium" | "high";
  grassBladeCount: number;
  grassSegments: number;
  shadowMapSize: number;
  enableShadows: boolean;
  enableSubsurfaceScattering: boolean;
  maxFps: number;
}

// Zod Schemas
export const TransformSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
});

export const CustomPropsSchema = z.object({
  imageUrl: z.string().optional(),
  aspectRatio: z.number().positive().optional(),
  frameStyle: z.enum(["modern_black", "oak_wood", "brushed_gold", "white_minimal", "frameless"]).optional(),
  modelStoragePath: z.string().optional(),
  glbDataBase64: z.string().optional(),
  lightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lightIntensity: z.number().min(0).optional(),
  lightDistance: z.number().min(0).optional(),
  colorTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).optional();

export const RoomObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  catalogId: z.string().min(1),
  type: z.enum(["wall", "floor", "door", "window", "furniture", "decor", "outdoor", "custom_model"]),
  transform: TransformSchema,
  customProps: CustomPropsSchema,
  visible: z.boolean(),
  locked: z.boolean(),
});

export const EnvironmentSettingsSchema = z.object({
  preset: z.enum(["day", "sunset", "night", "studio"]),
  timeOfDay: z.number().min(0).max(24).optional(),
  sunPosition: z.tuple([z.number(), z.number(), z.number()]),
  sunIntensity: z.number().min(0),
  sunColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ambientColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ambientIntensity: z.number().min(0),
  skyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  groundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  windSpeed: z.number().min(0).max(10),
  windDirection: z.number().min(0).max(360),
  windGustiness: z.number().min(0).max(1),
  grassDensity: z.enum(["none", "low", "medium", "high"]),
});

export const CameraBookmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
  fov: z.number().min(10).max(140),
  isPreset: z.boolean().optional(),
});

export const RoomDocumentSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  thumbnailDataUrl: z.string().optional(),
  environment: EnvironmentSettingsSchema,
  cameraBookmarks: z.array(CameraBookmarkSchema).min(1),
  activeBookmarkIndex: z.number().min(0),
  objects: z.array(RoomObjectSchema),
});

export const GraphicsPresetConfigSchema = z.object({
  preset: z.enum(["low", "medium", "high"]),
  grassBladeCount: z.number().int().min(0),
  grassSegments: z.number().int().min(1).max(5),
  shadowMapSize: z.number().int().min(0),
  enableShadows: z.boolean(),
  enableSubsurfaceScattering: z.boolean(),
  maxFps: z.number().int().positive(),
});

// ============================================================================
// 2. Room Templates Specification (Authoritative Definitions)
// ============================================================================

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  preset: "day",
  timeOfDay: 14.0,
  sunPosition: [10, 20, 10],
  sunIntensity: 1.5,
  sunColor: "#fff4e0",
  ambientColor: "#87ceeb",
  ambientIntensity: 0.4,
  skyColor: "#4ca6ff",
  groundColor: "#2d5a27",
  windSpeed: 2.5,
  windDirection: 45,
  windGustiness: 0.3,
  grassDensity: "medium",
};

export const BLANK_CANVAS_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "template-blank-canvas",
  name: "Blank Canvas",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: { ...DEFAULT_ENVIRONMENT, grassDensity: "none" },
  cameraBookmarks: [
    {
      id: "bm-overview",
      name: "Overview",
      position: [0, 5, 8],
      target: [0, 1, 0],
      fov: 50,
      isPreset: true,
    },
  ],
  activeBookmarkIndex: 0,
  objects: [
    {
      id: "obj-floor-blank",
      name: "Hardwood Floor",
      catalogId: "hardwood_floor",
      type: "floor",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [6, 0.1, 6],
      },
      visible: true,
      locked: true,
    },
  ],
};

export const COZY_BEDROOM_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "template-cozy-bedroom",
  name: "Cozy Bedroom",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: {
    preset: "sunset",
    timeOfDay: 18.5,
    sunPosition: [-15, 6, 8],
    sunIntensity: 1.2,
    sunColor: "#ff7e47",
    ambientColor: "#593122",
    ambientIntensity: 0.5,
    skyColor: "#e65c00",
    groundColor: "#1a0f0a",
    windSpeed: 1.0,
    windDirection: 90,
    windGustiness: 0.1,
    grassDensity: "low",
  },
  cameraBookmarks: [
    {
      id: "bm-cozy-iso",
      name: "Isometric Overview",
      position: [4, 4, 5],
      target: [0, 1, 0],
      fov: 45,
      isPreset: true,
    },
    {
      id: "bm-cozy-bed",
      name: "Bedside Perspective",
      position: [-1, 1.4, 2],
      target: [-1, 0.8, -1],
      fov: 55,
      isPreset: true,
    },
    {
      id: "bm-cozy-nook",
      name: "Window Reading Nook",
      position: [2, 1.5, -1],
      target: [3, 1.2, -2],
      fov: 50,
      isPreset: true,
    },
  ],
  activeBookmarkIndex: 0,
  objects: [
    {
      id: "obj-cozy-floor",
      name: "Parquet Hardwood Floor",
      catalogId: "hardwood_floor",
      type: "floor",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [6, 0.1, 6] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-cozy-wall-back",
      name: "Wood Panel Wall",
      catalogId: "wood_panel_wall",
      type: "wall",
      transform: { position: [0, 1.5, -3], rotation: [0, 0, 0], scale: [6, 3, 0.2] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-cozy-wall-left",
      name: "Plain Wall",
      catalogId: "plain_wall",
      type: "wall",
      transform: { position: [-3, 1.5, 0], rotation: [0, Math.PI / 2, 0], scale: [6, 3, 0.2] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-cozy-window",
      name: "Casement Window",
      catalogId: "casement_window",
      type: "window",
      transform: { position: [0, 1.6, -2.9], rotation: [0, 0, 0], scale: [1.8, 1.4, 0.1] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-bed",
      name: "King Bed",
      catalogId: "furniture_bed",
      type: "furniture",
      transform: { position: [-1.2, 0.4, -1.5], rotation: [0, 0, 0], scale: [2.0, 0.8, 2.2] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-nightstand",
      name: "Nightstand",
      catalogId: "coffee_table",
      type: "furniture",
      transform: { position: [-2.4, 0.3, -1.5], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-lamp",
      name: "Table Lamp",
      catalogId: "table_lamp",
      type: "furniture",
      transform: { position: [-2.4, 0.8, -1.5], rotation: [0, 0, 0], scale: [0.3, 0.5, 0.3] },
      customProps: {
        lightColor: "#ffaa44",
        lightIntensity: 1.8,
        lightDistance: 4.0,
      },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-rug",
      name: "Plush Rug",
      catalogId: "carpet_plush",
      type: "decor",
      transform: { position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [3.0, 0.02, 2.5] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-plant",
      name: "Potted Monstera",
      catalogId: "potted_monstera",
      type: "decor",
      transform: { position: [2.2, 0.5, -2.2], rotation: [0, 0.4, 0], scale: [0.8, 1.2, 0.8] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-cozy-poster",
      name: "Botanical Art Frame",
      catalogId: "poster_frame_standard",
      type: "decor",
      transform: { position: [-2.9, 1.8, 0.5], rotation: [0, Math.PI / 2, 0], scale: [1.2, 1.6, 0.05] },
      customProps: {
        aspectRatio: 0.75,
        frameStyle: "oak_wood",
        imageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'></svg>",
      },
      visible: true,
      locked: false,
    },
  ],
};

export const MODERN_STUDIO_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "template-modern-studio",
  name: "Modern Studio",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: {
    preset: "day",
    timeOfDay: 11.0,
    sunPosition: [12, 18, 6],
    sunIntensity: 1.6,
    sunColor: "#ffffff",
    ambientColor: "#90caf9",
    ambientIntensity: 0.45,
    skyColor: "#64b5f6",
    groundColor: "#37474f",
    windSpeed: 2.0,
    windDirection: 30,
    windGustiness: 0.2,
    grassDensity: "none",
  },
  cameraBookmarks: [
    {
      id: "bm-studio-work",
      name: "Workstation Focus",
      position: [0, 1.4, 1.8],
      target: [0, 0.9, -1.0],
      fov: 50,
      isPreset: true,
    },
    {
      id: "bm-studio-lounge",
      name: "Lounge Area",
      position: [2.5, 1.5, 2.0],
      target: [1.5, 0.6, -0.5],
      fov: 55,
      isPreset: true,
    },
    {
      id: "bm-studio-wide",
      name: "Studio Wide Angle",
      position: [4.5, 4.0, 4.5],
      target: [0, 1.0, 0],
      fov: 65,
      isPreset: true,
    },
  ],
  activeBookmarkIndex: 0,
  objects: [
    {
      id: "obj-studio-floor",
      name: "Ceramic Tile Floor",
      catalogId: "ceramic_tile",
      type: "floor",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [8, 0.1, 8] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-studio-wall-back",
      name: "Brick Wall",
      catalogId: "brick_wall",
      type: "wall",
      transform: { position: [0, 1.75, -4], rotation: [0, 0, 0], scale: [8, 3.5, 0.2] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-studio-desk",
      name: "Executive Desk",
      catalogId: "executive_desk",
      type: "furniture",
      transform: { position: [0, 0.4, -2.5], rotation: [0, 0, 0], scale: [1.8, 0.75, 0.9] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-studio-chair",
      name: "Ergonomic Chair",
      catalogId: "ergonomic_chair",
      type: "furniture",
      transform: { position: [0, 0.5, -1.6], rotation: [0, Math.PI, 0], scale: [0.65, 1.0, 0.65] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-studio-pc",
      name: "PC Workstation",
      catalogId: "pc_workstation",
      type: "furniture",
      transform: { position: [0, 0.85, -2.5], rotation: [0, 0, 0], scale: [1.0, 0.45, 0.4] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-studio-sofa",
      name: "3-Seater Sofa",
      catalogId: "sofa_3seater",
      type: "furniture",
      transform: { position: [2.2, 0.45, 0.5], rotation: [0, -Math.PI / 2, 0], scale: [2.2, 0.8, 0.9] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-studio-coffee",
      name: "Coffee Table",
      catalogId: "coffee_table",
      type: "furniture",
      transform: { position: [1.0, 0.25, 0.5], rotation: [0, 0, 0], scale: [1.1, 0.45, 0.6] },
      visible: true,
      locked: false,
    },
  ],
};

export const NATURE_GARDEN_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "template-nature-garden",
  name: "Nature Garden",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: {
    preset: "day",
    timeOfDay: 13.0,
    sunPosition: [15, 25, 10],
    sunIntensity: 1.8,
    sunColor: "#fff7e6",
    ambientColor: "#81c784",
    ambientIntensity: 0.55,
    skyColor: "#29b6f6",
    groundColor: "#1b5e20",
    windSpeed: 4.5,
    windDirection: 120,
    windGustiness: 0.6,
    grassDensity: "high",
  },
  cameraBookmarks: [
    {
      id: "bm-garden-entrance",
      name: "Garden Entrance",
      position: [0, 2.0, 6.0],
      target: [0, 1.0, 0],
      fov: 55,
      isPreset: true,
    },
    {
      id: "bm-garden-bench",
      name: "Bench Sanctuary",
      position: [-2.5, 1.4, 1.5],
      target: [-3.0, 0.6, -1.0],
      fov: 50,
      isPreset: true,
    },
    {
      id: "bm-garden-canopy",
      name: "Canopy Overview",
      position: [6.0, 6.0, 6.0],
      target: [0, 1.5, 0],
      fov: 60,
      isPreset: true,
    },
  ],
  activeBookmarkIndex: 0,
  objects: [
    {
      id: "obj-garden-ground",
      name: "Grass Terrain Slab",
      catalogId: "concrete_slab",
      type: "floor",
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0], scale: [14, 0.2, 14] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-garden-path",
      name: "Flagstone Pathway",
      catalogId: "flagstone_path",
      type: "outdoor",
      transform: { position: [0, 0.02, 0], rotation: [0, 0, 0], scale: [1.2, 0.05, 10] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-garden-bench",
      name: "Wooden Park Bench",
      catalogId: "wooden_bench",
      type: "outdoor",
      transform: { position: [-2.5, 0.4, 0], rotation: [0, Math.PI / 2, 0], scale: [1.6, 0.8, 0.7] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-garden-fence",
      name: "Privacy Cedar Fence",
      catalogId: "privacy_fence",
      type: "outdoor",
      transform: { position: [0, 1.0, -6.5], rotation: [0, 0, 0], scale: [13, 2.0, 0.15] },
      visible: true,
      locked: true,
    },
    {
      id: "obj-garden-rock-1",
      name: "Weathered Garden Rock",
      catalogId: "garden_rock",
      type: "outdoor",
      transform: { position: [3.2, 0.35, 1.5], rotation: [0.1, 0.8, 0.2], scale: [1.2, 0.7, 1.0] },
      visible: true,
      locked: false,
    },
    {
      id: "obj-garden-birdbath",
      name: "Stone Birdbath",
      catalogId: "birdbath",
      type: "outdoor",
      transform: { position: [2.5, 0.45, -2.0], rotation: [0, 0, 0], scale: [0.8, 0.9, 0.8] },
      visible: true,
      locked: false,
    },
  ],
};

export const PRESET_ROOM_TEMPLATES = [
  BLANK_CANVAS_TEMPLATE,
  COZY_BEDROOM_TEMPLATE,
  MODERN_STUDIO_TEMPLATE,
  NATURE_GARDEN_TEMPLATE,
];

// ============================================================================
// 3. Storage Service Engine (LocalStorage & JSON Serialization)
// ============================================================================

export class MockStorageEngine {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public get length(): number {
    return this.store.size;
  }

  public key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

export class RoomStorageService {
  private static readonly INDEX_KEY = "oxygen_lows_rooms_index";
  private static readonly ROOM_PREFIX = "oxygen_lows_room_";
  private static readonly ACTIVE_ROOM_KEY = "oxygen_lows_active_background_room_id";

  private storage: Storage | MockStorageEngine;

  constructor(customStorage?: Storage | MockStorageEngine) {
    this.storage = customStorage || (typeof window !== "undefined" && window.localStorage ? window.localStorage : new MockStorageEngine());
  }

  public listRooms(): { id: string; name: string; updatedAt: string; objectCount: number }[] {
    try {
      const rawIndex = this.storage.getItem(RoomStorageService.INDEX_KEY);
      if (!rawIndex) {
        // Seed default templates if completely empty
        this.seedTemplates();
        const recheck = this.storage.getItem(RoomStorageService.INDEX_KEY);
        if (!recheck) return [];
        const parsed = JSON.parse(recheck);
        return Array.isArray(parsed) ? parsed : [];
      }
      const parsed = JSON.parse(rawIndex);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public loadRoom(id: string): RoomDocument | null {
    const raw = this.storage.getItem(`${RoomStorageService.ROOM_PREFIX}${id}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const validation = RoomDocumentSchema.safeParse(parsed);
      if (!validation.success) {
        return null;
      }
      return validation.data;
    } catch {
      return null;
    }
  }

  public saveRoom(room: RoomDocument): { success: boolean; error?: string } {
    const validation = RoomDocumentSchema.safeParse(room);
    if (!validation.success) {
      return { success: false, error: validation.error.message };
    }

    const updatedRoom: RoomDocument = {
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    this.storage.setItem(
      `${RoomStorageService.ROOM_PREFIX}${updatedRoom.id}`,
      JSON.stringify(updatedRoom)
    );

    // Update index
    const index = this.listRooms().filter((item) => item.id !== updatedRoom.id);
    index.unshift({
      id: updatedRoom.id,
      name: updatedRoom.name,
      updatedAt: updatedRoom.updatedAt,
      objectCount: updatedRoom.objects.length,
    });
    this.storage.setItem(RoomStorageService.INDEX_KEY, JSON.stringify(index));

    return { success: true };
  }

  public deleteRoom(id: string): boolean {
    const key = `${RoomStorageService.ROOM_PREFIX}${id}`;
    if (!this.storage.getItem(key)) return false;

    this.storage.removeItem(key);
    const index = this.listRooms().filter((item) => item.id !== id);
    this.storage.setItem(RoomStorageService.INDEX_KEY, JSON.stringify(index));

    // If deleting active background room, reset it
    if (this.getActiveBackgroundRoomId() === id) {
      this.setActiveBackgroundRoomId(null);
    }
    return true;
  }

  public duplicateRoom(id: string): RoomDocument | null {
    const original = this.loadRoom(id);
    if (!original) return null;

    const newId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const duplicated: RoomDocument = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = this.saveRoom(duplicated);
    return res.success ? duplicated : null;
  }

  public exportRoomAsJson(room: RoomDocument): string {
    const validation = RoomDocumentSchema.safeParse(room);
    if (!validation.success) {
      throw new Error(`Cannot export invalid RoomDocument: ${validation.error.message}`);
    }
    return JSON.stringify(validation.data, null, 2);
  }

  public importRoomFromJson(jsonString: string): { success: boolean; room?: RoomDocument; error?: string } {
    try {
      const parsed = JSON.parse(jsonString);
      const validation = RoomDocumentSchema.safeParse(parsed);
      if (!validation.success) {
        return { success: false, error: `Schema validation error: ${validation.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}` };
      }

      // Reassign UUID to prevent primary key collision
      const newRoom: RoomDocument = {
        ...validation.data,
        id: `imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: validation.data.name || "Imported Room",
        updatedAt: new Date().toISOString(),
      };

      const saveRes = this.saveRoom(newRoom);
      if (!saveRes.success) {
        return { success: false, error: saveRes.error };
      }
      return { success: true, room: newRoom };
    } catch (err: any) {
      return { success: false, error: `Corrupted JSON syntax: ${err.message}` };
    }
  }

  public getActiveBackgroundRoomId(): string | null {
    return this.storage.getItem(RoomStorageService.ACTIVE_ROOM_KEY);
  }

  public setActiveBackgroundRoomId(id: string | null): void {
    if (id === null) {
      this.storage.removeItem(RoomStorageService.ACTIVE_ROOM_KEY);
    } else {
      this.storage.setItem(RoomStorageService.ACTIVE_ROOM_KEY, id);
    }
  }

  public seedTemplates(): void {
    const index: { id: string; name: string; updatedAt: string; objectCount: number }[] = [];
    for (const template of PRESET_ROOM_TEMPLATES) {
      const key = `${RoomStorageService.ROOM_PREFIX}${template.id}`;
      const existing = this.storage.getItem(key);
      if (!existing) {
        this.storage.setItem(key, JSON.stringify(template));
      }
      index.push({
        id: template.id,
        name: template.name,
        updatedAt: template.updatedAt,
        objectCount: template.objects.length,
      });
    }
    this.storage.setItem(RoomStorageService.INDEX_KEY, JSON.stringify(index));
  }
}

// ============================================================================
// 4. Procedural Catalog & Geometry Engine (20+ Items)
// ============================================================================

export interface CatalogItemDefinition {
  catalogId: string;
  nameKey: string;
  defaultName: string;
  category: "walls" | "floors" | "openings" | "furniture" | "outdoor" | "decor";
  defaultDimensions: [number, number, number];
  hasProceduralMesh: boolean;
}

export const PROCEDURAL_CATALOG_ITEMS: CatalogItemDefinition[] = [
  // Walls
  { catalogId: "plain_wall", nameKey: "catalog.plain_wall", defaultName: "Plain Wall", category: "walls", defaultDimensions: [4, 3, 0.2], hasProceduralMesh: true },
  { catalogId: "brick_wall", nameKey: "catalog.brick_wall", defaultName: "Brick Wall", category: "walls", defaultDimensions: [4, 3, 0.25], hasProceduralMesh: true },
  { catalogId: "wood_panel_wall", nameKey: "catalog.wood_panel_wall", defaultName: "Wood Panel Wall", category: "walls", defaultDimensions: [4, 3, 0.2], hasProceduralMesh: true },
  { catalogId: "glass_partition", nameKey: "catalog.glass_partition", defaultName: "Glass Partition", category: "walls", defaultDimensions: [3, 2.8, 0.1], hasProceduralMesh: true },

  // Floors
  { catalogId: "hardwood_floor", nameKey: "catalog.hardwood_floor", defaultName: "Hardwood Floor", category: "floors", defaultDimensions: [6, 0.1, 6], hasProceduralMesh: true },
  { catalogId: "ceramic_tile", nameKey: "catalog.ceramic_tile", defaultName: "Ceramic Tile", category: "floors", defaultDimensions: [6, 0.1, 6], hasProceduralMesh: true },
  { catalogId: "carpet_plush", nameKey: "catalog.carpet_plush", defaultName: "Plush Carpet", category: "floors", defaultDimensions: [4, 0.05, 3], hasProceduralMesh: true },
  { catalogId: "concrete_slab", nameKey: "catalog.concrete_slab", defaultName: "Concrete Slab", category: "floors", defaultDimensions: [8, 0.2, 8], hasProceduralMesh: true },

  // Openings
  { catalogId: "interior_door", nameKey: "catalog.interior_door", defaultName: "Interior Door", category: "openings", defaultDimensions: [1.0, 2.1, 0.15], hasProceduralMesh: true },
  { catalogId: "glass_sliding_door", nameKey: "catalog.glass_sliding_door", defaultName: "Glass Sliding Door", category: "openings", defaultDimensions: [2.0, 2.2, 0.18], hasProceduralMesh: true },
  { catalogId: "casement_window", nameKey: "catalog.casement_window", defaultName: "Casement Window", category: "openings", defaultDimensions: [1.5, 1.2, 0.15], hasProceduralMesh: true },
  { catalogId: "bay_window", nameKey: "catalog.bay_window", defaultName: "Bay Window", category: "openings", defaultDimensions: [2.4, 1.6, 0.6], hasProceduralMesh: true },

  // Furniture
  { catalogId: "executive_desk", nameKey: "catalog.executive_desk", defaultName: "Executive Desk", category: "furniture", defaultDimensions: [1.8, 0.75, 0.9], hasProceduralMesh: true },
  { catalogId: "ergonomic_chair", nameKey: "catalog.ergonomic_chair", defaultName: "Ergonomic Chair", category: "furniture", defaultDimensions: [0.65, 1.0, 0.65], hasProceduralMesh: true },
  { catalogId: "sofa_3seater", nameKey: "catalog.sofa_3seater", defaultName: "3-Seater Sofa", category: "furniture", defaultDimensions: [2.2, 0.85, 0.9], hasProceduralMesh: true },
  { catalogId: "coffee_table", nameKey: "catalog.coffee_table", defaultName: "Coffee Table", category: "furniture", defaultDimensions: [1.1, 0.45, 0.6], hasProceduralMesh: true },
  { catalogId: "table_lamp", nameKey: "catalog.table_lamp", defaultName: "Table Lamp", category: "furniture", defaultDimensions: [0.35, 0.6, 0.35], hasProceduralMesh: true },
  { catalogId: "pc_workstation", nameKey: "catalog.pc_workstation", defaultName: "PC Workstation", category: "furniture", defaultDimensions: [1.2, 0.5, 0.4], hasProceduralMesh: true },
  { catalogId: "furniture_bed", nameKey: "catalog.furniture_bed", defaultName: "King Bed", category: "furniture", defaultDimensions: [2.0, 0.8, 2.2], hasProceduralMesh: true },

  // Outdoor
  { catalogId: "flagstone_path", nameKey: "catalog.flagstone_path", defaultName: "Flagstone Path", category: "outdoor", defaultDimensions: [1.2, 0.05, 5.0], hasProceduralMesh: true },
  { catalogId: "wooden_bench", nameKey: "catalog.wooden_bench", defaultName: "Wooden Bench", category: "outdoor", defaultDimensions: [1.6, 0.8, 0.7], hasProceduralMesh: true },
  { catalogId: "garden_rock", nameKey: "catalog.garden_rock", defaultName: "Garden Rock", category: "outdoor", defaultDimensions: [1.0, 0.7, 0.9], hasProceduralMesh: true },
  { catalogId: "privacy_fence", nameKey: "catalog.privacy_fence", defaultName: "Privacy Fence", category: "outdoor", defaultDimensions: [4.0, 2.0, 0.1], hasProceduralMesh: true },
  { catalogId: "birdbath", nameKey: "catalog.birdbath", defaultName: "Birdbath", category: "outdoor", defaultDimensions: [0.8, 0.9, 0.8], hasProceduralMesh: true },

  // Decor
  { catalogId: "potted_monstera", nameKey: "catalog.potted_monstera", defaultName: "Potted Monstera", category: "decor", defaultDimensions: [0.7, 1.2, 0.7], hasProceduralMesh: true },
  { catalogId: "poster_frame_standard", nameKey: "catalog.poster_frame_standard", defaultName: "Poster Frame", category: "decor", defaultDimensions: [1.0, 1.4, 0.05], hasProceduralMesh: true },
];

export class CatalogFactory {
  public static createMeshForItem(catalogId: string, customProps?: CustomProps): THREE.Object3D {
    const item = PROCEDURAL_CATALOG_ITEMS.find((i) => i.catalogId === catalogId);
    const dims = item ? item.defaultDimensions : [1, 1, 1];

    const group = new THREE.Group();
    group.name = catalogId;
    (group.userData as any).isRoomObject = true;
    (group.userData as any).catalogId = catalogId;

    if (catalogId === "poster_frame_standard") {
      const poster = PosterFactory.createPosterFrame(customProps);
      group.add(poster);
      return group;
    }

    // Generate procedural compound geometry based on category
    const geom = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
    const mat = new THREE.MeshStandardMaterial({
      color: customProps?.colorTint ? new THREE.Color(customProps.colorTint) : new THREE.Color(0x888888),
      roughness: 0.5,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Optional point light for lamps
    if (catalogId === "table_lamp" && customProps?.lightColor) {
      const light = new THREE.PointLight(
        new THREE.Color(customProps.lightColor),
        customProps.lightIntensity ?? 1.5,
        customProps.lightDistance ?? 3.0
      );
      light.position.set(0, dims[1] * 0.5, 0);
      group.add(light);
    }

    return group;
  }
}

// ============================================================================
// 5. Custom 3D Model Ingestion & Normalization Pipeline
// ============================================================================

export class GLTFLoaderPipeline {
  public static readonly MAX_ALLOWED_DIMENSION = 1.5; // meters

  public static validateBinaryHeader(buffer: ArrayBuffer | Uint8Array): boolean {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 12) return false;
    // Magic bytes for glTF: 0x46546C67 ("glTF")
    return bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
  }

  public static validateJsonHeader(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      return Boolean(parsed && parsed.asset && typeof parsed.asset.version === "string");
    } catch {
      return false;
    }
  }

  public static normalizeModel(object: THREE.Object3D): {
    scaleFactor: number;
    originalBounds: THREE.Box3;
    normalizedBounds: THREE.Box3;
    pivotOffset: [number, number, number];
  } {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? this.MAX_ALLOWED_DIMENSION / maxDim : 1.0;

    object.scale.set(scaleFactor, scaleFactor, scaleFactor);
    object.updateMatrixWorld(true);

    // Recompute bounding box after scale
    const scaledBox = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    // Bottom alignment to y = 0
    const minY = scaledBox.min.y;
    object.position.y -= minY;
    object.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(object);

    return {
      scaleFactor,
      originalBounds: box,
      normalizedBounds: finalBox,
      pivotOffset: [0, -minY, 0],
    };
  }

  public static sanitizeMaterials(object: THREE.Object3D): number {
    let sanitizedCount = 0;
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => {
            sanitizedCount++;
            return new THREE.MeshStandardMaterial({
              color: (m as any).color ?? 0xcccccc,
              roughness: (m as any).roughness ?? 0.6,
              metalness: (m as any).metalness ?? 0.1,
            });
          });
        } else if (mesh.material) {
          sanitizedCount++;
          mesh.material = new THREE.MeshStandardMaterial({
            color: (mesh.material as any).color ?? 0xcccccc,
            roughness: (mesh.material as any).roughness ?? 0.6,
            metalness: (mesh.material as any).metalness ?? 0.1,
          });
        }
      }
    });
    return sanitizedCount;
  }
}

// ============================================================================
// 6. Custom Image Posters & Dynamic Aspect Ratio Engine
// ============================================================================

export class PosterFactory {
  public static readonly DEFAULT_WIDTH = 1.2; // 1.2m default target width

  public static calculateDimensions(
    naturalWidth: number,
    naturalHeight: number,
    targetWidth = PosterFactory.DEFAULT_WIDTH
  ): { width: number; height: number; aspectRatio: number } {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      throw new Error("Invalid image dimensions: naturalWidth and naturalHeight must be positive");
    }
    const aspectRatio = naturalWidth / naturalHeight;
    const height = targetWidth / aspectRatio;
    return { width: targetWidth, height, aspectRatio };
  }

  public static createPosterFrame(customProps?: CustomProps): THREE.Group {
    const group = new THREE.Group();
    const style = customProps?.frameStyle || "modern_black";
    const aspectRatio = customProps?.aspectRatio || 0.75;
    const { width, height } = this.calculateDimensions(aspectRatio * 1000, 1000);

    const frameDepth = 0.04;
    const borderThickness = style === "frameless" ? 0 : 0.05;

    // Outer Frame
    if (style !== "frameless") {
      const frameGeom = new THREE.BoxGeometry(
        width + borderThickness * 2,
        height + borderThickness * 2,
        frameDepth
      );
      let frameColor = 0x111111;
      if (style === "oak_wood") frameColor = 0x8b5a2b;
      if (style === "brushed_gold") frameColor = 0xd4af37;
      if (style === "white_minimal") frameColor = 0xf5f5f5;

      const frameMat = new THREE.MeshStandardMaterial({
        color: frameColor,
        roughness: style === "brushed_gold" ? 0.3 : 0.7,
        metalness: style === "brushed_gold" ? 0.8 : 0.1,
      });
      const frameMesh = new THREE.Mesh(frameGeom, frameMat);
      frameMesh.name = "frame-border";
      group.add(frameMesh);
    }

    // Inner Canvas / Poster Plane
    const innerGeom = new THREE.PlaneGeometry(width, height);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
    });
    const innerMesh = new THREE.Mesh(innerGeom, innerMat);
    innerMesh.name = "poster-canvas";
    innerMesh.position.z = frameDepth * 0.5 + 0.001; // Avoid z-fighting
    group.add(innerMesh);

    (group.userData as any).aspectRatio = aspectRatio;
    (group.userData as any).frameStyle = style;
    (group.userData as any).isRoomObject = true;

    return group;
  }

  public static snapToWallNormal(wallNormal: THREE.Vector3): [number, number, number] {
    const normal = wallNormal.clone().normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");
    return [euler.x, euler.y, euler.z];
  }
}

// ============================================================================
// 7. Nature & Wind Simulation Engine
// ============================================================================

export class NatureSimulationEngine {
  public static calculateBladeGeometry(segments: 1 | 2 | 3): {
    vertexCount: number;
    triangleCount: number;
    heightSteps: number[];
  } {
    switch (segments) {
      case 1:
        return { vertexCount: 3, triangleCount: 1, heightSteps: [0.0, 1.0] };
      case 2:
        return { vertexCount: 5, triangleCount: 3, heightSteps: [0.0, 0.5, 1.0] };
      case 3:
      default:
        return { vertexCount: 7, triangleCount: 5, heightSteps: [0.0, 0.33, 0.66, 1.0] };
    }
  }

  public static evaluateWindDisplacement(
    position: [number, number, number],
    uvY: number, // 0 = root, 1 = tip
    time: number,
    windSpeed: number, // 0.0 - 10.0 m/s
    windDirectionDegrees: number, // 0 - 360
    gustiness: number, // 0.0 - 1.0
    bladeHeight = 0.6
  ): { displacement: [number, number, number]; preservedHeightDelta: number } {
    if (uvY <= 0 || windSpeed <= 0) {
      return { displacement: [0, 0, 0], preservedHeightDelta: 0 };
    }

    const rad = (windDirectionDegrees * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirZ = Math.sin(rad);

    // Wave 1
    const wave1 = Math.sin(position[0] * 0.4 * dirX + position[2] * 0.4 * dirZ - time * windSpeed * 0.5);
    // Wave 2 (Orthogonal cross-wave)
    const wave2 = Math.sin(-position[0] * 0.3 * dirZ + position[2] * 0.3 * dirX - time * windSpeed * 0.8) * 0.5;
    // Micro flutter
    const flutter = Math.sin(time * 18.0) * 0.15;
    // Gust multiplier
    const gust = 1.0 + gustiness * Math.sin(time * 0.7);

    // Tip deflection (flex = (uv.y)^1.8)
    const flex = Math.pow(uvY, 1.8);
    const totalSwayMagnitude = (wave1 + wave2 + flutter) * gust * (windSpeed / 10.0) * flex * 0.35;

    const dx = totalSwayMagnitude * dirX;
    const dz = totalSwayMagnitude * dirZ;

    // Length conservation: dy = -(dx^2 + dz^2) / (2 * H)
    const horizontalDistanceSquared = dx * dx + dz * dz;
    const preservedHeightDelta = -horizontalDistanceSquared / (2 * bladeHeight);

    return {
      displacement: [dx, preservedHeightDelta, dz],
      preservedHeightDelta,
    };
  }

  public static getGraphicsPresetConfig(preset: "low" | "medium" | "high"): GraphicsPresetConfig {
    switch (preset) {
      case "low":
        return {
          preset: "low",
          grassBladeCount: 8000,
          grassSegments: 1,
          shadowMapSize: 0,
          enableShadows: false,
          enableSubsurfaceScattering: false,
          maxFps: 30,
        };
      case "medium":
        return {
          preset: "medium",
          grassBladeCount: 35000,
          grassSegments: 2,
          shadowMapSize: 1024,
          enableShadows: true,
          enableSubsurfaceScattering: true,
          maxFps: 60,
        };
      case "high":
      default:
        return {
          preset: "high",
          grassBladeCount: 95000,
          grassSegments: 3,
          shadowMapSize: 2048,
          enableShadows: true,
          enableSubsurfaceScattering: true,
          maxFps: 60,
        };
    }
  }

  public static evaluateTreeSway(
    tier: "trunk" | "branch" | "canopy",
    height: number,
    time: number,
    windSpeed: number
  ): number {
    const baseSpeed = windSpeed * 0.1;
    switch (tier) {
      case "trunk":
        // Primary slow heavy bend proportional to tree height
        return Math.sin(time * 1.2 * baseSpeed) * height * 0.015 * windSpeed;
      case "branch":
        // Secondary branch oscillation
        return Math.sin(time * 3.5 * baseSpeed + 1.0) * 0.04 * windSpeed;
      case "canopy":
        // High frequency leaf flutter
        return Math.sin(time * 8.0 * baseSpeed + 2.0) * 0.08 * windSpeed;
    }
  }
}

// ============================================================================
// 8. Environmental Controller & Astronomical Lighting Engine
// ============================================================================

export class EnvironmentLightingEngine {
  public static calculateSunCoordinates(
    elevationDegrees: number, // 0 to 90
    azimuthDegrees: number, // 0 to 360
    distance = 30
  ): [number, number, number] {
    const el = (elevationDegrees * Math.PI) / 180;
    const az = (azimuthDegrees * Math.PI) / 180;

    const y = distance * Math.sin(el);
    const x = distance * Math.cos(el) * Math.sin(az);
    const z = distance * Math.cos(el) * Math.cos(az);

    return [x, y, z];
  }

  public static lerpEnvironment(
    envA: EnvironmentSettings,
    envB: EnvironmentSettings,
    alpha: number
  ): EnvironmentSettings {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const lerpArr = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
      a[0] + (b[0] - a[0]) * clampedAlpha,
      a[1] + (b[1] - a[1]) * clampedAlpha,
      a[2] + (b[2] - a[2]) * clampedAlpha,
    ];

    return {
      preset: clampedAlpha > 0.5 ? envB.preset : envA.preset,
      timeOfDay: (envA.timeOfDay ?? 12) + ((envB.timeOfDay ?? 12) - (envA.timeOfDay ?? 12)) * clampedAlpha,
      sunPosition: lerpArr(envA.sunPosition, envB.sunPosition),
      sunIntensity: envA.sunIntensity + (envB.sunIntensity - envA.sunIntensity) * clampedAlpha,
      sunColor: clampedAlpha > 0.5 ? envB.sunColor : envA.sunColor,
      ambientColor: clampedAlpha > 0.5 ? envB.ambientColor : envA.ambientColor,
      ambientIntensity: envA.ambientIntensity + (envB.ambientIntensity - envA.ambientIntensity) * clampedAlpha,
      skyColor: clampedAlpha > 0.5 ? envB.skyColor : envA.skyColor,
      groundColor: clampedAlpha > 0.5 ? envB.groundColor : envA.groundColor,
      windSpeed: envA.windSpeed + (envB.windSpeed - envA.windSpeed) * clampedAlpha,
      windDirection: envA.windDirection + (envB.windDirection - envA.windDirection) * clampedAlpha,
      windGustiness: envA.windGustiness + (envB.windGustiness - envA.windGustiness) * clampedAlpha,
      grassDensity: clampedAlpha > 0.5 ? envB.grassDensity : envA.grassDensity,
    };
  }
}

// ============================================================================
// 9. Dual Navigation & Transform Gizmo Manager
// ============================================================================

export class GizmoAndNavigationManager {
  public activeMode: "translate" | "rotate" | "scale" = "translate";
  public snapGridStep = 0.5; // meters
  public snapAngleStep = (15 * Math.PI) / 180; // radians
  public isDraggingGizmo = false;
  public orbitControlsEnabled = true;

  public undoStack: RoomObject[][] = [];
  public redoStack: RoomObject[][] = [];

  constructor() {}

  public setGizmoDragging(dragging: boolean): void {
    this.isDraggingGizmo = dragging;
    // Interlock: orbit controls MUST be disabled during gizmo drag
    this.orbitControlsEnabled = !dragging;
  }

  public applySnapPosition(val: number): number {
    if (this.snapGridStep <= 0) return val;
    return Math.round(val / this.snapGridStep) * this.snapGridStep;
  }

  public applySnapRotation(rad: number): number {
    if (this.snapAngleStep <= 0) return rad;
    return Math.round(rad / this.snapAngleStep) * this.snapAngleStep;
  }

  public alignObjectToFloor(object: RoomObject, meshBoundingBoxMinY: number): void {
    // End key calculation: drops object flush to floor at y = 0
    object.transform.position[1] = object.transform.position[1] - meshBoundingBoxMinY;
  }

  public duplicateObject(object: RoomObject): RoomObject {
    const cloned: RoomObject = JSON.parse(JSON.stringify(object));
    cloned.id = `obj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    cloned.name = `${object.name} (Copy)`;
    // Offset slightly so it's clearly distinct
    cloned.transform.position[0] += 0.5;
    cloned.transform.position[2] += 0.5;
    return cloned;
  }

  public pushState(objects: RoomObject[]): void {
    this.undoStack.push(JSON.parse(JSON.stringify(objects)));
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  public undo(currentObjects: RoomObject[]): RoomObject[] | null {
    if (this.undoStack.length === 0) return null;
    const previous = this.undoStack.pop()!;
    this.redoStack.push(JSON.parse(JSON.stringify(currentObjects)));
    return previous;
  }

  public redo(currentObjects: RoomObject[]): RoomObject[] | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(JSON.parse(JSON.stringify(currentObjects)));
    return next;
  }

  public interpolateBookmark(
    b1: CameraBookmark,
    b2: CameraBookmark,
    t: number // 0 to 1
  ): { position: [number, number, number]; target: [number, number, number]; fov: number } {
    // Hermite S-Curve: s(t) = 3t^2 - 2t^3
    const s = 3 * t * t - 2 * t * t * t;
    const lerp = (a: number, b: number) => a + (b - a) * s;

    return {
      position: [
        lerp(b1.position[0], b2.position[0]),
        lerp(b1.position[1], b2.position[1]),
        lerp(b1.position[2], b2.position[2]),
      ],
      target: [
        lerp(b1.target[0], b2.target[0]),
        lerp(b1.target[1], b2.target[1]),
        lerp(b1.target[2], b2.target[2]),
      ],
      fov: lerp(b1.fov, b2.fov),
    };
  }
}

// ============================================================================
// 10. Live Background, Layout Passthrough & Visibility Throttling Simulator
// ============================================================================

export class Live3DBackgroundSimulator {
  public isEnabled = true;
  public activeRoomId: string | null = null;
  public graphicsPreset: "low" | "medium" | "high" = "medium";
  public windEnabled = true;

  public isTabHidden = false;
  public isEditorOpen = false;
  public animationLoopRunning = true;
  public simulatedFps = 60;
  public currentRoute = "/";

  public mouseNormalized = { x: 0, y: 0 };
  public parallaxOffset = { x: 0, y: 0 };

  public pointerEventsStyle = "none";
  public containerClasses = "fixed inset-0 pointer-events-none z-0";

  public handleVisibilityChange(hidden: boolean): void {
    this.isTabHidden = hidden;
    if (hidden) {
      // Performance safeguard: 0% GPU / pause loop when tab hidden
      this.animationLoopRunning = false;
      this.simulatedFps = 0;
    } else {
      this.animationLoopRunning = !this.isEditorOpen;
      this.simulatedFps = this.graphicsPreset === "low" ? 30 : 60;
    }
  }

  public handleRouteChange(route: string): void {
    this.currentRoute = route;
    // When visiting the Studio app directly, pause or unmount the background to prevent dual WebGL contention
    if (route === "/apps/3d-background") {
      this.isEditorOpen = true;
      this.animationLoopRunning = false;
      this.simulatedFps = 0;
    } else {
      this.isEditorOpen = false;
      this.animationLoopRunning = !this.isTabHidden && this.isEnabled;
      this.simulatedFps = this.animationLoopRunning ? (this.graphicsPreset === "low" ? 30 : 60) : 0;
    }
  }

  public updateMouseParallax(ndcX: number, ndcY: number): void {
    // Normalized device coordinates (-1 to 1) -> subtle offset
    this.mouseNormalized.x = Math.max(-1, Math.min(1, ndcX));
    this.mouseNormalized.y = Math.max(-1, Math.min(1, ndcY));
    this.parallaxOffset.x = this.mouseNormalized.x * 0.15; // 15cm max ambient shift
    this.parallaxOffset.y = this.mouseNormalized.y * 0.15;
  }
}

// ============================================================================
// 11. Localization Verifier across 6 Languages
// ============================================================================

export class LocalizationVerifier {
  public static readonly REQUIRED_LANGUAGES = ["en", "es", "ja", "ko", "ru", "zh-CN"] as const;

  public static verifyAppNameRule(): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const expected = "Oxygen Low's Software";

    for (const lang of this.REQUIRED_LANGUAGES) {
      const dict = getLocaleDictionary(lang) as any;
      // If there's an app name field, ensure it equals "Oxygen Low's Software"
      if (dict.appName && dict.appName !== expected) {
        violations.push(`Language ${lang} has appName '${dict.appName}' instead of '${expected}'`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  public static getLocalizedCatalogName(lang: string, catalogId: string): string {
    const item = PROCEDURAL_CATALOG_ITEMS.find((i) => i.catalogId === catalogId);
    if (!item) return catalogId;
    return item.defaultName;
  }
}
