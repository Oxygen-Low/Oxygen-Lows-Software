import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { storage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  Box,
  RotateCcw,
  Play,
  Pause,
  Maximize2,
  Grid,
  Loader2,
  AlertCircle,
  Download,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface Model3DPreviewProps {
  src?: string;
  filePath?: string;
  fileName?: string;
  bucket?: string;
  className?: string;
  variant?: "thumbnail" | "detail";
  interactive?: boolean;
  autoRotate?: boolean;
  showControls?: boolean;
  allowFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  onError?: (err: Error) => void;
  onLoaded?: (info: { vertexCount: number; triangleCount: number }) => void;
}

function checkWebGLSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(gl && gl instanceof WebGLRenderingContext);
  } catch {
    return false;
  }
}

export function Model3DPreview({
  src,
  filePath,
  fileName,
  bucket = "Storage",
  className,
  variant = "thumbnail",
  interactive = true,
  autoRotate = true,
  showControls = true,
  allowFullscreen = true,
  onOpenFullscreen,
  onError,
  onLoaded,
}: Model3DPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(autoRotate);
  const [isWireframe, setIsWireframe] = useState(false);
  const [metrics, setMetrics] = useState<{
    vertexCount: number;
    triangleCount: number;
  } | null>(null);

  // Fullscreen modal inspect state (for thumbnail view)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // References for Three.js instance
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const defaultCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(2.5, 2, 2.5));
  const defaultTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Determine effective display name / file extension
  const effectiveName = (
    fileName ||
    filePath ||
    src ||
    "model.glb"
  )
    .split("/")
    .pop()
    ?.split("?")[0] || "model.glb";

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Sync autoRotate state with controls
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isRotating;
    }
  }, [isRotating]);

  // Main 3D Scene Initialization and Model Loading
  useEffect(() => {
    let isCancelled = false;

    // Check WebGL availability
    if (!checkWebGLSupport()) {
      setIsLoading(false);
      setErrorMsg("WebGL not supported");
      return;
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // 1. Initialize Scene, Camera, Renderer
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 200;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 1000);
    camera.position.copy(defaultCamPosRef.current);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "default",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg("Failed to initialize WebGL context");
      return;
    }

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x88bbff, 0.7);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // 3. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = isRotating;
    controls.autoRotateSpeed = 2.0;
    controls.enabled = interactive;
    controls.enableZoom = variant === "detail" ? true : false;
    controls.target.copy(defaultTargetRef.current);

    // 4. Animation loop
    const animate = () => {
      if (isCancelled) return;
      controls.update();
      renderer.render(scene, camera);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };
    animFrameIdRef.current = requestAnimationFrame(animate);

    // 5. Resize handler
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight, false);
        }
      }
    });
    resizeObserver.observe(container);

    // 6. Model Loader
    const loadModel = async () => {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        let modelUrl: string | null = null;

        // Resolve source URL
        if (src && (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:"))) {
          modelUrl = src;
        } else if (filePath || fileName) {
          const cleanPath = (filePath || fileName || "").replace(/^\/+/, "");

          // Attempt signed URL
          const { data: signedData } = await storage
            .from(bucket)
            .createSignedUrl(cleanPath, 3600)
            .catch(() => ({ data: null }));

          if (signedData?.signedUrl) {
            modelUrl = signedData.signedUrl;
          } else if (bucket === "public-assets") {
            const { data: pubData } = storage
              .from("public-assets")
              .getPublicUrl(cleanPath);
            if (pubData?.publicUrl) modelUrl = pubData.publicUrl;
          }

          if (!modelUrl) {
            // Fallback download blob
            const { data: blobData, error: dlErr } = await storage
              .from(bucket)
              .download(cleanPath);
            if (!dlErr && blobData) {
              if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
              blobUrlRef.current = URL.createObjectURL(blobData);
              modelUrl = blobUrlRef.current;
            }
          }
        }

        if (!modelUrl) {
          throw new Error("Could not resolve model file URL");
        }

        if (isCancelled) return;

        // Determine loader by extension
        const lowerName = effectiveName.toLowerCase();
        let loadedObject: THREE.Object3D;

        if (lowerName.endsWith(".obj")) {
          const objLoader = new OBJLoader();
          loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
            objLoader.load(modelUrl!, resolve, undefined, reject);
          });
        } else if (lowerName.endsWith(".stl")) {
          const stlLoader = new STLLoader();
          const geom = await new Promise<THREE.BufferGeometry>(
            (resolve, reject) => {
              stlLoader.load(modelUrl!, resolve, undefined, reject);
            },
          );
          const mat = new THREE.MeshStandardMaterial({
            color: 0x90caf9,
            roughness: 0.4,
            metalness: 0.2,
          });
          loadedObject = new THREE.Mesh(geom, mat);
        } else {
          // Default GLTF / GLB Loader
          const gltfLoader = new GLTFLoader();
          try {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath(
              "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
            );
            gltfLoader.setDRACOLoader(dracoLoader);
          } catch {
            // Graceful fallback without draco
          }

          const gltf = await new Promise<any>((resolve, reject) => {
            gltfLoader.load(modelUrl!, resolve, undefined, reject);
          });
          loadedObject = gltf.scene || gltf.scenes?.[0];
        }

        if (isCancelled || !loadedObject) return;

        // Audit metrics & center model
        let verts = 0;
        let tris = 0;
        loadedObject.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            if (m.material) {
              const mats = Array.isArray(m.material)
                ? m.material
                : [m.material];
              mats.forEach((mat) => {
                mat.side = THREE.DoubleSide;
              });
            }
            if (m.geometry) {
              const g = m.geometry;
              const posCount = g.attributes.position
                ? g.attributes.position.count
                : 0;
              verts += posCount;
              tris += g.index ? g.index.count / 3 : posCount / 3;
            }
          }
        });

        const calculatedMetrics = {
          vertexCount: verts,
          triangleCount: Math.round(tris),
        };
        setMetrics(calculatedMetrics);
        onLoaded?.(calculatedMetrics);

        // Normalize scale and center
        loadedObject.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(loadedObject);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const targetDim = 2.0;
        const scaleFactor = targetDim / maxDim;

        loadedObject.scale.set(
          loadedObject.scale.x * scaleFactor,
          loadedObject.scale.y * scaleFactor,
          loadedObject.scale.z * scaleFactor,
        );

        // Re-center scaled model at (0, 0, 0)
        loadedObject.position.set(
          -center.x * scaleFactor,
          -center.y * scaleFactor,
          -center.z * scaleFactor,
        );

        const group = new THREE.Group();
        group.add(loadedObject);
        scene.add(group);
        modelRef.current = group;

        // Position camera to fit object
        const fov = camera.fov * (Math.PI / 180);
        let cameraDist = Math.abs((targetDim / 2) / Math.tan(fov / 2)) * 1.5;
        camera.position.set(cameraDist * 0.8, cameraDist * 0.6, cameraDist * 1.0);
        controls.target.set(0, 0, 0);
        controls.update();

        defaultCamPosRef.current.copy(camera.position);
        defaultTargetRef.current.set(0, 0, 0);

        setIsLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        setIsLoading(false);
        setErrorMsg(err?.message || "Failed to load 3D model");
        onError?.(err);
      }
    };

    loadModel();

    // 7. Cleanup
    return () => {
      isCancelled = true;
      resizeObserver.disconnect();

      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      if (modelRef.current && sceneRef.current) {
        sceneRef.current.remove(modelRef.current);
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.geometry?.dispose();
            if (m.material) {
              const mats = Array.isArray(m.material)
                ? m.material
                : [m.material];
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
        modelRef.current = null;
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [src, filePath, fileName, bucket, effectiveName, variant, interactive]);

  // Wireframe toggle effect
  const toggleWireframe = useCallback(() => {
    setIsWireframe((prev) => {
      const next = !prev;
      if (modelRef.current) {
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            if (m.material) {
              const mats = Array.isArray(m.material)
                ? m.material
                : [m.material];
              mats.forEach((mat) => {
                (mat as any).wireframe = next;
              });
            }
          }
        });
      }
      return next;
    });
  }, []);

  // Reset Camera View
  const handleResetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(defaultCamPosRef.current);
      controlsRef.current.target.copy(defaultTargetRef.current);
      controlsRef.current.update();
    }
  }, []);

  const handleOpenExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onOpenFullscreen) {
        onOpenFullscreen();
      } else {
        setIsModalOpen(true);
      }
    },
    [onOpenFullscreen],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-slate-950/60 overflow-hidden select-none flex items-center justify-center",
        className,
      )}
      onDoubleClick={handleResetCamera}
    >
      {/* Three.js WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing focus:outline-none"
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs gap-2 z-10">
          <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
          <span className="text-xs text-slate-300 font-medium">
            Loading 3D preview...
          </span>
        </div>
      )}

      {/* Error Fallback Overlay */}
      {errorMsg && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-4 text-center gap-2 z-10">
          <Box className="w-10 h-10 text-purple-400/80 mb-1" />
          <p className="text-xs text-slate-300 font-medium truncate max-w-xs">
            {effectiveName}
          </p>
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-purple-500/40 text-purple-300 bg-purple-950/40"
          >
            3D Model
          </Badge>
          <span className="text-[11px] text-slate-500 max-w-[200px]">
            {errorMsg === "WebGL not supported"
              ? "WebGL preview unavailable in this environment."
              : errorMsg}
          </span>
          {allowFullscreen && variant === "thumbnail" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-7 text-xs border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300"
              onClick={handleOpenExpand}
              title="Open Interactive 3D Viewer"
            >
              <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
              3D Viewer
            </Button>
          )}
        </div>
      )}

      {/* Top Badges / Info (Thumbnail and Detail) */}
      {!isLoading && !errorMsg && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
          <Badge
            variant="outline"
            className="bg-slate-900/80 backdrop-blur-sm border-purple-500/40 text-purple-300 text-[10px] px-1.5 py-0 flex items-center gap-1"
          >
            <Box className="w-3 h-3 text-purple-400" />
            3D
          </Badge>
          {variant === "detail" && metrics && (
            <Badge
              variant="outline"
              className="bg-slate-900/80 backdrop-blur-sm border-slate-700 text-slate-300 text-[10px] px-1.5 py-0"
            >
              {(metrics.triangleCount / 1000).toFixed(1)}k tris
            </Badge>
          )}
        </div>
      )}

      {/* Control Overlay Buttons */}
      {!isLoading && !errorMsg && showControls && (
        <div
          className="absolute top-2 right-2 flex items-center gap-1 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === "detail" ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-7 w-7 bg-slate-900/80 backdrop-blur-sm border-slate-700 hover:bg-slate-800 text-slate-300",
                  isWireframe && "text-purple-400 border-purple-500/50 bg-purple-950/40",
                )}
                onClick={toggleWireframe}
                title="Toggle Wireframe"
              >
                <Grid className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-7 w-7 bg-slate-900/80 backdrop-blur-sm border-slate-700 hover:bg-slate-800 text-slate-300",
                  isRotating && "text-purple-400 border-purple-500/50",
                )}
                onClick={() => setIsRotating((r) => !r)}
                title={isRotating ? "Pause Auto-Rotation" : "Resume Auto-Rotation"}
              >
                {isRotating ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-slate-900/80 backdrop-blur-sm border-slate-700 hover:bg-slate-800 text-slate-300"
                onClick={handleResetCamera}
                title="Reset Camera View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            allowFullscreen && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-slate-900/80 backdrop-blur-sm border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white"
                onClick={handleOpenExpand}
                title="Open Interactive 3D Viewer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            )
          )}
        </div>
      )}

      {/* Built-in Modal for Interactive Inspection when clicked from Thumbnail */}
      {isModalOpen && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent
            className="max-w-4xl bg-slate-950 border-slate-800 text-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg text-white">
                <Box className="w-5 h-5 text-purple-400" />
                {effectiveName}
              </DialogTitle>
            </DialogHeader>

            <div className="w-full h-[450px] rounded-lg overflow-hidden border border-slate-800 bg-slate-900/60 relative">
              <Model3DPreview
                src={src}
                filePath={filePath}
                fileName={fileName}
                bucket={bucket}
                variant="detail"
                interactive={true}
                autoRotate={false}
                allowFullscreen={false}
                className="w-full h-full"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default Model3DPreview;
