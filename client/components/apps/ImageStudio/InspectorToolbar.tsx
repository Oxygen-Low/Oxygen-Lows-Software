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
  Type,
  Palette,
  Sparkles,
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
  CanvasLayer,
  ImageLayer,
  TextLayer,
  ShapeLayer,
  DEFAULT_FILTERS,
  SYSTEM_FONTS,
  CustomFont,
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
}

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
              />
            </div>

            {/* Bold / Italic */}
            <div className="flex items-center gap-0.5 border border-border rounded p-0.5 bg-background/50">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onUpdateLayer(textLayer.id, {
                    fontWeight: textLayer.fontWeight === "bold" ? "normal" : "bold",
                  })
                }
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
                className={`h-7 w-7 ${
                  textLayer.fontStyle === "italic"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Italic className="w-3.5 h-3.5" />
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
                onClick={() => onUpdateLayer(textLayer.id, { textAlign: "center" })}
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
                onClick={() => onUpdateLayer(textLayer.id, { textAlign: "right" })}
                className={`h-7 w-7 ${
                  textLayer.textAlign === "right"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <AlignRight className="w-3.5 h-3.5" />
              </Button>
            </div>
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
                      onUpdateLayer(imgLayer.id, { filters: { ...DEFAULT_FILTERS } })
                    }
                    className="h-6 text-[11px] gap-1 hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("imageStudio.reset", undefined, "Reset")}
                  </Button>
                </div>

                {/* Sliders */}
                <div className="space-y-2 text-xs">
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
                </div>
              </PopoverContent>
            </Popover>

            {/* Flip Horizontal / Vertical */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onUpdateLayer(imgLayer.id, { flipH: !imgLayer.flipH })}
              title={t("imageStudio.flipH", undefined, "Flip Horizontal")}
              className={`h-8 w-8 ${imgLayer.flipH ? "bg-primary/20 text-primary border-primary/50" : "bg-background"}`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onUpdateLayer(imgLayer.id, { flipV: !imgLayer.flipV })}
              title={t("imageStudio.flipV", undefined, "Flip Vertical")}
              className={`h-8 w-8 ${imgLayer.flipV ? "bg-primary/20 text-primary border-primary/50" : "bg-background"}`}
            >
              <FlipVertical className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* SHAPE SPECIFIC CONTROLS */}
        {isShape && shapeLayer && (
          <div className="flex items-center gap-1.5">
            {/* Fill Color */}
            <div className="flex items-center gap-1">
              <Label className="text-[11px] text-muted-foreground mr-1">
                {t("imageStudio.fill", undefined, "Fill")}:
              </Label>
              <input
                type="color"
                value={shapeLayer.fill}
                onChange={(e) =>
                  onUpdateLayer(shapeLayer.id, { fill: e.target.value })
                }
                className="w-7 h-7 rounded border border-border cursor-pointer bg-transparent"
              />
            </div>

            {/* Stroke Color & Width */}
            <div className="flex items-center gap-1 ml-2">
              <Label className="text-[11px] text-muted-foreground mr-1">
                {t("imageStudio.stroke", undefined, "Border")}:
              </Label>
              <input
                type="color"
                value={shapeLayer.strokeColor || "#ffffff"}
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
                  onUpdateLayer(shapeLayer.id, { strokeWidth: isNaN(sw) ? 0 : sw });
                }}
                className="h-8 w-14 text-xs bg-background"
              />
            </div>
          </div>
        )}
      </div>

      {/* Right side: Universal transform & arrangement controls */}
      <div className="flex items-center gap-1.5 shrink-0">
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
            layer.isLocked ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "bg-background"
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
