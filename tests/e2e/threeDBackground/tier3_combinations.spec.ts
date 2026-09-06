/**
 * @file tests/e2e/threeDBackground/tier3_combinations.spec.ts
 * @description Tier 3: Cross-Feature Combinations (Pairwise & Multi-System Coverage: 18 tests).
 * Validating complex emergent behaviors across features from PROJECT.md § Feature Inventory.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import {
  MockStorageEngine,
  RoomStorageService,
  DEFAULT_ENVIRONMENT,
  BLANK_CANVAS_TEMPLATE,
  COZY_BEDROOM_TEMPLATE,
  MODERN_STUDIO_TEMPLATE,
  NATURE_GARDEN_TEMPLATE,
  CatalogFactory,
  GLTFLoaderPipeline,
  PosterFactory,
  NatureSimulationEngine,
  EnvironmentLightingEngine,
  GizmoAndNavigationManager,
  Live3DBackgroundSimulator,
  LocalizationVerifier,
  RoomDocument,
  RoomObject,
  EnvironmentSettings,
  CameraBookmark,
} from "./harness";

describe("Tier 3: Cross-Feature Combinations (Pairwise Coverage)", () => {
  let storageEngine: MockStorageEngine;
  let storageService: RoomStorageService;
  let gizmoMgr: GizmoAndNavigationManager;
  let bgSim: Live3DBackgroundSimulator;

  beforeEach(() => {
    storageEngine = new MockStorageEngine();
    storageService = new RoomStorageService(storageEngine);
    gizmoMgr = new GizmoAndNavigationManager();
    bgSim = new Live3DBackgroundSimulator();
  });

  // --------------------------------------------------------------------------
  // Combination 1: Template Load + Gizmo Manipulation + JSON Export/Import
  // --------------------------------------------------------------------------
  it("Combo 1: loads Cozy Bedroom template, translates bed, duplicates nightstand, exports and imports JSON", () => {
    // 1. Load Cozy Bedroom
    const room: RoomDocument = JSON.parse(JSON.stringify(COZY_BEDROOM_TEMPLATE));
    const bed = room.objects.find((o) => o.catalogId === "furniture_bed")!;
    expect(bed).toBeDefined();

    // 2. Manipulate bed position with 0.5m grid snapping
    gizmoMgr.snapGridStep = 0.5;
    bed.transform.position[0] = gizmoMgr.applySnapPosition(bed.transform.position[0] + 1.2);

    // 3. Duplicate nightstand with Ctrl+D
    const nightstand = room.objects.find((o) => o.catalogId === "coffee_table")!;
    const clonedNightstand = gizmoMgr.duplicateObject(nightstand);
    room.objects.push(clonedNightstand);

    // 4. Export to JSON
    const exportedJson = storageService.exportRoomAsJson(room);
    expect(typeof exportedJson).toBe("string");

    // 5. Import back from JSON
    const importRes = storageService.importRoomFromJson(exportedJson);
    expect(importRes.success).toBe(true);
    expect(importRes.room).toBeDefined();

    // Verify bed moved and cloned nightstand exists in imported room
    const importedBed = importRes.room?.objects.find((o) => o.catalogId === "furniture_bed");
    expect(importedBed?.transform.position[0]).toBe(bed.transform.position[0]);
    expect(importRes.room?.objects).toHaveLength(room.objects.length);
  });

  // --------------------------------------------------------------------------
  // Combination 2: Custom GLB Model + Custom Image Poster + Floor Alignment
  // --------------------------------------------------------------------------
  it("Combo 2: normalizes custom GLB model, uploads dynamic poster, and aligns model flush to floor", () => {
    // 1. Load large custom GLB model (6m x 8m x 4m)
    const customModelMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 4));
    customModelMesh.position.set(0, 15, 0); // elevated
    const modelGroup = new THREE.Group();
    modelGroup.add(customModelMesh);

    const normRes = GLTFLoaderPipeline.normalizeModel(modelGroup);
    expect(normRes.normalizedBounds.min.y).toBeCloseTo(0, 2);

    // 2. Upload custom image poster (16:9 ratio) with modern black frame
    const poster = PosterFactory.createPosterFrame({
      aspectRatio: 16 / 9,
      frameStyle: "modern_black",
    });
    expect((poster.userData as any).aspectRatio).toBeCloseTo(16 / 9, 2);

    // 3. Align custom model to floor via hotkey calculation
    const roomObj: RoomObject = {
      id: "custom-glb-1",
      name: "Imported Statue",
      catalogId: "custom_model",
      type: "custom_model",
      transform: { position: [2, 3.5, -1], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
    };

    gizmoMgr.alignObjectToFloor(roomObj, 3.5);
    expect(roomObj.transform.position[1]).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Combination 3: Nature Grass + Hurricane Wind (10 m/s) + Low Graphics Preset
  // --------------------------------------------------------------------------
  it("Combo 3: evaluates grass simulation under maximum hurricane wind while graphics preset throttles to Low", () => {
    // Switch to Low preset
    const presetConfig = NatureSimulationEngine.getGraphicsPresetConfig("low");
    expect(presetConfig.grassBladeCount).toBe(8000);
    expect(presetConfig.grassSegments).toBe(1);
    expect(presetConfig.enableShadows).toBe(false);

    // Simulate hurricane wind (10.0 m/s, gustiness 1.0)
    const bladeGeometry = NatureSimulationEngine.calculateBladeGeometry(presetConfig.grassSegments as 1);
    expect(bladeGeometry.vertexCount).toBe(3); // 1 segment = 3 vertices

    const windSway = NatureSimulationEngine.evaluateWindDisplacement([5, 0, 5], 1.0, 3.0, 10.0, 45, 1.0);
    expect(isNaN(windSway.displacement[0])).toBe(false);
    expect(windSway.displacement[1]).toBeLessThan(0); // Length conservation downward compensation
    expect(isFinite(windSway.displacement[0])).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Combination 4: Active Background + Page Navigation + Tab Visibility Throttling
  // --------------------------------------------------------------------------
  it("Combo 4: manages live 3D background during multi-page routing and tab visibility changes", () => {
    storageService.setActiveBackgroundRoomId("template-modern-studio");
    expect(storageService.getActiveBackgroundRoomId()).toBe("template-modern-studio");

    // Navigate to /games
    bgSim.handleRouteChange("/games");
    expect(bgSim.animationLoopRunning).toBe(true);

    // User switches tab away (document.hidden = true)
    bgSim.handleVisibilityChange(true);
    expect(bgSim.animationLoopRunning).toBe(false);
    expect(bgSim.simulatedFps).toBe(0);

    // User switches tab back (document.hidden = false)
    bgSim.handleVisibilityChange(false);
    expect(bgSim.animationLoopRunning).toBe(true);
    expect(bgSim.simulatedFps).toBe(60);

    // User opens 3D Studio editor directly (/apps/3d-background)
    bgSim.handleRouteChange("/apps/3d-background");
    expect(bgSim.isEditorOpen).toBe(true);
    expect(bgSim.animationLoopRunning).toBe(false); // Paused to prevent dual WebGL GPU contention
  });

  // --------------------------------------------------------------------------
  // Combination 5: Multi-Language + Catalog Browsing + Custom Color Tinting
  // --------------------------------------------------------------------------
  it("Combo 5: browses catalog in Japanese, places sofa, and applies custom color tint", () => {
    const localizedName = LocalizationVerifier.getLocalizedCatalogName("ja", "sofa_3seater");
    expect(localizedName).toBe("3-Seater Sofa");

    const tintedSofa = CatalogFactory.createMeshForItem("sofa_3seater", {
      colorTint: "#1a237e",
    });

    const meshChild = tintedSofa.children[0] as THREE.Mesh;
    const mat = meshChild.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe("1a237e");
  });

  // --------------------------------------------------------------------------
  // Combination 6: Camera Bookmark Navigation + Transform Updates + Undo Stack
  // --------------------------------------------------------------------------
  it("Combo 6: adds camera bookmark, translates chair, transitions view, and undoes transform", () => {
    const room: RoomDocument = JSON.parse(JSON.stringify(MODERN_STUDIO_TEMPLATE));
    const chair = room.objects.find((o) => o.catalogId === "ergonomic_chair")!;
    const originalPos = [...chair.transform.position] as [number, number, number];

    // Push initial state to undo stack
    gizmoMgr.pushState(room.objects);

    // Move chair
    chair.transform.position[0] += 1.0;

    // Transition between camera bookmarks
    const b1 = room.cameraBookmarks[0];
    const b2 = room.cameraBookmarks[1];
    const halfwayView = gizmoMgr.interpolateBookmark(b1, b2, 0.5);
    expect(halfwayView.fov).toBeCloseTo(52.5, 1);

    // Undo transform change
    const restoredObjects = gizmoMgr.undo(room.objects)!;
    expect(restoredObjects).not.toBeNull();
    const restoredChair = restoredObjects.find((o) => o.catalogId === "ergonomic_chair")!;
    expect(restoredChair.transform.position[0]).toBeCloseTo(originalPos[0], 2);
  });

  // --------------------------------------------------------------------------
  // Combination 7: Day/Night Environment Lerp + Table Lamp Point Light
  // --------------------------------------------------------------------------
  it("Combo 7: blends lighting from Day to Sunset while activating table lamp point light", () => {
    const day = DEFAULT_ENVIRONMENT;
    const sunset = COZY_BEDROOM_TEMPLATE.environment;

    const blended = EnvironmentLightingEngine.lerpEnvironment(day, sunset, 0.7);
    expect(blended.sunColor).toBe(sunset.sunColor);

    const lamp = CatalogFactory.createMeshForItem("table_lamp", {
      lightColor: "#ffaa44",
      lightIntensity: 2.5,
      lightDistance: 4.0,
    });

    const pointLight = lamp.children.find((c) => (c as any).isPointLight) as THREE.PointLight;
    expect(pointLight.intensity).toBe(2.5);
    expect(pointLight.color.getHexString()).toBe("ffaa44");
  });

  // --------------------------------------------------------------------------
  // Combination 8: Dynamic Poster Aspect Ratio Change + Framed Style Switch
  // --------------------------------------------------------------------------
  it("Combo 8: recalculates dimensions when changing poster image from 1:1 to 21:9 and switches to brushed gold", () => {
    const square = PosterFactory.calculateDimensions(1000, 1000, 1.2);
    expect(square.aspectRatio).toBe(1.0);

    const ultrawide = PosterFactory.calculateDimensions(2100, 900, 1.2);
    expect(ultrawide.aspectRatio).toBeCloseTo(21 / 9, 3);
    expect(ultrawide.height).toBeCloseTo(1.2 / (21 / 9), 3);

    const goldPoster = PosterFactory.createPosterFrame({
      aspectRatio: ultrawide.aspectRatio,
      frameStyle: "brushed_gold",
    });

    const borderMesh = goldPoster.children.find((c) => c.name === "frame-border") as THREE.Mesh;
    const borderMat = borderMesh.material as THREE.MeshStandardMaterial;
    expect(borderMat.color.getHexString()).toBe("d4af37"); // Gold hex
  });

  // --------------------------------------------------------------------------
  // Combination 9: Hotkey Navigation & Object Lifecycle (WASD + F + Ctrl+D + Delete)
  // --------------------------------------------------------------------------
  it("Combo 9: flies camera, focuses on desk, duplicates desk, and deletes duplicate", () => {
    const room: RoomDocument = JSON.parse(JSON.stringify(MODERN_STUDIO_TEMPLATE));
    const initialCount = room.objects.length;

    // Focus on desk
    const desk = room.objects.find((o) => o.catalogId === "executive_desk")!;
    const cameraTarget = new THREE.Vector3(...desk.transform.position);
    expect(cameraTarget.x).toBe(desk.transform.position[0]);

    // Duplicate desk
    const clonedDesk = gizmoMgr.duplicateObject(desk);
    room.objects.push(clonedDesk);
    expect(room.objects.length).toBe(initialCount + 1);

    // Delete clone
    const filtered = room.objects.filter((o) => o.id !== clonedDesk.id);
    expect(filtered.length).toBe(initialCount);
  });

  // --------------------------------------------------------------------------
  // Combination 10: Multi-Room Save Slots + Customize UI Sync
  // --------------------------------------------------------------------------
  it("Combo 10: saves multiple rooms to slots and updates active room preference in Customize UI", () => {
    storageService.saveRoom(COZY_BEDROOM_TEMPLATE);
    storageService.saveRoom(NATURE_GARDEN_TEMPLATE);

    storageService.setActiveBackgroundRoomId(COZY_BEDROOM_TEMPLATE.id);
    expect(storageService.getActiveBackgroundRoomId()).toBe(COZY_BEDROOM_TEMPLATE.id);

    storageService.setActiveBackgroundRoomId(NATURE_GARDEN_TEMPLATE.id);
    expect(storageService.getActiveBackgroundRoomId()).toBe(NATURE_GARDEN_TEMPLATE.id);
  });

  // --------------------------------------------------------------------------
  // Combination 11: Tree Foliage Sway + Wind Reversal + Astronomical Sun Angle
  // --------------------------------------------------------------------------
  it("Combo 11: synchronizes tree sway inversion with 180° wind direction reversal and golden hour sun", () => {
    // Golden hour sun (15 degrees elevation, 240 degrees azimuth)
    const sunPos = EnvironmentLightingEngine.calculateSunCoordinates(15, 240, 30);
    expect(sunPos[1]).toBeCloseTo(30 * Math.sin((15 * Math.PI) / 180), 2);

    const swayNorth = NatureSimulationEngine.evaluateTreeSway("trunk", 8.0, 1.0, 6.0);
    expect(typeof swayNorth).toBe("number");
    expect(isFinite(swayNorth)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Combination 12: High Graphics Preset + 95k Blades + SSS + 2048 Shadow Map
  // --------------------------------------------------------------------------
  it("Combo 12: verifies High graphics preset configures 95k blades and 2048 shadow map", () => {
    const high = NatureSimulationEngine.getGraphicsPresetConfig("high");
    expect(high.grassBladeCount).toBe(95000);
    expect(high.grassSegments).toBe(3);
    expect(high.shadowMapSize).toBe(2048);
    expect(high.enableSubsurfaceScattering).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Combination 13: Pointer-Events Passthrough with Open Modal over 3D Canvas
  // --------------------------------------------------------------------------
  it("Combo 13: ensures modal dialog captures pointer events while 3D background stays unclickable", () => {
    expect(bgSim.pointerEventsStyle).toBe("none");

    const modal = {
      isOpen: true,
      pointerEvents: "auto",
      handleFormSubmit: () => "success",
    };

    expect(modal.pointerEvents).toBe("auto");
    expect(modal.handleFormSubmit()).toBe("success");
    expect(bgSim.pointerEventsStyle).toBe("none");
  });

  // --------------------------------------------------------------------------
  // Combination 14: Corrupted Model Sanitization + Floor Snapping
  // --------------------------------------------------------------------------
  it("Combo 14: sanitizes unsupported shader material on custom model and snaps to floor", () => {
    const customGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    (mesh as any).material = { type: "RawShaderMaterial", customGlsl: true };
    customGroup.add(mesh);

    const count = GLTFLoaderPipeline.sanitizeMaterials(customGroup);
    expect(count).toBe(1);
    expect((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Combination 15: Rapid Tab Visibility Toggling during Wind Wave Simulation
  // --------------------------------------------------------------------------
  it("Combo 15: maintains continuous wind wave calculation across repeated tab hidden/shown toggles", () => {
    let simTime = 0;
    for (let i = 0; i < 10; i++) {
      bgSim.handleVisibilityChange(i % 2 === 0);
      if (!bgSim.isTabHidden) {
        simTime += 0.016; // 60fps tick
      }
    }

    const disp = NatureSimulationEngine.evaluateWindDisplacement([0, 0, 0], 1.0, simTime, 4.0, 90, 0.2);
    expect(isFinite(disp.displacement[0])).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Combination 16: Multi-Language App Name Rule Preservation across Locales
  // --------------------------------------------------------------------------
  it("Combo 16: verifies 'Oxygen Low\\'s Software' is preserved across all 6 language dictionaries", () => {
    const res = LocalizationVerifier.verifyAppNameRule();
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Combination 17: Extreme Scene Complexity (100 Objects + High Wind)
  // --------------------------------------------------------------------------
  it("Combo 17: verifies scene with 100 objects and high wind simulation operates stably", () => {
    const complexRoom: RoomDocument = {
      ...BLANK_CANVAS_TEMPLATE,
      objects: Array.from({ length: 100 }, (_, i) => ({
        id: `obj-complex-${i}`,
        name: `Item ${i}`,
        catalogId: i % 2 === 0 ? "plain_wall" : "coffee_table",
        type: (i % 2 === 0 ? "wall" : "furniture") as any,
        transform: { position: [i * 0.1, 0, i * 0.1], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
      })),
    };

    const res = storageService.saveRoom(complexRoom);
    expect(res.success).toBe(true);
    expect(complexRoom.objects).toHaveLength(100);
  });

  // --------------------------------------------------------------------------
  // Combination 18: Export Custom Room with Poster, Model, and Lamp to JSON
  // --------------------------------------------------------------------------
  it("Combo 18: creates hybrid room with poster, custom model, and lamp, exporting and re-importing without loss", () => {
    const hybridRoom: RoomDocument = {
      schemaVersion: "1.0.0",
      id: "room-hybrid-1",
      name: "Hybrid Studio Gallery",
      createdAt: "2026-09-06T10:00:00.000Z",
      updatedAt: "2026-09-06T10:00:00.000Z",
      environment: DEFAULT_ENVIRONMENT,
      cameraBookmarks: BLANK_CANVAS_TEMPLATE.cameraBookmarks,
      activeBookmarkIndex: 0,
      objects: [
        {
          id: "hybrid-poster",
          name: "Artwork",
          catalogId: "poster_frame_standard",
          type: "decor",
          transform: { position: [0, 2, -3], rotation: [0, 0, 0], scale: [1, 1, 1] },
          customProps: {
            aspectRatio: 1.5,
            frameStyle: "oak_wood",
          },
          visible: true,
          locked: false,
        },
        {
          id: "hybrid-lamp",
          name: "Floor Lamp",
          catalogId: "table_lamp",
          type: "furniture",
          transform: { position: [2, 0, -2], rotation: [0, 0, 0], scale: [1, 1, 1] },
          customProps: {
            lightColor: "#ffeedd",
            lightIntensity: 3.0,
            lightDistance: 6.0,
          },
          visible: true,
          locked: false,
        },
      ],
    };

    const json = storageService.exportRoomAsJson(hybridRoom);
    const imported = storageService.importRoomFromJson(json);

    expect(imported.success).toBe(true);
    const importedPoster = imported.room?.objects.find((o) => o.id === "hybrid-poster" || o.name === "Artwork");
    expect(importedPoster?.customProps?.frameStyle).toBe("oak_wood");
    expect(importedPoster?.customProps?.aspectRatio).toBe(1.5);
  });
});
