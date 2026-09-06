import React from "react";
import {
  Square,
  Circle,
  Triangle,
  Star,
  Minus,
  ArrowRight,
  ShieldAlert,
  RectangleHorizontal,
} from "lucide-react";
import { ShapeType } from "./types";
import { useTranslation } from "@/contexts/LanguageContext";

interface ShapesPanelProps {
  onAddShape: (shapeType: ShapeType) => void;
}

export const ShapesPanel: React.FC<ShapesPanelProps> = ({ onAddShape }) => {
  const { t } = useTranslation();

  const shapes: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
    {
      type: "rectangle",
      label: t("imageStudio.rectangle", undefined, "Rectangle"),
      icon: <Square className="w-5 h-5" />,
    },
    {
      type: "rounded-rectangle",
      label: t("imageStudio.roundedRect", undefined, "Rounded Card"),
      icon: <RectangleHorizontal className="w-5 h-5" />,
    },
    {
      type: "circle",
      label: t("imageStudio.circle", undefined, "Circle"),
      icon: <Circle className="w-5 h-5" />,
    },
    {
      type: "triangle",
      label: t("imageStudio.triangle", undefined, "Triangle"),
      icon: <Triangle className="w-5 h-5" />,
    },
    {
      type: "star",
      label: t("imageStudio.star", undefined, "Star"),
      icon: <Star className="w-5 h-5" />,
    },
    {
      type: "line",
      label: t("imageStudio.line", undefined, "Line"),
      icon: <Minus className="w-5 h-5" />,
    },
    {
      type: "arrow",
      label: t("imageStudio.arrow", undefined, "Arrow"),
      icon: <ArrowRight className="w-5 h-5" />,
    },
    {
      type: "badge",
      label: t("imageStudio.badge", undefined, "Badge / Ribbon"),
      icon: <ShieldAlert className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-4 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("imageStudio.geometricShapes", undefined, "Geometric Shapes & Elements")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {shapes.map((s) => (
          <button
            key={s.type}
            onClick={() => onAddShape(s.type)}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-card/60 hover:bg-accent text-foreground hover:border-primary/60 transition-all hover:scale-[1.02] gap-2 group"
          >
            <div className="text-muted-foreground group-hover:text-primary transition-colors">
              {s.icon}
            </div>
            <span className="text-xs font-medium">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
