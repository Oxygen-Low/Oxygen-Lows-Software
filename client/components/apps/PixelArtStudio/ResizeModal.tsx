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
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/contexts/LanguageContext";

interface ResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResize: (newWidth: number, newHeight: number, rescaleContent: boolean) => void;
  currentWidth: number;
  currentHeight: number;
}

export function ResizeModal({
  isOpen,
  onClose,
  onResize,
  currentWidth,
  currentHeight,
}: ResizeModalProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);
  const [rescaleContent, setRescaleContent] = useState(false);

  const handleConfirm = () => {
    const finalW = Math.min(128, Math.max(4, width || 32));
    const finalH = Math.min(128, Math.max(4, height || 32));
    onResize(finalW, finalH, rescaleContent);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {t("pixelArtStudio.resizeCanvasTitle", undefined, "Resize Canvas")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="resize-width" className="text-xs">
                {t("pixelArtStudio.width", undefined, "Width (px)")}
              </Label>
              <Input
                id="resize-width"
                type="number"
                min={4}
                max={128}
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 4)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="resize-height" className="text-xs">
                {t("pixelArtStudio.height", undefined, "Height (px)")}
              </Label>
              <Input
                id="resize-height"
                type="number"
                min={4}
                max={128}
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value) || 4)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center justify-between space-x-2 pt-2 border-t border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t("pixelArtStudio.rescaleContent", undefined, "Rescale Artwork")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "pixelArtStudio.rescaleDesc",
                  undefined,
                  "Stretch/shrink existing pixels to fit new dimensions."
                )}
              </p>
            </div>
            <Switch
              checked={rescaleContent}
              onCheckedChange={setRescaleContent}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", undefined, "Cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            {t("pixelArtStudio.applyResize", undefined, "Apply Resize")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
