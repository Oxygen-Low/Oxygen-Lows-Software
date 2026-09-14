import React from "react";
import {
  SlidersHorizontal,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Unlock,
  Copy,
  Trash2,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Sparkles,
  Crop,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CanvasLayer,
  ImageLayer,
  TextLayer,
  ShapeLayer,
  DEFAULT_FILTERS,
  SYSTEM_FONTS,
  CustomFont,
  LayerAlignment,
  ImageFilters,
} from "./types";
import { useTranslation } from "@/contexts/LanguageContext";

interface InspectorToolbarProps {
  layer: CanvasLayer | null;
  customFonts: CustomFont[];
  onUpdateLayer: (id: string, updates: Partial<CanvasLayer>) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onAlignLayer?: (id: string, alignment: LayerAlignment) => void;
  onOpenCrop?: (layer: ImageLayer) => void;
}

const FILTER_PRESETS: { name: string; filters: ImageFilters }[] = [
  {
    name: "Normal",
    filters: { ...DEFAULT_FILTERS },
  },
  {
    name: "B&W",
    filters: { ...DEFAULT_FILTERS, grayscale: 100, contrast: 110 },
  },
  {
    name: "Vintage",
    filters: {
      ...DEFAULT_FILTERS,
      sepia: 60,
      contrast: 115,
      brightness: 95,
      saturation: 85,
    },
  },
  {
    name: "Cyberpunk",
    filters: {
      ...DEFAULT_FILTERS,
      contrast: 135,
      saturation: 160,
      invert: 10,
    },
  },
  {
    name: "Noir",
    filters: {
      ...DEFAULT_FILTERS,
      grayscale: 100,
      contrast: 160,
      brightness: 90,
    },
  },
  {
    name: "Warm",
    filters: {
      ...DEFAULT_FILTERS,
      sepia: 30,
      saturation: 125,
      brightness: 105,
    },
  },
  {
    name: "Cool",
    filters: {
      ...DEFAULT_FILTERS,
      contrast: 110,
      saturation: 90,
      brightness: 98,
    },
  },
];

export const InspectorToolbar: React.FC<InspectorToolbarProps> = ({
  layer,
  customFonts,
  onUpdateLayer,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDuplicateLayer,
  onDeleteLayer,
  onAlignLayer,
  onOpenCrop,
}) => {
  const { t } = useTranslation();

  if (!layer) {
    return null;
  }

  const isImage = layer.type === "image";
  const isText = layer.type === "text";
  const isShape = layer.type === "shape";

  const imgLayer = isImage ? (layer as ImageLayer) : null;
  const textLayer = isText ? (layer as TextLayer) : null;
  const shapeLayer = isShape ? (layer as ShapeLayer) : null;

  return (
    <div className="h-12 border-b border-border bg-card/95 backdrop-blur px-3 flex items-center justify-between gap-2 overflow-x-auto text-xs shrink-0 z-20">
      {/* Left side: Type-specific controls */}
      <div className="flex items-center gap-2">
        {/* TEXT SPECIFIC CONTROLS */}
        {isText && textLayer && (
          <div className="flex items-center gap-1.5">
            {/* Font Family */}
            <Select
              value={textLayer.fontFamily}
              onValueChange={(val) =>
                onUpdateLayer(textLayer.id, { fontFamily: val })
              }
            >
              <SelectTrigger className="h-8 w-32 sm:w-40 text-xs bg-background">
                <SelectValue placeholder="Font" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-56">
                {customFonts.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("imageStudio.customFonts", undefined, "Custom Fonts")}
                    </div>
                    {customFonts.map((cf) => (
                      <SelectItem key={cf.name} value={cf.name}>
                        <span style={{ fontFamily: cf.name }}>{cf.name}</span>
                      </SelectItem>
                    ))}
                  </>
                )}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("imageStudio.standardFonts", undefined, "Standard Fonts")}
                </div>
                {SYSTEM_FONTS.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    <span style={{ fontFamily: f.font }}>{f.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Font Size */}
            <Input
              type="number"
              value={textLayer.fontSize}
              onChange={(e) => {
                const s = parseInt(e.target.value, 10);
                if (!isNaN(s) && s > 4) {
                  onUpdateLayer(textLayer.id, { fontSize: s });
                }
              }}
              className="h-8 w-16 text-xs bg-background"
            />

            {/* Color */}
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={textLayer.color}
                onChange={(e) =>
                  onUpdateLayer(textLayer.id, { color: e.target.value })
                }
                className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                title={t("imageStudio.textColor", undefined, "Text Color")}
              />
            </div>

            {/* Bold / Italic / Underline */}
            <div className="flex items-center gap-0.5 border border-border rounded p-0.5 bg-background/50">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, {
                    fontWeight:
                      textLayer.fontWeight === "bold" ? "normal" : "bold",
                  })
                }
                title={t("imageStudio.bold", undefined, "Bold")}
                className={`h-7 w-7 ${
                  textLayer.fontWeight === "bold"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bold className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, {
                    fontStyle:
                      textLayer.fontStyle === "italic" ? "normal" : "italic",
                  })
                }
                title={t("imageStudio.italic", undefined, "Italic")}
                className={`h-7 w-7 ${
                  textLayer.fontStyle === "italic"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Italic className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, {
                    underline: !textLayer.underline,
                  })
                }
                title={t("imageStudio.underline", undefined, "Underline")}
                className={`h-7 w-7 ${
                  textLayer.underline
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Underline className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-0.5 border border-border rounded p-0.5 bg-background/50">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onUpdateLayer(textLayer.id, { textAlign: "left" })}
                className={`h-7 w-7 ${
                  textLayer.textAlign === "left"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, { textAlign: "center" })
                }
                className={`h-7 w-7 ${
                  textLayer.textAlign === "center"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, { textAlign: "right" })
                }
                className={`h-7 w-7 ${
                  textLayer.textAlign === "right"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlignRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Typography & Effects Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs border-border bg-background"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("imageStudio.textEffects", undefined, "Effects")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 bg-popover border-border space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("imageStudio.typography", undefined, "Typography & Effects")}
                </div>

                {/* Line Height */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("imageStudio.lineHeight", undefined, "Line Height")}</span>
                    <span>{textLayer.lineHeight ?? 1.2}</span>
                  </div>
                  <Slider
                    value={[(textLayer.lineHeight ?? 1.2) * 10]}
                    min={8}
                    max={25}
                    step={1}
                    onValueChange={([val]) =>
                      onUpdateLayer(textLayer.id, { lineHeight: val / 10 })
                    }
                  />
                </div>

                {/* Letter Spacing */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("imageStudio.letterSpacing", undefined, "Letter Spacing")}</span>
                    <span>{textLayer.letterSpacing ?? 0}px</span>
                  </div>
                  <Slider
                    value={[textLayer.letterSpacing ?? 0]}
                    min={-2}
                    max={20}
                    step={1}
                    onValueChange={([val]) =>
                      onUpdateLayer(textLayer.id, { letterSpacing: val })
                    }
                  />
                </div>

                {/* Stroke / Outline */}
                <div className="pt-2 border-t border-border space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("imageStudio.textOutline", undefined, "Text Outline")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={textLayer.strokeColor || "#000000"}
                      onChange={(e) =>
                        onUpdateLayer(textLayer.id, { strokeColor: e.target.value })
                      }
                      className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      type="number"
                      value={textLayer.strokeWidth || 0}
                      min={0}
                      max={20}
                      onChange={(e) => {
                        const sw = parseInt(e.target.value, 10);
                        onUpdateLayer(textLayer.id, {
                          strokeWidth: isNaN(sw) ? 0 : sw,
                        });
                      }}
                      className="h-8 w-16 text-xs bg-background"
                      placeholder="px"
                    />
                    <span className="text-[11px] text-muted-foreground">px</span>
                  </div>
                </div>

                {/* Shadow */}
                <div className="pt-2 border-t border-border space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("imageStudio.textShadow", undefined, "Text Shadow")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        textLayer.shadowColor && textLayer.shadowColor.startsWith("#")
                          ? textLayer.shadowColor
                          : "#000000"
                      }
                      onChange={(e) =>
                        onUpdateLayer(textLayer.id, { shadowColor: e.target.value })
                      }
                      className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{t("imageStudio.blur", undefined, "Blur")}</span>
                        <span>{textLayer.shadowBlur || 0}px</span>
                      </div>
                      <Slider
                        value={[textLayer.shadowBlur || 0]}
                        min={0}
                        max={40}
                        step={1}
                        onValueChange={([val]) =>
                          onUpdateLayer(textLayer.id, { shadowBlur: val })
                        }
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* IMAGE SPECIFIC CONTROLS */}
        {isImage && imgLayer && (
          <div className="flex items-center gap-1.5">
            {/* Filters Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-border bg-background"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("imageStudio.filters", undefined, "Image Filters")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 bg-popover border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("imageStudio.filters", undefined, "Adjustments")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onUpdateLayer(imgLayer.id, {
                        filters: { ...DEFAULT_FILTERS },
                      })
                    }
                    className="h-6 text-[11px] gap-1 hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("imageStudio.reset", undefined, "Reset")}
                  </Button>
                </div>

                {/* Filter Style Presets */}
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {t("imageStudio.stylePresets", undefined, "Presets")}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {FILTER_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        onClick={() =>
                          onUpdateLayer(imgLayer.id, { filters: { ...p.filters } })
                        }
                        className="py-1 px-1 rounded border border-border bg-card/60 hover:bg-accent text-[10px] text-center font-medium truncate"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="space-y-2 text-xs pt-1 border-t border-border">
                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.brightness", undefined, "Brightness")}</span>
                      <span>{imgLayer.filters.brightness}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.brightness]}
                      min={0}
                      max={200}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, brightness: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.contrast", undefined, "Contrast")}</span>
                      <span>{imgLayer.filters.contrast}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.contrast]}
                      min={0}
                      max={200}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, contrast: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.saturation", undefined, "Saturation")}</span>
                      <span>{imgLayer.filters.saturation}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.saturation]}
                      min={0}
                      max={200}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, saturation: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.blur", undefined, "Blur")}</span>
                      <span>{imgLayer.filters.blur}px</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.blur]}
                      min={0}
                      max={30}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, blur: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.grayscale", undefined, "Grayscale")}</span>
                      <span>{imgLayer.filters.grayscale}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.grayscale]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, grayscale: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.sepia", undefined, "Sepia")}</span>
                      <span>{imgLayer.filters.sepia ?? 0}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.sepia ?? 0]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, sepia: val },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{t("imageStudio.invert", undefined, "Invert")}</span>
                      <span>{imgLayer.filters.invert ?? 0}%</span>
                    </div>
                    <Slider
                      value={[imgLayer.filters.invert ?? 0]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([val]) =>
                        onUpdateLayer(imgLayer.id, {
                          filters: { ...imgLayer.filters, invert: val },
                        })
                      }
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Crop tool */}
            {onOpenCrop && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenCrop(imgLayer)}
                className="h-8 gap-1 text-xs border-border bg-background"
                title={t("imageStudio.cropImage", undefined, "Crop Image")}
              >
                <Crop className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">
                  {t("imageStudio.crop", undefined, "Crop")}
                </span>
              </Button>
            )}

            {/* Flip Horizontal / Vertical */}
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                onUpdateLayer(imgLayer.id, { flipH: !imgLayer.flipH })
              }
              title={t("imageStudio.flipH", undefined, "Flip Horizontal")}
              className={`h-8 w-8 ${
                imgLayer.flipH
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-background"
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                onUpdateLayer(imgLayer.id, { flipV: !imgLayer.flipV })
              }
              title={t("imageStudio.flipV", undefined, "Flip Vertical")}
              className={`h-8 w-8 ${
                imgLayer.flipV
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-background"
              }`}
            >
              <FlipVertical className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* SHAPE SPECIFIC CONTROLS */}
        {isShape && shapeLayer && (
          <div className="flex items-center gap-1.5">
            {/* Fill Mode: Solid vs Gradient */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-border bg-background"
                >
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {shapeLayer.fillType === "gradient"
                      ? t("imageStudio.gradient", undefined, "Gradient")
                      : t("imageStudio.fill", undefined, "Fill")}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 bg-popover border-border space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("imageStudio.shapeFill", undefined, "Shape Fill")}
                </div>

                {/* Fill type tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-card/60 rounded border border-border text-xs">
                  <button
                    onClick={() =>
                      onUpdateLayer(shapeLayer.id, { fillType: "solid" })
                    }
                    className={`py-1 rounded font-medium ${
                      shapeLayer.fillType !== "gradient"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("imageStudio.solidColor", undefined, "Solid")}
                  </button>
                  <button
                    onClick={() =>
                      onUpdateLayer(shapeLayer.id, { fillType: "gradient" })
                    }
                    className={`py-1 rounded font-medium ${
                      shapeLayer.fillType === "gradient"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("imageStudio.gradient", undefined, "Gradient")}
                  </button>
                </div>

                {shapeLayer.fillType !== "gradient" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={shapeLayer.fill}
                      onChange={(e) =>
                        onUpdateLayer(shapeLayer.id, { fill: e.target.value })
                      }
                      className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={shapeLayer.fill}
                      onChange={(e) =>
                        onUpdateLayer(shapeLayer.id, { fill: e.target.value })
                      }
                      className="h-8 text-xs font-mono bg-background"
                    />
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("imageStudio.startColor", undefined, "Start Color")}:
                      </span>
                      <input
                        type="color"
                        value={shapeLayer.gradientStart || "#06b6d4"}
                        onChange={(e) =>
                          onUpdateLayer(shapeLayer.id, {
                            gradientStart: e.target.value,
                          })
                        }
                        className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("imageStudio.endColor", undefined, "End Color")}:
                      </span>
                      <input
                        type="color"
                        value={shapeLayer.gradientEnd || "#3b82f6"}
                        onChange={(e) =>
                          onUpdateLayer(shapeLayer.id, {
                            gradientEnd: e.target.value,
                          })
                        }
                        className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-muted-foreground mb-1">
                        <span>{t("imageStudio.gradientAngle", undefined, "Angle")}</span>
                        <span>{shapeLayer.gradientAngle ?? 90}°</span>
                      </div>
                      <Slider
                        value={[shapeLayer.gradientAngle ?? 90]}
                        min={0}
                        max={360}
                        step={5}
                        onValueChange={([val]) =>
                          onUpdateLayer(shapeLayer.id, { gradientAngle: val })
                        }
                      />
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Stroke Color & Width */}
            <div className="flex items-center gap-1 ml-1">
              <Label className="text-[11px] text-muted-foreground mr-1">
                {t("imageStudio.stroke", undefined, "Border")}:
              </Label>
              <input
                type="color"
                value={
                  shapeLayer.strokeColor && shapeLayer.strokeColor !== "transparent"
                    ? shapeLayer.strokeColor
                    : "#06b6d4"
                }
                onChange={(e) =>
                  onUpdateLayer(shapeLayer.id, { strokeColor: e.target.value })
                }
                className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
              />
              <Input
                type="number"
                value={shapeLayer.strokeWidth || 0}
                min={0}
                max={40}
                onChange={(e) => {
                  const sw = parseInt(e.target.value, 10);
                  onUpdateLayer(shapeLayer.id, {
                    strokeWidth: isNaN(sw) ? 0 : sw,
                  });
                }}
                className="h-8 w-14 text-xs bg-background"
              />
            </div>

            {/* Corner Radius for rounded-rectangle */}
            {shapeLayer.shapeType === "rounded-rectangle" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-border bg-background"
                  >
                    <span>{shapeLayer.cornerRadius ?? 16}px</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-3 bg-popover border-border space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("imageStudio.cornerRadius", undefined, "Corner Radius")}</span>
                    <span>{shapeLayer.cornerRadius ?? 16}px</span>
                  </div>
                  <Slider
                    value={[shapeLayer.cornerRadius ?? 16]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([val]) =>
                      onUpdateLayer(shapeLayer.id, { cornerRadius: val })
                    }
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>

      {/* Right side: Universal transform & arrangement controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Canvas Alignment Tool */}
        {onAlignLayer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-border bg-background"
                title={t("imageStudio.alignToCanvas", undefined, "Align to Canvas")}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="hidden md:inline">
                  {t("imageStudio.align", undefined, "Align")}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-popover border-border text-xs">
              <DropdownMenuLabel>
                {t("imageStudio.alignToCanvas", undefined, "Align to Canvas")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAlignLayer(layer.id, "left")}>
                {t("imageStudio.alignLeft", undefined, "Align Left")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAlignLayer(layer.id, "center-h")}
              >
                {t("imageStudio.alignCenterH", undefined, "Center Horizontally")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlignLayer(layer.id, "right")}>
                {t("imageStudio.alignRight", undefined, "Align Right")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAlignLayer(layer.id, "top")}>
                {t("imageStudio.alignTop", undefined, "Align Top")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAlignLayer(layer.id, "center-v")}
              >
                {t("imageStudio.alignCenterV", undefined, "Center Vertically")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlignLayer(layer.id, "bottom")}>
                {t("imageStudio.alignBottom", undefined, "Align Bottom")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Opacity slider popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-border bg-background"
            >
              <span>{Math.round((layer.opacity ?? 1) * 100)}%</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3 bg-popover border-border space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("imageStudio.opacity", undefined, "Opacity")}</span>
              <span>{Math.round((layer.opacity ?? 1) * 100)}%</span>
            </div>
            <Slider
              value={[(layer.opacity ?? 1) * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([val]) =>
                onUpdateLayer(layer.id, { opacity: val / 100 })
              }
            />
          </PopoverContent>
        </Popover>

        {/* Depth ordering */}
        <div className="flex items-center gap-0.5 border border-border rounded p-0.5 bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onBringForward(layer.id)}
            title={t("imageStudio.bringForward", undefined, "Bring Forward")}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSendBackward(layer.id)}
            title={t("imageStudio.sendBackward", undefined, "Send Backward")}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onBringToFront(layer.id)}
            title={t("imageStudio.bringToFront", undefined, "Bring to Front")}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <BringToFront className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSendToBack(layer.id)}
            title={t("imageStudio.sendToBack", undefined, "Send to Back")}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <SendToBack className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Lock / Unlock */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onUpdateLayer(layer.id, { isLocked: !layer.isLocked })}
          title={
            layer.isLocked
              ? t("imageStudio.unlock", undefined, "Unlock layer")
              : t("imageStudio.lock", undefined, "Lock layer")
          }
          className={`h-8 w-8 ${
            layer.isLocked
              ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
              : "bg-background"
          }`}
        >
          {layer.isLocked ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <Unlock className="w-3.5 h-3.5" />
          )}
        </Button>

        {/* Duplicate */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onDuplicateLayer(layer.id)}
          title={t("imageStudio.duplicate", undefined, "Duplicate")}
          className="h-8 w-8 bg-background hover:bg-accent"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>

        {/* Delete */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onDeleteLayer(layer.id)}
          title={t("imageStudio.delete", undefined, "Delete")}
          className="h-8 w-8 bg-background hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
