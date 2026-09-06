import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CatalogFactory } from "./CatalogFactory";
import { CATALOG_ITEMS, CATALOG_ALIASES, CatalogCategory } from "./CatalogDefinitions";

describe("CatalogFactory & Procedural Geometry Suite", () => {
  // --------------------------------------------------------------------------
  // 1. Catalog Registry & Metadata
  // --------------------------------------------------------------------------
  describe("Catalog Registry & Enumeration", () => {
    it("registers all 32 procedural items across the 6 required categories", () => {
      const items = CatalogFactory.getAllItems();
      expect(items.length).toBe(32);

      const requiredCategories: CatalogCategory[] = [
        "walls",
        "floors",
        "openings",
        "furniture",
        "outdoor",
        "decor",
      ];
      const foundCategories = new Set(items.map((i) => i.category));

      for (const cat of requiredCategories) {
        expect(foundCategories.has(cat)).toBe(true);
      }

      for (const item of items) {
        expect(item.catalogId).toBeTruthy();
        expect(item.nameKey).toMatch(/^catalog\./);
        expect(item.defaultName).toBeTruthy();
        expect(item.icon).toBeTruthy();
        expect(typeof item.createMesh).toBe("function");
        expect(item.defaultDimensions).toHaveLength(3);
        expect(item.defaultDimensions[0]).toBeGreaterThan(0);
        expect(item.defaultDimensions[1]).toBeGreaterThan(0);
        expect(item.defaultDimensions[2]).toBeGreaterThan(0);
      }
    });

    it("filters items correctly by category", () => {
      const furnitureItems = CatalogFactory.listCatalogItems("furniture");
      expect(furnitureItems.length).toBe(13);
      for (const item of furnitureItems) {
        expect(item.category).toBe("furniture");
      }

      const wallItems = CatalogFactory.getItemsByCategory("walls");
      expect(wallItems.length).toBe(4);

      const floorItems = CatalogFactory.getItemsByCategory("floors");
      expect(floorItems.length).toBe(4);

      const openingItems = CatalogFactory.getItemsByCategory("openings");
      expect(openingItems.length).toBe(4);

      const outdoorItems = CatalogFactory.getItemsByCategory("outdoor");
      expect(outdoorItems.length).toBe(6);

      const decorItems = CatalogFactory.getItemsByCategory("decor");
      expect(decorItems.length).toBe(1);

      const nonExistent = CatalogFactory.listCatalogItems("non_existent" as any);
      expect(nonExistent).toHaveLength(0);
    });

    it("lists all category identifiers", () => {
      const categories = CatalogFactory.listCategories();
      expect(categories).toEqual([
        "walls",
        "floors",
        "openings",
        "furniture",
        "outdoor",
        "decor",
      ]);
    });

    it("retrieves item definitions by canonical ID and by legacy alias", () => {
      const canonical = CatalogFactory.getItemDefinition("wall_straight");
      expect(canonical).toBeDefined();
      expect(canonical?.defaultName).toBe("Straight Wall");

      const byAlias = CatalogFactory.getItemDefinition("plain_wall");
      expect(byAlias).toBeDefined();
      expect(byAlias?.catalogId).toBe("wall_straight");

      const unknown = CatalogFactory.getItemDefinition("unknown_id");
      expect(unknown).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Pivot Alignment & Ground Flush Tests
  // --------------------------------------------------------------------------
  describe("Pivot Alignment & Bottom Centering", () => {
    it("ensures every procedural catalog item rests flush at y = 0 and is horizontally centered", () => {
      for (const item of CATALOG_ITEMS) {
        const mesh = CatalogFactory.createMeshForItem(item.catalogId);
        expect(mesh).toBeDefined();

        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);

        // Vertical bottom alignment: min.y must be within 0.05m of 0.0
        expect(
          Math.abs(box.min.y),
          `Item ${item.catalogId} min.y was ${box.min.y}, expected ~0`,
        ).toBeLessThan(0.05);

        // Horizontal centering: (min.x + max.x)/2 and (min.z + max.z)/2 must be within 0.1m of 0
        const centerX = (box.min.x + box.max.x) / 2;
        const centerZ = (box.min.z + box.max.z) / 2;
        expect(
          Math.abs(centerX),
          `Item ${item.catalogId} centerX was ${centerX}, expected ~0`,
        ).toBeLessThan(0.1);
        expect(
          Math.abs(centerZ),
          `Item ${item.catalogId} centerZ was ${centerZ}, expected ~0`,
        ).toBeLessThan(0.1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. UserData & Shadow Mapping Configuration
  // --------------------------------------------------------------------------
  describe("UserData & Shadow Mapping", () => {
    it("tags root group with userData.isRoomObject = true and catalogId", () => {
      const mesh = CatalogFactory.createMeshForItem("wall_straight");
      expect(mesh.userData.isRoomObject).toBe(true);
      expect(mesh.userData.catalogId).toBe("wall_straight");
      expect(mesh.name).toBe("wall_straight");
    });

    it("enables shadow casting and receiving on solid submeshes", () => {
      const mesh = CatalogFactory.createMeshForItem("furniture_desk_executive");
      let meshCount = 0;
      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount++;
          const m = child as THREE.Mesh;
          expect(m.castShadow).toBe(true);
          expect(m.receiveShadow).toBe(true);
        }
      });
      expect(meshCount).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Color Tinting & Child Index 0 Compatibility
  // --------------------------------------------------------------------------
  describe("Color Tinting & Material Property Handling", () => {
    it("applies colorTint to primary child mesh (index 0) for ergonomic chair", () => {
      const tintedChair = CatalogFactory.createMeshForItem("ergonomic_chair", {
        colorTint: "#ff5500",
      });
      const meshChild = tintedChair.children[0] as THREE.Mesh;
      const mat = meshChild.material as THREE.MeshStandardMaterial;
      expect(mat.color.getHexString()).toBe("ff5500");
    });

    it("applies colorTint to primary child mesh for wall and sofa", () => {
      const tintedWall = CatalogFactory.createMeshForItem("plain_wall", {
        colorTint: "#112233",
      });
      const wallChild = tintedWall.children[0] as THREE.Mesh;
      const wallMat = wallChild.material as THREE.MeshStandardMaterial;
      expect(wallMat.color.getHexString()).toBe("112233");

      const tintedSofa = CatalogFactory.createMeshForItem("sofa_3seater", {
        colorTint: "#aabbcc",
      });
      const sofaChild = tintedSofa.children[0] as THREE.Mesh;
      const sofaMat = sofaChild.material as THREE.MeshStandardMaterial;
      expect(sofaMat.color.getHexString()).toBe("aabbcc");
    });

    it("handles invalid or undefined color tint strings without crashing", () => {
      const mesh = CatalogFactory.createMeshForItem("plain_wall", {
        colorTint: undefined,
      });
      expect(mesh).toBeDefined();

      const meshWithGarbage = CatalogFactory.createMeshForItem("plain_wall", {
        colorTint: "not_a_valid_hex" as any,
      });
      expect(meshWithGarbage).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Dynamic Lighting on Lamps
  // --------------------------------------------------------------------------
  describe("Dynamic Point Lighting on Lamps", () => {
    it("creates table lamp with attached PointLight when lighting props are provided", () => {
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

    it("creates standing lamp and desk lamp with dynamic lights", () => {
      const standingLamp = CatalogFactory.createMeshForItem("standing_lamp", {
        lightColor: "#fef08a",
        lightIntensity: 1.8,
        lightDistance: 4.5,
      });
      const stLight = standingLamp.children.find((c) => (c as any).isPointLight) as THREE.PointLight;
      expect(stLight).toBeDefined();
      expect(stLight.intensity).toBe(1.8);

      const deskLamp = CatalogFactory.createMeshForItem("desk_lamp", {
        lightColor: "#fffbeb",
        lightIntensity: 1.2,
      });
      const dkLight = deskLamp.children.find((c) => (c as any).isPointLight) as THREE.PointLight;
      expect(dkLight).toBeDefined();
      expect(dkLight.intensity).toBe(1.2);
    });

    it("preserves zero light intensity and large distance values without overriding with defaults", () => {
      const lamp = CatalogFactory.createMeshForItem("table_lamp", {
        lightColor: "#ffffff",
        lightIntensity: 0,
        lightDistance: 999,
      });

      const light = lamp.children.find((c) => (c as any).isPointLight) as THREE.PointLight;
      expect(light).toBeDefined();
      expect(light.intensity).toBe(0);
      expect(light.distance).toBe(999);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Aliases & Fallback Resolution
  // --------------------------------------------------------------------------
  describe("Aliases & Fallback Resolution", () => {
    it("resolves all defined legacy aliases to valid 3D meshes", () => {
      for (const [alias, canonicalId] of Object.entries(CATALOG_ALIASES)) {
        const mesh = CatalogFactory.createMeshForItem(alias);
        expect(mesh).toBeDefined();
        expect(mesh.children.length).toBeGreaterThan(0);
        expect(mesh.userData.isRoomObject).toBe(true);
      }
    });

    it("falls back to safe generic placeholder cube when unknown catalogId is requested", () => {
      const mesh = CatalogFactory.createMeshForItem("non_existent_item_id");
      expect(mesh).toBeDefined();
      expect(mesh.name).toBe("non_existent_item_id");
      expect(mesh.userData.isRoomObject).toBe(true);
      expect(mesh.userData.catalogId).toBe("non_existent_item_id");
      expect(mesh.children.length).toBe(1);

      const cube = mesh.children[0] as THREE.Mesh;
      expect(cube.geometry).toBeInstanceOf(THREE.BoxGeometry);

      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(box.max.y).toBeCloseTo(1.0, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Resource Disposal
  // --------------------------------------------------------------------------
  describe("Resource Disposal", () => {
    it("disposes geometries and materials cleanly without throwing", () => {
      const mesh = CatalogFactory.createMeshForItem("furniture_bookshelf");
      expect(() => CatalogFactory.disposeMesh(mesh)).not.toThrow();
    });
  });
});
