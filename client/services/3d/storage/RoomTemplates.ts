/**
 * RoomTemplates.ts
 * Authoritative definitions for pre-made room templates and blank canvas in Oxygen Low's Software.
 * Provides production-ready scene layouts for "Cozy Bedroom", "Modern Studio", "Nature Garden", and "Blank Canvas".
 */

import {
  RoomDocument,
  RoomObject,
  EnvironmentSettings,
  CameraBookmark,
} from "@/types/threeDBackground";

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

// ============================================================================
// 1. "COZY BEDROOM" TEMPLATE
// ============================================================================

export const COZY_BEDROOM_ENVIRONMENT: EnvironmentSettings = {
  preset: "sunset",
  timeOfDay: 18.5,
  sunPosition: [8.0, 4.5, -2.0],
  sunIntensity: 1.8,
  sunColor: "#FED7AA",
  ambientColor: "#FDBA74",
  ambientIntensity: 0.65,
  skyColor: "#F4A261",
  groundColor: "#3D2817",
  windSpeed: 1.2,
  windDirection: 65.0,
  windGustiness: 0.2,
  grassDensity: "low",
};

export const COZY_BEDROOM_BOOKMARKS: CameraBookmark[] = [
  {
    id: "bm-cozy-isometric",
    name: "Isometric Overview",
    position: [5.5, 6.0, 6.5],
    target: [0.0, 0.8, -0.5],
    fov: 45,
    isPreset: true,
  },
  {
    id: "bm-cozy-bedside",
    name: "Bedside Perspective",
    position: [-1.8, 1.3, 0.8],
    target: [0.2, 0.9, -1.8],
    fov: 50,
    isPreset: true,
  },
  {
    id: "bm-cozy-window",
    name: "Window Reading Nook",
    position: [1.2, 1.4, 1.8],
    target: [2.5, 1.2, -0.2],
    fov: 52,
    isPreset: true,
  },
];

export const COZY_BEDROOM_OBJECTS: RoomObject[] = [
  // --- Floor (6m x 6m Parquet Walnut) ---
  {
    id: "c021b3d0-1001-4000-8000-000000000001",
    name: "Parquet Walnut Floor",
    catalogId: "floor_wood_parquet",
    type: "floor",
    transform: {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [3.0, 1.0, 3.0],
    },
    customProps: {
      colorTint: "#8B5A2B",
    },
    visible: true,
    locked: true,
  },

  // --- North Walls (Back Wall, Z = -3.0) ---
  {
    id: "c021b3d0-1001-4000-8000-000000000002",
    name: "North Wall Left",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-2.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000003",
    name: "North Wall Center",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [0.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000004",
    name: "North Wall Right",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [2.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },

  // --- West Walls (Left Wall, X = -3.0) ---
  {
    id: "c021b3d0-1001-4000-8000-000000000005",
    name: "West Wall North",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, -2.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000006",
    name: "West Wall Center",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, 0.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000007",
    name: "West Wall South",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, 2.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },

  // --- East Walls with Casement Window (Right Wall, X = 3.0) ---
  {
    id: "c021b3d0-1001-4000-8000-000000000008",
    name: "East Wall North",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [3.0, 1.25, -2.0],
      rotation: [0.0, -1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000009",
    name: "East Wall Casement Window",
    catalogId: "wall_windowed",
    type: "window",
    transform: {
      position: [3.0, 1.25, 0.0],
      rotation: [0.0, -1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000010",
    name: "East Wall South",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [3.0, 1.25, 2.0],
      rotation: [0.0, -1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },

  // --- Bed & Rug ---
  {
    id: "c021b3d0-1001-4000-8000-000000000011",
    name: "King Bed",
    catalogId: "furniture_bed_king",
    type: "furniture",
    transform: {
      position: [0.0, 0.0, -1.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#E2E8F0",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000012",
    name: "Plush Area Rug",
    catalogId: "furniture_rug_plush",
    type: "decor",
    transform: {
      position: [0.0, 0.02, -0.6],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.2, 1.0, 1.4],
    },
    customProps: {
      colorTint: "#1E3A8A",
    },
    visible: true,
    locked: false,
  },

  // --- Nightstands & Table Lamps (with dynamic point light props) ---
  {
    id: "c021b3d0-1001-4000-8000-000000000013",
    name: "Left Nightstand",
    catalogId: "furniture_nightstand",
    type: "furniture",
    transform: {
      position: [-1.45, 0.0, -2.4],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#5C3A21",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000014",
    name: "Right Nightstand",
    catalogId: "furniture_nightstand",
    type: "furniture",
    transform: {
      position: [1.45, 0.0, -2.4],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#5C3A21",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000015",
    name: "Left Table Lamp",
    catalogId: "furniture_lamp_table",
    type: "furniture",
    transform: {
      position: [-1.45, 0.55, -2.4],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      lightColor: "#FDE047",
      lightIntensity: 1.2,
      lightDistance: 3.5,
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000016",
    name: "Right Table Lamp",
    catalogId: "furniture_lamp_table",
    type: "furniture",
    transform: {
      position: [1.45, 0.55, -2.4],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      lightColor: "#FDE047",
      lightIntensity: 1.2,
      lightDistance: 3.5,
    },
    visible: true,
    locked: false,
  },

  // --- Wall Artwork & Potted Greenery ---
  {
    id: "c021b3d0-1001-4000-8000-000000000017",
    name: "Framed Botanical Poster",
    catalogId: "decor_poster_frame",
    type: "decor",
    transform: {
      position: [0.0, 1.85, -2.92],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      frameStyle: "oak_wood",
      aspectRatio: 1.33,
      colorTint: "#2D5A27",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-1001-4000-8000-000000000018",
    name: "Potted Monstera",
    catalogId: "furniture_indoor_plant",
    type: "furniture",
    transform: {
      position: [2.2, 0.0, 0.6],
      rotation: [0.0, 0.45, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
];

export const COZY_BEDROOM_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "b1a7e430-1001-4d92-8001-000000000001",
  name: "Cozy Bedroom",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: COZY_BEDROOM_ENVIRONMENT,
  cameraBookmarks: COZY_BEDROOM_BOOKMARKS,
  activeBookmarkIndex: 0,
  objects: COZY_BEDROOM_OBJECTS,
};

// ============================================================================
// 2. "MODERN STUDIO" TEMPLATE
// ============================================================================

export const MODERN_STUDIO_ENVIRONMENT: EnvironmentSettings = {
  preset: "studio",
  timeOfDay: 14.0,
  sunPosition: [6.0, 8.0, 4.0],
  sunIntensity: 1.6,
  sunColor: "#F8FAFC",
  ambientColor: "#E0F2FE",
  ambientIntensity: 0.7,
  skyColor: "#38BDF8",
  groundColor: "#1E293B",
  windSpeed: 0.0,
  windDirection: 0.0,
  windGustiness: 0.0,
  grassDensity: "none",
};

export const MODERN_STUDIO_BOOKMARKS: CameraBookmark[] = [
  {
    id: "bm-studio-workstation",
    name: "Workstation Focus",
    position: [-1.2, 1.45, 0.1],
    target: [-1.2, 0.95, -1.8],
    fov: 48,
    isPreset: true,
  },
  {
    id: "bm-studio-lounge",
    name: "Lounge Area",
    position: [-1.6, 1.3, 1.9],
    target: [1.0, 0.7, 0.6],
    fov: 52,
    isPreset: true,
  },
  {
    id: "bm-studio-wide",
    name: "Studio Wide Angle",
    position: [4.2, 3.2, 4.5],
    target: [-0.6, 0.9, -0.6],
    fov: 55,
    isPreset: true,
  },
];

export const MODERN_STUDIO_OBJECTS: RoomObject[] = [
  // --- Floor (6m x 6m Ceramic Tiles) ---
  {
    id: "c021b3d0-2002-4000-8000-000000000001",
    name: "Grey Ceramic Tile Flooring",
    catalogId: "floor_tile_ceramic",
    type: "floor",
    transform: {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [3.0, 1.0, 3.0],
    },
    customProps: {
      colorTint: "#64748B",
    },
    visible: true,
    locked: true,
  },

  // --- North Walls (Industrial Concrete Accent, Z = -3.0) ---
  {
    id: "c021b3d0-2002-4000-8000-000000000002",
    name: "North Studio Wall West",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-2.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000003",
    name: "North Studio Wall Center",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [0.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000004",
    name: "North Studio Wall East",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [2.0, 1.25, -3.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },

  // --- West Walls (Industrial Brick Accent, X = -3.0) ---
  {
    id: "c021b3d0-2002-4000-8000-000000000005",
    name: "West Studio Wall North",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, -2.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000006",
    name: "West Studio Wall Center",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, 0.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000007",
    name: "West Studio Wall South",
    catalogId: "wall_straight",
    type: "wall",
    transform: {
      position: [-3.0, 1.25, 2.0],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },

  // --- Workstation (Desk, Ergonomic Chair, Ultrawide Setup) ---
  {
    id: "c021b3d0-2002-4000-8000-000000000008",
    name: "Executive Tech Desk",
    catalogId: "furniture_desk_executive",
    type: "furniture",
    transform: {
      position: [-1.2, 0.0, -1.8],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#475569",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000009",
    name: "Ergonomic Mesh Chair",
    catalogId: "furniture_ergonomic_chair",
    type: "furniture",
    transform: {
      position: [-1.2, 0.0, -1.1],
      rotation: [0.0, 3.1415927, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#0F172A",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000010",
    name: "Ultrawide Curved Display & PC",
    catalogId: "furniture_computer_setup",
    type: "furniture",
    transform: {
      position: [-1.2, 0.75, -1.8],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },

  // --- Creative Lounge Area (Sofa, Coffee Table, Arched Lamp) ---
  {
    id: "c021b3d0-2002-4000-8000-000000000011",
    name: "3-Seater Modern Sofa",
    catalogId: "furniture_sofa_modern",
    type: "furniture",
    transform: {
      position: [1.1, 0.0, 0.6],
      rotation: [0.0, -1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#334155",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000012",
    name: "Round Coffee Table",
    catalogId: "furniture_coffee_table",
    type: "furniture",
    transform: {
      position: [-0.3, 0.0, 0.6],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      colorTint: "#1E293B",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000013",
    name: "Scandinavian Arched Floor Lamp",
    catalogId: "furniture_lamp_standing",
    type: "furniture",
    transform: {
      position: [2.2, 0.0, 1.8],
      rotation: [0.0, -2.3, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      lightColor: "#FEF08A",
      lightIntensity: 1.5,
      lightDistance: 4.5,
    },
    visible: true,
    locked: false,
  },

  // --- Bookshelf, Posters & Plants ---
  {
    id: "c021b3d0-2002-4000-8000-000000000014",
    name: "4-Tier Industrial Bookshelf",
    catalogId: "furniture_bookshelf",
    type: "furniture",
    transform: {
      position: [-2.75, 0.0, 0.8],
      rotation: [0.0, 1.5707963, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000015",
    name: "Landscape Art Poster 1",
    catalogId: "decor_poster_frame",
    type: "decor",
    transform: {
      position: [-1.2, 1.8, -2.92],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      frameStyle: "modern_black",
      aspectRatio: 1.6,
      colorTint: "#0EA5E9",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000016",
    name: "Landscape Art Poster 2",
    catalogId: "decor_poster_frame",
    type: "decor",
    transform: {
      position: [1.2, 1.8, -2.92],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    customProps: {
      frameStyle: "modern_black",
      aspectRatio: 1.6,
      colorTint: "#F97316",
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-2002-4000-8000-000000000017",
    name: "Corner Fiddle Leaf Fig",
    catalogId: "furniture_indoor_plant",
    type: "furniture",
    transform: {
      position: [2.4, 0.0, -2.4],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
];

export const MODERN_STUDIO_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "b1a7e430-2002-4d92-8002-000000000002",
  name: "Modern Studio",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: MODERN_STUDIO_ENVIRONMENT,
  cameraBookmarks: MODERN_STUDIO_BOOKMARKS,
  activeBookmarkIndex: 0,
  objects: MODERN_STUDIO_OBJECTS,
};

// ============================================================================
// 3. "NATURE GARDEN" TEMPLATE
// ============================================================================

export const NATURE_GARDEN_ENVIRONMENT: EnvironmentSettings = {
  preset: "day",
  timeOfDay: 11.5,
  sunPosition: [5.0, 12.0, 7.0],
  sunIntensity: 2.0,
  sunColor: "#FFFBEB",
  ambientColor: "#86EFAC",
  ambientIntensity: 0.85,
  skyColor: "#0284C7",
  groundColor: "#27272A",
  windSpeed: 4.2,
  windDirection: 55.0,
  windGustiness: 0.6,
  grassDensity: "high",
};

export const NATURE_GARDEN_BOOKMARKS: CameraBookmark[] = [
  {
    id: "bm-garden-entrance",
    name: "Garden Entrance",
    position: [4.8, 1.6, 6.8],
    target: [0.0, 1.0, -0.5],
    fov: 52,
    isPreset: true,
  },
  {
    id: "bm-garden-bench",
    name: "Bench Sanctuary",
    position: [-1.2, 1.3, -1.2],
    target: [-3.2, 0.85, -3.4],
    fov: 46,
    isPreset: true,
  },
  {
    id: "bm-garden-canopy",
    name: "Canopy Overview",
    position: [8.5, 8.0, 9.5],
    target: [0.0, 1.2, -1.0],
    fov: 55,
    isPreset: true,
  },
];

export const NATURE_GARDEN_OBJECTS: RoomObject[] = [
  // --- Ground (14m x 14m Lush Instanced Grass Lawn) ---
  {
    id: "c021b3d0-3003-4000-8000-000000000001",
    name: "Lush Grass Ground",
    catalogId: "floor_carpet",
    type: "floor",
    transform: {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [7.0, 1.0, 7.0],
    },
    customProps: {
      colorTint: "#2E7D32",
    },
    visible: true,
    locked: true,
  },

  // --- Cedar Privacy Fence Modules (Rear Boundary, Z = -6.5) ---
  {
    id: "c021b3d0-3003-4000-8000-000000000002",
    name: "Cedar Privacy Fence 1",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [-6.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000003",
    name: "Cedar Privacy Fence 2",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [-4.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000004",
    name: "Cedar Privacy Fence 3",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [-2.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000005",
    name: "Cedar Privacy Fence 4",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [0.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000006",
    name: "Cedar Privacy Fence 5",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [2.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000007",
    name: "Cedar Privacy Fence 6",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [4.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000008",
    name: "Cedar Privacy Fence 7",
    catalogId: "outdoor_garden_fence",
    type: "outdoor",
    transform: {
      position: [6.0, 0.6, -6.5],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: true,
  },

  // --- Sinuous Flagstone Stepping Stone Pathway ---
  {
    id: "c021b3d0-3003-4000-8000-000000000009",
    name: "Flagstone Pathway 1 (Entrance)",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [3.5, 0.02, 5.0],
      rotation: [0.0, 0.2, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000010",
    name: "Flagstone Pathway 2",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [2.4, 0.02, 3.4],
      rotation: [0.0, -0.4, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000011",
    name: "Flagstone Pathway 3",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [1.5, 0.02, 1.8],
      rotation: [0.0, 0.35, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000012",
    name: "Flagstone Pathway 4",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [0.4, 0.02, 0.3],
      rotation: [0.0, -0.15, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000013",
    name: "Flagstone Pathway 5",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [-0.8, 0.02, -1.1],
      rotation: [0.0, 0.5, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000014",
    name: "Flagstone Pathway 6 (Bench Approach)",
    catalogId: "outdoor_stepping_stones",
    type: "outdoor",
    transform: {
      position: [-1.8, 0.02, -2.4],
      rotation: [0.0, -0.2, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },

  // --- Slatted Wooden Park Bench ---
  {
    id: "c021b3d0-3003-4000-8000-000000000015",
    name: "Slatted Wooden Park Bench",
    catalogId: "outdoor_wooden_bench",
    type: "outdoor",
    transform: {
      position: [-2.8, 0.0, -2.8],
      rotation: [0.0, 0.65, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },

  // --- Procedural 3D Trees (Wind Swaying) ---
  {
    id: "c021b3d0-3003-4000-8000-000000000016",
    name: "Majestic Canopy Oak",
    catalogId: "outdoor_tree_procedural",
    type: "outdoor",
    transform: {
      position: [-4.8, 0.0, -4.5],
      rotation: [0.0, 1.1, 0.0],
      scale: [1.2, 1.2, 1.2],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000017",
    name: "Shaded Garden Tree",
    catalogId: "outdoor_tree_procedural",
    type: "outdoor",
    transform: {
      position: [4.2, 0.0, -3.8],
      rotation: [0.0, 2.4, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000018",
    name: "Front Grove Tree",
    catalogId: "outdoor_tree_procedural",
    type: "outdoor",
    transform: {
      position: [-5.2, 0.0, 2.5],
      rotation: [0.0, 0.5, 0.0],
      scale: [0.85, 0.9, 0.85],
    },
    visible: true,
    locked: false,
  },

  // --- Weathered Rock Clusters & Stone Birdbath ---
  {
    id: "c021b3d0-3003-4000-8000-000000000019",
    name: "Weathered Rock Cluster 1",
    catalogId: "outdoor_rock_cluster",
    type: "outdoor",
    transform: {
      position: [-3.6, 0.0, -4.8],
      rotation: [0.0, 0.8, 0.0],
      scale: [1.1, 1.0, 1.1],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000020",
    name: "Weathered Rock Cluster 2",
    catalogId: "outdoor_rock_cluster",
    type: "outdoor",
    transform: {
      position: [1.8, 0.0, 0.5],
      rotation: [0.0, 2.1, 0.0],
      scale: [0.8, 0.75, 0.8],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000021",
    name: "Weathered Rock Cluster 3",
    catalogId: "outdoor_rock_cluster",
    type: "outdoor",
    transform: {
      position: [4.5, 0.0, 3.2],
      rotation: [0.0, -1.2, 0.0],
      scale: [0.9, 0.85, 0.9],
    },
    visible: true,
    locked: false,
  },
  {
    id: "c021b3d0-3003-4000-8000-000000000022",
    name: "Stone Birdbath Basin",
    catalogId: "outdoor_birdbath",
    type: "outdoor",
    transform: {
      position: [-0.4, 0.0, -3.2],
      rotation: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0, 1.0],
    },
    visible: true,
    locked: false,
  },
];

export const NATURE_GARDEN_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "b1a7e430-3003-4d92-8003-000000000003",
  name: "Nature Garden",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: NATURE_GARDEN_ENVIRONMENT,
  cameraBookmarks: NATURE_GARDEN_BOOKMARKS,
  activeBookmarkIndex: 0,
  objects: NATURE_GARDEN_OBJECTS,
};

// ============================================================================
// 4. "BLANK CANVAS" TEMPLATE
// ============================================================================

export const BLANK_CANVAS_ENVIRONMENT: EnvironmentSettings = {
  preset: "day",
  timeOfDay: 12.0,
  sunPosition: [5.0, 10.0, 5.0],
  sunIntensity: 1.5,
  sunColor: "#FFFFFF",
  ambientColor: "#F1F5F9",
  ambientIntensity: 0.6,
  skyColor: "#38BDF8",
  groundColor: "#334155",
  windSpeed: 0.0,
  windDirection: 0.0,
  windGustiness: 0.0,
  grassDensity: "none",
};

export const BLANK_CANVAS_BOOKMARKS: CameraBookmark[] = [
  {
    id: "bm-blank-isometric",
    name: "Isometric Overview",
    position: [7.0, 8.0, 8.0],
    target: [0.0, 0.0, 0.0],
    fov: 50,
    isPreset: true,
  },
  {
    id: "bm-blank-front",
    name: "Front View",
    position: [0.0, 2.5, 7.5],
    target: [0.0, 1.0, 0.0],
    fov: 50,
    isPreset: true,
  },
  {
    id: "bm-blank-top",
    name: "Top Down",
    position: [0.0, 11.0, 0.001],
    target: [0.0, 0.0, 0.0],
    fov: 45,
    isPreset: true,
  },
];

export const BLANK_CANVAS_OBJECTS: RoomObject[] = [
  {
    id: "c021b3d0-4004-4000-8000-000000000001",
    name: "Standard 6m Floor",
    catalogId: "floor_wood_parquet",
    type: "floor",
    transform: {
      position: [0.0, 0.0, 0.0],
      rotation: [0.0, 0.0, 0.0],
      scale: [3.0, 1.0, 3.0],
    },
    customProps: {
      colorTint: "#94A3B8",
    },
    visible: true,
    locked: true,
  },
];

export const BLANK_CANVAS_TEMPLATE: RoomDocument = {
  schemaVersion: "1.0.0",
  id: "b1a7e430-4004-4d92-8004-000000000004",
  name: "Blank Canvas",
  createdAt: "2026-09-06T10:00:00.000Z",
  updatedAt: "2026-09-06T10:00:00.000Z",
  environment: BLANK_CANVAS_ENVIRONMENT,
  cameraBookmarks: BLANK_CANVAS_BOOKMARKS,
  activeBookmarkIndex: 0,
  objects: BLANK_CANVAS_OBJECTS,
};

// ============================================================================
// TEMPLATE REGISTRY & FACTORY METHODS
// ============================================================================

export const BUILT_IN_TEMPLATES: RoomDocument[] = [
  COZY_BEDROOM_TEMPLATE,
  MODERN_STUDIO_TEMPLATE,
  NATURE_GARDEN_TEMPLATE,
];

export const DEFAULT_ROOM_TEMPLATES: RoomDocument[] = [
  COZY_BEDROOM_TEMPLATE,
  MODERN_STUDIO_TEMPLATE,
  NATURE_GARDEN_TEMPLATE,
  BLANK_CANVAS_TEMPLATE,
];

export const TEMPLATE_ALIASES: Record<string, string> = {
  "cozy-bedroom": COZY_BEDROOM_TEMPLATE.id,
  "template-cozy-bedroom": COZY_BEDROOM_TEMPLATE.id,
  "cozy_bedroom": COZY_BEDROOM_TEMPLATE.id,
  "bedroom": COZY_BEDROOM_TEMPLATE.id,
  "modern-studio": MODERN_STUDIO_TEMPLATE.id,
  "template-modern-studio": MODERN_STUDIO_TEMPLATE.id,
  "modern_studio": MODERN_STUDIO_TEMPLATE.id,
  "studio": MODERN_STUDIO_TEMPLATE.id,
  "nature-garden": NATURE_GARDEN_TEMPLATE.id,
  "template-nature-garden": NATURE_GARDEN_TEMPLATE.id,
  "nature_garden": NATURE_GARDEN_TEMPLATE.id,
  "garden": NATURE_GARDEN_TEMPLATE.id,
  "blank-canvas": BLANK_CANVAS_TEMPLATE.id,
  "template-blank-canvas": BLANK_CANVAS_TEMPLATE.id,
  "blank_canvas": BLANK_CANVAS_TEMPLATE.id,
  "blank": BLANK_CANVAS_TEMPLATE.id,
};

/**
 * Resolves a template alias or ID to its canonical UUID.
 */
export function resolveTemplateId(templateId: string): string {
  if (!templateId) return BLANK_CANVAS_TEMPLATE.id;
  const normalized = templateId.toLowerCase().trim();
  return TEMPLATE_ALIASES[normalized] || templateId;
}

/**
 * Retrieves a static template definition by its ID or alias.
 */
export function getRoomTemplateById(templateId: string): RoomDocument | undefined {
  const resolved = resolveTemplateId(templateId);
  return DEFAULT_ROOM_TEMPLATES.find((t) => t.id === resolved || t.id === templateId);
}

/**
 * Creates a fresh, deep-cloned instance of a room template with newly generated UUIDs.
 * Guarantees that loading or modifying this room instance does not mutate static templates
 * or cause key collisions in storage.
 */
export function instantiateRoomTemplate(templateId: string, customName?: string): RoomDocument {
  const base = getRoomTemplateById(templateId) || BLANK_CANVAS_TEMPLATE;
  const now = new Date().toISOString();

  // Deep clone to isolate state
  const instance: RoomDocument = JSON.parse(JSON.stringify(base));

  instance.id = generateUUID();
  if (customName) {
    instance.name = customName;
  }
  instance.createdAt = now;
  instance.updatedAt = now;

  // Re-key objects with fresh UUIDs
  instance.objects = instance.objects.map((obj) => ({
    ...obj,
    id: generateUUID(),
  }));

  // Re-key bookmarks with fresh IDs
  instance.cameraBookmarks = instance.cameraBookmarks.map((bm, index) => ({
    ...bm,
    id: `bm_${index}_${generateUUID().slice(0, 8)}`,
  }));

  return instance;
}
