/**
 * ViewportCanvas.tsx
 * Responsive HTML5 Canvas container for 3D room rendering.
 * Hosts ThreeEngine, forwards pointer & keyboard events, binds ResizeObserver,
 * and renders viewport HUD overlays (navigation mode toggle, bookmarks bar, grid/axes toggles).
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { RoomDocument, CameraBookmark } from "@/types/threeDBackground";
import { GraphicsPreset } from "@/services/3d/environment/GraphicsPresets";
import { ThreeEngine } from "../studio3d/engine/ThreeEngine";
import { NavigationMode } from "../studio3d/engine/CameraController";
import { cn } from "@/lib/utils";
import {
  Compass,
  Eye,
  Grid,
  Maximize2,
  Minimize2,
  Navigation,
  Sparkles,
} from "lucide-react";

export interface ViewportCanvasProps {
  className?: string;
  room?: RoomDocument;
  graphicsPreset?: GraphicsPreset;
  onEngineReady?: (engine: ThreeEngine) => void;
  onObjectSelected?: (objectId: string | null) => void;
  showOverlayControls?: boolean;
  showBookmarksBar?: boolean;
}

export const ViewportCanvas: React.FC<ViewportCanvasProps> = ({
  className,
  room,
  graphicsPreset = "high",
  onEngineReady,
  onObjectSelected,
  showOverlayControls = true,
  showBookmarksBar = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ThreeEngine | null>(null);

  // Viewport Overlay State
  const [navMode, setNavMode] = useState<NavigationMode>("orbit");
  const [gridVisible, setGridVisible] = useState(true);
  const [axesVisible, setAxesVisible] = useState(true);
  const [activeBookmarkIndex, setActiveBookmarkIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevRoomIdRef = useRef<string | null>(room?.id || null);

  // 1. Initialize Engine on Mount
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const engine = new ThreeEngine({
      canvas: canvasRef.current,
      container: containerRef.current,
      initialRoom: room,
      graphicsPreset,
      onObjectSelected: (id) => onObjectSelected?.(id),
    });

    engineRef.current = engine;
    onEngineReady?.(engine);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // 2. Synchronize Room Changes (only when room.id changes, avoiding scene reload loop on object/environment edits)
  useEffect(() => {
    if (engineRef.current && room && room.id !== prevRoomIdRef.current) {
      prevRoomIdRef.current = room.id;
      engineRef.current.loadRoom(room);
      setActiveBookmarkIndex(room.activeBookmarkIndex || 0);
    }
  }, [room?.id]);

  // 3. Synchronize Graphics Preset Changes
  useEffect(() => {
    if (engineRef.current && graphicsPreset) {
      engineRef.current.setGraphicsPreset(graphicsPreset);
    }
  }, [graphicsPreset]);

  // 4. Pointer Interaction & Object Picking
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !engineRef.current) return;

    // Convert client coordinates to Normalized Device Coordinates (NDC: -1 to +1)
    const rect = canvasRef.current.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    // Pick object on left click in orbit mode if gizmo is not dragging
    if (e.button === 0 && engineRef.current.cameraController.getNavigationMode() === "orbit") {
      const pickedId = engineRef.current.pickObject(ndcX, ndcY);
      engineRef.current.selectObject(pickedId);
    }
  }, []);

  // 5. Toggle Navigation Mode
  const toggleNavMode = useCallback(() => {
    if (!engineRef.current) return;
    const nextMode: NavigationMode = navMode === "orbit" ? "fly" : "orbit";
    engineRef.current.cameraController.setNavigationMode(nextMode);
    setNavMode(nextMode);
  }, [navMode]);

  // 6. Toggle Grid
  const toggleGrid = useCallback(() => {
    if (!engineRef.current) return;
    const next = !gridVisible;
    engineRef.current.cameraController.setGridVisible(next);
    setGridVisible(next);
  }, [gridVisible]);

  // 7. Toggle Axes
  const toggleAxes = useCallback(() => {
    if (!engineRef.current) return;
    const next = !axesVisible;
    engineRef.current.cameraController.setAxesVisible(next);
    setAxesVisible(next);
  }, [axesVisible]);

  // 8. Bookmark Selection with Hermite Transition
  const handleSelectBookmark = useCallback((bm: CameraBookmark, index: number) => {
    if (!engineRef.current) return;
    setActiveBookmarkIndex(index);
    engineRef.current.cameraController.transitionToBookmark(bm, 1.2);
  }, []);

  // 9. Fullscreen Toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const bookmarks = room?.cameraBookmarks || [];

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full min-h-[400px] overflow-hidden bg-slate-950 select-none",
        className
      )}
    >
      {/* HTML5 WebGL Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        className="w-full h-full block outline-none touch-none cursor-grab active:cursor-grabbing"
        tabIndex={0}
      />

      {/* Viewport Top Control Badges */}
      {showOverlayControls && (
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
          <button
            type="button"
            onClick={toggleNavMode}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all shadow-md backdrop-blur-md border",
              navMode === "orbit"
                ? "bg-slate-900/80 border-slate-700 text-cyan-400 hover:bg-slate-800"
                : "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30"
            )}
            title="Switch Navigation Mode (Orbit: Look Around / Fly: WASD Keys)"
          >
            {navMode === "orbit" ? <Compass className="w-3.5 h-3.5" /> : <Navigation className="w-3.5 h-3.5" />}
            <span className="capitalize">{navMode} Mode</span>
          </button>

          <button
            type="button"
            onClick={toggleGrid}
            className={cn(
              "p-1.5 rounded-md text-xs transition-all shadow-md backdrop-blur-md border",
              gridVisible
                ? "bg-slate-900/80 border-slate-700 text-slate-200"
                : "bg-slate-900/40 border-slate-800 text-slate-500"
            )}
            title="Toggle Grid Display"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleAxes}
            className={cn(
              "p-1.5 rounded-md text-xs transition-all shadow-md backdrop-blur-md border",
              axesVisible
                ? "bg-slate-900/80 border-slate-700 text-emerald-400"
                : "bg-slate-900/40 border-slate-800 text-slate-500"
            )}
            title="Toggle Coordinate Axes Display"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fullscreen & Quality Preset Indicator */}
      {showOverlayControls && (
        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          <div className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase bg-slate-900/70 border border-slate-800 text-slate-400 backdrop-blur-md">
            {graphicsPreset}
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white transition-all shadow-md backdrop-blur-md"
            title="Toggle Fullscreen Viewport"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Viewpoint Bookmarks Bar */}
      {showBookmarksBar && bookmarks.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-lg">
          <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Bookmarks:
          </span>
          {bookmarks.map((bm, idx) => (
            <button
              key={bm.id || idx}
              type="button"
              onClick={() => handleSelectBookmark(bm, idx)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs transition-all font-medium",
                activeBookmarkIndex === idx
                  ? "bg-cyan-500 text-white shadow-sm font-semibold"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
              )}
            >
              {bm.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ViewportCanvas;
