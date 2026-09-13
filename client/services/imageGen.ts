import { getLocalSession } from "@/lib/localSession";

export interface ImageModelInfo {
  provider: "horde";
  id: string;
  name: string;
  description: string;
  free: boolean;
  maxSteps: number;
  defaultSteps: number;
  aspectRatios: string[];
  workers?: number;
  queued?: number;
  eta?: number;
}

export interface ImageModelsResponse {
  horde: ImageModelInfo[];
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface GenerateImageParams {
  provider?: "horde";
  model: string;
  prompt: string;
  negative_prompt?: string;
  aspectRatio?: AspectRatio;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface GenerateProgress {
  phase: "submitting" | "queued" | "processing" | "completed" | "error";
  queuePosition?: number;
  waitTime?: number;
  progressPercent?: number;
  message?: string;
}

export interface GeneratedImageResult {
  id: string;
  url: string;
  prompt: string;
  negative_prompt?: string;
  provider: "horde";
  model: string;
  modelName?: string;
  seed?: string | number;
  timestamp: number;
  aspectRatio?: AspectRatio;
  storagePath?: string;
}

export const ASPECT_RATIO_DIMENSIONS: Record<
  AspectRatio,
  { label: string; width: number; height: number; ratioClass: string }
> = {
  "1:1": {
    label: "Square (1:1)",
    width: 512,
    height: 512,
    ratioClass: "aspect-square",
  },
  "16:9": {
    label: "Landscape (16:9)",
    width: 896,
    height: 512,
    ratioClass: "aspect-video",
  },
  "9:16": {
    label: "Portrait (9:16)",
    width: 512,
    height: 896,
    ratioClass: "aspect-[9/16]",
  },
  "4:3": {
    label: "Standard (4:3)",
    width: 640,
    height: 480,
    ratioClass: "aspect-[4/3]",
  },
  "3:4": {
    label: "Tall (3:4)",
    width: 480,
    height: 640,
    ratioClass: "aspect-[3/4]",
  },
};

export function getAuthToken(): string | undefined {
  try {
    return getLocalSession()?.access_token;
  } catch {
    return undefined;
  }
}

export async function fetchImageModels(): Promise<ImageModelsResponse> {
  const res = await fetch("/api/ai/image/models");
  if (!res.ok) {
    throw new Error("Failed to load image models");
  }
  return res.json();
}

export async function generateImage(
  params: GenerateImageParams,
  onProgress?: (p: GenerateProgress) => void,
): Promise<GeneratedImageResult> {
  const {
    provider = "horde",
    model,
    prompt,
    negative_prompt,
    aspectRatio = "1:1",
    steps,
    guidance,
    seed,
    signal,
  } = params;

  const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];
  // For SDXL or FLUX, scale up to 1024 base if square
  let targetWidth = dims.width;
  let targetHeight = dims.height;
  if (model.includes("flux") || model.includes("xl") || model.includes("XL")) {
    if (aspectRatio === "1:1") {
      targetWidth = 1024;
      targetHeight = 1024;
    } else if (aspectRatio === "16:9") {
      targetWidth = 1024;
      targetHeight = 576;
    } else if (aspectRatio === "9:16") {
      targetWidth = 576;
      targetHeight = 1024;
    }
  }

  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  onProgress?.({
    phase: "submitting",
    progressPercent: 10,
    message: "Submitting generation request...",
  });

  const body = {
    provider,
    model,
    prompt,
    negative_prompt,
    width: targetWidth,
    height: targetHeight,
    steps,
    guidance,
    seed,
  };

  const response = await fetch("/api/ai/image/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Generation failed with status ${response.status}`,
    );
  }

  const data = await response.json();

  // If asynchronous (AI Horde)
  if (data.async && data.id) {
    onProgress?.({
      phase: "queued",
      progressPercent: 20,
      message: "Queued in AI Horde network...",
    });

    const jobId = data.id;
    const startTime = Date.now();
    const maxWaitMs = 180_000; // 3 minutes timeout

    while (Date.now() - startTime < maxWaitMs) {
      if (signal?.aborted) {
        throw new Error("Generation aborted by user");
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusRes = await fetch(`/api/ai/image/status/${encodeURIComponent(jobId)}`, {
        signal,
      });

      if (!statusRes.ok) {
        const statusErr = await statusRes.json().catch(() => ({}));
        throw new Error(statusErr.error || "Failed checking generation status");
      }

      const statusData = await statusRes.json();

      if (statusData.faulted) {
        throw new Error(statusData.error || "Generation faulted on remote worker");
      }

      if (statusData.done && statusData.image) {
        onProgress?.({
          phase: "completed",
          progressPercent: 100,
          message: "Image generated successfully!",
        });

        return {
          id: jobId,
          url: statusData.image,
          prompt,
          negative_prompt,
          provider: "horde",
          model,
          seed: statusData.seed,
          timestamp: Date.now(),
          aspectRatio,
        };
      }

      const waitTime = statusData.wait_time || 0;
      const queuePos = statusData.queue_position || 0;
      const progressPercent = Math.min(
        85,
        Math.max(25, Math.floor(100 - (waitTime / 30) * 50)),
      );

      onProgress?.({
        phase: queuePos > 0 ? "queued" : "processing",
        queuePosition: queuePos,
        waitTime,
        progressPercent,
        message:
          queuePos > 0
            ? `In Queue (Position: ${queuePos}, ETA: ~${waitTime}s)`
            : `AI Horde worker generating image (ETA: ~${waitTime}s)...`,
      });
    }

    throw new Error("Generation timed out. Please try again.");
  }

  throw new Error("Unexpected generation response format");
}

export async function saveGeneratedImageToStorage(
  imageUrl: string,
  prompt: string,
): Promise<{ path: string; url: string; filename: string } | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch("/api/ai/image/save-to-storage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: imageUrl, prompt }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Auto-save image error:", err);
    return null;
  }
}
