import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  CanvasProject,
  CanvasLayer,
  ImageLayer,
  TextLayer,
} from "./types";
import { drawBackground, drawLayer } from "./canvasUtils";

interface CanvasStageProps {
  project: CanvasProject;
  zoom: number;
  pan: { x: number; y: number };
  onUpdateLayer: (id: string, updates: Partial<CanvasLayer>) => void;
  onSelectLayer: (id: string | null) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onMatchCanvasToImage?: (imgWidth: number, imgHeight: number) => void;
}

type DragMode =
  | "none"
  | "move"
  | "resize-nw"
  | "resize-n"
  | "resize-ne"
  | "resize-e"
  | "resize-se"
  | "resize-s"
  | "resize-sw"
  | "resize-w"
  | "rotate"
  | "pan";

export const CanvasStage: React.FC<CanvasStageProps> = ({
  project,
  zoom,
  pan,
  onUpdateLayer,
  onSelectLayer,
  onPanChange,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [layerStart, setLayerStart] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }>({ x: 0, y: 0, width: 0, height: 0, rotation: 0 });

  const [snapGuides, setSnapGuides] = useState<{
    x?: number;
    y?: number;
  }>({});

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [, setRerenderTrigger] = useState(0);

  const selectedLayer = project.layers.find(
    (l) => l.id === project.selectedLayerId,
  );

  // Render main canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Adjust canvas resolution for crisp HiDPI rendering
    canvas.width = project.width;
    canvas.height = project.height;

    // Draw background
    drawBackground(ctx, project.width, project.height, project.background, true);

    // Draw all layers in bottom-to-top order
    project.layers.forEach((layer) => {
      if (layer.id === project.selectedLayerId && isEditingText) return;

      drawLayer(ctx, layer, () => {
        // Trigger re-render once an image has loaded
        setRerenderTrigger((prev) => prev + 1);
      });
    });
  }, [project, isEditingText]);

  useEffect(() => {
    render();
  }, [render]);

  // Spacebar tracking for Pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !isSpacePressed &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacePressed]);

  // Mouse coordinate converter from client to canvas project space
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;
      return { x, y };
    },
    [zoom],
  );

  // Handle Wheel Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.1, Math.min(4.0, zoom * factor));
      onZoomChange(newZoom);
    } else {
      // Pan
      onPanChange({
        x: pan.x - e.deltaX,
        y: pan.y - e.deltaY,
      });
    }
  };

  // Start drag / click
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
      return;
    }

    // If middle click or space pressed, start panning
    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      setDragMode("pan");
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return; // Only left-click handles layers

    const coords = getCanvasCoords(e.clientX, e.clientY);

    // If clicking on resize or rotate handles, handleMouseDownOnHandle catches it
    // Check if clicking inside any layer (from top to bottom)
    const reversedLayers = [...project.layers].reverse();
    const hitLayer = reversedLayers.find((layer) => {
      if (!layer.isVisible) return false;
      return (
        coords.x >= layer.x &&
        coords.x <= layer.x + layer.width &&
        coords.y >= layer.y &&
        coords.y <= layer.y + layer.height
      );
    });

    if (hitLayer) {
      if (hitLayer.id !== project.selectedLayerId) {
        setIsEditingText(false);
      }
      onSelectLayer(hitLayer.id);
      if (!hitLayer.isLocked) {
        setDragMode("move");
        setDragStart({ x: coords.x, y: coords.y });
        setLayerStart({
          x: hitLayer.x,
          y: hitLayer.y,
          width: hitLayer.width,
          height: hitLayer.height,
          rotation: hitLayer.rotation,
        });
      }
    } else {
      // Clicked on empty canvas / background
      setIsEditingText(false);
      onSelectLayer(null);
    }
  };

  const handleHandleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
    e.stopPropagation();
    if (!selectedLayer || selectedLayer.isLocked) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    setDragMode(mode);
    setDragStart({ x: coords.x, y: coords.y });
    setLayerStart({
      x: selectedLayer.x,
      y: selectedLayer.y,
      width: selectedLayer.width,
      height: selectedLayer.height,
      rotation: selectedLayer.rotation,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragMode === "none") return;

    if (dragMode === "pan") {
      onPanChange({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    if (!selectedLayer || selectedLayer.isLocked) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const dx = coords.x - dragStart.x;
    const dy = coords.y - dragStart.y;

    if (dragMode === "move") {
      let nextX = layerStart.x + dx;
      let nextY = layerStart.y + dy;

      // Smart snapping to canvas center
      const SNAP_THRESHOLD = 8;
      const guides: { x?: number; y?: number } = {};

      const centerX = project.width / 2;
      const centerY = project.height / 2;
      const layerCenterX = nextX + selectedLayer.width / 2;
      const layerCenterY = nextY + selectedLayer.height / 2;

      if (Math.abs(layerCenterX - centerX) < SNAP_THRESHOLD) {
        nextX = centerX - selectedLayer.width / 2;
        guides.x = centerX;
      }
      if (Math.abs(layerCenterY - centerY) < SNAP_THRESHOLD) {
        nextY = centerY - selectedLayer.height / 2;
        guides.y = centerY;
      }

      setSnapGuides(guides);
      onUpdateLayer(selectedLayer.id, { x: Math.round(nextX), y: Math.round(nextY) });
      return;
    }

    if (dragMode === "rotate") {
      const centerX = layerStart.x + layerStart.width / 2;
      const centerY = layerStart.y + layerStart.height / 2;
      const angleRad = Math.atan2(coords.y - centerY, coords.x - centerX);
      let angleDeg = (angleRad * 180) / Math.PI + 90;
      if (angleDeg < 0) angleDeg += 360;

      // Snap to 0, 45, 90, 180, 270 if close
      if (Math.abs(angleDeg - 0) < 4 || Math.abs(angleDeg - 360) < 4) angleDeg = 0;
      else if (Math.abs(angleDeg - 90) < 4) angleDeg = 90;
      else if (Math.abs(angleDeg - 180) < 4) angleDeg = 180;
      else if (Math.abs(angleDeg - 270) < 4) angleDeg = 270;

      onUpdateLayer(selectedLayer.id, { rotation: Math.round(angleDeg) });
      return;
    }

    // Resizing handles
    let { x, y, width, height } = layerStart;
    const isShiftPressed = e.shiftKey || selectedLayer.type === "image";
    const aspectRatio = layerStart.width / Math.max(1, layerStart.height);

    if (dragMode === "resize-se") {
      width = Math.max(20, layerStart.width + dx);
      height = isShiftPressed ? width / aspectRatio : Math.max(20, layerStart.height + dy);
    } else if (dragMode === "resize-sw") {
      const newWidth = Math.max(20, layerStart.width - dx);
      x = layerStart.x + (layerStart.width - newWidth);
      width = newWidth;
      height = isShiftPressed ? width / aspectRatio : Math.max(20, layerStart.height + dy);
    } else if (dragMode === "resize-ne") {
      width = Math.max(20, layerStart.width + dx);
      const newHeight = isShiftPressed ? width / aspectRatio : Math.max(20, layerStart.height - dy);
      y = layerStart.y + (layerStart.height - newHeight);
      height = newHeight;
    } else if (dragMode === "resize-nw") {
      const newWidth = Math.max(20, layerStart.width - dx);
      x = layerStart.x + (layerStart.width - newWidth);
      width = newWidth;
      const newHeight = isShiftPressed ? width / aspectRatio : Math.max(20, layerStart.height - dy);
      y = layerStart.y + (layerStart.height - newHeight);
      height = newHeight;
    } else if (dragMode === "resize-e") {
      width = Math.max(20, layerStart.width + dx);
    } else if (dragMode === "resize-w") {
      const newWidth = Math.max(20, layerStart.width - dx);
      x = layerStart.x + (layerStart.width - newWidth);
      width = newWidth;
    } else if (dragMode === "resize-s") {
      height = Math.max(20, layerStart.height + dy);
    } else if (dragMode === "resize-n") {
      const newHeight = Math.max(20, layerStart.height - dy);
      y = layerStart.y + (layerStart.height - newHeight);
      height = newHeight;
    }

    onUpdateLayer(selectedLayer.id, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  };

  const handleMouseUp = () => {
    setDragMode("none");
    setSnapGuides({});
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (selectedLayer?.type === "text" && !selectedLayer.isLocked) {
      setIsEditingText(true);
    }
  };

  // Cursor style
  let cursorClass = "cursor-default";
  if (isSpacePressed || dragMode === "pan") {
    cursorClass = dragMode === "pan" ? "cursor-grabbing" : "cursor-grab";
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none bg-slate-950/80 ${cursorClass}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Centered Canvas Container */}
      <div
        className="absolute transition-transform duration-75 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: project.width,
          height: project.height,
        }}
      >
        {/* Render Canvas */}
        <canvas
          ref={canvasRef}
          width={project.width}
          height={project.height}
          className="shadow-2xl rounded-sm ring-1 ring-white/10"
          style={{
            width: project.width,
            height: project.height,
          }}
        />

        {/* Snapping Guide Lines */}
        {snapGuides.x !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-cyan-400 pointer-events-none z-30"
            style={{ left: snapGuides.x }}
          />
        )}
        {snapGuides.y !== undefined && (
          <div
            className="absolute left-0 right-0 h-[1px] bg-cyan-400 pointer-events-none z-30"
            style={{ top: snapGuides.y }}
          />
        )}

        {/* Selected Layer Bounding Box & Handles */}
        {selectedLayer && selectedLayer.isVisible && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: selectedLayer.x,
              top: selectedLayer.y,
              width: selectedLayer.width,
              height: selectedLayer.height,
              transform: `rotate(${selectedLayer.rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            {/* Outline Box */}
            <div
              className={`absolute inset-0 border-2 ${
                selectedLayer.isLocked
                  ? "border-amber-500/80 border-dashed"
                  : isEditingText
                    ? "border-transparent"
                    : "border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
              }`}
            />

            {selectedLayer.type === "text" && isEditingText && (
              <div
                className="absolute inset-0 pointer-events-auto bg-transparent outline-none overflow-hidden"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: (selectedLayer as TextLayer).textAlign === "center" ? "center" : (selectedLayer as TextLayer).textAlign === "right" ? "flex-end" : "flex-start",
                }}
              >
                <textarea
                  className="bg-transparent outline-none resize-none overflow-hidden m-0 p-0 whitespace-pre"
                  style={{
                    fontFamily: (selectedLayer as TextLayer).fontFamily || "sans-serif",
                    fontSize: `${(selectedLayer as TextLayer).fontSize}px`,
                    fontWeight: (selectedLayer as TextLayer).fontWeight || "normal",
                    fontStyle: (selectedLayer as TextLayer).fontStyle || "normal",
                    color: (selectedLayer as TextLayer).color || "#ffffff",
                    textAlign: (selectedLayer as TextLayer).textAlign || "left",
                    lineHeight: (selectedLayer as TextLayer).lineHeight || 1.2,
                    letterSpacing: `${(selectedLayer as TextLayer).letterSpacing || 0}px`,
                    textDecoration: (selectedLayer as TextLayer).underline ? "underline" : "none",
                    WebkitTextStroke: (selectedLayer as TextLayer).strokeWidth && (selectedLayer as TextLayer).strokeColor
                      ? `${(selectedLayer as TextLayer).strokeWidth}px ${(selectedLayer as TextLayer).strokeColor}`
                      : undefined,
                    textShadow: (selectedLayer as TextLayer).shadowColor && (selectedLayer as TextLayer).shadowBlur
                      ? `${(selectedLayer as TextLayer).shadowOffsetX || 0}px ${(selectedLayer as TextLayer).shadowOffsetY || 0}px ${(selectedLayer as TextLayer).shadowBlur}px ${(selectedLayer as TextLayer).shadowColor}`
                      : undefined,
                    opacity: selectedLayer.opacity ?? 1,
                    width: "100%",
                    height: "100%",
                  }}
                  value={(selectedLayer as TextLayer).text}
                  onChange={(e) => onUpdateLayer(selectedLayer.id, { text: e.target.value })}
                  onBlur={() => setIsEditingText(false)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            )}

            {!selectedLayer.isLocked && !isEditingText && (
              <>
                {/* Rotation Handle Line and Dot */}
                <div
                  className="absolute left-1/2 -top-6 w-[2px] h-6 bg-cyan-400 -translate-x-1/2 pointer-events-none"
                />
                <div
                  title="Rotate"
                  className="absolute left-1/2 -top-8 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-cyan-500 cursor-alias pointer-events-auto hover:scale-125 transition-transform"
                  onMouseDown={(e) => handleHandleMouseDown(e, "rotate")}
                />

                {/* 8 Resize Handles */}
                {/* NW */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-nw")}
                />
                {/* N */}
                <div
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-n")}
                />
                {/* NE */}
                <div
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-ne")}
                />
                {/* E */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-e")}
                />
                {/* SE */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-se")}
                />
                {/* S */}
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-s")}
                />
                {/* SW */}
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-sw")}
                />
                {/* W */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-cyan-500 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125"
                  onMouseDown={(e) => handleHandleMouseDown(e, "resize-w")}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
