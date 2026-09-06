/**
 * GizmoManager.ts
 * TransformControls, selection raycasting, snapping, floor align, duplication,
 * and 50-step undo/redo architecture for Oxygen Low's Software 3D Studio Editor.
 */

import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { RoomObject, CameraBookmark } from "@/types/threeDBackground";
import { CatalogFactory } from "@/services/3d/catalog/CatalogFactory";

export type TransformGizmoMode = "translate" | "rotate" | "scale";

export interface GizmoManagerCallbacks {
  onSelectionChanged?: (selectedId: string | null, selectedObject: RoomObject | null) => void;
  onTransformChanged?: (object: RoomObject) => void;
  onStateChanged?: (objects: RoomObject[]) => void;
  onObjectAdded?: (object: RoomObject) => void;
  onObjectRemoved?: (objectId: string) => void;
  onModeChanged?: (mode: TransformGizmoMode) => void;
  onDraggingChanged?: (isDragging: boolean) => void;
}

export interface GizmoManagerOptions extends GizmoManagerCallbacks {
  scene: THREE.Scene;
  camera: THREE.Camera;
  domElement: HTMLElement;
  orbitControls?: { enabled: boolean };
  objectsGroup?: THREE.Group;
  initialObjects?: RoomObject[];
  getCameraMode?: () => "orbit" | "fly";
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

export class GizmoManager {
  // Mode & Snapping properties (Authoritative Harness & E2E API)
  private _activeMode: TransformGizmoMode = "translate";
  public snapGridStep = 0.5; // meters
  public snapAngleStep = (15 * Math.PI) / 180; // radians
  public snapScaleStep = 0.1; // scale step
  public isSnapEnabled = true;
  public isDraggingGizmo = false;
  public orbitControlsEnabled = true;
  public cameraMode: "orbit" | "fly" = "orbit";
  public getCameraMode?: () => "orbit" | "fly";

  // 50-step Undo / Redo Stacks
  public undoStack: RoomObject[][] = [];
  public redoStack: RoomObject[][] = [];
  public readonly MAX_UNDO_STEPS = 50;

  // Scene & Three.js references
  public scene: THREE.Scene;
  public camera: THREE.Camera;
  public domElement: HTMLElement;
  public orbitControls?: { enabled: boolean };
  public objectsGroup: THREE.Group;
  public transformControls: TransformControls;
  public raycaster: THREE.Raycaster = new THREE.Raycaster();

  // Selection state & highlight helpers
  public selectedObjectId: string | null = null;
  public selectionBoxHelper: THREE.BoxHelper | null = null;
  private currentObjects: RoomObject[] = [];
  private objectMap: Map<string, { roomObject: RoomObject; mesh: THREE.Object3D }> = new Map();
  private originalEmissives: Map<string, { emissive: THREE.Color; intensity: number }> = new Map();

  // Drag state tracking for undo
  private preDragState: RoomObject[] | null = null;

  // Pointer click detection (distinguishes clicks from camera orbit drags)
  private pointerDownPos = { x: 0, y: 0 };
  private callbacks: GizmoManagerCallbacks;

  constructor(options: GizmoManagerOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.orbitControls = options.orbitControls;
    this.getCameraMode = options.getCameraMode;
    if (options.objectsGroup) {
      this.objectsGroup = options.objectsGroup;
    } else {
      this.objectsGroup = new THREE.Group();
      this.scene.add(this.objectsGroup);
    }
    this.callbacks = {
      onSelectionChanged: options.onSelectionChanged,
      onTransformChanged: options.onTransformChanged,
      onStateChanged: options.onStateChanged,
      onObjectAdded: options.onObjectAdded,
      onObjectRemoved: options.onObjectRemoved,
      onModeChanged: options.onModeChanged,
      onDraggingChanged: options.onDraggingChanged,
    };

    if (options.initialObjects) {
      this.currentObjects = JSON.parse(JSON.stringify(options.initialObjects));
    }

    // 1. Initialize Three.js TransformControls
    this.transformControls = new TransformControls(this.camera, this.domElement);
    this.transformControls.setMode(this._activeMode);
    this.updateControlsSnapping();

    // In Three.js v0.185.1, TransformControls helper is an Object3D added to scene
    const helper = typeof (this.transformControls as any).getHelper === "function"
      ? (this.transformControls as any).getHelper()
      : (this.transformControls as unknown as THREE.Object3D);
    this.scene.add(helper);

    // 2. Interlock: Camera orbit lock during gizmo drag
    this.transformControls.addEventListener("dragging-changed", (event: any) => {
      const isDragging = Boolean(event.value);
      this.setGizmoDragging(isDragging);
    });

    // 3. Object transform synchronization
    this.transformControls.addEventListener("objectChange", () => {
      this.syncAttachedObjectToData();
    });

    // 4. Attach DOM & Keyboard Listeners
    this.attachEventListeners();
  }

  // --------------------------------------------------------------------------
  // Active Mode (Translate, Rotate, Scale)
  // --------------------------------------------------------------------------
  public get activeMode(): TransformGizmoMode {
    return this._activeMode;
  }

  public set activeMode(mode: TransformGizmoMode) {
    this.setMode(mode);
  }

  public setMode(mode: TransformGizmoMode): void {
    this._activeMode = mode;
    this.transformControls.setMode(mode);
    this.callbacks.onModeChanged?.(mode);
  }

  // --------------------------------------------------------------------------
  // OrbitControls Interlock
  // --------------------------------------------------------------------------
  public setGizmoDragging(dragging: boolean): void {
    this.isDraggingGizmo = dragging;
    this.orbitControlsEnabled = !dragging;
    if (this.orbitControls) {
      this.orbitControls.enabled = !dragging;
    }
    this.callbacks.onDraggingChanged?.(dragging);

    if (dragging) {
      // Capture snapshot before user begins transforming
      this.preDragState = JSON.parse(JSON.stringify(this.currentObjects));
    } else {
      // Drag completed: if transform actually changed, commit to undo stack
      if (this.preDragState && this.hasStateChanged(this.preDragState, this.currentObjects)) {
        this.pushState(this.preDragState);
        this.callbacks.onStateChanged?.(this.currentObjects);
      }
      this.preDragState = null;
    }
  }

  // --------------------------------------------------------------------------
  // Snapping Calculations
  // --------------------------------------------------------------------------
  public applySnapPosition(val: number): number {
    if (this.snapGridStep <= 0) return val;
    return Math.round(val / this.snapGridStep) * this.snapGridStep;
  }

  public applySnapRotation(rad: number): number {
    if (this.snapAngleStep <= 0) return rad;
    return Math.round(rad / this.snapAngleStep) * this.snapAngleStep;
  }

  public applySnapScale(scale: number): number {
    if (this.snapScaleStep <= 0) return scale;
    return Math.max(0.01, Math.round(scale / this.snapScaleStep) * this.snapScaleStep);
  }

  public setSnappingEnabled(enabled: boolean): void {
    this.isSnapEnabled = enabled;
    this.updateControlsSnapping();
  }

  public setGridStep(step: number): void {
    this.snapGridStep = step;
    this.updateControlsSnapping();
  }

  public setAngleStep(step: number): void {
    this.snapAngleStep = step;
    this.updateControlsSnapping();
  }

  public setScaleStep(step: number): void {
    this.snapScaleStep = step;
    this.updateControlsSnapping();
  }

  private updateControlsSnapping(): void {
    if (!this.transformControls) return;
    this.transformControls.setTranslationSnap(
      this.isSnapEnabled && this.snapGridStep > 0 ? this.snapGridStep : null
    );
    this.transformControls.setRotationSnap(
      this.isSnapEnabled && this.snapAngleStep > 0 ? this.snapAngleStep : null
    );
    this.transformControls.setScaleSnap(
      this.isSnapEnabled && this.snapScaleStep > 0 ? this.snapScaleStep : null
    );
  }

  // --------------------------------------------------------------------------
  // Floor Alignment ('End' Hotkey)
  // --------------------------------------------------------------------------
  public alignObjectToFloor(object: RoomObject, meshBoundingBoxMinY: number): void {
    // End key calculation: drops object flush to floor at y = 0
    object.transform.position[1] = object.transform.position[1] - meshBoundingBoxMinY;
  }

  public executeFloorAlign(): boolean {
    if (!this.selectedObjectId) return false;
    const entry = this.objectMap.get(this.selectedObjectId);
    if (!entry || entry.roomObject.locked) return false;

    // Snapshot for undo
    this.pushState(this.currentObjects);

    // Compute bounding box
    entry.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(entry.mesh);
    const meshBoundingBoxMinY = isFinite(box.min.y) ? box.min.y : 0;

    this.alignObjectToFloor(entry.roomObject, meshBoundingBoxMinY);
    entry.mesh.position.y = entry.roomObject.transform.position[1];
    entry.mesh.updateMatrixWorld(true);

    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }

    this.callbacks.onTransformChanged?.(entry.roomObject);
    this.callbacks.onStateChanged?.(this.currentObjects);
    return true;
  }

  // --------------------------------------------------------------------------
  // Object Duplication ('Ctrl+D')
  // --------------------------------------------------------------------------
  public duplicateObject(object: RoomObject): RoomObject {
    const cloned: RoomObject = JSON.parse(JSON.stringify(object));
    cloned.id = generateUUID();
    cloned.name = `${object.name} (Copy)`;
    // Offset slightly so it's clearly distinct
    cloned.transform.position[0] += 0.5;
    cloned.transform.position[2] += 0.5;
    return cloned;
  }

  public executeDuplicate(): RoomObject | null {
    if (!this.selectedObjectId) return null;
    const entry = this.objectMap.get(this.selectedObjectId);
    if (!entry) return null;

    this.pushState(this.currentObjects);

    const clonedData = this.duplicateObject(entry.roomObject);
    this.currentObjects.push(clonedData);

    const clonedMesh = CatalogFactory.createMeshForItem(clonedData.catalogId, clonedData.customProps);
    this.registerObject(clonedData, clonedMesh);
    this.objectsGroup.add(clonedMesh);

    this.selectObject(clonedData.id);

    this.callbacks.onObjectAdded?.(clonedData);
    this.callbacks.onStateChanged?.(this.currentObjects);
    return clonedData;
  }

  // --------------------------------------------------------------------------
  // Object Deletion ('Delete' / 'Backspace')
  // --------------------------------------------------------------------------
  public executeDelete(): boolean {
    if (!this.selectedObjectId) return false;
    const entry = this.objectMap.get(this.selectedObjectId);
    if (!entry || entry.roomObject.locked) return false;

    this.pushState(this.currentObjects);

    const deletedId = this.selectedObjectId;
    this.selectObject(null);

    this.objectsGroup.remove(entry.mesh);
    this.disposeObject3D(entry.mesh);
    this.objectMap.delete(deletedId);
    this.currentObjects = this.currentObjects.filter((o) => o.id !== deletedId);

    this.callbacks.onObjectRemoved?.(deletedId);
    this.callbacks.onStateChanged?.(this.currentObjects);
    return true;
  }

  // --------------------------------------------------------------------------
  // 50-Step Undo / Redo Architecture
  // --------------------------------------------------------------------------
  public pushState(objects: RoomObject[]): void {
    this.undoStack.push(JSON.parse(JSON.stringify(objects)));
    if (this.undoStack.length > this.MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  public undo(currentObjects: RoomObject[]): RoomObject[] | null {
    if (this.undoStack.length === 0) return null;
    const previous = this.undoStack.pop()!;
    this.redoStack.push(JSON.parse(JSON.stringify(currentObjects)));
    return previous;
  }

  public redo(currentObjects: RoomObject[]): RoomObject[] | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(JSON.parse(JSON.stringify(currentObjects)));
    return next;
  }

  public executeUndo(): boolean {
    const restored = this.undo(this.currentObjects);
    if (!restored) return false;
    this.applyRestoredState(restored);
    return true;
  }

  public executeRedo(): boolean {
    const restored = this.redo(this.currentObjects);
    if (!restored) return false;
    this.applyRestoredState(restored);
    return true;
  }

  private applyRestoredState(restoredObjects: RoomObject[]): void {
    this.currentObjects = JSON.parse(JSON.stringify(restoredObjects));
    const restoredMap = new Map(restoredObjects.map((o) => [o.id, o]));

    // 1. Remove objects deleted in restored state
    for (const [id, entry] of Array.from(this.objectMap.entries())) {
      if (!restoredMap.has(id)) {
        if (this.selectedObjectId === id) this.selectObject(null);
        this.objectsGroup.remove(entry.mesh);
        this.disposeObject3D(entry.mesh);
        this.objectMap.delete(id);
      }
    }

    // 2. Add or update objects from restored state
    for (const restoredObj of restoredObjects) {
      const existing = this.objectMap.get(restoredObj.id);
      if (existing) {
        existing.roomObject = restoredObj;
        const p = restoredObj.transform.position;
        const r = restoredObj.transform.rotation;
        const s = restoredObj.transform.scale;
        existing.mesh.position.set(p[0], p[1], p[2]);
        existing.mesh.rotation.set(r[0], r[1], r[2]);
        existing.mesh.scale.set(s[0], s[1], s[2]);
        existing.mesh.updateMatrixWorld(true);
      } else {
        const mesh = CatalogFactory.createMeshForItem(restoredObj.catalogId, restoredObj.customProps);
        this.registerObject(restoredObj, mesh);
        this.objectsGroup.add(mesh);
      }
    }

    // 3. Refresh selection if still valid
    if (this.selectedObjectId) {
      if (restoredMap.has(this.selectedObjectId)) {
        const entry = this.objectMap.get(this.selectedObjectId);
        if (entry) {
          this.transformControls.attach(entry.mesh);
          if (this.selectionBoxHelper) this.selectionBoxHelper.update();
        }
      } else {
        this.selectObject(null);
      }
    }

    this.callbacks.onStateChanged?.(this.currentObjects);
  }

  // --------------------------------------------------------------------------
  // Selection & Raycasting with Neon Cyan Highlight (#00f3ff)
  // --------------------------------------------------------------------------
  public selectObject(objectId: string | null): void {
    if (this.selectedObjectId === objectId) return;

    // Clear previous selection highlight
    this.clearSelectionHighlight();
    this.transformControls.detach();

    this.selectedObjectId = objectId;

    if (!objectId) {
      this.callbacks.onSelectionChanged?.(null, null);
      return;
    }

    const entry = this.objectMap.get(objectId);
    if (!entry) {
      this.selectedObjectId = null;
      this.callbacks.onSelectionChanged?.(null, null);
      return;
    }

    // Attach gizmo only if not locked
    if (!entry.roomObject.locked) {
      this.transformControls.attach(entry.mesh);
    }

    // Apply Neon Cyan Emissive & Wireframe BoxHelper
    this.applySelectionHighlight(entry.mesh);

    this.callbacks.onSelectionChanged?.(objectId, entry.roomObject);
  }

  private applySelectionHighlight(rootObject: THREE.Object3D): void {
    // 1. Emissive glow (#00f3ff) on standard materials
    rootObject.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          if ("emissive" in mat && mat.emissive instanceof THREE.Color) {
            const matObj = mat as THREE.Material;
            const key = `${mesh.uuid}_${matObj.uuid}`;
            this.originalEmissives.set(key, {
              emissive: mat.emissive.clone(),
              intensity: (mat as any).emissiveIntensity ?? 1.0,
            });
            mat.emissive.setHex(0x00f3ff);
            (mat as any).emissiveIntensity = 0.4;
            mat.needsUpdate = true;
          }
        }
      }
    });

    // 2. Wireframe Bounding Box Helper (#00f3ff)
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }

    this.selectionBoxHelper = new THREE.BoxHelper(rootObject, new THREE.Color(0x00f3ff));
    const helperMat = this.selectionBoxHelper.material as THREE.LineBasicMaterial;
    helperMat.depthTest = false;
    helperMat.transparent = true;
    helperMat.opacity = 0.85;
    this.scene.add(this.selectionBoxHelper);
  }

  private clearSelectionHighlight(): void {
    // 1. Restore original material emissives
    if (this.selectedObjectId) {
      const entry = this.objectMap.get(this.selectedObjectId);
      if (entry) {
        entry.mesh.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) {
              const matObj = mat as THREE.Material;
              const key = `${mesh.uuid}_${matObj.uuid}`;
              const orig = this.originalEmissives.get(key);
              if (orig && "emissive" in mat && mat.emissive instanceof THREE.Color) {
                mat.emissive.copy(orig.emissive);
                (mat as any).emissiveIntensity = orig.intensity;
                mat.needsUpdate = true;
              }
            }
          }
        });
      }
    }
    this.originalEmissives.clear();

    // 2. Remove BoxHelper
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }
  }

  // --------------------------------------------------------------------------
  // Object Registration & Management
  // --------------------------------------------------------------------------
  public registerObject(roomObject: RoomObject, mesh: THREE.Object3D): void {
    mesh.name = roomObject.id;
    mesh.userData = {
      ...mesh.userData,
      isRoomObject: true,
      catalogId: roomObject.catalogId,
      objectId: roomObject.id,
      locked: roomObject.locked,
    };
    const p = roomObject.transform.position;
    const r = roomObject.transform.rotation;
    const s = roomObject.transform.scale;
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    mesh.updateMatrixWorld(true);

    this.objectMap.set(roomObject.id, { roomObject, mesh });
  }

  public unregisterObject(objectId: string): void {
    if (this.selectedObjectId === objectId) {
      this.selectObject(null);
    }
    const entry = this.objectMap.get(objectId);
    if (entry) {
      this.objectsGroup.remove(entry.mesh);
      this.disposeObject3D(entry.mesh);
      this.objectMap.delete(objectId);
    }
    this.currentObjects = this.currentObjects.filter((o) => o.id !== objectId);
  }

  public getSelectedObject(): RoomObject | null {
    if (!this.selectedObjectId) return null;
    return this.objectMap.get(this.selectedObjectId)?.roomObject ?? null;
  }

  public getObjects(): RoomObject[] {
    return JSON.parse(JSON.stringify(this.currentObjects));
  }

  public setCurrentObjects(objects: RoomObject[]): void {
    this.currentObjects = JSON.parse(JSON.stringify(objects));
  }

  // --------------------------------------------------------------------------
  // Hermite S-Curve Interpolation (Harness Compatibility)
  // --------------------------------------------------------------------------
  public interpolateBookmark(
    b1: CameraBookmark,
    b2: CameraBookmark,
    t: number
  ): { position: [number, number, number]; target: [number, number, number]; fov: number } {
    const clampedT = Math.max(0, Math.min(1, t));
    const s = 3 * clampedT * clampedT - 2 * clampedT * clampedT * clampedT;
    const lerp = (a: number, b: number) => a + (b - a) * s;
    return {
      position: [
        lerp(b1.position[0], b2.position[0]),
        lerp(b1.position[1], b2.position[1]),
        lerp(b1.position[2], b2.position[2]),
      ],
      target: [
        lerp(b1.target[0], b2.target[0]),
        lerp(b1.target[1], b2.target[1]),
        lerp(b1.target[2], b2.target[2]),
      ],
      fov: Math.max(10, Math.min(140, lerp(b1.fov, b2.fov))),
    };
  }

  // --------------------------------------------------------------------------
  // Event Listeners & Input Routing
  // --------------------------------------------------------------------------
  private attachEventListeners(): void {
    if (typeof window === "undefined") return;

    if (this.domElement) {
      this.domElement.addEventListener("pointerdown", this.onPointerDown);
      this.domElement.addEventListener("pointerup", this.onPointerUp);
    }
    window.addEventListener("keydown", this.onKeyDown);
  }

  private detachEventListeners(): void {
    if (typeof window === "undefined") return;

    if (this.domElement) {
      this.domElement.removeEventListener("pointerdown", this.onPointerDown);
      this.domElement.removeEventListener("pointerup", this.onPointerUp);
    }
    window.removeEventListener("keydown", this.onKeyDown);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.isDraggingGizmo) return;

    // Check click threshold (< 5px) to prevent firing during camera orbit
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (Math.hypot(dx, dy) > 5) return;

    if (!this.domElement) return;
    const rect = this.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.objectsGroup.children, true);

    if (intersects.length === 0) {
      this.selectObject(null);
      return;
    }

    // Find top-level room object root
    let hitRoot: THREE.Object3D | null = null;
    for (const hit of intersects) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.scene && curr !== this.objectsGroup) {
        if (curr.userData && curr.userData.isRoomObject && curr.userData.objectId) {
          hitRoot = curr;
          break;
        }
        curr = curr.parent;
      }
      if (hitRoot) break;
    }

    if (hitRoot && hitRoot.userData.objectId) {
      this.selectObject(hitRoot.userData.objectId);
    } else {
      this.selectObject(null);
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return; // Form input guard: never fire hotkeys when typing
    }

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    // Undo: Ctrl+Z
    if (isCtrlOrCmd && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      this.executeUndo();
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if (
      (isCtrlOrCmd && event.key.toLowerCase() === "y") ||
      (isCtrlOrCmd && event.key.toLowerCase() === "z" && event.shiftKey)
    ) {
      event.preventDefault();
      this.executeRedo();
      return;
    }

    // Duplication: Ctrl+D
    if (isCtrlOrCmd && event.key.toLowerCase() === "d") {
      event.preventDefault();
      this.executeDuplicate();
      return;
    }

    // Deletion: Delete or Backspace
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.executeDelete();
      return;
    }

    // Floor alignment: End
    if (event.key === "End") {
      event.preventDefault();
      this.executeFloorAlign();
      return;
    }

    // Deselect: Escape
    if (event.key === "Escape") {
      event.preventDefault();
      this.selectObject(null);
      return;
    }

    // Gizmo Modes: W (Translate), E (Rotate), R (Scale)
    // Guard: only switch on 'W' and 'E' if camera mode is 'orbit', not 'fly'
    if (!isCtrlOrCmd && !event.altKey && !event.shiftKey) {
      const activeCameraMode = this.getCameraMode ? this.getCameraMode() : this.cameraMode;
      if (activeCameraMode === "orbit") {
        if (event.key.toLowerCase() === "w") {
          this.setMode("translate");
        } else if (event.key.toLowerCase() === "e") {
          this.setMode("rotate");
        }
      }
      if (event.key.toLowerCase() === "r") {
        this.setMode("scale");
      }
    }
  };

  private syncAttachedObjectToData(): void {
    if (!this.selectedObjectId) return;
    const entry = this.objectMap.get(this.selectedObjectId);
    if (!entry) return;

    const mesh = entry.mesh;
    const obj = entry.roomObject;

    obj.transform.position = [mesh.position.x, mesh.position.y, mesh.position.z];
    obj.transform.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
    obj.transform.scale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];

    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }

    this.callbacks.onTransformChanged?.(obj);
  }

  private hasStateChanged(prev: RoomObject[], current: RoomObject[]): boolean {
    if (prev.length !== current.length) return true;
    for (let i = 0; i < current.length; i++) {
      const p = prev[i];
      const c = current[i];
      if (!p || !c || p.id !== c.id) return true;
      if (
        p.transform.position[0] !== c.transform.position[0] ||
        p.transform.position[1] !== c.transform.position[1] ||
        p.transform.position[2] !== c.transform.position[2] ||
        p.transform.rotation[0] !== c.transform.rotation[0] ||
        p.transform.rotation[1] !== c.transform.rotation[1] ||
        p.transform.rotation[2] !== c.transform.rotation[2] ||
        p.transform.scale[0] !== c.transform.scale[0] ||
        p.transform.scale[1] !== c.transform.scale[1] ||
        p.transform.scale[2] !== c.transform.scale[2]
      ) {
        return true;
      }
    }
    return false;
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      }
    });
  }

  public update(): void {
    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }
  }

  public dispose(): void {
    this.detachEventListeners();
    this.clearSelectionHighlight();
    this.transformControls.detach();
    this.transformControls.dispose();

    const helper = typeof (this.transformControls as any).getHelper === "function"
      ? (this.transformControls as any).getHelper()
      : (this.transformControls as unknown as THREE.Object3D);
    this.scene.remove(helper);

    for (const entry of Array.from(this.objectMap.values())) {
      this.disposeObject3D(entry.mesh);
    }
    this.objectMap.clear();
    this.undoStack = [];
    this.redoStack = [];
  }
}
