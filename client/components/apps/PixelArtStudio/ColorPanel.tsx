import React, { useState } from "react";
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  Wand2,
  Palette as PaletteIcon,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PALETTE_PRESETS } from "./palettePresets";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface ColorPanelProps {
  primaryColor: string;
  secondaryColor: string;
  onChangePrimaryColor: (color: string) => void;
  onChangeSecondaryColor: (color: string) => void;
  onSwapColors: () => void;
  activePalette: string[];
  onChangePalette: (colors: string[]) => void;
  onExtractPalette: () => void;
}

export function ColorPanel({
  primaryColor,
  secondaryColor,
  onChangePrimaryColor,
  onChangeSecondaryColor,
  onSwapColors,
  activePalette,
  onChangePalette,
  onExtractPalette,
}: ColorPanelProps) {
  const { t } = useTranslation();
  const [hexInput, setHexInput] = useState(primaryColor);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChangePrimaryColor(val);
    }
  };

  const handleAddColor = () => {
    const norm = primaryColor.toLowerCase();
    if (!activePalette.some((c) => c.toLowerCase() === norm)) {
      onChangePalette([...activePalette, primaryColor]);
    }
  };

  const handleRemoveColor = (colorToRemove: string) => {
    if (activePalette.length <= 1) return;
    onChangePalette(
      activePalette.filter((c) => c.toLowerCase() !== colorToRemove.toLowerCase())
    );
  };

  const handleSelectPreset = (colors: string[]) => {
    onChangePalette([...colors]);
    if (colors.length > 0) {
      onChangePrimaryColor(colors[0]);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-card/70 backdrop-blur-md rounded-xl border border-border shadow-sm w-56">
      {/* Active Color Pairs */}
      <div className="flex items-center justify-between">
        <div className="relative w-14 h-12">
          {/* Secondary Color (underneath) */}
          <div
            className="absolute bottom-0 right-0 w-8 h-8 rounded-md border-2 border-background shadow cursor-pointer transition-transform hover:scale-105"
            style={{ backgroundColor: secondaryColor }}
            onClick={() => onChangePrimaryColor(secondaryColor)}
            title={t("pixelArtStudio.secondaryColor", undefined, "Secondary Color")}
          />
          {/* Primary Color (on top) */}
          <div
            className="absolute top-0 left-0 w-8 h-8 rounded-md border-2 border-background shadow-md cursor-pointer transition-transform hover:scale-105 ring-2 ring-primary/40"
            style={{ backgroundColor: primaryColor }}
            title={t("pixelArtStudio.primaryColor", undefined, "Primary Color")}
          />
        </div>

        {/* Swap Colors Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              onClick={onSwapColors}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.swapColors", undefined, "Swap Colors (X)")}
          </TooltipContent>
        </Tooltip>

        {/* HTML native color input */}
        <div className="relative overflow-hidden w-9 h-9 rounded-lg border border-border shadow-inner cursor-pointer flex items-center justify-center">
          <input
            type="color"
            value={primaryColor.startsWith("#") ? primaryColor : "#000000"}
            onChange={(e) => {
              onChangePrimaryColor(e.target.value);
              setHexInput(e.target.value);
            }}
            className="absolute -top-2 -left-2 w-14 h-14 cursor-pointer opacity-0"
          />
          <div
            className="w-full h-full"
            style={{ backgroundColor: primaryColor }}
          />
        </div>
      </div>

      {/* HEX Input */}
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          onBlur={() => setHexInput(primaryColor)}
          maxLength={7}
          className="h-7 text-xs font-mono uppercase px-2"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 shrink-0"
              onClick={handleAddColor}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t("pixelArtStudio.addToPalette", undefined, "Add to Palette")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="h-px bg-border my-0.5" />

      {/* Palette Header & Presets */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <PaletteIcon className="w-3 h-3" />
          <span>{t("pixelArtStudio.palette", undefined, "Palette")}</span>
        </span>

        <div className="flex items-center gap-1">
          {/* Extract Colors */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={onExtractPalette}
              >
                <Wand2 className="w-3 h-3 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {t("pixelArtStudio.extractPalette", undefined, "Extract colors from canvas")}
            </TooltipContent>
          </Tooltip>

          {/* Preset Select Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-0.5">
                <span>{t("pixelArtStudio.presets", undefined, "Presets")}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs">
              {PALETTE_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => handleSelectPreset(p.colors)}
                  className="flex items-center justify-between"
                >
                  <span>{p.name}</span>
                  <div className="flex gap-0.5">
                    {p.colors.slice(0, 4).map((c, i) => (
                      <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-xs"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Swatches Grid */}
      <div className="grid grid-cols-6 gap-1 max-h-36 overflow-y-auto p-1 bg-background/50 rounded-lg border border-border/60">
        {activePalette.map((color, index) => {
          const isSelected = primaryColor.toLowerCase() === color.toLowerCase();
          return (
            <div
              key={`${color}-${index}`}
              className="group relative w-7 h-7 rounded-sm cursor-pointer transition-transform hover:scale-110 shadow-xs"
              style={{ backgroundColor: color }}
              onClick={() => {
                onChangePrimaryColor(color);
                setHexInput(color);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onChangeSecondaryColor(color);
              }}
            >
              {isSelected && (
                <div className="absolute inset-0 ring-2 ring-primary rounded-sm pointer-events-none" />
              )}
              {/* Quick remove on hover */}
              <button
                type="button"
                className="absolute -top-1 -right-1 hidden group-hover:flex w-3.5 h-3.5 bg-destructive text-destructive-foreground rounded-full items-center justify-center text-[8px]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveColor(color);
                }}
                title={t("common.delete", undefined, "Delete")}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground text-center">
        {t("pixelArtStudio.swatchTip", undefined, "Left-click: Primary • Right-click: Secondary")}
      </div>
    </div>
  );
}
