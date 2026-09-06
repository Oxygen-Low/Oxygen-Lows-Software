import * as THREE from "three";
import { CustomProps, PosterFrameStyle } from "@/types/threeDBackground";

export interface PosterDimensions {
  aspectRatio: number;
  artWidth: number;
  artHeight: number;
  matMargin: number;
  frameThickness: number;
  frameDepth: number;
  totalWidth: number;
  totalHeight: number;
  // Aliases for test & E2E compatibility
  width: number;
  height: number;
}

export interface CreatePosterOptions {
  baseHeight?: number; // Base artwork height (default 1.0m)
  targetWidth?: number; // Explicit target width (if provided)
  includeGlass?: boolean; // Default true (false for frameless)
  includeMat?: boolean; // Default true (false for frameless)
  texture?: THREE.Texture;
}

export interface WallPlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  euler: [number, number, number];
}

export interface FrameStyleConfig {
  color: number;
  roughness: number;
  metalness: number;
  name: string;
}

export class PosterFactory {
  // Physical Architectural Dimensions (meters)
  public static readonly DEFAULT_BASE_HEIGHT = 1.0; // 1.0m base artwork height
  public static readonly DEFAULT_WIDTH = 1.2; // 1.2m compatibility default
  public static readonly DEFAULT_MAT_MARGIN = 0.08; // 0.08m passe-partout margin
  public static readonly DEFAULT_FRAME_THICKNESS = 0.04; // 0.04m molding thickness
  public static readonly DEFAULT_FRAME_DEPTH = 0.03; // 0.03m molding depth
  public static readonly ANTI_Z_FIGHTING_OFFSET = 0.02; // +0.02m normal clearance

  // 5 Supported Frame Styles
  public static readonly FRAME_STYLES: Record<PosterFrameStyle, FrameStyleConfig> = {
    modern_black: {
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.2,
      name: "Modern Matte Black",
    },
    oak_wood: {
      color: 0x8b5a2b,
      roughness: 0.8,
      metalness: 0.0,
      name: "Warm Oak Woodgrain",
    },
    brushed_gold: {
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.8,
      name: "Brushed Brass / Gold",
    },
    white_minimal: {
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.0,
      name: "Crisp White Studio",
    },
    frameless: {
      color: 0x111827,
      roughness: 0.9,
      metalness: 0.0,
      name: "Frameless Canvas Wrap",
    },
  };

  /**
   * Calculates dynamic dimensions based on image pixel dimensions or aspect ratio.
   * Throws if naturalWidth or naturalHeight are non-positive or invalid.
   */
  public static calculateDimensions(
    naturalWidth: number,
    naturalHeight: number,
    targetDimension?: number,
    dimensionType: "width" | "height" = "width",
  ): PosterDimensions {
    if (
      !Number.isFinite(naturalWidth) ||
      !Number.isFinite(naturalHeight) ||
      naturalWidth <= 0 ||
      naturalHeight <= 0
    ) {
      throw new Error(
        "Invalid image dimensions: naturalWidth and naturalHeight must be positive",
      );
    }

    const aspectRatio = naturalWidth / naturalHeight;
    let artWidth: number;
    let artHeight: number;

    if (targetDimension !== undefined && targetDimension > 0) {
      if (dimensionType === "width") {
        artWidth = targetDimension;
        artHeight = targetDimension / aspectRatio;
      } else {
        artHeight = targetDimension;
        artWidth = targetDimension * aspectRatio;
      }
    } else {
      artHeight = PosterFactory.DEFAULT_BASE_HEIGHT; // 1.0m
      artWidth = artHeight * aspectRatio;
    }

    const matMargin = PosterFactory.DEFAULT_MAT_MARGIN;
    const frameThickness = PosterFactory.DEFAULT_FRAME_THICKNESS;
    const frameDepth = PosterFactory.DEFAULT_FRAME_DEPTH;

    const totalWidth = artWidth + 2 * (matMargin + frameThickness);
    const totalHeight = artHeight + 2 * (matMargin + frameThickness);

    return {
      aspectRatio,
      artWidth,
      artHeight,
      matMargin,
      frameThickness,
      frameDepth,
      totalWidth,
      totalHeight,
      width: artWidth,
      height: artHeight,
    };
  }

  /**
   * Reads natural dimensions and computes aspect ratio from an HTMLImageElement,
   * URL string, or Blob/File.
   */
  public static async getDimensionsFromImage(
    source: HTMLImageElement | string | Blob,
  ): Promise<{ naturalWidth: number; naturalHeight: number; aspectRatio: number }> {
    if (typeof source === "object" && "naturalWidth" in source) {
      const img = source as HTMLImageElement;
      if (img.complete && img.naturalWidth > 0) {
        return {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight,
        };
      }
      if (typeof img.decode === "function") {
        try {
          await img.decode();
          return {
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            aspectRatio: img.naturalWidth / img.naturalHeight,
          };
        } catch {
          // Fall through to standard check
        }
      }
      if (img.naturalWidth > 0) {
        return {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight,
        };
      }
    }

    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" && typeof Image === "undefined") {
        reject(new Error("Image API not available in current runtime"));
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      let objectUrl: string | null = null;

      if (source instanceof Blob) {
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          objectUrl = URL.createObjectURL(source);
          img.src = objectUrl;
        } else {
          reject(new Error("URL.createObjectURL not available"));
          return;
        }
      } else if (typeof source === "string") {
        img.src = source;
      } else {
        reject(new Error("Unsupported image source type"));
        return;
      }

      img.onload = () => {
        if (objectUrl && typeof URL !== "undefined") URL.revokeObjectURL(objectUrl);
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
          reject(new Error("Invalid image dimensions detected"));
          return;
        }
        resolve({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight,
        });
      };

      img.onerror = () => {
        if (objectUrl && typeof URL !== "undefined") URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load or decode image"));
      };
    });
  }

  /**
   * Loads a THREE.Texture from an image source with sRGB color space and mipmaps.
   */
  public static async loadPosterTexture(
    source: HTMLImageElement | string | Blob,
  ): Promise<THREE.Texture> {
    if (typeof source === "object" && "naturalWidth" in source) {
      const texture = new THREE.Texture(source as HTMLImageElement);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    }

    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      let url = "";
      let isBlob = false;

      if (source instanceof Blob) {
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          url = URL.createObjectURL(source);
          isBlob = true;
        } else {
          reject(new Error("URL.createObjectURL not available"));
          return;
        }
      } else if (typeof source === "string") {
        url = source;
      }

      loader.load(
        url,
        (tex) => {
          if (isBlob && typeof URL !== "undefined") URL.revokeObjectURL(url);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        (err) => {
          if (isBlob && typeof URL !== "undefined") URL.revokeObjectURL(url);
          reject(err);
        },
      );
    });
  }

  /**
   * Generates a procedural placeholder canvas texture when no image URL is provided.
   */
  public static createPlaceholderTexture(
    colorTint?: string,
    aspectRatio: number = 1.0,
  ): THREE.Texture {
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = Math.round(512 / (aspectRatio > 0 ? aspectRatio : 1.0));
      const ctx = canvas.getContext("2d");

      if (ctx) {
        const baseColor = colorTint || "#3B82F6";
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle modern geometric gradient accent
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0.35)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Delicate inner border line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 4;
        ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }

    // Fallback data texture for non-DOM / Node environments
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size * 4; i += 4) {
      data[i] = 59; // R
      data[i + 1] = 130; // G
      data[i + 2] = 246; // B
      data[i + 3] = 255; // A
    }
    const dataTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    dataTexture.colorSpace = THREE.SRGBColorSpace;
    dataTexture.needsUpdate = true;
    return dataTexture;
  }

  /**
   * Builds the complete 3D compound mesh hierarchy for a poster frame.
   */
  public static createPosterFrame(
    customProps?: CustomProps,
    options?: CreatePosterOptions,
  ): THREE.Group {
    const group = new THREE.Group();
    const style: PosterFrameStyle = customProps?.frameStyle || "modern_black";
    const aspectRatio = customProps?.aspectRatio || 1.0;

    // Use targetWidth if specified, otherwise calculate dimensions
    const targetWidth =
      options?.targetWidth ??
      (options?.baseHeight ? undefined : PosterFactory.DEFAULT_WIDTH);

    const dims =
      options?.baseHeight !== undefined && options?.targetWidth === undefined
        ? PosterFactory.calculateDimensions(
            aspectRatio * 1000,
            1000,
            options.baseHeight,
            "height",
          )
        : PosterFactory.calculateDimensions(
            aspectRatio * 1000,
            1000,
            targetWidth,
            "width",
          );

    const isFrameless = style === "frameless";
    const frameConfig = PosterFactory.FRAME_STYLES[style] || PosterFactory.FRAME_STYLES.modern_black;

    const frameDepth = dims.frameDepth;
    const borderThickness = isFrameless ? 0 : dims.frameThickness;

    // 1. Backing & Molding Frame (Only when not frameless)
    if (!isFrameless) {
      const frameGeom = new THREE.BoxGeometry(
        dims.width + borderThickness * 2,
        dims.height + borderThickness * 2,
        frameDepth,
      );
      const frameMat = new THREE.MeshStandardMaterial({
        color: frameConfig.color,
        roughness: frameConfig.roughness,
        metalness: frameConfig.metalness,
      });
      const frameMesh = new THREE.Mesh(frameGeom, frameMat);
      frameMesh.name = "frame-border";
      frameMesh.castShadow = true;
      frameMesh.receiveShadow = true;
      group.add(frameMesh);

      // Mat Board (Passe-partout)
      if (options?.includeMat !== false) {
        const matGeom = new THREE.PlaneGeometry(
          dims.width + dims.matMargin * 2,
          dims.height + dims.matMargin * 2,
        );
        const matMaterial = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.9,
          metalness: 0.0,
        });
        const matMesh = new THREE.Mesh(matGeom, matMaterial);
        matMesh.name = "poster-mat";
        matMesh.position.z = 0.015;
        group.add(matMesh);
      }

      // Protective Glass Cover
      if (options?.includeGlass !== false) {
        const glassGeom = new THREE.PlaneGeometry(
          dims.width + dims.matMargin * 2,
          dims.height + dims.matMargin * 2,
        );
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transmission: 0.95,
          roughness: 0.02,
          ior: 1.5,
          transparent: true,
          depthWrite: false,
        });
        const glassMesh = new THREE.Mesh(glassGeom, glassMat);
        glassMesh.name = "poster-glass";
        glassMesh.position.z = 0.025;
        group.add(glassMesh);
      }
    }

    // 2. Artwork Canvas Mesh
    const canvasGeom = new THREE.PlaneGeometry(dims.width, dims.height);
    let canvasMat: THREE.MeshStandardMaterial;

    if (options?.texture) {
      canvasMat = new THREE.MeshStandardMaterial({
        map: options.texture,
        roughness: 0.8,
      });
    } else if (customProps?.colorTint) {
      const tintColor = new THREE.Color(customProps.colorTint);
      canvasMat = new THREE.MeshStandardMaterial({
        color: tintColor,
        roughness: 0.8,
      });
    } else {
      canvasMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
      });
    }

    const canvasMesh = new THREE.Mesh(canvasGeom, canvasMat);
    canvasMesh.name = "poster-canvas";
    // Positioned strictly > 0.02m to satisfy z-fighting and test assertions (0.021m)
    canvasMesh.position.z = isFrameless ? 0.025 : frameDepth * 0.5 + 0.006;
    canvasMesh.receiveShadow = true;
    group.add(canvasMesh);

    // 3. UserData & Metadata Tagging
    group.name = "decor_poster_frame";
    group.userData = {
      isRoomObject: true,
      catalogId: "decor_poster_frame",
      aspectRatio,
      frameStyle: style,
      dimensions: dims,
      customProps: {
        ...customProps,
        aspectRatio,
        frameStyle: style,
      },
    };

    return group;
  }

  /**
   * Snaps poster orientation to wall surface normal vector.
   * Returns Euler angles [x, y, z] in radians ('YXZ' order).
   */
  public static snapToWallNormal(wallNormal: THREE.Vector3): [number, number, number] {
    if (wallNormal.lengthSq() === 0) {
      return [0, 0, 0];
    }
    const normal = wallNormal.clone().normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");
    return [euler.x, euler.y, euler.z];
  }

  /**
   * Calculates wall placement position and orientation from raycast hit point and normal.
   * Shifts position +0.02m along surface normal to eliminate z-fighting.
   */
  public static calculateWallPlacement(
    hitPoint: THREE.Vector3,
    wallNormal: THREE.Vector3,
  ): WallPlacement {
    const normal = wallNormal.clone().normalize();
    const position = hitPoint
      .clone()
      .addScaledVector(normal, PosterFactory.ANTI_Z_FIGHTING_OFFSET);

    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");

    return {
      position,
      quaternion,
      euler: [euler.x, euler.y, euler.z],
    };
  }

  /**
   * Recursively disposes all geometries, materials, and attached textures in a poster group.
   */
  public static disposePoster(poster: THREE.Group): void {
    poster.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => {
              if ("map" in mat && mat.map) (mat.map as THREE.Texture).dispose();
              mat.dispose();
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
    poster.clear();
  }
}
