import React, { useState } from "react";
import {
  Download,
  Copy,
  Check,
  Loader2,
  Image as ImageIcon,
  Film,
  Grid,
  FileCode,
  CloudUpload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { PixelArtProject, PixelFrame } from "./types";
import {
  renderFrameToCanvas,
  renderSpriteSheet,
  compositeFramePixels,
} from "./canvasUtils";
import { createAnimatedGifBlob } from "./gifEncoder";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: PixelArtProject;
  activeFrameIndex: number;
}

export function ExportModal({
  isOpen,
  onClose,
  project,
  activeFrameIndex,
}: ExportModalProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [activeTab, setActiveTab] = useState<"png" | "spritesheet" | "gif" | "project">("png");
  const [scale, setScale] = useState(8);
  const [sheetColumns, setSheetColumns] = useState(project.frames.length);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeFrame = project.frames[activeFrameIndex] || project.frames[0];

  const getCleanName = () => {
    return project.name.replace(/[^a-zA-Z0-9_\-]/g, "_").trim() || "pixel_art";
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export current frame as PNG
  const handleExportPng = async () => {
    setIsProcessing(true);
    try {
      const canvas = renderFrameToCanvas(activeFrame, project.width, project.height, scale);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${getCleanName()}_${scale}x.png`);
          toast.success(t("pixelArtStudio.pngExported", undefined, "PNG exported successfully!"));
        }
        setIsProcessing(false);
      }, "image/png");
    } catch (e) {
      console.error(e);
      toast.error(t("pixelArtStudio.exportError", undefined, "Failed to export PNG"));
      setIsProcessing(false);
    }
  };

  // Copy PNG to clipboard
  const handleCopyPng = async () => {
    setIsProcessing(true);
    try {
      const canvas = renderFrameToCanvas(activeFrame, project.width, project.height, scale);
      canvas.toBlob(async (blob) => {
        if (blob && navigator.clipboard && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          toast.success(t("pixelArtStudio.copiedToClipboard", undefined, "Copied to clipboard!"));
        } else {
          toast.error(t("pixelArtStudio.clipboardNotSupported", undefined, "Clipboard copy not supported"));
        }
        setIsProcessing(false);
      }, "image/png");
    } catch (e) {
      console.error(e);
      toast.error(t("pixelArtStudio.copyError", undefined, "Failed to copy image"));
      setIsProcessing(false);
    }
  };

  // Export Sprite Sheet
  const handleExportSpriteSheet = () => {
    setIsProcessing(true);
    try {
      const canvas = renderSpriteSheet(
        project.frames,
        project.width,
        project.height,
        scale,
        sheetColumns
      );
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${getCleanName()}_spritesheet_${scale}x.png`);
          toast.success(t("pixelArtStudio.sheetExported", undefined, "Sprite sheet exported successfully!"));
        }
        setIsProcessing(false);
      }, "image/png");
    } catch (e) {
      console.error(e);
      toast.error(t("pixelArtStudio.exportError", undefined, "Failed to export sprite sheet"));
      setIsProcessing(false);
    }
  };

  // Export Animated GIF
  const handleExportGif = async () => {
    setIsProcessing(true);
    try {
      // Delay in ms per frame
      const frameDelayMs = Math.round(1000 / (project.fps || 8));

      // Render all frames scaled
      const gifFrames = project.frames.map((frame) => {
        const frameCanvas = renderFrameToCanvas(frame, project.width, project.height, scale);
        const ctx = frameCanvas.getContext("2d");
        const imgData = ctx?.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
        return {
          rgba: imgData?.data || new Uint8ClampedArray(frameCanvas.width * frameCanvas.height * 4),
          width: frameCanvas.width,
          height: frameCanvas.height,
          delayMs: frameDelayMs,
        };
      });

      const gifBlob = createAnimatedGifBlob(gifFrames);
      downloadBlob(gifBlob, `${getCleanName()}_animated.gif`);
      toast.success(t("pixelArtStudio.gifExported", undefined, "Animated GIF exported successfully!"));
    } catch (e) {
      console.error(e);
      toast.error(t("pixelArtStudio.exportError", undefined, "Failed to create animated GIF"));
    } finally {
      setIsProcessing(false);
    }
  };

  // Export JSON project
  const handleExportProjectJson = () => {
    try {
      const dataStr = JSON.stringify(project, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      downloadBlob(blob, `${getCleanName()}.pixelart`);
      toast.success(t("pixelArtStudio.projectDownloaded", undefined, "Project file downloaded!"));
    } catch (e) {
      console.error(e);
      toast.error(t("pixelArtStudio.exportError", undefined, "Failed to export project file"));
    }
  };

  // Save directly to Cloud Storage
  const handleSaveToStorage = async () => {
    if (!userId) {
      toast.error(t("pixelArtStudio.signInToSaveStorage", undefined, "Please sign in to save directly to Storage."));
      return;
    }

    setIsProcessing(true);
    try {
      const clean = getCleanName();
      if (activeTab === "gif") {
        const frameDelayMs = Math.round(1000 / (project.fps || 8));
        const gifFrames = project.frames.map((frame) => {
          const frameCanvas = renderFrameToCanvas(frame, project.width, project.height, scale);
          const ctx = frameCanvas.getContext("2d");
          const imgData = ctx?.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
          return {
            rgba: imgData?.data || new Uint8ClampedArray(frameCanvas.width * frameCanvas.height * 4),
            width: frameCanvas.width,
            height: frameCanvas.height,
            delayMs: frameDelayMs,
          };
        });
        const blob = createAnimatedGifBlob(gifFrames);
        const path = `${userId}/pixel-art/${clean}_${Date.now()}.gif`;
        const res = await storage.from("Storage").upload(path, blob, {
          contentType: "image/gif",
          upsert: true,
        });
        if (res.error) throw res.error;
      } else if (activeTab === "spritesheet") {
        const canvas = renderSpriteSheet(project.frames, project.width, project.height, scale, sheetColumns);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Could not create blob");
        const path = `${userId}/pixel-art/${clean}_sheet_${Date.now()}.png`;
        const res = await storage.from("Storage").upload(path, blob, {
          contentType: "image/png",
          upsert: true,
        });
        if (res.error) throw res.error;
      } else if (activeTab === "project") {
        const dataStr = JSON.stringify(project, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const path = `${userId}/pixel-art/${clean}_${Date.now()}.pixelart`;
        const res = await storage.from("Storage").upload(path, blob, {
          contentType: "application/json",
          upsert: true,
        });
        if (res.error) throw res.error;
      } else {
        const canvas = renderFrameToCanvas(activeFrame, project.width, project.height, scale);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Could not create blob");
        const path = `${userId}/pixel-art/${clean}_${Date.now()}.png`;
        const res = await storage.from("Storage").upload(path, blob, {
          contentType: "image/png",
          upsert: true,
        });
        if (res.error) throw res.error;
      }

      toast.success(t("pixelArtStudio.savedToStorage", undefined, "Saved to your Storage successfully!"));
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(t("pixelArtStudio.storageSaveError", undefined, "Failed to save file to Storage."));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <span>{t("pixelArtStudio.exportTitle", undefined, "Export Pixel Artwork")}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="png" className="text-xs flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>PNG</span>
            </TabsTrigger>
            <TabsTrigger value="spritesheet" className="text-xs flex items-center gap-1">
              <Grid className="w-3.5 h-3.5" />
              <span>Sheet</span>
            </TabsTrigger>
            <TabsTrigger value="gif" className="text-xs flex items-center gap-1">
              <Film className="w-3.5 h-3.5" />
              <span>GIF</span>
            </TabsTrigger>
            <TabsTrigger value="project" className="text-xs flex items-center gap-1">
              <FileCode className="w-3.5 h-3.5" />
              <span>Project</span>
            </TabsTrigger>
          </TabsList>

          {/* Scale controls (common to PNG, Sheet, GIF) */}
          {activeTab !== "project" && (
            <div className="pt-4 space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>{t("pixelArtStudio.scaleLabel", undefined, "Pixel Upscale Factor")}</span>
                <span className="text-primary font-bold">
                  {scale}x ({project.width * scale} x {project.height * scale}px)
                </span>
              </div>
              <Slider
                value={[scale]}
                min={1}
                max={32}
                step={1}
                onValueChange={(val) => setScale(val[0])}
                className="my-2"
              />
              <div className="flex gap-1.5 justify-center">
                {[1, 2, 4, 8, 16, 24, 32].map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={scale === s ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setScale(s)}
                  >
                    {s}x
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* PNG Tab */}
          <TabsContent value="png" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "pixelArtStudio.pngDesc",
                undefined,
                "Export current active frame with crisp nearest-neighbor upscaling and transparent background."
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleExportPng} disabled={isProcessing} className="flex-1">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                {t("pixelArtStudio.downloadPng", undefined, "Download PNG")}
              </Button>
              <Button variant="outline" onClick={handleCopyPng} disabled={isProcessing}>
                {copied ? <Check className="w-4 h-4 text-green-500 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? t("common.copied", undefined, "Copied!") : t("common.copy", undefined, "Copy")}
              </Button>
            </div>
          </TabsContent>

          {/* Sprite Sheet Tab */}
          <TabsContent value="spritesheet" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "pixelArtStudio.sheetDesc",
                undefined,
                "Combine all animation frames into a single sprite sheet image ready for game engines."
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("pixelArtStudio.totalFrames", undefined, "Total Frames")}</Label>
                <div className="text-sm font-semibold mt-1">{project.frames.length} frames</div>
              </div>
              <div>
                <Label htmlFor="sheet-cols" className="text-xs">
                  {t("pixelArtStudio.columns", undefined, "Grid Columns")}
                </Label>
                <Input
                  id="sheet-cols"
                  type="number"
                  min={1}
                  max={project.frames.length}
                  value={sheetColumns}
                  onChange={(e) => setSheetColumns(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleExportSpriteSheet} disabled={isProcessing} className="w-full">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                {t("pixelArtStudio.downloadSheet", undefined, "Download Sprite Sheet")}
              </Button>
            </div>
          </TabsContent>

          {/* Animated GIF Tab */}
          <TabsContent value="gif" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "pixelArtStudio.gifDesc",
                undefined,
                "Generate an animated looping GIF from all frames directly in your browser."
              )}
            </p>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded border border-border">
              <div className="flex justify-between">
                <span>{t("pixelArtStudio.playbackSpeed", undefined, "Playback Speed")}:</span>
                <span className="font-semibold text-foreground">{project.fps} FPS</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>{t("pixelArtStudio.frameDelay", undefined, "Delay per frame")}:</span>
                <span className="font-semibold text-foreground">{Math.round(1000 / project.fps)} ms</span>
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleExportGif} disabled={isProcessing} className="w-full">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Film className="w-4 h-4 mr-2" />}
                {t("pixelArtStudio.downloadGif", undefined, "Download Animated GIF")}
              </Button>
            </div>
          </TabsContent>

          {/* Project JSON Tab */}
          <TabsContent value="project" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "pixelArtStudio.projectDesc",
                undefined,
                "Save your entire project containing all frames, layers, palettes, and settings as a .pixelart JSON file."
              )}
            </p>
            <div className="pt-2">
              <Button onClick={handleExportProjectJson} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                {t("pixelArtStudio.downloadProject", undefined, "Download .pixelart File")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Cloud save option */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {userId ? (
              <span>{t("pixelArtStudio.cloudSaveAvailable", undefined, "Cloud storage connected.")}</span>
            ) : (
              <span>{t("pixelArtStudio.signInForCloud", undefined, "Sign in to save directly to Storage.")}</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveToStorage}
            disabled={!userId || isProcessing}
            className="text-xs flex items-center gap-1.5"
          >
            <CloudUpload className="w-3.5 h-3.5 text-primary" />
            <span>{t("pixelArtStudio.saveToStorage", undefined, "Save to Storage")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
