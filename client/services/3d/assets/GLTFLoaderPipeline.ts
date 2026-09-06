import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { CustomProps, RoomObject } from "@/types/threeDBackground";
import { storage } from "@/lib/storage";

// ============================================================================
// Custom Typed Pipeline Errors
// ============================================================================

export class CorruptModelError extends Error {
  constructor(message: string) {
    super(`[GLTFLoaderPipeline] Corrupt 3D Model: ${message}`);
    this.name = "CorruptModelError";
  }
}

export class UnsupportedModelFormatError extends Error {
  constructor(message: string) {
    super(`[GLTFLoaderPipeline] Unsupported Format: ${message}`);
    this.name = "UnsupportedModelFormatError";
  }
}

export class ModelComplexityError extends Error {
  public vertexCount: number;
  public triangleCount: number;
  constructor(message: string, vertexCount: number, triangleCount: number) {
    super(
      `[GLTFLoaderPipeline] Complexity Limit Exceeded: ${message} (${vertexCount.toLocaleString()} vertices, ${triangleCount.toLocaleString()} triangles)`,
    );
    this.name = "ModelComplexityError";
    this.vertexCount = vertexCount;
    this.triangleCount = triangleCount;
  }
}

export class NetworkModelError extends Error {
  constructor(message: string) {
    super(`[GLTFLoaderPipeline] Network Error: ${message}`);
    this.name = "NetworkModelError";
  }
}

// ============================================================================
// Pipeline Interfaces
// ============================================================================

export interface ModelLoadingOptions {
  /** Target bounding dimension in meters (default: 1.5m) */
  targetMaxDimension?: number;
  /** If true, skips dimension normalization (default: false) */
  preserveScale?: boolean;
  /** If true, aligns bottom of model flush to y = 0.0 (default: true) */
  groundFlush?: boolean;
  /** If true, centers horizontal coordinates so center (x, z) = (0, 0) (default: true) */
  centerXZ?: boolean;
  /** If true, enables DoubleSide and standardizes materials (default: true) */
  sanitizeMaterials?: boolean;
  /** If true, assigns castShadow and receiveShadow on all meshes (default: true) */
  enableShadows?: boolean;
  /** Disable embedded lights from user model to protect room lighting (default: true) */
  stripEmbeddedLights?: boolean;
  /** Catalog ID to tag into container userData (default: 'custom_model') */
  catalogId?: string;
  /** Optional name for the container object */
  modelName?: string;
  /** Maximum allowable vertex count before rejecting (default: 1,000,000) */
  maxVertices?: number;
  /** Maximum allowable triangle count before rejecting (default: 1,500,000) */
  maxTriangles?: number;
  /** Optional Draco decoder WASM path */
  dracoDecoderPath?: string;
  /** Network timeout in milliseconds (default: 30,000ms) */
  timeoutMs?: number;
}

export interface ModelAuditMetrics {
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  materialCount: number;
  originalDimensions: [number, number, number];
  normalizedDimensions: [number, number, number];
  scaleFactor: number;
  hasAnimations: boolean;
  animationCount: number;
}

// Default constants
export const DEFAULT_MAX_DIMENSION = 1.5;
export const DEFAULT_MAX_VERTICES = 1_000_000;
export const DEFAULT_MAX_TRIANGLES = 1_500_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_INLINE_BASE64_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * Shared loader factory
 */
let sharedGLTFLoader: GLTFLoader | null = null;
let sharedDRACOLoader: DRACOLoader | null = null;

export function getGLTFLoader(dracoPath?: string): GLTFLoader {
  if (!sharedGLTFLoader) {
    sharedGLTFLoader = new GLTFLoader();
    if (dracoPath || (typeof window !== "undefined" && typeof document !== "undefined")) {
      try {
        sharedDRACOLoader = new DRACOLoader();
        sharedDRACOLoader.setDecoderPath(
          dracoPath || "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
        );
        sharedGLTFLoader.setDRACOLoader(sharedDRACOLoader);
      } catch {
        // Fallback gracefully in headless/test environments
      }
    }
  }
  return sharedGLTFLoader;
}

// ============================================================================
// Core Ingestion Functions
// ============================================================================

/**
 * Ingests a GLB/GLTF model from an in-memory ArrayBuffer.
 */
export async function loadGLBFromBuffer(
  arrayBuffer: ArrayBuffer,
  options: ModelLoadingOptions = {},
): Promise<THREE.Group> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new CorruptModelError("ArrayBuffer is empty (0 bytes)");
  }

  // Pre-validate GLB magic header if binary
  if (arrayBuffer.byteLength >= 4) {
    const bytes = new Uint8Array(arrayBuffer, 0, 4);
    const isGLB = bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
    if (isGLB && arrayBuffer.byteLength < 12) {
      throw new CorruptModelError("GLB header is truncated (< 12 bytes)");
    }
  }

  const loader = getGLTFLoader(options.dracoDecoderPath);

  return new Promise<THREE.Group>((resolve, reject) => {
    try {
      loader.parse(
        arrayBuffer,
        "",
        (gltf: GLTF) => {
          try {
            const container = processLoadedScene(gltf, options);
            resolve(container);
          } catch (err) {
            if (gltf?.scene) disposeHierarchy(gltf.scene);
            reject(err);
          }
        },
        (error: any) => {
          const message = error?.message || String(error);
          if (message.includes("KHR_draco_mesh_compression")) {
            reject(new UnsupportedModelFormatError("Model requires Draco mesh compression decoder."));
          } else if (message.includes("version")) {
            reject(new UnsupportedModelFormatError(message));
          } else {
            reject(new CorruptModelError(message));
          }
        },
      );
    } catch (err: any) {
      reject(new CorruptModelError(err?.message || "Failed to parse GLTF buffer"));
    }
  });
}

/**
 * Ingests a GLTF/GLB model from a URL (cloud storage or remote resource).
 */
export async function loadGLTFFromUrl(
  url: string,
  options: ModelLoadingOptions = {},
): Promise<THREE.Group> {
  if (!url || !url.trim()) {
    throw new NetworkModelError("Model URL cannot be empty");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const loader = getGLTFLoader(options.dracoDecoderPath);

  return new Promise<THREE.Group>((resolve, reject) => {
    let hasFinished = false;

    const timer = setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        reject(new NetworkModelError(`Loading model timed out after ${timeoutMs}ms: ${url}`));
      }
    }, timeoutMs);

    loader.load(
      url,
      (gltf: GLTF) => {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);
        try {
          const container = processLoadedScene(gltf, options);
          resolve(container);
        } catch (err) {
          if (gltf?.scene) disposeHierarchy(gltf.scene);
          reject(err);
        }
      },
      undefined,
      (error: any) => {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);
        const msg = error?.message || "Failed to load model from network";
        reject(new NetworkModelError(`${msg} (${url})`));
      },
    );
  });
}

/**
 * Ingests a GLB model from a Base64-encoded string.
 */
export async function loadGLBFromBase64(
  base64: string,
  options: ModelLoadingOptions = {},
): Promise<THREE.Group> {
  if (!base64 || !base64.trim()) {
    throw new CorruptModelError("Base64 data string is empty");
  }
  const buffer = base64ToArrayBuffer(base64);
  return loadGLBFromBuffer(buffer, options);
}

/**
 * Ingests a GLB/GLTF model from a File or Blob.
 */
export async function loadGLBFromFile(
  file: File | Blob,
  options: ModelLoadingOptions = {},
): Promise<THREE.Group> {
  if (!file || file.size === 0) {
    throw new CorruptModelError("File is empty (0 bytes)");
  }
  const buffer = await file.arrayBuffer();
  return loadGLBFromBuffer(buffer, {
    ...options,
    modelName: (file as File).name || options.modelName,
  });
}

// ============================================================================
// Processing, Normalization & Sanitization
// ============================================================================

/**
 * Processes a parsed GLTF object: sanitizes materials, enforces complexity limits,
 * normalizes dimensions, centers horizontal pivot, and aligns bottom flush to y = 0.
 */
export function processLoadedScene(
  gltf: GLTF,
  options: ModelLoadingOptions = {},
): THREE.Group {
  const root = gltf.scene;
  if (!root) {
    throw new CorruptModelError("GLTF scene is missing or empty");
  }

  // 1. Audit Geometry & Enforce Security Complexity Limits
  const maxVerts = options.maxVertices ?? DEFAULT_MAX_VERTICES;
  const maxTris = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  const audit = auditGeometryComplexity(root);

  if (audit.vertexCount > maxVerts || audit.triangleCount > maxTris) {
    throw new ModelComplexityError(
      "Model exceeds maximum permitted complexity limits",
      audit.vertexCount,
      audit.triangleCount,
    );
  }

  // 2. Material Sanitization & Shadow Mapping Setup
  if (options.sanitizeMaterials !== false) {
    sanitizeMaterialsAndShadows(root, options.enableShadows !== false);
  }

  // 3. Disable embedded lights if requested to protect room illumination
  if (options.stripEmbeddedLights !== false) {
    root.traverse((child) => {
      if ((child as THREE.Light).isLight) {
        child.visible = false;
      }
    });
  }

  // 4. Initial World Bounding Box Calculation
  root.updateMatrixWorld(true);
  const initialBbox = new THREE.Box3().setFromObject(root);

  if (initialBbox.isEmpty()) {
    throw new CorruptModelError("Model contains no renderable geometry or bounding volume is empty");
  }

  const initialSize = initialBbox.getSize(new THREE.Vector3());
  if (
    !Number.isFinite(initialSize.x) ||
    !Number.isFinite(initialSize.y) ||
    !Number.isFinite(initialSize.z)
  ) {
    throw new CorruptModelError("Model bounding coordinates contain NaN or Infinity");
  }

  const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z);
  if (maxDim <= 1e-6) {
    throw new CorruptModelError("Model has zero or negative bounding dimensions");
  }

  // 5. Dimension Normalization (Target 1.5m)
  const targetMaxDim = options.targetMaxDimension ?? DEFAULT_MAX_DIMENSION;
  let scaleFactor = 1.0;

  if (!options.preserveScale && maxDim > 0) {
    scaleFactor = targetMaxDim / maxDim;
    root.scale.set(
      root.scale.x * scaleFactor,
      root.scale.y * scaleFactor,
      root.scale.z * scaleFactor,
    );
    root.updateMatrixWorld(true);
  }

  // 6. Centering & Ground Alignment Math
  const scaledBbox = new THREE.Box3().setFromObject(root);
  const scaledCenter = scaledBbox.getCenter(new THREE.Vector3());

  if (options.centerXZ !== false) {
    root.position.x -= scaledCenter.x;
    root.position.z -= scaledCenter.z;
  }

  if (options.groundFlush !== false) {
    // Offset root position so lowest vertex rests exactly at y = 0.0
    root.position.y -= scaledBbox.min.y;
  }

  root.updateMatrixWorld(true);

  // 7. Enclose in Outer Container Group
  const container = new THREE.Group();
  container.name = options.modelName || "CustomModelContainer";
  container.add(root);

  // 8. Tag Metadata
  const normalizedSize = initialSize.clone().multiplyScalar(scaleFactor);
  const metrics: ModelAuditMetrics = {
    vertexCount: audit.vertexCount,
    triangleCount: audit.triangleCount,
    meshCount: audit.meshCount,
    materialCount: audit.materialCount,
    originalDimensions: [initialSize.x, initialSize.y, initialSize.z],
    normalizedDimensions: [normalizedSize.x, normalizedSize.y, normalizedSize.z],
    scaleFactor,
    hasAnimations: Boolean(gltf.animations && gltf.animations.length > 0),
    animationCount: gltf.animations?.length || 0,
  };

  container.userData = {
    isRoomObject: true,
    catalogId: options.catalogId || "custom_model",
    type: "custom_model",
    metrics,
    animations: gltf.animations || [],
  };

  return container;
}

/**
 * Counts total vertices, triangles, and meshes across the scene hierarchy.
 */
export function auditGeometryComplexity(root: THREE.Object3D): {
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  materialCount: number;
} {
  let vertexCount = 0;
  let triangleCount = 0;
  let meshCount = 0;
  const uniqueMaterials = new Set<THREE.Material>();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshCount++;
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      if (geom) {
        const pos = geom.getAttribute("position");
        if (pos) {
          vertexCount += pos.count;
          if (geom.index) {
            triangleCount += geom.index.count / 3;
          } else {
            triangleCount += pos.count / 3;
          }
        }
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => uniqueMaterials.add(m));
        } else {
          uniqueMaterials.add(mesh.material);
        }
      }
    }
  });

  return {
    vertexCount,
    triangleCount: Math.round(triangleCount),
    meshCount,
    materialCount: uniqueMaterials.size,
  };
}

/**
 * Sanitizes mesh materials to DoubleSide, configures shadow casting/receiving,
 * and assigns fallbacks for missing materials.
 */
export function sanitizeMaterialsAndShadows(
  root: THREE.Object3D,
  enableShadows: boolean = true,
): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;

      if (enableShadows) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }

      if (!mesh.material) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0xd1d5db,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
      } else {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          mat.side = THREE.DoubleSide;

          if ("roughness" in mat && typeof (mat as any).roughness === "number") {
            (mat as any).roughness = Math.max(0, Math.min(1, (mat as any).roughness));
          }
          if ("metalness" in mat && typeof (mat as any).metalness === "number") {
            (mat as any).metalness = Math.max(0, Math.min(1, (mat as any).metalness));
          }

          if ("map" in mat && (mat as any).map) {
            (mat as any).map.colorSpace = THREE.SRGBColorSpace;
          }
          if ("emissiveMap" in mat && (mat as any).emissiveMap) {
            (mat as any).emissiveMap.colorSpace = THREE.SRGBColorSpace;
          }
        });
      }
    }
  });
}

/**
 * Recursively disposes of all geometries, materials, and textures in an Object3D hierarchy.
 */
export function disposeHierarchy(object: THREE.Object3D): void {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          for (const key of Object.keys(mat)) {
            const prop = (mat as any)[key];
            if (prop && typeof prop.dispose === "function") {
              prop.dispose();
            }
          }
          mat.dispose();
        });
      }
    }
  });
}

// ============================================================================
// Storage Utilities
// ============================================================================

/**
 * Converts ArrayBuffer to Base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts Base64 string back to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Packages a model file for storage according to the 1.5MB threshold rule.
 */
export async function packageModelForStorage(
  file: File | { name: string; buffer: ArrayBuffer },
  userId?: string,
): Promise<{ customProps: CustomProps; storageType: "inline_base64" | "bucket" }> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file.buffer;
  const fileName = file.name;

  if (buffer.byteLength <= MAX_INLINE_BASE64_BYTES) {
    const base64Str = arrayBufferToBase64(buffer);
    return {
      customProps: {
        glbDataBase64: `data:model/gltf-binary;base64,${base64Str}`,
      },
      storageType: "inline_base64",
    };
  }

  const path = `${userId || "public"}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { data, error } = await storage.from("room-models").upload(path, buffer, {
    contentType: "model/gltf-binary",
  });

  if (error || !data) {
    throw new Error(`Failed to upload large model to storage bucket: ${error?.message}`);
  }

  return {
    customProps: {
      modelStoragePath: data.path,
    },
    storageType: "bucket",
  };
}

/**
 * Resolves a RoomObject's 3D model into an instantiated THREE.Group.
 */
export async function loadModelFromRoomObject(
  roomObject: RoomObject,
  options: ModelLoadingOptions = {},
): Promise<THREE.Group> {
  const customProps = roomObject.customProps;
  if (!customProps) {
    throw new CorruptModelError(`RoomObject ${roomObject.id} has no customProps`);
  }

  if (customProps.glbDataBase64) {
    return loadGLBFromBase64(customProps.glbDataBase64, {
      ...options,
      modelName: roomObject.name,
      catalogId: roomObject.catalogId,
    });
  }

  if (customProps.modelStoragePath) {
    const { data: blob, error } = await storage
      .from("room-models")
      .download(customProps.modelStoragePath);

    if (error || !blob) {
      const { data: pubData } = storage
        .from("room-models")
        .getPublicUrl(customProps.modelStoragePath);

      if (pubData?.publicUrl) {
        return loadGLTFFromUrl(pubData.publicUrl, {
          ...options,
          modelName: roomObject.name,
          catalogId: roomObject.catalogId,
        });
      }
      throw new NetworkModelError(
        `Failed to download model from storage path ${customProps.modelStoragePath}: ${error?.message}`,
      );
    }

    const buffer = await blob.arrayBuffer();
    return loadGLBFromBuffer(buffer, {
      ...options,
      modelName: roomObject.name,
      catalogId: roomObject.catalogId,
    });
  }

  throw new CorruptModelError(
    `RoomObject ${roomObject.id} contains neither glbDataBase64 nor modelStoragePath`,
  );
}

// ============================================================================
// GLTFLoaderPipeline Class
// ============================================================================

export class GLTFLoaderPipeline {
  public static readonly MAX_ALLOWED_DIMENSION = DEFAULT_MAX_DIMENSION;

  /**
   * Validates GLB binary magic bytes header (0x67, 0x6c, 0x54, 0x46, "glTF") and length >= 12.
   */
  public static validateBinaryHeader(buffer: ArrayBuffer | Uint8Array): boolean {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 12) return false;
    return bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
  }

  /**
   * Validates JSON header structure for .gltf files.
   */
  public static validateJsonHeader(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      return Boolean(parsed && parsed.asset && typeof parsed.asset.version === "string");
    } catch {
      return false;
    }
  }

  /**
   * Normalizes model dimensions to maximum 1.5m and aligns bottom bounding box flush to y = 0.
   */
  public static normalizeModel(object: THREE.Object3D): {
    scaleFactor: number;
    originalBounds: THREE.Box3;
    normalizedBounds: THREE.Box3;
    pivotOffset: [number, number, number];
  } {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? this.MAX_ALLOWED_DIMENSION / maxDim : 1.0;

    object.scale.set(
      object.scale.x * scaleFactor,
      object.scale.y * scaleFactor,
      object.scale.z * scaleFactor,
    );
    object.updateMatrixWorld(true);

    // Recompute bounding box after scale
    const scaledBox = new THREE.Box3().setFromObject(object);
    const minY = scaledBox.min.y;
    object.position.y -= minY;
    object.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(object);

    return {
      scaleFactor,
      originalBounds: box,
      normalizedBounds: finalBox,
      pivotOffset: [0, -minY, 0],
    };
  }

  /**
   * Sanitizes all materials across a model hierarchy to MeshStandardMaterial.
   */
  public static sanitizeMaterials(object: THREE.Object3D): number {
    let sanitizedCount = 0;
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => {
            sanitizedCount++;
            return new THREE.MeshStandardMaterial({
              color: (m as any).color ?? 0xcccccc,
              roughness: (m as any).roughness ?? 0.6,
              metalness: (m as any).metalness ?? 0.1,
              side: THREE.DoubleSide,
            });
          });
        } else if (mesh.material) {
          sanitizedCount++;
          mesh.material = new THREE.MeshStandardMaterial({
            color: (mesh.material as any).color ?? 0xcccccc,
            roughness: (mesh.material as any).roughness ?? 0.6,
            metalness: (mesh.material as any).metalness ?? 0.1,
            side: THREE.DoubleSide,
          });
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return sanitizedCount;
  }

  // Static delegation methods for convenience
  public static loadGLBFromBuffer = loadGLBFromBuffer;
  public static loadGLTFFromUrl = loadGLTFFromUrl;
  public static loadGLBFromBase64 = loadGLBFromBase64;
  public static loadGLBFromFile = loadGLBFromFile;
  public static processLoadedScene = processLoadedScene;
  public static auditGeometryComplexity = auditGeometryComplexity;
  public static sanitizeMaterialsAndShadows = sanitizeMaterialsAndShadows;
  public static disposeHierarchy = disposeHierarchy;
  public static arrayBufferToBase64 = arrayBufferToBase64;
  public static base64ToArrayBuffer = base64ToArrayBuffer;
  public static packageModelForStorage = packageModelForStorage;
  public static loadModelFromRoomObject = loadModelFromRoomObject;
}
