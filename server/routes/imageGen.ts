import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import { queryTable } from "../lib/dataStore.ts";
import { serverStorage } from "../lib/storage.ts";
import { extractBearerToken, stripHtmlTags } from "./ai.ts";

export const imageGenRouter = new Hono();

const imageLimiter = rateLimiter(20, 60_000, "image_gen");

export const HORDE_SFW_CURATED = [
  {
    provider: "horde",
    id: "SDXL 1.0",
    name: "SDXL 1.0 (Horde)",
    description: "Community Stable Diffusion XL photorealistic checkpoint",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    provider: "horde",
    id: "stable_diffusion",
    name: "Stable Diffusion 1.5 (Horde)",
    description: "Verified SFW general-purpose diffusion model",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "4:3", "3:4"],
  },
  {
    provider: "horde",
    id: "Deliberate",
    name: "Deliberate 2.0 (Horde)",
    description: "Exceptional detail for digital art, 3D renders, and illustrations",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    provider: "horde",
    id: "DreamShaper",
    name: "DreamShaper (Horde)",
    description: "Popular artistic model for fantasy, concept art, and portraits",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    provider: "horde",
    id: "ICBINP - I Can't Believe It's Not Photography",
    name: "ICBINP Photo (Horde)",
    description: "Specialized photographic realism checkpoint",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  {
    provider: "horde",
    id: "AlbedoBase XL",
    name: "AlbedoBase XL (Horde)",
    description: "Clean generalist XL model with high visual fidelity",
    free: true,
    maxSteps: 30,
    defaultSteps: 20,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
];

const NSFW_MODEL_REGEX =
  /(nsfw|hentai|furry|erotic|porn|lewd|waifu|nude|sex|xxx|boob|r18|uncensored|spicy|yiff)/i;

// GET /api/ai/image/models
imageGenRouter.get("/models", imageLimiter, async (c) => {
  let hordeModels = [...HORDE_SFW_CURATED];

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

      // Enrich curated list with live availability
      hordeModels = hordeModels.map((curated) => {
        const live = statusByName.get(curated.id);
        return {
          ...curated,
          workers: live ? live.count || 0 : 0,
          queued: live ? live.queued || 0 : 0,
          eta: live ? live.eta || 0 : 0,
        };
      });

      // Optionally discover additional high-worker active SFW models
      for (const [name, info] of statusByName.entries()) {
        if (
          !hordeModels.some((m) => m.id === name) &&
          !NSFW_MODEL_REGEX.test(name) &&
          (info.count || 0) >= 3
        ) {
          hordeModels.push({
            provider: "horde",
            id: name,
            name: `${name} (Horde)`,
            description: `Community worker model (${info.count} active workers)`,
            free: true,
            maxSteps: 30,
            defaultSteps: 20,
            aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
            workers: info.count || 0,
            queued: info.queued || 0,
            eta: info.eta || 0,
          } as any);
        }
      }
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

  if (provider === "horde") {
    // Check if user has an AI Horde API key in user_integrations
    let hordeApiKey = "0000000000";
    if (user) {
      const integrations = queryTable({
        table: "user_integrations",
        userId: user.id,
        filters: [{ field: "provider", operator: "eq", value: "horde" }],
      });
      if (Array.isArray(integrations) && integrations[0]?.api_key) {
        hordeApiKey = integrations[0].api_key;
      }
    }

    const selectedModel = model || "SDXL 1.0";
    const fullPrompt = negative_prompt
      ? `${prompt} ### ${negative_prompt}`
      : prompt;

    const hordePayload = {
      prompt: fullPrompt,
      params: {
        sampler_name: "k_euler",
        cfg_scale: guidance,
        steps: Math.min(steps, 30),
        width,
        height,
        seed: seed !== undefined ? String(seed) : undefined,
        n: 1,
      },
      nsfw: false,
      censor_nsfw: true,
      models: [selectedModel],
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
        model: selectedModel,
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
