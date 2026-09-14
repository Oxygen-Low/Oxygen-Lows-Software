export type ToolType =
  | "pencil"
  | "eraser"
  | "bucket"
  | "eyedropper"
  | "line"
  | "rectangle"
  | "circle"
  | "lighten"
  | "darken"
  | "colorSwap";

export type BrushSize = 1 | 2 | 3 | 4;

export interface PixelLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0 to 1
  // Flat array of hex colors or empty string "" for transparent
  // Length is width * height
  pixels: string[];
}

export interface PixelFrame {
  id: string;
  name: string;
  layers: PixelLayer[];
}

export interface PalettePreset {
  id: string;
  name: string;
  colors: string[];
}

export interface PixelArtProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  frames: PixelFrame[];
  palette: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryStep {
  frames: PixelFrame[];
  width: number;
  height: number;
}
