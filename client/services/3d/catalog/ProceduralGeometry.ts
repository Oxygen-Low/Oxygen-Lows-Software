import * as THREE from "three";
import { CustomProps } from "@/types/threeDBackground";
import { PosterFactory } from "../assets/PosterFactory";
import { TreeFactory } from "../nature/TreeFactory";

/**
 * Parses a hex color string safely with a fallback default color.
 */
export function parseColor(colorString?: string, defaultColor = 0x94a3b8): THREE.Color {
  if (!colorString) return new THREE.Color(defaultColor);
  try {
    return new THREE.Color(colorString);
  } catch {
    return new THREE.Color(defaultColor);
  }
}

/**
 * Recursively configures shadow casting and receiving on solid submeshes.
 */
export function configureShadows(object: THREE.Object3D, isTransparent = false): void {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = !isTransparent;
      mesh.receiveShadow = true;
    }
  });
}

/**
 * Centers an object's bounding box horizontally at (X, Z) = (0, 0)
 * and rests its lowest vertical boundary flush at Y = 0.0.
 */
export function alignToBottomCenter(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return group;

  const center = new THREE.Vector3();
  box.getCenter(center);
  const minY = box.min.y;

  for (const child of group.children) {
    child.position.x -= center.x;
    child.position.z -= center.z;
    child.position.y -= minY;
  }

  group.updateMatrixWorld(true);
  return group;
}

// ============================================================================
// 1. MODULAR WALLS GENERATORS
// ============================================================================

/**
 * 1. Straight Wall with Baseboard & Crown Molding
 */
export function createStraightWallMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const width = 2.0;
  const height = 2.5;
  const depth = 0.15;

  const wallColor = parseColor(customProps?.colorTint, 0xcbd5e1);

  // Primary body mesh (Child index 0 for test compatibility)
  const wallGeom = new THREE.BoxGeometry(width, height, depth);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
  });
  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.position.set(0, height / 2, 0);
  group.add(wallMesh);

  // Baseboard trim at bottom
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.5,
    metalness: 0.1,
  });
  const baseboardGeom = new THREE.BoxGeometry(width, 0.1, depth + 0.02);
  const baseboard = new THREE.Mesh(baseboardGeom, trimMat);
  baseboard.position.set(0, 0.05, 0);
  group.add(baseboard);

  // Crown molding trim at top
  const crownGeom = new THREE.BoxGeometry(width, 0.06, depth + 0.02);
  const crown = new THREE.Mesh(crownGeom, trimMat);
  crown.position.set(0, height - 0.03, 0);
  group.add(crown);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 2. Corner Wall (90° Mitered)
 */
export function createCornerWallMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const wallColor = parseColor(customProps?.colorTint, 0xcbd5e1);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
  });

  // Main X wall (Child 0)
  const xWallGeom = new THREE.BoxGeometry(2.0, 2.5, 0.15);
  const xWall = new THREE.Mesh(xWallGeom, wallMat);
  xWall.position.set(0, 1.25, -0.925);
  group.add(xWall);

  // Orthogonal Z wall
  const zWallGeom = new THREE.BoxGeometry(0.15, 2.5, 1.85);
  const zWall = new THREE.Mesh(zWallGeom, wallMat);
  zWall.position.set(-0.925, 1.25, 0.075);
  group.add(zWall);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 3. Windowed Wall Module
 */
export function createWindowedWallMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const wallColor = parseColor(customProps?.colorTint, 0xcbd5e1);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
  });

  // Lower wall apron (Child 0)
  const bottomGeom = new THREE.BoxGeometry(2.0, 0.9, 0.15);
  const bottomMesh = new THREE.Mesh(bottomGeom, wallMat);
  bottomMesh.position.set(0, 0.45, 0);
  group.add(bottomMesh);

  // Top header lintel
  const topGeom = new THREE.BoxGeometry(2.0, 0.4, 0.15);
  const topMesh = new THREE.Mesh(topGeom, wallMat);
  topMesh.position.set(0, 2.3, 0);
  group.add(topMesh);

  // Left jamb
  const leftGeom = new THREE.BoxGeometry(0.4, 1.2, 0.15);
  const leftMesh = new THREE.Mesh(leftGeom, wallMat);
  leftMesh.position.set(-0.8, 1.5, 0);
  group.add(leftMesh);

  // Right jamb
  const rightGeom = new THREE.BoxGeometry(0.4, 1.2, 0.15);
  const rightMesh = new THREE.Mesh(rightGeom, wallMat);
  rightMesh.position.set(0.8, 1.5, 0);
  group.add(rightMesh);

  // Window frame and glass
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const frameGeom = new THREE.BoxGeometry(1.22, 1.22, 0.06);
  const frameMesh = new THREE.Mesh(frameGeom, frameMat);
  frameMesh.position.set(0, 1.5, 0);
  group.add(frameMesh);

  const glassMat = new THREE.MeshPhysicalMaterial({
    transmission: 0.9,
    roughness: 0.05,
    ior: 1.5,
    transparent: true,
    opacity: 0.35,
  });
  const glassGeom = new THREE.PlaneGeometry(1.15, 1.15);
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  glassMesh.position.set(0, 1.5, 0);
  group.add(glassMesh);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 4. Doorway Wall Module
 */
export function createDoorwayWallMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const wallColor = parseColor(customProps?.colorTint, 0xcbd5e1);
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85 });

  // Left wall portion (Child 0)
  const leftGeom = new THREE.BoxGeometry(0.55, 2.5, 0.15);
  const left = new THREE.Mesh(leftGeom, wallMat);
  left.position.set(-0.725, 1.25, 0);
  group.add(left);

  // Right wall portion
  const rightGeom = new THREE.BoxGeometry(0.55, 2.5, 0.15);
  const right = new THREE.Mesh(rightGeom, wallMat);
  right.position.set(0.725, 1.25, 0);
  group.add(right);

  // Top header transom
  const topGeom = new THREE.BoxGeometry(2.0, 0.4, 0.15);
  const top = new THREE.Mesh(topGeom, wallMat);
  top.position.set(0, 2.3, 0);
  group.add(top);

  // Architrave trim casing
  const casingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
  const casingGeom = new THREE.BoxGeometry(0.96, 2.13, 0.17);
  const casing = new THREE.Mesh(casingGeom, casingMat);
  casing.position.set(0, 1.05, 0);
  group.add(casing);

  configureShadows(group);
  return alignToBottomCenter(group);
}

// ============================================================================
// 2. FLOORS GENERATORS
// ============================================================================

/**
 * 5. Wood Parquet Floor Tile
 */
export function createWoodParquetFloorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const floorColor = parseColor(customProps?.colorTint, 0x8b5a2b);

  // Main floor slab (Child 0)
  const slabGeom = new THREE.BoxGeometry(2.0, 0.05, 2.0);
  const slabMat = new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.65,
    metalness: 0.05,
  });
  const slab = new THREE.Mesh(slabGeom, slabMat);
  slab.position.set(0, 0.025, 0);
  group.add(slab);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 6. Ceramic Tile Floor
 */
export function createTileCeramicFloorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const tileColor = parseColor(customProps?.colorTint, 0xe2e8f0);

  // Base grout slab (Child 0)
  const baseGeom = new THREE.BoxGeometry(2.0, 0.045, 2.0);
  const baseMat = new THREE.MeshStandardMaterial({ color: tileColor, roughness: 0.3, metalness: 0.1 });
  const base = new THREE.Mesh(baseGeom, baseMat);
  base.position.set(0, 0.0225, 0);
  group.add(base);

  // 4 individual tile squares with recessed grout spacing
  const singleTileGeom = new THREE.BoxGeometry(0.98, 0.01, 0.98);
  const singleTileMat = new THREE.MeshStandardMaterial({ color: tileColor, roughness: 0.25, metalness: 0.1 });
  const offsets = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ];
  for (const [ox, oz] of offsets) {
    const tile = new THREE.Mesh(singleTileGeom, singleTileMat);
    tile.position.set(ox, 0.05, oz);
    group.add(tile);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 7. Carpet Floor
 */
export function createCarpetFloorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const carpetColor = parseColor(customProps?.colorTint, 0x1e3a8a);

  const carpetGeom = new THREE.BoxGeometry(2.0, 0.03, 2.0);
  const carpetMat = new THREE.MeshStandardMaterial({
    color: carpetColor,
    roughness: 0.95,
    metalness: 0.0,
  });
  const carpet = new THREE.Mesh(carpetGeom, carpetMat);
  carpet.position.set(0, 0.015, 0);
  group.add(carpet);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 8. Marble Stone Floor
 */
export function createStoneMarbleFloorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const marbleColor = parseColor(customProps?.colorTint, 0xf8fafc);

  const marbleGeom = new THREE.BoxGeometry(2.0, 0.05, 2.0);
  const marbleMat = new THREE.MeshPhysicalMaterial({
    color: marbleColor,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.1,
  });
  const marble = new THREE.Mesh(marbleGeom, marbleMat);
  marble.position.set(0, 0.025, 0);
  group.add(marble);

  configureShadows(group);
  return alignToBottomCenter(group);
}

// ============================================================================
// 3. DOORS & WINDOWS GENERATORS
// ============================================================================

/**
 * 9. Modern Wood Door
 */
export function createModernWoodDoorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const doorColor = parseColor(customProps?.colorTint, 0x78350f);

  // Door leaf slab (Child 0)
  const leafGeom = new THREE.BoxGeometry(0.85, 2.0, 0.045);
  const leafMat = new THREE.MeshStandardMaterial({ color: doorColor, roughness: 0.6 });
  const leaf = new THREE.Mesh(leafGeom, leafMat);
  leaf.position.set(0, 1.0, 0);
  group.add(leaf);

  // Outer frame jamb
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
  const frameGeom = new THREE.BoxGeometry(0.95, 2.08, 0.12);
  const frame = new THREE.Mesh(frameGeom, frameMat);
  frame.position.set(0, 1.04, 0);
  group.add(frame);

  // Metallic lever handle
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 });
  const handleGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12);
  handleGeom.rotateZ(Math.PI / 2);
  const handleFront = new THREE.Mesh(handleGeom, handleMat);
  handleFront.position.set(0.35, 1.0, 0.04);
  group.add(handleFront);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 10. Glass Sliding Door
 */
export function createGlassSlidingDoorMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const frameColor = parseColor(customProps?.colorTint, 0x1e293b);
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.3, metalness: 0.5 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    transmission: 0.92,
    roughness: 0.04,
    transparent: true,
    opacity: 0.3,
  });

  // Main frame perimeter (Child 0)
  const outerFrameGeom = new THREE.BoxGeometry(2.0, 2.2, 0.12);
  const outerFrame = new THREE.Mesh(outerFrameGeom, frameMat);
  outerFrame.position.set(0, 1.1, 0);
  group.add(outerFrame);

  // Left fixed glass pane
  const glassGeom = new THREE.PlaneGeometry(0.92, 2.05);
  const fixedGlass = new THREE.Mesh(glassGeom, glassMat);
  fixedGlass.position.set(-0.47, 1.1, 0.02);
  group.add(fixedGlass);

  // Right sliding glass pane
  const slidingGlass = new THREE.Mesh(glassGeom, glassMat);
  slidingGlass.position.set(0.47, 1.1, -0.02);
  group.add(slidingGlass);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 11. Casement Window
 */
export function createCasementWindowMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const frameColor = parseColor(customProps?.colorTint, 0x475569);

  // Outer sash box (Child 0)
  const sashGeom = new THREE.BoxGeometry(1.2, 1.4, 0.1);
  const sashMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.4 });
  const sash = new THREE.Mesh(sashGeom, sashMat);
  sash.position.set(0, 0.7, 0);
  group.add(sash);

  // Window sill ledge
  const sillGeom = new THREE.BoxGeometry(1.3, 0.06, 0.18);
  const sill = new THREE.Mesh(sillGeom, sashMat);
  sill.position.set(0, 0.03, 0.04);
  group.add(sill);

  // Glass pane
  const glassMat = new THREE.MeshPhysicalMaterial({
    transmission: 0.92,
    roughness: 0.05,
    transparent: true,
    opacity: 0.3,
  });
  const glassGeom = new THREE.PlaneGeometry(1.08, 1.28);
  const glass = new THREE.Mesh(glassGeom, glassMat);
  glass.position.set(0, 0.7, 0);
  group.add(glass);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 12. Floor-to-Ceiling Window
 */
export function createFloorToCeilingWindowMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const frameColor = parseColor(customProps?.colorTint, 0x0f172a);
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.2, metalness: 0.7 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    transmission: 0.94,
    roughness: 0.02,
    transparent: true,
    opacity: 0.25,
  });

  // Minimal boundary border (Child 0)
  const borderGeom = new THREE.BoxGeometry(2.0, 2.5, 0.06);
  const border = new THREE.Mesh(borderGeom, frameMat);
  border.position.set(0, 1.25, 0);
  group.add(border);

  // Full height structural glass pane
  const glassGeom = new THREE.PlaneGeometry(1.92, 2.42);
  const glass = new THREE.Mesh(glassGeom, glassMat);
  glass.position.set(0, 1.25, 0);
  group.add(glass);

  configureShadows(group);
  return alignToBottomCenter(group);
}

// ============================================================================
// 4. FURNITURE GENERATORS
// ============================================================================

/**
 * 13. King Size Bed
 */
export function createKingBedMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const bedColor = parseColor(customProps?.colorTint, 0xe2e8f0);

  // Mattress & Duvet (Child 0 - Tintable)
  const mattressGeom = new THREE.BoxGeometry(1.9, 0.35, 2.1);
  const mattressMat = new THREE.MeshStandardMaterial({ color: bedColor, roughness: 0.9 });
  const mattress = new THREE.Mesh(mattressGeom, mattressMat);
  mattress.position.set(0, 0.425, 0.05);
  group.add(mattress);

  // Wooden platform base
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 });
  const baseGeom = new THREE.BoxGeometry(2.0, 0.25, 2.2);
  const base = new THREE.Mesh(baseGeom, baseMat);
  base.position.set(0, 0.125, 0);
  group.add(base);

  // Upholstered headboard
  const headboardGeom = new THREE.BoxGeometry(2.0, 0.95, 0.15);
  const headboard = new THREE.Mesh(headboardGeom, mattressMat);
  headboard.position.set(0, 0.475, -1.025);
  group.add(headboard);

  // Two soft pillows
  const pillowGeom = new THREE.BoxGeometry(0.7, 0.12, 0.45);
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95 });
  const p1 = new THREE.Mesh(pillowGeom, pillowMat);
  p1.position.set(-0.45, 0.66, -0.7);
  p1.rotation.x = -0.2;
  group.add(p1);

  const p2 = new THREE.Mesh(pillowGeom, pillowMat);
  p2.position.set(0.45, 0.66, -0.7);
  p2.rotation.x = -0.2;
  group.add(p2);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 14. Bedside Nightstand
 */
export function createNightstandMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const woodColor = parseColor(customProps?.colorTint, 0x5c3a21);

  // Main drawer cabinet box (Child 0)
  const boxGeom = new THREE.BoxGeometry(0.5, 0.35, 0.45);
  const boxMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.65 });
  const box = new THREE.Mesh(boxGeom, boxMat);
  box.position.set(0, 0.375, 0);
  group.add(box);

  // 4 legs
  const legGeom = new THREE.CylinderGeometry(0.02, 0.015, 0.2, 8);
  legGeom.translate(0, 0.1, 0);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const legPositions = [
    [-0.2, 0, -0.18],
    [0.2, 0, -0.18],
    [-0.2, 0, 0.18],
    [0.2, 0, 0.18],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(lx, ly, lz);
    group.add(leg);
  }

  // Drawer pull handles
  const handleGeom = new THREE.BoxGeometry(0.12, 0.02, 0.02);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
  const h1 = new THREE.Mesh(handleGeom, handleMat);
  h1.position.set(0, 0.45, 0.235);
  group.add(h1);

  const h2 = new THREE.Mesh(handleGeom, handleMat);
  h2.position.set(0, 0.3, 0.235);
  group.add(h2);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 15. Table Lamp with Dynamic Point Light
 */
export function createTableLampMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const shadeColor = parseColor(customProps?.colorTint, 0xfde047);

  // Lampshade (Child 0 - Tintable)
  const shadeGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.22, 16);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: shadeColor,
    roughness: 0.7,
    emissive: customProps?.lightColor ? parseColor(customProps.lightColor) : new THREE.Color(0x000000),
    emissiveIntensity: 0.2,
  });
  const shade = new THREE.Mesh(shadeGeom, shadeMat);
  shade.position.set(0, 0.44, 0);
  group.add(shade);

  // Circular base disk
  const baseGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16);
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
  const base = new THREE.Mesh(baseGeom, metalMat);
  base.position.set(0, 0.01, 0);
  group.add(base);

  // Slender stem rod
  const stemGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.32, 12);
  const stem = new THREE.Mesh(stemGeom, metalMat);
  stem.position.set(0, 0.17, 0);
  group.add(stem);

  // Dynamic Point Light (Activated when lighting props are provided)
  if (customProps?.lightColor !== undefined || customProps?.lightIntensity !== undefined) {
    const lightColor = parseColor(customProps?.lightColor, 0xfde047);
    const lightIntensity = customProps?.lightIntensity ?? 1.5;
    const lightDistance = customProps?.lightDistance ?? 3.5;
    const pointLight = new THREE.PointLight(lightColor, lightIntensity, lightDistance);
    pointLight.position.set(0, 0.44, 0);
    pointLight.castShadow = true;
    group.add(pointLight);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 16. Scandinavian Arched Floor Lamp
 */
export function createStandingLampMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const shadeColor = parseColor(customProps?.colorTint, 0xfef08a);

  // Lamp shade dome (Child 0)
  const shadeGeom = new THREE.SphereGeometry(0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shadeMat = new THREE.MeshStandardMaterial({ color: shadeColor, roughness: 0.4 });
  const shade = new THREE.Mesh(shadeGeom, shadeMat);
  shade.rotation.x = Math.PI;
  shade.position.set(0.35, 1.7, 0);
  group.add(shade);

  // Heavy marble base disk
  const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24);
  const marbleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
  const base = new THREE.Mesh(baseGeom, marbleMat);
  base.position.set(0, 0.02, 0);
  group.add(base);

  // Arched tube curve
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0.04, 0),
    new THREE.Vector3(0, 1.85, 0),
    new THREE.Vector3(0.35, 1.72, 0),
  );
  const tubeGeom = new THREE.TubeGeometry(curve, 20, 0.015, 8, false);
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
  const tube = new THREE.Mesh(tubeGeom, brassMat);
  group.add(tube);

  // Dynamic Point Light
  if (customProps?.lightColor !== undefined || customProps?.lightIntensity !== undefined) {
    const lightColor = parseColor(customProps?.lightColor, 0xfef08a);
    const lightIntensity = customProps?.lightIntensity ?? 1.8;
    const lightDistance = customProps?.lightDistance ?? 4.5;
    const pointLight = new THREE.PointLight(lightColor, lightIntensity, lightDistance);
    pointLight.position.set(0.35, 1.65, 0);
    pointLight.castShadow = true;
    group.add(pointLight);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 17. Articulated Architect Desk Lamp
 */
export function createDeskLampMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const lampColor = parseColor(customProps?.colorTint, 0x0f172a);

  // Lamp shade cone (Child 0)
  const coneGeom = new THREE.ConeGeometry(0.08, 0.15, 16);
  const coneMat = new THREE.MeshStandardMaterial({ color: lampColor, roughness: 0.5 });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.position.set(0.12, 0.42, 0);
  cone.rotation.z = -0.6;
  group.add(cone);

  // Weighted base
  const baseGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16);
  const base = new THREE.Mesh(baseGeom, coneMat);
  base.position.set(0, 0.01, 0);
  group.add(base);

  // Arm links
  const linkMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 });
  const arm1Geom = new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8);
  const arm1 = new THREE.Mesh(arm1Geom, linkMat);
  arm1.position.set(0.03, 0.14, 0);
  arm1.rotation.z = -0.3;
  group.add(arm1);

  const arm2 = new THREE.Mesh(arm1Geom, linkMat);
  arm2.position.set(0.08, 0.32, 0);
  arm2.rotation.z = 0.4;
  group.add(arm2);

  if (customProps?.lightColor !== undefined || customProps?.lightIntensity !== undefined) {
    const pointLight = new THREE.PointLight(
      parseColor(customProps?.lightColor, 0xfffbeb),
      customProps?.lightIntensity ?? 1.2,
      customProps?.lightDistance ?? 2.5,
    );
    pointLight.position.set(0.12, 0.4, 0);
    pointLight.castShadow = true;
    group.add(pointLight);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 18. Executive Desk
 */
export function createExecutiveDeskMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const topColor = parseColor(customProps?.colorTint, 0x475569);

  // Tabletop Slab (Child 0 - Tintable)
  const topGeom = new THREE.BoxGeometry(1.6, 0.05, 0.8);
  const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.6 });
  const top = new THREE.Mesh(topGeom, topMat);
  top.position.set(0, 0.725, 0);
  group.add(top);

  // Powder-coated metal legs (Left and Right loop frames)
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
  const legGeom = new THREE.BoxGeometry(0.06, 0.7, 0.76);
  const leftLeg = new THREE.Mesh(legGeom, legMat);
  leftLeg.position.set(-0.72, 0.35, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeom, legMat);
  rightLeg.position.set(0.72, 0.35, 0);
  group.add(rightLeg);

  // Modesty rear panel
  const modestyGeom = new THREE.BoxGeometry(1.38, 0.35, 0.02);
  const modesty = new THREE.Mesh(modestyGeom, topMat);
  modesty.position.set(0, 0.5, -0.36);
  group.add(modesty);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 19. Ergonomic Office Chair
 */
export function createErgonomicChairMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const seatColor = parseColor(customProps?.colorTint, 0x0f172a);

  // Contoured padded seat cushion (Child 0 - Tintable)
  const seatGeom = new THREE.BoxGeometry(0.52, 0.08, 0.5);
  const seatMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.85 });
  const seat = new THREE.Mesh(seatGeom, seatMat);
  seat.position.set(0, 0.48, 0);
  group.add(seat);

  // Curved breathable backrest
  const backGeom = new THREE.BoxGeometry(0.48, 0.54, 0.05);
  const backMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.9 });
  const back = new THREE.Mesh(backGeom, backMat);
  back.position.set(0, 0.78, -0.23);
  back.rotation.x = 0.08;
  group.add(back);

  // Central pneumatic cylinder
  const stemGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.38, 12);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
  const stem = new THREE.Mesh(stemGeom, stemMat);
  stem.position.set(0, 0.25, 0);
  group.add(stem);

  // 5-Star castor base with rolling wheels
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const legGeom = new THREE.BoxGeometry(0.04, 0.03, 0.3);
    const spoke = new THREE.Mesh(legGeom, baseMat);
    spoke.position.set(Math.sin(angle) * 0.15, 0.08, Math.cos(angle) * 0.15);
    spoke.rotation.y = angle;
    group.add(spoke);

    const wheelGeom = new THREE.SphereGeometry(0.025, 8, 8);
    const wheel = new THREE.Mesh(wheelGeom, baseMat);
    wheel.position.set(Math.sin(angle) * 0.28, 0.025, Math.cos(angle) * 0.28);
    group.add(wheel);
  }

  // Dual armrests
  const armGeom = new THREE.BoxGeometry(0.08, 0.24, 0.26);
  const leftArm = new THREE.Mesh(armGeom, baseMat);
  leftArm.position.set(-0.3, 0.62, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeom, baseMat);
  rightArm.position.set(0.3, 0.62, 0);
  group.add(rightArm);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 20. Modern 3-Seater Sofa
 */
export function createModernSofaMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const fabricColor = parseColor(customProps?.colorTint, 0x334155);

  // Main chassis seat base (Child 0 - Tintable)
  const baseGeom = new THREE.BoxGeometry(2.1, 0.35, 0.9);
  const fabricMat = new THREE.MeshStandardMaterial({ color: fabricColor, roughness: 0.9 });
  const base = new THREE.Mesh(baseGeom, fabricMat);
  base.position.set(0, 0.275, 0);
  group.add(base);

  // 3 seat cushions
  const cushionGeom = new THREE.BoxGeometry(0.64, 0.12, 0.65);
  for (let i = -1; i <= 1; i++) {
    const cushion = new THREE.Mesh(cushionGeom, fabricMat);
    cushion.position.set(i * 0.66, 0.48, 0.08);
    group.add(cushion);
  }

  // Backrest cushion wall
  const backGeom = new THREE.BoxGeometry(2.1, 0.45, 0.22);
  const back = new THREE.Mesh(backGeom, fabricMat);
  back.position.set(0, 0.65, -0.34);
  group.add(back);

  // Dual side armrests
  const armGeom = new THREE.BoxGeometry(0.18, 0.35, 0.9);
  const leftArm = new THREE.Mesh(armGeom, fabricMat);
  leftArm.position.set(-1.05, 0.55, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeom, fabricMat);
  rightArm.position.set(1.05, 0.55, 0);
  group.add(rightArm);

  // 4 tapered brass legs
  const legGeom = new THREE.CylinderGeometry(0.02, 0.012, 0.15, 8);
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.25 });
  const legOffsets = [
    [-0.95, -0.38],
    [0.95, -0.38],
    [-0.95, 0.38],
    [0.95, 0.38],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeom, brassMat);
    leg.position.set(lx, 0.075, lz);
    group.add(leg);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 21. Minimalist Coffee Table
 */
export function createCoffeeTableMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const tableColor = parseColor(customProps?.colorTint, 0x1e293b);

  // Circular tabletop disc (Child 0)
  const topGeom = new THREE.CylinderGeometry(0.45, 0.45, 0.03, 32);
  const topMat = new THREE.MeshStandardMaterial({ color: tableColor, roughness: 0.4, metalness: 0.1 });
  const top = new THREE.Mesh(topGeom, topMat);
  top.position.set(0, 0.405, 0);
  group.add(top);

  // Tripod angled legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
  const legGeom = new THREE.CylinderGeometry(0.015, 0.012, 0.42, 12);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(Math.sin(angle) * 0.22, 0.2, Math.cos(angle) * 0.22);
    leg.rotation.x = Math.cos(angle) * 0.18;
    leg.rotation.z = -Math.sin(angle) * 0.18;
    group.add(leg);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 22. 4-Tier Industrial Bookshelf
 */
export function createBookshelfMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const woodColor = parseColor(customProps?.colorTint, 0x78350f);

  // Main vertical frame (Child 0)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
  const postGeom = new THREE.BoxGeometry(0.04, 1.8, 0.04);
  const postOffsets = [
    [-0.48, -0.16],
    [0.48, -0.16],
    [-0.48, 0.16],
    [0.48, 0.16],
  ];
  for (const [px, pz] of postOffsets) {
    const post = new THREE.Mesh(postGeom, frameMat);
    post.position.set(px, 0.9, pz);
    group.add(post);
  }

  // 4 horizontal shelves
  const shelfGeom = new THREE.BoxGeometry(1.0, 0.03, 0.35);
  const shelfMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.7 });
  const shelfHeights = [0.15, 0.65, 1.15, 1.65];
  for (const sh of shelfHeights) {
    const shelf = new THREE.Mesh(shelfGeom, shelfMat);
    shelf.position.set(0, sh, 0);
    group.add(shelf);
  }

  // Procedural assorted books on shelves
  const bookColors = [0xdc2626, 0x2563eb, 0x16a34a, 0xd97706, 0x9333ea];
  for (let i = 0; i < 12; i++) {
    const bookGeom = new THREE.BoxGeometry(0.04, 0.22, 0.18);
    const bookMat = new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.8 });
    const book = new THREE.Mesh(bookGeom, bookMat);
    const shelfIdx = i % 3;
    book.position.set(-0.35 + (i % 4) * 0.06, shelfHeights[shelfIdx] + 0.125, 0);
    group.add(book);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 23. Workstation Computer Setup
 */
export function createComputerSetupMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const bodyColor = parseColor(customProps?.colorTint, 0x0f172a);

  // Monitor Display Screen (Child 0)
  const screenGeom = new THREE.BoxGeometry(0.85, 0.36, 0.03);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.2 });
  const screen = new THREE.Mesh(screenGeom, screenMat);
  screen.position.set(0, 0.3, -0.05);
  group.add(screen);

  // Monitor stand and gas-spring arm
  const standMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7, roughness: 0.3 });
  const armGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 12);
  const arm = new THREE.Mesh(armGeom, standMat);
  arm.position.set(0, 0.14, -0.08);
  group.add(arm);

  const baseGeom = new THREE.BoxGeometry(0.24, 0.01, 0.18);
  const base = new THREE.Mesh(baseGeom, standMat);
  base.position.set(0, 0.005, -0.05);
  group.add(base);

  // Keyboard
  const kbGeom = new THREE.BoxGeometry(0.44, 0.015, 0.14);
  const kbMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const kb = new THREE.Mesh(kbGeom, kbMat);
  kb.position.set(-0.04, 0.008, 0.14);
  group.add(kb);

  // Mouse
  const mouseGeom = new THREE.BoxGeometry(0.06, 0.025, 0.1);
  const mouse = new THREE.Mesh(mouseGeom, kbMat);
  mouse.position.set(0.26, 0.012, 0.14);
  group.add(mouse);

  // Gaming PC Tower
  const pcGeom = new THREE.BoxGeometry(0.2, 0.44, 0.4);
  const pcMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.2, metalness: 0.5 });
  const pc = new THREE.Mesh(pcGeom, pcMat);
  pc.position.set(0.5, 0.22, 0);
  group.add(pc);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 24. Potted Indoor Plant (Monstera / Fiddle Leaf)
 */
export function createIndoorPlantMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const potColor = parseColor(customProps?.colorTint, 0xf1f5f9);

  // Ceramic cylindrical pot (Child 0)
  const potGeom = new THREE.CylinderGeometry(0.22, 0.16, 0.38, 24);
  const potMat = new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.3 });
  const pot = new THREE.Mesh(potGeom, potMat);
  pot.position.set(0, 0.19, 0);
  group.add(pot);

  // Potting dark soil
  const soilGeom = new THREE.CylinderGeometry(0.21, 0.21, 0.02, 24);
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x271810, roughness: 0.95 });
  const soil = new THREE.Mesh(soilGeom, soilMat);
  soil.position.set(0, 0.37, 0);
  group.add(soil);

  // Central stalk stem
  const stemGeom = new THREE.CylinderGeometry(0.015, 0.02, 0.8, 8);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  const stem = new THREE.Mesh(stemGeom, stemMat);
  stem.position.set(0, 0.77, 0);
  group.add(stem);

  // Radiating curved fan leaves
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.4, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    const leafGeom = new THREE.PlaneGeometry(0.24, 0.36);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(Math.sin(angle) * 0.18, 0.6 + i * 0.08, Math.cos(angle) * 0.18);
    leaf.rotation.y = angle;
    leaf.rotation.x = 0.55;
    group.add(leaf);
  }

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 25. Plush Area Rug
 */
export function createPlushRugMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const rugColor = parseColor(customProps?.colorTint, 0x1e3a8a);

  const rugGeom = new THREE.BoxGeometry(2.4, 0.02, 1.8);
  const rugMat = new THREE.MeshStandardMaterial({ color: rugColor, roughness: 0.95 });
  const rug = new THREE.Mesh(rugGeom, rugMat);
  rug.position.set(0, 0.01, 0);
  group.add(rug);

  configureShadows(group);
  return alignToBottomCenter(group);
}

// ============================================================================
// 5. OUTDOOR DECOR GENERATORS
// ============================================================================

/**
 * 26. Natural Rock Cluster
 */
export function createRockClusterMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const rockColor = parseColor(customProps?.colorTint, 0x64748b);
  const rockMat = new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.95, flatShading: true });

  // Main boulder (Child 0)
  const geom1 = new THREE.DodecahedronGeometry(0.45, 1);
  const rock1 = new THREE.Mesh(geom1, rockMat);
  rock1.scale.set(1.1, 0.75, 1.0);
  rock1.position.set(0, 0.32, 0);
  group.add(rock1);

  // Secondary side boulder
  const geom2 = new THREE.DodecahedronGeometry(0.3, 1);
  const rock2 = new THREE.Mesh(geom2, rockMat);
  rock2.scale.set(0.9, 0.65, 0.9);
  rock2.position.set(0.42, 0.18, 0.22);
  rock2.rotation.y = 0.8;
  group.add(rock2);

  // Small tertiary stone
  const geom3 = new THREE.DodecahedronGeometry(0.2, 0);
  const rock3 = new THREE.Mesh(geom3, rockMat);
  rock3.position.set(-0.35, 0.12, 0.18);
  group.add(rock3);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 27. Garden Stepping Stones Pathway
 */
export function createSteppingStonesMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const stoneColor = parseColor(customProps?.colorTint, 0x94a3b8);
  const stoneMat = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 0.9, flatShading: true });

  // 5 flagstones placed along a gentle curve
  const stoneOffsets = [
    [-0.1, -1.5, 0.38],
    [0.12, -0.75, 0.42],
    [-0.08, 0.0, 0.4],
    [0.1, 0.75, 0.36],
    [-0.05, 1.5, 0.42],
  ];

  stoneOffsets.forEach(([sx, sz, radius], index) => {
    const stoneGeom = new THREE.CylinderGeometry(radius, radius * 1.05, 0.04, 9);
    const stone = new THREE.Mesh(stoneGeom, stoneMat);
    stone.position.set(sx, 0.02, sz);
    stone.rotation.y = index * 0.7;
    group.add(stone);
  });

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 28. Slatted Wooden Park Bench
 */
export function createWoodenBenchMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const woodColor = parseColor(customProps?.colorTint, 0x854d0e);

  // Wood slats material (Child 0 - Tintable)
  const slatMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.7 });
  const slatGeom = new THREE.BoxGeometry(1.6, 0.03, 0.08);

  // Seat slats (first slat added is Child 0)
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(slatGeom, slatMat);
    slat.position.set(0, 0.42, -0.15 + i * 0.1);
    group.add(slat);
  }

  // Backrest slats
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(slatGeom, slatMat);
    slat.position.set(0, 0.58 + i * 0.09, -0.22 - i * 0.02);
    group.add(slat);
  }

  // Cast iron side frames
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
  const frameGeom = new THREE.BoxGeometry(0.06, 0.75, 0.55);
  const leftFrame = new THREE.Mesh(frameGeom, ironMat);
  leftFrame.position.set(-0.75, 0.375, 0);
  group.add(leftFrame);

  const rightFrame = new THREE.Mesh(frameGeom, ironMat);
  rightFrame.position.set(0.75, 0.375, 0);
  group.add(rightFrame);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 29. Cedar Privacy Fence Module
 */
export function createGardenFenceMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const cedarColor = parseColor(customProps?.colorTint, 0xb45309);

  // Horizontal cedar privacy slats (Child 0)
  const slatMat = new THREE.MeshStandardMaterial({ color: cedarColor, roughness: 0.8 });
  const slatGeom = new THREE.BoxGeometry(1.9, 0.14, 0.02);
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(slatGeom, slatMat);
    slat.position.set(0, 0.12 + i * 0.16, 0);
    group.add(slat);
  }

  // Vertical 4x4 posts
  const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const postGeom = new THREE.BoxGeometry(0.1, 1.2, 0.1);
  const p1 = new THREE.Mesh(postGeom, postMat);
  p1.position.set(-0.95, 0.6, 0);
  group.add(p1);

  const p2 = new THREE.Mesh(postGeom, postMat);
  p2.position.set(0.95, 0.6, 0);
  group.add(p2);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 30. Stone Birdbath
 */
export function createBirdbathMesh(customProps?: CustomProps): THREE.Group {
  const group = new THREE.Group();
  const stoneColor = parseColor(customProps?.colorTint, 0x94a3b8);

  // Stone Pedestal & Basin (Child 0)
  const stoneMat = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 0.9 });
  const baseGeom = new THREE.CylinderGeometry(0.24, 0.28, 0.08, 16);
  const base = new THREE.Mesh(baseGeom, stoneMat);
  base.position.set(0, 0.04, 0);
  group.add(base);

  const colGeom = new THREE.CylinderGeometry(0.08, 0.11, 0.68, 16);
  const col = new THREE.Mesh(colGeom, stoneMat);
  col.position.set(0, 0.42, 0);
  group.add(col);

  const basinGeom = new THREE.CylinderGeometry(0.35, 0.22, 0.12, 24);
  const basin = new THREE.Mesh(basinGeom, stoneMat);
  basin.position.set(0, 0.82, 0);
  group.add(basin);

  // Inner reflective water surface
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.02,
    transmission: 0.85,
    transparent: true,
    opacity: 0.6,
  });
  const waterGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.02, 24);
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.position.set(0, 0.86, 0);
  group.add(water);

  configureShadows(group);
  return alignToBottomCenter(group);
}

/**
 * 31. Procedural Garden Tree
 */
export function createProceduralTreeMesh(customProps?: CustomProps): THREE.Group {
  const group = TreeFactory.createProceduralTree("oak", customProps);
  return alignToBottomCenter(group);
}

// ============================================================================
// 6. DECOR & POSTERS
// ============================================================================

/**
 * 32. Framed Wall Poster (Delegates to PosterFactory and aligns to bottom center)
 */
export function createPosterFrameMesh(customProps?: CustomProps): THREE.Group {
  const group = PosterFactory.createPosterFrame(customProps);
  return alignToBottomCenter(group);
}
