import React from "react";
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Minus,
  Square,
  Circle,
  SunMedium,
  Moon,
  ArrowLeftRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolType, BrushSize } from "./types";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface ToolBarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  brushSize: BrushSize;
  onChangeBrushSize: (size: BrushSize) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function ToolBar({
  currentTool,
  onSelectTool,
  brushSize,
  onChangeBrushSize,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ToolBarProps) {
  const { t } = useTranslation();

  const tools: { id: ToolType; icon: React.ReactNode; label: string; shortcut: string }[] = [
    {
      id: "pencil",
      icon: <Pencil className="w-4 h-4" />,
      label: t("pixelArtStudio.pencil", undefined, "Pencil"),
      shortcut: "B",
    },
    {
      id: "eraser",
      icon: <Eraser className="w-4 h-4" />,
      label: t("pixelArtStudio.eraser", undefined, "Eraser"),
      shortcut: "E",
    },
    {
      id: "bucket",
      icon: <PaintBucket className="w-4 h-4" />,
      label: t("pixelArtStudio.bucket", undefined, "Paint Bucket"),
      shortcut: "G",
    },
    {
      id: "eyedropper",
      icon: <Pipette className="w-4 h-4" />,
      label: t("pixelArtStudio.eyedropper", undefined, "Eyedropper"),
      shortcut: "I",
    },
    {
      id: "line",
      icon: <Minus className="w-4 h-4" />,
      label: t("pixelArtStudio.line", undefined, "Line"),
      shortcut: "L",
    },
    {
      id: "rectangle",
      icon: <Square className="w-4 h-4" />,
      label: t("pixelArtStudio.rectangle", undefined, "Rectangle"),
      shortcut: "R",
    },
    {
      id: "circle",
      icon: <Circle className="w-4 h-4" />,
      label: t("pixelArtStudio.circle", undefined, "Circle"),
      shortcut: "C",
    },
    {
      id: "lighten",
      icon: <SunMedium className="w-4 h-4" />,
      label: t("pixelArtStudio.lighten", undefined, "Lighten / Shade"),
      shortcut: "U",
    },
    {
      id: "darken",
      icon: <Moon className="w-4 h-4" />,
      label: t("pixelArtStudio.darken", undefined, "Darken / Shade"),
      shortcut: "D",
    },
    {
      id: "colorSwap",
      icon: <ArrowLeftRight className="w-4 h-4" />,
      label: t("pixelArtStudio.colorSwap", undefined, "Color Swap"),
      shortcut: "S",
    },
  ];

  return (
    <div className="flex flex-col gap-3 p-2 bg-card/70 backdrop-blur-md rounded-xl border border-border shadow-sm">
      {/* Drawing Tools Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((item) => {
          const isActive = currentTool === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "w-9 h-9 relative transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => onSelectTool(item.id)}
                >
                  {item.icon}
                  <span className="sr-only">{item.label}</span>
                  <span className="absolute bottom-0.5 right-1 text-[8px] font-mono opacity-60">
                    {item.shortcut}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs flex items-center gap-1.5">
                <span>{item.label}</span>
                <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">
                  {item.shortcut}
                </kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="h-px bg-border my-0.5" />

      {/* Brush Size Selector */}
      <div className="flex flex-col gap-1 items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("pixelArtStudio.brushSize", undefined, "Size")}
        </span>
        <div className="flex gap-1">
          {([1, 2, 3, 4] as BrushSize[]).map((size) => (
            <Button
              key={size}
              variant={brushSize === size ? "default" : "outline"}
              size="icon"
              className="w-6 h-6 text-[10px] p-0 font-mono"
              onClick={() => onChangeBrushSize(size)}
            >
              {size}
            </Button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border my-0.5" />

      {/* Zoom Controls */}
      <div className="flex flex-col gap-1 items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={onZoomIn}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("pixelArtStudio.zoomIn", undefined, "Zoom In")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={onZoomOut}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("pixelArtStudio.zoomOut", undefined, "Zoom Out")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={onResetZoom}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("pixelArtStudio.resetZoom", undefined, "Reset View")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
