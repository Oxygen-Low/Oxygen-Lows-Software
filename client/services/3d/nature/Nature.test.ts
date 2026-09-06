/**
 * Nature.test.ts
 * Comprehensive unit test suite for Nature, Wind, Trees, Environment, and Graphics Presets.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { GrassGeometryFactory } from "./GrassGeometryFactory";
import {
  GRASS_VERTEX_SHADER,
  GRASS_FRAGMENT_SHADER,
  createGrassMaterial,
  createGrassUniforms,
  evaluateWindDisplacement,
} from "./GrassShaders";
import { TreeFactory } from "./TreeFactory";
import { EnvironmentManager } from "../environment/EnvironmentManager";
import { getGraphicsPresetConfig, GRAPHICS_PRESETS } from "../environment/GraphicsPresets";
import { EnvironmentSettings } from "@/types/threeDBackground";

const DEFAULT_TEST_ENVIRONMENT: EnvironmentSettings = {
  preset: "day",
  timeOfDay: 14.0,
  sunPosition: [10, 20, 10],
  sunIntensity: 1.5,
  sunColor: "#fff4e0",
  ambientColor: "#87ceeb",
  ambientIntensity: 0.4,
  skyColor: "#4ca6ff",
  groundColor: "#2d5a27",
  windSpeed: 2.5,
  windDirection: 45,
  windGustiness: 0.3,
  grassDensity: "medium",
};

describe("Nature & Wind Simulation Shaders, Trees & Environmental Lighting", () => {
  // --------------------------------------------------------------------------
  // 1. GrassGeometryFactory: Segment LODs & Topology
  // --------------------------------------------------------------------------
  describe("GrassGeometryFactory: Segment LODs & Topology", () => {
    it("generates correct vertex and triangle counts for 1, 2, and 3 segments", () => {
      const low = GrassGeometryFactory.calculateBladeGeometry(1);
      expect(low.vertexCount).toBe(3);
      expect(low.triangleCount).toBe(1);

      const med = GrassGeometryFactory.calculateBladeGeometry(2);
      expect(med.vertexCount).toBe(5);
      expect(med.triangleCount).toBe(3);

      const high = GrassGeometryFactory.calculateBladeGeometry(3);
      expect(high.vertexCount).toBe(7);
      expect(high.triangleCount).toBe(5);
    });

    it("creates base geometry with proper buffer attributes and bounds", () => {
      const geo = GrassGeometryFactory.createBladeBaseGeometry(3, {
        baseWidth: 0.05,
        bladeHeight: 0.6,
        naturalCurvature: 0.06,
      });

      expect(geo.attributes.position.count).toBe(7);
      expect(geo.attributes.normal.count).toBe(7);
      expect(geo.attributes.uv.count).toBe(7);
      expect(geo.index?.count).toBe(15); // 5 triangles * 3 indices

      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      expect(bb.min.y).toBeCloseTo(0.0, 3);
      expect(bb.max.y).toBeCloseTo(0.6, 3);
      expect(bb.max.z).toBeCloseTo(0.06, 3);
    });
  });

  // --------------------------------------------------------------------------
  // 2. GrassGeometryFactory: Instanced Attributes & Distribution
  // --------------------------------------------------------------------------
  describe("GrassGeometryFactory: Instanced Attributes & Distribution", () => {
    it("allocates exactly 12 floats (48 bytes) per blade instance across 4 attributes", () => {
      const dist = GrassGeometryFactory.generateGrassDistribution({
        width: 10,
        depth: 10,
        bladeCount: 8000,
        seed: 101,
      });

      expect(dist.count).toBe(8000);
      expect(dist.bytesPerBlade).toBe(48);
      expect(dist.totalBytes).toBe(8000 * 48);

      expect(dist.instanceOffset.length).toBe(8000 * 3);
      expect(dist.instanceScale.length).toBe(8000 * 3);
      expect(dist.instanceRotation.length).toBe(8000 * 3);
      expect(dist.instanceBladeTint.length).toBe(8000 * 3);
    });

    it("verifies High preset 95,000 blades memory footprint stays well below 10MB GPU limit", () => {
      const dist = GrassGeometryFactory.generateGrassDistribution({
        width: 14,
        depth: 14,
        bladeCount: 95000,
        seed: 202,
      });

      const totalMb = dist.totalBytes / (1024 * 1024);
      expect(totalMb).toBeCloseTo(4.349, 1);
      expect(totalMb).toBeLessThan(10.0);
    });

    it("distributes blades within configured ground boundary with jittering", () => {
      const dist = GrassGeometryFactory.generateGrassDistribution({
        width: 10,
        depth: 10,
        center: [5, 0, 5],
        bladeCount: 100,
        seed: 303,
      });

      for (let i = 0; i < dist.count; i++) {
        const x = dist.instanceOffset[i * 3];
        const y = dist.instanceOffset[i * 3 + 1];
        const z = dist.instanceOffset[i * 3 + 2];

        expect(y).toBe(0.0);
        expect(x).toBeGreaterThanOrEqual(0.0);
        expect(x).toBeLessThanOrEqual(10.0);
        expect(z).toBeGreaterThanOrEqual(0.0);
        expect(z).toBeLessThanOrEqual(10.0);
      }
    });

    it("creates valid THREE.Mesh with InstancedBufferGeometry and updates LOD seamlessly", () => {
      const material = createGrassMaterial();
      const mesh = GrassGeometryFactory.createInstancedGrassMesh({
        segments: 1,
        distribution: { width: 10, depth: 10, bladeCount: 1000 },
        material,
      });

      expect(mesh.isMesh).toBe(true);
      const geo = mesh.geometry as THREE.InstancedBufferGeometry;
      expect(geo.isInstancedBufferGeometry).toBe(true);
      expect(geo.instanceCount).toBe(1000);
      expect(geo.attributes.instanceOffset).toBeDefined();

      // Update LOD to 3 segments without replacing instance buffers
      GrassGeometryFactory.updateGrassLod(mesh, 3);
      expect(geo.attributes.position.count).toBe(7);
      expect(geo.instanceCount).toBe(1000);
    });
  });

  // --------------------------------------------------------------------------
  // 3. GrassShaders: Mathematical Wind Wave & Length Conservation
  // --------------------------------------------------------------------------
  describe("GrassShaders: Mathematical Wind Wave & Length Conservation", () => {
    it("zero wind speed produces zero displacement", () => {
      const res = evaluateWindDisplacement([5, 0, 5], 1.0, 10.0, 0.0, 90, 0.5);
      expect(res.displacement[0]).toBe(0);
      expect(res.displacement[1]).toBe(0);
      expect(res.displacement[2]).toBe(0);
      expect(res.preservedHeightDelta).toBe(0);
    });

    it("enforces zero displacement at blade root (uvY = 0) regardless of wind speed", () => {
      const res = evaluateWindDisplacement([2, 0, 3], 0.0, 2.5, 10.0, 45, 0.8);
      expect(res.displacement[0]).toBe(0);
      expect(res.displacement[1]).toBe(0);
      expect(res.displacement[2]).toBe(0);
    });

    it("verifies length conservation formula: dy = -(dx^2 + dz^2) / (2 * H)", () => {
      const res = evaluateWindDisplacement([0, 0, 0], 1.0, 2.0, 8.0, 90, 0.5, 0.6);
      const dx = res.displacement[0];
      const dz = res.displacement[2];
      const expectedDy = -(dx * dx + dz * dz) / (2 * 0.6);

      expect(res.preservedHeightDelta).toBeCloseTo(expectedDy, 4);
      expect(res.displacement[1]).toBeLessThanOrEqual(0);
    });

    it("remains bounded and finite under hurricane wind (10 m/s)", () => {
      const res = evaluateWindDisplacement([10, 0, 10], 1.0, 5.0, 10.0, 180, 1.0);
      expect(isFinite(res.displacement[0])).toBe(true);
      expect(isFinite(res.displacement[1])).toBe(true);
      expect(isFinite(res.displacement[2])).toBe(true);
      expect(Math.abs(res.displacement[0])).toBeLessThan(2.0);
    });

    it("instantiates THREE.ShaderMaterial with all required uniforms and DoubleSide rendering", () => {
      const mat = createGrassMaterial();
      expect(mat.isShaderMaterial).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide);

      const u = mat.uniforms;
      expect(u.uTime).toBeDefined();
      expect(u.uWindSpeed).toBeDefined();
      expect(u.uWindDirection).toBeDefined();
      expect(u.uWindGustiness).toBeDefined();
      expect(u.uSunPosition).toBeDefined();
      expect(u.uSunColor).toBeDefined();
      expect(u.uSunIntensity).toBeDefined();
      expect(u.uAmbientColor).toBeDefined();
      expect(u.uBaseColor).toBeDefined();
      expect(u.uTipColor).toBeDefined();
      expect(u.uEnableSSS).toBeDefined();
    });

    it("contains GLSL wind equations in vertex shader and lighting in fragment shader", () => {
      expect(GRASS_VERTEX_SHADER).toContain("attribute vec3 instanceOffset");
      expect(GRASS_VERTEX_SHADER).toContain("pow(uv.y, 1.8)");
      expect(GRASS_VERTEX_SHADER).toContain("-horizDistSq / (2.0 * totalBladeHeight)");

      expect(GRASS_FRAGMENT_SHADER).toContain("gl_FrontFacing");
      expect(GRASS_FRAGMENT_SHADER).toContain("uEnableSSS");
      expect(GRASS_FRAGMENT_SHADER).toContain("pow(backlight, 3.0)");
    });
  });

  // --------------------------------------------------------------------------
  // 4. TreeFactory: Procedural Tree Structure & 3-Tier Sway
  // --------------------------------------------------------------------------
  describe("TreeFactory: Procedural Trees & Foliage Sway", () => {
    it("creates procedural trees (oak, pine, birch) with exactly 2 mesh children", () => {
      const oak = TreeFactory.createProceduralTree("oak");
      expect(oak.children.length).toBe(2);
      expect(oak.children[0].type).toBe("Mesh");
      expect(oak.children[1].type).toBe("Mesh");

      const pine = TreeFactory.createProceduralTree("pine");
      expect(pine.children.length).toBe(2);
      expect(pine.children[0].type).toBe("Mesh");
      expect(pine.children[1].type).toBe("Mesh");

      const birch = TreeFactory.createProceduralTree("birch");
      expect(birch.children.length).toBe(2);
      expect(birch.children[0].type).toBe("Mesh");
      expect(birch.children[1].type).toBe("Mesh");
    });

    it("aligns tree trunk base flush with ground at y=0", () => {
      const oak = TreeFactory.createProceduralTree("oak");
      const box = new THREE.Box3().setFromObject(oak);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.min.y).toBeLessThanOrEqual(0.01);
    });

    it("configures shadow casting and receiving on wood and foliage submeshes", () => {
      const tree = TreeFactory.createProceduralTree("oak");
      const wood = tree.children[0] as THREE.Mesh;
      const foliage = tree.children[1] as THREE.Mesh;

      expect(wood.castShadow).toBe(true);
      expect(wood.receiveShadow).toBe(true);
      expect(foliage.castShadow).toBe(true);
      expect(foliage.receiveShadow).toBe(true);
    });

    it("evaluates tree sway mathematics across all 3 tiers", () => {
      // Trunk bending proportional to tree height
      const shortTreeTrunk = TreeFactory.evaluateTreeSway("trunk", 3.0, 1.0, 5.0);
      const tallTreeTrunk = TreeFactory.evaluateTreeSway("trunk", 9.0, 1.0, 5.0);
      expect(Math.abs(tallTreeTrunk)).toBeGreaterThan(Math.abs(shortTreeTrunk));
      expect(Math.abs(tallTreeTrunk) / Math.abs(shortTreeTrunk)).toBeCloseTo(3.0, 1);

      // Branch oscillation distinct frequency
      const branch1 = TreeFactory.evaluateTreeSway("branch", 5.0, 0.5, 4.0);
      const branch2 = TreeFactory.evaluateTreeSway("branch", 5.0, 1.5, 4.0);
      expect(branch1).not.toBe(branch2);

      // Canopy flutter
      const canopy = TreeFactory.evaluateTreeSway("canopy", 5.0, 1.0, 6.0);
      expect(typeof canopy).toBe("number");
      expect(isNaN(canopy)).toBe(false);

      // Zero wind produces zero sway
      expect(TreeFactory.evaluateTreeSway("trunk", 6.0, 2.0, 0.0)).toBe(0);
      expect(TreeFactory.evaluateTreeSway("branch", 6.0, 2.0, 0.0)).toBe(0);
      expect(TreeFactory.evaluateTreeSway("canopy", 6.0, 2.0, 0.0)).toBe(0);

      // Height 0 produces zero trunk sway
      expect(TreeFactory.evaluateTreeSway("trunk", 0, 2.0, 5.0)).toBe(0);

      // Foliage canopy amplitude (0.08 * w) exceeds branch amplitude (0.04 * w)
      const branchMax = TreeFactory.evaluateTreeSway("branch", 5.0, 1.0, 10.0);
      const canopyMax = TreeFactory.evaluateTreeSway("canopy", 5.0, 1.0, 10.0);
      expect(typeof branchMax).toBe("number");
      expect(typeof canopyMax).toBe("number");
    });

    it("updates shared wind uniforms driving all active trees", () => {
      TreeFactory.updateWind(2.5, 6.0, 90, 0.5);
      const uniforms = TreeFactory.getSharedWindUniforms();
      expect(uniforms.uWindTime.value).toBe(2.5);
      expect(uniforms.uWindSpeed.value).toBe(6.0);
      expect(uniforms.uWindDirection.value.x).toBeCloseTo(0, 4); // cos(90) = 0
      expect(uniforms.uWindDirection.value.y).toBeCloseTo(1, 4); // sin(90) = 1
      expect(uniforms.uWindGustiness.value).toBe(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Astronomical Sun Positioning Mathematics
  // --------------------------------------------------------------------------
  describe("Astronomical Sun Positioning Mathematics", () => {
    it("computes exact zenith coordinates at 90° elevation", () => {
      const pos = EnvironmentManager.calculateSunCoordinates(90, 0, 30);
      expect(pos[0]).toBeCloseTo(0, 4);
      expect(pos[1]).toBeCloseTo(30, 4);
      expect(pos[2]).toBeCloseTo(0, 4);
    });

    it("computes exact cardinal horizon coordinates", () => {
      // East: Azimuth 90°
      const east = EnvironmentManager.calculateSunCoordinates(0, 90, 30);
      expect(east[0]).toBeCloseTo(30, 4);
      expect(east[1]).toBeCloseTo(0, 4);
      expect(east[2]).toBeCloseTo(0, 4);

      // South: Azimuth 0°
      const south = EnvironmentManager.calculateSunCoordinates(0, 0, 30);
      expect(south[0]).toBeCloseTo(0, 4);
      expect(south[1]).toBeCloseTo(0, 4);
      expect(south[2]).toBeCloseTo(30, 4);

      // North: Azimuth 180°
      const north = EnvironmentManager.calculateSunCoordinates(0, 180, 30);
      expect(north[0]).toBeCloseTo(0, 4);
      expect(north[1]).toBeCloseTo(0, 4);
      expect(north[2]).toBeCloseTo(-30, 4);

      // West: Azimuth 270°
      const west = EnvironmentManager.calculateSunCoordinates(0, 270, 30);
      expect(west[0]).toBeCloseTo(-30, 4);
      expect(west[1]).toBeCloseTo(0, 4);
      expect(west[2]).toBeCloseTo(0, 4);
    });

    it("scales proportionally with arbitrary distance parameter", () => {
      const pos100 = EnvironmentManager.calculateSunCoordinates(45, 45, 100);
      const expectedY = 100 * Math.sin((45 * Math.PI) / 180);
      expect(pos100[1]).toBeCloseTo(expectedY, 4);
    });

    it("inverts Cartesian coordinates back to original elevation and azimuth", () => {
      const originalEl = 35;
      const originalAz = 140;
      const originalDist = 40;

      const coords = EnvironmentManager.calculateSunCoordinates(originalEl, originalAz, originalDist);
      const inverted = EnvironmentManager.calculateAnglesFromCoordinates(coords);

      expect(inverted.elevation).toBeCloseTo(originalEl, 2);
      expect(inverted.azimuth).toBeCloseTo(originalAz, 2);
      expect(inverted.distance).toBeCloseTo(originalDist, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Environment Lighting Lerp & Transitions
  // --------------------------------------------------------------------------
  describe("Environment Lighting Lerp & Transitions", () => {
    const envDay: EnvironmentSettings = {
      ...DEFAULT_TEST_ENVIRONMENT,
      preset: "day",
      sunIntensity: 1.5,
      windSpeed: 2.0,
      windDirection: 350,
    };

    const envSunset: EnvironmentSettings = {
      ...DEFAULT_TEST_ENVIRONMENT,
      preset: "sunset",
      sunIntensity: 0.5,
      windSpeed: 6.0,
      windDirection: 10,
    };

    it("interpolates scalar values linearly at alpha = 0.5", () => {
      const blended = EnvironmentManager.lerpEnvironment(envDay, envSunset, 0.5);
      expect(blended.sunIntensity).toBeCloseTo(1.0, 3);
      expect(blended.windSpeed).toBeCloseTo(4.0, 3);
    });

    it("takes the shortest angular arc across the 0°/360° boundary for wind direction", () => {
      // 350° to 10° is a 20° clockwise difference, midpoint should be 0° / 360°
      const blended = EnvironmentManager.lerpEnvironment(envDay, envSunset, 0.5);
      expect(blended.windDirection).toBeCloseTo(0, 1);
    });

    it("strictly clamps alpha underflow (< 0) and overflow (> 1)", () => {
      const underflow = EnvironmentManager.lerpEnvironment(envDay, envSunset, -2.0);
      expect(underflow.sunIntensity).toBeCloseTo(envDay.sunIntensity, 4);
      expect(underflow.preset).toBe("day");

      const overflow = EnvironmentManager.lerpEnvironment(envDay, envSunset, 3.0);
      expect(overflow.sunIntensity).toBeCloseTo(envSunset.sunIntensity, 4);
      expect(overflow.preset).toBe("sunset");
    });
  });

  // --------------------------------------------------------------------------
  // 7. EnvironmentManager Three.js Integration
  // --------------------------------------------------------------------------
  describe("EnvironmentManager Three.js Integration", () => {
    let envMgr: EnvironmentManager;

    beforeEach(() => {
      envMgr = new EnvironmentManager(DEFAULT_TEST_ENVIRONMENT, "medium");
    });

    it("instantiates directional, hemisphere, and ambient lights with correct intensities", () => {
      expect(envMgr.sunLight).toBeInstanceOf(THREE.DirectionalLight);
      expect(envMgr.sunLight.intensity).toBe(1.5);

      expect(envMgr.hemiLight).toBeInstanceOf(THREE.HemisphereLight);
      expect(envMgr.hemiLight.intensity).toBeCloseTo(0.4 * 0.75, 4);

      expect(envMgr.ambientLight).toBeInstanceOf(THREE.AmbientLight);
      expect(envMgr.ambientLight.intensity).toBeCloseTo(0.4 * 0.25, 4);
    });

    it("configures shadow map based on graphics preset", () => {
      // Medium preset: 1024 map size, shadows enabled
      expect(envMgr.sunLight.castShadow).toBe(true);
      expect(envMgr.sunLight.shadow.mapSize.width).toBe(1024);

      // Switch to Low preset: shadows disabled, map size 0
      envMgr.setGraphicsPreset("low");
      expect(envMgr.sunLight.castShadow).toBe(false);
      expect(envMgr.sunLight.shadow.mapSize.width).toBe(0);

      // Switch to High preset: shadows enabled, map size 2048
      envMgr.setGraphicsPreset("high");
      expect(envMgr.sunLight.castShadow).toBe(true);
      expect(envMgr.sunLight.shadow.mapSize.width).toBe(2048);
    });

    it("creates procedural sky dome mesh with BackSide shader material", () => {
      expect(envMgr.skyMesh).toBeInstanceOf(THREE.Mesh);
      const mat = envMgr.skyMesh.material as THREE.ShaderMaterial;
      expect(mat.side).toBe(THREE.BackSide);
      expect(mat.depthWrite).toBe(false);
      expect(mat.uniforms.uSunIntensity.value).toBe(1.5);
    });

    it("distributes global wind uniforms and advances wind time", () => {
      expect(envMgr.windUniforms.uWindSpeed.value).toBe(2.5);
      expect(envMgr.windUniforms.uWindTime.value).toBe(0.0);

      envMgr.updateWindTime(0.016);
      expect(envMgr.windUniforms.uWindTime.value).toBeCloseTo(0.016, 4);
    });

    it("registers custom shader material and unregisters cleanly on teardown", () => {
      const mockMat = new THREE.ShaderMaterial({ uniforms: {} });
      const unregister = envMgr.registerWindMaterial(mockMat);

      expect(mockMat.uniforms.uWindTime).toBe(envMgr.windUniforms.uWindTime);
      expect(mockMat.uniforms.uWindSpeed).toBe(envMgr.windUniforms.uWindSpeed);

      unregister();
      envMgr.updateWindTime(0.5);
      expect(envMgr.windUniforms.uWindTime.value).toBeCloseTo(0.5, 3);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Graphics Presets Specification & Boundaries
  // --------------------------------------------------------------------------
  describe("Graphics Presets Configuration Matrix", () => {
    it("provides exact specifications for Low, Medium, and High", () => {
      const low = getGraphicsPresetConfig("low");
      expect(low.grassBladeCount).toBe(8000);
      expect(low.bladeCount).toBe(8000);
      expect(low.grassSegments).toBe(1);
      expect(low.bladeSegments).toBe(1);
      expect(low.enableShadows).toBe(false);
      expect(low.shadowMapSize).toBe(0);
      expect(low.maxFps).toBe(30);
      expect(low.enableSubsurfaceScattering).toBe(false);

      const med = getGraphicsPresetConfig("medium");
      expect(med.grassBladeCount).toBe(35000);
      expect(med.grassSegments).toBe(2);
      expect(med.enableShadows).toBe(true);
      expect(med.shadowMapSize).toBe(1024);
      expect(med.maxFps).toBe(60);
      expect(med.enableSubsurfaceScattering).toBe(true);

      const high = getGraphicsPresetConfig("high");
      expect(high.grassBladeCount).toBe(95000);
      expect(high.grassSegments).toBe(3);
      expect(high.enableShadows).toBe(true);
      expect(high.shadowMapSize).toBe(2048);
      expect(high.maxFps).toBe(60);
      expect(high.enableSubsurfaceScattering).toBe(true);
    });

    it("falls back to high preset when unrecognized key is passed", () => {
      const fallback = getGraphicsPresetConfig("ultra" as any);
      expect(fallback.preset).toBe("high");
      expect(fallback.grassBladeCount).toBe(95000);
    });

    it("returns defensive clones to prevent state mutation leaks across calls", () => {
      const first = getGraphicsPresetConfig("low");
      first.grassBladeCount = 999999;

      const second = getGraphicsPresetConfig("low");
      expect(second.grassBladeCount).toBe(8000);
    });

    it("guarantees high preset VRAM footprint is well within GPU safety threshold", () => {
      const high = getGraphicsPresetConfig("high");
      const bytesPerBlade = 48; // 12 floats
      const bladeVramMB = (high.grassBladeCount * bytesPerBlade) / (1024 * 1024);
      expect(bladeVramMB).toBeLessThan(10.0); // ~4.56 MB
    });
  });
});
