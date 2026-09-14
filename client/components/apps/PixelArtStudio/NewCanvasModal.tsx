import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/contexts/LanguageContext";

interface NewCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
  currentWidth: number;
  currentHeight: number;
}

const PRESETS = [
  { label: "8x8 (Icon)", w: 8, h: 8 },
  { label: "16x16 (Retro)", w: 16, h: 16 },
  { label: "32x32 (Standard)", w: 32, h: 32 },
  { label: "64x64 (Detailed)", w: 64, h: 64 },
  { label: "128x128 (Large)", w: 128, h: 128 },
];

export function NewCanvasModal({
  isOpen,
  onClose,
  onCreate,
  currentWidth,
  currentHeight,
}: NewCanvasModalProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);

  const handleSelectPreset = (w: number, h: number) => {
    setWidth(w);
    setHeight(h);
  };

  const handleConfirm = () => {
    const finalW = Math.min(128, Math.max(4, width || 32));
    const finalH = Math.min(128, Math.max(4, height || 32));
    onCreate(finalW, finalH);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {t("pixelArtStudio.newCanvasTitle", undefined, "New Pixel Canvas")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pixelArtStudio.presets", undefined, "Presets")}
            </Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {PRESETS.map((p) => (
                <Button
                  key={`${p.w}x${p.h}`}
                  type="button"
                  variant={width === p.w && height === p.h ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectPreset(p.w, p.h)}
                  className="text-xs justify-start"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <Label htmlFor="canvas-width" className="text-xs">
                {t("pixelArtStudio.width", undefined, "Width (px)")}
              </Label>
              <Input
                id="canvas-width"
                type="number"
                min={4}
                max={128}
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 4)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="canvas-height" className="text-xs">
                {t("pixelArtStudio.height", undefined, "Height (px)")}
              </Label>
              <Input
                id="canvas-height"
                type="number"
                min={4}
                max={128}
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value) || 4)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "pixelArtStudio.newCanvasWarning",
              undefined,
              "Creating a new canvas will reset unsaved artwork. Be sure to export or save your current project."
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", undefined, "Cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            {t("pixelArtStudio.create", undefined, "Create Canvas")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
