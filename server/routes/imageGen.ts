import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import { queryTable } from "../lib/dataStore.ts";
import { serverStorage } from "../lib/storage.ts";
import { extractBearerToken, stripHtmlTags } from "./ai.ts";
import { scanText, scanImage } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateText,
  moderateImage,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";

export const imageGenRouter = new Hono();

const imageLimiter = rateLimiter(20, 60_000, "image_gen");

export interface CuratedModelPreset {
  id: string;
  name: string;
  description: string;
  baseHordeModel: string;
  stylePrompt: string;
  negativePromptAdditions: string;
  defaultSteps: number;
  maxSteps: number;
  aspectRatios: string[];
}

export const IMAGE_GENERATOR_PRESETS: CuratedModelPreset[] = [
  {
    id: "quality",
    name: "Quality",
    description: "High-resolution photorealistic checkpoint with maximum detail and clarity",
    baseHordeModel: "SDXL 1.0",
    stylePrompt: "masterpiece, ultra detailed, sharp focus, 8k resolution, high fidelity",
    negativePromptAdditions: "blurry, low quality, artifacts, distorted, noisy",
    defaultSteps: 25,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    id: "pixel_art",
    name: "Pixel Art",
    description: "Retro 16-bit pixel graphic and nostalgic arcade game aesthetic",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "pixel art, 16-bit pixel graphic, detailed pixelated style, retro game sprite aesthetic",
    negativePromptAdditions: "photorealistic, 3D render, realistic photo, smooth gradients, vector, blurry",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
  {
    id: "fast",
    name: "Fast",
    description: "Rapid lightweight generation optimized for quick previews and speed",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "",
    negativePromptAdditions: "blurry, low quality",
    defaultSteps: 15,
    maxSteps: 25,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
  {
    id: "anime",
    name: "Anime",
    description: "Vibrant studio anime artwork with clean lines and stylized shading",
    baseHordeModel: "DreamShaper",
    stylePrompt: "anime artwork, anime key visual, studio anime aesthetic, vibrant anime colors, clean lineart",
    negativePromptAdditions: "photorealistic, real photo, 3D CGI, deformed, disfigured",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    id: "realistic",
    name: "Realistic",
    description: "Authentic 35mm photographic realism with natural depth and lighting",
    baseHordeModel: "ICBINP - I Can't Believe It's Not Photography",
    stylePrompt: "photorealistic, 35mm photography, realistic lighting, highly detailed photograph, RAW photo",
    negativePromptAdditions: "drawing, painting, illustration, cartoon, anime, 3d render, CGI, unrealistic",
    defaultSteps: 25,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    id: "cartoon",
    name: "Cartoon",
    description: "Playful character designs, expressive shapes, and bold cartoon colors",
    baseHordeModel: "Deliberate",
    stylePrompt: "cartoon illustration, vibrant cartoon style, expressive stylized character, 2D animation art",
    negativePromptAdditions: "photorealistic, real life photo, 3D render, dark, gritty",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    id: "simplistic",
    name: "simplistic",
    description: "Clean minimalist design with simple shapes, flat colors, and elegant lines",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "simplistic minimalist illustration, flat art style, clean simple shapes, minimalist design, elegant minimalism",
    negativePromptAdditions: "cluttered, busy, complex background, hyperdetailed, photorealistic, chaotic",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  },
];

export const HORDE_SFW_CURATED = IMAGE_GENERATOR_PRESETS.map((p) => ({
  provider: "horde" as const,
  id: p.id,
  name: p.name,
  description: p.description,
  free: true,
  maxSteps: p.maxSteps,
  defaultSteps: p.defaultSteps,
  aspectRatios: p.aspectRatios,
}));

// GET /api/ai/image/models
imageGenRouter.get("/models", imageLimiter, async (c) => {
  let hordeModels = IMAGE_GENERATOR_PRESETS.map((p) => ({
    provider: "horde" as const,
    id: p.id,
    name: p.name,
    description: p.description,
    free: true,
    maxSteps: p.maxSteps,
    defaultSteps: p.defaultSteps,
    aspectRatios: p.aspectRatios,
    workers: 0,
    queued: 0,
    eta: 0,
  }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=image",
      {
        signal: controller.signal,
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:anonymous" },
      },
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const activeHordeList: any[] = await res.json();
      const statusByName = new Map<string, any>();
      for (const m of activeHordeList) {
        if (m.name) statusByName.set(m.name, m);
      }

      // Enrich the 7 presets with live availability from their underlying Horde models
      hordeModels = IMAGE_GENERATOR_PRESETS.map((preset) => {
        const live = statusByName.get(preset.baseHordeModel);
        return {
          provider: "horde" as const,
          id: preset.id,
          name: preset.name,
          description: preset.description,
          free: true,
          maxSteps: preset.maxSteps,
          defaultSteps: preset.defaultSteps,
          aspectRatios: preset.aspectRatios,
          workers: live ? live.count || 0 : 0,
          queued: live ? live.queued || 0 : 0,
          eta: live ? live.eta || 0 : 0,
        };
      });
    }
  } catch (err) {
    // Graceful fallback to static curated list
  }

  return c.json({
    horde: hordeModels,
  });
});

// POST /api/ai/image/generate
imageGenRouter.post("/generate", imageLimiter, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const {
    provider,
    model,
    prompt: rawPrompt,
    negative_prompt: rawNegPrompt,
    width: rawWidth,
    height: rawHeight,
    steps: rawSteps,
    guidance: rawGuidance,
    seed: rawSeed,
  } = body || {};

  if (!provider || provider !== "horde") {
    return c.json({ error: "Invalid provider. Must be horde" }, 400);
  }

  const prompt = stripHtmlTags(rawPrompt || "").trim();
  if (!prompt || prompt.length === 0) {
    return c.json({ error: "Prompt is required" }, 400);
  }
  if (prompt.length > 2000) {
    return c.json({ error: "Prompt exceeds maximum length of 2000 characters" }, 400);
  }

  const negative_prompt = rawNegPrompt
    ? stripHtmlTags(String(rawNegPrompt)).trim().slice(0, 1000)
    : "";

  const width = Math.min(Math.max(Number(rawWidth) || 512, 256), 1024);
  const height = Math.min(Math.max(Number(rawHeight) || 512, 256), 1024);
  const steps = Math.min(Math.max(Number(rawSteps) || 20, 1), 50);
  const guidance = Math.min(Math.max(Number(rawGuidance) || 7.5, 1), 20);
  const seed =
    rawSeed !== undefined && !isNaN(Number(rawSeed))
      ? Math.floor(Number(rawSeed))
      : undefined;

  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  let user: any = null;
  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }

  // Pre-generation CSAM & Child Safety Scanning
  const combinedText = `${prompt} ${negative_prompt}`;
  const textSafetyResult = await scanText(combinedText);
  if (!textSafetyResult.safe && textSafetyResult.severity >= 2) {
    const ip = extractClientIp(c);
    const userAgent = c.req.header("user-agent");
    const lockdown = await executeZeroToleranceLockdown({
      ip,
      user,
      userAgent,
      surface: "image_gen_prompt",
      promptText: prompt,
      severity: textSafetyResult.severity,
      reason: textSafetyResult.reason || "Prohibited minor safety or child exploitation pattern in prompt",
    });
    return c.json(lockdown.clientResponse, 400);
  }

  // Post-CSAM OpenAI Text Moderation Scanning
  const openAiMod = await moderateText(combinedText);
  if (!openAiMod.allowed) {
    const ip = extractClientIp(c);
    const userAgent = c.req.header("user-agent");
    const enforcement = await handleModerationEnforcement(openAiMod, {
      ip,
      user,
      userAgent,
      surface: "image_gen_prompt",
      promptText: prompt,
    });
    if (enforcement) {
      return c.json(enforcement.clientResponse, 400);
    }
  }

  if (provider === "horde") {
    let hordeApiKey = "0000000000";

    const requestedModel = String(model || "quality").trim();
    const matchedPreset = IMAGE_GENERATOR_PRESETS.find(
      (p) =>
        p.id.toLowerCase() === requestedModel.toLowerCase() ||
        p.name.toLowerCase() === requestedModel.toLowerCase(),
    );

    const baseHordeModel = matchedPreset ? matchedPreset.baseHordeModel : requestedModel;
    const responseModelName = matchedPreset ? matchedPreset.name : requestedModel;

    // Enhance prompt with preset style if applicable
    let enhancedPrompt = prompt;
    if (
      matchedPreset?.stylePrompt &&
      !prompt.toLowerCase().includes(matchedPreset.stylePrompt.toLowerCase())
    ) {
      enhancedPrompt = `${prompt}, ${matchedPreset.stylePrompt}`;
    }

    // Enhance negative prompt with preset exclusions and server-enforced child safety exclusions
    const SERVER_SAFETY_NEGATIVE = "child, minor, underage, infant, sexual, nsfw";
    let enhancedNegativePrompt = negative_prompt;
    if (matchedPreset?.negativePromptAdditions) {
      if (enhancedNegativePrompt) {
        enhancedNegativePrompt = `${enhancedNegativePrompt}, ${matchedPreset.negativePromptAdditions}, ${SERVER_SAFETY_NEGATIVE}`;
      } else {
        enhancedNegativePrompt = `${matchedPreset.negativePromptAdditions}, ${SERVER_SAFETY_NEGATIVE}`;
      }
    } else {
      enhancedNegativePrompt = enhancedNegativePrompt
        ? `${enhancedNegativePrompt}, ${SERVER_SAFETY_NEGATIVE}`
        : SERVER_SAFETY_NEGATIVE;
    }

    const fullPrompt = enhancedNegativePrompt
      ? `${enhancedPrompt} ### ${enhancedNegativePrompt}`
      : enhancedPrompt;

    const maxStepsAllowed = matchedPreset ? matchedPreset.maxSteps : 30;

    const hordePayload = {
      prompt: fullPrompt,
      params: {
        sampler_name: "k_euler",
        cfg_scale: guidance,
        steps: Math.min(steps, maxStepsAllowed),
        width,
        height,
        seed: seed !== undefined ? String(seed) : undefined,
        n: 1,
      },
      nsfw: false,
      censor_nsfw: true,
      models: [baseHordeModel],
    };

    try {
      const response = await fetch("https://stablehorde.net/api/v2/generate/async", {
        method: "POST",
        headers: {
          apikey: hordeApiKey,
          "Client-Agent": "OxygenLowsSoftware:1.0:image-gen",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(hordePayload),
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        console.error("AI Horde Gen Error:", response.status, errorData);
        return c.json(
          {
            error:
              errorData.message ||
              "AI Horde is currently busy. Please try another model or retry.",
          },
          response.status as any,
        );
      }

      const data: any = await response.json();
      return c.json({
        success: true,
        async: true,
        id: data.id,
        kudos: data.kudos,
        provider: "horde",
        model: responseModelName,
      });
    } catch (err: any) {
      console.error("AI Horde Submit Error:", err);
      return c.json({ error: "Failed to connect to AI Horde network." }, 500);
    }
  }

  return c.json({ error: "Unsupported provider" }, 400);
});

// GET /api/ai/image/status/:id
imageGenRouter.get("/status/:id", imageLimiter, async (c) => {
  const id = c.req.param("id");
  if (!id || typeof id !== "string") {
    return c.json({ error: "Generation job ID is required" }, 400);
  }

  try {
    // 1. Check check-status first
    const checkRes = await fetch(
      `https://stablehorde.net/api/v2/generate/check/${encodeURIComponent(id)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:image-gen" },
      },
    );

    if (!checkRes.ok) {
      return c.json(
        { error: "Job status check failed or job expired." },
        checkRes.status as any,
      );
    }

    const checkData: any = await checkRes.json();

    if (checkData.faulted) {
      return c.json({
        done: true,
        faulted: true,
        error: "Generation job failed on worker. Please try again.",
      });
    }

    if (!checkData.done) {
      return c.json({
        done: false,
        processing: checkData.processing || 0,
        waiting: checkData.waiting || 0,
        queue_position: checkData.queue_position || 0,
        wait_time: checkData.wait_time || 0,
      });
    }

    // 2. Job is done! Fetch full result
    const statusRes = await fetch(
      `https://stablehorde.net/api/v2/generate/status/${encodeURIComponent(id)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:image-gen" },
      },
    );

    if (!statusRes.ok) {
      return c.json(
        { error: "Failed to retrieve final generation result." },
        statusRes.status as any,
      );
    }

    const statusData: any = await statusRes.json();
    if (!statusData.generations || statusData.generations.length === 0) {
      return c.json({ error: "No image generation returned." }, 500);
    }

    const gen = statusData.generations[0];
    if (gen.censored) {
      return c.json({
        done: true,
        faulted: true,
        error: "Generated image was filtered out by SFW safety censor.",
      });
    }

    let imageUrl = gen.img;
    // Inspect generated image buffer for CSAM / child safety violations before serving
    if (typeof imageUrl === "string" && imageUrl.length > 0) {
      let imageBuffer: Buffer | null = null;
      if (imageUrl.startsWith("data:")) {
        const commaIdx = imageUrl.indexOf(",");
        if (commaIdx !== -1) {
          imageBuffer = Buffer.from(imageUrl.slice(commaIdx + 1), "base64");
        }
      } else if (!imageUrl.startsWith("http")) {
        imageBuffer = Buffer.from(imageUrl, "base64");
      }

      if (imageBuffer) {
        const safetyCheck = await scanImage(imageBuffer);
        if (!safetyCheck.safe && safetyCheck.severity >= 2) {
          const ip = extractClientIp(c);
          const userAgent = c.req.header("user-agent");
          const authHeader = c.req.header("authorization");
          const token = extractBearerToken(authHeader);
          let user: any = null;
          if (token && token !== "undefined" && token !== "null") {
            user = await resolveUserFromToken(token);
          }

          await executeZeroToleranceLockdown({
            ip,
            user,
            userAgent,
            surface: "image_gen_output",
            fileHash: safetyCheck.details?.hash,
            severity: safetyCheck.severity,
            reason: safetyCheck.reason || "Generated image failed safety inspection",
          });

          return c.json(
            {
              done: true,
              faulted: true,
              error: "Generated image was permanently blocked due to safety policy violation.",
            },
            400,
          );
        }

        // Post-CSAM OpenAI Image Moderation Scanning
        const openAiImgMod = await moderateImage(imageBuffer);
        if (!openAiImgMod.allowed) {
          const ip = extractClientIp(c);
          const userAgent = c.req.header("user-agent");
          const authHeader = c.req.header("authorization");
          const token = extractBearerToken(authHeader);
          let user: any = null;
          if (token && token !== "undefined" && token !== "null") {
            user = await resolveUserFromToken(token);
          }

          const enforcement = await handleModerationEnforcement(openAiImgMod, {
            ip,
            user,
            userAgent,
            surface: "image_gen_output",
            fileHash: safetyCheck.details?.hash,
          });

          return c.json(
            {
              done: true,
              faulted: true,
              error:
                enforcement?.clientResponse.error ||
                "Generated image was blocked by safety moderation.",
              ...enforcement?.clientResponse,
            },
            400,
          );
        }
      }
    }

    // If it's pure base64 without prefix, prepend data URL
    if (
      typeof imageUrl === "string" &&
      !imageUrl.startsWith("http") &&
      !imageUrl.startsWith("data:")
    ) {
      imageUrl = `data:image/webp;base64,${imageUrl}`;
    }

    return c.json({
      done: true,
      faulted: false,
      image: imageUrl,
      seed: gen.seed,
    });
  } catch (err: any) {
    console.error("AI Horde Status Error:", err);
    return c.json({ error: "Failed to poll AI Horde status." }, 500);
  }
});

// POST /api/ai/image/save-to-storage
imageGenRouter.post("/save-to-storage", imageLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { image, prompt } = body || {};
  if (!image || typeof image !== "string") {
    return c.json({ error: "Image data or URL is required" }, 400);
  }

  try {
    let buffer: Buffer;
    let ext = "png";

    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return c.json({ error: "Invalid data URL format" }, 400);
      }
      const mime = match[1];
      ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";
      buffer = Buffer.from(match[2], "base64");
    } else if (image.startsWith("http")) {
      // Remote URL (e.g. AI Horde R2 image)
      const res = await fetch(image);
      if (!res.ok) {
        return c.json({ error: "Failed to download image from source" }, 400);
      }
      const arrayBuf = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      const contentType = res.headers.get("content-type") || "";
      ext = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";
    } else {
      buffer = Buffer.from(image, "base64");
    }

    // Pre-save safety inspection
    const saveCheck = await scanImage(buffer, `image/${ext}`);
    if (!saveCheck.safe && saveCheck.severity >= 2) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const lockdown = await executeZeroToleranceLockdown({
        ip,
        user,
        userAgent,
        surface: "image_gen_save",
        fileHash: saveCheck.details?.hash,
        severity: saveCheck.severity,
        reason: saveCheck.reason || "Attempted to persist prohibited image to storage",
      });
      return c.json(lockdown.clientResponse, 400);
    }

    // Post-CSAM OpenAI Image Moderation
    const openAiSaveMod = await moderateImage(buffer, `image/${ext}`);
    if (!openAiSaveMod.allowed) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const enforcement = await handleModerationEnforcement(openAiSaveMod, {
        ip,
        user,
        userAgent,
        surface: "image_gen_save",
        fileHash: saveCheck.details?.hash,
        mimeType: `image/${ext}`,
      });
      if (enforcement) {
        return c.json(enforcement.clientResponse, 400);
      }
    }

    const timestamp = Date.now();
    const cleanPrompt = (prompt || "generated")
      .slice(0, 30)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `ai_${cleanPrompt}_${timestamp}.${ext}`;
    const filePath = `${user.id}/ai-images/${filename}`;

    const uploadRes = await serverStorage.upload("Storage", filePath, buffer);
    if (uploadRes.error) {
      console.error("Storage upload error:", uploadRes.error);
      return c.json({ error: "Failed to write image to storage" }, 500);
    }

    const publicUrl = `/api/storage/download/Storage/${filePath}`;
    return c.json({
      success: true,
      path: filePath,
      filename,
      url: publicUrl,
    });
  } catch (err: any) {
    console.error("Save to storage error:", err);
    return c.json({ error: "Failed to save image to storage" }, 500);
  }
});
