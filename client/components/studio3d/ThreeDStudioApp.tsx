/**
 * ThreeDStudioApp.tsx
 * Full-width 3D Studio Editor application for Oxygen Low's Software.
 * Renders StudioToolbar, ViewportCanvas, CatalogDrawer, ObjectInspector, and EnvironmentPanel.
 * Persists room data via RoomStorageService and synchronizes with ThreeEngine.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  RoomDocument,
  RoomObject,
  RoomMetadata,
  EnvironmentSettings,
  PosterFrameStyle,
  CustomProps,
  CameraBookmark,
} from "@/types/threeDBackground";
import {
  RoomStorageService,
  EVENT_ROOMS_UPDATED,
} from "@/services/3d/storage/RoomStorageService";
import {
  DEFAULT_ROOM_TEMPLATES,
  COZY_BEDROOM_TEMPLATE,
  instantiateRoomTemplate,
  resolveTemplateId,
} from "@/services/3d/storage/RoomTemplates";
import { CatalogFactory } from "@/services/3d/catalog/CatalogFactory";
import { GLTFLoaderPipeline } from "@/services/3d/assets/GLTFLoaderPipeline";
import { GraphicsPreset } from "@/services/3d/environment/GraphicsPresets";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { ThreeEngine } from "./engine/ThreeEngine";
import { StudioToolbar } from "./StudioToolbar";
import { CatalogDrawer } from "./CatalogDrawer";
import { ObjectInspector } from "./ObjectInspector";
import { EnvironmentPanel } from "./EnvironmentPanel";
import { SavedRoomsDrawer } from "./SavedRoomsDrawer";
import { ViewportCanvas } from "../3d/ViewportCanvas";

export interface ThreeDStudioAppProps {
  initialRoomId?: string;
  initialTemplateId?: string;
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const ThreeDStudioApp: React.FC<ThreeDStudioAppProps> = ({
  initialRoomId,
  initialTemplateId,
}) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Reference to live ThreeEngine instance
  const engineRef = useRef<ThreeEngine | null>(null);

  // Initialize room from template or storage
  const [activeRoom, setActiveRoom] = useState<RoomDocument>(() => {
    const templateQuery = searchParams.get("template") || initialTemplateId;
    const slotQuery = searchParams.get("slot") || initialRoomId;

    if (templateQuery) {
      const resolvedId = resolveTemplateId(templateQuery);
      return instantiateRoomTemplate(resolvedId);
    }
    if (slotQuery) {
      const loaded = RoomStorageService.loadRoom(slotQuery);
      if (loaded) return loaded;
    }

    // Try active background room
    const activeBgId = RoomStorageService.getActiveBackgroundRoomId();
    if (activeBgId) {
      const bgRoom = RoomStorageService.loadRoom(activeBgId);
      if (bgRoom) return bgRoom;
    }

    // Fallback: first stored room or Cozy Bedroom template
    const storedRooms = RoomStorageService.listRooms();
    if (storedRooms.length > 0) {
      const first = RoomStorageService.loadRoom(storedRooms[0].id);
      if (first) return first;
    }

    return instantiateRoomTemplate(COZY_BEDROOM_TEMPLATE.id);
  });

  // Saved room slots list
  const [savedRooms, setSavedRooms] = useState<RoomMetadata[]>(() =>
    RoomStorageService.listRooms()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setSavedRooms(RoomStorageService.listRooms());
    };
    if (typeof window !== "undefined") {
      window.addEventListener(EVENT_ROOMS_UPDATED, handleUpdate);
      return () => window.removeEventListener(EVENT_ROOMS_UPDATED, handleUpdate);
    }
  }, []);

  // Editor State
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackgroundActive, setIsBackgroundActive] = useState(() => {
    return RoomStorageService.getActiveBackgroundRoomId() === activeRoom.id;
  });

  // Selected Object
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Gizmo & Camera State
  const [gizmoMode, setGizmoMode] = useState<"select" | "translate" | "rotate" | "scale">("translate");
  const [transformSpace, setTransformSpace] = useState<"world" | "local">("world");
  const [cameraMode, setCameraMode] = useState<"orbit" | "fly">("orbit");
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [gridSnapStep, setGridSnapStep] = useState(0.5);
  const [angleSnapStep, setAngleSnapStep] = useState((15 * Math.PI) / 180);
  const [gridVisible, setGridVisible] = useState(true);

  // History state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Dockable Drawers
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"inspector" | "environment" | "rooms" | null>(null);

  // Graphics Quality Preset
  const [graphicsPreset, setGraphicsPreset] = useState<GraphicsPreset>("high");

  // Keep background status updated
  useEffect(() => {
    setIsBackgroundActive(RoomStorageService.getActiveBackgroundRoomId() === activeRoom.id);
  }, [activeRoom.id]);

  // Sync canUndo / canRedo from GizmoManager
  const updateUndoRedoState = useCallback(() => {
    if (engineRef.current) {
      setCanUndo(engineRef.current.gizmoManager.undoStack.length > 0);
      setCanRedo(engineRef.current.gizmoManager.redoStack.length > 0);
    }
  }, []);

  // Engine Ready callback
  const handleEngineReady = useCallback((engine: ThreeEngine) => {
    engineRef.current = engine;
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Object Selection Handler
  const handleObjectSelected = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    if (id) {
      setActiveSideTab("inspector");
    }
  }, []);

  // Warn on unmount if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // --- Toolbar Handlers ---
  const handleRoomNameChange = (name: string) => {
    setActiveRoom((prev) => ({ ...prev, name, updatedAt: new Date().toISOString() }));
    setIsDirty(true);
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      // Capture thumbnail
      let thumb: string | undefined;
      if (engineRef.current) {
        thumb = engineRef.current.generateThumbnail(320, 240);
      }

      const roomToSave: RoomDocument = {
        ...activeRoom,
        thumbnailDataUrl: thumb || activeRoom.thumbnailDataUrl,
        updatedAt: new Date().toISOString(),
      };

      const result = RoomStorageService.saveRoom(roomToSave);
      if (result.success) {
        setActiveRoom(roomToSave);
        setIsDirty(false);
        setSavedRooms(RoomStorageService.listRooms());
        toast({
          title: t("common.success", undefined, "Saved"),
          description: t("threeDBackground.roomSaved", undefined, "3D room saved successfully"),
        });
      } else {
        toast({
          title: t("common.error", undefined, "Error"),
          description: result.error || "Failed to save room",
          variant: "destructive",
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsCopy = () => {
    const copy: RoomDocument = {
      ...JSON.parse(JSON.stringify(activeRoom)),
      id: generateUUID(),
      name: `${activeRoom.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = RoomStorageService.saveRoom(copy);
    if (res.success) {
      setActiveRoom(copy);
      setIsDirty(false);
      setSavedRooms(RoomStorageService.listRooms());
      toast({
        title: t("common.success", undefined, "Saved Copy"),
        description: `Saved as "${copy.name}"`,
      });
    }
  };

  const handleLoadSavedRoom = (roomId: string) => {
    if (isDirty && typeof window !== "undefined") {
      const confirmed = window.confirm(
        t("threeDBackground.unsavedChanges", undefined, "You have unsaved changes. Discard and load this room?")
      );
      if (!confirmed) return;
    }

    const loaded = RoomStorageService.loadRoom(roomId);
    if (loaded) {
      setActiveRoom(loaded);
      setIsDirty(false);
      setSelectedObjectId(null);
      setIsBackgroundActive(RoomStorageService.getActiveBackgroundRoomId() === loaded.id);
      if (engineRef.current) {
        engineRef.current.loadRoom(loaded);
        updateUndoRedoState();
      }
      toast({
        title: t("common.success", undefined, "Loaded"),
        description: t("threeDBackground.roomLoaded", undefined, "Room loaded successfully"),
      });
    } else {
      toast({
        title: t("common.error", undefined, "Error"),
        description: "Failed to load room",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSavedRoom = (roomId: string) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        t("threeDBackground.deleteRoomConfirm", undefined, "Are you sure you want to delete this room? This action cannot be undone.")
      );
      if (!confirmed) return;
    }

    const success = RoomStorageService.deleteRoom(roomId);
    if (success) {
      setSavedRooms(RoomStorageService.listRooms());
      toast({
        title: t("common.success", undefined, "Deleted"),
        description: t("threeDBackground.roomDeleted", undefined, "Room deleted successfully"),
      });
    } else {
      toast({
        title: t("common.error", undefined, "Error"),
        description: "Cannot delete built-in templates",
        variant: "destructive",
      });
    }
  };

  const handleSetAsBackground = () => {
    if (isBackgroundActive) {
      RoomStorageService.setActiveBackgroundRoomId(null);
      setIsBackgroundActive(false);
      toast({
        title: t("common.info", undefined, "Wallpaper Disabled"),
        description: "Application background set to default",
      });
    } else {
      // Auto-save room first if dirty
      RoomStorageService.saveRoom(activeRoom);
      RoomStorageService.setActiveBackgroundRoomId(activeRoom.id);
      setIsBackgroundActive(true);
      toast({
        title: t("common.success", undefined, "Background Set"),
        description: `"${activeRoom.name}" set as active live background`,
      });
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    if (isDirty && typeof window !== "undefined") {
      const confirmed = window.confirm(
        t("threeDBackground.templateConfirm", undefined, "Discard unsaved changes and load this template?")
      );
      if (!confirmed) return;
    }

    const resolvedId = resolveTemplateId(templateId);
    const newRoom = instantiateRoomTemplate(resolvedId);
    setActiveRoom(newRoom);
    setIsDirty(false);
    setSelectedObjectId(null);

    if (engineRef.current) {
      engineRef.current.loadRoom(newRoom);
      updateUndoRedoState();
    }
  };

  const handleExportJson = () => {
    RoomStorageService.exportRoomAsJson(activeRoom);
    toast({
      title: t("common.success", undefined, "Exported"),
      description: t("threeDBackground.jsonExported", undefined, "Room exported to JSON file"),
    });
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const result = await RoomStorageService.importRoomFromJson(text);
      if (result.success && result.room) {
        setActiveRoom(result.room);
        setIsDirty(false);
        setSelectedObjectId(null);
        setSavedRooms(RoomStorageService.listRooms());
        if (engineRef.current) {
          engineRef.current.loadRoom(result.room);
          updateUndoRedoState();
        }
        toast({
          title: t("common.success", undefined, "Imported"),
          description: `Loaded room "${result.room.name}"`,
        });
      } else {
        toast({
          title: t("common.error", undefined, "Error"),
          description: result.error || "Failed to import JSON",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err?.message || "Invalid JSON file",
        variant: "destructive",
      });
    }
  };

  // --- Gizmo & Navigation Controls ---
  const handleGizmoModeChange = (mode: "select" | "translate" | "rotate" | "scale") => {
    setGizmoMode(mode);
    if (engineRef.current && mode !== "select") {
      engineRef.current.gizmoManager.setMode(mode);
    }
  };

  const handleToggleTransformSpace = () => {
    const nextSpace = transformSpace === "world" ? "local" : "world";
    setTransformSpace(nextSpace);
    if (engineRef.current) {
      engineRef.current.gizmoManager.transformControls.setSpace(nextSpace);
    }
  };

  const handleCameraModeChange = (mode: "orbit" | "fly") => {
    setCameraMode(mode);
    if (engineRef.current) {
      engineRef.current.cameraController.setNavigationMode(mode);
    }
  };

  const handleToggleSnapping = () => {
    const next = !snappingEnabled;
    setSnappingEnabled(next);
    if (engineRef.current) {
      engineRef.current.gizmoManager.setSnappingEnabled(next);
    }
  };

  const handleGridSnapStepChange = (step: number) => {
    setGridSnapStep(step);
    if (engineRef.current) {
      engineRef.current.gizmoManager.setGridStep(step);
    }
  };

  const handleAngleSnapStepChange = (rad: number) => {
    setAngleSnapStep(rad);
    if (engineRef.current) {
      engineRef.current.gizmoManager.setAngleStep(rad);
    }
  };

  const handleToggleGrid = () => {
    const next = !gridVisible;
    setGridVisible(next);
    if (engineRef.current) {
      engineRef.current.cameraController.setGridVisible(next);
    }
  };

  const handleFocusSelection = () => {
    if (!engineRef.current) return;
    const selected = engineRef.current.getSelectedObject();
    if (selected) {
      engineRef.current.cameraController.focusOnObject(selected);
    } else {
      engineRef.current.cameraController.focusOnPoint(engineRef.current.cameraController.orbitControls.target);
    }
  };

  const handleFloorAlign = (id?: string) => {
    if (!engineRef.current) return;
    const targetId = id || selectedObjectId;
    if (targetId) {
      engineRef.current.selectObject(targetId);
      const aligned = engineRef.current.gizmoManager.executeFloorAlign();
      if (aligned) {
        setIsDirty(true);
        updateUndoRedoState();
      }
    }
  };

  const handleDuplicateObject = (id?: string) => {
    if (!engineRef.current) return;
    const targetId = id || selectedObjectId;
    if (targetId) {
      engineRef.current.selectObject(targetId);
      const cloned = engineRef.current.gizmoManager.executeDuplicate();
      if (cloned) {
        setActiveRoom((prev) => ({
          ...prev,
          objects: [...prev.objects, cloned],
          updatedAt: new Date().toISOString(),
        }));
        setIsDirty(true);
        updateUndoRedoState();
      }
    }
  };

  const handleDeleteObject = (id?: string) => {
    if (!engineRef.current) return;
    const targetId = id || selectedObjectId;
    if (targetId) {
      engineRef.current.selectObject(targetId);
      const deleted = engineRef.current.gizmoManager.executeDelete();
      if (deleted) {
        setActiveRoom((prev) => ({
          ...prev,
          objects: prev.objects.filter((o) => o.id !== targetId),
          updatedAt: new Date().toISOString(),
        }));
        setSelectedObjectId(null);
        setIsDirty(true);
        updateUndoRedoState();
      }
    }
  };

  const handleUndo = () => {
    if (engineRef.current) {
      const success = engineRef.current.gizmoManager.executeUndo();
      if (success) {
        const restored = engineRef.current.gizmoManager.getObjects();
        setActiveRoom((prev) => ({ ...prev, objects: restored, updatedAt: new Date().toISOString() }));
        setIsDirty(true);
        updateUndoRedoState();
      }
    }
  };

  const handleRedo = () => {
    if (engineRef.current) {
      const success = engineRef.current.gizmoManager.executeRedo();
      if (success) {
        const restored = engineRef.current.gizmoManager.getObjects();
        setActiveRoom((prev) => ({ ...prev, objects: restored, updatedAt: new Date().toISOString() }));
        setIsDirty(true);
        updateUndoRedoState();
      }
    }
  };

  // --- Object Additions ---
  const handleAddItem = (catalogId: string, customProps?: CustomProps) => {
    const itemDef = CatalogFactory.getItemDefinition(catalogId);
    const newObj: RoomObject = {
      id: generateUUID(),
      name: itemDef ? t(itemDef.nameKey, undefined, itemDef.defaultName) : catalogId,
      catalogId,
      type: (itemDef?.category as any) || "furniture",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      customProps,
      visible: true,
      locked: false,
    };

    if (engineRef.current) {
      engineRef.current.gizmoManager.pushState(activeRoom.objects);
      engineRef.current.addObject(newObj);
      engineRef.current.selectObject(newObj.id);
      updateUndoRedoState();
    }

    setActiveRoom((prev) => ({
      ...prev,
      objects: [...prev.objects, newObj],
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    setActiveSideTab("inspector");
  };

  const handleUploadGlb = async (file: File) => {
    const model = await GLTFLoaderPipeline.loadGLBFromFile(file);
    const newObj: RoomObject = {
      id: generateUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      catalogId: "custom_model",
      type: "custom_model",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      customProps: {
        modelStoragePath: file.name,
      },
      visible: true,
      locked: false,
    };

    if (engineRef.current) {
      engineRef.current.gizmoManager.pushState(activeRoom.objects);
      model.name = newObj.id;
      model.userData = {
        isRoomObject: true,
        catalogId: newObj.catalogId,
        objectId: newObj.id,
        roomId: newObj.id,
      };
      engineRef.current.objectsGroup.add(model);
      engineRef.current.gizmoManager.registerObject(newObj, model);
      engineRef.current.selectObject(newObj.id);
      updateUndoRedoState();
    }

    setActiveRoom((prev) => ({
      ...prev,
      objects: [...prev.objects, newObj],
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    setActiveSideTab("inspector");
    toast({ title: t("threeDBackground.modelLoaded", undefined, "3D Model loaded") });
  };

  const handleUploadPoster = async (
    file: File,
    options: { frameStyle: PosterFrameStyle; aspectRatio: number }
  ) => {
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });

    const newObj: RoomObject = {
      id: generateUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      catalogId: "decor_poster_frame",
      type: "decor",
      transform: {
        position: [0, 1.2, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      customProps: {
        imageUrl: dataUrl,
        aspectRatio: Math.max(0.05, Math.min(20, options.aspectRatio)),
        frameStyle: options.frameStyle,
      },
      visible: true,
      locked: false,
    };

    if (engineRef.current) {
      engineRef.current.gizmoManager.pushState(activeRoom.objects);
      engineRef.current.addObject(newObj);
      engineRef.current.selectObject(newObj.id);
      updateUndoRedoState();
    }

    setActiveRoom((prev) => ({
      ...prev,
      objects: [...prev.objects, newObj],
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    setActiveSideTab("inspector");
    toast({ title: t("threeDBackground.posterCreated", undefined, "Poster placed in room") });
  };

  // --- Object Inspector Update ---
  const handleUpdateObject = (updated: RoomObject) => {
    if (engineRef.current) {
      engineRef.current.updateObjectTransform(updated.id, updated.transform);
      const entry = (engineRef.current.gizmoManager as any).objectMap?.get(updated.id);
      if (entry) {
        entry.roomObject = updated;
        entry.mesh.visible = updated.visible;
      }
    }

    setActiveRoom((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (o.id === updated.id ? updated : o)),
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
  };

  // --- Environment Updates ---
  const handleUpdateEnvironment = (updatedEnv: EnvironmentSettings) => {
    setActiveRoom((prev) => ({
      ...prev,
      environment: updatedEnv,
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    if (engineRef.current) {
      engineRef.current.environmentManager.update(updatedEnv);
    }
  };

  // --- Camera Bookmarks ---
  const handleSelectBookmark = (index: number) => {
    if (engineRef.current) {
      engineRef.current.cameraController.transitionToBookmark(index, 1.2);
    }
  };

  const handleAddBookmark = () => {
    if (!engineRef.current) return;
    const cam = engineRef.current.camera;
    const target = engineRef.current.cameraController.orbitControls.target;

    const newBookmark: CameraBookmark = {
      id: "bm-" + Date.now().toString(36),
      name: `View ${activeRoom.cameraBookmarks.length + 1}`,
      position: [cam.position.x, cam.position.y, cam.position.z],
      target: [target.x, target.y, target.z],
      fov: cam.fov,
      isPreset: false,
    };

    const nextBookmarks = [...activeRoom.cameraBookmarks, newBookmark];
    setActiveRoom((prev) => ({
      ...prev,
      cameraBookmarks: nextBookmarks,
      activeBookmarkIndex: nextBookmarks.length - 1,
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    engineRef.current.cameraController.setBookmarks(nextBookmarks, nextBookmarks.length - 1);
    toast({ title: t("threeDBackground.bookmarkSaved", undefined, "Camera bookmark saved") });
  };

  const handleDeleteBookmark = (id: string) => {
    const nextBookmarks = activeRoom.cameraBookmarks.filter((b) => b.id !== id);
    setActiveRoom((prev) => ({
      ...prev,
      cameraBookmarks: nextBookmarks,
      activeBookmarkIndex: 0,
      updatedAt: new Date().toISOString(),
    }));
    setIsDirty(true);
    if (engineRef.current) {
      engineRef.current.cameraController.setBookmarks(nextBookmarks, 0);
    }
    toast({ title: t("threeDBackground.bookmarkDeleted", undefined, "Camera bookmark removed") });
  };

  const selectedObject = activeRoom.objects.find((o) => o.id === selectedObjectId) || null;

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Top Action Toolbar */}
      <StudioToolbar
        room={activeRoom}
        onRoomNameChange={handleRoomNameChange}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onSaveAsCopy={handleSaveAsCopy}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onSetAsBackground={handleSetAsBackground}
        isBackgroundActive={isBackgroundActive}
        gizmoMode={gizmoMode}
        onGizmoModeChange={handleGizmoModeChange}
        transformSpace={transformSpace}
        onToggleTransformSpace={handleToggleTransformSpace}
        cameraMode={cameraMode}
        onCameraModeChange={handleCameraModeChange}
        snappingEnabled={snappingEnabled}
        onToggleSnapping={handleToggleSnapping}
        gridSnapStep={gridSnapStep}
        onGridSnapStepChange={handleGridSnapStepChange}
        angleSnapStep={angleSnapStep}
        onAngleSnapStepChange={handleAngleSnapStepChange}
        gridVisible={gridVisible}
        onToggleGrid={handleToggleGrid}
        onFocusSelection={handleFocusSelection}
        onFloorAlign={handleFloorAlign}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        bookmarks={activeRoom.cameraBookmarks}
        activeBookmarkIndex={activeRoom.activeBookmarkIndex}
        onSelectBookmark={handleSelectBookmark}
        onAddBookmark={handleAddBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onSelectTemplate={handleSelectTemplate}
        isCatalogOpen={isCatalogOpen}
        onToggleCatalog={() => setIsCatalogOpen(!isCatalogOpen)}
        activeSideTab={activeSideTab}
        onSelectSideTab={setActiveSideTab}
      />

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden">
        <ViewportCanvas
          room={activeRoom}
          graphicsPreset={graphicsPreset}
          onEngineReady={handleEngineReady}
          onObjectSelected={handleObjectSelected}
          showOverlayControls={true}
          showBookmarksBar={true}
        />

        {/* Left Drawer: Object Catalog */}
        <CatalogDrawer
          isOpen={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
          onAddItem={handleAddItem}
          onUploadGlb={handleUploadGlb}
          onUploadPoster={handleUploadPoster}
        />

        {/* Right Drawer: Object Inspector */}
        {activeSideTab === "inspector" && (
          <ObjectInspector
            selectedObject={selectedObject}
            onUpdateObject={handleUpdateObject}
            onDuplicateObject={handleDuplicateObject}
            onDeleteObject={handleDeleteObject}
            onFloorAlign={handleFloorAlign}
            onFocusObject={handleFocusSelection}
            onClose={() => setActiveSideTab(null)}
          />
        )}

        {/* Right Drawer: Environment Settings */}
        {activeSideTab === "environment" && (
          <EnvironmentPanel
            environment={activeRoom.environment}
            onUpdateEnvironment={handleUpdateEnvironment}
            graphicsPreset={graphicsPreset}
            onChangeGraphicsPreset={setGraphicsPreset}
            onClose={() => setActiveSideTab(null)}
          />
        )}
      </div>
    </div>
  );
};

export default ThreeDStudioApp;
