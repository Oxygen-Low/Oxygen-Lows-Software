import React from "react";
import { Palette, Check, Sparkles } from "lucide-react";
import { CanvasBackground, GradientConfig } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/contexts/LanguageContext";

interface BackgroundPanelProps {
  background: CanvasBackground;
  onChangeBackground: (bg: CanvasBackground) => void;
}

const COLOR_SWATCHES = [
  "#ffffff",
  "#000000",
  "#0f172a",
  "#1e293b",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#10b981",
];

const GRADIENT_PRESETS: GradientConfig[] = [
  { type: "linear", angle: 135, startColor: "#0f172a", endColor: "#1e293b" },
  { type: "linear", angle: 135, startColor: "#06b6d4", endColor: "#3b82f6" },
  { type: "linear", angle: 135, startColor: "#8b5cf6", endColor: "#ec4899" },
  { type: "linear", angle: 135, startColor: "#f97316", endColor: "#f43f5e" },
  { type: "linear", angle: 135, startColor: "#10b981", endColor: "#06b6d4" },
  { type: "radial", angle: 0, startColor: "#1e293b", endColor: "#020617" },
  { type: "radial", angle: 0, startColor: "#3b82f6", endColor: "#0f172a" },
];

export const BackgroundPanel: React.FC<BackgroundPanelProps> = ({
  background,
  onChangeBackground,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div className="space-y-4 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("imageStudio.canvasBackground", undefined, "Canvas Background")}
      </div>

      {/* Type Selector (Transparent / Color / Gradient) */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-card/60 rounded-lg border border-border">
        <button
          onClick={() =>
            onChangeBackground({
              ...background,
              type: "transparent",
            })
          }
          className={`py-1.5 px-2 text-xs rounded font-medium transition-all ${
            background.type === "transparent"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("imageStudio.transparent", undefined, "Transparent")}
        </button>
        <button
          onClick={() =>
            onChangeBackground({
              ...background,
              type: "color",
            })
          }
          className={`py-1.5 px-2 text-xs rounded font-medium transition-all ${
            background.type === "color"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("imageStudio.solidColor", undefined, "Solid")}
        </button>
        <button
          onClick={() =>
            onChangeBackground({
              ...background,
              type: "gradient",
            })
          }
          className={`py-1.5 px-2 text-xs rounded font-medium transition-all ${
            background.type === "gradient"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("imageStudio.gradient", undefined, "Gradient")}
        </button>
      </div>

      {/* Transparent Info */}
      {background.type === "transparent" && (
        <div className="p-3 rounded-lg border border-border/60 bg-card/30 text-xs text-muted-foreground">
          <p>
            {t(
              "imageStudio.transparentNote",
              undefined,
              "Canvas background is transparent. Exporting as PNG will preserve transparency.",
            )}
          </p>
        </div>
      )}

      {/* Solid Color Controls */}
      {background.type === "color" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={background.color}
              onChange={(e) =>
                onChangeBackground({
                  ...background,
                  color: e.target.value,
                })
              }
              className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
            />
            <Input
              value={background.color}
              onChange={(e) =>
                onChangeBackground({
                  ...background,
                  color: e.target.value,
                })
              }
              className="h-9 font-mono text-xs bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              {t("imageStudio.swatches", undefined, "Color Palette")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  onClick={() =>
                    onChangeBackground({
                      ...background,
                      color: hex,
                    })
                  }
                  className="w-6 h-6 rounded-full border border-white/20 shadow-sm transition-transform hover:scale-125 relative flex items-center justify-center"
                  style={{ backgroundColor: hex }}
                >
                  {background.color.toLowerCase() === hex.toLowerCase() && (
                    <Check
                      className={`w-3 h-3 ${
                        hex === "#ffffff" ? "text-black" : "text-white"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gradient Controls */}
      {background.type === "gradient" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t("imageStudio.startColor", undefined, "Start Color")}
              </Label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={background.gradient.startColor}
                  onChange={(e) =>
                    onChangeBackground({
                      ...background,
                      gradient: {
                        ...background.gradient,
                        startColor: e.target.value,
                      },
                    })
                  }
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={background.gradient.startColor}
                  onChange={(e) =>
                    onChangeBackground({
                      ...background,
                      gradient: {
                        ...background.gradient,
                        startColor: e.target.value,
                      },
                    })
                  }
                  className="h-8 font-mono text-xs bg-background"
                />
              </div>
            </div>

            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t("imageStudio.endColor", undefined, "End Color")}
              </Label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={background.gradient.endColor}
                  onChange={(e) =>
                    onChangeBackground({
                      ...background,
                      gradient: {
                        ...background.gradient,
                        endColor: e.target.value,
                      },
                    })
                  }
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={background.gradient.endColor}
                  onChange={(e) =>
                    onChangeBackground({
                      ...background,
                      gradient: {
                        ...background.gradient,
                        endColor: e.target.value,
                      },
                    })
                  }
                  className="h-8 font-mono text-xs bg-background"
                />
              </div>
            </div>
          </div>

          {/* Gradient Type */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() =>
                onChangeBackground({
                  ...background,
                  gradient: {
                    ...background.gradient,
                    type: "linear",
                  },
                })
              }
              className={`flex-1 py-1 text-xs rounded border transition-colors ${
                background.gradient.type === "linear"
                  ? "border-primary bg-primary/20 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t("imageStudio.linear", undefined, "Linear")}
            </button>
            <button
              onClick={() =>
                onChangeBackground({
                  ...background,
                  gradient: {
                    ...background.gradient,
                    type: "radial",
                  },
                })
              }
              className={`flex-1 py-1 text-xs rounded border transition-colors ${
                background.gradient.type === "radial"
                  ? "border-primary bg-primary/20 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t("imageStudio.radial", undefined, "Radial")}
            </button>
          </div>

          {/* Angle Slider (if Linear) */}
          {background.gradient.type === "linear" && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("imageStudio.gradientAngle", undefined, "Angle")}</span>
                <span>{background.gradient.angle}°</span>
              </div>
              <Slider
                value={[background.gradient.angle]}
                min={0}
                max={360}
                step={5}
                onValueChange={([val]) =>
                  onChangeBackground({
                    ...background,
                    gradient: {
                      ...background.gradient,
                      angle: val,
                    },
                  })
                }
              />
            </div>
          )}

          {/* Gradient Presets */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label className="text-[11px] text-muted-foreground">
              {t("imageStudio.gradientPresets", undefined, "Gradient Presets")}
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {GRADIENT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() =>
                    onChangeBackground({
                      ...background,
                      gradient: preset,
                    })
                  }
                  className="h-8 rounded-lg border border-border shadow-sm hover:scale-105 transition-transform"
                  style={{
                    background:
                      preset.type === "linear"
                        ? `linear-gradient(${preset.angle}deg, ${preset.startColor}, ${preset.endColor})`
                        : `radial-gradient(circle, ${preset.startColor}, ${preset.endColor})`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
