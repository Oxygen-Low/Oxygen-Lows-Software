/**
 * CatalogDrawer.tsx
 * Left slide-out drawer for adding procedural 3D objects, custom GLB/GLTF models,
 * and custom image poster frames into the scene.
 */

import React, { useState, useMemo, useRef } from "react";
import { CustomProps, PosterFrameStyle } from "@/types/threeDBackground";
import {
  CATALOG_ITEMS,
  CatalogCategory,
  CatalogItemDefinition,
} from "@/services/3d/catalog/CatalogDefinitions";
import { GLTFLoaderPipeline } from "@/services/3d/assets/GLTFLoaderPipeline";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Armchair,
  Box,
  DoorOpen,
  FileCode,
  Frame,
  Grid,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Trees,
  Upload,
  Columns,
  X,
} from "lucide-react";

export interface CatalogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (catalogId: string, customProps?: CustomProps) => void;
  onUploadGlb?: (file: File) => Promise<void>;
  onUploadPoster?: (file: File, options: { frameStyle: PosterFrameStyle; aspectRatio: number }) => Promise<void>;
}

type TabCategory = "all" | CatalogCategory | "custom";

export const CatalogDrawer: React.FC<CatalogDrawerProps> = ({
  isOpen,
  onClose,
  onAddItem,
  onUploadGlb,
  onUploadPoster,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Custom GLB Upload state
  const [isUploadingGlb, setIsUploadingGlb] = useState(false);
  const [glbError, setGlbError] = useState<string | null>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);

  // Custom Poster state
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [selectedFrameStyle, setSelectedFrameStyle] = useState<PosterFrameStyle>("modern_black");
  const [aspectRatioPreset, setAspectRatioPreset] = useState<string>("original");
  const [detectedRatio, setDetectedRatio] = useState<number>(1.0);
  const posterInputRef = useRef<HTMLInputElement>(null);

  // Filter items
  const filteredItems = useMemo(() => {
    return CATALOG_ITEMS.filter((item) => {
      // Category filter
      if (activeTab !== "all" && activeTab !== "custom" && item.category !== activeTab) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const localizedName = t(item.nameKey, undefined, item.defaultName).toLowerCase();
        const defaultName = item.defaultName.toLowerCase();
        const catalogId = item.catalogId.toLowerCase();
        return (
          localizedName.includes(query) ||
          defaultName.includes(query) ||
          catalogId.includes(query)
        );
      }

      return true;
    });
  }, [activeTab, searchQuery, t]);

  // Handle GLB upload
  const handleGlbFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGlbError(null);

    // 25MB limit guard
    if (file.size > 25 * 1024 * 1024) {
      setGlbError(t("threeDBackground.modelTooLarge", undefined, "File exceeds 25MB maximum limit"));
      return;
    }

    setIsUploadingGlb(true);
    try {
      // Validate binary header for .glb
      if (file.name.toLowerCase().endsWith(".glb")) {
        const buffer = await file.slice(0, 16).arrayBuffer();
        const isValid = GLTFLoaderPipeline.validateBinaryHeader(buffer);
        if (!isValid) {
          throw new Error(t("threeDBackground.corruptGlb", undefined, "Invalid GLB binary magic header"));
        }
      }

      if (onUploadGlb) {
        await onUploadGlb(file);
      }
      e.target.value = "";
    } catch (err: any) {
      setGlbError(err?.message || "Failed to load 3D model");
    } finally {
      setIsUploadingGlb(false);
    }
  };

  // Handle Poster file selection
  const handlePosterFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPosterError(null);
    setPosterFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPosterPreview(dataUrl);

      // Detect natural aspect ratio (clamped to [0.05, 20] per CustomPropsSchema)
      const img = new Image();
      img.onload = () => {
        const rawRatio = img.naturalWidth / (img.naturalHeight || 1);
        const ratio = Math.max(0.05, Math.min(20, rawRatio));
        setDetectedRatio(ratio);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Submit Poster
  const handleGeneratePoster = async () => {
    if (!posterFile || !onUploadPoster) return;

    let targetRatio = detectedRatio;
    if (aspectRatioPreset === "1:1") targetRatio = 1.0;
    else if (aspectRatioPreset === "4:3") targetRatio = 4 / 3;
    else if (aspectRatioPreset === "16:9") targetRatio = 16 / 9;
    else if (aspectRatioPreset === "3:4") targetRatio = 3 / 4;
    else if (aspectRatioPreset === "9:16") targetRatio = 9 / 16;
    targetRatio = Math.max(0.05, Math.min(20, targetRatio));

    setIsUploadingPoster(true);
    try {
      await onUploadPoster(posterFile, {
        frameStyle: selectedFrameStyle,
        aspectRatio: targetRatio,
      });
      setPosterFile(null);
      setPosterPreview(null);
    } catch (err: any) {
      setPosterError(err?.message || "Failed to generate poster frame");
    } finally {
      setIsUploadingPoster(false);
    }
  };

  const getCategoryIcon = (category: CatalogCategory) => {
    switch (category) {
      case "walls":
        return <Columns className="w-4 h-4 text-cyan-400" />;
      case "floors":
        return <Grid className="w-4 h-4 text-amber-400" />;
      case "openings":
        return <DoorOpen className="w-4 h-4 text-emerald-400" />;
      case "furniture":
        return <Armchair className="w-4 h-4 text-blue-400" />;
      case "outdoor":
        return <Trees className="w-4 h-4 text-green-400" />;
      case "decor":
        return <Frame className="w-4 h-4 text-purple-400" />;
      default:
        return <Box className="w-4 h-4 text-slate-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="absolute top-14 left-0 bottom-0 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 z-30 flex flex-col shadow-2xl text-white">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="w-5 h-5 text-cyan-400" />
          <h2 className="font-semibold text-sm">
            {t("threeDBackground.catalog", undefined, "Object Catalog")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-800/80">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("threeDBackground.catalogSearch", undefined, "Search catalog items...")}
            className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-slate-800/80 overflow-x-auto no-scrollbar text-xs">
        {[
          { id: "all", label: t("threeDBackground.catalogCategoryAll", undefined, "All") },
          { id: "walls", label: t("threeDBackground.catalogCategoryWalls", undefined, "Walls") },
          { id: "floors", label: t("threeDBackground.catalogCategoryFloors", undefined, "Floors") },
          { id: "openings", label: t("threeDBackground.catalogCategoryOpenings", undefined, "Openings") },
          { id: "furniture", label: t("threeDBackground.catalogCategoryFurniture", undefined, "Furniture") },
          { id: "outdoor", label: t("threeDBackground.catalogCategoryOutdoor", undefined, "Outdoor") },
          { id: "decor", label: t("threeDBackground.catalogCategoryDecor", undefined, "Decor") },
          { id: "custom", label: t("threeDBackground.catalogCategoryCustom", undefined, "Custom") },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TabCategory)}
            className={cn(
              "px-2.5 py-1 rounded-md whitespace-nowrap font-medium transition",
              activeTab === tab.id
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "custom" ? (
          <div className="space-y-6">
            {/* 1. Custom GLB / GLTF Model Upload */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-slate-200">
                  {t("threeDBackground.uploadGlb", undefined, "Upload 3D Model (.glb / .gltf)")}
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Models are normalized to 1.5m max dimension and bottom-centered to floor level (max 25MB).
              </p>

              <div
                onClick={() => glbInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-lg p-5 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 transition group"
              >
                {isUploadingGlb ? (
                  <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                ) : (
                  <Upload className="w-7 h-7 text-slate-400 group-hover:text-cyan-400 transition" />
                )}
                <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                  {isUploadingGlb
                    ? t("common.uploading", undefined, "Processing 3D Model...")
                    : t("threeDBackground.chooseModelFile", undefined, "Click or drag .glb file here")}
                </span>
                <span className="text-[10px] text-slate-500">Supported: .glb, .gltf</span>
              </div>
              {glbError && <p className="text-xs text-red-400">{glbError}</p>}
              <input
                ref={glbInputRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleGlbFileSelect}
              />
            </div>

            {/* 2. Custom Image Poster Frame Generator */}
            <div className="space-y-2.5 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-slate-200">
                  {t("threeDBackground.uploadPoster", undefined, "Custom Image Poster Frame")}
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Upload any artwork or photo to frame and hang on walls.
              </p>

              <div
                onClick={() => posterInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 transition group"
              >
                {posterPreview ? (
                  <div className="relative w-28 h-20 bg-slate-950 rounded overflow-hidden flex items-center justify-center">
                    <img src={posterPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-purple-400 transition" />
                )}
                <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                  {posterFile ? posterFile.name : t("threeDBackground.chooseImage", undefined, "Select Image File")}
                </span>
              </div>
              <input
                ref={posterInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handlePosterFileSelect}
              />

              {posterFile && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      {t("threeDBackground.aspectRatio", undefined, "Aspect Ratio")}
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {["original", "1:1", "4:3", "16:9", "3:4", "9:16"].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatioPreset(ratio)}
                          className={cn(
                            "py-1 rounded text-[10px] font-mono border text-center capitalize",
                            aspectRatioPreset === ratio
                              ? "bg-purple-600 border-purple-500 text-white font-bold"
                              : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                          )}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      {t("threeDBackground.frameStyle", undefined, "Frame Style")}
                    </label>
                    <select
                      value={selectedFrameStyle}
                      onChange={(e) => setSelectedFrameStyle(e.target.value as PosterFrameStyle)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="modern_black">Modern Matte Black</option>
                      <option value="oak_wood">Warm Oak Woodgrain</option>
                      <option value="brushed_gold">Brushed Brass / Gold</option>
                      <option value="white_minimal">Crisp White Minimal</option>
                      <option value="frameless">Frameless Canvas Wrap</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isUploadingPoster}
                    onClick={handleGeneratePoster}
                    className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isUploadingPoster ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{t("threeDBackground.createPoster", undefined, "Place Poster in Room")}</span>
                  </button>
                </div>
              )}
              {posterError && <p className="text-xs text-red-400">{posterError}</p>}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <Box className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs">
              {t("threeDBackground.catalogNoItems", undefined, "No catalog items found")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map((item: CatalogItemDefinition) => (
              <button
                key={item.catalogId}
                type="button"
                onClick={() => onAddItem(item.catalogId)}
                className="group p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/60 transition-all flex flex-col items-start gap-2 text-left shadow-sm hover:shadow-cyan-500/10"
              >
                <div className="w-full h-16 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center group-hover:bg-slate-900 transition">
                  <div className="p-2 rounded-lg bg-slate-800/80 group-hover:bg-cyan-950/50 transition">
                    {getCategoryIcon(item.category)}
                  </div>
                </div>

                <div className="w-full min-w-0">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate block">
                    {t(item.nameKey, undefined, item.defaultName)}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {item.defaultDimensions.join(" × ")}m
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default CatalogDrawer;
