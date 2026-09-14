import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PixelArtProject,
  PixelFrame,
  PixelLayer,
  ToolType,
  BrushSize,
  HistoryStep,
} from "./types";
import {
  createBlankFrame,
  createBlankLayer,
  getIndex,
  getCoords,
  bresenhamLine,
  getCirclePixels,
  getRectanglePixels,
  floodFill,
  adjustColorLightness,
  colorSwap,
  renderFrameToCanvas,
} from "./canvasUtils";
import {
  DEFAULT_PALETTE,
  extractPaletteFromPixels,
} from "./palettePresets";
import { TopBar } from "./TopBar";
import { ToolBar } from "./ToolBar";
import { ColorPanel } from "./ColorPanel";
import { LayersPanel } from "./LayersPanel";
import { TimelineBar } from "./TimelineBar";
import { ExportModal } from "./ExportModal";
import { NewCanvasModal } from "./NewCanvasModal";
import { ResizeModal } from "./ResizeModal";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const LOCAL_STORAGE_KEY = "oxygen_pixel_art_studio_project";
const MAX_HISTORY = 30;

export function PixelArtStudioApp() {
  const { t } = useTranslation();

  // Project state
  const [project, setProject] = useState<PixelArtProject>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.frames && parsed.frames.length > 0 && parsed.width && parsed.height) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load saved pixel project", e);
    }
    const defaultFrame = createBlankFrame("Frame 1", 32, 32);
    return {
      id: `proj-${Date.now()}`,
      name: "Pixel Art",
      width: 32,
      height: 32,
      fps: 8,
      frames: [defaultFrame],
      palette: [...DEFAULT_PALETTE],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  // Active indices
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const activeFrame = project.frames[activeFrameIndex] || project.frames[0];
  const [activeLayerId, setActiveLayerId] = useState<string>(() => activeFrame.layers[0]?.id || "layer-0");

  // Ensure activeLayerId is always valid
  useEffect(() => {
    if (!activeFrame.layers.some((l) => l.id === activeLayerId)) {
      if (activeFrame.layers.length > 0) {
        setActiveLayerId(activeFrame.layers[activeFrame.layers.length - 1].id);
      }
    }
  }, [activeFrame, activeLayerId]);

  // Editor Tools & Display States
  const [currentTool, setCurrentTool] = useState<ToolType>("pencil");
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [primaryColor, setPrimaryColor] = useState<string>("#000000");
  const [secondaryColor, setSecondaryColor] = useState<string>("#ffffff");
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [onionSkin, setOnionSkin] = useState<boolean>(false);

  // Zoom & Pan
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const isSpacePressedRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dialog modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isResizeOpen, setIsResizeOpen] = useState(false);

  // History (Undo / Redo)
  const [history, setHistory] = useState<HistoryStep[]>([
    {
      frames: JSON.parse(JSON.stringify(project.frames)),
      width: project.width,
      height: project.height,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [previewShapePoints, setPreviewShapePoints] = useState<{ x: number; y: number }[]>([]);

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Debounced auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project));
      } catch (e) {
        console.warn("Unable to save project to localStorage", e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [project]);

  // Record history step
  const pushHistory = useCallback(
    (newFrames: PixelFrame[], newWidth = project.width, newHeight = project.height) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const next = [
          ...sliced,
          {
            frames: JSON.parse(JSON.stringify(newFrames)),
            width: newWidth,
            height: newHeight,
          },
        ];
        if (next.length > MAX_HISTORY) {
          next.shift();
        }
        return next;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [historyIndex, project.width, project.height]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetStep = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setProject((prev) => ({
        ...prev,
        frames: JSON.parse(JSON.stringify(targetStep.frames)),
        width: targetStep.width,
        height: targetStep.height,
        updatedAt: Date.now(),
      }));
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetStep = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setProject((prev) => ({
        ...prev,
        frames: JSON.parse(JSON.stringify(targetStep.frames)),
        width: targetStep.width,
        height: targetStep.height,
        updatedAt: Date.now(),
      }));
    }
  }, [history, historyIndex]);

  // Helper to update active layer pixels
  const updateActiveLayerPixels = (updater: (pixels: string[]) => string[]) => {
    setProject((prev) => {
      const newFrames = prev.frames.map((frame, fIdx) => {
        if (fIdx !== activeFrameIndex) return frame;
        const newLayers = frame.layers.map((layer) => {
          if (layer.id !== activeLayerId) return layer;
          return {
            ...layer,
            pixels: updater(layer.pixels),
          };
        });
        return { ...frame, layers: newLayers };
      });
      return { ...prev, frames: newFrames, updatedAt: Date.now() };
    });
  };

  // Convert brush size to offsets
  const getBrushOffsets = (size: BrushSize) => {
    if (size === 1) return [{ dx: 0, dy: 0 }];
    if (size === 2) {
      return [
        { dx: 0, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
      ];
    }
    if (size === 3) {
      return [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
      ];
    }
    return [
      { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 2, dy: -1 },
      { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },  { dx: 2, dy: 0 },
      { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },  { dx: 2, dy: 1 },
      { dx: -1, dy: 2 },  { dx: 0, dy: 2 },  { dx: 1, dy: 2 },  { dx: 2, dy: 2 },
    ];
  };

  // Apply brush dots to pixel array
  const applyDotsToPixels = (
    pixels: string[],
    points: { x: number; y: number }[],
    color: string,
    size: BrushSize
  ): string[] => {
    const newPixels = [...pixels];
    const offsets = getBrushOffsets(size);
    for (const pt of points) {
      for (const off of offsets) {
        const px = pt.x + off.dx;
        const py = pt.y + off.dy;
        if (px >= 0 && px < project.width && py >= 0 && py < project.height) {
          const idx = getIndex(px, py, project.width);
          newPixels[idx] = color;
        }
      }
    }
    return newPixels;
  };

  // Canvas coordinates calculation from mouse/pointer event
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    if (!displayCanvasRef.current) return null;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const pixelX = Math.floor((clientX / rect.width) * project.width);
    const pixelY = Math.floor((clientY / rect.height) * project.height);

    if (pixelX < 0 || pixelX >= project.width || pixelY < 0 || pixelY >= project.height) {
      return null;
    }
    return { x: pixelX, y: pixelY };
  };

  // Drawing pointer events
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Space or Middle Click panning
    if (isSpacePressedRef.current || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    if (e.button !== 0 && e.button !== 2) return;

    const coords = getCanvasCoords(e);
    if (!coords) return;

    const activeColor = e.button === 2 ? secondaryColor : primaryColor;
    isDrawingRef.current = true;
    lastPixelRef.current = coords;
    shapeStartRef.current = coords;

    const currentLayer = activeFrame.layers.find((l) => l.id === activeLayerId);
    if (!currentLayer) return;

    if (currentTool === "pencil") {
      updateActiveLayerPixels((pixels) =>
        applyDotsToPixels(pixels, [coords], activeColor, brushSize)
      );
    } else if (currentTool === "eraser") {
      updateActiveLayerPixels((pixels) =>
        applyDotsToPixels(pixels, [coords], "", brushSize)
      );
    } else if (currentTool === "bucket") {
      updateActiveLayerPixels((pixels) =>
        floodFill(pixels, project.width, project.height, coords.x, coords.y, activeColor)
      );
      pushHistory(project.frames);
      isDrawingRef.current = false;
    } else if (currentTool === "eyedropper") {
      // Pick color from composite layers
      const idx = getIndex(coords.x, coords.y, project.width);
      let pickedColor = "";
      for (let i = activeFrame.layers.length - 1; i >= 0; i--) {
        const l = activeFrame.layers[i];
        if (l.visible && l.pixels[idx]) {
          pickedColor = l.pixels[idx];
          break;
        }
      }
      if (pickedColor) {
        if (e.button === 2) {
          setSecondaryColor(pickedColor);
        } else {
          setPrimaryColor(pickedColor);
        }
      }
      isDrawingRef.current = false;
    } else if (currentTool === "lighten" || currentTool === "darken") {
      const idx = getIndex(coords.x, coords.y, project.width);
      const curColor = currentLayer.pixels[idx];
      if (curColor) {
        const adjusted = adjustColorLightness(
          curColor,
          currentTool === "lighten" ? 15 : -15
        );
        updateActiveLayerPixels((pixels) => {
          const np = [...pixels];
          np[idx] = adjusted;
          return np;
        });
      }
    } else if (currentTool === "colorSwap") {
      const idx = getIndex(coords.x, coords.y, project.width);
      const targetColor = currentLayer.pixels[idx];
      if (targetColor) {
        updateActiveLayerPixels((pixels) => colorSwap(pixels, targetColor, activeColor));
        pushHistory(project.frames);
      }
      isDrawingRef.current = false;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawingRef.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const activeColor = e.buttons === 2 ? secondaryColor : primaryColor;

    if (currentTool === "pencil") {
      const prev = lastPixelRef.current || coords;
      const linePoints = bresenhamLine(prev.x, prev.y, coords.x, coords.y);
      updateActiveLayerPixels((pixels) =>
        applyDotsToPixels(pixels, linePoints, activeColor, brushSize)
      );
      lastPixelRef.current = coords;
    } else if (currentTool === "eraser") {
      const prev = lastPixelRef.current || coords;
      const linePoints = bresenhamLine(prev.x, prev.y, coords.x, coords.y);
      updateActiveLayerPixels((pixels) =>
        applyDotsToPixels(pixels, linePoints, "", brushSize)
      );
      lastPixelRef.current = coords;
    } else if (currentTool === "line") {
      if (shapeStartRef.current) {
        const pts = bresenhamLine(shapeStartRef.current.x, shapeStartRef.current.y, coords.x, coords.y);
        setPreviewShapePoints(pts);
      }
    } else if (currentTool === "rectangle") {
      if (shapeStartRef.current) {
        const pts = getRectanglePixels(
          shapeStartRef.current.x,
          shapeStartRef.current.y,
          coords.x,
          coords.y,
          false
        );
        setPreviewShapePoints(pts);
      }
    } else if (currentTool === "circle") {
      if (shapeStartRef.current) {
        const dx = coords.x - shapeStartRef.current.x;
        const dy = coords.y - shapeStartRef.current.y;
        const radius = Math.round(Math.sqrt(dx * dx + dy * dy));
        const pts = getCirclePixels(shapeStartRef.current.x, shapeStartRef.current.y, radius, false);
        setPreviewShapePoints(pts);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const activeColor = e.button === 2 ? secondaryColor : primaryColor;

    if (
      (currentTool === "line" || currentTool === "rectangle" || currentTool === "circle") &&
      previewShapePoints.length > 0
    ) {
      updateActiveLayerPixels((pixels) =>
        applyDotsToPixels(pixels, previewShapePoints, activeColor, brushSize)
      );
      setPreviewShapePoints([]);
    }

    pushHistory(project.frames);
    lastPixelRef.current = null;
    shapeStartRef.current = null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        isSpacePressedRef.current = true;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key.toLowerCase() === "b") {
        setCurrentTool("pencil");
      } else if (e.key.toLowerCase() === "e") {
        setCurrentTool("eraser");
      } else if (e.key.toLowerCase() === "g") {
        setCurrentTool("bucket");
      } else if (e.key.toLowerCase() === "i") {
        setCurrentTool("eyedropper");
      } else if (e.key.toLowerCase() === "l") {
        setCurrentTool("line");
      } else if (e.key.toLowerCase() === "r") {
        setCurrentTool("rectangle");
      } else if (e.key.toLowerCase() === "c") {
        setCurrentTool("circle");
      } else if (e.key.toLowerCase() === "u") {
        setCurrentTool("lighten");
      } else if (e.key.toLowerCase() === "d") {
        setCurrentTool("darken");
      } else if (e.key.toLowerCase() === "s") {
        setCurrentTool("colorSwap");
      } else if (e.key.toLowerCase() === "x") {
        // Swap primary / secondary
        setPrimaryColor((p) => {
          setSecondaryColor(p);
          return secondaryColor;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleUndo, handleRedo, secondaryColor]);

  // Main canvas rendering effect
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // 1. Draw Onion Skinning if enabled and previous frame exists
    if (onionSkin && activeFrameIndex > 0) {
      const prevFrame = project.frames[activeFrameIndex - 1];
      if (prevFrame) {
        const prevCanvas = renderFrameToCanvas(prevFrame, project.width, project.height, 1);
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.drawImage(prevCanvas, 0, 0);
        ctx.restore();
      }
    }

    // 2. Draw current frame layers
    const currentCanvas = renderFrameToCanvas(activeFrame, project.width, project.height, 1);
    ctx.drawImage(currentCanvas, 0, 0);

    // 3. Draw live shape preview (for Line, Rect, Circle)
    if (previewShapePoints.length > 0) {
      ctx.fillStyle = primaryColor;
      for (const pt of previewShapePoints) {
        ctx.fillRect(pt.x, pt.y, 1, 1);
      }
    }
  }, [project, activeFrame, activeFrameIndex, onionSkin, previewShapePoints, primaryColor]);

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 10));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.2));
  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(z * 1.1, 10));
    } else {
      setZoom((z) => Math.max(z / 1.1, 0.2));
    }
  };

  // Layer Operations
  const handleAddLayer = () => {
    const newLayer = createBlankLayer(`Layer ${activeFrame.layers.length + 1}`, project.width, project.height);
    const newFrames = project.frames.map((frame, idx) => {
      if (idx !== activeFrameIndex) return frame;
      return { ...frame, layers: [...frame.layers, newLayer] };
    });
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveLayerId(newLayer.id);
    pushHistory(newFrames);
  };

  const handleDuplicateLayer = (layerId: string) => {
    const target = activeFrame.layers.find((l) => l.id === layerId);
    if (!target) return;
    const duplicated: PixelLayer = {
      ...target,
      id: `layer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${target.name} (Copy)`,
      pixels: [...target.pixels],
    };
    const newFrames = project.frames.map((frame, idx) => {
      if (idx !== activeFrameIndex) return frame;
      return { ...frame, layers: [...frame.layers, duplicated] };
    });
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveLayerId(duplicated.id);
    pushHistory(newFrames);
  };

  const handleDeleteLayer = (layerId: string) => {
    if (activeFrame.layers.length <= 1) return;
    const newLayers = activeFrame.layers.filter((l) => l.id !== layerId);
    const newFrames = project.frames.map((frame, idx) => {
      if (idx !== activeFrameIndex) return frame;
      return { ...frame, layers: newLayers };
    });
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveLayerId(newLayers[newLayers.length - 1].id);
    pushHistory(newFrames);
  };

  const handleToggleVisibility = (layerId: string) => {
    setProject((prev) => ({
      ...prev,
      frames: prev.frames.map((frame, idx) => {
        if (idx !== activeFrameIndex) return frame;
        return {
          ...frame,
          layers: frame.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
        };
      }),
    }));
  };

  const handleChangeOpacity = (layerId: string, opacity: number) => {
    setProject((prev) => ({
      ...prev,
      frames: prev.frames.map((frame, idx) => {
        if (idx !== activeFrameIndex) return frame;
        return {
          ...frame,
          layers: frame.layers.map((l) => (l.id === layerId ? { ...l, opacity } : l)),
        };
      }),
    }));
  };

  const handleMoveLayer = (layerId: string, direction: "up" | "down") => {
    const index = activeFrame.layers.findIndex((l) => l.id === layerId);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= activeFrame.layers.length) return;

    const newLayers = [...activeFrame.layers];
    const [removed] = newLayers.splice(index, 1);
    newLayers.splice(targetIndex, 0, removed);

    const newFrames = project.frames.map((frame, idx) => {
      if (idx !== activeFrameIndex) return frame;
      return { ...frame, layers: newLayers };
    });
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    pushHistory(newFrames);
  };

  const handleMergeDown = (layerId: string) => {
    const index = activeFrame.layers.findIndex((l) => l.id === layerId);
    if (index <= 0) return;

    const upper = activeFrame.layers[index];
    const lower = activeFrame.layers[index - 1];

    // Combine pixels
    const mergedPixels = [...lower.pixels];
    for (let i = 0; i < upper.pixels.length; i++) {
      if (upper.pixels[i]) {
        mergedPixels[i] = upper.pixels[i];
      }
    }

    const mergedLayer: PixelLayer = {
      ...lower,
      pixels: mergedPixels,
    };

    const newLayers = activeFrame.layers.filter((_, i) => i !== index && i !== index - 1);
    newLayers.splice(index - 1, 0, mergedLayer);

    const newFrames = project.frames.map((frame, idx) => {
      if (idx !== activeFrameIndex) return frame;
      return { ...frame, layers: newLayers };
    });
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveLayerId(mergedLayer.id);
    pushHistory(newFrames);
  };

  // Clear Active Layer
  const handleClearActiveLayer = () => {
    updateActiveLayerPixels(() => new Array(project.width * project.height).fill(""));
    pushHistory(project.frames);
  };

  // Frame Operations
  const handleAddFrame = () => {
    const newFrame = createBlankFrame(
      `Frame ${project.frames.length + 1}`,
      project.width,
      project.height
    );
    const newFrames = [...project.frames, newFrame];
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveFrameIndex(newFrames.length - 1);
    setActiveLayerId(newFrame.layers[0].id);
    pushHistory(newFrames);
  };

  const handleDuplicateFrame = (index: number) => {
    const target = project.frames[index];
    if (!target) return;
    const duplicated: PixelFrame = {
      id: `frame-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${target.name} (Copy)`,
      layers: target.layers.map((l) => ({
        ...l,
        id: `layer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        pixels: [...l.pixels],
      })),
    };
    const newFrames = [...project.frames];
    newFrames.splice(index + 1, 0, duplicated);
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveFrameIndex(index + 1);
    setActiveLayerId(duplicated.layers[0]?.id);
    pushHistory(newFrames);
  };

  const handleDeleteFrame = (index: number) => {
    if (project.frames.length <= 1) return;
    const newFrames = project.frames.filter((_, i) => i !== index);
    const nextIdx = Math.min(index, newFrames.length - 1);
    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveFrameIndex(nextIdx);
    setActiveLayerId(newFrames[nextIdx].layers[0]?.id);
    pushHistory(newFrames);
  };

  const handleMoveFrame = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= project.frames.length) return;

    const newFrames = [...project.frames];
    const [removed] = newFrames.splice(index, 1);
    newFrames.splice(targetIndex, 0, removed);

    setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
    setActiveFrameIndex(targetIndex);
    pushHistory(newFrames);
  };

  // Palette extract
  const handleExtractPalette = () => {
    const allPixels = activeFrame.layers.map((l) => l.pixels);
    const extracted = extractPaletteFromPixels(allPixels, 32);
    if (extracted.length > 0) {
      setProject((prev) => ({ ...prev, palette: extracted }));
      toast.success(
        t(
          "pixelArtStudio.paletteExtracted",
          undefined,
          `Extracted ${extracted.length} colors from canvas!`
        )
      );
    } else {
      toast.info(
        t(
          "pixelArtStudio.noColorsFound",
          undefined,
          "No colored pixels found on canvas."
        )
      );
    }
  };

  // New Canvas Modal Handler
  const handleCreateNewCanvas = (w: number, h: number) => {
    const newFrame = createBlankFrame("Frame 1", w, h);
    const newProject: PixelArtProject = {
      id: `proj-${Date.now()}`,
      name: "Pixel Art",
      width: w,
      height: h,
      fps: 8,
      frames: [newFrame],
      palette: [...DEFAULT_PALETTE],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProject(newProject);
    setActiveFrameIndex(0);
    setActiveLayerId(newFrame.layers[0].id);
    setHistory([{ frames: [newFrame], width: w, height: h }]);
    setHistoryIndex(0);
    handleResetZoom();
    toast.success(t("pixelArtStudio.newCanvasCreated", undefined, "New canvas created!"));
  };

  // Resize Canvas Handler
  const handleResizeCanvas = (newW: number, newH: number, rescale: boolean) => {
    const oldW = project.width;
    const oldH = project.height;

    const newFrames = project.frames.map((frame) => {
      const newLayers = frame.layers.map((layer) => {
        const newPixels = new Array(newW * newH).fill("");

        if (rescale) {
          // Nearest neighbor rescale
          for (let y = 0; y < newH; y++) {
            const srcY = Math.floor((y / newH) * oldH);
            for (let x = 0; x < newW; x++) {
              const srcX = Math.floor((x / newW) * oldW);
              const srcIdx = getIndex(srcX, srcY, oldW);
              const destIdx = getIndex(x, y, newW);
              newPixels[destIdx] = layer.pixels[srcIdx] || "";
            }
          }
        } else {
          // Crop or expand from top-left
          for (let y = 0; y < Math.min(oldH, newH); y++) {
            for (let x = 0; x < Math.min(oldW, newW); x++) {
              const srcIdx = getIndex(x, y, oldW);
              const destIdx = getIndex(x, y, newW);
              newPixels[destIdx] = layer.pixels[srcIdx] || "";
            }
          }
        }

        return { ...layer, pixels: newPixels };
      });

      return { ...frame, layers: newLayers };
    });

    setProject((prev) => ({
      ...prev,
      width: newW,
      height: newH,
      frames: newFrames,
      updatedAt: Date.now(),
    }));
    pushHistory(newFrames, newW, newH);
    toast.success(t("pixelArtStudio.canvasResized", undefined, "Canvas resized successfully!"));
  };

  // Import File Handler (.pixelart / .json or images)
  const handleImportFile = (file: File) => {
    if (file.name.endsWith(".json") || file.name.endsWith(".pixelart")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (parsed.frames && parsed.width && parsed.height) {
            setProject(parsed);
            setActiveFrameIndex(0);
            setActiveLayerId(parsed.frames[0]?.layers[0]?.id || "layer-0");
            setHistory([{ frames: parsed.frames, width: parsed.width, height: parsed.height }]);
            setHistoryIndex(0);
            toast.success(t("pixelArtStudio.projectImported", undefined, "Project imported successfully!"));
          } else {
            toast.error(t("pixelArtStudio.invalidProject", undefined, "Invalid project file"));
          }
        } catch (err) {
          toast.error(t("pixelArtStudio.importError", undefined, "Failed to parse project file"));
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("image/")) {
      // Import image as pixel art layer
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = project.width;
          canvas.height = project.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, project.width, project.height);
          const imgData = ctx.getImageData(0, 0, project.width, project.height);

          const newPixels: string[] = [];
          for (let i = 0; i < imgData.data.length; i += 4) {
            const r = imgData.data[i];
            const g = imgData.data[i + 1];
            const b = imgData.data[i + 2];
            const a = imgData.data[i + 3];
            if (a < 128) {
              newPixels.push("");
            } else {
              const hex =
                "#" +
                ((1 << 24) + (r << 16) + (g << 8) + b)
                  .toString(16)
                  .slice(1)
                  .toUpperCase();
              newPixels.push(hex);
            }
          }

          const importedLayer: PixelLayer = {
            id: `layer-${Date.now()}`,
            name: file.name.substring(0, 16),
            visible: true,
            opacity: 1,
            pixels: newPixels,
          };

          const newFrames = project.frames.map((frame, idx) => {
            if (idx !== activeFrameIndex) return frame;
            return { ...frame, layers: [...frame.layers, importedLayer] };
          });

          setProject((prev) => ({ ...prev, frames: newFrames, updatedAt: Date.now() }));
          setActiveLayerId(importedLayer.id);
          pushHistory(newFrames);
          toast.success(t("pixelArtStudio.imageImported", undefined, "Image imported and pixelated!"));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-background select-none">
      {/* Top Bar */}
      <div className="p-2 shrink-0">
        <TopBar
          projectName={project.name}
          onChangeProjectName={(name) => setProject((p) => ({ ...p, name }))}
          width={project.width}
          height={project.height}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onClearActiveLayer={handleClearActiveLayer}
          onOpenNewModal={() => setIsNewOpen(true)}
          onOpenResizeModal={() => setIsResizeOpen(true)}
          onOpenExportModal={() => setIsExportOpen(true)}
          onImportFile={handleImportFile}
        />
      </div>

      {/* Main Workspace Workspace layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Toolbar */}
        <div className="absolute top-3 left-3 z-20">
          <ToolBar
            currentTool={currentTool}
            onSelectTool={setCurrentTool}
            brushSize={brushSize}
            onChangeBrushSize={setBrushSize}
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
          />
        </div>

        {/* Center Viewport */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          className="flex-1 flex items-center justify-center overflow-hidden bg-muted/20 relative cursor-crosshair"
          style={{
            cursor: isPanning ? "grabbing" : isSpacePressedRef.current ? "grab" : "crosshair",
          }}
        >
          {/* Canvas Viewport transform wrapper */}
          <div
            className="relative transition-transform duration-75 shadow-2xl border border-border/80 rounded-sm"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {/* Checkerboard Background for transparency */}
            <div
              className="absolute inset-0 pointer-events-none rounded-sm"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
                  linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
                  linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)
                `,
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                backgroundColor: "#ffffff",
              }}
            />

            {/* Display Canvas (pixel dimensions scaled with CSS) */}
            <canvas
              ref={displayCanvasRef}
              width={project.width}
              height={project.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              className="relative z-10 [image-rendering:pixelated] block shadow-inner"
              style={{
                width: `${project.width * 16}px`,
                height: `${project.height * 16}px`,
                maxWidth: "80vw",
                maxHeight: "68vh",
                touchAction: "none",
              }}
            />

            {/* Grid Overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none z-20"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(0, 0, 0, 0.12) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0, 0, 0, 0.12) 1px, transparent 1px)
                  `,
                  backgroundSize: `${(1 / project.width) * 100}% ${(1 / project.height) * 100}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Right Side Panels (Colors & Layers) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2.5">
          <ColorPanel
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            onChangePrimaryColor={setPrimaryColor}
            onChangeSecondaryColor={setSecondaryColor}
            onSwapColors={() => {
              setPrimaryColor(secondaryColor);
              setSecondaryColor(primaryColor);
            }}
            activePalette={project.palette}
            onChangePalette={(colors) =>
              setProject((p) => ({ ...p, palette: colors }))
            }
            onExtractPalette={handleExtractPalette}
          />

          <LayersPanel
            layers={activeFrame.layers}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayerId}
            onAddLayer={handleAddLayer}
            onDuplicateLayer={handleDuplicateLayer}
            onDeleteLayer={handleDeleteLayer}
            onToggleVisibility={handleToggleVisibility}
            onChangeOpacity={handleChangeOpacity}
            onMoveLayer={handleMoveLayer}
            onMergeDown={handleMergeDown}
          />
        </div>
      </div>

      {/* Bottom Animation Timeline */}
      <div className="p-2 shrink-0">
        <TimelineBar
          frames={project.frames}
          activeFrameIndex={activeFrameIndex}
          width={project.width}
          height={project.height}
          fps={project.fps}
          onionSkin={onionSkin}
          onToggleOnionSkin={() => setOnionSkin(!onionSkin)}
          onChangeFps={(fps) => setProject((p) => ({ ...p, fps }))}
          onSelectFrame={(index) => {
            setActiveFrameIndex(index);
            const target = project.frames[index];
            if (target && target.layers.length > 0) {
              setActiveLayerId(target.layers[0].id);
            }
          }}
          onAddFrame={handleAddFrame}
          onDuplicateFrame={handleDuplicateFrame}
          onDeleteFrame={handleDeleteFrame}
          onMoveFrame={handleMoveFrame}
        />
      </div>

      {/* Modals */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
        activeFrameIndex={activeFrameIndex}
      />

      <NewCanvasModal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreate={handleCreateNewCanvas}
        currentWidth={project.width}
        currentHeight={project.height}
      />

      <ResizeModal
        isOpen={isResizeOpen}
        onClose={() => setIsResizeOpen(false)}
        onResize={handleResizeCanvas}
        currentWidth={project.width}
        currentHeight={project.height}
      />
      </div>
    </TooltipProvider>
  );
}
