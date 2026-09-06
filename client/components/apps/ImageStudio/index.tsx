import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Palette } from "lucide-react";
import {
  CanvasProject,
  CanvasLayer,
  ImageLayer,
  TextLayer,
  ShapeLayer,
  ShapeType,
  CanvasBackground,
  DEFAULT_FILTERS,
} from "./types";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
import { useCustomFonts } from "./hooks/useCustomFonts";
import { TopToolbar } from "./TopToolbar";
import { LeftSidebar } from "./LeftSidebar";
import { CanvasStage } from "./CanvasStage";
import { InspectorToolbar } from "./InspectorToolbar";
import { ExportDialog } from "./ExportDialog";
import { ProjectsDialog } from "./ProjectsDialog";
import { toast } from "sonner";

const LOCAL_ACTIVE_PROJECT_KEY = "image_studio_active_project";

const createDefaultProject = (): CanvasProject => ({
  id: "default-project",
  name: "Untitled Graphic",
  width: 1920,
  height: 1080,
  background: {
    type: "color",
    color: "#0f172a",
    gradient: {
      type: "linear",
      angle: 135,
      startColor: "#0f172a",
      endColor: "#1e293b",
    },
  },
  layers: [
    {
      id: "welcome-title",
      type: "text",
      name: "Welcome Heading",
      text: "Oxygen Low's Software\nImage Studio",
      x: 460,
      y: 360,
      width: 1000,
      height: 200,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      fontFamily: "Inter, sans-serif",
      fontSize: 68,
      fontWeight: "bold",
      fontStyle: "normal",
      underline: false,
      color: "#ffffff",
      textAlign: "center",
      lineHeight: 1.2,
      letterSpacing: 0,
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
    } as TextLayer,
    {
      id: "welcome-sub",
      type: "text",
      name: "Welcome Subtitle",
      text: "Design custom graphics with your own files, fonts & shapes",
      x: 560,
      y: 580,
      width: 800,
      height: 80,
      rotation: 0,
      opacity: 0.85,
      isLocked: false,
      isVisible: true,
      fontFamily: "Inter, sans-serif",
      fontSize: 26,
      fontWeight: "normal",
      fontStyle: "normal",
      underline: false,
      color: "#38bdf8",
      textAlign: "center",
      lineHeight: 1.2,
      letterSpacing: 0,
    } as TextLayer,
  ],
  selectedLayerId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export function ImageStudioApp() {
  const { t } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const { theme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedLayer, setCopiedLayer] = useState<CanvasLayer | null>(null);

  // Load project from local storage or create default
  const initialProject = React.useMemo<CanvasProject>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_ACTIVE_PROJECT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.width && parsed.height && Array.isArray(parsed.layers)) {
          return parsed;
        }
      }
    } catch {}
    return createDefaultProject();
  }, []);

  const {
    project,
    setProject,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  } = useCanvasHistory(initialProject);

  const { customFonts, addCustomFont } = useCustomFonts();

  // Canvas Viewport State
  const [zoom, setZoom] = useState<number>(0.5);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 40 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dialog States
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // Auto-save locally on project changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_ACTIVE_PROJECT_KEY, JSON.stringify(project));
    } catch {}
  }, [project]);

  // Fit to screen helper
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const stageWidth = containerRef.current.clientWidth - 360; // minus sidebar and paddings
    const stageHeight = containerRef.current.clientHeight - 120; // minus toolbars

    if (stageWidth > 100 && stageHeight > 100) {
      const scaleX = (stageWidth * 0.85) / project.width;
      const scaleY = (stageHeight * 0.85) / project.height;
      const fitZoom = Math.max(0.15, Math.min(2.0, Math.min(scaleX, scaleY)));
      setZoom(fitZoom);

      const targetX = (stageWidth - project.width * fitZoom) / 2 + 30;
      const targetY = (stageHeight - project.height * fitZoom) / 2 + 20;
      setPan({ x: Math.max(20, targetX), y: Math.max(20, targetY) });
    }
  }, [project.width, project.height]);

  // Initial fit on mount
  useEffect(() => {
    const timer = setTimeout(handleFitToScreen, 150);
    return () => clearTimeout(timer);
  }, []);

  // Update selected layer
  const handleSelectLayer = (id: string | null) => {
    setProject((prev) => ({ ...prev, selectedLayerId: id }), false);
  };

  // Update layer properties
  const handleUpdateLayer = (id: string, updates: Partial<CanvasLayer>) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? ({ ...l, ...updates } as any) : l)),
    }));
  };

  // Add Image layer
  const handleAddImageToCanvas = (
    src: string,
    width: number,
    height: number,
    storagePath?: string,
  ) => {
    // Fit into reasonable bounds if image is massive
    let layerW = width;
    let layerH = height;
    const maxDimension = Math.min(project.width, project.height) * 0.65;
    if (layerW > maxDimension || layerH > maxDimension) {
      const ratio = layerW / layerH;
      if (layerW > layerH) {
        layerW = maxDimension;
        layerH = maxDimension / ratio;
      } else {
        layerH = maxDimension;
        layerW = maxDimension * ratio;
      }
    }

    const newLayer: ImageLayer = {
      id: `img-${Date.now()}`,
      type: "image",
      name: `Image ${project.layers.length + 1}`,
      src,
      storagePath,
      naturalWidth: width,
      naturalHeight: height,
      x: Math.round((project.width - layerW) / 2),
      y: Math.round((project.height - layerH) / 2),
      width: Math.round(layerW),
      height: Math.round(layerH),
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      flipH: false,
      flipV: false,
      filters: { ...DEFAULT_FILTERS },
    };

    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
      selectedLayerId: newLayer.id,
    }));
  };

  // Add Text layer
  const handleAddTextLayer = (
    preset: "heading" | "subheading" | "body",
    fontFamily = "Inter, sans-serif",
  ) => {
    let text = "Heading";
    let fontSize = 56;
    let fontWeight: "normal" | "bold" | "600" = "bold";

    if (preset === "heading") {
      text = "Add a heading";
      fontSize = 56;
      fontWeight = "bold";
    } else if (preset === "subheading") {
      text = "Add a subheading";
      fontSize = 32;
      fontWeight = "600";
    } else {
      text = "Add body text";
      fontSize = 20;
      fontWeight = "normal";
    }

    const newLayer: TextLayer = {
      id: `text-${Date.now()}`,
      type: "text",
      name: `${text.slice(0, 16)}`,
      text,
      x: Math.round(project.width / 2 - 250),
      y: Math.round(project.height / 2 - 50),
      width: 500,
      height: fontSize * 2,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle: "normal",
      underline: false,
      color: "#ffffff",
      textAlign: "center",
      lineHeight: 1.2,
      letterSpacing: 0,
    };

    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
      selectedLayerId: newLayer.id,
    }));
  };

  // Add Shape layer
  const handleAddShape = (shapeType: ShapeType) => {
    let width = 240;
    let height = 240;
    if (shapeType === "rounded-rectangle") {
      width = 320;
      height = 200;
    } else if (shapeType === "line") {
      width = 300;
      height = 10;
    } else if (shapeType === "arrow") {
      width = 280;
      height = 60;
    }

    const newLayer: ShapeLayer = {
      id: `shape-${Date.now()}`,
      type: "shape",
      name: `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)}`,
      shapeType,
      x: Math.round((project.width - width) / 2),
      y: Math.round((project.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      fill: "#06b6d4",
      fillType: "solid",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 16,
    };

    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
      selectedLayerId: newLayer.id,
    }));
  };

  // Depth ordering
  const handleBringForward = (id: string) => {
    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx === -1 || idx === prev.layers.length - 1) return prev;
      const layers = [...prev.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(idx + 1, 0, item);
      return { ...prev, layers };
    });
  };

  const handleSendBackward = (id: string) => {
    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return prev;
      const layers = [...prev.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(idx - 1, 0, item);
      return { ...prev, layers };
    });
  };

  const handleBringToFront = (id: string) => {
    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx === -1 || idx === prev.layers.length - 1) return prev;
      const layers = [...prev.layers];
      const [item] = layers.splice(idx, 1);
      layers.push(item);
      return { ...prev, layers };
    });
  };

  const handleSendToBack = (id: string) => {
    setProject((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx <= 0) return prev;
      const layers = [...prev.layers];
      const [item] = layers.splice(idx, 1);
      layers.unshift(item);
      return { ...prev, layers };
    });
  };

  // Duplicate layer
  const handleDuplicateLayer = (id: string) => {
    setProject((prev) => {
      const original = prev.layers.find((l) => l.id === id);
      if (!original) return prev;
      const duplicated: CanvasLayer = {
        ...original,
        id: `${original.type}-${Date.now()}`,
        name: `${original.name} (Copy)`,
        x: original.x + 30,
        y: original.y + 30,
      };
      return {
        ...prev,
        layers: [...prev.layers, duplicated],
        selectedLayerId: duplicated.id,
      };
    });
  };

  // Delete layer
  const handleDeleteLayer = (id: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
      selectedLayerId: prev.selectedLayerId === id ? null : prev.selectedLayerId,
    }));
  };

  // Toggle Visibility
  const handleToggleVisibility = (id: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, isVisible: !l.isVisible } : l,
      ),
    }));
  };

  // Toggle Lock
  const handleToggleLock = (id: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, isLocked: !l.isLocked } : l,
      ),
    }));
  };

  // Resize canvas
  const handleResizeCanvas = (width: number, height: number) => {
    setProject((prev) => ({
      ...prev,
      width,
      height,
    }));
  };

  // Match Canvas to Image
  const handleMatchCanvasToSelectedImage = () => {
    const selected = project.layers.find((l) => l.id === project.selectedLayerId);
    if (selected && selected.type === "image") {
      const imgLayer = selected as ImageLayer;
      const nw = imgLayer.naturalWidth || selected.width;
      const nh = imgLayer.naturalHeight || selected.height;
      setProject((prev) => ({
        ...prev,
        width: nw,
        height: nh,
        layers: prev.layers.map((l) =>
          l.id === selected.id
            ? { ...l, x: 0, y: 0, width: nw, height: nh }
            : l,
        ),
      }));
      toast.success(t("imageStudio.canvasMatched", undefined, "Canvas size matched to image resolution!"));
      handleFitToScreen();
    }
  };

  // Change Background
  const handleChangeBackground = (bg: CanvasBackground) => {
    setProject((prev) => ({ ...prev, background: bg }));
  };

  // Rename project
  const handleUpdateProjectName = (name: string) => {
    setProject((prev) => ({ ...prev, name }), false);
  };

  // New Project
  const handleNewProject = () => {
    if (
      window.confirm(
        t(
          "imageStudio.confirmNewProject",
          undefined,
          "Create a new canvas? Any unsaved changes will be replaced.",
        ),
      )
    ) {
      resetHistory(createDefaultProject());
      toast.success(t("imageStudio.newProjectCreated", undefined, "New project created!"));
      handleFitToScreen();
    }
  };

  // Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Escape to deselect
      if (e.key === "Escape") {
        handleSelectLayer(null);
        return;
      }

      const selectedId = project.selectedLayerId;
      if (!selectedId) return;

      const activeLayer = project.layers.find((l) => l.id === selectedId);
      if (!activeLayer) return;

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteLayer(selectedId);
        return;
      }

      // Copy: Ctrl+C / Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        setCopiedLayer(activeLayer);
        toast.info(t("imageStudio.layerCopied", undefined, "Layer copied"));
        return;
      }

      // Paste: Ctrl+V / Cmd+V
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && copiedLayer) {
        e.preventDefault();
        handleDuplicateLayer(copiedLayer.id);
        return;
      }

      // Arrow keys nudging
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -delta;
        if (e.key === "ArrowRight") dx = delta;
        if (e.key === "ArrowUp") dy = -delta;
        if (e.key === "ArrowDown") dy = delta;

        handleUpdateLayer(selectedId, {
          x: activeLayer.x + dx,
          y: activeLayer.y + dy,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [project.selectedLayerId, project.layers, copiedLayer, undo, redo]);

  // If user is not authenticated, show sign-in prompt (in addition to Apps.tsx overlay)
  if (!authLoading && !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/10">
          <Palette className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {t("imageStudio.title", undefined, "Image Studio")}
        </h2>
        <p className="text-slate-400 max-w-md text-sm mb-6">
          {t(
            "imageStudio.authNotice",
            undefined,
            "Sign in to your Oxygen Low's Software account to access Image Studio, compose graphics, upload custom assets, and manage projects.",
          )}
        </p>
        <Link
          to="/auth"
          className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm transition-colors shadow-md"
        >
          {t("apps.signInToContinue", undefined, "Sign In to Continue")}
        </Link>
      </div>
    );
  }

  const selectedLayer = project.layers.find(
    (l) => l.id === project.selectedLayerId,
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-[calc(100vh-64px)] w-full bg-background text-foreground overflow-hidden rounded-xl border border-border shadow-2xl relative select-none"
    >
      {/* Top Studio Toolbar */}
      <TopToolbar
        project={project}
        canUndo={canUndo}
        canRedo={canRedo}
        zoom={zoom}
        isFullscreen={isFullscreen}
        onUndo={undo}
        onRedo={redo}
        onZoomChange={setZoom}
        onFitToScreen={handleFitToScreen}
        onUpdateProjectName={handleUpdateProjectName}
        onResizeCanvas={handleResizeCanvas}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenExportDialog={() => setExportOpen(true)}
        onOpenProjectsDialog={() => setProjectsOpen(true)}
        onQuickSave={() => setProjectsOpen(true)}
        onNewProject={handleNewProject}
        onMatchCanvasToSelectedImage={handleMatchCanvasToSelectedImage}
      />

      {/* Contextual Layer Inspector Toolbar (active when layer is selected) */}
      {selectedLayer && (
        <InspectorToolbar
          layer={selectedLayer}
          customFonts={customFonts}
          onUpdateLayer={handleUpdateLayer}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayer={handleDeleteLayer}
        />
      )}

      {/* Main Workspace: Left Sidebar + Center Stage */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Studio Sidebar */}
        <LeftSidebar
          project={project}
          customFonts={customFonts}
          onAddImageToCanvas={handleAddImageToCanvas}
          onAddTextLayer={handleAddTextLayer}
          onAddCustomFont={addCustomFont}
          onAddShape={handleAddShape}
          onChangeBackground={handleChangeBackground}
          onSelectLayer={handleSelectLayer}
          onToggleVisibility={handleToggleVisibility}
          onToggleLock={handleToggleLock}
          onMoveLayerUp={handleBringForward}
          onMoveLayerDown={handleSendBackward}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayer={handleDeleteLayer}
        />

        {/* Center Interactive Canvas Stage */}
        <div className="flex-1 relative overflow-hidden">
          <CanvasStage
            project={project}
            zoom={zoom}
            pan={pan}
            onUpdateLayer={handleUpdateLayer}
            onSelectLayer={handleSelectLayer}
            onPanChange={setPan}
            onZoomChange={setZoom}
            onMatchCanvasToImage={handleResizeCanvas}
          />
        </div>
      </div>

      {/* Dialogs */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
      />

      <ProjectsDialog
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        currentProject={project}
        onLoadProject={(loaded) => {
          resetHistory(loaded);
          handleFitToScreen();
        }}
      />
    </div>
  );
}
