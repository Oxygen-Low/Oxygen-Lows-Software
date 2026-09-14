import React from "react";
import {
  Layers,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PixelLayer } from "./types";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface LayersPanelProps {
  layers: PixelLayer[];
  activeLayerId: string;
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onChangeOpacity: (layerId: string, opacity: number) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down") => void;
  onMergeDown: (layerId: string) => void;
}

export function LayersPanel({
  layers,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onToggleVisibility,
  onChangeOpacity,
  onMoveLayer,
  onMergeDown,
}: LayersPanelProps) {
  const { t } = useTranslation();

  // In standard art apps, top layer in the stack is drawn on top (last index in array)
  // We display layers from top (last index) to bottom (0 index)
  const reversedLayers = [...layers].map((layer, index) => ({ layer, index })).reverse();
  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0];
  const activeIndex = layers.findIndex((l) => l.id === activeLayerId);

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-card/70 backdrop-blur-md rounded-xl border border-border shadow-sm w-56">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" />
          <span>{t("pixelArtStudio.layers", undefined, "Layers")}</span>
        </span>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={onAddLayer}
                aria-label="Add Layer"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t("pixelArtStudio.addLayer", undefined, "Add Layer")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={() => onDuplicateLayer(activeLayerId)}
                aria-label="Duplicate Layer"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t("pixelArtStudio.duplicateLayer", undefined, "Duplicate Layer")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-destructive"
                disabled={layers.length <= 1}
                onClick={() => onDeleteLayer(activeLayerId)}
                aria-label="Delete Layer"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t("pixelArtStudio.deleteLayer", undefined, "Delete Layer")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Layer Opacity Slider */}
      {activeLayer && (
        <div className="space-y-1 px-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t("pixelArtStudio.opacity", undefined, "Opacity")}</span>
            <span>{Math.round(activeLayer.opacity * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(activeLayer.opacity * 100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={(val) => onChangeOpacity(activeLayer.id, val[0] / 100)}
            className="h-3"
          />
        </div>
      )}

      {/* Layer List */}
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
        {reversedLayers.map(({ layer, index }) => {
          const isActive = layer.id === activeLayerId;
          const isBottom = index === 0;
          return (
            <div
              key={layer.id}
              className={cn(
                "flex items-center justify-between p-1.5 rounded-lg border text-xs cursor-pointer transition-all",
                isActive
                  ? "bg-accent/80 border-primary/40 font-medium"
                  : "bg-background/40 border-border/60 hover:bg-muted/40"
              )}
              onClick={() => onSelectLayer(layer.id)}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-5 h-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground/50" />
                  )}
                </Button>
                <span className={cn("truncate text-[11px]", !layer.visible && "line-through opacity-50")}>
                  {layer.name}
                </span>
              </div>

              {/* Layer Actions when active */}
              {isActive && (
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-5 h-5 p-0"
                    disabled={index === layers.length - 1}
                    onClick={() => onMoveLayer(layer.id, "up")}
                    title={t("pixelArtStudio.moveUp", undefined, "Move Up")}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-5 h-5 p-0"
                    disabled={index === 0}
                    onClick={() => onMoveLayer(layer.id, "down")}
                    title={t("pixelArtStudio.moveDown", undefined, "Move Down")}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  {!isBottom && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-5 h-5 p-0"
                      onClick={() => onMergeDown(layer.id)}
                      title={t("pixelArtStudio.mergeDown", undefined, "Merge Down")}
                    >
                      <ArrowDownToLine className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
