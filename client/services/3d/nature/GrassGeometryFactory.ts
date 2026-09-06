import * as THREE from "three";
import { parseColor } from "../catalog/ProceduralGeometry";

export interface BladeGeometryLOD {
  vertexCount: number;
  triangleCount: number;
  heightSteps: number[];
}

export interface BladeGeometryOptions {
  baseWidth?: number; // Default: 0.05m
  bladeHeight?: number; // Default: 0.6m
  naturalCurvature?: number; // Default: 0.06m
}

export interface GrassDistributionConfig {
  width: number; // X extent in meters
  depth: number; // Z extent in meters
  center?: [number, number, number]; // Ground center [x, y, z]
  bladeCount: number; // e.g. 8000, 35000, 95000
  baseTint?: string; // Default: "#15803D"
  seed?: number; // PRNG seed for deterministic layout
  margin?: number; // Inset margin from perimeter (default: 0.15m)
}

export interface GrassInstanceData {
  instanceOffset: Float32Array; // bladeCount * 3
  instanceScale: Float32Array; // bladeCount * 3
  instanceRotation: Float32Array; // bladeCount * 3
  instanceBladeTint: Float32Array; // bladeCount * 3
  count: number;
  bytesPerBlade: number; // 48 bytes
  totalBytes: number; // count * 48
}

export interface GrassMeshOptions {
  segments: 1 | 2 | 3;
  distribution: GrassDistributionConfig;
  material: THREE.ShaderMaterial;
  bladeOptions?: BladeGeometryOptions;
}

/**
 * Procedural Blade Grass Geometry & Instancing Factory
 */
export class GrassGeometryFactory {
  // Singleton cache for base geometries across LODs
  private static geometryCache: Map<string, THREE.BufferGeometry> = new Map();

  /**
   * Calculates topology metadata for blade LOD segments.
   * Matches NatureSimulationEngine.calculateBladeGeometry(segments).
   */
  public static calculateBladeGeometry(segments: 1 | 2 | 3): BladeGeometryLOD {
    switch (segments) {
      case 1:
        return { vertexCount: 3, triangleCount: 1, heightSteps: [0.0, 1.0] };
      case 2:
        return { vertexCount: 5, triangleCount: 3, heightSteps: [0.0, 0.5, 1.0] };
      case 3:
      default:
        return { vertexCount: 7, triangleCount: 5, heightSteps: [0.0, 0.33, 0.66, 1.0] };
    }
  }

  /**
   * Generates a reusable base THREE.BufferGeometry for a single blade strip.
   * Vertex layout:
   * Level k < segments: 2 vertices [left, right]
   * Level k = segments (tip): 1 vertex [apex]
   */
  public static createBladeBaseGeometry(
    segments: 1 | 2 | 3,
    options?: BladeGeometryOptions
  ): THREE.BufferGeometry {
    const baseWidth = options?.baseWidth ?? 0.05;
    const bladeHeight = options?.bladeHeight ?? 0.6;
    const naturalCurvature = options?.naturalCurvature ?? 0.06;

    const cacheKey = `${segments}_${baseWidth}_${bladeHeight}_${naturalCurvature}`;
    const cached = GrassGeometryFactory.geometryCache.get(cacheKey);
    if (cached) return cached.clone();

    const lod = GrassGeometryFactory.calculateBladeGeometry(segments);
    const vertexCount = lod.vertexCount;
    const triangleCount = lod.triangleCount;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint16Array(triangleCount * 3);

    let vIdx = 0;
    let uvIdx = 0;

    // Build intermediate levels (pairs of vertices)
    for (let seg = 0; seg < segments; seg++) {
      const t = seg / segments;
      const y = t * bladeHeight;
      const z = naturalCurvature * t * t;
      const halfWidth = (baseWidth * 0.5) * (1.0 - 0.75 * t);

      // Left vertex
      positions[vIdx * 3] = -halfWidth;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      normals[vIdx * 3] = -0.3;
      normals[vIdx * 3 + 1] = 0.0;
      normals[vIdx * 3 + 2] = 0.95;

      uvs[uvIdx * 2] = 0.0;
      uvs[uvIdx * 2 + 1] = t;
      vIdx++;
      uvIdx++;

      // Right vertex
      positions[vIdx * 3] = halfWidth;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      normals[vIdx * 3] = 0.3;
      normals[vIdx * 3 + 1] = 0.0;
      normals[vIdx * 3 + 2] = 0.95;

      uvs[uvIdx * 2] = 1.0;
      uvs[uvIdx * 2 + 1] = t;
      vIdx++;
      uvIdx++;
    }

    // Apex tip vertex at t = 1.0
    positions[vIdx * 3] = 0.0;
    positions[vIdx * 3 + 1] = bladeHeight;
    positions[vIdx * 3 + 2] = naturalCurvature;

    normals[vIdx * 3] = 0.0;
    normals[vIdx * 3 + 1] = 0.1;
    normals[vIdx * 3 + 2] = 0.995;

    uvs[uvIdx * 2] = 0.5;
    uvs[uvIdx * 2 + 1] = 1.0;

    // Index assembly:
    let iIdx = 0;
    for (let seg = 0; seg < segments - 1; seg++) {
      const bottom = seg * 2;
      const top = (seg + 1) * 2;

      // Triangle 1
      indices[iIdx++] = bottom;
      indices[iIdx++] = bottom + 1;
      indices[iIdx++] = top;

      // Triangle 2
      indices[iIdx++] = top;
      indices[iIdx++] = bottom + 1;
      indices[iIdx++] = top + 1;
    }

    // Top cap triangle connecting to single apex vertex
    const lastBottom = (segments - 1) * 2;
    const apexVertex = segments * 2;
    indices[iIdx++] = lastBottom;
    indices[iIdx++] = lastBottom + 1;
    indices[iIdx++] = apexVertex;

    // Normalize all normals
    for (let i = 0; i < vertexCount; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const len = Math.hypot(nx, ny, nz) || 1.0;
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();

    GrassGeometryFactory.geometryCache.set(cacheKey, geometry);
    return geometry.clone();
  }

  /**
   * Generates stratified jittered distribution of blades over an arbitrary rectangular area.
   * Guarantees exactly 12 floats (48 bytes) per blade.
   */
  public static generateGrassDistribution(config: GrassDistributionConfig): GrassInstanceData {
    const {
      width,
      depth,
      center = [0, 0, 0],
      bladeCount,
      baseTint = "#15803D",
      seed = 42,
      margin = 0.15,
    } = config;

    const count = Math.max(0, Math.floor(bladeCount));
    const offsetArray = new Float32Array(count * 3);
    const scaleArray = new Float32Array(count * 3);
    const rotationArray = new Float32Array(count * 3);
    const tintArray = new Float32Array(count * 3);

    // Deterministic PRNG (Mulberry32)
    let s = seed >>> 0;
    const nextRandom = (): number => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const effectiveWidth = Math.max(0.5, width - margin * 2);
    const effectiveDepth = Math.max(0.5, depth - margin * 2);
    const halfW = effectiveWidth * 0.5;
    const halfD = effectiveDepth * 0.5;

    // Grid dimensions for stratified sampling
    const aspect = effectiveWidth / effectiveDepth;
    const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellW = effectiveWidth / cols;
    const cellD = effectiveDepth / rows;

    const baseColor = parseColor(baseTint, 0x15803d);

    for (let i = 0; i < count; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);

      // Stratified jittered position
      const cellCenterX = -halfW + (c + 0.5) * cellW;
      const cellCenterZ = -halfD + (r + 0.5) * cellD;
      const jitterX = (nextRandom() - 0.5) * cellW * 0.85;
      const jitterZ = (nextRandom() - 0.5) * cellD * 0.85;

      const posX = center[0] + cellCenterX + jitterX;
      const posY = center[1];
      const posZ = center[2] + cellCenterZ + jitterZ;

      offsetArray[i * 3] = posX;
      offsetArray[i * 3 + 1] = posY;
      offsetArray[i * 3 + 2] = posZ;

      // Scale variation: width/depth in [0.85, 1.15], height in [0.8, 1.25]
      const scaleH = 0.8 + nextRandom() * 0.45;
      const scaleW = 0.85 + nextRandom() * 0.3;
      scaleArray[i * 3] = scaleW;
      scaleArray[i * 3 + 1] = scaleH;
      scaleArray[i * 3 + 2] = scaleW;

      // Rotation: random yaw [0, 2PI), subtle tilt pitch/roll [-0.1, 0.1]
      const yaw = nextRandom() * Math.PI * 2.0;
      const pitch = (nextRandom() - 0.5) * 0.2;
      const roll = (nextRandom() - 0.5) * 0.2;
      rotationArray[i * 3] = pitch;
      rotationArray[i * 3 + 1] = yaw;
      rotationArray[i * 3 + 2] = roll;

      // Blade tint: subtle HSV/RGB perturbation
      const tintJitter = (nextRandom() - 0.5) * 0.16;
      tintArray[i * 3] = Math.max(0.0, Math.min(1.5, baseColor.r + tintJitter * 0.5));
      tintArray[i * 3 + 1] = Math.max(0.0, Math.min(1.5, baseColor.g + tintJitter));
      tintArray[i * 3 + 2] = Math.max(0.0, Math.min(1.5, baseColor.b + tintJitter * 0.4));
    }

    return {
      instanceOffset: offsetArray,
      instanceScale: scaleArray,
      instanceRotation: rotationArray,
      instanceBladeTint: tintArray,
      count,
      bytesPerBlade: 48,
      totalBytes: count * 48,
    };
  }

  /**
   * Creates an InstancedBufferGeometry grass mesh ready to be added to the Three.js scene.
   */
  public static createInstancedGrassMesh(options: GrassMeshOptions): THREE.Mesh {
    const { segments, distribution, material, bladeOptions } = options;

    const baseGeometry = GrassGeometryFactory.createBladeBaseGeometry(segments, bladeOptions);
    const instancedGeo = new THREE.InstancedBufferGeometry();

    // Copy base attributes
    instancedGeo.index = baseGeometry.index;
    instancedGeo.attributes.position = baseGeometry.attributes.position;
    instancedGeo.attributes.normal = baseGeometry.attributes.normal;
    instancedGeo.attributes.uv = baseGeometry.attributes.uv;

    // Generate and bind 4 instanced buffer attributes
    const data = GrassGeometryFactory.generateGrassDistribution(distribution);
    instancedGeo.setAttribute("instanceOffset", new THREE.InstancedBufferAttribute(data.instanceOffset, 3));
    instancedGeo.setAttribute("instanceScale", new THREE.InstancedBufferAttribute(data.instanceScale, 3));
    instancedGeo.setAttribute("instanceRotation", new THREE.InstancedBufferAttribute(data.instanceRotation, 3));
    instancedGeo.setAttribute("instanceBladeTint", new THREE.InstancedBufferAttribute(data.instanceBladeTint, 3));

    instancedGeo.instanceCount = data.count;

    const mesh = new THREE.Mesh(instancedGeo, material);
    mesh.frustumCulled = false; // Prevents clipping as vertex shader flexes blades
    mesh.receiveShadow = true;
    mesh.castShadow = false;

    return mesh;
  }

  /**
   * Updates mesh LOD segment level without reallocating instanced buffers.
   */
  public static updateGrassLod(mesh: THREE.Mesh, segments: 1 | 2 | 3, bladeOptions?: BladeGeometryOptions): void {
    const instancedGeo = mesh.geometry as THREE.InstancedBufferGeometry;
    if (!instancedGeo) return;

    const newBase = GrassGeometryFactory.createBladeBaseGeometry(segments, bladeOptions);
    instancedGeo.index = newBase.index;
    instancedGeo.attributes.position = newBase.attributes.position;
    instancedGeo.attributes.normal = newBase.attributes.normal;
    instancedGeo.attributes.uv = newBase.attributes.uv;

    instancedGeo.attributes.position.needsUpdate = true;
    instancedGeo.attributes.normal.needsUpdate = true;
    instancedGeo.attributes.uv.needsUpdate = true;
    if (instancedGeo.index) instancedGeo.index.needsUpdate = true;
  }
}
