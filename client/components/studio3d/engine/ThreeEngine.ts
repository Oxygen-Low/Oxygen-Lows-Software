/**
 * ThreeEngine.ts
 * Core Three.js Engine for Oxygen Low's Software 3D Studio Editor.
 * Manages WebGLRenderer, Scene, PerspectiveCamera, rAF render loop,
 * ResizeObserver, EnvironmentManager, nature instancing, GizmoManager,
 * CameraController, and resource disposal.
 */

import * as THREE from "three";
import {
  RoomDocument,
  RoomObject,
  EnvironmentSettings,
  TransformData,
} from "@/types/threeDBackground";
import { EnvironmentManager } from "@/services/3d/environment/EnvironmentManager";
import {
  GraphicsPreset,
  GraphicsPresetConfig,
  getGraphicsPresetConfig,
} from "@/services/3d/environment/GraphicsPresets";
import { CatalogFactory } from "@/services/3d/catalog/CatalogFactory";
import { GrassGeometryFactory } from "@/services/3d/nature/GrassGeometryFactory";
import { createGrassMaterial } from "@/services/3d/nature/GrassShaders";
import { CameraController } from "./CameraController";
import { GizmoManager } from "./GizmoManager";

export interface ThreeEngineOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  initialRoom?: RoomDocument;
  graphicsPreset?: GraphicsPreset;
  onBeforeRender?: (deltaTime: number) => void;
  onAfterRender?: (deltaTime: number) => void;
  onObjectSelected?: (objectId: string | null) => void;
  onObjectTransformed?: (object: RoomObject) => void;
  onStateChanged?: (objects: RoomObject[]) => void;
}

export class ThreeEngine {
  // Core Three.js Objects
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly cameraController: CameraController;
  public readonly gizmoManager: GizmoManager;

  // Subsystems & Managers
  public environmentManager: EnvironmentManager;
  public currentPresetConfig: GraphicsPresetConfig;

  // Scene Graph Organization
  public readonly objectsGroup: THREE.Group;
  public readonly helpersGroup: THREE.Group;
  private grassMesh: THREE.Mesh | null = null;
  private objectMap: Map<string, THREE.Object3D> = new Map();

  // Lifecycle & Animation Loop State
  private clock: THREE.Clock;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private lastFrameTime = 0;
  private targetFrameInterval = 1000 / 60; // ms per frame

  // DOM & Observers
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private boundVisibilityHandler: () => void;

  // Raycasting & Selection
  private raycaster = new THREE.Raycaster();
  private selectedObjectId: string | null = null;

  // Callbacks
  private onBeforeRenderCallback?: (deltaTime: number) => void;
  private onAfterRenderCallback?: (deltaTime: number) => void;
  private onObjectSelectedCallback?: (objectId: string | null) => void;
  private onObjectTransformedCallback?: (object: RoomObject) => void;
  private onStateChangedCallback?: (objects: RoomObject[]) => void;

  constructor(options: ThreeEngineOptions) {
    this.canvas = options.canvas;
    this.container = options.container;
    this.onBeforeRenderCallback = options.onBeforeRender;
    this.onAfterRenderCallback = options.onAfterRender;
    this.onObjectSelectedCallback = options.onObjectSelected;
    this.onObjectTransformedCallback = options.onObjectTransformed;
    this.onStateChangedCallback = options.onStateChanged;

    // 1. Initialize Preset Configuration
    const preset = options.graphicsPreset || "high";
    this.currentPresetConfig = getGraphicsPresetConfig(preset);
    this.targetFrameInterval = 1000 / this.currentPresetConfig.maxFps;

    // 2. Initialize Scene
    this.scene = new THREE.Scene();
    this.scene.name = "Studio3D_Scene";

    // Layer groups for clean hierarchy
    this.objectsGroup = new THREE.Group();
    this.objectsGroup.name = "RoomObjectsGroup";
    this.scene.add(this.objectsGroup);

    this.helpersGroup = new THREE.Group();
    this.helpersGroup.name = "HelpersGroup";
    this.scene.add(this.helpersGroup);

    // 3. Initialize Perspective Camera
    const width = Math.max(1, this.container?.clientWidth || 800);
    const height = Math.max(1, this.container?.clientHeight || 600);
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 5, 8);
    this.camera.lookAt(0, 1, 0);

    // 4. Initialize WebGLRenderer with fallback for headless / test environments
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      this.configureRenderer();
    } catch {
      this.renderer = {
        setSize: () => {},
        setPixelRatio: () => {},
        render: () => {},
        dispose: () => {},
        forceContextLoss: () => {},
        shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        outputColorSpace: THREE.SRGBColorSpace,
        getSize: (target: THREE.Vector2) => target.set(800, 600),
        setRenderTarget: () => {},
      } as unknown as THREE.WebGLRenderer;
    }

    // 5. Initialize CameraController
    this.cameraController = new CameraController({
      camera: this.camera,
      domElement: this.canvas,
      helpersGroup: this.helpersGroup,
    });

    // 6. Initialize GizmoManager
    this.gizmoManager = new GizmoManager({
      scene: this.scene,
      camera: this.camera,
      domElement: this.canvas,
      orbitControls: this.cameraController.orbitControls,
      getCameraMode: () => this.cameraController.getNavigationMode(),
      objectsGroup: this.objectsGroup,
      initialObjects: options.initialRoom?.objects,
      onSelectionChanged: (id) => {
        this.selectedObjectId = id;
        this.onObjectSelectedCallback?.(id);
      },
      onTransformChanged: (obj) => {
        this.onObjectTransformedCallback?.(obj);
      },
      onStateChanged: (objects) => {
        this.onStateChangedCallback?.(objects);
      },
    });

    // 7. Initialize Clock
    this.clock = new THREE.Clock();

    // 8. Initialize Environment
    const envSettings = options.initialRoom?.environment || {
      preset: "day" as const,
      sunPosition: [10, 20, 10] as [number, number, number],
      sunIntensity: 1.5,
      sunColor: "#fff4e0",
      ambientColor: "#87ceeb",
      ambientIntensity: 0.4,
      skyColor: "#4ca6ff",
      groundColor: "#2d5a27",
      windSpeed: 2.5,
      windDirection: 45,
      windGustiness: 0.3,
      grassDensity: "medium" as const,
    };
    this.environmentManager = new EnvironmentManager(envSettings, preset);
    this.attachEnvironment();

    // 9. Load Initial Room if provided
    if (options.initialRoom) {
      this.loadRoom(options.initialRoom);
    }

    // 10. Attach ResizeObserver & Visibility Listeners
    this.setupResizeObserver();
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.boundVisibilityHandler);
    }

    // 11. Start Render Loop
    this.start();
  }

  private configureRenderer(): void {
    const width = Math.max(1, this.container?.clientWidth || 800);
    const height = Math.max(1, this.container?.clientHeight || 600);
    const pixelRatio = typeof window !== "undefined"
      ? Math.min(window.devicePixelRatio || 1, this.currentPresetConfig.pixelRatioCap)
      : 1;

    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = this.currentPresetConfig.enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private attachEnvironment(): void {
    this.scene.add(this.environmentManager.skyMesh);
    this.scene.add(this.environmentManager.sunLight);
    this.scene.add(this.environmentManager.hemiLight);
    this.scene.add(this.environmentManager.ambientLight);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === "undefined" || !this.container) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.handleResize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  public handleResize(width: number, height: number): void {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    this.camera.aspect = safeW / safeH;
    this.camera.updateProjectionMatrix();

    const pixelRatio = typeof window !== "undefined"
      ? Math.min(window.devicePixelRatio || 1, this.currentPresetConfig.pixelRatioCap)
      : 1;
    this.renderer.setSize(safeW, safeH, false);
    this.renderer.setPixelRatio(pixelRatio);
  }

  private handleVisibilityChange(): void {
    if (typeof document !== "undefined" && document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  }

  // --- Render Loop & Animation ---

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start();
    this.lastFrameTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.tick();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public pause(): void {
    this.isPaused = true;
    this.clock.stop();
  }

  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.clock.start();
    this.lastFrameTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    if (typeof requestAnimationFrame !== "undefined") {
      this.animationFrameId = requestAnimationFrame(this.tick);
    }

    if (this.isPaused) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - this.lastFrameTime;

    // Framerate limiter
    if (elapsed < this.targetFrameInterval) return;

    this.lastFrameTime = now - (elapsed % this.targetFrameInterval);
    const deltaTime = Math.min(this.clock.getDelta(), 0.1); // clamp to 100ms max

    // 1. Update Environment & Wind
    this.environmentManager.updateWindTime(deltaTime);

    // 2. Update Camera Controller
    this.cameraController.update(deltaTime);

    // 3. Update Gizmo Helper
    this.gizmoManager.update();

    // 4. User Hook: onBeforeRender
    this.onBeforeRenderCallback?.(deltaTime);

    // 5. Render Primary Viewport
    this.renderer.render(this.scene, this.camera);

    // 6. User Hook: onAfterRender
    this.onAfterRenderCallback?.(deltaTime);
  };

  // --- Room & Scene Management ---

  public loadRoom(room: RoomDocument): void {
    // 1. Clear existing room objects
    this.clearObjects();

    // 2. Update Environment
    this.environmentManager.update(room.environment);

    // 3. Populate Camera Bookmarks
    if (room.cameraBookmarks && room.cameraBookmarks.length > 0) {
      this.cameraController.setBookmarks(room.cameraBookmarks, room.activeBookmarkIndex || 0);
    }

    // 4. Sync GizmoManager objects
    this.gizmoManager.setCurrentObjects(room.objects);

    // 5. Instantiate Room Objects
    for (const obj of room.objects) {
      this.addObject(obj);
    }

    // 6. Generate Grass if density != 'none'
    this.rebuildGrass(room.environment.grassDensity);
  }

  public addObject(obj: RoomObject): THREE.Object3D {
    const mesh = CatalogFactory.createMeshForItem(obj.catalogId, obj.customProps);
    const p = obj.transform.position;
    const r = obj.transform.rotation;
    const s = obj.transform.scale;
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    mesh.visible = obj.visible;

    mesh.userData = {
      ...mesh.userData,
      isRoomObject: true,
      roomId: obj.id,
      catalogId: obj.catalogId,
      locked: obj.locked,
    };

    this.objectsGroup.add(mesh);
    this.objectMap.set(obj.id, mesh);
    this.gizmoManager.registerObject(obj, mesh);
    return mesh;
  }

  public removeObject(objectId: string): boolean {
    const mesh = this.objectMap.get(objectId);
    if (!mesh) return false;

    this.gizmoManager.unregisterObject(objectId);
    this.objectsGroup.remove(mesh);
    CatalogFactory.disposeMesh(mesh);
    this.objectMap.delete(objectId);

    if (this.selectedObjectId === objectId) {
      this.selectObject(null);
    }
    return true;
  }

  public updateObjectTransform(objectId: string, transform: TransformData): void {
    const mesh = this.objectMap.get(objectId);
    if (!mesh) return;
    const p = transform.position;
    const r = transform.rotation;
    const s = transform.scale;
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    mesh.updateMatrixWorld(true);
  }

  public clearObjects(): void {
    for (const [id, mesh] of this.objectMap.entries()) {
      this.gizmoManager.unregisterObject(id);
      this.objectsGroup.remove(mesh);
      CatalogFactory.disposeMesh(mesh);
    }
    this.objectMap.clear();
    this.selectObject(null);
  }

  private rebuildGrass(density: string): void {
    if (this.grassMesh) {
      this.scene.remove(this.grassMesh);
      CatalogFactory.disposeMesh(this.grassMesh);
      this.grassMesh = null;
    }

    if (density === "none") return;

    let bladeCount = this.currentPresetConfig.grassBladeCount;
    if (density === "low") bladeCount = Math.floor(bladeCount * 0.4);
    if (density === "medium") bladeCount = Math.floor(bladeCount * 0.7);

    const grassMat = createGrassMaterial();
    this.environmentManager.registerWindMaterial(grassMat);

    this.grassMesh = GrassGeometryFactory.createInstancedGrassMesh({
      segments: this.currentPresetConfig.grassSegments,
      distribution: {
        width: 14,
        depth: 14,
        bladeCount,
        baseTint: "#15803D",
      },
      material: grassMat,
    });

    this.scene.add(this.grassMesh);
  }

  // --- Object Picking & Selection ---

  public raycast(ndcX: number, ndcY: number): THREE.Intersection[] {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.intersectObjects(this.objectsGroup.children, true);
  }

  public pickObject(ndcX: number, ndcY: number): string | null {
    const hits = this.raycast(ndcX, ndcY);
    for (const hit of hits) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.objectsGroup && curr !== this.scene) {
        if (curr.userData && (curr.userData.roomId || curr.userData.objectId)) {
          return curr.userData.roomId || curr.userData.objectId;
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  public selectObject(objectId: string | null): void {
    this.selectedObjectId = objectId;
    this.gizmoManager.selectObject(objectId);
    this.onObjectSelectedCallback?.(objectId);
  }

  public getSelectedObject(): THREE.Object3D | null {
    if (!this.selectedObjectId) return null;
    return this.objectMap.get(this.selectedObjectId) || null;
  }

  // --- Graphics Quality Settings ---

  public setGraphicsPreset(preset: GraphicsPreset): void {
    this.currentPresetConfig = getGraphicsPresetConfig(preset);
    this.targetFrameInterval = 1000 / this.currentPresetConfig.maxFps;
    this.environmentManager.setGraphicsPreset(preset);
    this.configureRenderer();

    // Update grass LOD if present
    if (this.grassMesh) {
      GrassGeometryFactory.updateGrassLod(this.grassMesh, this.currentPresetConfig.grassSegments);
    }
  }

  // --- Thumbnail Capture ---

  public generateThumbnail(width = 320, height = 240): string {
    if (!this.renderer || !this.canvas) return "";

    const originalAspect = this.camera.aspect;
    const originalSize = new THREE.Vector2();
    this.renderer.getSize(originalSize);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);

    let dataUrl = "";
    try {
      dataUrl = this.canvas.toDataURL("image/webp", 0.85);
    } catch {
      try {
        dataUrl = this.canvas.toDataURL("image/png");
      } catch {
        dataUrl = "";
      }
    }

    // Restore original size
    this.camera.aspect = originalAspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(originalSize.x, originalSize.y, false);

    return dataUrl;
  }

  // --- Resource Disposal ---

  public dispose(): void {
    this.stop();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
    }

    this.gizmoManager.dispose();
    this.cameraController.dispose();
    this.environmentManager.dispose();
    this.clearObjects();

    if (this.grassMesh) {
      CatalogFactory.disposeMesh(this.grassMesh);
      this.grassMesh = null;
    }

    this.renderer.dispose();
    if (typeof (this.renderer as any).forceContextLoss === "function") {
      (this.renderer as any).forceContextLoss();
    }
  }
}
