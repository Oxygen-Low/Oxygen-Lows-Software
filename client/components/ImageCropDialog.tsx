import React, { useState, useEffect, useRef, useCallback } from "react";
import { Crop, RotateCcw, Check, Loader2 } from "lucide-react";
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
import { useTranslation } from "@/contexts/LanguageContext";
import { TRACK_BACKGROUND_MAX_WIDTH } from "@shared/trackBackgrounds";

export type CropAspect = "free" | "4:1" | "16:9" | "4:3" | "1:1" | "9:16";

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  title?: string;
  defaultAspect?: CropAspect;
  maxWidth?: number;
  onApplyCrop: (blob: Blob) => Promise<void> | void;
}

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  open,
  onOpenChange,
  imageSrc,
  title,
  defaultAspect = "4:1",
  maxWidth = TRACK_BACKGROUND_MAX_WIDTH,
  onApplyCrop,
}) => {
  const { t } = useTranslation();
  const [aspect, setAspect] = useState<CropAspect>(defaultAspect);
  const [cropBox, setCropBox] = useState<{
    x: number; // 0 - 100
    y: number; // 0 - 100
    width: number; // 0 - 100
    height: number; // 0 - 100
  }>({ x: 0, y: 0, width: 100, height: 100 });

  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 500,
    h: 500,
  });

  const imageElementRef = useRef<HTMLImageElement | null>(null);

  const applyAspect = useCallback(
    (newAspect: CropAspect, natW: number, natH: number) => {
      setAspect(newAspect);
      if (!natW || !natH || newAspect === "free") {
        setCropBox({ x: 0, y: 0, width: 100, height: 100 });
        return;
      }

      let targetRatio = 1;
      switch (newAspect) {
        case "4:1":
          targetRatio = 4 / 1;
          break;
        case "16:9":
          targetRatio = 16 / 9;
          break;
        case "4:3":
          targetRatio = 4 / 3;
          break;
        case "1:1":
          targetRatio = 1;
          break;
        case "9:16":
          targetRatio = 9 / 16;
          break;
      }

      const imgRatio = natW / natH;
      let cropWPercent = 100;
      let cropHPercent = 100;

      if (imgRatio > targetRatio) {
        cropHPercent = 100;
        cropWPercent = Math.max(
          5,
          Math.min(100, Math.round((targetRatio / imgRatio) * 100)),
        );
      } else {
        cropWPercent = 100;
        cropHPercent = Math.max(
          5,
          Math.min(100, Math.round((imgRatio / targetRatio) * 100)),
        );
      }

      setCropBox({
        x: Math.max(0, Math.round((100 - cropWPercent) / 2)),
        y: Math.max(0, Math.round((100 - cropHPercent) / 2)),
        width: cropWPercent,
        height: cropHPercent,
      });
    },
    [],
  );

  useEffect(() => {
    if (!open || !imageSrc) {
      setImageLoaded(false);
      return;
    }
    setImageLoaded(false);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageElementRef.current = img;
      const w = img.naturalWidth || 500;
      const h = img.naturalHeight || 500;
      setNaturalSize({ w, h });
      setImageLoaded(true);
      applyAspect(defaultAspect, w, h);
    };
    img.onerror = () => {
      setImageLoaded(false);
    };
    img.src = imageSrc;
  }, [open, imageSrc, defaultAspect, applyAspect]);

  const handleAspectChange = (newAspect: CropAspect) => {
    applyAspect(newAspect, naturalSize.w, naturalSize.h);
  };

  const handleApply = async () => {
    if (!imageElementRef.current || !imageLoaded) return;
    const img = imageElementRef.current;

    const sx = (cropBox.x / 100) * naturalSize.w;
    const sy = (cropBox.y / 100) * naturalSize.h;
    const sw = Math.max(1, (cropBox.width / 100) * naturalSize.w);
    const sh = Math.max(1, (cropBox.height / 100) * naturalSize.h);

    let outW = Math.round(sw);
    let outH = Math.round(sh);

    if (maxWidth && outW > maxWidth) {
      const scale = maxWidth / outW;
      outW = maxWidth;
      outH = Math.max(1, Math.round(sh * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    setLoading(true);
    try {
      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob(
          (b) => {
            if (b) return resolve(b);
            // Fallback to png if webp not supported
            canvas.toBlob((fallback) => resolve(fallback), "image/png");
          },
          "image/webp",
          0.9,
        );
      });

      if (!blob) throw new Error("Failed to encode cropped image");

      await onApplyCrop(blob);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAspect("free");
    setCropBox({ x: 0, y: 0, width: 100, height: 100 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-popover border-border text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-primary" />
            <span>
              {title || t("imageStudio.cropImage", undefined, "Crop Image")}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Aspect Ratio Presets */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">
              {t("imageStudio.aspectRatio", undefined, "Aspect Ratio")}
            </Label>
            <div className="grid grid-cols-6 gap-1.5">
              {(["4:1", "16:9", "4:3", "1:1", "9:16", "free"] as const).map(
                (asp) => (
                  <button
                    key={asp}
                    type="button"
                    onClick={() => handleAspectChange(asp)}
                    className={`py-1.5 rounded-md border text-[11px] font-medium uppercase transition-all ${
                      aspect === asp
                        ? "border-primary bg-primary/20 text-primary shadow-sm"
                        : "border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {asp}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Crop Area Preview with Bounding Mask */}
          <div className="relative w-full h-64 bg-slate-950 rounded-xl overflow-hidden border border-border flex items-center justify-center p-2 select-none">
            {!imageLoaded && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {imageLoaded && imageSrc && (
              <div className="relative max-w-full max-h-full flex items-center justify-center">
                <img
                  src={imageSrc}
                  alt="Crop preview"
                  className="max-h-60 max-w-full object-contain pointer-events-none rounded"
                />

                {/* Crop Box Overlay */}
                <div
                  className="absolute border-2 border-primary bg-primary/15 shadow-[0_0_12px_rgba(6,182,212,0.4)] pointer-events-none transition-all duration-75"
                  style={{
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                  }}
                >
                  {/* Grid Lines inside crop box */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fine Tuning Sliders */}
          <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg border border-border bg-card/40">
            <div>
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>{t("imageStudio.cropWidth", undefined, "Width")}</span>
                <span>{cropBox.width}%</span>
              </div>
              <Slider
                value={[cropBox.width]}
                min={10}
                max={100 - cropBox.x}
                step={1}
                onValueChange={([w]) =>
                  setCropBox((prev) => ({ ...prev, width: w }))
                }
              />
            </div>

            <div>
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>{t("imageStudio.cropHeight", undefined, "Height")}</span>
                <span>{cropBox.height}%</span>
              </div>
              <Slider
                value={[cropBox.height]}
                min={10}
                max={100 - cropBox.y}
                step={1}
                onValueChange={([h]) =>
                  setCropBox((prev) => ({ ...prev, height: h }))
                }
              />
            </div>

            <div>
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>
                  {t("imageStudio.offsetX", undefined, "Horizontal Offset")}
                </span>
                <span>{cropBox.x}%</span>
              </div>
              <Slider
                value={[cropBox.x]}
                min={0}
                max={100 - cropBox.width}
                step={1}
                onValueChange={([x]) => setCropBox((prev) => ({ ...prev, x }))}
              />
            </div>

            <div>
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>
                  {t("imageStudio.offsetY", undefined, "Vertical Offset")}
                </span>
                <span>{cropBox.y}%</span>
              </div>
              <Slider
                value={[cropBox.y]}
                min={0}
                max={100 - cropBox.height}
                step={1}
                onValueChange={([y]) => setCropBox((prev) => ({ ...prev, y }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={loading}
            className="text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("imageStudio.resetCrop", undefined, "Reset Crop")}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs"
            >
              {t("imageStudio.close", undefined, "Cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={loading || !imageLoaded}
              className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{t("imageStudio.applyCrop", undefined, "Apply Crop")}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
