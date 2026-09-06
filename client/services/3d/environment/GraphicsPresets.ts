/**
 * GraphicsPresets.ts
 * Authoritative graphics fidelity preset configurations for Oxygen Low's Software.
 * Governs instanced grass blade counts, segment LOD, shadow mapping, and shader feature flags.
 */

export type GraphicsPreset = "low" | "medium" | "high";

export interface GraphicsPresetConfig {
  preset: GraphicsPreset;
  grassBladeCount: number;
  bladeCount: number; // alias for schema compatibility
  grassSegments: 1 | 2 | 3;
  bladeSegments: 1 | 2 | 3; // alias for schema compatibility
  shadowMapSize: number;
  enableShadows: boolean;
  enableSubsurfaceScattering: boolean;
  maxFps: number;
  enableWindFlutter: boolean;
  pixelRatioCap: number;
  treeFoliageTiers: 1 | 2 | 3;
}

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsPresetConfig> = {
  low: {
    preset: "low",
    grassBladeCount: 8000,
    bladeCount: 8000,
    grassSegments: 1,
    bladeSegments: 1,
    shadowMapSize: 0,
    enableShadows: false,
    enableSubsurfaceScattering: false,
    maxFps: 30,
    enableWindFlutter: false,
    pixelRatioCap: 1.0,
    treeFoliageTiers: 1,
  },
  medium: {
    preset: "medium",
    grassBladeCount: 35000,
    bladeCount: 35000,
    grassSegments: 2,
    bladeSegments: 2,
    shadowMapSize: 1024,
    enableShadows: true,
    enableSubsurfaceScattering: true,
    maxFps: 60,
    enableWindFlutter: true,
    pixelRatioCap: 1.5,
    treeFoliageTiers: 2,
  },
  high: {
    preset: "high",
    grassBladeCount: 95000,
    bladeCount: 95000,
    grassSegments: 3,
    bladeSegments: 3,
    shadowMapSize: 2048,
    enableShadows: true,
    enableSubsurfaceScattering: true,
    maxFps: 60,
    enableWindFlutter: true,
    pixelRatioCap: 2.0,
    treeFoliageTiers: 3,
  },
};

/**
 * Returns a cloned GraphicsPresetConfig for the requested preset.
 * Gracefully falls back to 'high' for unrecognized preset keys.
 */
export function getGraphicsPresetConfig(preset: string): GraphicsPresetConfig {
  if (preset === "low" || preset === "medium" || preset === "high") {
    return { ...GRAPHICS_PRESETS[preset] };
  }
  return { ...GRAPHICS_PRESETS.high };
}
