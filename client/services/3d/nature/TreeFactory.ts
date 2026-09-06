import * as THREE from "three";
import { CustomProps } from "@/types/threeDBackground";
import { parseColor } from "../catalog/ProceduralGeometry";

export type TreeType = "oak" | "pine" | "birch";

export interface TreeWindUniforms {
  uWindTime: { value: number };
  uWindSpeed: { value: number };
  uWindDirection: { value: THREE.Vector2 };
  uWindGustiness: { value: number };
}

export interface TreeGenerationOptions {
  seed?: number;
  scale?: number;
  barkColor?: number | string;
  foliageColor?: number | string;
}

interface BranchSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radiusStart: number;
  radiusEnd: number;
  tier: 1 | 2; // 1 = trunk, 2 = branch
  branchOrigin: THREE.Vector3;
  phase: number;
}

interface FoliageCluster {
  center: THREE.Vector3;
  radius: number;
  phase: number;
}

function createRng(seed = 42) {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBranchGeometry(segments: BranchSegment[], radialSegments = 8): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const aTiers: number[] = [];
  const aBranchOrigins: number[] = [];
  const aPhases: number[] = [];
  const aClusterOrigins: number[] = [];
  const aClusterPhases: number[] = [];
  const indices: number[] = [];

  let vertexOffset = 0;
  const upVector = new THREE.Vector3(0, 1, 0);
  const altUpVector = new THREE.Vector3(1, 0, 0);

  for (const seg of segments) {
    const dir = new THREE.Vector3().subVectors(seg.end, seg.start);
    const len = dir.length();
    if (len < 0.001) continue;
    dir.normalize();

    // Orthonormal basis
    const refUp = Math.abs(dir.dot(upVector)) > 0.95 ? altUpVector : upVector;
    const uAxis = new THREE.Vector3().crossVectors(dir, refUp).normalize();
    const vAxis = new THREE.Vector3().crossVectors(dir, uAxis).normalize();

    const ringStartIdx = vertexOffset;

    // Rings at t=0 and t=1
    for (let r = 0; r <= 1; r++) {
      const t = r;
      const center = new THREE.Vector3().lerpVectors(seg.start, seg.end, t);
      const radius = seg.radiusStart * (1 - t) + seg.radiusEnd * t;

      for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const normal = new THREE.Vector3()
          .copy(uAxis).multiplyScalar(cosT)
          .addScaledVector(vAxis, sinT);

        const pos = new THREE.Vector3()
          .copy(center)
          .addScaledVector(normal, radius);

        positions.push(pos.x, pos.y, pos.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(i / radialSegments, t * (len / (Math.PI * 2 * Math.max(0.01, radius))));

        aTiers.push(seg.tier);
        aBranchOrigins.push(seg.branchOrigin.x, seg.branchOrigin.y, seg.branchOrigin.z);
        aPhases.push(seg.phase);
        aClusterOrigins.push(0, 0, 0);
        aClusterPhases.push(0);

        vertexOffset++;
      }
    }

    // Quad faces between ring 0 and ring 1
    const stride = radialSegments + 1;
    for (let i = 0; i < radialSegments; i++) {
      const i0 = ringStartIdx + i;
      const i1 = ringStartIdx + i + 1;
      const i2 = ringStartIdx + stride + i;
      const i3 = ringStartIdx + stride + i + 1;

      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute("aTier", new THREE.Float32BufferAttribute(aTiers, 1));
  geom.setAttribute("aBranchOrigin", new THREE.Float32BufferAttribute(aBranchOrigins, 3));
  geom.setAttribute("aPhase", new THREE.Float32BufferAttribute(aPhases, 1));
  geom.setAttribute("aClusterOrigin", new THREE.Float32BufferAttribute(aClusterOrigins, 3));
  geom.setAttribute("aClusterPhase", new THREE.Float32BufferAttribute(aClusterPhases, 1));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  return geom;
}

function buildFoliageGeometry(clusters: FoliageCluster[], detail = 1): THREE.BufferGeometry {
  const baseIcosa = new THREE.IcosahedronGeometry(1.0, detail);
  const basePos = baseIcosa.getAttribute("position");
  const baseNorm = baseIcosa.getAttribute("normal");
  const baseIdx = baseIcosa.getIndex();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const aTiers: number[] = [];
  const aBranchOrigins: number[] = [];
  const aPhases: number[] = [];
  const aClusterOrigins: number[] = [];
  const aClusterPhases: number[] = [];
  const indices: number[] = [];

  let vertexOffset = 0;

  for (const cluster of clusters) {
    const clusterStartIdx = vertexOffset;
    for (let i = 0; i < basePos.count; i++) {
      const vx = basePos.getX(i);
      const vy = basePos.getY(i);
      const vz = basePos.getZ(i);

      // Organic low-frequency clump perturbation
      const jitter = 1.0 + 0.12 * Math.sin(vx * 4.0) * Math.cos(vz * 4.0);
      const px = cluster.center.x + vx * cluster.radius * jitter;
      const py = cluster.center.y + vy * cluster.radius * jitter;
      const pz = cluster.center.z + vz * cluster.radius * jitter;

      positions.push(px, py, pz);
      normals.push(baseNorm.getX(i), baseNorm.getY(i), baseNorm.getZ(i));
      uvs.push(0.5 + vx * 0.5, 0.5 + vz * 0.5);

      aTiers.push(3.0); // Canopy tier
      aBranchOrigins.push(0, 0, 0);
      aPhases.push(0);
      aClusterOrigins.push(cluster.center.x, cluster.center.y, cluster.center.z);
      aClusterPhases.push(cluster.phase);

      vertexOffset++;
    }

    if (baseIdx) {
      for (let j = 0; j < baseIdx.count; j++) {
        indices.push(clusterStartIdx + baseIdx.getX(j));
      }
    } else {
      for (let j = 0; j < basePos.count; j++) {
        indices.push(clusterStartIdx + j);
      }
    }
  }

  baseIcosa.dispose();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute("aTier", new THREE.Float32BufferAttribute(aTiers, 1));
  geom.setAttribute("aBranchOrigin", new THREE.Float32BufferAttribute(aBranchOrigins, 3));
  geom.setAttribute("aPhase", new THREE.Float32BufferAttribute(aPhases, 1));
  geom.setAttribute("aClusterOrigin", new THREE.Float32BufferAttribute(aClusterOrigins, 3));
  geom.setAttribute("aClusterPhase", new THREE.Float32BufferAttribute(aClusterPhases, 1));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  return geom;
}

export function applyTreeWindShader(
  material: THREE.Material,
  uniforms: TreeWindUniforms
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindSpeed = uniforms.uWindSpeed;
    shader.uniforms.uWindDirection = uniforms.uWindDirection;
    shader.uniforms.uWindGustiness = uniforms.uWindGustiness;

    // Vertex shader header injections
    shader.vertexShader = `
      uniform float uWindTime;
      uniform float uWindSpeed;
      uniform vec2 uWindDirection;
      uniform float uWindGustiness;

      attribute float aTier;
      attribute vec3 aBranchOrigin;
      attribute float aPhase;
      attribute vec3 aClusterOrigin;
      attribute float aClusterPhase;
    ` + shader.vertexShader;

    // Vertex displacement injection in <begin_vertex>
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>

      if (uWindSpeed > 0.0001) {
        float baseSpeed = uWindSpeed * 0.1;
        float gust = 1.0 + uWindGustiness * sin(uWindTime * 0.7);

        // Tier 1: Low-frequency trunk flex proportional to height y
        float trunkBend = sin(uWindTime * 1.2 * baseSpeed) * position.y * 0.015 * uWindSpeed;

        // Tier 2: Mid-frequency branch swaying
        float branchSway = 0.0;
        if (aTier >= 1.5) {
          branchSway = sin(uWindTime * 3.5 * baseSpeed + 1.0 + aPhase) * 0.04 * uWindSpeed;
        }

        // Tier 3: High-frequency leaf cluster flutter/rustle
        float canopyFlutter = 0.0;
        if (aTier >= 2.5) {
          canopyFlutter = sin(uWindTime * 8.0 * baseSpeed + 2.0 + aClusterPhase) * 0.08 * uWindSpeed;
        }

        float totalSway = (trunkBend + branchSway + canopyFlutter) * gust;
        vec2 dir = length(uWindDirection) > 0.0001 ? normalize(uWindDirection) : vec2(0.7071, 0.7071);

        vec2 displacementXZ = dir * totalSway;
        transformed.x += displacementXZ.x;
        transformed.z += displacementXZ.y;

        // Length conservation constraint
        float distSq = displacementXZ.x * displacementXZ.x + displacementXZ.y * displacementXZ.y;
        transformed.y -= distSq / (2.0 * max(1.0, position.y));
      }
      `
    );
  };
}

export class TreeFactory {
  /**
   * Shared global wind uniforms bound across all procedural tree materials.
   */
  private static sharedWindUniforms: TreeWindUniforms = {
    uWindTime: { value: 0.0 },
    uWindSpeed: { value: 3.0 },
    uWindDirection: { value: new THREE.Vector2(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)) },
    uWindGustiness: { value: 0.4 },
  };

  public static getSharedWindUniforms(): TreeWindUniforms {
    return this.sharedWindUniforms;
  }

  public static updateWind(
    time: number,
    speed: number,
    directionDegrees: number,
    gustiness = 0.4
  ): void {
    this.sharedWindUniforms.uWindTime.value = time;
    this.sharedWindUniforms.uWindSpeed.value = Math.max(0, speed);
    const rad = (directionDegrees * Math.PI) / 180;
    this.sharedWindUniforms.uWindDirection.value.set(Math.cos(rad), Math.sin(rad));
    this.sharedWindUniforms.uWindGustiness.value = Math.max(0, Math.min(1, gustiness));
  }

  /**
   * Mathematical evaluator for tree sway matching test harness NatureSimulationEngine.
   */
  public static evaluateTreeSway(
    tier: "trunk" | "branch" | "canopy",
    height: number,
    time: number,
    windSpeed: number
  ): number {
    const baseSpeed = windSpeed * 0.1;
    switch (tier) {
      case "trunk":
        return Math.sin(time * 1.2 * baseSpeed) * height * 0.015 * windSpeed;
      case "branch":
        return Math.sin(time * 3.5 * baseSpeed + 1.0) * 0.04 * windSpeed;
      case "canopy":
        return Math.sin(time * 8.0 * baseSpeed + 2.0) * 0.08 * windSpeed;
    }
  }

  /**
   * Generates a complete procedural 3D tree with bottom-centered pivot at y=0.
   * Returns THREE.Group containing exactly 2 children:
   *   children[0]: THREE.Mesh (Trunk & branches wood geometry with bark material)
   *   children[1]: THREE.Mesh (Foliage canopy clusters with wind sway material)
   */
  public static createProceduralTree(
    type: TreeType = "oak",
    customProps?: CustomProps,
    options?: TreeGenerationOptions
  ): THREE.Group {
    const seed = options?.seed ?? 42;
    const rng = createRng(seed);

    const segments: BranchSegment[] = [];
    const clusters: FoliageCluster[] = [];

    let defaultBarkHex: number;
    let defaultFoliageHex: number;

    if (type === "pine") {
      defaultBarkHex = 0x4a2e1b;
      defaultFoliageHex = 0x0f3d1b;
      this.generatePineStructure(segments, clusters, rng);
    } else if (type === "birch") {
      defaultBarkHex = 0xdfded9;
      defaultFoliageHex = 0x65a30d;
      this.generateBirchStructure(segments, clusters, rng);
    } else {
      // Oak (default)
      defaultBarkHex = 0x3a2312;
      defaultFoliageHex = 0x15803d;
      this.generateOakStructure(segments, clusters, rng);
    }

    const barkColor = options?.barkColor
      ? parseColor(String(options.barkColor), defaultBarkHex)
      : (customProps?.colorTint ? parseColor(customProps.colorTint, defaultBarkHex) : new THREE.Color(defaultBarkHex));

    const foliageColor = options?.foliageColor
      ? parseColor(String(options.foliageColor), defaultFoliageHex)
      : (customProps?.colorTint ? parseColor(customProps.colorTint, defaultFoliageHex) : new THREE.Color(defaultFoliageHex));

    // 1. Build wood skeleton geometry
    const woodGeometry = buildBranchGeometry(segments, 8);
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: barkColor,
      roughness: type === "birch" ? 0.72 : 0.9,
      metalness: 0.05,
    });
    applyTreeWindShader(barkMaterial, this.sharedWindUniforms);

    const woodMesh = new THREE.Mesh(woodGeometry, barkMaterial);
    woodMesh.name = "Tree_Wood";
    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;

    // 2. Build foliage canopy geometry
    const foliageGeometry = buildFoliageGeometry(clusters, 1);
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: foliageColor,
      roughness: 0.65,
      metalness: 0.0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    applyTreeWindShader(foliageMaterial, this.sharedWindUniforms);

    const foliageMesh = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliageMesh.name = "Tree_Foliage";
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    // Assemble group
    const treeGroup = new THREE.Group();
    treeGroup.name = `ProceduralTree_${type}`;
    treeGroup.add(woodMesh);
    treeGroup.add(foliageMesh);

    // Apply scale if specified
    if (options?.scale && options.scale !== 1.0) {
      treeGroup.scale.setScalar(options.scale);
    }

    treeGroup.userData = {
      isRoomObject: true,
      catalogId: `outdoor_tree_${type}`,
      treeType: type,
    };

    return treeGroup;
  }

  private static generateOakStructure(
    segments: BranchSegment[],
    clusters: FoliageCluster[],
    rng: () => number
  ): void {
    const trunkHeight = 2.0;
    const trunkStart = new THREE.Vector3(0, 0, 0);
    const trunkEnd = new THREE.Vector3(0, trunkHeight, 0);

    // Main Trunk (Child 0 tier 1)
    segments.push({
      start: trunkStart,
      end: trunkEnd,
      radiusStart: 0.34,
      radiusEnd: 0.26,
      tier: 1,
      branchOrigin: trunkStart.clone(),
      phase: 0.0,
    });

    // 4-5 major spreading boughs diverging at 45° - 65°
    const boughCount = 4;
    for (let b = 0; b < boughCount; b++) {
      const angle = (b / boughCount) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const boughLength = 1.6 + rng() * 0.4;
      const boughAngle = 0.8 + rng() * 0.3; // ~45-65 deg from vertical

      const boughDir = new THREE.Vector3(
        Math.cos(angle) * Math.sin(boughAngle),
        Math.cos(boughAngle),
        Math.sin(angle) * Math.sin(boughAngle)
      ).normalize();

      const boughEnd = trunkEnd.clone().addScaledVector(boughDir, boughLength);

      segments.push({
        start: trunkEnd.clone(),
        end: boughEnd,
        radiusStart: 0.22,
        radiusEnd: 0.13,
        tier: 2,
        branchOrigin: trunkEnd.clone(),
        phase: b * 1.5,
      });

      // 2 secondary limbs per bough
      for (let s = 0; s < 2; s++) {
        const subAngle = angle + (s === 0 ? 0.6 : -0.6) + (rng() - 0.5) * 0.3;
        const subLength = 1.0 + rng() * 0.4;
        const subDir = new THREE.Vector3(
          Math.cos(subAngle) * 0.7,
          0.6 + rng() * 0.3,
          Math.sin(subAngle) * 0.7
        ).normalize();

        const limbEnd = boughEnd.clone().addScaledVector(subDir, subLength);

        segments.push({
          start: boughEnd.clone(),
          end: limbEnd,
          radiusStart: 0.12,
          radiusEnd: 0.06,
          tier: 2,
          branchOrigin: boughEnd.clone(),
          phase: (b * 2 + s) * 1.2,
        });

        // Foliage cluster at limb termination
        clusters.push({
          center: limbEnd.clone().add(new THREE.Vector3(0, 0.2, 0)),
          radius: 0.85 + rng() * 0.35,
          phase: rng() * Math.PI * 2,
        });
      }

      // Foliage cluster at bough termination
      clusters.push({
        center: boughEnd.clone().add(new THREE.Vector3(0, 0.3, 0)),
        radius: 1.0 + rng() * 0.3,
        phase: rng() * Math.PI * 2,
      });
    }

    // Central crown cluster
    clusters.push({
      center: new THREE.Vector3(0, trunkHeight + 1.8, 0),
      radius: 1.2,
      phase: 0.0,
    });
  }

  private static generatePineStructure(
    segments: BranchSegment[],
    clusters: FoliageCluster[],
    rng: () => number
  ): void {
    const totalHeight = 5.4;
    const trunkStart = new THREE.Vector3(0, 0, 0);
    const trunkEnd = new THREE.Vector3(0, totalHeight, 0);

    // Main continuous central stem
    segments.push({
      start: trunkStart,
      end: trunkEnd,
      radiusStart: 0.28,
      radiusEnd: 0.05,
      tier: 1,
      branchOrigin: trunkStart.clone(),
      phase: 0.0,
    });

    // 5-6 whorled tiers along stem
    const whorlTiers = 6;
    for (let w = 0; w < whorlTiers; w++) {
      const heightFrac = (w + 1) / (whorlTiers + 1);
      const tierY = 1.0 + heightFrac * (totalHeight - 1.4);
      const tierBase = new THREE.Vector3(0, tierY, 0);
      const branchSpread = (1.0 - heightFrac * 0.75) * 1.8;
      const branchesInTier = 5;

      for (let b = 0; b < branchesInTier; b++) {
        const angle = (b / branchesInTier) * Math.PI * 2 + (w * 0.5) + (rng() - 0.5) * 0.2;
        const bEnd = new THREE.Vector3(
          Math.cos(angle) * branchSpread,
          tierY - 0.15 + rng() * 0.1, // slightly drooping conifer branch
          Math.sin(angle) * branchSpread
        );

        segments.push({
          start: tierBase.clone(),
          end: bEnd,
          radiusStart: 0.1 - heightFrac * 0.05,
          radiusEnd: 0.03,
          tier: 2,
          branchOrigin: tierBase.clone(),
          phase: (w * 5 + b) * 0.9,
        });

        // Needle foliage cluster
        clusters.push({
          center: bEnd.clone().add(new THREE.Vector3(0, 0.1, 0)),
          radius: 0.6 * (1.0 - heightFrac * 0.5),
          phase: rng() * Math.PI * 2,
        });
      }
    }

    // Spire apex cluster
    clusters.push({
      center: new THREE.Vector3(0, totalHeight + 0.2, 0),
      radius: 0.45,
      phase: 0.0,
    });
  }

  private static generateBirchStructure(
    segments: BranchSegment[],
    clusters: FoliageCluster[],
    rng: () => number
  ): void {
    const trunkHeight = 3.2;
    const trunkStart = new THREE.Vector3(0, 0, 0);
    // Subtle natural trunk curve
    const trunkEnd = new THREE.Vector3(0.1, trunkHeight, -0.05);

    segments.push({
      start: trunkStart,
      end: trunkEnd,
      radiusStart: 0.16,
      radiusEnd: 0.09,
      tier: 1,
      branchOrigin: trunkStart.clone(),
      phase: 0.0,
    });

    // 3-4 acute ascending limbs splitting at 30° - 40°
    const limbCount = 3;
    for (let l = 0; l < limbCount; l++) {
      const angle = (l / limbCount) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      const limbLength = 1.6 + rng() * 0.3;
      const limbEnd = trunkEnd.clone().add(
        new THREE.Vector3(
          Math.cos(angle) * 0.7,
          limbLength,
          Math.sin(angle) * 0.7
        )
      );

      segments.push({
        start: trunkEnd.clone(),
        end: limbEnd,
        radiusStart: 0.08,
        radiusEnd: 0.04,
        tier: 2,
        branchOrigin: trunkEnd.clone(),
        phase: l * 1.8,
      });

      // Weeping twigs drooping downward
      for (let w = 0; w < 2; w++) {
        const twigAngle = angle + (w === 0 ? 0.8 : -0.8);
        const twigEnd = limbEnd.clone().add(
          new THREE.Vector3(
            Math.cos(twigAngle) * 0.6,
            -0.3 - rng() * 0.2, // weeping downward droop
            Math.sin(twigAngle) * 0.6
          )
        );

        segments.push({
          start: limbEnd.clone(),
          end: twigEnd,
          radiusStart: 0.04,
          radiusEnd: 0.015,
          tier: 2,
          branchOrigin: limbEnd.clone(),
          phase: (l * 2 + w) * 1.4,
        });

        // Delicate lime foliage cluster
        clusters.push({
          center: twigEnd.clone().add(new THREE.Vector3(0, -0.1, 0)),
          radius: 0.6 + rng() * 0.2,
          phase: rng() * Math.PI * 2,
        });
      }

      clusters.push({
        center: limbEnd.clone().add(new THREE.Vector3(0, 0.15, 0)),
        radius: 0.7,
        phase: rng() * Math.PI * 2,
      });
    }
  }
}
