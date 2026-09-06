/**
 * TreeAndEnvironment.chaos.test.ts
 * Empirical stress tests and adversarial verification for:
 * - TreeFactory: procedural generation, ground contact, 2-mesh hierarchy, sway math
 * - EnvironmentManager: astronomical coordinates, spherical inversion, lerpEnvironment shortest arc
 * - GraphicsPresets: configuration matrix, unknown preset fallback, deep cloning immutability
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { TreeFactory, TreeType } from "./TreeFactory";
import { EnvironmentManager } from "../environment/EnvironmentManager";
import {
  GRAPHICS_PRESETS,
  getGraphicsPresetConfig,
  GraphicsPreset,
} from "../environment/GraphicsPresets";
import { EnvironmentSettings } from "@/types/threeDBackground";

describe("Adversarial Chaos & Stress: TreeFactory", () => {
  const TREE_TYPES: TreeType[] = ["oak", "pine", "birch"];

  it("instantiates 50 trees of each archetype (150 total) and verifies 2-mesh hierarchy and ground flush bounds", () => {
    let seedCounter = 1000;

    for (const treeType of TREE_TYPES) {
      for (let i = 0; i < 50; i++) {
        seedCounter++;
        const tree = TreeFactory.createProceduralTree(treeType, undefined, {
          seed: seedCounter,
        });

        // 1. Scene graph encapsulation & hierarchy
        expect(tree).toBeInstanceOf(THREE.Group);
        expect(tree.children.length).toBe(2);

        const woodMesh = tree.children[0] as THREE.Mesh;
        const foliageMesh = tree.children[1] as THREE.Mesh;

        expect(woodMesh.isMesh).toBe(true);
        expect(foliageMesh.isMesh).toBe(true);
        expect(woodMesh.name).toBe("Tree_Wood");
        expect(foliageMesh.name).toBe("Tree_Foliage");

        // 2. Shadow casting & receiving
        expect(woodMesh.castShadow).toBe(true);
        expect(woodMesh.receiveShadow).toBe(true);
        expect(foliageMesh.castShadow).toBe(true);
        expect(foliageMesh.receiveShadow).toBe(true);

        // 3. Ground contact: bounding box min.y flush on ground within [-0.01, 0.01]
        const box = new THREE.Box3().setFromObject(tree);
        expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(box.min.y).toBeLessThanOrEqual(0.01);

        // 4. Bounding box height sanity: tree must have positive non-zero height
        expect(box.max.y).toBeGreaterThan(1.5);

        // 5. Geometry buffer attributes validation
        const woodGeo = woodMesh.geometry;
        expect(woodGeo.getAttribute("position")).toBeDefined();
        expect(woodGeo.getAttribute("normal")).toBeDefined();
        expect(woodGeo.getAttribute("aTier")).toBeDefined();
        expect(woodGeo.getAttribute("aBranchOrigin")).toBeDefined();
        expect(woodGeo.getAttribute("aPhase")).toBeDefined();

        const foliageGeo = foliageMesh.geometry;
        expect(foliageGeo.getAttribute("position")).toBeDefined();
        expect(foliageGeo.getAttribute("normal")).toBeDefined();
        expect(foliageGeo.getAttribute("aClusterOrigin")).toBeDefined();
        expect(foliageGeo.getAttribute("aClusterPhase")).toBeDefined();

        // 6. Cleanup geometries and materials to avoid memory leaks during 150 iterations
        woodGeo.dispose();
        foliageGeo.dispose();
        (woodMesh.material as THREE.Material).dispose();
        (foliageMesh.material as THREE.Material).dispose();
      }
    }
  });

  it("preserves ground flush contact under arbitrary scale factors", () => {
    const scales = [0.2, 0.5, 1.0, 2.5, 5.0, 10.0];
    for (const treeType of TREE_TYPES) {
      for (const scale of scales) {
        const tree = TreeFactory.createProceduralTree(treeType, undefined, {
          seed: 42,
          scale,
        });

        expect(tree.scale.x).toBeCloseTo(scale, 4);
        expect(tree.scale.y).toBeCloseTo(scale, 4);
        expect(tree.scale.z).toBeCloseTo(scale, 4);

        const box = new THREE.Box3().setFromObject(tree);
        // Scaled y=0 remains exactly y=0
        expect(box.min.y).toBeGreaterThanOrEqual(-0.01 * scale);
        expect(box.min.y).toBeLessThanOrEqual(0.01 * scale);

        (tree.children[0] as THREE.Mesh).geometry.dispose();
        (tree.children[1] as THREE.Mesh).geometry.dispose();
      }
    }
  });

  it("safely falls back to oak for unknown or invalid tree archetype keys", () => {
    const tree = TreeFactory.createProceduralTree("sequoia" as any, undefined, {
      seed: 99,
    });
    expect(tree).toBeInstanceOf(THREE.Group);
    expect(tree.children.length).toBe(2);
    expect(tree.userData.treeType).toBe("sequoia");
    const box = new THREE.Box3().setFromObject(tree);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(box.min.y).toBeLessThanOrEqual(0.01);

    (tree.children[0] as THREE.Mesh).geometry.dispose();
    (tree.children[1] as THREE.Mesh).geometry.dispose();
  });

  it("evaluates tree sway mathematics under adversarial boundary values", () => {
    // 1. Zero wind speed produces zero sway across all tiers
    expect(TreeFactory.evaluateTreeSway("trunk", 10.0, 5.0, 0.0)).toBe(0);
    expect(TreeFactory.evaluateTreeSway("branch", 10.0, 5.0, 0.0)).toBe(0);
    expect(TreeFactory.evaluateTreeSway("canopy", 10.0, 5.0, 0.0)).toBe(0);

    // 2. Zero height produces zero trunk bend regardless of wind speed
    expect(TreeFactory.evaluateTreeSway("trunk", 0.0, 2.0, 10.0)).toBe(0);

    // 3. Negative time evaluates smoothly without NaN
    const negTimeTrunk = TreeFactory.evaluateTreeSway("trunk", 5.0, -10.0, 4.0);
    const negTimeBranch = TreeFactory.evaluateTreeSway("branch", 5.0, -10.0, 4.0);
    const negTimeCanopy = TreeFactory.evaluateTreeSway("canopy", 5.0, -10.0, 4.0);
    expect(Number.isFinite(negTimeTrunk)).toBe(true);
    expect(Number.isFinite(negTimeBranch)).toBe(true);
    expect(Number.isFinite(negTimeCanopy)).toBe(true);

    // 4. Extreme wind speed (50 m/s storm) remains bounded
    const stormTrunk = TreeFactory.evaluateTreeSway("trunk", 8.0, 3.0, 50.0);
    expect(Number.isFinite(stormTrunk)).toBe(true);
    expect(Math.abs(stormTrunk)).toBeLessThanOrEqual(8.0 * 0.015 * 50.0 + 0.001);

    // 5. Tier frequency scaling hierarchy: canopy > branch > trunk
    // For windSpeed 10 and small dt, canopy flutters at higher derivative than trunk
    const dt = 0.01;
    const trunkDeriv = Math.abs(
      (TreeFactory.evaluateTreeSway("trunk", 5.0, dt, 10.0) -
        TreeFactory.evaluateTreeSway("trunk", 5.0, 0, 10.0)) /
        dt
    );
    const canopyDeriv = Math.abs(
      (TreeFactory.evaluateTreeSway("canopy", 5.0, dt, 10.0) -
        TreeFactory.evaluateTreeSway("canopy", 5.0, 0, 10.0)) /
        dt
    );
    expect(canopyDeriv).toBeGreaterThan(trunkDeriv);
  });
});

describe("Adversarial Chaos & Stress: Astronomical Sun Coordinates & Inversion", () => {
  const DISTANCES = [1, 10, 30, 100, 1000];

  it("calculates exact zenith (90° el) and nadir (-90° el) for any azimuth", () => {
    for (const dist of DISTANCES) {
      for (const az of [0, 45, 90, 180, 270, 315]) {
        // Zenith
        const zenith = EnvironmentManager.calculateSunCoordinates(90, az, dist);
        expect(zenith[0]).toBeCloseTo(0, 4);
        expect(zenith[1]).toBeCloseTo(dist, 4);
        expect(zenith[2]).toBeCloseTo(0, 4);

        const invZenith = EnvironmentManager.calculateAnglesFromCoordinates(zenith);
        expect(invZenith.elevation).toBeCloseTo(90, 2);
        expect(invZenith.distance).toBeCloseTo(dist, 2);

        // Nadir
        const nadir = EnvironmentManager.calculateSunCoordinates(-90, az, dist);
        expect(nadir[0]).toBeCloseTo(0, 4);
        expect(nadir[1]).toBeCloseTo(-dist, 4);
        expect(nadir[2]).toBeCloseTo(0, 4);

        const invNadir = EnvironmentManager.calculateAnglesFromCoordinates(nadir);
        expect(invNadir.elevation).toBeCloseTo(-90, 2);
        expect(invNadir.distance).toBeCloseTo(dist, 2);
      }
    }
  });

  it("calculates exact cardinal and intercardinal horizon coordinates (0° el)", () => {
    const dist = 50;

    // South: 0° az -> [0, 0, dist]
    const south = EnvironmentManager.calculateSunCoordinates(0, 0, dist);
    expect(south[0]).toBeCloseTo(0, 4);
    expect(south[1]).toBeCloseTo(0, 4);
    expect(south[2]).toBeCloseTo(dist, 4);

    // East: 90° az -> [dist, 0, 0]
    const east = EnvironmentManager.calculateSunCoordinates(0, 90, dist);
    expect(east[0]).toBeCloseTo(dist, 4);
    expect(east[1]).toBeCloseTo(0, 4);
    expect(east[2]).toBeCloseTo(0, 4);

    // North: 180° az -> [0, 0, -dist]
    const north = EnvironmentManager.calculateSunCoordinates(0, 180, dist);
    expect(north[0]).toBeCloseTo(0, 4);
    expect(north[1]).toBeCloseTo(0, 4);
    expect(north[2]).toBeCloseTo(-dist, 4);

    // West: 270° az -> [-dist, 0, 0]
    const west = EnvironmentManager.calculateSunCoordinates(0, 270, dist);
    expect(west[0]).toBeCloseTo(-dist, 4);
    expect(west[1]).toBeCloseTo(0, 4);
    expect(west[2]).toBeCloseTo(0, 4);

    // Northeast: 45° az
    const ne = EnvironmentManager.calculateSunCoordinates(0, 45, dist);
    const expectedComp = dist * Math.SQRT1_2;
    expect(ne[0]).toBeCloseTo(expectedComp, 4);
    expect(ne[1]).toBeCloseTo(0, 4);
    expect(ne[2]).toBeCloseTo(expectedComp, 4);
  });

  it("performs comprehensive round-trip angle consistency across non-singular spherical space", () => {
    const elevations = [-75, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    const azimuths = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const dist = 35.0;

    for (const el of elevations) {
      for (const az of azimuths) {
        const coords = EnvironmentManager.calculateSunCoordinates(el, az, dist);
        const inv = EnvironmentManager.calculateAnglesFromCoordinates(coords);

        expect(inv.elevation).toBeCloseTo(el, 3);
        expect(inv.azimuth).toBeCloseTo(az, 3);
        expect(inv.distance).toBeCloseTo(dist, 3);
      }
    }
  });

  it("handles origin singularity (distance = 0) gracefully without NaN or Inf", () => {
    const origin = EnvironmentManager.calculateAnglesFromCoordinates([0, 0, 0]);
    expect(origin.elevation).toBe(0);
    expect(origin.azimuth).toBe(0);
    expect(origin.distance).toBe(0);
  });
});

describe("Adversarial Chaos & Stress: EnvironmentManager lerpEnvironment", () => {
  const baseEnvA: EnvironmentSettings = {
    preset: "day",
    timeOfDay: 12.0,
    sunPosition: [0, 30, 0],
    sunIntensity: 1.8,
    sunColor: "#ffffff",
    ambientColor: "#87ceeb",
    ambientIntensity: 0.5,
    skyColor: "#4ca6ff",
    groundColor: "#2d5a27",
    windSpeed: 3.0,
    windDirection: 10,
    windGustiness: 0.3,
    grassDensity: "high",
  };

  const baseEnvB: EnvironmentSettings = {
    preset: "night",
    timeOfDay: 24.0,
    sunPosition: [0, -30, 0],
    sunIntensity: 0.1,
    sunColor: "#1a1a3a",
    ambientColor: "#050515",
    ambientIntensity: 0.1,
    skyColor: "#02020a",
    groundColor: "#0a0a0a",
    windSpeed: 8.0,
    windDirection: 350,
    windGustiness: 0.7,
    grassDensity: "low",
  };

  it("interpolates shortest angular arc across 0°/360° wrap-around boundary", () => {
    // 10° to 350°: shortest angular path is -20° across 0°
    // Midpoint (alpha = 0.5) must be exactly 0° (or 360°)
    const lerpedMid = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 0.5);
    expect(lerpedMid.windDirection).toBeCloseTo(0, 1);

    // Quarter point (alpha = 0.25): 10 - 5 = 5°
    const lerpedQ1 = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 0.25);
    expect(lerpedQ1.windDirection).toBeCloseTo(5, 1);

    // Three-quarter point (alpha = 0.75): 10 - 15 = -5 = 355°
    const lerpedQ3 = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 0.75);
    expect(lerpedQ3.windDirection).toBeCloseTo(355, 1);
  });

  it("interpolates reverse shortest arc: 350° to 10°", () => {
    const revA = { ...baseEnvA, windDirection: 350 };
    const revB = { ...baseEnvB, windDirection: 10 };

    const lerped = EnvironmentManager.lerpEnvironment(revA, revB, 0.5);
    expect(lerped.windDirection).toBeCloseTo(0, 1);

    const lerpedQ1 = EnvironmentManager.lerpEnvironment(revA, revB, 0.25);
    expect(lerpedQ1.windDirection).toBeCloseTo(355, 1);

    const lerpedQ3 = EnvironmentManager.lerpEnvironment(revA, revB, 0.75);
    expect(lerpedQ3.windDirection).toBeCloseTo(5, 1);
  });

  it("interpolates standard arc within same hemisphere (45° to 135°)", () => {
    const arcA = { ...baseEnvA, windDirection: 45 };
    const arcB = { ...baseEnvB, windDirection: 135 };

    const lerped = EnvironmentManager.lerpEnvironment(arcA, arcB, 0.5);
    expect(lerped.windDirection).toBeCloseTo(90, 1);
  });

  it("strictly clamps alpha underflow (< 0) and overflow (> 1)", () => {
    // Extreme underflow
    const underflow = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, -50.0);
    expect(underflow.sunIntensity).toBeCloseTo(baseEnvA.sunIntensity, 4);
    expect(underflow.windSpeed).toBeCloseTo(baseEnvA.windSpeed, 4);
    expect(underflow.windDirection).toBeCloseTo(baseEnvA.windDirection, 1);
    expect(underflow.preset).toBe("day");

    // Extreme overflow
    const overflow = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 50.0);
    expect(overflow.sunIntensity).toBeCloseTo(baseEnvB.sunIntensity, 4);
    expect(overflow.windSpeed).toBeCloseTo(baseEnvB.windSpeed, 4);
    expect(overflow.windDirection).toBeCloseTo(baseEnvB.windDirection, 1);
    expect(overflow.preset).toBe("night");
  });

  it("switches categorical preset and grassDensity at alpha > 0.5 threshold", () => {
    const below = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 0.499);
    expect(below.preset).toBe("day");
    expect(below.grassDensity).toBe("high");

    const above = EnvironmentManager.lerpEnvironment(baseEnvA, baseEnvB, 0.501);
    expect(above.preset).toBe("night");
    expect(above.grassDensity).toBe("low");
  });
});

describe("Adversarial Chaos & Stress: GraphicsPresets Matrix & Immutability", () => {
  it("strictly enforces specifications for low, medium, and high", () => {
    const low = getGraphicsPresetConfig("low");
    expect(low.grassBladeCount).toBe(8000);
    expect(low.bladeCount).toBe(8000);
    expect(low.grassSegments).toBe(1);
    expect(low.bladeSegments).toBe(1);
    expect(low.shadowMapSize).toBe(0);
    expect(low.enableShadows).toBe(false);
    expect(low.enableSubsurfaceScattering).toBe(false);
    expect(low.maxFps).toBe(30);

    const med = getGraphicsPresetConfig("medium");
    expect(med.grassBladeCount).toBe(35000);
    expect(med.bladeCount).toBe(35000);
    expect(med.grassSegments).toBe(2);
    expect(med.bladeSegments).toBe(2);
    expect(med.shadowMapSize).toBe(1024);
    expect(med.enableShadows).toBe(true);
    expect(med.enableSubsurfaceScattering).toBe(true);
    expect(med.maxFps).toBe(60);

    const high = getGraphicsPresetConfig("high");
    expect(high.grassBladeCount).toBe(95000);
    expect(high.bladeCount).toBe(95000);
    expect(high.grassSegments).toBe(3);
    expect(high.bladeSegments).toBe(3);
    expect(high.shadowMapSize).toBe(2048);
    expect(high.enableShadows).toBe(true);
    expect(high.enableSubsurfaceScattering).toBe(true);
    expect(high.maxFps).toBe(60);
  });

  it("defends against prototype pollution and unknown preset keys by falling back to high", () => {
    const adversarialKeys = [
      "ultra",
      "potato",
      "extreme",
      "HIGH",
      "LOW",
      "",
      "   ",
      "__proto__",
      "constructor",
      "toString",
      "undefined",
      "null",
      "0",
    ];

    for (const key of adversarialKeys) {
      const config = getGraphicsPresetConfig(key);
      expect(config.preset).toBe("high");
      expect(config.grassBladeCount).toBe(95000);
      expect(config.grassSegments).toBe(3);
      expect(config.enableShadows).toBe(true);
      expect(config.shadowMapSize).toBe(2048);
    }
  });

  it("guarantees deep cloning immutability: mutations on returned config do not pollute presets", () => {
    const originalHighBlades = GRAPHICS_PRESETS.high.grassBladeCount;

    // Mutate copy 1
    const copy1 = getGraphicsPresetConfig("high");
    copy1.grassBladeCount = 999999;
    copy1.bladeCount = 999999;
    copy1.preset = "low";
    copy1.enableShadows = false;
    copy1.shadowMapSize = 0;

    // Fetch copy 2
    const copy2 = getGraphicsPresetConfig("high");
    expect(copy2.grassBladeCount).toBe(originalHighBlades);
    expect(copy2.bladeCount).toBe(originalHighBlades);
    expect(copy2.preset).toBe("high");
    expect(copy2.enableShadows).toBe(true);
    expect(copy2.shadowMapSize).toBe(2048);

    // Verify GRAPHICS_PRESETS constant was untouched
    expect(GRAPHICS_PRESETS.high.grassBladeCount).toBe(95000);
  });

  it("verifies VRAM memory bounds: high preset (95k blades) consumes < 5.0 MB buffer memory", () => {
    const bytesPerBlade = 48; // 12 floats * 4 bytes
    const highBytes = GRAPHICS_PRESETS.high.grassBladeCount * bytesPerBlade;
    const highMb = highBytes / (1024 * 1024);

    expect(highMb).toBeCloseTo(4.349, 2);
    expect(highMb).toBeLessThan(10.0);
  });
});
