import { z } from "zod";

// ============================================================================
// Coordinate & Transform Types
// ============================================================================

export const Vector3TupleSchema = z.tuple([
  z.number().refine(Number.isFinite, { message: "Coordinate must be a finite number" }),
  z.number().refine(Number.isFinite, { message: "Coordinate must be a finite number" }),
  z.number().refine(Number.isFinite, { message: "Coordinate must be a finite number" }),
]);
export type Vector3Tuple = z.infer<typeof Vector3TupleSchema>;

export const TransformSchema = z.object({
  position: Vector3TupleSchema,
  rotation: z.tuple([
    z.number().refine(Number.isFinite, { message: "Rotation must be a finite number" }),
    z.number().refine(Number.isFinite, { message: "Rotation must be a finite number" }),
    z.number().refine(Number.isFinite, { message: "Rotation must be a finite number" }),
  ]), // Euler radians [x, y, z]
  scale: z.tuple([
    z.number().min(0.001, "Scale must be positive").max(100, "Scale exceeds maximum limit"),
    z.number().min(0.001, "Scale must be positive").max(100, "Scale exceeds maximum limit"),
    z.number().min(0.001, "Scale must be positive").max(100, "Scale exceeds maximum limit"),
  ]),
});
export type TransformData = z.infer<typeof TransformSchema>;

// ============================================================================
// Custom Properties & Room Object Types
// ============================================================================

export const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: "Color must be a valid hex code (e.g. #FFFFFF or #FFF)",
  });

export const PosterFrameStyleSchema = z.enum([
  "modern_black",
  "oak_wood",
  "brushed_gold",
  "white_minimal",
  "frameless",
]);
export type PosterFrameStyle = z.infer<typeof PosterFrameStyleSchema>;

export const CustomPropsSchema = z.object({
  // Custom Poster Properties
  imageUrl: z.string().optional(),
  aspectRatio: z.number().min(0.05).max(20).optional(),
  frameStyle: PosterFrameStyleSchema.optional(),

  // Custom 3D Model Properties
  modelStoragePath: z.string().optional(),
  glbDataBase64: z.string().optional(),

  // Dynamic Lighting Properties (e.g. lamps)
  lightColor: HexColorSchema.optional(),
  lightIntensity: z.number().min(0).max(100).optional(),
  lightDistance: z.number().min(0).max(100).optional(),

  // Material & Appearance Customization
  colorTint: HexColorSchema.optional(),
});
export type CustomProps = z.infer<typeof CustomPropsSchema>;

export const RoomObjectTypeSchema = z.enum([
  "wall",
  "floor",
  "door",
  "window",
  "furniture",
  "decor",
  "outdoor",
  "custom_model",
]);
export type RoomObjectType = z.infer<typeof RoomObjectTypeSchema>;

export const RoomObjectSchema = z.object({
  id: z.string().uuid({ message: "Object ID must be a valid UUID" }),
  name: z.string().min(1, "Name cannot be empty").max(100, "Name exceeds maximum length"),
  catalogId: z.string().min(1, "Catalog ID cannot be empty").max(100),
  type: RoomObjectTypeSchema,
  transform: TransformSchema,
  customProps: CustomPropsSchema.optional(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
});
export type RoomObject = z.infer<typeof RoomObjectSchema>;

// ============================================================================
// Environment Settings Types
// ============================================================================

export const EnvironmentPresetSchema = z.enum(["day", "sunset", "night", "studio"]);
export type EnvironmentPreset = z.infer<typeof EnvironmentPresetSchema>;

export const GrassDensitySchema = z.enum(["none", "low", "medium", "high"]);
export type GrassDensity = z.infer<typeof GrassDensitySchema>;

export const EnvironmentSettingsSchema = z.object({
  preset: EnvironmentPresetSchema,
  timeOfDay: z.number().min(0).max(24).optional(), // 0.0 to 24.0 hours
  sunPosition: Vector3TupleSchema,
  sunIntensity: z.number().min(0).max(10).default(1.5),
  sunColor: HexColorSchema.default("#FFF8E7"),
  ambientColor: HexColorSchema.default("#B0C4DE"),
  ambientIntensity: z.number().min(0).max(5).default(0.6),
  skyColor: HexColorSchema.default("#38BDF8"),
  groundColor: HexColorSchema.default("#15803D"),
  windSpeed: z.number().min(0).max(15).default(3.0), // m/s
  windDirection: z.number().min(0).max(360).default(45.0), // degrees
  windGustiness: z.number().min(0).max(1.0).default(0.4),
  grassDensity: GrassDensitySchema.default("medium"),
});
export type EnvironmentSettings = z.infer<typeof EnvironmentSettingsSchema>;

// ============================================================================
// Camera Bookmark Types
// ============================================================================

export const CameraBookmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  position: Vector3TupleSchema,
  target: Vector3TupleSchema,
  fov: z.number().min(10).max(120).default(50),
  isPreset: z.boolean().optional().default(false),
});
export type CameraBookmark = z.infer<typeof CameraBookmarkSchema>;

// ============================================================================
// Graphics Fidelity Preset Types
// ============================================================================

export const GraphicsPresetSchema = z.enum(["low", "medium", "high"]);
export type GraphicsPreset = z.infer<typeof GraphicsPresetSchema>;

export const GraphicsPresetConfigSchema = z.object({
  preset: GraphicsPresetSchema,
  bladeCount: z.number().min(0),
  bladeSegments: z.number().min(1).max(5),
  shadowMapSize: z.number().min(0),
  enableShadows: z.boolean(),
  enableSubsurfaceScattering: z.boolean(),
  enableWindFlutter: z.boolean(),
  pixelRatioCap: z.number().min(0.5).max(3.0),
});
export type GraphicsPresetConfig = z.infer<typeof GraphicsPresetConfigSchema>;

// ============================================================================
// Room Document & Metadata Schemas
// ============================================================================

export const RoomDocumentSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().uuid({ message: "Room ID must be a valid UUID" }),
  name: z.string().min(1, "Room name is required").max(100, "Room name is too long"),
  createdAt: z.string().datetime({ message: "createdAt must be an ISO 8601 datetime" }),
  updatedAt: z.string().datetime({ message: "updatedAt must be an ISO 8601 datetime" }),
  thumbnailDataUrl: z.string().optional(),
  environment: EnvironmentSettingsSchema,
  cameraBookmarks: z.array(CameraBookmarkSchema).min(1, "At least one camera bookmark is required"),
  activeBookmarkIndex: z.number().min(0).default(0),
  objects: z.array(RoomObjectSchema).default([]),
});
export type RoomDocument = z.infer<typeof RoomDocumentSchema>;

export const RoomMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  objectCount: z.number(),
  thumbnailDataUrl: z.string().optional(),
  isBuiltIn: z.boolean().optional(),
});
export type RoomMetadata = z.infer<typeof RoomMetadataSchema>;
