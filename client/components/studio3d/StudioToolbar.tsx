/**
 * StudioToolbar.tsx
 * Top Action Toolbar for Oxygen Low's Software 3D Studio Editor.
 * Includes gizmo modes, snapping controls, templates, bookmarks,
 * undo/redo, save/export actions, and panel toggles.
 */

import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RoomDocument, CameraBookmark, RoomMetadata } from "@/types/threeDBackground";
import { DEFAULT_ROOM_TEMPLATES } from "@/services/3d/storage/RoomTemplates";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AppWindow,
  ArrowDownToLine,
  Bookmark,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Download,
  Eye,
  Focus,
  Folder,
  Globe,
  Grid,
  LayoutTemplate,
  Loader2,
  Magnet,
  Maximize2,
  Move,
  Navigation,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";

export interface StudioToolbarProps {
  room: RoomDocument;
  onRoomNameChange: (name: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSaveAsCopy: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onSetAsBackground: () => void;
  isBackgroundActive: boolean;

  // Gizmo & Navigation
  gizmoMode: "select" | "translate" | "rotate" | "scale";
  onGizmoModeChange: (mode: "select" | "translate" | "rotate" | "scale") => void;
  transformSpace: "world" | "local";
  onToggleTransformSpace: () => void;
  cameraMode: "orbit" | "fly";
  onCameraModeChange: (mode: "orbit" | "fly") => void;

  // Snapping
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  gridSnapStep: number;
  onGridSnapStepChange: (step: number) => void;
  angleSnapStep: number;
  onAngleSnapStepChange: (rad: number) => void;

  // Viewport Quick Actions
  gridVisible: boolean;
  onToggleGrid: () => void;
  onFocusSelection: () => void;
  onFloorAlign: () => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Bookmarks & Templates
  bookmarks: CameraBookmark[];
  activeBookmarkIndex: number;
  onSelectBookmark: (index: number) => void;
  onAddBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onSelectTemplate: (templateId: string) => void;

  // Saved Rooms
  savedRooms?: RoomMetadata[];
  onSelectSavedRoom?: (roomId: string) => void;
  onDeleteSavedRoom?: (roomId: string) => void;

  // Panel Toggles
  isCatalogOpen: boolean;
  onToggleCatalog: () => void;
  activeSideTab: "inspector" | "environment" | "rooms" | null;
  onSelectSideTab: (tab: "inspector" | "environment" | "rooms" | null) => void;
}

export const StudioToolbar: React.FC<StudioToolbarProps> = ({
  room,
  onRoomNameChange,
  isDirty,
  isSaving,
  onSave,
  onSaveAsCopy,
  onExportJson,
  onImportJson,
  onSetAsBackground,
  isBackgroundActive,
  gizmoMode,
  onGizmoModeChange,
  transformSpace,
  onToggleTransformSpace,
  cameraMode,
  onCameraModeChange,
  snappingEnabled,
  onToggleSnapping,
  gridSnapStep,
  onGridSnapStepChange,
  angleSnapStep,
  onAngleSnapStepChange,
  gridVisible,
  onToggleGrid,
  onFocusSelection,
  onFloorAlign,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  bookmarks,
  activeBookmarkIndex,
  onSelectBookmark,
  onAddBookmark,
  onDeleteBookmark,
  onSelectTemplate,
  savedRooms,
  onSelectSavedRoom,
  onDeleteSavedRoom,
  isCatalogOpen,
  onToggleCatalog,
  activeSideTab,
  onSelectSideTab,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dropdown states
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showRoomsMenu, setShowRoomsMenu] = useState(false);
  const [showBookmarkMenu, setShowBookmarkMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = "";
    }
    setShowFileMenu(false);
  };

  return (
    <header className="h-14 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 flex items-center justify-between gap-2 select-none z-20 text-white shrink-0">
      {/* LEFT SECTION: Back Link, Room Name, Status, Wallpaper Toggle */}
      <div className="flex items-center gap-2.5 min-w-0">
        <Link
          to="/apps"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
          title={t("apps.backToApps", undefined, "Back to apps")}
        >
          <AppWindow className="w-5 h-5 text-cyan-400" />
        </Link>

        {/* Room Name Input */}
        <div className="relative flex items-center min-w-0 max-w-[200px] sm:max-w-[240px]">
          <input
            type="text"
            value={room.name}
            onChange={(e) => onRoomNameChange(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded px-2.5 py-1 text-xs sm:text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 truncate"
            placeholder={t("threeDBackground.title", undefined, "3D Background Studio")}
          />
        </div>

        {/* Save Status Badge */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {isSaving ? (
            <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 px-2 py-0.5 rounded">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t("common.saving", undefined, "Saving...")}</span>
            </span>
          ) : isDirty ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded">
              <AlertCircle className="w-3 h-3" />
              <span>{t("common.unsaved", undefined, "Unsaved")}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded">
              <CheckCircle2 className="w-3 h-3" />
              <span>{t("threeDBackground.ready", undefined, "Saved")}</span>
            </span>
          )}
        </div>

        {/* Set as Active Background Button */}
        <button
          type="button"
          onClick={onSetAsBackground}
          className={cn(
            "hidden lg:flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-all shrink-0",
            isBackgroundActive
              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
              : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
          )}
          title={t("threeDBackground.setAsBackground", undefined, "Set as application background")}
        >
          <Sparkles className={cn("w-3.5 h-3.5", isBackgroundActive && "text-cyan-400 animate-pulse")} />
          <span>
            {isBackgroundActive
              ? t("customize.activeRoom", undefined, "Active Background")
              : t("threeDBackground.setAsBackground", undefined, "Set as Wallpaper")}
          </span>
        </button>
      </div>

      {/* CENTER SECTION: Camera, Gizmo Tools, Snapping, Shortcuts */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Navigation Mode: Orbit / Fly */}
        <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onCameraModeChange("orbit")}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition",
              cameraMode === "orbit"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.orbitMode", undefined, "Orbit Camera (Drag to rotate)")}
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t("threeDBackground.orbit", undefined, "Orbit")}</span>
          </button>
          <button
            type="button"
            onClick={() => onCameraModeChange("fly")}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition",
              cameraMode === "fly"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.flyMode", undefined, "Fly Camera (WASD keys)")}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t("threeDBackground.fly", undefined, "Fly")}</span>
          </button>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* Gizmo Mode Switcher: Translate, Rotate, Scale */}
        <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onGizmoModeChange("translate")}
            className={cn(
              "p-1.5 rounded transition text-xs flex items-center gap-1",
              gizmoMode === "translate"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.translate", undefined, "Translate (W)")}
          >
            <Move className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onGizmoModeChange("rotate")}
            className={cn(
              "p-1.5 rounded transition text-xs flex items-center gap-1",
              gizmoMode === "rotate"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.rotate", undefined, "Rotate (E)")}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onGizmoModeChange("scale")}
            className={cn(
              "p-1.5 rounded transition text-xs flex items-center gap-1",
              gizmoMode === "scale"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.scale", undefined, "Scale (R)")}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Space Toggle: World / Local */}
        <button
          type="button"
          onClick={onToggleTransformSpace}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white transition"
          title={
            transformSpace === "world"
              ? t("threeDBackground.spaceWorld", undefined, "World Space (L)")
              : t("threeDBackground.spaceLocal", undefined, "Local Space (L)")
          }
        >
          {transformSpace === "world" ? <Globe className="w-3.5 h-3.5 text-cyan-400" /> : <Box className="w-3.5 h-3.5 text-amber-400" />}
        </button>

        {/* Snapping Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSnapMenu(!showSnapMenu)}
            className={cn(
              "px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition",
              snappingEnabled
                ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-300"
                : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white"
            )}
            title={t("threeDBackground.snapToGrid", undefined, "Snap to Grid")}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{snappingEnabled ? `${gridSnapStep}m` : t("threeDBackground.snapOff", undefined, "Off")}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showSnapMenu && (
            <div className="absolute top-full mt-1.5 left-0 w-44 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2.5 z-30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">{t("threeDBackground.snapToGrid", undefined, "Snapping")}</span>
                <input
                  type="checkbox"
                  checked={snappingEnabled}
                  onChange={onToggleSnapping}
                  className="rounded text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">{t("threeDBackground.snapUnit", undefined, "Grid Step")}</span>
                <div className="grid grid-cols-4 gap-1">
                  {[0.1, 0.25, 0.5, 1.0].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => {
                        onGridSnapStepChange(step);
                        setShowSnapMenu(false);
                      }}
                      className={cn(
                        "py-0.5 rounded text-[10px] font-mono border text-center",
                        gridSnapStep === step
                          ? "bg-cyan-600 border-cyan-500 text-white font-bold"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {step}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">{t("threeDBackground.snapAngle", undefined, "Angle Step")}</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { deg: 15, rad: (15 * Math.PI) / 180 },
                    { deg: 45, rad: (45 * Math.PI) / 180 },
                    { deg: 90, rad: (90 * Math.PI) / 180 },
                  ].map(({ deg, rad }) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => {
                        onAngleSnapStepChange(rad);
                        setShowSnapMenu(false);
                      }}
                      className={cn(
                        "py-0.5 rounded text-[10px] font-mono border text-center",
                        Math.abs(angleSnapStep - rad) < 0.01
                          ? "bg-cyan-600 border-cyan-500 text-white font-bold"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Tools: Focus & Floor Align */}
        <button
          type="button"
          onClick={onFocusSelection}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white transition"
          title={t("threeDBackground.focusObject", undefined, "Focus Selection (F)")}
        >
          <Focus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onFloorAlign}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white transition"
          title={t("threeDBackground.floorAlign", undefined, "Align to Floor (End)")}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleGrid}
          className={cn(
            "p-1.5 rounded-lg border transition",
            gridVisible
              ? "bg-slate-800/80 border-slate-700 text-slate-200"
              : "bg-slate-900 border-slate-800 text-slate-500"
          )}
          title={t("threeDBackground.toggleGrid", undefined, "Toggle Grid (G)")}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* RIGHT SECTION: History, Bookmarks, Templates, Save & Panels */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="p-1.5 rounded text-slate-300 hover:text-white disabled:text-slate-600 disabled:hover:text-slate-600 transition"
            title={t("threeDBackground.undo", undefined, "Undo (Ctrl+Z)")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="p-1.5 rounded text-slate-300 hover:text-white disabled:text-slate-600 disabled:hover:text-slate-600 transition"
            title={t("threeDBackground.redo", undefined, "Redo (Ctrl+Y)")}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Camera Bookmarks Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowBookmarkMenu(!showBookmarkMenu)}
            className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 transition"
            title={t("threeDBackground.viewpointBookmarks", undefined, "Camera Bookmarks")}
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showBookmarkMenu && (
            <div className="absolute top-full mt-1.5 right-0 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-30 space-y-1">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800 px-1">
                <span className="text-[11px] font-semibold text-slate-400">
                  {t("threeDBackground.bookmarks", undefined, "Camera Bookmarks")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onAddBookmark();
                    setShowBookmarkMenu(false);
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  {t("threeDBackground.addBookmark", undefined, "Add View")}
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {bookmarks.map((bm, idx) => (
                  <div
                    key={bm.id || idx}
                    className={cn(
                      "flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer group",
                      activeBookmarkIndex === idx
                        ? "bg-cyan-950/60 text-cyan-300 font-semibold"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                    onClick={() => {
                      onSelectBookmark(idx);
                      setShowBookmarkMenu(false);
                    }}
                  >
                    <span className="truncate flex items-center gap-1">
                      <Bookmark className="w-3 h-3 opacity-70" />
                      {bm.name}
                    </span>
                    {!bm.isPreset && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBookmark(bm.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Saved Rooms Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowRoomsMenu(!showRoomsMenu);
              setShowTemplateMenu(false);
              setShowFileMenu(false);
            }}
            className={cn(
              "px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition",
              showRoomsMenu
                ? "bg-cyan-950 border-cyan-500 text-cyan-200"
                : "border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
            )}
            title={t("threeDBackground.savedRooms", undefined, "Saved Rooms")}
          >
            <Folder className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">{t("threeDBackground.savedRooms", undefined, "Saved Rooms")}</span>
            {savedRooms && savedRooms.length > 0 && (
              <span className="ml-0.5 px-1 py-0.2 text-[9px] bg-slate-700 rounded-full font-mono text-slate-300">
                {savedRooms.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showRoomsMenu && (
            <div className="absolute top-full mt-1.5 right-0 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-30 space-y-1 max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400">
                  {t("threeDBackground.savedRooms", undefined, "Saved Rooms")}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {savedRooms?.length || 0} {t("threeDBackground.objectsCount", undefined, "Rooms")}
                </span>
              </div>

              {(!savedRooms || savedRooms.length === 0) ? (
                <div className="p-3 text-center text-[11px] text-slate-500">
                  {t("threeDBackground.noRoomsFound", undefined, "No saved rooms found. Create your first room!")}
                </div>
              ) : (
                savedRooms.map((slot) => {
                  const isActive = slot.id === room.id;
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        "group w-full text-left px-2 py-1.5 rounded text-xs transition flex items-center justify-between gap-2",
                        isActive
                          ? "bg-cyan-950/60 border border-cyan-800/60 text-cyan-200"
                          : "hover:bg-slate-800 text-slate-300"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSavedRoom?.(slot.id);
                          setShowRoomsMenu(false);
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-200 truncate block text-xs">
                            {slot.name}
                          </span>
                          {isActive && (
                            <span className="shrink-0 px-1 py-0.5 text-[9px] bg-cyan-800/80 text-cyan-200 rounded font-mono">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {slot.objectCount} {t("threeDBackground.objectsCount", undefined, "Objects")} • {new Date(slot.updatedAt).toLocaleDateString()}
                        </span>
                      </button>

                      {onDeleteSavedRoom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSavedRoom(slot.id);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700/60 transition opacity-60 group-hover:opacity-100 shrink-0"
                          title={t("threeDBackground.deleteRoom", undefined, "Delete Room")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Room Templates Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowTemplateMenu(!showTemplateMenu);
              setShowRoomsMenu(false);
              setShowFileMenu(false);
            }}
            className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 transition"
            title={t("threeDBackground.templates", undefined, "Room Templates")}
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">{t("threeDBackground.templates", undefined, "Templates")}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showTemplateMenu && (
            <div className="absolute top-full mt-1.5 right-0 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-30 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block px-1 pb-1 border-b border-slate-800">
                {t("threeDBackground.chooseTemplate", undefined, "Choose Room Template")}
              </span>
              {DEFAULT_ROOM_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => {
                    onSelectTemplate(tmpl.id);
                    setShowTemplateMenu(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition flex flex-col"
                >
                  <span className="font-medium text-slate-200">{tmpl.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {tmpl.objects.length} {t("threeDBackground.objectsCount", undefined, "Objects")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File Actions Dropdown (Export / Import JSON) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowFileMenu(!showFileMenu);
              setShowRoomsMenu(false);
              setShowTemplateMenu(false);
            }}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white transition"
            title={t("threeDBackground.fileMenu", undefined, "File Menu")}
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {showFileMenu && (
            <div className="absolute top-full mt-1.5 right-0 w-44 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 z-30 space-y-1">
              <button
                type="button"
                onClick={() => {
                  onExportJson();
                  setShowFileMenu(false);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                {t("threeDBackground.exportJson", undefined, "Export JSON")}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                {t("threeDBackground.importJson", undefined, "Import JSON")}
              </button>

              <div className="border-t border-slate-800 my-1" />

              <button
                type="button"
                onClick={() => {
                  onSaveAsCopy();
                  setShowFileMenu(false);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                {t("threeDBackground.saveAsCopy", undefined, "Save as Copy")}
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Primary Save Button */}
        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 shrink-0"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>{t("threeDBackground.saveRoom", undefined, "Save")}</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        {/* Panel Toggles */}
        <button
          type="button"
          onClick={onToggleCatalog}
          className={cn(
            "p-1.5 rounded-lg border transition",
            isCatalogOpen
              ? "bg-cyan-600 border-cyan-500 text-white"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
          )}
          title={t("threeDBackground.catalog", undefined, "Object Catalog")}
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectSideTab(activeSideTab === "rooms" ? null : "rooms")}
          className={cn(
            "p-1.5 rounded-lg border transition",
            activeSideTab === "rooms"
              ? "bg-cyan-600 border-cyan-500 text-white"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
          )}
          title={t("threeDBackground.savedRooms", undefined, "Saved Room Slots")}
        >
          <Folder className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectSideTab(activeSideTab === "environment" ? null : "environment")}
          className={cn(
            "p-1.5 rounded-lg border transition",
            activeSideTab === "environment"
              ? "bg-cyan-600 border-cyan-500 text-white"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
          )}
          title={t("threeDBackground.environment", undefined, "Environment Settings")}
        >
          <Sun className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectSideTab(activeSideTab === "inspector" ? null : "inspector")}
          className={cn(
            "p-1.5 rounded-lg border transition",
            activeSideTab === "inspector"
              ? "bg-cyan-600 border-cyan-500 text-white"
              : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
          )}
          title={t("threeDBackground.inspector", undefined, "Object Inspector")}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default StudioToolbar;
