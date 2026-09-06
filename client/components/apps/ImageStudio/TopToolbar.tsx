import React, { useState } from "react";
import {
  Undo2,
  Redo2,
  Download,
  Save,
  FolderOpen,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Lock,
  Unlock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CanvasProject, PRESET_DIMENSIONS, ImageLayer } from "./types";
import { useTranslation } from "@/contexts/LanguageContext";

interface TopToolbarProps {
  project: CanvasProject;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  isFullscreen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (zoom: number) => void;
  onFitToScreen: () => void;
  onUpdateProjectName: (name: string) => void;
  onResizeCanvas: (width: number, height: number) => void;
  onToggleFullscreen: () => void;
  onOpenExportDialog: () => void;
  onOpenProjectsDialog: () => void;
  onQuickSave: () => void;
  onNewProject: () => void;
  onMatchCanvasToSelectedImage?: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  project,
  canUndo,
  canRedo,
  zoom,
  isFullscreen,
  onUndo,
  onRedo,
  onZoomChange,
  onFitToScreen,
  onUpdateProjectName,
  onResizeCanvas,
  onToggleFullscreen,
  onOpenExportDialog,
  onOpenProjectsDialog,
  onQuickSave,
  onNewProject,
  onMatchCanvasToSelectedImage,
}) => {
  const { t } = useTranslation();
  const [customWidth, setCustomWidth] = useState(project.width.toString());
  const [customHeight, setCustomHeight] = useState(project.height.toString());
  const [keepAspectRatio, setKeepAspectRatio] = useState(false);

  const selectedLayer = project.layers.find(
    (l) => l.id === project.selectedLayerId,
  );
  const isSelectedImage = selectedLayer?.type === "image";

  const handleApplyCustomSize = () => {
    const w = parseInt(customWidth, 10);
    const h = parseInt(customHeight, 10);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      onResizeCanvas(w, h);
    }
  };

  const handleWidthChange = (val: string) => {
    setCustomWidth(val);
    const w = parseInt(val, 10);
    if (keepAspectRatio && !isNaN(w) && project.width > 0) {
      const ratio = project.height / project.width;
      setCustomHeight(Math.round(w * ratio).toString());
    }
  };

  const handleHeightChange = (val: string) => {
    setCustomHeight(val);
    const h = parseInt(val, 10);
    if (keepAspectRatio && !isNaN(h) && project.height > 0) {
      const ratio = project.width / project.height;
      setCustomWidth(Math.round(h * ratio).toString());
    }
  };

  return (
    <header className="h-14 border-b border-border bg-card/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-30">
      {/* Left: Project title & Presets */}
      <div className="flex items-center gap-2 min-w-0">
        <Input
          value={project.name}
          onChange={(e) => onUpdateProjectName(e.target.value)}
          aria-label={t("imageStudio.projectName", undefined, "Project Name")}
          className="h-8 w-36 sm:w-48 bg-background/60 border-border text-sm font-semibold truncate hover:bg-background transition-colors focus:w-60"
        />

        {/* Dimension Preset & Custom Size Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs border-border bg-background/50 hover:bg-accent"
            >
              <span>
                {project.width} × {project.height}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 p-3 bg-popover border-border text-popover-foreground"
          >
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("imageStudio.canvasDimensions", undefined, "Canvas Dimensions")}
              </div>

              {/* Presets List */}
              <div className="grid grid-cols-1 gap-1">
                {PRESET_DIMENSIONS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      onResizeCanvas(preset.width, preset.height);
                      setCustomWidth(preset.width.toString());
                      setCustomHeight(preset.height.toString());
                    }}
                    className={`w-full flex items-center justify-between p-1.5 rounded text-xs hover:bg-accent text-left transition-colors ${
                      project.width === preset.width &&
                      project.height === preset.height
                        ? "bg-primary/20 text-primary font-medium"
                        : "text-foreground"
                    }`}
                  >
                    <span>{preset.name}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {preset.width}×{preset.height} ({preset.aspectRatioLabel})
                    </span>
                  </button>
                ))}
              </div>

              {/* Match Canvas to Image button */}
              {isSelectedImage && onMatchCanvasToSelectedImage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMatchCanvasToSelectedImage}
                  className="w-full text-xs h-8 gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t("imageStudio.matchToImage", undefined, "Match to Selected Image")}
                </Button>
              )}

              {/* Custom WxH */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {t("imageStudio.customSize", undefined, "Custom (pixels)")}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={customWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    placeholder="W"
                    className="h-8 text-xs bg-background"
                  />
                  <span className="text-muted-foreground text-xs">×</span>
                  <Input
                    type="number"
                    value={customHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    placeholder="H"
                    className="h-8 text-xs bg-background"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={
                      keepAspectRatio
                        ? t("imageStudio.unlockAspect", undefined, "Unlock aspect ratio")
                        : t("imageStudio.lockAspect", undefined, "Lock aspect ratio")
                    }
                    onClick={() => setKeepAspectRatio(!keepAspectRatio)}
                  >
                    {keepAspectRatio ? (
                      <Lock className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={handleApplyCustomSize}
                  className="w-full h-7 text-xs bg-primary text-primary-foreground"
                >
                  {t("imageStudio.applyDimensions", undefined, "Apply Dimensions")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Undo / Redo */}
        <div className="hidden sm:flex items-center gap-0.5 ml-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={!canUndo}
            onClick={onUndo}
            title={t("imageStudio.undo", undefined, "Undo (Ctrl+Z)")}
            className="h-8 w-8 hover:bg-accent disabled:opacity-30"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canRedo}
            onClick={onRedo}
            title={t("imageStudio.redo", undefined, "Redo (Ctrl+Y)")}
            className="h-8 w-8 hover:bg-accent disabled:opacity-30"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Center: Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          title={t("imageStudio.zoomOut", undefined, "Zoom Out")}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-xs font-mono px-2 py-1 rounded bg-background/60 hover:bg-accent border border-border text-foreground transition-colors">
              {Math.round(zoom * 100)}%
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-popover border-border">
            <DropdownMenuItem onClick={onFitToScreen}>
              <Maximize className="w-3.5 h-3.5 mr-2" />
              {t("imageStudio.fitToScreen", undefined, "Fit to Screen")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onZoomChange(0.5)}>50%</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onZoomChange(1.0)}>100%</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onZoomChange(2.0)}>200%</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={() => onZoomChange(Math.min(4.0, zoom + 0.1))}
          title={t("imageStudio.zoomIn", undefined, "Zoom In")}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Right Actions: Projects, Save, Export, Fullscreen */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewProject}
          title={t("imageStudio.newProject", undefined, "New Project")}
          className="h-8 px-2.5 text-xs gap-1 border-border bg-background/50 hover:bg-accent hidden md:flex"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">
            {t("imageStudio.newProject", undefined, "New")}
          </span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenProjectsDialog}
          className="h-8 px-2.5 text-xs gap-1.5 border-border bg-background/50 hover:bg-accent"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">
            {t("imageStudio.myProjects", undefined, "Projects")}
          </span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onQuickSave}
          className="h-8 px-2.5 text-xs gap-1.5 border-border bg-background/50 hover:bg-accent"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">
            {t("imageStudio.save", undefined, "Save")}
          </span>
        </Button>

        <Button
          size="sm"
          onClick={onOpenExportDialog}
          className="h-8 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t("imageStudio.export", undefined, "Export")}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFullscreen}
          title={
            isFullscreen
              ? t("imageStudio.exitFullscreen", undefined, "Exit Fullscreen")
              : t("imageStudio.enterFullscreen", undefined, "Enter Fullscreen")
          }
          className="h-8 w-8 hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </header>
  );
};
