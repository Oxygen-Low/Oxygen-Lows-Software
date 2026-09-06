/**
 * CameraController.ts
 * Dual Navigation Camera Controller for Oxygen Low's Software 3D Studio Editor.
 * Combines OrbitControls (with damping, focus hotkey 'F', distance clamping)
 * and Fly Camera (WASD translation, Q/E elevation, Shift sprint, mouse look).
 * Features Hermite S-Curve bookmark transitions (C^1 continuity) and Grid/Axes helpers.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CameraBookmark, Vector3Tuple } from "@/types/threeDBackground";

export type NavigationMode = "orbit" | "fly";

export interface CameraControllerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  helpersGroup: THREE.Group;
  initialMode?: NavigationMode;
  flySpeed?: number; // m/s (default 5.0)
  sprintMultiplier?: number; // default 2.5
}

export interface BookmarkTransition {
  startBookmark: CameraBookmark;
  endBookmark: CameraBookmark;
  duration: number;
  elapsedTime: number;
  onComplete?: (bookmark: CameraBookmark) => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  ) {
    return true;
  }
  let curr: HTMLElement | null = target;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    if (
      curr.isContentEditable ||
      curr.contentEditable === "true" ||
      curr.getAttribute?.("contenteditable") === "true" ||
      curr.getAttribute?.("contenteditable") === ""
    ) {
      return true;
    }
    curr = curr.parentElement;
  }
  return false;
}

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly domElement: HTMLElement;
  public readonly orbitControls: OrbitControls;

  // Navigation Mode
  private mode: NavigationMode = "orbit";

  // Fly Camera State
  public flySpeed = 5.0; // Base meters per second
  public sprintMultiplier = 2.5;
  private keysPressed = new Set<string>();
  private isMouseLooking = false;
  private mouseSensitivity = 0.0025;
  private flyEuler = new THREE.Euler(0, 0, 0, "YXZ");

  // Viewpoint Bookmarks & Transitions
  private bookmarks: CameraBookmark[] = [];
  private activeBookmarkIndex = 0;
  private activeTransition: BookmarkTransition | null = null;

  // Visual Helpers
  private gridHelper: THREE.GridHelper;
  private axesHelper: THREE.AxesHelper;
  private readonly helpersGroup: THREE.Group;

  // Event Listeners
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundBlur: () => void;

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.helpersGroup = options.helpersGroup;
    this.mode = options.initialMode || "orbit";
    this.flySpeed = options.flySpeed ?? 5.0;
    this.sprintMultiplier = options.sprintMultiplier ?? 2.5;

    // 1. Initialize OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.domElement);
    this.setupOrbitControls();

    // 2. Initialize GridHelper (20m x 20m, 40 divs = 0.5m grid lines matching snap step)
    this.gridHelper = new THREE.GridHelper(20, 40, 0x475569, 0x1e293b);
    this.gridHelper.position.y = 0.001; // Avoid z-fighting with floors
    this.helpersGroup.add(this.gridHelper);

    // 3. Initialize AxesHelper (2m length, RGB: X=Red, Y=Green, Z=Blue)
    this.axesHelper = new THREE.AxesHelper(2.0);
    this.helpersGroup.add(this.axesHelper);

    // 4. Bind Event Handlers
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundBlur = () => this.clearKeys();

    this.attachEventListeners();
    this.syncFlyEulerFromCamera();
  }

  public clearKeys(): void {
    this.keysPressed.clear();
  }

  private setupOrbitControls(): void {
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.minDistance = 0.2; // Prevents near clipping
    this.orbitControls.maxDistance = 250.0; // Prevents escaping into infinity
    this.orbitControls.maxPolarAngle = Math.PI * 0.495; // Prevents flipping below floor
    this.orbitControls.target.set(0, 1, 0);
  }

  private attachEventListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    if (this.domElement) {
      this.domElement.addEventListener("mousedown", this.boundMouseDown);
      this.domElement.addEventListener("wheel", this.boundWheel, { passive: false });
    }
    window.addEventListener("mouseup", this.boundMouseUp);
    window.addEventListener("mousemove", this.boundMouseMove);
    window.addEventListener("blur", this.boundBlur);
  }

  // --- Mode Switching ---

  public getNavigationMode(): NavigationMode {
    return this.mode;
  }

  public setNavigationMode(mode: NavigationMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === "orbit") {
      this.orbitControls.enabled = true;
      // Derive look-at target from forward vector
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.orbitControls.target.copy(this.camera.position).addScaledVector(forward, 5.0);
      this.orbitControls.update();
    } else {
      this.orbitControls.enabled = false;
      this.syncFlyEulerFromCamera();
    }
  }

  public setOrbitEnabled(enabled: boolean): void {
    if (this.mode === "orbit") {
      this.orbitControls.enabled = enabled;
    }
  }

  // --- Focus Hotkey ('F') & Target Centering ---

  public focusOnObject(object: THREE.Object3D): void {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);

    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      this.focusOnPoint(object.position);
      return;
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const targetDist = Math.max(maxDim * 2.2, 1.5);

    this.focusOnPointWithDistance(center, targetDist);
  }

  public focusOnPoint(point: THREE.Vector3): void {
    const currentDist = this.camera.position.distanceTo(this.orbitControls.target);
    const safeDist = isFinite(currentDist) && currentDist > 0.5 ? currentDist : 5.0;
    this.focusOnPointWithDistance(point, safeDist);
  }

  public focusOnPointWithDistance(point: THREE.Vector3, distance: number): void {
    if (!isFinite(point.x) || !isFinite(point.y) || !isFinite(point.z)) {
      return;
    }

    const dir = new THREE.Vector3().subVectors(this.camera.position, this.orbitControls.target);
    if (dir.lengthSq() < 0.001 || !isFinite(dir.lengthSq())) {
      dir.set(0, 1, 2);
    }
    dir.normalize();

    this.orbitControls.target.copy(point);
    this.camera.position.copy(point).addScaledVector(dir, Math.max(0.5, distance));
    this.orbitControls.update();
  }

  // --- Fly Camera Key & Mouse Input ---

  private handleKeyDown(e: KeyboardEvent): void {
    if (isEditableElement(e.target)) {
      return;
    }

    if (e.key === "f" || e.key === "F") {
      const targetPoint = this.orbitControls.target;
      this.focusOnPoint(targetPoint);
      return;
    }

    this.keysPressed.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysPressed.delete(e.code);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.mode === "fly" && (e.button === 0 || e.button === 2)) {
      this.isMouseLooking = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (this.mode === "fly") {
      this.isMouseLooking = false;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.mode !== "fly" || !this.isMouseLooking) return;

    const deltaX = e.movementX || 0;
    const deltaY = e.movementY || 0;

    this.flyEuler.y -= deltaX * this.mouseSensitivity;
    this.flyEuler.x -= deltaY * this.mouseSensitivity;

    // Pitch clamping between -89° and +89°
    const maxPitch = Math.PI * 0.495;
    this.flyEuler.x = Math.max(-maxPitch, Math.min(maxPitch, this.flyEuler.x));

    this.camera.quaternion.setFromEuler(this.flyEuler);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.mode === "fly") {
      e.preventDefault();
      // Adjust fly speed dynamically via wheel
      const delta = e.deltaY < 0 ? 1.15 : 0.85;
      this.flySpeed = Math.max(0.1, Math.min(30.0, this.flySpeed * delta));
    }
  }

  private syncFlyEulerFromCamera(): void {
    this.flyEuler.setFromQuaternion(this.camera.quaternion, "YXZ");
  }

  // --- Viewpoint Bookmarks & Hermite S-Curve Transitions ---

  public setBookmarks(bookmarks: CameraBookmark[], activeIndex = 0): void {
    this.bookmarks = [...bookmarks];
    this.activeBookmarkIndex = Math.max(0, Math.min(bookmarks.length - 1, activeIndex));
  }

  public getBookmarks(): CameraBookmark[] {
    return this.bookmarks;
  }

  public getActiveBookmarkIndex(): number {
    return this.activeBookmarkIndex;
  }

  /**
   * Smoothly transitions camera to bookmark using Hermite S-Curve:
   * s(t) = 3t^2 - 2t^3  (C^1 continuity: s'(0) = 0, s'(1) = 0)
   */
  public transitionToBookmark(
    target: CameraBookmark | number,
    duration = 1.2,
    onComplete?: (bm: CameraBookmark) => void
  ): void {
    let destBookmark: CameraBookmark;
    if (typeof target === "number") {
      if (target < 0 || target >= this.bookmarks.length) return;
      destBookmark = this.bookmarks[target];
      this.activeBookmarkIndex = target;
    } else {
      destBookmark = target;
      const idx = this.bookmarks.findIndex((b) => b.id === target.id);
      if (idx !== -1) this.activeBookmarkIndex = idx;
    }

    const currentBookmark: CameraBookmark = {
      id: "current",
      name: "Current View",
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.orbitControls.target.x, this.orbitControls.target.y, this.orbitControls.target.z],
      fov: this.camera.fov,
      isPreset: false,
    };

    this.activeTransition = {
      startBookmark: currentBookmark,
      endBookmark: destBookmark,
      duration: Math.max(0.2, duration),
      elapsedTime: 0,
      onComplete,
    };
  }

  public static interpolateHermite(
    b1: CameraBookmark,
    b2: CameraBookmark,
    t: number
  ): { position: Vector3Tuple; target: Vector3Tuple; fov: number } {
    const clampedT = Math.max(0, Math.min(1, t));
    // Hermite S-Curve: s(t) = 3t^2 - 2t^3
    const s = 3 * clampedT * clampedT - 2 * clampedT * clampedT * clampedT;
    const lerp = (a: number, b: number) => a + (b - a) * s;

    // FOV clamping between 10 and 140 degrees
    const interpolatedFov = Math.max(10, Math.min(140, lerp(b1.fov, b2.fov)));

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
      fov: interpolatedFov,
    };
  }

  // --- Frame Update Loop ---

  public update(deltaTime: number): void {
    // 1. Process Active Bookmark Transition
    if (this.activeTransition) {
      this.activeTransition.elapsedTime += deltaTime;
      const t = this.activeTransition.elapsedTime / this.activeTransition.duration;

      const state = CameraController.interpolateHermite(
        this.activeTransition.startBookmark,
        this.activeTransition.endBookmark,
        t
      );

      this.camera.position.set(state.position[0], state.position[1], state.position[2]);
      this.orbitControls.target.set(state.target[0], state.target[1], state.target[2]);
      this.camera.fov = state.fov;
      this.camera.updateProjectionMatrix();
      this.orbitControls.update();

      if (t >= 1.0) {
        const finished = this.activeTransition;
        this.activeTransition = null;
        this.syncFlyEulerFromCamera();
        finished.onComplete?.(finished.endBookmark);
      }
      return;
    }

    // 2. Process OrbitControls
    if (this.mode === "orbit") {
      this.orbitControls.update();
      return;
    }

    // 3. Process Fly Camera Translation
    if (this.mode === "fly") {
      this.updateFlyMovement(deltaTime);
    }
  }

  private updateFlyMovement(deltaTime: number): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0);

    const moveVector = new THREE.Vector3();

    if (this.keysPressed.has("KeyW")) moveVector.add(forward);
    if (this.keysPressed.has("KeyS")) moveVector.sub(forward);
    if (this.keysPressed.has("KeyD")) moveVector.add(right);
    if (this.keysPressed.has("KeyA")) moveVector.sub(right);
    if (this.keysPressed.has("KeyE") || this.keysPressed.has("Space")) moveVector.add(worldUp);
    if (this.keysPressed.has("KeyQ") || this.keysPressed.has("KeyC")) moveVector.sub(worldUp);

    if (moveVector.lengthSq() > 0.0001) {
      moveVector.normalize();
      const isSprinting = this.keysPressed.has("ShiftLeft") || this.keysPressed.has("ShiftRight");
      const speed = this.flySpeed * (isSprinting ? this.sprintMultiplier : 1.0);

      this.camera.position.addScaledVector(moveVector, speed * deltaTime);
      this.orbitControls.target.addScaledVector(moveVector, speed * deltaTime);
    }
  }

  // --- Visual Helpers Display ---

  public setGridVisible(visible: boolean): void {
    this.gridHelper.visible = visible;
  }

  public setAxesVisible(visible: boolean): void {
    this.axesHelper.visible = visible;
  }

  // --- Resource Disposal ---

  public dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.boundKeyDown);
      window.removeEventListener("keyup", this.boundKeyUp);
      window.removeEventListener("mouseup", this.boundMouseUp);
      window.removeEventListener("mousemove", this.boundMouseMove);
      window.removeEventListener("blur", this.boundBlur);
    }
    if (this.domElement) {
      this.domElement.removeEventListener("mousedown", this.boundMouseDown);
      this.domElement.removeEventListener("wheel", this.boundWheel);
    }

    this.orbitControls.dispose();
    this.gridHelper.geometry.dispose();
    if (Array.isArray(this.gridHelper.material)) {
      this.gridHelper.material.forEach((m) => m.dispose());
    } else {
      this.gridHelper.material.dispose();
    }
    this.axesHelper.geometry.dispose();
    if (Array.isArray(this.axesHelper.material)) {
      this.axesHelper.material.forEach((m) => m.dispose());
    } else {
      this.axesHelper.material.dispose();
    }
  }
}
