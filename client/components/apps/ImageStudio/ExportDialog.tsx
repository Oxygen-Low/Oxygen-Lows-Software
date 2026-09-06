import React, { useState } from "react";
import {
  Download,
  Copy,
  FolderOpen,
  Check,
  Loader2,
  FileImage,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CanvasProject } from "./types";
import { drawBackground, drawLayer } from "./canvasUtils";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: CanvasProject;
}

type ExportFormat = "png" | "jpeg" | "webp";

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  project,
}) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState<number>(1);
  const [quality, setQuality] = useState<number>(92);
  const [isTransparent, setIsTransparent] = useState(
    project.background.type === "transparent",
  );
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportWidth = Math.round(project.width * scale);
  const exportHeight = Math.round(project.height * scale);

  // Generate rendered canvas offscreen
  const renderExportCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");

    ctx.scale(scale, scale);

    // Draw background
    if (format === "jpeg" || !isTransparent) {
      const bg =
        project.background.type === "transparent"
          ? { ...project.background, type: "color" as const, color: "#ffffff" }
          : project.background;
      drawBackground(ctx, project.width, project.height, bg, false);
    } else {
      drawBackground(ctx, project.width, project.height, project.background, false);
    }

    // Draw all visible layers
    for (const layer of project.layers) {
      if (layer.isVisible) {
        drawLayer(ctx, layer);
      }
    }

    return canvas;
  };

  const getBlob = async (canvas: HTMLCanvasElement): Promise<Blob> => {
    const mimeType =
      format === "png"
        ? "image/png"
        : format === "jpeg"
          ? "image/jpeg"
          : "image/webp";

    const q = format === "png" ? undefined : quality / 100;

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas blob conversion failed"));
        },
        mimeType,
        q,
      );
    });
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderExportCanvas();
      const blob = await getBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cleanName = project.name.replace(/[^a-zA-Z0-9_\-]/g, "_") || "design";
      a.download = `${cleanName}.${format}`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("imageStudio.downloadSuccess", undefined, "Image exported successfully!"));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(t("imageStudio.exportFailed", undefined, "Failed to export image."));
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderExportCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
          "image/png",
        );
      });

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);

      setCopied(true);
      toast.success(t("imageStudio.copiedToClipboard", undefined, "Image copied to clipboard!"));
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error(
        t(
          "imageStudio.clipboardError",
          undefined,
          "Could not copy image to clipboard in this browser.",
        ),
      );
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToStorage = async () => {
    if (!userId) {
      toast.error(t("imageStudio.signInToSaveStorage", undefined, "Please sign in to save directly to Storage."));
      return;
    }

    setIsExporting(true);
    try {
      const canvas = await renderExportCanvas();
      const blob = await getBlob(canvas);

      const cleanName = project.name.replace(/[^a-zA-Z0-9_\-]/g, "_") || "design";
      const path = `${userId}/image-studio/exports/${cleanName}_${Date.now()}.${format}`;

      const res = await storage.from("Storage").upload(path, blob, {
        contentType:
          format === "png"
            ? "image/png"
            : format === "jpeg"
              ? "image/jpeg"
              : "image/webp",
        upsert: true,
      });

      if (res.error) throw res.error;

      toast.success(t("imageStudio.savedToStorage", undefined, "Rendered graphic saved to your Storage!"));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(t("imageStudio.storageSaveError", undefined, "Failed to save file to Storage."));
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-popover border-border text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <span>{t("imageStudio.exportGraphic", undefined, "Export Image")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Format Selector */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">{t("imageStudio.fileFormat", undefined, "File Format")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["png", "jpeg", "webp"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`py-2 rounded-lg border font-semibold uppercase text-xs transition-all ${
                    format === fmt
                      ? "border-primary bg-primary/20 text-primary shadow-sm"
                      : "border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Scale Multiplier */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">
              {t("imageStudio.resolutionScale", undefined, "Resolution Scaling")}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { s: 1, label: "1x (Native)" },
                { s: 2, label: "2x (Hi-DPI)" },
                { s: 3, label: "3x (Print)" },
              ].map(({ s, label }) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={`py-2 rounded-lg border font-medium text-xs transition-all ${
                    scale === s
                      ? "border-primary bg-primary/20 text-primary shadow-sm"
                      : "border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("imageStudio.outputSize", undefined, "Output size")}:{" "}
              <span className="font-mono text-foreground font-semibold">
                {exportWidth} × {exportHeight} px
              </span>
            </p>
          </div>

          {/* Quality Slider (for JPEG / WEBP) */}
          {format !== "png" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("imageStudio.quality", undefined, "Quality")}</span>
                <span className="font-mono text-foreground">{quality}%</span>
              </div>
              <Slider
                value={[quality]}
                min={10}
                max={100}
                step={1}
                onValueChange={([val]) => setQuality(val)}
              />
            </div>
          )}

          {/* Transparent Background Toggle (for PNG/WEBP) */}
          {format !== "jpeg" && (
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/40">
              <div>
                <p className="font-medium text-foreground">
                  {t("imageStudio.transparentBg", undefined, "Transparent Background")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("imageStudio.transparentBgDesc", undefined, "Keep empty canvas background transparent")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={isTransparent}
                onChange={(e) => setIsTransparent(e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={handleCopyToClipboard}
            className="w-full sm:w-auto text-xs gap-1.5 border-border hover:bg-accent"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{copied ? t("imageStudio.copied", undefined, "Copied!") : t("imageStudio.copyClipboard", undefined, "Copy to Clipboard")}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={isExporting || !userId}
            onClick={handleSaveToStorage}
            className="w-full sm:w-auto text-xs gap-1.5 border-border hover:bg-accent"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>{t("imageStudio.saveToStorage", undefined, "Save to Storage")}</span>
          </Button>

          <Button
            size="sm"
            disabled={isExporting}
            onClick={handleDownload}
            className="w-full sm:w-auto text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{t("imageStudio.downloadImage", undefined, "Download Image")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
