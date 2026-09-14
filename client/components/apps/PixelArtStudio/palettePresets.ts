import { PalettePreset } from "./types";

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "pico-8",
    name: "PICO-8",
    colors: [
      "#000000",
      "#1D2B53",
      "#7E2553",
      "#008751",
      "#AB5236",
      "#5F574F",
      "#C2C3C7",
      "#FFF1E8",
      "#FF004D",
      "#FFA300",
      "#FFEC27",
      "#00E436",
      "#29ADFF",
      "#83769C",
      "#FF77A8",
      "#FFCCAA",
    ],
  },
  {
    id: "gameboy",
    name: "Game Boy Classic",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    id: "endesga-32",
    name: "Endesga 32",
    colors: [
      "#be4a2f",
      "#d77643",
      "#ead4aa",
      "#e4a672",
      "#b86f50",
      "#733e39",
      "#3e2731",
      "#a22633",
      "#e43b44",
      "#f77622",
      "#feae34",
      "#fee761",
      "#63c74d",
      "#3e8948",
      "#265c42",
      "#193c3e",
      "#124e89",
      "#0099db",
      "#2ce8f5",
      "#ffffff",
      "#c0cbdc",
      "#8b9bb4",
      "#5a6988",
      "#3a4466",
      "#262b44",
      "#181425",
      "#ff0044",
      "#68386c",
      "#b55088",
      "#f6757a",
      "#e8b796",
      "#c28569",
    ],
  },
  {
    id: "c64",
    name: "Commodore 64",
    colors: [
      "#000000",
      "#FFFFFF",
      "#880000",
      "#AAFFEE",
      "#CC44CC",
      "#00CC55",
      "#0000AA",
      "#EEEE77",
      "#DD8855",
      "#664400",
      "#FF7777",
      "#333333",
      "#777777",
      "#AAFF66",
      "#0088FF",
      "#BBBBBB",
    ],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    colors: [
      "#050505",
      "#1a102f",
      "#2e0854",
      "#570861",
      "#9a0f6e",
      "#e0115f",
      "#ff007f",
      "#ff55a3",
      "#00ffff",
      "#00bfff",
      "#0066ff",
      "#3b0086",
      "#39ff14",
      "#ffff00",
      "#ff6700",
      "#ffffff",
    ],
  },
  {
    id: "pastel",
    name: "Pastel Dreams",
    colors: [
      "#ffb3ba",
      "#ffdfba",
      "#ffffba",
      "#baffc9",
      "#bae1ff",
      "#d7bde2",
      "#f5cba7",
      "#a3e4d7",
      "#fadbd8",
      "#d5f5e3",
      "#ebdef0",
      "#fcf3cf",
      "#5d6d7e",
      "#34495e",
      "#2c3e50",
      "#ffffff",
    ],
  },
];

export const DEFAULT_PALETTE = PALETTE_PRESETS[0].colors;

/**
 * Extract unique hex colors from a flat pixel array or frames.
 */
export function extractPaletteFromPixels(pixelArrays: string[][], maxColors = 32): string[] {
  const seen = new Set<string>();
  for (const pixels of pixelArrays) {
    for (const color of pixels) {
      if (color && color.startsWith("#")) {
        seen.add(color.toLowerCase());
        if (seen.size >= maxColors) break;
      }
    }
    if (seen.size >= maxColors) break;
  }
  return Array.from(seen);
}
