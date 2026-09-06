import * as THREE from "three";
import { CustomProps } from "@/types/threeDBackground";
import {
  createStraightWallMesh,
  createCornerWallMesh,
  createWindowedWallMesh,
  createDoorwayWallMesh,
  createWoodParquetFloorMesh,
  createTileCeramicFloorMesh,
  createCarpetFloorMesh,
  createStoneMarbleFloorMesh,
  createModernWoodDoorMesh,
  createGlassSlidingDoorMesh,
  createCasementWindowMesh,
  createFloorToCeilingWindowMesh,
  createKingBedMesh,
  createNightstandMesh,
  createTableLampMesh,
  createStandingLampMesh,
  createDeskLampMesh,
  createExecutiveDeskMesh,
  createErgonomicChairMesh,
  createModernSofaMesh,
  createCoffeeTableMesh,
  createBookshelfMesh,
  createComputerSetupMesh,
  createIndoorPlantMesh,
  createPlushRugMesh,
  createRockClusterMesh,
  createSteppingStonesMesh,
  createWoodenBenchMesh,
  createGardenFenceMesh,
  createBirdbathMesh,
  createProceduralTreeMesh,
  createPosterFrameMesh,
} from "./ProceduralGeometry";

export type CatalogCategory =
  | "walls"
  | "floors"
  | "openings"
  | "furniture"
  | "outdoor"
  | "decor";

export interface CatalogItemDefinition {
  catalogId: string;
  nameKey: string;
  defaultName: string;
  category: CatalogCategory;
  icon: string;
  createMesh: (customProps?: CustomProps) => THREE.Object3D;
  defaultDimensions: [number, number, number]; // [width (X), height (Y), depth (Z)] in meters
  description?: string;
  isBuiltIn?: boolean;
  hasProceduralMesh?: boolean;
}

/**
 * Maps test harness names & shorthand aliases seamlessly to canonical catalog IDs.
 */
export const CATALOG_ALIASES: Record<string, string> = {
  plain_wall: "wall_straight",
  brick_wall: "wall_straight",
  wood_panel_wall: "wall_straight",
  corner_wall: "wall_corner",
  window_wall: "wall_windowed",
  door_wall: "wall_doorway",
  hardwood_floor: "floor_wood_parquet",
  ceramic_tile: "floor_tile_ceramic",
  carpet_plush: "floor_carpet",
  concrete_slab: "floor_stone_marble",
  marble_floor: "floor_stone_marble",
  interior_door: "door_modern_wood",
  glass_sliding_door: "door_glass_sliding",
  casement_window: "window_casement",
  bay_window: "window_floor_to_ceiling",
  glass_partition: "window_floor_to_ceiling",
  furniture_bed: "furniture_bed_king",
  nightstand: "furniture_nightstand",
  table_lamp: "furniture_lamp_table",
  standing_lamp: "furniture_lamp_standing",
  desk_lamp: "furniture_lamp_desk",
  executive_desk: "furniture_desk_executive",
  ergonomic_chair: "furniture_ergonomic_chair",
  sofa_3seater: "furniture_sofa_modern",
  coffee_table: "furniture_coffee_table",
  bookshelf: "furniture_bookshelf",
  pc_workstation: "furniture_computer_setup",
  potted_monstera: "furniture_indoor_plant",
  plush_rug: "furniture_rug_plush",
  garden_rock: "outdoor_rock_cluster",
  flagstone_path: "outdoor_stepping_stones",
  wooden_bench: "outdoor_wooden_bench",
  privacy_fence: "outdoor_garden_fence",
  birdbath: "outdoor_birdbath",
  procedural_tree: "outdoor_tree_procedural",
  poster_frame_standard: "decor_poster_frame",
};

/**
 * Authoritative registry of all 32 procedural catalog items across 6 categories.
 */
export const CATALOG_ITEMS: CatalogItemDefinition[] = [
  // ==========================================================================
  // Category 1: Modular Walls (4 items)
  // ==========================================================================
  {
    catalogId: "wall_straight",
    nameKey: "catalog.wall_straight",
    defaultName: "Straight Wall",
    category: "walls",
    icon: "Square",
    createMesh: createStraightWallMesh,
    defaultDimensions: [2.0, 2.5, 0.15],
    description: "Modular interior wall section with baseboard and crown molding trim.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "wall_corner",
    nameKey: "catalog.wall_corner",
    defaultName: "Corner Wall (90°)",
    category: "walls",
    icon: "CornerDownRight",
    createMesh: createCornerWallMesh,
    defaultDimensions: [2.0, 2.5, 2.0],
    description: "L-shaped 90-degree corner wall junction.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "wall_windowed",
    nameKey: "catalog.wall_windowed",
    defaultName: "Windowed Wall Module",
    category: "walls",
    icon: "AppWindow",
    createMesh: createWindowedWallMesh,
    defaultDimensions: [2.0, 2.5, 0.15],
    description: "Wall section with integrated double-pane window opening and glass.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "wall_doorway",
    nameKey: "catalog.wall_doorway",
    defaultName: "Doorway Wall Module",
    category: "walls",
    icon: "DoorOpen",
    createMesh: createDoorwayWallMesh,
    defaultDimensions: [2.0, 2.5, 0.15],
    description: "Wall section with cased opening for interior doors or walkthroughs.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },

  // ==========================================================================
  // Category 2: Floors & Ground (4 items)
  // ==========================================================================
  {
    catalogId: "floor_wood_parquet",
    nameKey: "catalog.floor_wood_parquet",
    defaultName: "Wood Parquet Floor",
    category: "floors",
    icon: "Grid",
    createMesh: createWoodParquetFloorMesh,
    defaultDimensions: [2.0, 0.05, 2.0],
    description: "Natural hardwood parquet flooring tile with satin finish.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "floor_tile_ceramic",
    nameKey: "catalog.floor_tile_ceramic",
    defaultName: "Ceramic Tile Floor",
    category: "floors",
    icon: "LayoutGrid",
    createMesh: createTileCeramicFloorMesh,
    defaultDimensions: [2.0, 0.05, 2.0],
    description: "Smooth ceramic floor tiles with realistic grout lines.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "floor_carpet",
    nameKey: "catalog.floor_carpet",
    defaultName: "Woven Carpet Floor",
    category: "floors",
    icon: "Disc",
    createMesh: createCarpetFloorMesh,
    defaultDimensions: [2.0, 0.03, 2.0],
    description: "Soft textured woven floor carpeting.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "floor_stone_marble",
    nameKey: "catalog.floor_stone_marble",
    defaultName: "Marble Stone Floor",
    category: "floors",
    icon: "Layers",
    createMesh: createStoneMarbleFloorMesh,
    defaultDimensions: [2.0, 0.05, 2.0],
    description: "Polished luxury marble flooring slab with clearcoat reflection.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },

  // ==========================================================================
  // Category 3: Doors & Windows (4 items)
  // ==========================================================================
  {
    catalogId: "door_modern_wood",
    nameKey: "catalog.door_modern_wood",
    defaultName: "Modern Wood Door",
    category: "openings",
    icon: "DoorClosed",
    createMesh: createModernWoodDoorMesh,
    defaultDimensions: [1.0, 2.1, 0.15],
    description: "Solid wood panel interior door with frame casing and metal lever handle.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "door_glass_sliding",
    nameKey: "catalog.door_glass_sliding",
    defaultName: "Glass Sliding Patio Door",
    category: "openings",
    icon: "PanelLeftClose",
    createMesh: createGlassSlidingDoorMesh,
    defaultDimensions: [2.0, 2.2, 0.18],
    description: "Aluminum-framed double sliding glass patio door.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "window_casement",
    nameKey: "catalog.window_casement",
    defaultName: "Casement Window",
    category: "openings",
    icon: "AppWindow",
    createMesh: createCasementWindowMesh,
    defaultDimensions: [1.2, 1.4, 0.15],
    description: "Hinged casement window with exterior sill and clear glass pane.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "window_floor_to_ceiling",
    nameKey: "catalog.window_floor_to_ceiling",
    defaultName: "Floor-to-Ceiling Window",
    category: "openings",
    icon: "Columns",
    createMesh: createFloorToCeilingWindowMesh,
    defaultDimensions: [2.0, 2.5, 0.12],
    description: "Full-height architectural glass window facade module.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },

  // ==========================================================================
  // Category 4: Furniture (13 items)
  // ==========================================================================
  {
    catalogId: "furniture_bed_king",
    nameKey: "catalog.furniture_bed_king",
    defaultName: "King Size Bed",
    category: "furniture",
    icon: "Bed",
    createMesh: createKingBedMesh,
    defaultDimensions: [2.0, 0.95, 2.2],
    description: "King bed with upholstered headboard, wooden platform, and dual pillows.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_nightstand",
    nameKey: "catalog.furniture_nightstand",
    defaultName: "Bedside Nightstand",
    category: "furniture",
    icon: "Box",
    createMesh: createNightstandMesh,
    defaultDimensions: [0.5, 0.55, 0.45],
    description: "Compact 2-drawer wooden nightstand with brass handles and tapered legs.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_lamp_table",
    nameKey: "catalog.furniture_lamp_table",
    defaultName: "Table Lamp",
    category: "furniture",
    icon: "Lamp",
    createMesh: createTableLampMesh,
    defaultDimensions: [0.35, 0.55, 0.35],
    description: "Bedside table lamp with metallic base, fabric shade, and dynamic point light.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_lamp_standing",
    nameKey: "catalog.furniture_lamp_standing",
    defaultName: "Arched Floor Lamp",
    category: "furniture",
    icon: "LampFloor",
    createMesh: createStandingLampMesh,
    defaultDimensions: [0.6, 1.8, 0.6],
    description: "Scandinavian curved floor lamp with heavy marble base and dome shade.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_lamp_desk",
    nameKey: "catalog.furniture_lamp_desk",
    defaultName: "Architect Desk Lamp",
    category: "furniture",
    icon: "LampDesk",
    createMesh: createDeskLampMesh,
    defaultDimensions: [0.3, 0.5, 0.3],
    description: "Articulated task desk lamp with adjustable arm links and cone shade.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_desk_executive",
    nameKey: "catalog.furniture_desk_executive",
    defaultName: "Executive Desk",
    category: "furniture",
    icon: "Table",
    createMesh: createExecutiveDeskMesh,
    defaultDimensions: [1.6, 0.75, 0.8],
    description: "Modern office desk with thick laminate top, metal loop legs, and modesty panel.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_ergonomic_chair",
    nameKey: "catalog.furniture_ergonomic_chair",
    defaultName: "Ergonomic Office Chair",
    category: "furniture",
    icon: "Armchair",
    createMesh: createErgonomicChairMesh,
    defaultDimensions: [0.65, 1.05, 0.65],
    description: "Contoured swivel chair with breathable mesh back, 5-star castor base, and armrests.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_sofa_modern",
    nameKey: "catalog.furniture_sofa_modern",
    defaultName: "3-Seater Lounge Sofa",
    category: "furniture",
    icon: "Sofa",
    createMesh: createModernSofaMesh,
    defaultDimensions: [2.1, 0.8, 0.9],
    description: "Contemporary 3-seater couch with deep cushions, broad armrests, and brass legs.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_coffee_table",
    nameKey: "catalog.furniture_coffee_table",
    defaultName: "Minimalist Coffee Table",
    category: "furniture",
    icon: "CircleDot",
    createMesh: createCoffeeTableMesh,
    defaultDimensions: [0.9, 0.42, 0.9],
    description: "Low round wooden coffee table supported by tripod angled steel legs.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_bookshelf",
    nameKey: "catalog.furniture_bookshelf",
    defaultName: "4-Tier Industrial Bookshelf",
    category: "furniture",
    icon: "Library",
    createMesh: createBookshelfMesh,
    defaultDimensions: [1.0, 1.8, 0.35],
    description: "Open metal frame shelving unit with four wood tiers and assorted books.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_computer_setup",
    nameKey: "catalog.furniture_computer_setup",
    defaultName: "Workstation Computer Setup",
    category: "furniture",
    icon: "Monitor",
    createMesh: createComputerSetupMesh,
    defaultDimensions: [1.2, 0.5, 0.4],
    description: "Ultrawide curved display on gas-spring arm, mechanical keyboard, mouse, and PC tower.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_indoor_plant",
    nameKey: "catalog.furniture_indoor_plant",
    defaultName: "Potted Monstera Plant",
    category: "furniture",
    icon: "Flower2",
    createMesh: createIndoorPlantMesh,
    defaultDimensions: [0.7, 1.2, 0.7],
    description: "Ceramic pot with organic soil and lush radiating green foliage.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "furniture_rug_plush",
    nameKey: "catalog.furniture_rug_plush",
    defaultName: "Plush Area Rug",
    category: "furniture",
    icon: "Disc",
    createMesh: createPlushRugMesh,
    defaultDimensions: [2.4, 0.02, 1.8],
    description: "Large rectangular accent floor rug with soft woven surface texture.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },

  // ==========================================================================
  // Category 5: Outdoor & Nature (6 items)
  // ==========================================================================
  {
    catalogId: "outdoor_rock_cluster",
    nameKey: "catalog.outdoor_rock_cluster",
    defaultName: "Natural Rock Cluster",
    category: "outdoor",
    icon: "Mountain",
    createMesh: createRockClusterMesh,
    defaultDimensions: [1.2, 0.7, 1.0],
    description: "Cluster of faceted natural granite garden stones and weathered boulders.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "outdoor_stepping_stones",
    nameKey: "catalog.outdoor_stepping_stones",
    defaultName: "Garden Stepping Stones",
    category: "outdoor",
    icon: "Footprints",
    createMesh: createSteppingStonesMesh,
    defaultDimensions: [1.2, 0.04, 4.0],
    description: "Curving natural flagstone path pathway of 5 flat stepping stones.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "outdoor_wooden_bench",
    nameKey: "catalog.outdoor_wooden_bench",
    defaultName: "Slatted Garden Bench",
    category: "outdoor",
    icon: "Armchair",
    createMesh: createWoodenBenchMesh,
    defaultDimensions: [1.6, 0.8, 0.65],
    description: "Classic slatted wood park bench with decorative cast iron armrests.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "outdoor_garden_fence",
    nameKey: "catalog.outdoor_garden_fence",
    defaultName: "Cedar Privacy Fence",
    category: "outdoor",
    icon: "Fence",
    createMesh: createGardenFenceMesh,
    defaultDimensions: [2.0, 1.2, 0.12],
    description: "Horizontal slatted cedar privacy fence boundary with vertical posts.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "outdoor_birdbath",
    nameKey: "catalog.outdoor_birdbath",
    defaultName: "Stone Birdbath",
    category: "outdoor",
    icon: "Waves",
    createMesh: createBirdbathMesh,
    defaultDimensions: [0.7, 0.85, 0.7],
    description: "Carved stone garden pedestal with shallow water basin.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
  {
    catalogId: "outdoor_tree_procedural",
    nameKey: "catalog.outdoor_tree_procedural",
    defaultName: "Procedural Garden Tree",
    category: "outdoor",
    icon: "Trees",
    createMesh: createProceduralTreeMesh,
    defaultDimensions: [3.0, 4.5, 3.0],
    description: "3D garden tree with textured bark trunk and faceted canopy foliage volumes.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },

  // ==========================================================================
  // Category 6: Decor & Custom (1 item)
  // ==========================================================================
  {
    catalogId: "decor_poster_frame",
    nameKey: "catalog.decor_poster_frame",
    defaultName: "Framed Wall Poster",
    category: "decor",
    icon: "Image",
    createMesh: createPosterFrameMesh,
    defaultDimensions: [1.0, 1.4, 0.05],
    description: "Custom wall artwork with dynamic aspect ratio, mat board, and framing options.",
    isBuiltIn: true,
    hasProceduralMesh: true,
  },
];

/**
 * Backward compatibility export for test harness and legacy specs.
 */
export const PROCEDURAL_CATALOG_ITEMS = CATALOG_ITEMS;

/**
 * Resolves a catalog item definition by its ID or legacy alias.
 */
export function getCatalogItemById(catalogId: string): CatalogItemDefinition | undefined {
  const resolvedId = CATALOG_ALIASES[catalogId] || catalogId;
  return CATALOG_ITEMS.find((item) => item.catalogId === resolvedId);
}

/**
 * Returns all catalog items belonging to a specific category.
 */
export function getCatalogItemsByCategory(category: CatalogCategory): CatalogItemDefinition[] {
  return CATALOG_ITEMS.filter((item) => item.category === category);
}

/**
 * Returns a list of all distinct catalog category identifiers.
 */
export function getAllCatalogCategories(): CatalogCategory[] {
  return ["walls", "floors", "openings", "furniture", "outdoor", "decor"];
}
