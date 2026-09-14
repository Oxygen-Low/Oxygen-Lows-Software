import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PixelFrame } from "./types";
import { renderFrameToCanvas } from "./canvasUtils";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface TimelineBarProps {
  frames: PixelFrame[];
  activeFrameIndex: number;
  width: number;
  height: number;
  fps: number;
  onionSkin: boolean;
  onToggleOnionSkin: () => void;
  onChangeFps: (fps: number) => void;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: (index: number) => void;
  onDeleteFrame: (index: number) => void;
  onMoveFrame: (index: number, direction: "left" | "right") => void;
}

export function TimelineBar({
  frames,
  activeFrameIndex,
  width,
  height,
  fps,
  onionSkin,
  onToggleOnionSkin,
  onChangeFps,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onMoveFrame,
}: TimelineBarProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef(activeFrameIndex);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const interval = 1000 / (fps || 8);
    const timer = setInterval(() => {
      playheadRef.current = (playheadRef.current + 1) % frames.length;
      const targetFrame = frames[playheadRef.current];
      if (previewCanvasRef.current && targetFrame) {
        const rendered = renderFrameToCanvas(targetFrame, width, height, 2);
        const ctx = previewCanvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(rendered, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
        }
      }
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, frames, fps, width, height]);

  // Update preview canvas when stopped or active frame changes
  useEffect(() => {
    if (isPlaying) return;
    const currentFrame = frames[activeFrameIndex] || frames[0];
    if (previewCanvasRef.current && currentFrame) {
      const rendered = renderFrameToCanvas(currentFrame, width, height, 2);
      const ctx = previewCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(rendered, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
      }
    }
  }, [activeFrameIndex, frames, isPlaying, width, height]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card/75 backdrop-blur-md rounded-xl border border-border shadow-sm w-full">
      {/* Playback Controls & Mini-Player */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={isPlaying ? "default" : "outline"}
          size="icon"
          className="w-8 h-8 rounded-full shadow-xs"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </Button>

        {/* Mini Preview Box */}
        <div className="relative w-10 h-10 rounded-md border border-border bg-background/80 overflow-hidden flex items-center justify-center">
          <canvas
            ref={previewCanvasRef}
            width={40}
            height={40}
            className="w-full h-full object-contain [image-rendering:pixelated]"
          />
        </div>

        {/* FPS Slider */}
        <div className="flex flex-col gap-0.5 w-20">
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>FPS</span>
            <span>{fps}</span>
          </div>
          <Slider
            value={[fps]}
            min={1}
            max={24}
            step={1}
            onValueChange={(val) => onChangeFps(val[0])}
            className="h-2"
          />
        </div>

        {/* Onion Skin Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={onionSkin ? "default" : "outline"}
              size="icon"
              className={cn("w-8 h-8", onionSkin && "ring-2 ring-primary/30")}
              onClick={onToggleOnionSkin}
            >
              <Layers className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t("pixelArtStudio.onionSkin", undefined, "Toggle Onion Skinning (ghost previous frame)")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="w-px h-8 bg-border shrink-0" />

      {/* Frame Strip */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 flex-1 scrollbar-thin">
        {frames.map((frame, index) => {
          const isActive = index === activeFrameIndex;
          return (
            <div
              key={frame.id}
              className={cn(
                "group relative flex flex-col items-center gap-1 p-1 rounded-lg border cursor-pointer shrink-0 transition-all",
                isActive
                  ? "bg-accent border-primary ring-2 ring-primary/40 shadow-xs"
                  : "bg-background/60 border-border/70 hover:bg-muted/50"
              )}
              onClick={() => {
                setIsPlaying(false);
                onSelectFrame(index);
              }}
            >
              <span className="text-[9px] font-mono text-muted-foreground">
                #{index + 1}
              </span>
              <FrameThumbnail
                frame={frame}
                width={width}
                height={height}
              />

              {/* Hover actions */}
              {isActive && (
                <div
                  className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-full p-0.5 shadow-md z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="p-1 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => onMoveFrame(index, "left")}
                    title={t("pixelArtStudio.moveLeft", undefined, "Move Left")}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:text-primary transition-colors disabled:opacity-30"
                    disabled={index === frames.length - 1}
                    onClick={() => onMoveFrame(index, "right")}
                    title={t("pixelArtStudio.moveRight", undefined, "Move Right")}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:text-destructive transition-colors disabled:opacity-30"
                    disabled={frames.length <= 1}
                    onClick={() => onDeleteFrame(index)}
                    title={t("common.delete", undefined, "Delete")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add / Duplicate Frame Buttons */}
        <div className="flex items-center gap-1 shrink-0 pl-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="w-8 h-8 rounded-lg"
                onClick={onAddFrame}
                aria-label="Add New Frame"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t("pixelArtStudio.addFrame", undefined, "Add New Frame")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="w-8 h-8 rounded-lg"
                onClick={() => onDuplicateFrame(activeFrameIndex)}
                aria-label="Duplicate Active Frame"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t("pixelArtStudio.duplicateFrame", undefined, "Duplicate Active Frame")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function FrameThumbnail({
  frame,
  width,
  height,
}: {
  frame: PixelFrame;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = renderFrameToCanvas(frame, width, height, 1);
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 36, 36);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, 36, 36);
    }
  }, [frame, width, height]);

  return (
    <div className="w-9 h-9 rounded bg-background/50 border border-border/60 overflow-hidden flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={36}
        height={36}
        className="w-full h-full object-contain [image-rendering:pixelated]"
      />
    </div>
  );
}
