import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PosterFactory } from "./PosterFactory";
import { PosterFrameStyle } from "@/types/threeDBackground";

describe("PosterFactory: Dynamic Aspect Ratio & Framing Pipeline", () => {
  // --------------------------------------------------------------------------
  // 1. Aspect Ratio & Dimension Calculations
  // --------------------------------------------------------------------------
  describe("Aspect Ratio & Dimension Calculations", () => {
    it("computes standard 16:9 aspect ratio dimensions correctly", () => {
      const dims = PosterFactory.calculateDimensions(1920, 1080, 1.2);
      expect(dims.aspectRatio).toBeCloseTo(16 / 9, 4);
      expect(dims.width).toBe(1.2);
      expect(dims.height).toBeCloseTo(1.2 / (16 / 9), 4);
      expect(dims.artWidth).toBe(1.2);
      expect(dims.artHeight).toBeCloseTo(1.2 / (16 / 9), 4);
    });

    it("computes portrait 9:16 aspect ratio dimensions correctly", () => {
      const dims = PosterFactory.calculateDimensions(1080, 1920, 1.2);
      expect(dims.aspectRatio).toBeCloseTo(9 / 16, 4);
      expect(dims.width).toBe(1.2);
      expect(dims.height).toBeCloseTo(1.2 / (9 / 16), 4);
    });

    it("computes square 1:1 aspect ratio dimensions correctly", () => {
      const dims = PosterFactory.calculateDimensions(1000, 1000, 1.0);
      expect(dims.aspectRatio).toBe(1.0);
      expect(dims.width).toBe(1.0);
      expect(dims.height).toBe(1.0);
    });

    it("defaults to 1.0m base height when targetDimension is omitted", () => {
      const dims = PosterFactory.calculateDimensions(1600, 1200);
      expect(dims.aspectRatio).toBeCloseTo(4 / 3, 4);
      expect(dims.artHeight).toBe(1.0);
      expect(dims.artWidth).toBeCloseTo(4 / 3, 4);
    });

    it("computes mat board and outer molding dimensions accurately", () => {
      const dims = PosterFactory.calculateDimensions(1000, 1000, 1.0);
      // M = 0.08m, T = 0.04m -> total added = 2 * (0.08 + 0.04) = 0.24m
      expect(dims.matMargin).toBe(0.08);
      expect(dims.frameThickness).toBe(0.04);
      expect(dims.frameDepth).toBe(0.03);
      expect(dims.totalWidth).toBeCloseTo(1.24, 4);
      expect(dims.totalHeight).toBeCloseTo(1.24, 4);
    });

    it("handles panoramic 32:9 image boundary", () => {
      const dims = PosterFactory.calculateDimensions(6400, 1800, 1.2);
      expect(dims.aspectRatio).toBeCloseTo(32 / 9, 3);
      expect(dims.height).toBeCloseTo(1.2 / (32 / 9), 3);
    });

    it("handles ultra-tall 1:10 banner boundary", () => {
      const dims = PosterFactory.calculateDimensions(100, 1000, 1.0);
      expect(dims.aspectRatio).toBeCloseTo(0.1, 3);
      expect(dims.height).toBeCloseTo(10.0, 2);
    });

    it("throws error for non-positive or non-finite pixel dimensions", () => {
      expect(() => PosterFactory.calculateDimensions(0, 100)).toThrow(
        "Invalid image dimensions: naturalWidth and naturalHeight must be positive",
      );
      expect(() => PosterFactory.calculateDimensions(100, 0)).toThrow(
        "Invalid image dimensions: naturalWidth and naturalHeight must be positive",
      );
      expect(() => PosterFactory.calculateDimensions(-10, -10)).toThrow(
        "Invalid image dimensions: naturalWidth and naturalHeight must be positive",
      );
      expect(() => PosterFactory.calculateDimensions(NaN, 100)).toThrow(
        "Invalid image dimensions: naturalWidth and naturalHeight must be positive",
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Framing Styles & Mesh Generation
  // --------------------------------------------------------------------------
  describe("Framing Styles & Compound Mesh Generation", () => {
    it("generates frame borders for all supported bordered framing styles", () => {
      const borderedStyles: PosterFrameStyle[] = [
        "modern_black",
        "oak_wood",
        "brushed_gold",
        "white_minimal",
      ];
      for (const style of borderedStyles) {
        const poster = PosterFactory.createPosterFrame({ frameStyle: style, aspectRatio: 1.0 });
        const border = poster.children.find((c) => c.name === "frame-border");
        expect(border).toBeDefined();

        const mat = (border as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(mat.isMeshStandardMaterial).toBe(true);
        expect(mat.color.getHex()).toBe(PosterFactory.FRAME_STYLES[style].color);

        const matBoard = poster.children.find((c) => c.name === "poster-mat");
        expect(matBoard).toBeDefined();

        const glass = poster.children.find((c) => c.name === "poster-glass");
        expect(glass).toBeDefined();
        const glassMat = (glass as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
        expect(glassMat.isMeshPhysicalMaterial).toBe(true);
        expect(glassMat.transmission).toBeCloseTo(0.95, 2);
      }
    });

    it("omits frame border and glass for frameless style", () => {
      const framelessPoster = PosterFactory.createPosterFrame({
        frameStyle: "frameless",
        aspectRatio: 1.0,
      });
      const border = framelessPoster.children.find((c) => c.name === "frame-border");
      expect(border).toBeUndefined();

      const glass = framelessPoster.children.find((c) => c.name === "poster-glass");
      expect(glass).toBeUndefined();

      const canvas = framelessPoster.children.find((c) => c.name === "poster-canvas");
      expect(canvas).toBeDefined();
    });

    it("positions poster canvas slightly forward of frame backing to prevent z-fighting (> 0.02m)", () => {
      const poster = PosterFactory.createPosterFrame({
        frameStyle: "modern_black",
        aspectRatio: 1.0,
      });
      const canvas = poster.children.find((c) => c.name === "poster-canvas")!;
      expect(canvas.position.z).toBeGreaterThan(0.02);
    });

    it("applies custom colorTint to canvas material", () => {
      const poster = PosterFactory.createPosterFrame({
        colorTint: "#2D5A27",
        aspectRatio: 1.33,
      });
      const canvas = poster.children.find((c) => c.name === "poster-canvas") as THREE.Mesh;
      const mat = canvas.material as THREE.MeshStandardMaterial;
      expect(mat.color.getHexString()).toBe("2d5a27");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Wall Surface Normal Snapping & Placement
  // --------------------------------------------------------------------------
  describe("Wall Normal Snapping & Placement Math", () => {
    it("snaps poster orientation to +X facing wall normal", () => {
      const normalX = new THREE.Vector3(1, 0, 0);
      const rotX = PosterFactory.snapToWallNormal(normalX);
      expect(rotX[1]).toBeCloseTo(Math.PI / 2, 2);
    });

    it("snaps poster orientation to -Z facing wall normal", () => {
      const normalZ = new THREE.Vector3(0, 0, -1);
      const rotZ = PosterFactory.snapToWallNormal(normalZ);
      expect(Math.abs(rotZ[1])).toBeCloseTo(Math.PI, 2);
    });

    it("snaps poster orientation to 45° oblique wall surface normal", () => {
      const normal45 = new THREE.Vector3(1, 0, 1).normalize();
      const rot45 = PosterFactory.snapToWallNormal(normal45);
      expect(rot45[1]).toBeCloseTo(Math.PI / 4, 2);
    });

    it("calculates wall placement with +0.02m anti-z-fighting clearance along normal", () => {
      const hitPoint = new THREE.Vector3(0, 1.5, -3.0);
      const wallNormal = new THREE.Vector3(0, 0, 1);
      const placement = PosterFactory.calculateWallPlacement(hitPoint, wallNormal);

      // Hit point was Z = -3.0, normal is +Z, so shifted point must be Z = -3.0 + 0.02 = -2.98
      expect(placement.position.x).toBeCloseTo(0, 4);
      expect(placement.position.y).toBeCloseTo(1.5, 4);
      expect(placement.position.z).toBeCloseTo(-2.98, 4);
      expect(placement.euler[1]).toBeCloseTo(0, 4);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Placeholder Texture & Resource Disposal
  // --------------------------------------------------------------------------
  describe("Placeholder Texture & Disposal", () => {
    it("creates placeholder texture with sRGB color space", () => {
      const texture = PosterFactory.createPlaceholderTexture("#3B82F6", 1.5);
      expect(texture).toBeDefined();
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      texture.dispose();
    });

    it("disposes poster meshes, geometries, and materials cleanly", () => {
      const poster = PosterFactory.createPosterFrame({
        frameStyle: "oak_wood",
        aspectRatio: 1.2,
      });
      expect(() => PosterFactory.disposePoster(poster)).not.toThrow();
      expect(poster.children.length).toBe(0);
    });
  });
});
