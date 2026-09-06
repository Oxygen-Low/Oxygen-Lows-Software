// @vitest-environment jsdom
/**
 * Studio3DStress.test.ts
 * Empirical Stress Test Suite for 3D Studio Editor Engine, Controls, and Gizmo Manager.
 * 
 * Test Scenarios:
 * 1. GizmoManager: 100 consecutive undo/redo operations, verify FIFO truncation to exactly 50 states.
 * 2. CameraController: Rapid bookmark transitions & Hermite S-curve zero boundary velocities at t=0 and t=1.
 * 3. Floor alignment ('End'): Idempotent behavior on repeated invocation (floating, sunken, flush, rotated).
 * 4. Hotkey guard: Strict suppression on input, textarea, select, and contentEditable elements.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { CameraController, BookmarkTransition } from "./engine/CameraController";
import { GizmoManager } from "./engine/GizmoManager";
import { ThreeEngine } from "./engine/ThreeEngine";
import { RoomObject, CameraBookmark } from "@/types/threeDBackground";
import { BLANK_CANVAS_TEMPLATE } from "@/services/3d/storage/RoomTemplates";

describe("Milestone 4 Empirical Stress Tests: Engine, Controls & Gizmo Manager", () => {
  let container: HTMLElement;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1024, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 768, configurable: true });

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
  // SCENARIO 1: GizmoManager 100 Consecutive Undo/Redo & FIFO Truncation
  // ==========================================================================
  describe("Scenario 1: GizmoManager 100 Consecutive Undo/Redo & Strict FIFO Truncation", () => {
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let objectsGroup: THREE.Group;
    let gizmoManager: GizmoManager;

    const baseObject: RoomObject = {
      id: "stress-obj-1",
      name: "Desk",
      catalogId: "furniture_desk_executive",
      type: "furniture",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
      locked: false,
    };

    beforeEach(() => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(50, 1024 / 768, 0.1, 1000);
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [baseObject],
      });
    });

    afterEach(() => {
      gizmoManager.dispose();
    });

    it("truncates 100 consecutive pushed states strictly to MAX_UNDO_STEPS = 50 with FIFO discarding", () => {
      // Push 100 distinct state snapshots (iterations 1 to 100)
      for (let i = 1; i <= 100; i++) {
        const state: RoomObject[] = [
          {
            ...baseObject,
            name: `Desk State ${i}`,
            transform: {
              ...baseObject.transform,
              position: [i * 0.5, 0, i * 0.25],
            },
          },
        ];
        gizmoManager.pushState(state);

        // Stack length must never exceed 50 at any step
        expect(gizmoManager.undoStack.length).toBeLessThanOrEqual(50);
        if (i <= 50) {
          expect(gizmoManager.undoStack.length).toBe(i);
        } else {
          expect(gizmoManager.undoStack.length).toBe(50);
        }
      }

      // Final length after 100 pushes must be exactly 50
      expect(gizmoManager.undoStack.length).toBe(50);
      expect(gizmoManager.redoStack.length).toBe(0);

      // FIFO verification: The oldest 50 states (1 to 50) must have been discarded
      // The oldest remaining state in undoStack[0] must be state 51
      expect(gizmoManager.undoStack[0][0].name).toBe("Desk State 51");
      expect(gizmoManager.undoStack[0][0].transform.position[0]).toBeCloseTo(51 * 0.5, 4);

      // The newest state in undoStack[49] must be state 100
      expect(gizmoManager.undoStack[49][0].name).toBe("Desk State 100");
      expect(gizmoManager.undoStack[49][0].transform.position[0]).toBeCloseTo(100 * 0.5, 4);
    });

    it("executes 50 consecutive undos down to empty, verifies bounded null guard on 51st undo", () => {
      // Populate with 100 states
      for (let i = 1; i <= 100; i++) {
        gizmoManager.pushState([
          {
            ...baseObject,
            name: `Desk State ${i}`,
            transform: {
              ...baseObject.transform,
              position: [i, 0, 0],
            },
          },
        ]);
      }

      let currentState: RoomObject[] = [
        {
          ...baseObject,
          name: "Desk State 101 (Current)",
          transform: { ...baseObject.transform, position: [101, 0, 0] },
        },
      ];

      // Perform exactly 50 consecutive undos
      for (let undoStep = 1; undoStep <= 50; undoStep++) {
        const expectedRestoredIteration = 101 - undoStep; // 100 down to 51
        const restored = gizmoManager.undo(currentState);

        expect(restored).not.toBeNull();
        expect(restored![0].name).toBe(`Desk State ${expectedRestoredIteration}`);
        expect(restored![0].transform.position[0]).toBe(expectedRestoredIteration);

        currentState = restored!;

        // Stack sizes check
        expect(gizmoManager.undoStack.length).toBe(50 - undoStep);
        expect(gizmoManager.redoStack.length).toBe(undoStep);
      }

      // Undo stack is now exhausted
      expect(gizmoManager.undoStack.length).toBe(0);
      expect(gizmoManager.redoStack.length).toBe(50);

      // 51st undo must return null without throwing or mutating
      const overflowUndo = gizmoManager.undo(currentState);
      expect(overflowUndo).toBeNull();
      expect(gizmoManager.undoStack.length).toBe(0);
      expect(gizmoManager.redoStack.length).toBe(50);
    });

    it("executes 50 consecutive redos back up to newest state, verifies bounded null guard on 51st redo", () => {
      // Push 60 states
      for (let i = 1; i <= 60; i++) {
        gizmoManager.pushState([
          {
            ...baseObject,
            name: `Desk State ${i}`,
            transform: { ...baseObject.transform, position: [i, 0, 0] },
          },
        ]);
      }

      let currentState: RoomObject[] = [
        { ...baseObject, name: "Desk State 61", transform: { ...baseObject.transform, position: [61, 0, 0] } },
      ];

      // Undo all 50 available steps
      for (let i = 0; i < 50; i++) {
        const restored = gizmoManager.undo(currentState);
        currentState = restored!;
      }
      expect(gizmoManager.undoStack.length).toBe(0);
      expect(gizmoManager.redoStack.length).toBe(50);

      // Now perform 50 consecutive redos
      for (let redoStep = 1; redoStep <= 50; redoStep++) {
        const expectedIteration = 11 + redoStep; // Redoes states 12 up to 61
        const restored = gizmoManager.redo(currentState);

        expect(restored).not.toBeNull();
        expect(restored![0].name).toBe(`Desk State ${expectedIteration}`);
        expect(restored![0].transform.position[0]).toBe(expectedIteration);

        currentState = restored!;
        expect(gizmoManager.undoStack.length).toBe(redoStep);
        expect(gizmoManager.redoStack.length).toBe(50 - redoStep);
      }

      // Redo stack is now exhausted
      expect(gizmoManager.redoStack.length).toBe(0);
      expect(gizmoManager.undoStack.length).toBe(50);

      // 51st redo must return null
      const overflowRedo = gizmoManager.redo(currentState);
      expect(overflowRedo).toBeNull();
      expect(gizmoManager.redoStack.length).toBe(0);
      expect(gizmoManager.undoStack.length).toBe(50);
    });

    it("preserves deep clone immutability across 100 mutations", () => {
      const liveObject: RoomObject = JSON.parse(JSON.stringify(baseObject));

      // Push initial state
      gizmoManager.pushState([liveObject]);

      // Mutate live object heavily
      liveObject.name = "Mutated In-Place";
      liveObject.transform.position[0] = 9999;
      liveObject.transform.scale[1] = 50;

      // Ensure state stored in undoStack was not mutated
      expect(gizmoManager.undoStack[0][0].name).toBe("Desk");
      expect(gizmoManager.undoStack[0][0].transform.position[0]).toBe(0);
      expect(gizmoManager.undoStack[0][0].transform.scale[1]).toBe(1);
    });

    it("clears redo stack upon pushing new state mid-history", () => {
      for (let i = 1; i <= 20; i++) {
        gizmoManager.pushState([{ ...baseObject, name: `S${i}` }]);
      }

      let cur: RoomObject[] = [{ ...baseObject, name: "S21" }];
      // Undo 5 steps
      for (let i = 0; i < 5; i++) {
        cur = gizmoManager.undo(cur)!;
      }
      expect(gizmoManager.redoStack.length).toBe(5);

      // Push new branching state
      gizmoManager.pushState([{ ...baseObject, name: "Branching State" }]);
      expect(gizmoManager.redoStack.length).toBe(0);
    });
  });

  // ==========================================================================
  // SCENARIO 2: CameraController Hermite Velocity & Rapid Bookmark Transitions
  // ==========================================================================
  describe("Scenario 2: CameraController Hermite S-Curve Velocity & Rapid Transitions", () => {
    let camera: THREE.PerspectiveCamera;
    let helpersGroup: THREE.Group;
    let controller: CameraController;

    const bStart: CameraBookmark = {
      id: "bm-start",
      name: "Start View",
      position: [0, 5, 10],
      target: [0, 1, 0],
      fov: 50,
      isPreset: false,
    };

    const bEnd: CameraBookmark = {
      id: "bm-end",
      name: "End View",
      position: [20, 15, -30],
      target: [5, 2, 5],
      fov: 75,
      isPreset: false,
    };

    beforeEach(() => {
      camera = new THREE.PerspectiveCamera(50, 1024 / 768, 0.1, 1000);
      camera.position.set(0, 5, 10);
      helpersGroup = new THREE.Group();
      controller = new CameraController({
        camera,
        domElement: canvas,
        helpersGroup,
      });
      controller.setBookmarks([bStart, bEnd]);
    });

    afterEach(() => {
      controller.dispose();
    });

    it("verifies Hermite S-curve s(t) = 3t^2 - 2t^3 has zero boundary velocities at t=0 and t=1", () => {
      // Analytical derivative: s'(t) = 6t(1 - t)
      // At t=0: s'(0) = 6(0)(1) = 0
      // At t=1: s'(1) = 6(1)(0) = 0

      // We empirically verify with numerical forward / backward difference quotients:
      // v(t) = (pos(t + dt) - pos(t)) / dt
      const dt = 1e-7;

      // 1. Boundary t = 0: Forward difference
      const state0 = CameraController.interpolateHermite(bStart, bEnd, 0.0);
      const stateDt = CameraController.interpolateHermite(bStart, bEnd, dt);

      const vx0 = (stateDt.position[0] - state0.position[0]) / dt;
      const vy0 = (stateDt.position[1] - state0.position[1]) / dt;
      const vz0 = (stateDt.position[2] - state0.position[2]) / dt;
      const v0Mag = Math.hypot(vx0, vy0, vz0);

      // Forward velocity at t=0 must be effectively zero (< 1e-4)
      expect(v0Mag).toBeLessThan(1e-4);

      // Target velocity at t=0 must also be effectively zero
      const vtx0 = (stateDt.target[0] - state0.target[0]) / dt;
      const vty0 = (stateDt.target[1] - state0.target[1]) / dt;
      const vtz0 = (stateDt.target[2] - state0.target[2]) / dt;
      expect(Math.hypot(vtx0, vty0, vtz0)).toBeLessThan(1e-4);

      // 2. Boundary t = 1: Backward difference
      const state1 = CameraController.interpolateHermite(bStart, bEnd, 1.0);
      const state1MinusDt = CameraController.interpolateHermite(bStart, bEnd, 1.0 - dt);

      const vx1 = (state1.position[0] - state1MinusDt.position[0]) / dt;
      const vy1 = (state1.position[1] - state1MinusDt.position[1]) / dt;
      const vz1 = (state1.position[2] - state1MinusDt.position[2]) / dt;
      const v1Mag = Math.hypot(vx1, vy1, vz1);

      // Velocity at t=1 must be effectively zero (< 1e-4)
      expect(v1Mag).toBeLessThan(1e-4);

      // 3. Peak velocity at midpoint t = 0.5: s'(0.5) = 6(0.5)(0.5) = 1.5
      const stateMid = CameraController.interpolateHermite(bStart, bEnd, 0.5);
      const stateMidDt = CameraController.interpolateHermite(bStart, bEnd, 0.5 + dt);
      const vxMid = (stateMidDt.position[0] - stateMid.position[0]) / dt;
      const vyMid = (stateMidDt.position[1] - stateMid.position[1]) / dt;
      const vzMid = (stateMidDt.position[2] - stateMid.position[2]) / dt;
      const vMidMag = Math.hypot(vxMid, vyMid, vzMid);

      const displacementMag = Math.hypot(
        bEnd.position[0] - bStart.position[0],
        bEnd.position[1] - bStart.position[1],
        bEnd.position[2] - bStart.position[2]
      );
      const expectedPeakVelocity = displacementMag * 1.5;
      expect(vMidMag).toBeCloseTo(expectedPeakVelocity, 1);
    });

    it("guarantees monotonic interpolation without overshooting boundaries", () => {
      // Sample 100 equidistant steps along [0, 1]
      let prevS = -1;
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const res = CameraController.interpolateHermite(bStart, bEnd, t);

        // s(t) is recovered from normalized position component
        const s = (res.position[0] - bStart.position[0]) / (bEnd.position[0] - bStart.position[0]);
        expect(s).toBeGreaterThanOrEqual(0.0);
        expect(s).toBeLessThanOrEqual(1.0);
        expect(s).toBeGreaterThanOrEqual(prevS - 1e-9); // Monotonically increasing
        prevS = s;
      }
    });

    it("survives rapid bookmark transition interruptions without NaN or desynchronization", () => {
      const b3: CameraBookmark = {
        id: "bm-3",
        name: "Third View",
        position: [-15, 8, 12],
        target: [0, 0, 0],
        fov: 60,
        isPreset: false,
      };
      controller.setBookmarks([bStart, bEnd, b3]);

      // Fire 50 transitions rapidly, advancing time with erratic deltas
      for (let i = 0; i < 50; i++) {
        const targetIndex = i % 3;
        controller.transitionToBookmark(targetIndex, 0.5);

        // Advance random time steps (interrupted before completing 0.5s)
        const erraticDelta = (i % 5) * 0.05 + 0.01;
        controller.update(erraticDelta);

        // Values must remain finite at every step
        expect(isFinite(camera.position.x)).toBe(true);
        expect(isFinite(camera.position.y)).toBe(true);
        expect(isFinite(camera.position.z)).toBe(true);
        expect(isFinite(controller.orbitControls.target.x)).toBe(true);
        expect(isFinite(controller.orbitControls.target.y)).toBe(true);
        expect(isFinite(controller.orbitControls.target.z)).toBe(true);
        expect(camera.fov).toBeGreaterThanOrEqual(10);
        expect(camera.fov).toBeLessThanOrEqual(140);
      }

      // Now let the final transition complete cleanly
      controller.transitionToBookmark(1, 0.3); // Target bEnd
      controller.update(0.4); // Exceed duration to complete

      expect(camera.position.x).toBeCloseTo(bEnd.position[0], 2);
      expect(camera.position.y).toBeCloseTo(bEnd.position[1], 2);
      expect(camera.position.z).toBeCloseTo(bEnd.position[2], 2);
      expect(controller.orbitControls.target.x).toBeCloseTo(bEnd.target[0], 2);
      expect(camera.fov).toBeCloseTo(bEnd.fov, 2);
    });

    it("clamps extreme FOV inputs strictly within 10 to 140 degrees", () => {
      const bExtremeLow: CameraBookmark = {
        id: "bm-low",
        name: "Low",
        position: [0, 0, 0],
        target: [0, 0, 0],
        fov: -50, // Highly negative
        isPreset: false,
      };
      const bExtremeHigh: CameraBookmark = {
        id: "bm-high",
        name: "High",
        position: [0, 0, 0],
        target: [0, 0, 0],
        fov: 360, // Way too high
        isPreset: false,
      };

      const atZero = CameraController.interpolateHermite(bExtremeLow, bExtremeHigh, 0.0);
      expect(atZero.fov).toBe(10);

      const atOne = CameraController.interpolateHermite(bExtremeLow, bExtremeHigh, 1.0);
      expect(atOne.fov).toBe(140);

      const clampedTBelowZero = CameraController.interpolateHermite(bStart, bEnd, -2.5);
      expect(clampedTBelowZero.position).toEqual(bStart.position);

      const clampedTAboveOne = CameraController.interpolateHermite(bStart, bEnd, 5.0);
      expect(clampedTAboveOne.position).toEqual(bEnd.position);
    });
  });

  // ==========================================================================
  // SCENARIO 3: Floor Alignment ('End') Idempotence on Repeated Invocation
  // ==========================================================================
  describe("Scenario 3: Floor Alignment ('End') Idempotent Invariant", () => {
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let objectsGroup: THREE.Group;
    let gizmoManager: GizmoManager;

    beforeEach(() => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      objectsGroup = new THREE.Group();
      scene.add(objectsGroup);
    });

    afterEach(() => {
      if (gizmoManager) gizmoManager.dispose();
    });

    it("verifies mathematical idempotency f(f(x)) = f(x) for floating objects", () => {
      const testObj: RoomObject = {
        id: "float-chair",
        name: "Floating Chair",
        catalogId: "furniture_ergonomic_chair",
        type: "furniture",
        transform: {
          position: [3.5, 12.0, -4.0], // Floating 12m high
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
      };

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [testObj],
      });

      // Suppose geometry has bottom bounding box min.y at 10.5
      // 1st invocation: drops flush to floor
      gizmoManager.alignObjectToFloor(testObj, 10.5);
      const flushY = testObj.transform.position[1];
      expect(flushY).toBeCloseTo(1.5, 4);

      // Invocations 2 through 20: min.y is now 0.0 (flush)
      for (let i = 2; i <= 20; i++) {
        gizmoManager.alignObjectToFloor(testObj, 0.0);
        expect(testObj.transform.position[1]).toBe(flushY); // Strictly invariant
      }
    });

    it("verifies mathematical idempotency for sunken objects below floor level", () => {
      const testObj: RoomObject = {
        id: "sunken-table",
        name: "Sunken Table",
        catalogId: "furniture_desk_executive",
        type: "furniture",
        transform: {
          position: [0, -4.0, 0], // Sunken 4m below floor
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
      };

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [testObj],
      });

      // Suppose bottom bounding box min.y is at -5.2
      // 1st invocation: raises to floor flush
      gizmoManager.alignObjectToFloor(testObj, -5.2);
      const flushY = testObj.transform.position[1];
      expect(flushY).toBeCloseTo(1.2, 4);

      // Invocations 2 through 15: subsequent calls with min.y = 0.0 produce zero drift
      for (let i = 2; i <= 15; i++) {
        gizmoManager.alignObjectToFloor(testObj, 0.0);
        expect(testObj.transform.position[1]).toBe(flushY);
      }
    });

    it("verifies idempotency with rotated objects via live Box3 bounding box execution", () => {
      const deskObj: RoomObject = {
        id: "desk-3d",
        name: "Rotated Desk",
        catalogId: "furniture_desk_executive",
        type: "furniture",
        transform: {
          position: [1.0, 5.0, 2.0],
          rotation: [Math.PI / 4, 0, Math.PI / 6], // Rotated along multiple axes
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
      };

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [deskObj],
      });

      // Create physical mesh and register
      const boxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.75, 0.8),
        new THREE.MeshStandardMaterial()
      );
      boxMesh.position.set(1.0, 5.0, 2.0);
      boxMesh.rotation.set(Math.PI / 4, 0, Math.PI / 6);
      gizmoManager.registerObject(deskObj, boxMesh);
      objectsGroup.add(boxMesh);

      gizmoManager.selectObject(deskObj.id);

      // 1st executeFloorAlign
      const firstSuccess = gizmoManager.executeFloorAlign();
      expect(firstSuccess).toBe(true);

      boxMesh.updateMatrixWorld(true);
      const box1 = new THREE.Box3().setFromObject(boxMesh);
      expect(box1.min.y).toBeCloseTo(0.0, 3);
      const alignedY = deskObj.transform.position[1];

      // 2nd executeFloorAlign
      const secondSuccess = gizmoManager.executeFloorAlign();
      expect(secondSuccess).toBe(true);
      boxMesh.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(boxMesh);
      expect(box2.min.y).toBeCloseTo(0.0, 3);
      expect(deskObj.transform.position[1]).toBeCloseTo(alignedY, 4);

      // 3rd executeFloorAlign
      const thirdSuccess = gizmoManager.executeFloorAlign();
      expect(thirdSuccess).toBe(true);
      boxMesh.updateMatrixWorld(true);
      const box3 = new THREE.Box3().setFromObject(boxMesh);
      expect(box3.min.y).toBeCloseTo(0.0, 3);
      expect(deskObj.transform.position[1]).toBeCloseTo(alignedY, 4);
    });

    it("rejects floor alignment gracefully on locked objects", () => {
      const lockedObj: RoomObject = {
        id: "locked-lamp",
        name: "Locked Lamp",
        catalogId: "furniture_lamp_table",
        type: "furniture",
        transform: {
          position: [0, 10, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: true, // Locked!
      };

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        objectsGroup,
        initialObjects: [lockedObj],
      });

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.position.set(0, 10, 0);
      gizmoManager.registerObject(lockedObj, mesh);
      objectsGroup.add(mesh);

      gizmoManager.selectObject(lockedObj.id);

      const result = gizmoManager.executeFloorAlign();
      expect(result).toBe(false);
      expect(lockedObj.transform.position[1]).toBe(10); // Completely unchanged
    });
  });

  // ==========================================================================
  // SCENARIO 4: Hotkey Guard Across Input / Textarea / Select / ContentEditable
  // ==========================================================================
  describe("Scenario 4: Hotkey Guard Against Form & Editable Elements", () => {
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let helpersGroup: THREE.Group;
    let objectsGroup: THREE.Group;
    let gizmoManager: GizmoManager;
    let cameraController: CameraController;

    const mockObject: RoomObject = {
      id: "guard-test-obj",
      name: "Target Chair",
      catalogId: "furniture_ergonomic_chair",
      type: "furniture",
      transform: {
        position: [2, 1, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
      locked: false,
    };

    beforeEach(() => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(50, 1024 / 768, 0.1, 1000);
      helpersGroup = new THREE.Group();
      objectsGroup = new THREE.Group();
      scene.add(helpersGroup);
      scene.add(objectsGroup);

      cameraController = new CameraController({
        camera,
        domElement: canvas,
        helpersGroup,
      });

      gizmoManager = new GizmoManager({
        scene,
        camera,
        domElement: canvas,
        orbitControls: cameraController.orbitControls,
        objectsGroup,
        initialObjects: [mockObject],
      });

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.position.set(2, 1, 2);
      gizmoManager.registerObject(mockObject, mesh);
      objectsGroup.add(mesh);
      gizmoManager.selectObject(mockObject.id);
    });

    afterEach(() => {
      gizmoManager.dispose();
      cameraController.dispose();
    });

    const formTargets: Array<{ name: string; create: () => HTMLElement }> = [
      {
        name: "HTMLInputElement (text)",
        create: () => {
          const el = document.createElement("input");
          el.type = "text";
          return el;
        },
      },
      {
        name: "HTMLInputElement (number)",
        create: () => {
          const el = document.createElement("input");
          el.type = "number";
          return el;
        },
      },
      {
        name: "HTMLTextAreaElement",
        create: () => document.createElement("textarea"),
      },
      {
        name: "HTMLSelectElement",
        create: () => document.createElement("select"),
      },
      {
        name: "ContentEditable Element",
        create: () => {
          const el = document.createElement("div");
          el.contentEditable = "true";
          return el;
        },
      },
      {
        name: "Child element inside ContentEditable container",
        create: () => {
          const parent = document.createElement("div");
          parent.contentEditable = "true";
          const child = document.createElement("span");
          parent.appendChild(child);
          document.body.appendChild(parent);
          return child;
        },
      },
    ];

    formTargets.forEach(({ name, create }) => {
      describe(`Guarding against ${name}`, () => {
        let formEl: HTMLElement;

        beforeEach(() => {
          formEl = create();
          if (!document.body.contains(formEl)) {
            document.body.appendChild(formEl);
          }
        });

        afterEach(() => {
          const root = formEl.parentElement && formEl.parentElement !== document.body ? formEl.parentElement : formEl;
          if (root.parentNode) {
            root.parentNode.removeChild(root);
          }
        });

        it(`strictly suppresses GizmoManager hotkeys (Undo, Redo, Duplicate, Delete, FloorAlign, Mode)`, () => {
          gizmoManager.setMode("translate");
          const initialMode = gizmoManager.activeMode;
          const initialObjCount = gizmoManager.getObjects().length;
          const initialPos = [...mockObject.transform.position];

          // 1. Suppress Delete key
          const deleteEvent = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
          Object.defineProperty(deleteEvent, "target", { value: formEl });
          window.dispatchEvent(deleteEvent);

          expect(gizmoManager.selectedObjectId).toBe(mockObject.id); // Not deleted
          expect(gizmoManager.getObjects().length).toBe(initialObjCount);

          // 2. Suppress Backspace key
          const backspaceEvent = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
          Object.defineProperty(backspaceEvent, "target", { value: formEl });
          window.dispatchEvent(backspaceEvent);

          expect(gizmoManager.selectedObjectId).toBe(mockObject.id);
          expect(gizmoManager.getObjects().length).toBe(initialObjCount);

          // 3. Suppress Ctrl+D (Duplicate)
          const dupEvent = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true });
          Object.defineProperty(dupEvent, "target", { value: formEl });
          window.dispatchEvent(dupEvent);

          expect(gizmoManager.getObjects().length).toBe(initialObjCount); // No duplicate added

          // 4. Suppress End key (Floor align)
          const endEvent = new KeyboardEvent("keydown", { key: "End", bubbles: true });
          Object.defineProperty(endEvent, "target", { value: formEl });
          window.dispatchEvent(endEvent);

          expect(mockObject.transform.position[1]).toBe(initialPos[1]); // Not aligned

          // 5. Suppress Gizmo mode switching keys: W, E, R
          const keyEEvent = new KeyboardEvent("keydown", { key: "e", bubbles: true });
          Object.defineProperty(keyEEvent, "target", { value: formEl });
          window.dispatchEvent(keyEEvent);
          expect(gizmoManager.activeMode).toBe("translate"); // Still translate, did not switch to rotate

          const keyREvent = new KeyboardEvent("keydown", { key: "r", bubbles: true });
          Object.defineProperty(keyREvent, "target", { value: formEl });
          window.dispatchEvent(keyREvent);
          expect(gizmoManager.activeMode).toBe("translate"); // Did not switch to scale

          // 6. Suppress Ctrl+Z (Undo)
          gizmoManager.pushState([mockObject]);
          const undoStackLen = gizmoManager.undoStack.length;

          const undoEvent = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true });
          Object.defineProperty(undoEvent, "target", { value: formEl });
          window.dispatchEvent(undoEvent);

          expect(gizmoManager.undoStack.length).toBe(undoStackLen); // Undo was ignored
        });

        it(`strictly suppresses CameraController hotkeys (Focus 'F', Fly Keys)`, () => {
          const initialTarget = controllerCloneTarget(cameraController);

          // 1. Suppress Focus key 'F'
          const fEvent = new KeyboardEvent("keydown", { key: "f", bubbles: true });
          Object.defineProperty(fEvent, "target", { value: formEl });
          window.dispatchEvent(fEvent);

          // OrbitControls target must remain identical
          expect(cameraController.orbitControls.target.x).toBe(initialTarget.x);
          expect(cameraController.orbitControls.target.y).toBe(initialTarget.y);
          expect(cameraController.orbitControls.target.z).toBe(initialTarget.z);

          // 2. Suppress Fly camera movement keys (KeyW, KeyA, KeyS, KeyD, KeyE, KeyQ, Space)
          const keys = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "Space"];
          keys.forEach((code) => {
            const keyEvent = new KeyboardEvent("keydown", { code, bubbles: true });
            Object.defineProperty(keyEvent, "target", { value: formEl });
            window.dispatchEvent(keyEvent);
          });

          // keysPressed in camera controller must be completely empty
          const keysPressed = (cameraController as any).keysPressed as Set<string>;
          expect(keysPressed.size).toBe(0);
        });
      });
    });

    it("verifies hotkeys DO fire normally when active element is canvas or regular UI container", () => {
      const normalDiv = document.createElement("div");
      document.body.appendChild(normalDiv);

      gizmoManager.setMode("translate");

      // Mode switch key 'e' targeting normal div -> switches to rotate
      const keyEEvent = new KeyboardEvent("keydown", { key: "e", bubbles: true });
      Object.defineProperty(keyEEvent, "target", { value: normalDiv });
      window.dispatchEvent(keyEEvent);

      expect(gizmoManager.activeMode).toBe("rotate");

      // Mode switch key 'r' targeting normal div -> switches to scale
      const keyREvent = new KeyboardEvent("keydown", { key: "r", bubbles: true });
      Object.defineProperty(keyREvent, "target", { value: normalDiv });
      window.dispatchEvent(keyREvent);

      expect(gizmoManager.activeMode).toBe("scale");

      if (normalDiv.parentNode) {
        normalDiv.parentNode.removeChild(normalDiv);
      }
    });
  });
});

function controllerCloneTarget(controller: CameraController): THREE.Vector3 {
  return controller.orbitControls.target.clone();
}
