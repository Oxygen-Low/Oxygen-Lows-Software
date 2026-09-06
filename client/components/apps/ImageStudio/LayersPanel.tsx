import React from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Type,
  Square,
  Layers,
} from "lucide-react";
import { CanvasLayer } from "./types";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/LanguageContext";

interface LayersPanelProps {
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayerUp: (id: string) => void;
  onMoveLayerDown: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveLayerUp,
  onMoveLayerDown,
  onDuplicateLayer,
  onDeleteLayer,
}) => {
  const { t } = useTranslation();

  const getLayerIcon = (layer: CanvasLayer) => {
    switch (layer.type) {
      case "image":
        return <ImageIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
      case "text":
        return <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case "shape":
        return <Square className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
  };

  // Render top z-index layer first
  const reversedLayers = [...layers].map((layer, index) => ({ layer, index })).reverse();

  return (
    <div className="space-y-3 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{t("imageStudio.layerStack", undefined, "Layers")}</span>
        <span className="font-mono text-[10px]">{layers.length}</span>
      </div>

      {layers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-border/50 rounded-lg p-3 bg-card/20">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">
            {t(
              "imageStudio.noLayersYet",
              undefined,
              "No layers on canvas yet. Add images, text, or shapes from the tools on the left!",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {reversedLayers.map(({ layer, index }) => {
            const isSelected = layer.id === selectedLayerId;
            const isTop = index === layers.length - 1;
            const isBottom = index === 0;

            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`flex items-center gap-1.5 p-2 rounded-lg border transition-all cursor-pointer group ${
                  isSelected
                    ? "bg-primary/15 border-primary/60 shadow-sm"
                    : "bg-card/60 hover:bg-accent border-border/70 text-foreground"
                }`}
              >
                {/* Icon */}
                {getLayerIcon(layer)}

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs truncate font-medium ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {layer.name}
                  </p>
                </div>

                {/* Layer Quick Actions */}
                <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                  {/* Move Up */}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isTop}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayerUp(layer.id);
                    }}
                    title={t("imageStudio.moveUp", undefined, "Bring forward")}
                    className="h-6 w-6 p-0 hover:bg-background disabled:opacity-20"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </Button>

                  {/* Move Down */}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isBottom}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayerDown(layer.id);
                    }}
                    title={t("imageStudio.moveDown", undefined, "Send backward")}
                    className="h-6 w-6 p-0 hover:bg-background disabled:opacity-20"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </Button>

                  {/* Visibility */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                    title={
                      layer.isVisible
                        ? t("imageStudio.hide", undefined, "Hide layer")
                        : t("imageStudio.show", undefined, "Show layer")
                    }
                    className="h-6 w-6 p-0 hover:bg-background text-muted-foreground hover:text-foreground"
                  >
                    {layer.isVisible ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-rose-400" />
                    )}
                  </Button>

                  {/* Lock */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(layer.id);
                    }}
                    title={
                      layer.isLocked
                        ? t("imageStudio.unlock", undefined, "Unlock layer")
                        : t("imageStudio.lock", undefined, "Lock layer")
                    }
                    className="h-6 w-6 p-0 hover:bg-background text-muted-foreground hover:text-foreground"
                  >
                    {layer.isLocked ? (
                      <Lock className="w-3 h-3 text-amber-400" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                  </Button>

                  {/* Duplicate */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateLayer(layer.id);
                    }}
                    title={t("imageStudio.duplicate", undefined, "Duplicate")}
                    className="h-6 w-6 p-0 hover:bg-background text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    title={t("imageStudio.delete", undefined, "Delete")}
                    className="h-6 w-6 p-0 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
