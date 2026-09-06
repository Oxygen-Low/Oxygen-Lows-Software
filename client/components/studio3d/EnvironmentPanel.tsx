/**
 * EnvironmentPanel.tsx
 * Right side panel for configuring lighting, astronomical sun position,
 * procedural sky dome, dynamic wind vectors, blade grass density, and graphics presets.
 */

import React from "react";
import { EnvironmentSettings } from "@/types/threeDBackground";
import { GraphicsPreset } from "@/services/3d/environment/GraphicsPresets";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Clock,
  Compass,
  Cpu,
  Moon,
  Sparkles,
  Sun,
  SunMedium,
  Sunset,
  Wind,
  X,
} from "lucide-react";

export interface EnvironmentPanelProps {
  environment: EnvironmentSettings;
  onUpdateEnvironment: (updated: EnvironmentSettings) => void;
  graphicsPreset: GraphicsPreset;
  onChangeGraphicsPreset: (preset: GraphicsPreset) => void;
  onClose?: () => void;
}

const PRESET_CONFIGS = {
  day: {
    sunPosition: [12, 20, 8] as [number, number, number],
    sunIntensity: 1.6,
    sunColor: "#FFF8E7",
    skyColor: "#38BDF8",
    ambientColor: "#B0C4DE",
    ambientIntensity: 0.6,
    groundColor: "#2D5A27",
  },
  sunset: {
    sunPosition: [-15, 6, 8] as [number, number, number],
    sunIntensity: 1.2,
    sunColor: "#FF7E47",
    skyColor: "#E65C00",
    ambientColor: "#593122",
    ambientIntensity: 0.5,
    groundColor: "#1C2E19",
  },
  night: {
    sunPosition: [-8, 12, -15] as [number, number, number],
    sunIntensity: 0.3,
    sunColor: "#90CAF9",
    skyColor: "#0F172A",
    ambientColor: "#1E293B",
    ambientIntensity: 0.2,
    groundColor: "#0D1B0D",
  },
  studio: {
    sunPosition: [0, 18, 12] as [number, number, number],
    sunIntensity: 1.4,
    sunColor: "#FFFFFF",
    skyColor: "#64748B",
    ambientColor: "#94A3B8",
    ambientIntensity: 0.7,
    groundColor: "#334155",
  },
};

function getWindDescriptor(
  speed: number,
  t: (key: any, vars?: any, fallback?: string) => string
): string {
  if (speed < 0.5) return t("threeDBackground.windCalm", undefined, "Calm");
  if (speed < 1.5) return t("threeDBackground.windLightAir", undefined, "Light Air");
  if (speed < 3.3) return t("threeDBackground.windLightBreeze", undefined, "Light Breeze");
  if (speed < 5.5) return t("threeDBackground.windGentleBreeze", undefined, "Gentle Breeze");
  if (speed < 8.0) return t("threeDBackground.windModerateBreeze", undefined, "Moderate Breeze");
  return t("threeDBackground.windFreshBreeze", undefined, "Fresh Breeze");
}

function getCompassHeading(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "N";
  if (normalized < 67.5) return "NE";
  if (normalized < 112.5) return "E";
  if (normalized < 157.5) return "SE";
  if (normalized < 202.5) return "S";
  if (normalized < 247.5) return "SW";
  if (normalized < 292.5) return "W";
  return "NW";
}

export const EnvironmentPanel: React.FC<EnvironmentPanelProps> = ({
  environment,
  onUpdateEnvironment,
  graphicsPreset,
  onChangeGraphicsPreset,
  onClose,
}) => {
  const { t } = useLanguage();

  const handleApplyPreset = (preset: "day" | "sunset" | "night" | "studio") => {
    const config = PRESET_CONFIGS[preset];
    onUpdateEnvironment({
      ...environment,
      preset,
      ...config,
    });
  };

  const formatClock = (hours: number) => {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  return (
    <aside className="absolute top-14 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 z-30 flex flex-col shadow-2xl text-white">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-400" />
          <h2 className="font-semibold text-sm">
            {t("customize.background3DTitle", undefined, "Environment & Lighting")}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* 1. Quick Presets */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 block">
            {t("threeDBackground.lightingPresets", undefined, "Lighting Presets")}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "day", label: t("threeDBackground.presetDay", undefined, "Day"), icon: Sun, color: "text-amber-400" },
              { id: "sunset", label: t("threeDBackground.presetSunset", undefined, "Sunset"), icon: Sunset, color: "text-orange-400" },
              { id: "night", label: t("threeDBackground.presetNight", undefined, "Night"), icon: Moon, color: "text-blue-400" },
              { id: "studio", label: t("threeDBackground.presetStudio", undefined, "Studio"), icon: SunMedium, color: "text-cyan-400" },
            ].map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleApplyPreset(id as any)}
                className={cn(
                  "p-2 rounded-lg border text-xs font-medium flex items-center gap-2 transition",
                  environment.preset === id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold shadow-sm"
                    : "bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className={cn("w-4 h-4", color)} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Astronomical Sun & Sky */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              {t("threeDBackground.timeOfDay", undefined, "Time of Day")}
            </span>
            <span className="text-xs font-mono text-cyan-400">
              {formatClock(environment.timeOfDay ?? 12.0)}
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="24.0"
            step="0.25"
            value={environment.timeOfDay ?? 12.0}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              // Calculate sun angle from time of day
              const angle = ((val - 6.0) / 24.0) * Math.PI * 2;
              const radius = 22.0;
              const sunX = Math.cos(angle) * radius;
              const sunY = Math.sin(angle) * radius;
              const sunZ = 10.0;
              onUpdateEnvironment({
                ...environment,
                timeOfDay: val,
                sunPosition: [sunX, Math.max(1.0, sunY), sunZ],
              });
            }}
            className="w-full accent-cyan-500 cursor-pointer"
          />

          {/* Sun Intensity */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{t("threeDBackground.sunIntensity", undefined, "Sun Intensity")}</span>
              <span className="font-mono">{environment.sunIntensity.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="4.0"
              step="0.1"
              value={environment.sunIntensity}
              onChange={(e) =>
                onUpdateEnvironment({
                  ...environment,
                  sunIntensity: parseFloat(e.target.value),
                })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Colors: Sun, Sky, Ambient */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                {t("threeDBackground.sunColor", undefined, "Sun Color")}
              </label>
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded p-1">
                <input
                  type="color"
                  value={environment.sunColor}
                  onChange={(e) => onUpdateEnvironment({ ...environment, sunColor: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer p-0 border-0"
                />
                <span className="text-[10px] font-mono uppercase">{environment.sunColor}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                {t("threeDBackground.skyDome", undefined, "Sky Dome")}
              </label>
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded p-1">
                <input
                  type="color"
                  value={environment.skyColor}
                  onChange={(e) => onUpdateEnvironment({ ...environment, skyColor: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer p-0 border-0"
                />
                <span className="text-[10px] font-mono uppercase">{environment.skyColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dynamic Wind Simulation */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-cyan-400" />
              {t("customize.windSimulation", undefined, "Wind Simulation")}
            </span>
            <span className="text-[11px] text-slate-300 font-medium">
              {getWindDescriptor(environment.windSpeed, t)} ({environment.windSpeed.toFixed(1)} m/s)
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{t("customize.windSpeed", undefined, "Wind Speed")}</span>
              <span className="font-mono">{environment.windSpeed.toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="10.0"
              step="0.1"
              value={environment.windSpeed}
              onChange={(e) =>
                onUpdateEnvironment({
                  ...environment,
                  windSpeed: parseFloat(e.target.value),
                })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{t("threeDBackground.windDirection", undefined, "Direction")}</span>
              <span className="font-mono flex items-center gap-1">
                <Compass className="w-3 h-3 text-cyan-400" />
                {environment.windDirection}° ({getCompassHeading(environment.windDirection)})
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={environment.windDirection}
              onChange={(e) =>
                onUpdateEnvironment({
                  ...environment,
                  windDirection: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{t("threeDBackground.windGustiness", undefined, "Gustiness")}</span>
              <span className="font-mono">{Math.round(environment.windGustiness * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={environment.windGustiness}
              onChange={(e) =>
                onUpdateEnvironment({
                  ...environment,
                  windGustiness: parseFloat(e.target.value),
                })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        {/* 4. Blade Grass Density */}
        <div className="space-y-2 pt-3 border-t border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 block">
            {t("threeDBackground.grassDensity", undefined, "Blade Grass Density")}
          </span>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: "none", label: "None", count: "0" },
              { id: "low", label: "Low", count: "8k" },
              { id: "medium", label: "Med", count: "35k" },
              { id: "high", label: "High", count: "95k" },
            ].map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  onUpdateEnvironment({
                    ...environment,
                    grassDensity: id as any,
                  })
                }
                className={cn(
                  "py-1.5 rounded-lg border text-xs flex flex-col items-center justify-center transition",
                  environment.grassDensity === id
                    ? "bg-green-600/30 border-green-500 text-green-300 font-bold"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <span>{label}</span>
                <span className="text-[9px] opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Graphics Fidelity Presets */}
        <div className="space-y-2 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              {t("customize.graphicsQuality", undefined, "Graphics Fidelity")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "low", label: t("customize.qualityLow", undefined, "Low"), desc: "30 FPS" },
              { id: "medium", label: t("customize.qualityMedium", undefined, "Medium"), desc: "60 FPS" },
              { id: "high", label: t("customize.qualityHigh", undefined, "High"), desc: "60 FPS • SSS" },
            ].map(({ id, label, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => onChangeGraphicsPreset(id as GraphicsPreset)}
                className={cn(
                  "py-1.5 px-2 rounded-lg border text-xs flex flex-col items-center justify-center transition",
                  graphicsPreset === id
                    ? "bg-cyan-600/30 border-cyan-500 text-cyan-300 font-bold"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <span>{label}</span>
                <span className="text-[9px] opacity-70">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default EnvironmentPanel;
