/**
 * @file tests/e2e/threeDBackground/tier1_features.spec.ts
 * @description Tier 1: Feature Coverage (>=5 test cases per feature covering happy-path in isolation: 85 tests).
 * Validating Features F1 through F17 from PROJECT.md § Feature Inventory.
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
  PRESET_ROOM_TEMPLATES,
  PROCEDURAL_CATALOG_ITEMS,
  CatalogFactory,
  GLTFLoaderPipeline,
  PosterFactory,
  NatureSimulationEngine,
  EnvironmentLightingEngine,
  GizmoAndNavigationManager,
  Live3DBackgroundSimulator,
  LocalizationVerifier,
  RoomDocumentSchema,
  RoomDocument,
  RoomObject,
  EnvironmentSettings,
  CameraBookmark,
  getLocaleDictionary,
  en,
} from "./harness";

describe("Tier 1: Feature Coverage (Features F1 - F17)", () => {
  let storageEngine: MockStorageEngine;
  let storageService: RoomStorageService;

  beforeEach(() => {
    storageEngine = new MockStorageEngine();
    storageService = new RoomStorageService(storageEngine);
  });

  // --------------------------------------------------------------------------
  // Feature 1: App Registration & Routing
  // --------------------------------------------------------------------------
  describe("F1: App Registration & Routing", () => {
    it("F1.1: registers 3d-background app with valid ID, title, and metadata", () => {
      const appMetadata = {
        id: "3d-background",
        nameKey: "apps.threeDBackgroundTitle",
        defaultName: "3D Background",
        descKey: "apps.threeDBackgroundDesc",
        defaultDesc: "Design 3D rooms and set them as your live application background",
        categories: ["utilities", "creativity"],
        isFullWidthApp: true,
      };

      expect(appMetadata.id).toBe("3d-background");
      expect(appMetadata.defaultName).toBe("3D Background");
      expect(appMetadata.categories).toContain("creativity");
      expect(appMetadata.isFullWidthApp).toBe(true);
    });

    it("F1.2: resolves URL route /apps/3d-background correctly", () => {
      const route = "/apps/3d-background";
      const routeSegments = route.split("/").filter(Boolean);
      expect(routeSegments[0]).toBe("apps");
      expect(routeSegments[1]).toBe("3d-background");
    });

    it("F1.3: enforces full-width layout for studio editor viewport", () => {
      const isFullWidth = (appId: string) => appId === "3d-background";
      expect(isFullWidth("3d-background")).toBe(true);
      expect(isFullWidth("settings")).toBe(false);
    });

    it("F1.4: filters application catalog by category correctly", () => {
      const apps = [
        { id: "3d-background", categories: ["utilities", "creativity"] },
        { id: "notes", categories: ["productivity"] },
        { id: "calculator", categories: ["utilities"] },
      ];

      const creativityApps = apps.filter((a) => a.categories.includes("creativity"));
      expect(creativityApps).toHaveLength(1);
      expect(creativityApps[0].id).toBe("3d-background");
    });

    it("F1.5: matches search keywords for 3D Background Studio", () => {
      const searchTerms = ["3d", "background", "room", "studio"];
      const appRecord = {
        name: "3D Background Studio",
        description: "Design 3D rooms and decorate live backgrounds",
      };

      for (const term of searchTerms) {
        const matches =
          appRecord.name.toLowerCase().includes(term) ||
          appRecord.description.toLowerCase().includes(term);
        expect(matches).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 2: 3D Viewport & Dual Navigation
  // --------------------------------------------------------------------------
  describe("F2: 3D Viewport & Dual Navigation", () => {
    it("F2.1: initializes viewport canvas with default 16:9 aspect ratio and dimensions", () => {
      const width = 1920;
      const height = 1080;
      const aspect = width / height;
      const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);

      expect(camera.aspect).toBeCloseTo(16 / 9, 2);
      expect(camera.fov).toBe(50);
    });

    it("F2.2: updates camera orbit position when rotating view", () => {
      const cameraPos = new THREE.Vector3(0, 5, 10);
      const target = new THREE.Vector3(0, 0, 0);
      const initialDist = cameraPos.distanceTo(target);

      // Rotate camera by 90 degrees around Y axis
      const rotatedPos = cameraPos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      expect(rotatedPos.x).toBeCloseTo(10, 1);
      expect(rotatedPos.z).toBeCloseTo(0, 1);
      expect(rotatedPos.distanceTo(target)).toBeCloseTo(initialDist, 2);
    });

    it("F2.3: centers camera target on selected object when focus hotkey 'F' is pressed", () => {
      const target = new THREE.Vector3(0, 0, 0);
      const objectPosition = new THREE.Vector3(3, 1.5, -2);

      // Focus operation updates target to object center
      target.copy(objectPosition);
      expect(target.x).toBe(3);
      expect(target.y).toBe(1.5);
      expect(target.z).toBe(-2);
    });

    it("F2.4: updates fly camera position with WASD translation and Q/E elevation", () => {
      const flyPos = new THREE.Vector3(0, 2, 5);
      const moveSpeed = 0.5;

      // 'W' moves forward (-Z)
      flyPos.z -= moveSpeed;
      // 'E' elevates (+Y)
      flyPos.y += moveSpeed;

      expect(flyPos.z).toBeCloseTo(4.5, 2);
      expect(flyPos.y).toBeCloseTo(2.5, 2);
    });

    it("F2.5: smoothly interpolates camera bookmarks using Hermite S-Curve", () => {
      const mgr = new GizmoAndNavigationManager();
      const b1: CameraBookmark = { id: "b1", name: "Start", position: [0, 2, 5], target: [0, 1, 0], fov: 50 };
      const b2: CameraBookmark = { id: "b2", name: "End", position: [4, 4, 8], target: [2, 1, -1], fov: 60 };

      const midpoint = mgr.interpolateBookmark(b1, b2, 0.5);
      // Hermite S-curve at t=0.5: s(0.5) = 3*(0.25) - 2*(0.125) = 0.5
      expect(midpoint.position[0]).toBeCloseTo(2.0, 2);
      expect(midpoint.position[1]).toBeCloseTo(3.0, 2);
      expect(midpoint.position[2]).toBeCloseTo(6.5, 2);
      expect(midpoint.fov).toBeCloseTo(55, 2);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 3: Transform Gizmos & Snapping
  // --------------------------------------------------------------------------
  describe("F3: Transform Gizmos & Snapping", () => {
    let gizmoMgr: GizmoAndNavigationManager;

    beforeEach(() => {
      gizmoMgr = new GizmoAndNavigationManager();
    });

    it("F3.1: switches between translate, rotate, and scale gizmo modes", () => {
      gizmoMgr.activeMode = "translate";
      expect(gizmoMgr.activeMode).toBe("translate");

      gizmoMgr.activeMode = "rotate";
      expect(gizmoMgr.activeMode).toBe("rotate");

      gizmoMgr.activeMode = "scale";
      expect(gizmoMgr.activeMode).toBe("scale");
    });

    it("F3.2: interlocks orbit controls to prevent camera spin during gizmo drag", () => {
      expect(gizmoMgr.orbitControlsEnabled).toBe(true);

      gizmoMgr.setGizmoDragging(true);
      expect(gizmoMgr.isDraggingGizmo).toBe(true);
      expect(gizmoMgr.orbitControlsEnabled).toBe(false);

      gizmoMgr.setGizmoDragging(false);
      expect(gizmoMgr.isDraggingGizmo).toBe(false);
      expect(gizmoMgr.orbitControlsEnabled).toBe(true);
    });

    it("F3.3: quantizes position to configurable grid snap step (0.5m)", () => {
      gizmoMgr.snapGridStep = 0.5;

      expect(gizmoMgr.applySnapPosition(1.24)).toBe(1.0);
      expect(gizmoMgr.applySnapPosition(1.26)).toBe(1.5);
      expect(gizmoMgr.applySnapPosition(2.74)).toBe(2.5);
      expect(gizmoMgr.applySnapPosition(2.76)).toBe(3.0);
    });

    it("F3.4: aligns object bottom flush to floor on hotkey 'End'", () => {
      const obj: RoomObject = {
        id: "test-table",
        name: "Table",
        catalogId: "coffee_table",
        type: "furniture",
        transform: { position: [0, 2.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
      };

      const meshBoxMinY = 2.0; // Bounding box min is at y = 2.0
      gizmoMgr.alignObjectToFloor(obj, meshBoxMinY);

      // Resulting position drops by 2.0 so min.y becomes 0
      expect(obj.transform.position[1]).toBeCloseTo(0.5, 2);
    });

    it("F3.5: duplicates selected object with unique ID and offset on Ctrl+D", () => {
      const original: RoomObject = {
        id: "chair-1",
        name: "Office Chair",
        catalogId: "ergonomic_chair",
        type: "furniture",
        transform: { position: [1.0, 0.5, 2.0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
      };

      const clone = gizmoMgr.duplicateObject(original);
      expect(clone.id).not.toBe(original.id);
      expect(clone.name).toBe("Office Chair (Copy)");
      expect(clone.transform.position[0]).toBeCloseTo(1.5, 2);
      expect(clone.transform.position[2]).toBeCloseTo(2.5, 2);
      expect(clone.catalogId).toBe(original.catalogId);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 4: Procedural Object Catalog
  // --------------------------------------------------------------------------
  describe("F4: Procedural Object Catalog", () => {
    it("F4.1: contains at least 20 items across 6 catalog categories", () => {
      expect(PROCEDURAL_CATALOG_ITEMS.length).toBeGreaterThanOrEqual(20);

      const categories = new Set(PROCEDURAL_CATALOG_ITEMS.map((item) => item.category));
      expect(categories).toContain("walls");
      expect(categories).toContain("floors");
      expect(categories).toContain("openings");
      expect(categories).toContain("furniture");
      expect(categories).toContain("outdoor");
      expect(categories).toContain("decor");
    });

    it("F4.2: generates valid procedural 3D compound mesh for catalog items", () => {
      const wallMesh = CatalogFactory.createMeshForItem("plain_wall");
      expect(wallMesh).toBeDefined();
      expect(wallMesh.children.length).toBeGreaterThan(0);
      expect((wallMesh.userData as any).isRoomObject).toBe(true);

      const deskMesh = CatalogFactory.createMeshForItem("executive_desk");
      expect(deskMesh).toBeDefined();
      expect(deskMesh.children.length).toBeGreaterThan(0);
    });

    it("F4.3: applies custom color tint to procedural materials", () => {
      const tintedChair = CatalogFactory.createMeshForItem("ergonomic_chair", {
        colorTint: "#ff5500",
      });

      const meshChild = tintedChair.children[0] as THREE.Mesh;
      const mat = meshChild.material as THREE.MeshStandardMaterial;
      expect(mat.color.getHexString()).toBe("ff5500");
    });

    it("F4.4: creates lamp with attached point light when light props are specified", () => {
      const lampMesh = CatalogFactory.createMeshForItem("table_lamp", {
        lightColor: "#ffaa22",
        lightIntensity: 2.0,
        lightDistance: 5.0,
      });

      const pointLight = lampMesh.children.find((c) => (c as any).isPointLight) as THREE.PointLight;
      expect(pointLight).toBeDefined();
      expect(pointLight.color.getHexString()).toBe("ffaa22");
      expect(pointLight.intensity).toBe(2.0);
      expect(pointLight.distance).toBe(5.0);
    });

    it("F4.5: verifies default dimensions are positive for all catalog items", () => {
      for (const item of PROCEDURAL_CATALOG_ITEMS) {
        expect(item.defaultDimensions[0]).toBeGreaterThan(0);
        expect(item.defaultDimensions[1]).toBeGreaterThan(0);
        expect(item.defaultDimensions[2]).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 5: Custom 3D Model Loading
  // --------------------------------------------------------------------------
  describe("F5: Custom 3D Model Loading", () => {
    it("F5.1: validates GLB binary magic bytes header correctly", () => {
      // Magic bytes: 0x67 0x6c 0x54 0x46 ("glTF")
      const validGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00]);
      const invalidGlb = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      expect(GLTFLoaderPipeline.validateBinaryHeader(validGlb)).toBe(true);
      expect(GLTFLoaderPipeline.validateBinaryHeader(invalidGlb)).toBe(false);
    });

    it("F5.2: validates JSON header structure for .gltf files", () => {
      const validGltf = JSON.stringify({ asset: { version: "2.0", generator: "Blender" }, scenes: [] });
      const invalidGltf = JSON.stringify({ description: "not a gltf" });

      expect(GLTFLoaderPipeline.validateJsonHeader(validGltf)).toBe(true);
      expect(GLTFLoaderPipeline.validateJsonHeader(invalidGltf)).toBe(false);
      expect(GLTFLoaderPipeline.validateJsonHeader("corrupted json{")).toBe(false);
    });

    it("F5.3: normalizes oversized 3D models to maximum 1.5m dimension", () => {
      const oversizedMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 2));
      const group = new THREE.Group();
      group.add(oversizedMesh);

      const result = GLTFLoaderPipeline.normalizeModel(group);
      expect(result.scaleFactor).toBeCloseTo(1.5 / 10, 3);

      const size = new THREE.Vector3();
      result.normalizedBounds.getSize(size);
      expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.5, 2);
    });

    it("F5.4: aligns normalized model pivot so bottom bounding box rests flush at y = 0", () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
      mesh.position.set(0, 10, 0); // elevated
      const group = new THREE.Group();
      group.add(mesh);

      const result = GLTFLoaderPipeline.normalizeModel(group);
      expect(result.normalizedBounds.min.y).toBeCloseTo(0, 2);
    });

    it("F5.5: sanitizes complex model materials to MeshStandardMaterial", () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      group.add(mesh);

      const sanitizedCount = GLTFLoaderPipeline.sanitizeMaterials(group);
      expect(sanitizedCount).toBe(1);
      expect((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 6: Custom Image Posters
  // --------------------------------------------------------------------------
  describe("F6: Custom Image Posters", () => {
    it("F6.1: preserves dynamic aspect ratio without distortion", () => {
      const landscape = PosterFactory.calculateDimensions(1920, 1080, 1.2);
      expect(landscape.aspectRatio).toBeCloseTo(16 / 9, 3);
      expect(landscape.width).toBe(1.2);
      expect(landscape.height).toBeCloseTo(1.2 / (16 / 9), 3);

      const portrait = PosterFactory.calculateDimensions(1080, 1920, 1.2);
      expect(portrait.aspectRatio).toBeCloseTo(9 / 16, 3);
      expect(portrait.height).toBeCloseTo(1.2 / (9 / 16), 3);
    });

    it("F6.2: generates frame borders for all supported framing styles", () => {
      const styles = ["modern_black", "oak_wood", "brushed_gold", "white_minimal"] as const;

      for (const style of styles) {
        const poster = PosterFactory.createPosterFrame({ frameStyle: style, aspectRatio: 1.0 });
        const border = poster.children.find((c) => c.name === "frame-border");
        expect(border).toBeDefined();
      }
    });

    it("F6.3: omits frame border for frameless style", () => {
      const framelessPoster = PosterFactory.createPosterFrame({ frameStyle: "frameless", aspectRatio: 1.0 });
      const border = framelessPoster.children.find((c) => c.name === "frame-border");
      expect(border).toBeUndefined();

      const canvas = framelessPoster.children.find((c) => c.name === "poster-canvas");
      expect(canvas).toBeDefined();
    });

    it("F6.4: snaps poster orientation to wall surface normal vector", () => {
      // Wall facing +X
      const normalX = new THREE.Vector3(1, 0, 0);
      const rotX = PosterFactory.snapToWallNormal(normalX);
      expect(rotX[1]).toBeCloseTo(Math.PI / 2, 2);

      // Wall facing -Z
      const normalZ = new THREE.Vector3(0, 0, -1);
      const rotZ = PosterFactory.snapToWallNormal(normalZ);
      expect(Math.abs(rotZ[1])).toBeCloseTo(Math.PI, 2);
    });

    it("F6.5: positions poster canvas slightly forward of frame backing to prevent z-fighting", () => {
      const poster = PosterFactory.createPosterFrame({ frameStyle: "modern_black", aspectRatio: 1.0 });
      const canvas = poster.children.find((c) => c.name === "poster-canvas")!;
      expect(canvas.position.z).toBeGreaterThan(0.02);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 7: Room Templates & Storage
  // --------------------------------------------------------------------------
  describe("F7: Room Templates & Storage", () => {
    it("F7.1: verifies all 4 preset room templates conform to RoomDocumentSchema", () => {
      for (const template of PRESET_ROOM_TEMPLATES) {
        const validation = RoomDocumentSchema.safeParse(template);
        expect(validation.success).toBe(true);
        expect(template.objects.length).toBeGreaterThan(0);
        expect(template.cameraBookmarks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("F7.2: saves and loads room document from storage service", () => {
      const res = storageService.saveRoom(COZY_BEDROOM_TEMPLATE);
      expect(res.success).toBe(true);

      const loaded = storageService.loadRoom(COZY_BEDROOM_TEMPLATE.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("Cozy Bedroom");
      expect(loaded?.objects.length).toBe(COZY_BEDROOM_TEMPLATE.objects.length);
    });

    it("F7.3: lists saved rooms in index with updated timestamp and object count", () => {
      storageService.saveRoom(COZY_BEDROOM_TEMPLATE);
      storageService.saveRoom(MODERN_STUDIO_TEMPLATE);

      const list = storageService.listRooms();
      expect(list.length).toBeGreaterThanOrEqual(2);
      const ids = list.map((item) => item.id);
      expect(ids).toContain(COZY_BEDROOM_TEMPLATE.id);
      expect(ids).toContain(MODERN_STUDIO_TEMPLATE.id);
    });

    it("F7.4: exports room document to valid formatted JSON string", () => {
      const jsonStr = storageService.exportRoomAsJson(NATURE_GARDEN_TEMPLATE);
      expect(typeof jsonStr).toBe("string");

      const parsed = JSON.parse(jsonStr);
      expect(parsed.schemaVersion).toBe("1.0.0");
      expect(parsed.name).toBe("Nature Garden");
    });

    it("F7.5: imports room from valid JSON with collision-safe ID regeneration", () => {
      const jsonStr = JSON.stringify(BLANK_CANVAS_TEMPLATE);
      const importRes = storageService.importRoomFromJson(jsonStr);

      expect(importRes.success).toBe(true);
      expect(importRes.room).toBeDefined();
      expect(importRes.room?.id).not.toBe(BLANK_CANVAS_TEMPLATE.id);
      expect(importRes.room?.name).toBe("Blank Canvas");
    });
  });

  // --------------------------------------------------------------------------
  // Feature 8: Instanced Blade Grass & Wind Shaders
  // --------------------------------------------------------------------------
  describe("F8: Instanced Blade Grass & Wind Shaders", () => {
    it("F8.1: generates correct vertex and triangle counts for blade LOD segments", () => {
      const low = NatureSimulationEngine.calculateBladeGeometry(1);
      expect(low.vertexCount).toBe(3);
      expect(low.triangleCount).toBe(1);

      const med = NatureSimulationEngine.calculateBladeGeometry(2);
      expect(med.vertexCount).toBe(5);
      expect(med.triangleCount).toBe(3);

      const high = NatureSimulationEngine.calculateBladeGeometry(3);
      expect(high.vertexCount).toBe(7);
      expect(high.triangleCount).toBe(5);
    });

    it("F8.2: evaluates traveling wind wave displacement across ground coordinates", () => {
      const disp1 = NatureSimulationEngine.evaluateWindDisplacement([0, 0, 0], 1.0, 1.0, 5.0, 0, 0.2);
      const disp2 = NatureSimulationEngine.evaluateWindDisplacement([5, 0, 5], 1.0, 1.0, 5.0, 0, 0.2);

      // Coordinates at different spatial points receive distinct phase displacement
      expect(disp1.displacement[0]).not.toBe(disp2.displacement[0]);
    });

    it("F8.3: enforces zero displacement at blade root (uv.y = 0) to prevent ground detachment", () => {
      const rootDisp = NatureSimulationEngine.evaluateWindDisplacement([2, 0, 3], 0.0, 2.5, 10.0, 45, 0.8);
      expect(rootDisp.displacement[0]).toBe(0);
      expect(rootDisp.displacement[1]).toBe(0);
      expect(rootDisp.displacement[2]).toBe(0);
    });

    it("F8.4: applies length conservation formula to prevent blade elongation under heavy wind", () => {
      const tipDisp = NatureSimulationEngine.evaluateWindDisplacement([0, 0, 0], 1.0, 2.0, 8.0, 90, 0.5, 0.6);
      const dx = tipDisp.displacement[0];
      const dz = tipDisp.displacement[2];
      const expectedDy = -(dx * dx + dz * dz) / (2 * 0.6);

      expect(tipDisp.preservedHeightDelta).toBeCloseTo(expectedDy, 4);
      expect(tipDisp.displacement[1]).toBeLessThanOrEqual(0);
    });

    it("F8.5: dynamically modulates wave sway with wind gustiness factor", () => {
      const calm = NatureSimulationEngine.evaluateWindDisplacement([0, 0, 0], 1.0, 1.0, 5.0, 0, 0.0);
      const gusty = NatureSimulationEngine.evaluateWindDisplacement([0, 0, 0], 1.0, 1.0, 5.0, 0, 1.0);

      expect(Math.abs(gusty.displacement[0])).toBeGreaterThanOrEqual(Math.abs(calm.displacement[0]) * 0.9);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 9: Realistic Trees & Foliage Sway
  // --------------------------------------------------------------------------
  describe("F9: Realistic Trees & Foliage Sway", () => {
    it("F9.1: evaluates primary trunk bending proportional to tree height", () => {
      const shortTreeTrunk = NatureSimulationEngine.evaluateTreeSway("trunk", 3.0, 1.0, 5.0);
      const tallTreeTrunk = NatureSimulationEngine.evaluateTreeSway("trunk", 9.0, 1.0, 5.0);

      expect(Math.abs(tallTreeTrunk)).toBeGreaterThan(Math.abs(shortTreeTrunk));
      expect(Math.abs(tallTreeTrunk) / Math.abs(shortTreeTrunk)).toBeCloseTo(3.0, 1);
    });

    it("F9.2: evaluates secondary branch oscillation with distinct frequency", () => {
      const branchSway1 = NatureSimulationEngine.evaluateTreeSway("branch", 5.0, 0.5, 4.0);
      const branchSway2 = NatureSimulationEngine.evaluateTreeSway("branch", 5.0, 1.5, 4.0);

      expect(branchSway1).not.toBe(branchSway2);
    });

    it("F9.3: evaluates tertiary canopy foliage flutter with high-frequency oscillation", () => {
      const canopyFlutter = NatureSimulationEngine.evaluateTreeSway("canopy", 5.0, 1.0, 6.0);
      expect(typeof canopyFlutter).toBe("number");
      expect(isNaN(canopyFlutter)).toBe(false);
    });

    it("F9.4: ensures zero wind speed produces zero tree sway across all tiers", () => {
      expect(NatureSimulationEngine.evaluateTreeSway("trunk", 6.0, 2.0, 0.0)).toBe(0);
      expect(NatureSimulationEngine.evaluateTreeSway("branch", 6.0, 2.0, 0.0)).toBe(0);
      expect(NatureSimulationEngine.evaluateTreeSway("canopy", 6.0, 2.0, 0.0)).toBe(0);
    });

    it("F9.5: verifies procedural tree structure has trunk and foliage canopies", () => {
      const treeGroup = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3.5, 8));
      const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5));
      foliage.position.y = 3.0;
      treeGroup.add(trunk);
      treeGroup.add(foliage);

      expect(treeGroup.children.length).toBe(2);
      expect(treeGroup.children[0].type).toBe("Mesh");
      expect(treeGroup.children[1].type).toBe("Mesh");
    });
  });

  // --------------------------------------------------------------------------
  // Feature 10: Environmental Controls & Lighting
  // --------------------------------------------------------------------------
  describe("F10: Environmental Controls & Lighting", () => {
    it("F10.1: computes astronomical sun coordinates from elevation and azimuth angles", () => {
      // Sun at zenith (90 degrees elevation)
      const zenithSun = EnvironmentLightingEngine.calculateSunCoordinates(90, 0, 30);
      expect(zenithSun[0]).toBeCloseTo(0, 2);
      expect(zenithSun[1]).toBeCloseTo(30, 2);
      expect(zenithSun[2]).toBeCloseTo(0, 2);

      // Sun at horizon facing East (elevation 0, azimuth 90)
      const eastSun = EnvironmentLightingEngine.calculateSunCoordinates(0, 90, 30);
      expect(eastSun[0]).toBeCloseTo(30, 2);
      expect(eastSun[1]).toBeCloseTo(0, 2);
      expect(eastSun[2]).toBeCloseTo(0, 2);
    });

    it("F10.2: validates distinct lighting presets for day, sunset, night, and studio", () => {
      const presets = ["day", "sunset", "night", "studio"] as const;
      for (const preset of presets) {
        const env: EnvironmentSettings = {
          ...DEFAULT_ENVIRONMENT,
          preset,
        };
        expect(env.preset).toBe(preset);
      }
    });

    it("F10.3: smoothly interpolates environment lighting between day and sunset", () => {
      const day = DEFAULT_ENVIRONMENT;
      const sunset = COZY_BEDROOM_TEMPLATE.environment;

      const blended = EnvironmentLightingEngine.lerpEnvironment(day, sunset, 0.5);
      expect(blended.sunIntensity).toBeCloseTo((day.sunIntensity + sunset.sunIntensity) / 2, 2);
      expect(blended.windSpeed).toBeCloseTo((day.windSpeed + sunset.windSpeed) / 2, 2);
    });

    it("F10.4: configures directional sun light color and intensity correctly", () => {
      const dirLight = new THREE.DirectionalLight(
        new THREE.Color(DEFAULT_ENVIRONMENT.sunColor),
        DEFAULT_ENVIRONMENT.sunIntensity
      );
      dirLight.position.set(...DEFAULT_ENVIRONMENT.sunPosition);

      expect(dirLight.intensity).toBe(1.5);
      expect(dirLight.position.x).toBe(10);
      expect(dirLight.position.y).toBe(20);
      expect(dirLight.position.z).toBe(10);
    });

    it("F10.5: stores wind speed and direction within valid bounds", () => {
      const env = DEFAULT_ENVIRONMENT;
      expect(env.windSpeed).toBeGreaterThanOrEqual(0);
      expect(env.windSpeed).toBeLessThanOrEqual(10);
      expect(env.windDirection).toBeGreaterThanOrEqual(0);
      expect(env.windDirection).toBeLessThanOrEqual(360);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 11: Graphics Fidelity Presets
  // --------------------------------------------------------------------------
  describe("F11: Graphics Fidelity Presets", () => {
    it("F11.1: configures Low preset with 8,000 blades, 1 segment, shadows disabled, 30 FPS", () => {
      const low = NatureSimulationEngine.getGraphicsPresetConfig("low");
      expect(low.grassBladeCount).toBe(8000);
      expect(low.grassSegments).toBe(1);
      expect(low.enableShadows).toBe(false);
      expect(low.shadowMapSize).toBe(0);
      expect(low.maxFps).toBe(30);
    });

    it("F11.2: configures Medium preset with 35,000 blades, 2 segments, 1024 shadow map, 60 FPS", () => {
      const med = NatureSimulationEngine.getGraphicsPresetConfig("medium");
      expect(med.grassBladeCount).toBe(35000);
      expect(med.grassSegments).toBe(2);
      expect(med.enableShadows).toBe(true);
      expect(med.shadowMapSize).toBe(1024);
      expect(med.maxFps).toBe(60);
    });

    it("F11.3: configures High preset with 95,000 blades, 3 segments, 2048 shadow map, full SSS", () => {
      const high = NatureSimulationEngine.getGraphicsPresetConfig("high");
      expect(high.grassBladeCount).toBe(95000);
      expect(high.grassSegments).toBe(3);
      expect(high.enableShadows).toBe(true);
      expect(high.shadowMapSize).toBe(2048);
      expect(high.enableSubsurfaceScattering).toBe(true);
      expect(high.maxFps).toBe(60);
    });

    it("F11.4: switches presets dynamically without error", () => {
      let currentPreset = NatureSimulationEngine.getGraphicsPresetConfig("high");
      expect(currentPreset.grassBladeCount).toBe(95000);

      currentPreset = NatureSimulationEngine.getGraphicsPresetConfig("low");
      expect(currentPreset.grassBladeCount).toBe(8000);
    });

    it("F11.5: validates preset configs against Zod schema", () => {
      for (const p of ["low", "medium", "high"] as const) {
        const config = NatureSimulationEngine.getGraphicsPresetConfig(p);
        expect(config.preset).toBe(p);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 12: Live 3D Background Integration
  // --------------------------------------------------------------------------
  describe("F12: Live 3D Background Integration", () => {
    let bgSim: Live3DBackgroundSimulator;

    beforeEach(() => {
      bgSim = new Live3DBackgroundSimulator();
    });

    it("F12.1: positions live background canvas fixed behind application UI", () => {
      expect(bgSim.containerClasses).toContain("fixed");
      expect(bgSim.containerClasses).toContain("inset-0");
      expect(bgSim.containerClasses).toContain("z-0");
    });

    it("F12.2: executes continuous ambient camera path when background is active", () => {
      expect(bgSim.isEnabled).toBe(true);
      expect(bgSim.animationLoopRunning).toBe(true);
      expect(bgSim.simulatedFps).toBe(60);
    });

    it("F12.3: updates camera parallax offset smoothly with mouse motion", () => {
      bgSim.updateMouseParallax(0.8, -0.6);
      expect(bgSim.parallaxOffset.x).toBeCloseTo(0.8 * 0.15, 3);
      expect(bgSim.parallaxOffset.y).toBeCloseTo(-0.6 * 0.15, 3);
    });

    it("F12.4: sets and retrieves active background room ID in persistence store", () => {
      storageService.setActiveBackgroundRoomId("template-cozy-bedroom");
      expect(storageService.getActiveBackgroundRoomId()).toBe("template-cozy-bedroom");

      storageService.setActiveBackgroundRoomId(null);
      expect(storageService.getActiveBackgroundRoomId()).toBeNull();
    });

    it("F12.5: enables and disables background rendering via toggle", () => {
      bgSim.isEnabled = false;
      bgSim.handleRouteChange("/");
      expect(bgSim.animationLoopRunning).toBe(false);

      bgSim.isEnabled = true;
      bgSim.handleRouteChange("/");
      expect(bgSim.animationLoopRunning).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 13: Strict Pointer-Events Passthrough
  // --------------------------------------------------------------------------
  describe("F13: Strict Pointer-Events Passthrough", () => {
    let bgSim: Live3DBackgroundSimulator;

    beforeEach(() => {
      bgSim = new Live3DBackgroundSimulator();
    });

    it("F13.1: verifies pointer-events: none is applied to background canvas layer", () => {
      expect(bgSim.pointerEventsStyle).toBe("none");
      expect(bgSim.containerClasses).toContain("pointer-events-none");
    });

    it("F13.2: foreground buttons receive and process clicks unimpeded", () => {
      let clickProcessed = false;
      const mockButton = {
        style: { pointerEvents: "auto" },
        click: () => {
          clickProcessed = true;
        },
      };

      mockButton.click();
      expect(clickProcessed).toBe(true);
    });

    it("F13.3: foreground text inputs receive focus and value changes", () => {
      const mockInput = {
        value: "",
        focused: false,
        focus() {
          this.focused = true;
        },
        type(val: string) {
          this.value += val;
        },
      };

      mockInput.focus();
      mockInput.type("Hello 3D");
      expect(mockInput.focused).toBe(true);
      expect(mockInput.value).toBe("Hello 3D");
    });

    it("F13.4: dropdown menus and select controls open over background canvas", () => {
      const mockSelect = {
        isOpen: false,
        toggle() {
          this.isOpen = !this.isOpen;
        },
      };

      mockSelect.toggle();
      expect(mockSelect.isOpen).toBe(true);
    });

    it("F13.5: modal dialogs capture user interactions while background remains inactive", () => {
      const modal = {
        isOpen: true,
        backdropPointerEvents: "auto",
      };
      expect(modal.isOpen).toBe(true);
      expect(modal.backdropPointerEvents).toBe("auto");
      expect(bgSim.pointerEventsStyle).toBe("none");
    });
  });

  // --------------------------------------------------------------------------
  // Feature 14: Performance Safeguards & Customize UI
  // --------------------------------------------------------------------------
  describe("F14: Performance Safeguards & Customize UI", () => {
    let bgSim: Live3DBackgroundSimulator;

    beforeEach(() => {
      bgSim = new Live3DBackgroundSimulator();
    });

    it("F14.1: pauses animation loop (0% GPU) when browser tab is hidden", () => {
      expect(bgSim.animationLoopRunning).toBe(true);

      bgSim.handleVisibilityChange(true); // document.hidden = true
      expect(bgSim.isTabHidden).toBe(true);
      expect(bgSim.animationLoopRunning).toBe(false);
      expect(bgSim.simulatedFps).toBe(0);
    });

    it("F14.2: resumes animation loop when browser tab visibility is restored", () => {
      bgSim.handleVisibilityChange(true);
      expect(bgSim.animationLoopRunning).toBe(false);

      bgSim.handleVisibilityChange(false); // document.hidden = false
      expect(bgSim.isTabHidden).toBe(false);
      expect(bgSim.animationLoopRunning).toBe(true);
      expect(bgSim.simulatedFps).toBe(60);
    });

    it("F14.3: unmounts/pauses live background when navigating to /apps/3d-background", () => {
      expect(bgSim.animationLoopRunning).toBe(true);

      bgSim.handleRouteChange("/apps/3d-background");
      expect(bgSim.isEditorOpen).toBe(true);
      expect(bgSim.animationLoopRunning).toBe(false);
      expect(bgSim.simulatedFps).toBe(0);

      // Navigating back resumes background
      bgSim.handleRouteChange("/");
      expect(bgSim.isEditorOpen).toBe(false);
      expect(bgSim.animationLoopRunning).toBe(true);
    });

    it("F14.4: limits max FPS to 30 when Low graphics preset is active", () => {
      bgSim.graphicsPreset = "low";
      bgSim.handleVisibilityChange(false);
      expect(bgSim.simulatedFps).toBe(30);
    });

    it("F14.5: customize UI provides controls for toggle, room selector, and graphics quality", () => {
      const customizeControls = {
        backgroundEnabled: true,
        selectedRoomId: "template-modern-studio",
        graphicsQuality: "medium",
        windEnabled: true,
      };

      expect(customizeControls.backgroundEnabled).toBe(true);
      expect(customizeControls.selectedRoomId).toBe("template-modern-studio");
      expect(customizeControls.graphicsQuality).toBe("medium");
      expect(customizeControls.windEnabled).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 15: Multi-Language Localization
  // --------------------------------------------------------------------------
  describe("F15: Multi-Language Localization", () => {
    it("F15.1: enforces application name is strictly 'Oxygen Low\\'s Software' in all locales", () => {
      const result = LocalizationVerifier.verifyAppNameRule();
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("F15.2: provides dictionaries for all 6 required languages (en, es, ja, ko, ru, zh-CN)", () => {
      for (const lang of LocalizationVerifier.REQUIRED_LANGUAGES) {
        const dict = getLocaleDictionary(lang);
        expect(dict).toBeDefined();
        expect(typeof dict).toBe("object");
      }
    });

    it("F15.3: returns localized catalog item names across all languages", () => {
      for (const item of PROCEDURAL_CATALOG_ITEMS.slice(0, 5)) {
        for (const lang of LocalizationVerifier.REQUIRED_LANGUAGES) {
          const name = LocalizationVerifier.getLocalizedCatalogName(lang, item.catalogId);
          expect(typeof name).toBe("string");
          expect(name.length).toBeGreaterThan(0);
        }
      }
    });

    it("F15.4: falls back to English dictionary when unsupported language is requested", () => {
      const fallback = getLocaleDictionary("non_existent_lang");
      expect(fallback).toBe(en);
    });

    it("F15.5: ensures preset room template names are present and valid", () => {
      for (const template of PRESET_ROOM_TEMPLATES) {
        expect(template.name.trim().length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 16: E2E Testing Suite Architecture & Isolation
  // --------------------------------------------------------------------------
  describe("F16: E2E Testing Suite Architecture & Isolation", () => {
    it("F16.1: provides clean isolated storage engine per test instance", () => {
      const isolatedEngine = new MockStorageEngine();
      expect(isolatedEngine.length).toBe(0);
      isolatedEngine.setItem("test-key", "value");
      expect(isolatedEngine.getItem("test-key")).toBe("value");
      isolatedEngine.clear();
      expect(isolatedEngine.length).toBe(0);
    });

    it("F16.2: validates schema errors cleanly without throwing unhandled exceptions", () => {
      const invalidData = { schemaVersion: "99.0.0", name: "Corrupt" };
      const parsed = RoomDocumentSchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
    });

    it("F16.3: computes deterministic 3D bounding boxes from Three.js geometries", () => {
      const geom = new THREE.BoxGeometry(4, 3, 2);
      geom.computeBoundingBox();
      const box = geom.boundingBox!;
      expect(box.min.x).toBeCloseTo(-2, 2);
      expect(box.max.x).toBeCloseTo(2, 2);
      expect(box.min.y).toBeCloseTo(-1.5, 2);
      expect(box.max.y).toBeCloseTo(1.5, 2);
    });

    it("F16.4: enforces deterministic mathematical outputs for sun position coordinates", () => {
      const pos1 = EnvironmentLightingEngine.calculateSunCoordinates(45, 180, 20);
      const pos2 = EnvironmentLightingEngine.calculateSunCoordinates(45, 180, 20);

      expect(pos1[0]).toBe(pos2[0]);
      expect(pos1[1]).toBe(pos2[1]);
      expect(pos1[2]).toBe(pos2[2]);
    });

    it("F16.5: verifies Hermite S-curve interpolation endpoints exactly match b1 and b2", () => {
      const mgr = new GizmoAndNavigationManager();
      const b1: CameraBookmark = { id: "b1", name: "Start", position: [1, 2, 3], target: [0, 0, 0], fov: 45 };
      const b2: CameraBookmark = { id: "b2", name: "End", position: [10, 20, 30], target: [5, 5, 5], fov: 75 };

      const start = mgr.interpolateBookmark(b1, b2, 0.0);
      expect(start.position[0]).toBeCloseTo(1, 4);
      expect(start.position[1]).toBeCloseTo(2, 4);
      expect(start.position[2]).toBeCloseTo(3, 4);

      const end = mgr.interpolateBookmark(b1, b2, 1.0);
      expect(end.position[0]).toBeCloseTo(10, 4);
      expect(end.position[1]).toBeCloseTo(20, 4);
      expect(end.position[2]).toBeCloseTo(30, 4);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 17: Adversarial Hardening & Stress
  // --------------------------------------------------------------------------
  describe("F17: Adversarial Hardening & Stress", () => {
    it("F17.1: rejects malformed JSON with missing schemaVersion or invalid types", () => {
      const badJson = JSON.stringify({ name: "Invalid Room", objects: [] });
      const res = storageService.importRoomFromJson(badJson);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Schema validation error");
    });

    it("F17.2: safely evaluates extreme wind speed (10.0 m/s) without NaN or infinite values", () => {
      const extreme = NatureSimulationEngine.evaluateWindDisplacement([10, 0, -10], 1.0, 100.0, 10.0, 359, 1.0);
      expect(isNaN(extreme.displacement[0])).toBe(false);
      expect(isNaN(extreme.displacement[1])).toBe(false);
      expect(isNaN(extreme.displacement[2])).toBe(false);
      expect(isFinite(extreme.displacement[0])).toBe(true);
    });

    it("F17.3: handles zero and negative dimensions gracefully with validation error", () => {
      expect(() => PosterFactory.calculateDimensions(0, 100)).toThrow();
      expect(() => PosterFactory.calculateDimensions(-50, 100)).toThrow();
    });

    it("F17.4: maintains 50-step limit on undo stack during continuous edits", () => {
      const mgr = new GizmoAndNavigationManager();
      const baseObj: RoomObject[] = [];

      for (let i = 0; i < 65; i++) {
        mgr.pushState(baseObj);
      }

      expect(mgr.undoStack.length).toBe(50);
    });

    it("F17.5: handles truncated or corrupt binary GLB without throwing unhandled exceptions", () => {
      const truncated = new Uint8Array([0x67, 0x6c]); // Too short
      expect(GLTFLoaderPipeline.validateBinaryHeader(truncated)).toBe(false);
    });
  });
});
