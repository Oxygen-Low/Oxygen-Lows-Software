import React, { useState, useEffect, useRef } from "react";
import { Crop, RotateCcw, Check } from "lucide-react";
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
import { ImageLayer } from "./types";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layer: ImageLayer | null;
  onApplyCrop: (
    layerId: string,
    croppedDataUrl: string,
    width: number,
    height: number,
  ) => void;
}

type CropAspect = "free" | "1:1" | "16:9" | "4:3" | "3:2" | "9:16";

export const CropDialog: React.FC<CropDialogProps> = ({
  open,
  onOpenChange,
  layer,
  onApplyCrop,
}) => {
  const { t } = useTranslation();
  const [aspect, setAspect] = useState<CropAspect>("free");
  const [cropBox, setCropBox] = useState<{
    x: number; // 0 - 100
    y: number; // 0 - 100
    width: number; // 0 - 100
    height: number; // 0 - 100
  }>({ x: 0, y: 0, width: 100, height: 100 });

  const [, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 500,
    h: 500,
  });

  const imageElementRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open || !layer) return;
    setCropBox({ x: 0, y: 0, width: 100, height: 100 });
    setAspect("free");
    setImageLoaded(false);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageElementRef.current = img;
      setNaturalSize({
        w: img.naturalWidth || layer.width,
        h: img.naturalHeight || layer.height,
      });
      setImageLoaded(true);
    };
    img.src = layer.src;
  }, [open, layer]);

  // Adjust crop box when aspect ratio changes
  const handleAspectChange = (newAspect: CropAspect) => {
    setAspect(newAspect);
    if (!imageElementRef.current || newAspect === "free") return;

    let targetRatio = 1;
    switch (newAspect) {
      case "1:1":
        targetRatio = 1;
        break;
      case "16:9":
        targetRatio = 16 / 9;
        break;
      case "4:3":
        targetRatio = 4 / 3;
        break;
      case "3:2":
        targetRatio = 3 / 2;
        break;
      case "9:16":
        targetRatio = 9 / 16;
        break;
    }

    const imgW = naturalSize.w;
    const imgH = naturalSize.h;
    const imgRatio = imgW / imgH;

    let cropWPercent = 100;
    let cropHPercent = 100;

    if (imgRatio > targetRatio) {
      // Image is wider than target ratio
      cropHPercent = 100;
      cropWPercent = Math.round((targetRatio / imgRatio) * 100);
    } else {
      // Image is taller than target ratio
      cropWPercent = 100;
      cropHPercent = Math.round((imgRatio / targetRatio) * 100);
    }

    setCropBox({
      x: Math.round((100 - cropWPercent) / 2),
      y: Math.round((100 - cropHPercent) / 2),
      width: cropWPercent,
      height: cropHPercent,
    });
  };

  const handleApply = () => {
    if (!layer || !imageElementRef.current) return;
    const img = imageElementRef.current;

    const sx = (cropBox.x / 100) * naturalSize.w;
    const sy = (cropBox.y / 100) * naturalSize.h;
    const sw = Math.max(1, (cropBox.width / 100) * naturalSize.w);
    const sh = Math.max(1, (cropBox.height / 100) * naturalSize.h);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const croppedUrl = canvas.toDataURL("image/png");

    // Maintain proportional layer scaling on canvas
    const currentLayerAspect = layer.width / layer.height;
    const newAspect = sw / sh;
    let newWidth = layer.width;
    let newHeight = layer.height;

    if (newAspect > currentLayerAspect) {
      newHeight = Math.round(layer.width / newAspect);
    } else {
      newWidth = Math.round(layer.height * newAspect);
    }

    onApplyCrop(layer.id, croppedUrl, newWidth, newHeight);
    toast.success(t("imageStudio.cropSuccess", undefined, "Image cropped successfully!"));
    onOpenChange(false);
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
            <span>{t("imageStudio.cropImage", undefined, "Crop Image")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Aspect Ratio Presets */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">
              {t("imageStudio.aspectRatio", undefined, "Aspect Ratio")}
            </Label>
            <div className="grid grid-cols-6 gap-1.5">
              {(["free", "1:1", "16:9", "4:3", "3:2", "9:16"] as const).map(
                (asp) => (
                  <button
                    key={asp}
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
            {layer && (
              <div className="relative max-w-full max-h-full flex items-center justify-center">
                <img
                  src={layer.src}
                  alt="Crop preview"
                  className="max-h-60 max-w-full object-contain pointer-events-none rounded"
                />

                {/* Crop Box Overlay */}
                <div
                  className="absolute border-2 border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(6,182,212,0.4)] pointer-events-none transition-all duration-75"
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
                <span>{t("imageStudio.offsetX", undefined, "Horizontal Offset")}</span>
                <span>{cropBox.x}%</span>
              </div>
              <Slider
                value={[cropBox.x]}
                min={0}
                max={100 - cropBox.width}
                step={1}
                onValueChange={([x]) =>
                  setCropBox((prev) => ({ ...prev, x }))
                }
              />
            </div>

            <div>
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>{t("imageStudio.offsetY", undefined, "Vertical Offset")}</span>
                <span>{cropBox.y}%</span>
              </div>
              <Slider
                value={[cropBox.y]}
                min={0}
                max={100 - cropBox.height}
                step={1}
                onValueChange={([y]) =>
                  setCropBox((prev) => ({ ...prev, y }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("imageStudio.resetCrop", undefined, "Reset Crop")}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              {t("imageStudio.close", undefined, "Cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t("imageStudio.applyCrop", undefined, "Apply Crop")}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
