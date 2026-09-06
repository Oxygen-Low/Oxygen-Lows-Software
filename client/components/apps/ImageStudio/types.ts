export type LayerType = "image" | "text" | "shape";

export type ShapeType =
  | "rectangle"
  | "rounded-rectangle"
  | "circle"
  | "triangle"
  | "star"
  | "line"
  | "arrow"
  | "badge";

export interface ImageFilters {
  brightness: number; // 0 - 200, default 100
  contrast: number; // 0 - 200, default 100
  saturation: number; // 0 - 200, default 100
  blur: number; // 0 - 50 px, default 0
  grayscale: number; // 0 - 100 %, default 0
  sepia: number; // 0 - 100 %, default 0
  invert: number; // 0 - 100 %, default 0
}

export const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

export interface BaseLayer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees 0 - 360
  opacity: number; // 0 - 1
  isLocked: boolean;
  isVisible: boolean;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  src: string;
  storagePath?: string;
  naturalWidth: number;
  naturalHeight: number;
  flipH: boolean;
  flipV: boolean;
  filters: ImageFilters;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold" | "600" | "800";
  fontStyle: "normal" | "italic";
  underline: boolean;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number; // multiplier, e.g. 1.2
  letterSpacing: number; // px
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shapeType: ShapeType;
  fill: string;
  fillType: "solid" | "gradient";
  gradientAngle?: number;
  gradientStart?: string;
  gradientEnd?: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius?: number; // for rounded rectangles
}

export type CanvasLayer = ImageLayer | TextLayer | ShapeLayer;

export interface GradientConfig {
  type: "linear" | "radial";
  angle: number; // 0 - 360
  startColor: string;
  endColor: string;
}

export interface CanvasBackground {
  type: "color" | "gradient" | "transparent";
  color: string;
  gradient: GradientConfig;
}

export interface CanvasProject {
  id: string;
  name: string;
  width: number;
  height: number;
  background: CanvasBackground;
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFont {
  name: string;
  url: string;
  storagePath?: string;
  format: string;
}

export interface PresetDimension {
  id: string;
  name: string;
  width: number;
  height: number;
  iconName?: string;
  aspectRatioLabel?: string;
}

export const PRESET_DIMENSIONS: PresetDimension[] = [
  { id: "square", name: "Square Post", width: 1080, height: 1080, aspectRatioLabel: "1:1" },
  { id: "fullhd", name: "Full HD / Landscape", width: 1920, height: 1080, aspectRatioLabel: "16:9" },
  { id: "story", name: "Portrait / Story", width: 1080, height: 1920, aspectRatioLabel: "9:16" },
  { id: "banner", name: "Social Banner / Header", width: 1200, height: 630, aspectRatioLabel: "1.91:1" },
  { id: "a4", name: "A4 Document", width: 1240, height: 1754, aspectRatioLabel: "1:1.41" },
  { id: "icon", name: "App Icon / Logo", width: 512, height: 512, aspectRatioLabel: "1:1" },
];

export const SYSTEM_FONTS = [
  { name: "Inter", font: "Inter, sans-serif" },
  { name: "Roboto", font: "Roboto, sans-serif" },
  { name: "Arial", font: "Arial, Helvetica, sans-serif" },
  { name: "Times New Roman", font: "'Times New Roman', Times, serif" },
  { name: "Georgia", font: "Georgia, serif" },
  { name: "Courier New", font: "'Courier New', Courier, monospace" },
  { name: "Impact", font: "Impact, Charcoal, sans-serif" },
  { name: "Trebuchet MS", font: "'Trebuchet MS', sans-serif" },
  { name: "Comic Sans MS", font: "'Comic Sans MS', cursive, sans-serif" },
];
