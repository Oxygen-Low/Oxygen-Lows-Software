import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  GLTFLoaderPipeline,
  loadGLBFromBuffer,
  loadGLTFFromUrl,
  loadGLBFromBase64,
  processLoadedScene,
  auditGeometryComplexity,
  sanitizeMaterialsAndShadows,
  disposeHierarchy,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  packageModelForStorage,
  CorruptModelError,
  ModelComplexityError,
  NetworkModelError,
  MAX_INLINE_BASE64_BYTES,
} from "./GLTFLoaderPipeline";

function createMockGLTF(options?: {
  width?: number;
  height?: number;
  depth?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}): any {
  const w = options?.width ?? 1.0;
  const h = options?.height ?? 2.0;
  const d = options?.depth ?? 3.0;

  const geom = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.set(
    options?.offsetX ?? 10.0,
    options?.offsetY ?? -5.0,
    options?.offsetZ ?? 20.0,
  );

  const scene = new THREE.Group();
  scene.add(mesh);

  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
  };
}

describe("GLTFLoaderPipeline Suite", () => {
  // --------------------------------------------------------------------------
  // 1. Binary & JSON Header Validation
  // --------------------------------------------------------------------------
  describe("Binary & JSON Header Validation", () => {
    it("validates GLB binary magic bytes header correctly", () => {
      // Magic bytes: 0x67 0x6c 0x54 0x46 ("glTF") with 12-byte header
      const validGlb = new Uint8Array([
        0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00,
      ]);
      const invalidGlb = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      expect(GLTFLoaderPipeline.validateBinaryHeader(validGlb)).toBe(true);
      expect(GLTFLoaderPipeline.validateBinaryHeader(invalidGlb)).toBe(false);
    });

    it("rejects zero-byte empty buffer as invalid GLB", () => {
      const empty = new Uint8Array(0);
      expect(GLTFLoaderPipeline.validateBinaryHeader(empty)).toBe(false);
    });

    it("rejects truncated buffer with magic bytes but missing length (< 12 bytes)", () => {
      const truncated = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x01]);
      expect(GLTFLoaderPipeline.validateBinaryHeader(truncated)).toBe(false);
    });

    it("validates JSON header structure for .gltf files", () => {
      const validGltf = JSON.stringify({
        asset: { version: "2.0", generator: "Blender" },
        scenes: [],
      });
      const invalidGltf = JSON.stringify({ description: "not a gltf" });

      expect(GLTFLoaderPipeline.validateJsonHeader(validGltf)).toBe(true);
      expect(GLTFLoaderPipeline.validateJsonHeader(invalidGltf)).toBe(false);
      expect(GLTFLoaderPipeline.validateJsonHeader("corrupted json{")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Model Normalization & Pivot Centering
  // --------------------------------------------------------------------------
  describe("Normalization & Pivot Centering", () => {
    it("normalizes oversized 3D models to maximum 1.5m dimension", () => {
      const oversizedMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 2));
      const group = new THREE.Group();
      group.add(oversizedMesh);

      const result = GLTFLoaderPipeline.normalizeModel(group);
      expect(result.scaleFactor).toBeCloseTo(1.5 / 10, 3);

      const size = new THREE.Vector3();
      result.normalizedBounds.getSize(size);
      expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.5, 2);
    });

    it("aligns normalized model pivot so bottom bounding box rests flush at y = 0", () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
      mesh.position.set(0, 10, 0); // elevated
      const group = new THREE.Group();
      group.add(mesh);

      const result = GLTFLoaderPipeline.normalizeModel(group);
      expect(result.normalizedBounds.min.y).toBeCloseTo(0, 2);
    });

    it("normalizes massive 100-meter skyscraper down to 1.5m", () => {
      const skyscraper = new THREE.Mesh(new THREE.BoxGeometry(20, 100, 20));
      const group = new THREE.Group();
      group.add(skyscraper);

      const res = GLTFLoaderPipeline.normalizeModel(group);
      expect(res.scaleFactor).toBeCloseTo(1.5 / 100, 4);

      const size = new THREE.Vector3();
      res.normalizedBounds.getSize(size);
      expect(size.y).toBeCloseTo(1.5, 2);
    });

    it("normalizes microscopic 0.001m pebble up to 1.5m", () => {
      const pebble = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001));
      const group = new THREE.Group();
      group.add(pebble);

      const res = GLTFLoaderPipeline.normalizeModel(group);
      expect(res.scaleFactor).toBeCloseTo(1500, 1);

      const size = new THREE.Vector3();
      res.normalizedBounds.getSize(size);
      expect(size.x).toBeCloseTo(1.5, 2);
    });

    it("centers pivot correctly across deeply nested hierarchy", () => {
      const root = new THREE.Group();
      let parent: THREE.Group = root;
      for (let i = 0; i < 5; i++) {
        const next = new THREE.Group();
        next.position.set(0, 1, 0);
        parent.add(next);
        parent = next;
      }
      parent.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

      const res = GLTFLoaderPipeline.normalizeModel(root);
      expect(res.normalizedBounds.min.y).toBeCloseTo(0, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Material Sanitization & Shadows
  // --------------------------------------------------------------------------
  describe("Material Sanitization & Shadows", () => {
    it("sanitizes complex model materials to MeshStandardMaterial with DoubleSide", () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      );
      group.add(mesh);

      const sanitizedCount = GLTFLoaderPipeline.sanitizeMaterials(group);
      expect(sanitizedCount).toBe(1);

      const mat = mesh.material as unknown as THREE.MeshStandardMaterial;
      expect(mat.isMeshStandardMaterial).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    });

    it("handles multi-material arrays during sanitization", () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        new THREE.MeshLambertMaterial({ color: 0x00ff00 }),
      ]);
      group.add(mesh);

      const count = GLTFLoaderPipeline.sanitizeMaterials(group);
      expect(count).toBe(2);
      expect(Array.isArray(mesh.material)).toBe(true);
      const mats = mesh.material as unknown as THREE.MeshStandardMaterial[];
      expect(mats[0].isMeshStandardMaterial).toBe(true);
      expect(mats[1].isMeshStandardMaterial).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Scene Processing & Complexity Auditing
  // --------------------------------------------------------------------------
  describe("Scene Processing & Complexity Auditing", () => {
    it("processes mock scene into normalized container group with metadata", () => {
      const mockGltf = createMockGLTF({ width: 4.0, height: 2.0, depth: 1.0 });
      const container = processLoadedScene(mockGltf, {
        targetMaxDimension: 1.5,
        modelName: "TestModel",
      });

      expect(container).toBeDefined();
      expect(container.name).toBe("TestModel");
      expect(container.userData.isRoomObject).toBe(true);
      expect(container.userData.catalogId).toBe("custom_model");
      expect(container.userData.metrics).toBeDefined();
      expect(container.userData.metrics.scaleFactor).toBeCloseTo(1.5 / 4.0, 3);

      container.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(container);
      expect(box.min.y).toBeCloseTo(0, 2);
    });

    it("audits geometry complexity accurately", () => {
      const root = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      );
      root.add(box);

      const audit = auditGeometryComplexity(root);
      expect(audit.meshCount).toBe(1);
      expect(audit.materialCount).toBe(1);
      expect(audit.vertexCount).toBe(24);
      expect(audit.triangleCount).toBe(12);
    });

    it("enforces maximum complexity limits and throws ModelComplexityError", () => {
      const mockGltf = createMockGLTF();
      // Enforce max 10 vertices
      expect(() =>
        processLoadedScene(mockGltf, { maxVertices: 10 }),
      ).toThrowError(ModelComplexityError);
    });

    it("rejects empty scene without renderable geometry with CorruptModelError", () => {
      const emptyGltf: any = {
        scene: new THREE.Group(),
        scenes: [],
        animations: [],
      };
      expect(() => processLoadedScene(emptyGltf)).toThrowError(CorruptModelError);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Buffer & Storage Utilities
  // --------------------------------------------------------------------------
  describe("Buffer & Storage Utilities", () => {
    it("round-trips ArrayBuffer to Base64 and back accurately", () => {
      const originalBytes = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 64]);
      const base64 = arrayBufferToBase64(originalBytes.buffer);
      const restoredBuffer = base64ToArrayBuffer(base64);
      const restoredBytes = new Uint8Array(restoredBuffer);

      expect(restoredBytes).toEqual(originalBytes);
    });

    it("packages small model (<= 1.5MB) as inline base64", async () => {
      const smallBuffer = new Uint8Array(1024).buffer; // 1 KB
      const res = await packageModelForStorage({
        name: "test.glb",
        buffer: smallBuffer,
      });

      expect(res.storageType).toBe("inline_base64");
      expect(res.customProps.glbDataBase64).toMatch(/^data:model\/gltf-binary;base64,/);
    });

    it("rejects empty ArrayBuffer with CorruptModelError", async () => {
      const emptyBuffer = new ArrayBuffer(0);
      await expect(loadGLBFromBuffer(emptyBuffer)).rejects.toThrowError(CorruptModelError);
    });

    it("rejects empty Base64 string with CorruptModelError", async () => {
      await expect(loadGLBFromBase64("")).rejects.toThrowError(CorruptModelError);
    });

    it("rejects empty URL with NetworkModelError", async () => {
      await expect(loadGLTFFromUrl("")).rejects.toThrowError(NetworkModelError);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Resource Disposal
  // --------------------------------------------------------------------------
  describe("Resource Disposal", () => {
    it("disposes hierarchy cleanly without throwing", () => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      );
      group.add(mesh);

      expect(() => disposeHierarchy(group)).not.toThrow();
    });
  });
});
