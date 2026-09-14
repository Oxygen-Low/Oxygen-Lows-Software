import React, { useRef } from "react";
import {
  FolderOpen,
  Download,
  RotateCcw,
  RotateCw,
  Grid,
  Trash2,
  Maximize2,
  FilePlus,
  Upload,
  CloudUpload,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface TopBarProps {
  projectName: string;
  onChangeProjectName: (name: string) => void;
  width: number;
  height: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onClearActiveLayer: () => void;
  onOpenNewModal: () => void;
  onOpenResizeModal: () => void;
  onOpenExportModal: () => void;
  onImportFile: (file: File) => void;
}

export function TopBar({
  projectName,
  onChangeProjectName,
  width,
  height,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showGrid,
  onToggleGrid,
  onClearActiveLayer,
  onOpenNewModal,
  onOpenResizeModal,
  onOpenExportModal,
  onImportFile,
}: TopBarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = "";
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card/75 backdrop-blur-md rounded-xl border border-border shadow-sm w-full gap-2">
      {/* Project Name & Dimensions */}
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={projectName}
          onChange={(e) => onChangeProjectName(e.target.value)}
          className="h-8 text-sm font-semibold max-w-[180px] bg-background/50 border-border/80"
          placeholder={t("pixelArtStudio.untitledProject", undefined, "Pixel Art")}
        />
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          {width}x{height}px
        </span>
      </div>

      {/* Center Tool Buttons */}
      <div className="flex items-center gap-1">
        {/* New Canvas */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs flex items-center gap-1.5"
              onClick={onOpenNewModal}
            >
              <FilePlus className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">{t("common.new", undefined, "New")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.newCanvas", undefined, "Create New Canvas")}
          </TooltipContent>
        </Tooltip>

        {/* Resize Canvas */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs flex items-center gap-1.5"
              onClick={onOpenResizeModal}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("pixelArtStudio.resize", undefined, "Resize")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.resizeCanvas", undefined, "Resize or Rescale Canvas")}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Undo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs flex items-center gap-1">
            <span>{t("common.undo", undefined, "Undo")}</span>
            <kbd className="px-1 text-[10px] bg-muted rounded font-mono">Ctrl+Z</kbd>
          </TooltipContent>
        </Tooltip>

        {/* Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs flex items-center gap-1">
            <span>{t("common.redo", undefined, "Redo")}</span>
            <kbd className="px-1 text-[10px] bg-muted rounded font-mono">Ctrl+Y</kbd>
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Grid Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showGrid ? "secondary" : "ghost"}
              size="icon"
              className={cn("w-8 h-8", showGrid && "ring-1 ring-border")}
              onClick={onToggleGrid}
            >
              <Grid className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.toggleGrid", undefined, "Toggle Grid")}
          </TooltipContent>
        </Tooltip>

        {/* Clear Active Layer */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-destructive/80 hover:text-destructive"
              onClick={onClearActiveLayer}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.clearLayer", undefined, "Clear Active Layer")}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right Side Actions: Import & Export */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pixelart,.json,image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs flex items-center gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("common.import", undefined, "Import")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.importTip", undefined, "Import .pixelart file or image to convert to pixel art")}
          </TooltipContent>
        </Tooltip>

        <Button
          size="sm"
          className="h-8 px-3 text-xs flex items-center gap-1.5 bg-primary text-primary-foreground shadow-sm hover:brightness-110"
          onClick={onOpenExportModal}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t("common.export", undefined, "Export")}</span>
        </Button>
      </div>
    </div>
  );
}
