import React, { useState } from "react";
import {
  Upload,
  Type,
  Square,
  Palette,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { UploadsPanel } from "./UploadsPanel";
import { TextPanel } from "./TextPanel";
import { ShapesPanel } from "./ShapesPanel";
import { BackgroundPanel } from "./BackgroundPanel";
import { LayersPanel } from "./LayersPanel";
import {
  CanvasProject,
  CanvasLayer,
  ShapeType,
  CanvasBackground,
  CustomFont,
} from "./types";
import { useTranslation } from "@/contexts/LanguageContext";

type ActiveTab = "uploads" | "text" | "shapes" | "background" | "layers";

interface LeftSidebarProps {
  project: CanvasProject;
  customFonts: CustomFont[];
  onAddImageToCanvas: (
    src: string,
    width: number,
    height: number,
    storagePath?: string,
  ) => void;
  onAddTextLayer: (
    preset: "heading" | "subheading" | "body",
    fontFamily?: string,
  ) => void;
  onAddCustomFont: (
    name: string,
    url: string,
    storagePath?: string,
    format?: string,
  ) => Promise<string>;
  onAddShape: (shapeType: ShapeType) => void;
  onChangeBackground: (bg: CanvasBackground) => void;
  onSelectLayer: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayerUp: (id: string) => void;
  onMoveLayerDown: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  project,
  customFonts,
  onAddImageToCanvas,
  onAddTextLayer,
  onAddCustomFont,
  onAddShape,
  onChangeBackground,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveLayerUp,
  onMoveLayerDown,
  onDuplicateLayer,
  onDeleteLayer,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("uploads");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "uploads",
      label: t("imageStudio.uploads", undefined, "Uploads"),
      icon: <Upload className="w-5 h-5" />,
    },
    {
      id: "text",
      label: t("imageStudio.text", undefined, "Text"),
      icon: <Type className="w-5 h-5" />,
    },
    {
      id: "shapes",
      label: t("imageStudio.shapes", undefined, "Shapes"),
      icon: <Square className="w-5 h-5" />,
    },
    {
      id: "background",
      label: t("imageStudio.background", undefined, "Background"),
      icon: <Palette className="w-5 h-5" />,
    },
    {
      id: "layers",
      label: t("imageStudio.layers", undefined, "Layers"),
      icon: <Layers className="w-5 h-5" />,
    },
  ];

  const handleTabClick = (tabId: ActiveTab) => {
    if (activeTab === tabId && !isCollapsed) {
      setIsCollapsed(true);
    } else {
      setActiveTab(tabId);
      setIsCollapsed(false);
    }
  };

  return (
    <aside className="flex h-full border-r border-border bg-card/90 backdrop-blur-md z-20 shrink-0">
      {/* Icon Navigation Column */}
      <nav aria-label={t("imageStudio.toolsNav", undefined, "Studio Tools")} className="w-16 border-r border-border bg-card/60 flex flex-col items-center py-3 gap-1 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`w-12 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === tab.id && !isCollapsed
                ? "bg-primary/20 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-medium leading-none truncate max-w-[44px]">
              {tab.label}
            </span>
          </button>
        ))}

        <div className="mt-auto">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? t("imageStudio.expand", undefined, "Expand sidebar") : t("imageStudio.collapse", undefined, "Collapse sidebar")}
            className="w-10 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </nav>

      {/* Expanded Content Panel */}
      {!isCollapsed && (
        <div className="w-72 sm:w-80 h-full overflow-y-auto bg-card/40 flex flex-col">
          {activeTab === "uploads" && (
            <UploadsPanel onAddImageToCanvas={onAddImageToCanvas} />
          )}

          {activeTab === "text" && (
            <TextPanel
              onAddTextLayer={onAddTextLayer}
              customFonts={customFonts}
              onAddCustomFont={onAddCustomFont}
            />
          )}

          {activeTab === "shapes" && <ShapesPanel onAddShape={onAddShape} />}

          {activeTab === "background" && (
            <BackgroundPanel
              background={project.background}
              onChangeBackground={onChangeBackground}
            />
          )}

          {activeTab === "layers" && (
            <LayersPanel
              layers={project.layers}
              selectedLayerId={project.selectedLayerId}
              onSelectLayer={onSelectLayer}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onMoveLayerUp={onMoveLayerUp}
              onMoveLayerDown={onMoveLayerDown}
              onDuplicateLayer={onDuplicateLayer}
              onDeleteLayer={onDeleteLayer}
            />
          )}
        </div>
      )}
    </aside>
  );
};
