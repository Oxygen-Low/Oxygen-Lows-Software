import * as THREE from "three";
import { CustomProps } from "@/types/threeDBackground";
import {
  CatalogCategory,
  CatalogItemDefinition,
  CATALOG_ITEMS,
  CATALOG_ALIASES,
  getCatalogItemById,
  getCatalogItemsByCategory,
  getAllCatalogCategories,
} from "./CatalogDefinitions";

export class CatalogFactory {
  /**
   * Instantiates a fully configured procedural 3D compound mesh for any catalog item ID.
   * Seamlessly resolves legacy aliases and falls back gracefully to a safe placeholder cube
   * if an unrecognized or non-existent catalog ID is provided.
   */
  public static createMeshForItem(catalogId: string, customProps?: CustomProps): THREE.Object3D {
    // 1. Resolve alias if catalogId is a legacy or shorthand identifier
    const resolvedId = CATALOG_ALIASES[catalogId] || catalogId;
    const itemDef = getCatalogItemById(resolvedId);

    if (!itemDef) {
      // Graceful fallback for unknown catalog ID (satisfies Tier 2 boundary test)
      const fallbackGroup = new THREE.Group();
      fallbackGroup.name = catalogId;
      fallbackGroup.userData = {
        isRoomObject: true,
        catalogId,
      };

      const geom = new THREE.BoxGeometry(1.0, 1.0, 1.0);
      geom.translate(0, 0.5, 0); // Bottom centered at y=0
      const mat = new THREE.MeshStandardMaterial({
        color: customProps?.colorTint ? new THREE.Color(customProps.colorTint) : 0x94a3b8,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      fallbackGroup.add(mesh);

      return fallbackGroup;
    }

    // 2. Generate procedural mesh hierarchy via definition
    const meshCompound = itemDef.createMesh(customProps);

    // 3. Tag metadata for selection raycasting, serialization, and scene management
    meshCompound.name = catalogId;
    meshCompound.userData = {
      ...meshCompound.userData,
      isRoomObject: true,
      catalogId,
    };

    return meshCompound;
  }

  /**
   * Retrieves a catalog item definition by its canonical ID or legacy alias.
   */
  public static getItemDefinition(catalogId: string): CatalogItemDefinition | undefined {
    return getCatalogItemById(catalogId);
  }

  /**
   * Returns all catalog items, optionally filtered by a specific category.
   */
  public static listCatalogItems(category?: CatalogCategory): CatalogItemDefinition[] {
    if (!category) {
      return CATALOG_ITEMS;
    }
    return getCatalogItemsByCategory(category);
  }

  /**
   * Returns all available catalog category keys.
   */
  public static listCategories(): CatalogCategory[] {
    return getAllCatalogCategories();
  }

  // ==========================================================================
  // Compatibility Aliases
  // ==========================================================================

  /**
   * Retrieves all registered catalog definitions.
   */
  public static getAllItems(): CatalogItemDefinition[] {
    return CATALOG_ITEMS;
  }

  /**
   * Retrieves definition for a single item by ID or alias.
   */
  public static getItem(catalogId: string): CatalogItemDefinition | undefined {
    return getCatalogItemById(catalogId);
  }

  /**
   * Returns items grouped by category.
   */
  public static getItemsByCategory(category: CatalogCategory): CatalogItemDefinition[] {
    return getCatalogItemsByCategory(category);
  }

  /**
   * Recursively disposes geometries, materials, and textures on an object tree.
   */
  public static disposeMesh(object: THREE.Object3D): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if ("map" in m && m.map) (m.map as THREE.Texture).dispose();
              m.dispose();
            });
          } else {
            const mat = mesh.material as THREE.Material;
            if ("map" in mat && (mat as any).map) {
              ((mat as any).map as THREE.Texture).dispose();
            }
            mat.dispose();
          }
        }
      }
    });
  }

  // ==========================================================================
  // Instance Methods (delegating to static methods)
  // ==========================================================================

  public createMeshForItem(catalogId: string, customProps?: CustomProps): THREE.Object3D {
    return CatalogFactory.createMeshForItem(catalogId, customProps);
  }

  public getItemDefinition(catalogId: string): CatalogItemDefinition | undefined {
    return CatalogFactory.getItemDefinition(catalogId);
  }

  public listCatalogItems(category?: CatalogCategory): CatalogItemDefinition[] {
    return CatalogFactory.listCatalogItems(category);
  }

  public listCategories(): CatalogCategory[] {
    return CatalogFactory.listCategories();
  }

  public getAllItems(): CatalogItemDefinition[] {
    return CatalogFactory.getAllItems();
  }

  public getItem(catalogId: string): CatalogItemDefinition | undefined {
    return CatalogFactory.getItem(catalogId);
  }

  public getItemsByCategory(category: CatalogCategory): CatalogItemDefinition[] {
    return CatalogFactory.getItemsByCategory(category);
  }

  public disposeMesh(object: THREE.Object3D): void {
    CatalogFactory.disposeMesh(object);
  }
}
