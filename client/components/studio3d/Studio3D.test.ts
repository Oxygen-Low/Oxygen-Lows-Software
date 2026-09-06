/**
 * Studio3D.test.ts
 * Unit tests for Oxygen Low's Software 3D Studio Editor application:
 * ThreeEngine, CameraController, GizmoManager, and 50-step undo/redo stack.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { CameraController } from "./engine/CameraController";
import { GizmoManager } from "./engine/GizmoManager";
import { ThreeEngine } from "./engine/ThreeEngine";
import { RoomDocument, RoomObject, CameraBookmark } from "@/types/threeDBackground";
import { COZY_BEDROOM_TEMPLATE, BLANK_CANVAS_TEMPLATE } from "@/services/3d/storage/RoomTemplates";

describe("3D Studio Editor Engine & Controllers Suite", () => {
  let container: HTMLElement;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });

    canvas = document.createElement("canvas");
    container.appendChild(canvas);
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // ==========================================================================
  // 1. CameraController Unit Tests
  // ==========================================================================
  describe("CameraController", () => {
    let camera: THREE.PerspectiveCamera;
    let helpersGroup: THREE.Group;
    let controller: CameraController;

    beforeEach(() => {
      camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
      camera.position.set(0, 5, 10);
      helpersGroup = new THREE.Group();
      controller = new CameraController({
        camera,
        domElement: canvas,
        helpersGroup,
      });
    });

    afterEach(() => {
      controller.dispose();
    });

    it("initializes with default orbit navigation mode and damping", () => {
      expect(controller.getNavigationMode()).toBe("orbit");
      expect(controller.orbitControls.enableDamping).toBe(true);
      expect(controller.orbitControls.dampingFactor).toBe(0.05);
      expect(controller.orbitControls.minDistance).toBe(0.2);
      expect(controller.orbitControls.maxDistance).toBe(250.0);
    });

    it("switches navigation modes between orbit and fly", () => {
      controller.setNavigationMode("fly");
      expect(controller.getNavigationMode()).toBe("fly");
      expect(controller.orbitControls.enabled).toBe(false);

      controller.setNavigationMode("orbit");
      expect(controller.getNavigationMode()).toBe("orbit");
      expect(controller.orbitControls.enabled).toBe(true);
    });

    it("focuses on target point with safe distance", () => {
      const targetPoint = new THREE.Vector3(2, 0, 2);
      controller.focusOnPointWithDistance(targetPoint, 6.0);

      expect(controller.orbitControls.target.x).toBeCloseTo(2, 2);
      expect(controller.orbitControls.target.y).toBeCloseTo(0, 2);
      expect(controller.orbitControls.target.z).toBeCloseTo(2, 2);

      const distance = camera.position.distanceTo(targetPoint);
      expect(distance).toBeCloseTo(6.0, 1);
    });

    it("focuses on object bounding box center", () => {
      const geom = new THREE.BoxGeometry(2, 4, 2);
      const mat = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(5, 2, -5);

      controller.focusOnObject(mesh);

      expect(controller.orbitControls.target.x).toBeCloseTo(5, 2);
      expect(controller.orbitControls.target.y).toBeCloseTo(2, 2);
      expect(controller.orbitControls.target.z).toBeCloseTo(-5, 2);
      expect(isFinite(camera.position.x)).toBe(true);
      expect(isFinite(camera.position.y)).toBe(true);
      expect(isFinite(camera.position.z)).toBe(true);
    });

    it("focuses safely on zero-volume point objects without producing NaN", () => {
      const pointObj = new THREE.Object3D();
      pointObj.position.set(10, 0, 10);

      controller.focusOnObject(pointObj);

      expect(isNaN(controller.orbitControls.target.x)).toBe(false);
      expect(isNaN(controller.orbitControls.target.y)).toBe(false);
      expect(isNaN(controller.orbitControls.target.z)).toBe(false);
      expect(isNaN(camera.position.x)).toBe(false);
      expect(isNaN(camera.position.y)).toBe(false);
      expect(isNaN(camera.position.z)).toBe(false);
    });

    it("interpolates camera bookmarks via Hermite S-Curve (C^1 continuity)", () => {
      const b1: CameraBookmark = {
        id: "bm-1",
        name: "Start",
        position: [0, 0, 0],
        target: [0, 0, -10],
        fov: 50,
        isPreset: false,
      };
      const b2: CameraBookmark = {
        id: "bm-2",
        name: "End",
        position: [10, 20, 30],
        target: [0, 10, 0],
        fov: 70,
        isPreset: false,
      };

      // Boundary t = 0
      const at0 = CameraController.interpolateHermite(b1, b2, 0.0);
      expect(at0.position).toEqual([0, 0, 0]);
      expect(at0.target).toEqual([0, 0, -10]);
      expect(at0.fov).toBe(50);

      // Boundary t = 1
      const at1 = CameraController.interpolateHermite(b1, b2, 1.0);
      expect(at1.position).toEqual([10, 20, 30]);
      expect(at1.target).toEqual([0, 10, 0]);
      expect(at1.fov).toBe(70);

      // Midpoint t = 0.5: s(0.5) = 3*(0.25) - 2*(0.125) = 0.5
      const atHalf = CameraController.interpolateHermite(b1, b2, 0.5);
      expect(atHalf.position[0]).toBeCloseTo(5, 4);
      expect(atHalf.position[1]).toBeCloseTo(10, 4);
      expect(atHalf.position[2]).toBeCloseTo(15, 4);
      expect(atHalf.fov).toBeCloseTo(60, 4);
    });

    it("clamps FOV within safe limits (10° to 140°)", () => {
      const b1: CameraBookmark = {
        id: "bm-1",
        name: "Low",
        position: [0, 0, 0],
        target: [0, 0, 0],
        fov: 5, // Below 10 min
        isPreset: false,
      };
      const b2: CameraBookmark = {
        id: "bm-2",
        name: "High",
        position: [0, 0, 0],
        target: [0, 0, 0],
        fov: 160, // Above 140 max
        isPreset: false,
      };

      const resultLow = CameraController.interpolateHermite(b1, b2, 0.0);
      expect(resultLow.fov).toBe(10);

      const resultHigh = CameraController.interpolateHermite(b1, b2, 1.0);
      expect(resultHigh.fov).toBe(140);
    });

    it("manages camera bookmarks list and active bookmark index", () => {
      const bookmarks: CameraBookmark[] = [
        { id: "1", name: "View 1", position: [0, 2, 5], target: [0, 1, 0], fov: 50, isPreset: false },
        { id: "2", name: "View 2", position: [5, 5, 5], target: [0, 0, 0], fov: 60, isPreset: false },
      ];

      controller.setBookmarks(bookmarks, 1);
      expect(controller.getBookmarks()).toHaveLength(2);
      expect(controller.getActiveBookmarkIndex()).toBe(1);
    });

    it("toggles visual helpers visibility", () => {
      controller.setGridVisible(false);
      controller.setAxesVisible(false);
      // Verify disposal without crashing
      controller.dispose();
    });
  });

  // ==========================================================================
  // 2. GizmoManager Unit Tests
  // ==========================================================================
  describe("GizmoManager", () => {
    let scene: THREE.Scene;
    let camera: THREE.Camera;
    let objectsGroup: THREE.Group;
    let gizmoManager: GizmoManager;

    const mockObject: RoomObject = {
      id: "test-chair-1",
      name: "Ergonomic Chair",
      catalogId: "furniture_ergonomic_chair",
      type: "furniture",
      transform: {
        position: [1.24, 2.5, 3.76],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
      locked: false,
    };

    beforeEach(() => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [mockObject],
      });
    });

    afterEach(() => {
      gizmoManager.dispose();
    });

    it("supports all 3 transform modes (translate, rotate, scale)", () => {
      expect(gizmoManager.activeMode).toBe("translate");

      gizmoManager.setMode("rotate");
      expect(gizmoManager.activeMode).toBe("rotate");

      gizmoManager.setMode("scale");
      expect(gizmoManager.activeMode).toBe("scale");

      gizmoManager.activeMode = "translate";
      expect(gizmoManager.activeMode).toBe("translate");
    });

    it("interlocks OrbitControls during gizmo drag", () => {
      gizmoManager.setGizmoDragging(true);
      expect(gizmoManager.isDraggingGizmo).toBe(true);
      expect(gizmoManager.orbitControlsEnabled).toBe(false);

      gizmoManager.setGizmoDragging(false);
      expect(gizmoManager.isDraggingGizmo).toBe(false);
      expect(gizmoManager.orbitControlsEnabled).toBe(true);
    });

    it("quantizes position accurately based on snapGridStep", () => {
      gizmoManager.snapGridStep = 0.5;
      expect(gizmoManager.applySnapPosition(1.24)).toBe(1.0);
      expect(gizmoManager.applySnapPosition(1.26)).toBe(1.5);
      expect(gizmoManager.applySnapPosition(0.0)).toBe(0.0);
      expect(gizmoManager.applySnapPosition(-1.26)).toBe(-1.5);

      // Continuous when disabled / step <= 0
      gizmoManager.snapGridStep = 0;
      expect(gizmoManager.applySnapPosition(1.23456)).toBe(1.23456);
    });

    it("quantizes rotation accurately based on snapAngleStep", () => {
      gizmoManager.snapAngleStep = Math.PI / 4; // 45 degrees
      expect(gizmoManager.applySnapRotation(0.35)).toBeCloseTo(0.0, 3);
      expect(gizmoManager.applySnapRotation(0.75)).toBeCloseTo(Math.PI / 4, 3);
    });

    it("aligns object flush to floor at y = 0 ('End' hotkey)", () => {
      const obj: RoomObject = {
        id: "lamp-1",
        name: "Table Lamp",
        catalogId: "furniture_lamp_table",
        type: "furniture",
        transform: {
          position: [0, 2.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
      };

      // Given bounding box min y is 2.0, dropping to floor shifts position.y by -2.0 -> 0.5
      gizmoManager.alignObjectToFloor(obj, 2.0);
      expect(obj.transform.position[1]).toBe(0.5);

      // Idempotent: when bottom is already flush at y = 0, no shift occurs
      gizmoManager.alignObjectToFloor(obj, 0.0);
      expect(obj.transform.position[1]).toBe(0.5);
    });

    it("duplicates object with unique ID, '(Copy)' title, and +0.5m offset ('Ctrl+D')", () => {
      const cloned = gizmoManager.duplicateObject(mockObject);

      expect(cloned.id).not.toBe(mockObject.id);
      expect(cloned.name).toBe("Ergonomic Chair (Copy)");
      expect(cloned.transform.position[0]).toBeCloseTo(mockObject.transform.position[0] + 0.5, 3);
      expect(cloned.transform.position[1]).toBe(mockObject.transform.position[1]);
      expect(cloned.transform.position[2]).toBeCloseTo(mockObject.transform.position[2] + 0.5, 3);
    });

    it("maintains a strict 50-step FIFO undo stack", () => {
      const baseObjects: RoomObject[] = [mockObject];

      // Push 65 state snapshots
      for (let i = 1; i <= 65; i++) {
        const modified: RoomObject[] = [
          {
            ...mockObject,
            transform: {
              ...mockObject.transform,
              position: [i, 0, 0],
            },
          },
        ];
        gizmoManager.pushState(modified);
      }

      // Max stack size is 50
      expect(gizmoManager.undoStack.length).toBe(50);

      // Oldest 15 states were shifted off
      // First state in stack corresponds to iteration 16
      expect(gizmoManager.undoStack[0][0].transform.position[0]).toBe(16);
      // Last state in stack corresponds to iteration 65
      expect(gizmoManager.undoStack[49][0].transform.position[0]).toBe(65);
    });

    it("handles undo and redo with accurate state transitions", () => {
      const state1: RoomObject[] = [{ ...mockObject, name: "Chair v1" }];
      const state2: RoomObject[] = [{ ...mockObject, name: "Chair v2" }];

      gizmoManager.pushState(state1);
      expect(gizmoManager.undoStack.length).toBe(1);
      expect(gizmoManager.redoStack.length).toBe(0);

      // Undo state2 back to state1
      const restored1 = gizmoManager.undo(state2);
      expect(restored1).not.toBeNull();
      expect(restored1![0].name).toBe("Chair v1");
      expect(gizmoManager.undoStack.length).toBe(0);
      expect(gizmoManager.redoStack.length).toBe(1);

      // Redo back to state2
      const restored2 = gizmoManager.redo(restored1!);
      expect(restored2).not.toBeNull();
      expect(restored2![0].name).toBe("Chair v2");
      expect(gizmoManager.undoStack.length).toBe(1);
      expect(gizmoManager.redoStack.length).toBe(0);

      // Subsequent undo on empty returns null
      gizmoManager.undo(restored2!);
      const emptyUndo = gizmoManager.undo(restored1!);
      expect(emptyUndo).toBeNull();
    });

    it("clears redoStack upon pushing new state", () => {
      const state1: RoomObject[] = [{ ...mockObject, name: "V1" }];
      const state2: RoomObject[] = [{ ...mockObject, name: "V2" }];
      const state3: RoomObject[] = [{ ...mockObject, name: "V3" }];

      gizmoManager.pushState(state1);
      gizmoManager.undo(state2);
      expect(gizmoManager.redoStack.length).toBe(1);

      // New action clears redo
      gizmoManager.pushState(state3);
      expect(gizmoManager.redoStack.length).toBe(0);
    });
  });

  // ==========================================================================
  // 3. ThreeEngine Unit Tests
  // ==========================================================================
  describe("ThreeEngine", () => {
    let engine: ThreeEngine;

    beforeEach(() => {
      engine = new ThreeEngine({
        canvas,
        container,
        initialRoom: BLANK_CANVAS_TEMPLATE,
        graphicsPreset: "medium",
      });
    });

    afterEach(() => {
      engine.dispose();
    });

    it("initializes Three.js scene, camera, and controllers", () => {
      expect(engine.scene).toBeDefined();
      expect(engine.camera).toBeDefined();
      expect(engine.cameraController).toBeDefined();
      expect(engine.gizmoManager).toBeDefined();
      expect(engine.environmentManager).toBeDefined();
      expect(engine.objectsGroup).toBeDefined();
      expect(engine.helpersGroup).toBeDefined();
    });

    it("loads room document and populates room objects", () => {
      engine.loadRoom(COZY_BEDROOM_TEMPLATE);
      expect(COZY_BEDROOM_TEMPLATE.objects.length).toBeGreaterThan(0);
      expect(engine.objectsGroup.children.length).toBe(COZY_BEDROOM_TEMPLATE.objects.length);
    });

    it("adds, updates transform, and removes room objects dynamically", () => {
      const newObj: RoomObject = {
        id: "dyn-obj-1",
        name: "Test Desk",
        catalogId: "furniture_desk_executive",
        type: "furniture",
        transform: {
          position: [1, 0, 1],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
      };

      const mesh = engine.addObject(newObj);
      expect(mesh).toBeDefined();
      expect(mesh.userData.isRoomObject).toBe(true);
      expect(mesh.userData.catalogId).toBe("furniture_desk_executive");

      // Update transform
      engine.updateObjectTransform("dyn-obj-1", {
        position: [3, 0, 3],
        rotation: [0, Math.PI / 2, 0],
        scale: [1.5, 1.5, 1.5],
      });
      expect(mesh.position.x).toBeCloseTo(3, 2);
      expect(mesh.position.z).toBeCloseTo(3, 2);

      // Select object
      engine.selectObject("dyn-obj-1");
      expect(engine.getSelectedObject()).toBe(mesh);

      // Remove object
      const removed = engine.removeObject("dyn-obj-1");
      expect(removed).toBe(true);
      expect(engine.getSelectedObject()).toBeNull();
    });

    it("switches graphics presets cleanly", () => {
      engine.setGraphicsPreset("low");
      expect(engine.currentPresetConfig.preset).toBe("low");
      expect(engine.currentPresetConfig.maxFps).toBe(30);

      engine.setGraphicsPreset("high");
      expect(engine.currentPresetConfig.preset).toBe("high");
      expect(engine.currentPresetConfig.maxFps).toBe(60);
    });

    it("disposes cleanly without throwing errors", () => {
      expect(() => engine.dispose()).not.toThrow();
    });
  });
});
