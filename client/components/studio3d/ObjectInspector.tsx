/**
 * ObjectInspector.tsx
 * Right side panel for inspecting and modifying selected 3D room objects:
 * numerical transform inputs, color tints, contextual poster/light controls,
 * duplication, floor alignment, and deletion.
 */

import React, { useState } from "react";
import { RoomObject, PosterFrameStyle } from "@/types/threeDBackground";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  Copy,
  Eye,
  EyeOff,
  Focus,
  Frame,
  Lightbulb,
  Link2,
  Lock,
  MousePointerClick,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Unlink2,
  Upload,
  X,
} from "lucide-react";

export interface ObjectInspectorProps {
  selectedObject: RoomObject | null;
  onUpdateObject: (updated: RoomObject) => void;
  onDuplicateObject: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onFloorAlign: (id: string) => void;
  onFocusObject: (id: string) => void;
  onClose?: () => void;
}

const COLOR_SWATCHES = [
  { name: "Classic White", color: "#FFFFFF" },
  { name: "Slate Grey", color: "#1E293B" },
  { name: "Parquet Walnut", color: "#8B5A2B" },
  { name: "Brushed Gold", color: "#D4AF37" },
  { name: "Emerald Green", color: "#10B981" },
  { name: "Crimson Red", color: "#DC2626" },
  { name: "Cyan Neon", color: "#06B6D4" },
  { name: "Royal Violet", color: "#8B5CF6" },
];

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({
  selectedObject,
  onUpdateObject,
  onDuplicateObject,
  onDeleteObject,
  onFloorAlign,
  onFocusObject,
  onClose,
}) => {
  const { t } = useLanguage();
  const [uniformScale, setUniformScale] = useState(true);

  if (!selectedObject) {
    return (
      <aside className="absolute top-14 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 z-30 flex flex-col shadow-2xl text-white">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <h2 className="font-semibold text-sm">
              {t("threeDBackground.inspector", undefined, "Object Inspector")}
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3">
          <MousePointerClick className="w-10 h-10 opacity-40 text-cyan-400" />
          <p className="text-xs max-w-[200px]">
            {t("threeDBackground.noObjectSelected", undefined, "No object selected. Click an item in the scene to inspect.")}
          </p>
        </div>
      </aside>
    );
  }

  // --- Transform Change Handlers ---
  const handlePositionChange = (axis: 0 | 1 | 2, val: number) => {
    const nextPos = [...selectedObject.transform.position] as [number, number, number];
    nextPos[axis] = isFinite(val) ? val : 0;
    onUpdateObject({
      ...selectedObject,
      transform: { ...selectedObject.transform, position: nextPos },
    });
  };

  const handleRotationChange = (axis: 0 | 1 | 2, degVal: number) => {
    const rad = (degVal * Math.PI) / 180;
    const nextRot = [...selectedObject.transform.rotation] as [number, number, number];
    nextRot[axis] = isFinite(rad) ? rad : 0;
    onUpdateObject({
      ...selectedObject,
      transform: { ...selectedObject.transform, rotation: nextRot },
    });
  };

  const handleScaleChange = (axis: 0 | 1 | 2, val: number) => {
    const safeVal = isFinite(val) && val > 0 ? val : 0.01;
    let nextScale = [...selectedObject.transform.scale] as [number, number, number];

    if (uniformScale) {
      const prev = selectedObject.transform.scale[axis] || 1;
      const factor = safeVal / prev;
      nextScale = [
        Math.max(0.01, nextScale[0] * factor),
        Math.max(0.01, nextScale[1] * factor),
        Math.max(0.01, nextScale[2] * factor),
      ];
    } else {
      nextScale[axis] = safeVal;
    }

    onUpdateObject({
      ...selectedObject,
      transform: { ...selectedObject.transform, scale: nextScale },
    });
  };

  // Convert radians to degrees for UI
  const rotDegX = Math.round((selectedObject.transform.rotation[0] * 180) / Math.PI);
  const rotDegY = Math.round((selectedObject.transform.rotation[1] * 180) / Math.PI);
  const rotDegZ = Math.round((selectedObject.transform.rotation[2] * 180) / Math.PI);

  const isPoster =
    selectedObject.catalogId === "decor_poster_frame" ||
    Boolean(selectedObject.customProps?.imageUrl);

  const isLamp = selectedObject.catalogId.includes("lamp");

  return (
    <aside className="absolute top-14 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 z-30 flex flex-col shadow-2xl text-white">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="font-semibold text-sm truncate">
            {selectedObject.name}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onUpdateObject({ ...selectedObject, visible: !selectedObject.visible })}
            className={cn(
              "p-1.5 rounded text-xs transition",
              selectedObject.visible
                ? "text-slate-300 hover:text-white"
                : "text-amber-400 hover:text-amber-300 bg-amber-950/40"
            )}
            title={selectedObject.visible ? "Hide Object" : "Show Object"}
          >
            {selectedObject.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onUpdateObject({ ...selectedObject, locked: !selectedObject.locked })}
            className={cn(
              "p-1.5 rounded text-xs transition",
              selectedObject.locked
                ? "text-red-400 hover:text-red-300 bg-red-950/40"
                : "text-slate-300 hover:text-white"
            )}
            title={selectedObject.locked ? "Unlock Object" : "Lock Object"}
          >
            {selectedObject.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Name & Catalog Tag */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400">
            {t("threeDBackground.objectName", undefined, "Object Name")}
          </label>
          <input
            type="text"
            value={selectedObject.name}
            onChange={(e) => onUpdateObject({ ...selectedObject, name: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span className="font-mono">{selectedObject.catalogId}</span>
            <span className="capitalize">{selectedObject.type}</span>
          </div>
        </div>

        {/* 1. POSITION CONTROLS */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>{t("threeDBackground.position", undefined, "Position (m)")}</span>
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <div className="text-[10px] font-mono text-red-400 mb-0.5">X</div>
              <input
                type="number"
                step="0.1"
                value={Number(selectedObject.transform.position[0].toFixed(2))}
                onChange={(e) => handlePositionChange(0, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-green-400 mb-0.5">Y</div>
              <input
                type="number"
                step="0.1"
                value={Number(selectedObject.transform.position[1].toFixed(2))}
                onChange={(e) => handlePositionChange(1, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-blue-400 mb-0.5">Z</div>
              <input
                type="number"
                step="0.1"
                value={Number(selectedObject.transform.position[2].toFixed(2))}
                onChange={(e) => handlePositionChange(2, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* 2. ROTATION CONTROLS */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>{t("threeDBackground.rotation", undefined, "Rotation (deg)")}</span>
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <div className="text-[10px] font-mono text-red-400 mb-0.5">X°</div>
              <input
                type="number"
                step="5"
                value={rotDegX}
                onChange={(e) => handleRotationChange(0, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-green-400 mb-0.5">Y°</div>
              <input
                type="number"
                step="5"
                value={rotDegY}
                onChange={(e) => handleRotationChange(1, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-blue-400 mb-0.5">Z°</div>
              <input
                type="number"
                step="5"
                value={rotDegZ}
                onChange={(e) => handleRotationChange(2, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* 3. SCALE CONTROLS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">
              {t("threeDBackground.scaleLabel", undefined, "Scale")}
            </span>
            <button
              type="button"
              onClick={() => setUniformScale(!uniformScale)}
              className={cn(
                "p-1 rounded text-xs transition flex items-center gap-1",
                uniformScale ? "text-cyan-400" : "text-slate-500 hover:text-slate-400"
              )}
              title={uniformScale ? "Uniform scaling locked" : "Independent axis scaling"}
            >
              {uniformScale ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
              <span className="text-[10px]">{uniformScale ? "Uniform" : "Free"}</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <div className="text-[10px] font-mono text-red-400 mb-0.5">SX</div>
              <input
                type="number"
                step="0.1"
                min="0.05"
                value={Number(selectedObject.transform.scale[0].toFixed(2))}
                onChange={(e) => handleScaleChange(0, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-green-400 mb-0.5">SY</div>
              <input
                type="number"
                step="0.1"
                min="0.05"
                value={Number(selectedObject.transform.scale[1].toFixed(2))}
                onChange={(e) => handleScaleChange(1, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono text-blue-400 mb-0.5">SZ</div>
              <input
                type="number"
                step="0.1"
                min="0.05"
                value={Number(selectedObject.transform.scale[2].toFixed(2))}
                onChange={(e) => handleScaleChange(2, parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* 4. COLOR TINT PICKER & SWATCHES */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-[11px] font-semibold text-slate-400 block">
            {t("threeDBackground.colorTint", undefined, "Color Tint")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={selectedObject.customProps?.colorTint || "#FFFFFF"}
              onChange={(e) =>
                onUpdateObject({
                  ...selectedObject,
                  customProps: { ...selectedObject.customProps, colorTint: e.target.value },
                })
              }
              className="w-8 h-8 rounded border border-slate-700 bg-slate-800 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={selectedObject.customProps?.colorTint || "#FFFFFF"}
              onChange={(e) =>
                onUpdateObject({
                  ...selectedObject,
                  customProps: { ...selectedObject.customProps, colorTint: e.target.value },
                })
              }
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.name}
                type="button"
                onClick={() =>
                  onUpdateObject({
                    ...selectedObject,
                    customProps: { ...selectedObject.customProps, colorTint: swatch.color },
                  })
                }
                className={cn(
                  "h-6 rounded border transition flex items-center justify-center",
                  selectedObject.customProps?.colorTint?.toUpperCase() === swatch.color.toUpperCase()
                    ? "border-cyan-400 ring-1 ring-cyan-400 scale-105"
                    : "border-slate-700 hover:border-slate-500"
                )}
                style={{ backgroundColor: swatch.color }}
                title={swatch.name}
              />
            ))}
          </div>
        </div>

        {/* 5. CONTEXTUAL POSTER CONTROLS */}
        {isPoster && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <Frame className="w-4 h-4 text-purple-400" />
              <span className="text-[11px] font-semibold text-slate-200">
                {t("threeDBackground.posterOptions", undefined, "Poster Frame Options")}
              </span>
            </div>

            {selectedObject.customProps?.imageUrl && (
              <div className="w-full h-24 bg-slate-950 rounded border border-slate-800 flex items-center justify-center overflow-hidden">
                <img
                  src={selectedObject.customProps.imageUrl}
                  alt="Poster"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                {t("threeDBackground.frameStyle", undefined, "Frame Style")}
              </label>
              <select
                value={selectedObject.customProps?.frameStyle || "modern_black"}
                onChange={(e) =>
                  onUpdateObject({
                    ...selectedObject,
                    customProps: {
                      ...selectedObject.customProps,
                      frameStyle: e.target.value as PosterFrameStyle,
                    },
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="modern_black">Modern Matte Black</option>
                <option value="oak_wood">Warm Oak Woodgrain</option>
                <option value="brushed_gold">Brushed Brass / Gold</option>
                <option value="white_minimal">Crisp White Minimal</option>
                <option value="frameless">Frameless Canvas Wrap</option>
              </select>
            </div>
          </div>
        )}

        {/* 6. CONTEXTUAL LAMP CONTROLS */}
        {isLamp && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="text-[11px] font-semibold text-slate-200">
                {t("threeDBackground.lightOptions", undefined, "Light Source Controls")}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span>{t("threeDBackground.lightIntensity", undefined, "Intensity")}</span>
                <span>{selectedObject.customProps?.lightIntensity ?? 1.5}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="5.0"
                step="0.1"
                value={selectedObject.customProps?.lightIntensity ?? 1.5}
                onChange={(e) =>
                  onUpdateObject({
                    ...selectedObject,
                    customProps: {
                      ...selectedObject.customProps,
                      lightIntensity: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 7. QUICK ACTION BUTTONS */}
        <div className="pt-3 border-t border-slate-800 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onFloorAlign(selectedObject.id)}
              className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition"
              title={t("threeDBackground.floorAlign", undefined, "Align to Floor (End)")}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>{t("threeDBackground.floorAlignShort", undefined, "Floor Align")}</span>
            </button>

            <button
              type="button"
              onClick={() => onFocusObject(selectedObject.id)}
              className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition"
              title={t("threeDBackground.focusObject", undefined, "Focus Camera (F)")}
            >
              <Focus className="w-3.5 h-3.5" />
              <span>{t("threeDBackground.focus", undefined, "Focus")}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDuplicateObject(selectedObject.id)}
            className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition"
            title={t("threeDBackground.duplicate", undefined, "Duplicate (Ctrl+D)")}
          >
            <Copy className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("threeDBackground.duplicate", undefined, "Duplicate Object")}</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteObject(selectedObject.id)}
            className="w-full py-1.5 px-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs font-medium flex items-center justify-center gap-1.5 border border-red-800/40 transition"
            title={t("threeDBackground.delete", undefined, "Delete (Del)")}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t("threeDBackground.delete", undefined, "Delete Object")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default ObjectInspector;
