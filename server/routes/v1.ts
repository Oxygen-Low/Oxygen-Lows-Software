import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimiter } from "../lib/rateLimiter.ts";
import {
  HORDE_MODELS_MAP,
  resolveHordeModel,
  getFallbackHordeModel,
  stripHtmlTags,
} from "./ai.ts";
import {
  streamHordeWithContinuation,
  fetchHordeNonStreamWithContinuation,
} from "../lib/hordeContinuation.ts";
import { IMAGE_GENERATOR_PRESETS } from "./imageGen.ts";
import { scanText, scanImage } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateText,
  moderateImage,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";

export const v1Router = new Hono();

// Rate limiter: 60 requests per 60,000ms per IP shared across all v1 routes
export const v1RateLimiter = rateLimiter(
  60,
  60_000,
  "free_v1_ai",
  (retryAfter) => ({
    error: {
      message: `Rate limit exceeded: 60 requests per minute per IP. Please retry in ${retryAfter}s.`,
      type: "rate_limit_error",
      param: null,
      code: 429,
    },
  }),
);

// Permissive CORS for public free API access from any origin
v1Router.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  }),
);

// Apply shared 60 req/min per IP rate limiter across all v1 routes
v1Router.use("*", v1RateLimiter);

// Curated model registry for discovery
export const V1_AVAILABLE_MODELS = [
  {
    id: "Fast",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "Fast instruction-tuned LLM (Llama 3.2 / Llama 3.1)",
  },
  {
    id: "Smart",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "High-parameter intelligent reasoning open LLM",
  },
  {
    id: "llama-3.2-3b",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.2 3B Instruct",
  },
  {
    id: "llama-3.2-1b",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.2 1B Instruct",
  },
  {
    id: "llama-3.1-8b",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.1 8B Instruct",
  },
  {
    id: "gpt-3.5-turbo",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "OpenAI-compatible alias mapping to Fast",
  },
  {
    id: "gpt-4o-mini",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "text",
    description: "OpenAI-compatible alias mapping to Fast",
  },
  {
    id: "quality",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "High-detail photorealistic image generation (SDXL 1.0)",
  },
  {
    id: "fast",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Lightweight rapid image generation (Stable Diffusion)",
  },
  {
    id: "pixel_art",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Retro 16-bit arcade pixel graphic style",
  },
  {
    id: "anime",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Studio anime illustration style (DreamShaper)",
  },
  {
    id: "realistic",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Authentic 35mm photographic realism",
  },
  {
    id: "cartoon",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Playful character design and cartoon illustration",
  },
  {
    id: "simplistic",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "Minimalist flat illustration with clean lines",
  },
  {
    id: "dall-e-3",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "OpenAI-compatible alias mapping to quality (SDXL 1.0)",
  },
  {
    id: "dall-e-2",
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
    type: "image",
    description: "OpenAI-compatible alias mapping to fast (Stable Diffusion)",
  },
];

/**
 * GET /models
 * OpenAI-compatible model discovery endpoint
 */
v1Router.get("/models", async (c) => {
  return c.json({
    object: "list",
    data: V1_AVAILABLE_MODELS,
  });
});

/**
 * GET /models/:model
 * OpenAI-compatible single model metadata
 */
v1Router.get("/models/:model", async (c) => {
  const modelId = c.req.param("model");
  const found = V1_AVAILABLE_MODELS.find(
    (m) => m.id.toLowerCase() === modelId.toLowerCase(),
  );
  if (found) {
    return c.json(found);
  }
  return c.json({
    id: modelId,
    object: "model",
    created: 1700000000,
    owned_by: "oxygenlow",
  });
});

/**
 * Map incoming model string to AI Horde text model
 */
export function resolveV1TextModel(modelName?: string): string {
  if (!modelName || typeof modelName !== "string") {
    return resolveHordeModel("Fast");
  }
  const clean = modelName.trim().toLowerCase();
  if (
    clean === "fast" ||
    clean === "gpt-3.5-turbo" ||
    clean === "gpt-4" ||
    clean === "gpt-4o" ||
    clean === "gpt-4o-mini" ||
    clean === "default"
  ) {
    return resolveHordeModel("Fast");
  }
  if (clean === "smart") {
    return resolveHordeModel("Smart");
  }
  if (clean === "llama-3.2-3b") {
    return "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M";
  }
  if (clean === "llama-3.2-1b") {
    return "koboldcpp/Llama-3.2-1B-Instruct";
  }
  if (clean === "llama-3.1-8b") {
    return "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M";
  }
  return resolveHordeModel(modelName);
}

/**
 * POST /chat/completions
 * OpenAI-compatible text generation with streaming and non-streaming support
 */
v1Router.post("/chat/completions", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          message: "Invalid JSON request body",
          type: "invalid_request_error",
          param: null,
          code: 400,
        },
      },
      400,
    );
  }

  const { model, messages, stream, temperature, max_tokens } = body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json(
      {
        error: {
          message: "Missing or invalid 'messages' array",
          type: "invalid_request_error",
          param: "messages",
          code: 400,
        },
      },
      400,
    );
  }

  // Cap message history to 20 messages and 32KB per message
  const MAX_MSG_CONTENT_LENGTH = 32_768;
  const processedMessages = messages.slice(-20).map((m: any) => ({
    role: m.role || "user",
    content:
      typeof m.content === "string" && m.content.length > MAX_MSG_CONTENT_LENGTH
        ? m.content.slice(0, MAX_MSG_CONTENT_LENGTH)
        : m.content,
  }));

  // Safety Scanning: CSAM followed by OpenAI Text Moderation
  const latestUserMessages = processedMessages
    .filter((m: any) => m.role === "user")
    .map((m: any) => (typeof m.content === "string" ? m.content : ""))
    .join(" ");

  if (latestUserMessages.trim().length > 0) {
    const textSafety = await scanText(latestUserMessages);
    if (!textSafety.safe && textSafety.severity >= 2) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const lockdown = await executeZeroToleranceLockdown({
        ip,
        userAgent,
        surface: "v1_chat",
        promptText: latestUserMessages,
        severity: textSafety.severity,
        reason: textSafety.reason || "CSAM / Child safety violation in API prompt",
      });
      return c.json(
        {
          error: {
            message: lockdown.clientResponse.error,
            type: "policy_violation_error",
            param: null,
            code: lockdown.clientResponse.code,
          },
        },
        400,
      );
    }

    const openAiTextCheck = await moderateText(latestUserMessages);
    if (!openAiTextCheck.allowed) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const enforcement = await handleModerationEnforcement(openAiTextCheck, {
        ip,
        userAgent,
        surface: "v1_chat",
        promptText: latestUserMessages,
      });
      if (enforcement) {
        return c.json(
          {
            error: {
              message: enforcement.clientResponse.error,
              type: "policy_violation_error",
              param: null,
              code: enforcement.clientResponse.code,
              category: enforcement.clientResponse.category,
              redirect_url: enforcement.clientResponse.redirectUrl,
            },
          },
          400,
        );
      }
    }
  }

  let actualModel = resolveV1TextModel(model);

  // Strictly keyless: all requests use anonymous worker tier
  const hordeHeaders: Record<string, string> = {
    Authorization: "Bearer 0000000000",
    "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api",
  };

  let hordeRequestBody = {
    model: actualModel,
    messages: processedMessages,
    stream: Boolean(stream),
    ...(temperature !== undefined ? { temperature: Number(temperature) } : {}),
    ...(max_tokens !== undefined ? { max_tokens: Number(max_tokens) } : {}),
  };

  const targetUrl = "https://oai.stablehorde.net/v1/chat/completions";

  try {
    if (stream) {
      let hordeResponse = await streamHordeWithContinuation({
        targetUrl,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal: c.req.raw.signal,
      });

      // If model not found or unsupported, attempt fallback
      if (hordeResponse.status === 406 || hordeResponse.status === 404) {
        const fallback = await getFallbackHordeModel("fast");
        if (fallback && fallback !== actualModel) {
          actualModel = fallback;
          hordeRequestBody.model = actualModel;
          hordeResponse = await streamHordeWithContinuation({
            targetUrl,
            fetchHeaders: hordeHeaders,
            requestBody: hordeRequestBody,
            signal: c.req.raw.signal,
          });
        }
      }

      if (!hordeResponse.ok) {
        const status = hordeResponse.status;
        let userMessage = "The AI provider returned an error.";
        if (status === 429) {
          userMessage = "AI Horde worker network is currently busy. Please retry shortly.";
        } else if (status >= 500) {
          userMessage = "AI Horde service temporarily unavailable.";
        }
        return c.json(
          {
            error: {
              message: userMessage,
              type: "provider_error",
              param: null,
              code: status,
            },
          },
          status as any,
        );
      }

      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      return c.body(hordeResponse.body as any);
    } else {
      let hordeResponse = await fetchHordeNonStreamWithContinuation({
        targetUrl,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal: c.req.raw.signal,
      });

      // If model not found or unsupported, attempt fallback
      if (hordeResponse.status === 406 || hordeResponse.status === 404) {
        const fallback = await getFallbackHordeModel("fast");
        if (fallback && fallback !== actualModel) {
          actualModel = fallback;
          hordeRequestBody.model = actualModel;
          hordeResponse = await fetchHordeNonStreamWithContinuation({
            targetUrl,
            fetchHeaders: hordeHeaders,
            requestBody: hordeRequestBody,
            signal: c.req.raw.signal,
          });
        }
      }

      if (!hordeResponse.ok) {
        const status = hordeResponse.status;
        let userMessage = "The AI provider returned an error.";
        if (status === 429) {
          userMessage = "AI Horde worker network is currently busy. Please retry shortly.";
        } else if (status >= 500) {
          userMessage = "AI Horde service temporarily unavailable.";
        }
        return c.json(
          {
            error: {
              message: userMessage,
              type: "provider_error",
              param: null,
              code: status,
            },
          },
          status as any,
        );
      }

      const data = await hordeResponse.json();
      return c.json(data);
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499,
          },
        },
        499 as any,
      );
    }
    console.error("Free AI Chat Completion Error:", err);
    return c.json(
      {
        error: {
          message: "Internal server error occurred while contacting AI Horde.",
          type: "server_error",
          code: 500,
        },
      },
      500,
    );
  }
});

/**
 * Helper to parse image size string (e.g. "1024x1024" or "512x512")
 */
export function parseImageSize(size?: string): { width: number; height: number } {
  if (!size || typeof size !== "string") {
    return { width: 512, height: 512 };
  }
  const match = size.toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { width: 512, height: 512 };
  }
  const rawW = parseInt(match[1], 10);
  const rawH = parseInt(match[2], 10);
  const width = Math.min(Math.max(rawW || 512, 256), 1024);
  const height = Math.min(Math.max(rawH || 512, 256), 1024);
  return { width, height };
}

/**
 * POST /images/generations
 * OpenAI-compatible image generation with transparent server-side polling to AI Horde
 */
v1Router.post("/images/generations", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          message: "Invalid JSON request body",
          type: "invalid_request_error",
          param: null,
          code: 400,
        },
      },
      400,
    );
  }

  const {
    prompt: rawPrompt,
    model: rawModel,
    size: rawSize,
    response_format = "url",
  } = body || {};

  const prompt = stripHtmlTags(rawPrompt || "").trim();
  if (!prompt || prompt.length === 0) {
    return c.json(
      {
        error: {
          message: "Missing required parameter: 'prompt'",
          type: "invalid_request_error",
          param: "prompt",
          code: 400,
        },
      },
      400,
    );
  }

  if (prompt.length > 2000) {
    return c.json(
      {
        error: {
          message: "Prompt exceeds maximum allowed length of 2000 characters",
          type: "invalid_request_error",
          param: "prompt",
          code: 400,
        },
      },
      400,
    );
  }

  const { width, height } = parseImageSize(rawSize);

  // Model resolution and preset enhancement
  let requestedModel = String(rawModel || "quality").trim();
  if (requestedModel.toLowerCase() === "dall-e-3") {
    requestedModel = "quality";
  } else if (requestedModel.toLowerCase() === "dall-e-2") {
    requestedModel = "fast";
  }

  const matchedPreset = IMAGE_GENERATOR_PRESETS.find(
    (p) =>
      p.id.toLowerCase() === requestedModel.toLowerCase() ||
      p.name.toLowerCase() === requestedModel.toLowerCase(),
  );

  const baseHordeModel = matchedPreset ? matchedPreset.baseHordeModel : requestedModel;

  let enhancedPrompt = prompt;
  if (
    matchedPreset?.stylePrompt &&
    !prompt.toLowerCase().includes(matchedPreset.stylePrompt.toLowerCase())
  ) {
    enhancedPrompt = `${prompt}, ${matchedPreset.stylePrompt}`;
  }

  let negativePrompt = matchedPreset?.negativePromptAdditions || "";
  const fullPrompt = negativePrompt
    ? `${enhancedPrompt} ### ${negativePrompt}`
    : enhancedPrompt;

  const maxStepsAllowed = matchedPreset ? matchedPreset.maxSteps : 30;
  const defaultSteps = matchedPreset ? matchedPreset.defaultSteps : 25;

  // Pre-generation CSAM & OpenAI Moderation Prompt Scanning
  const combinedText = `${prompt} ${negativePrompt}`;
  const textSafetyResult = await scanText(combinedText);
  if (!textSafetyResult.safe && textSafetyResult.severity >= 2) {
    const ip = extractClientIp(c);
    const userAgent = c.req.header("user-agent");
    const lockdown = await executeZeroToleranceLockdown({
      ip,
      userAgent,
      surface: "v1_image_prompt",
      promptText: prompt,
      severity: textSafetyResult.severity,
      reason: textSafetyResult.reason || "Prohibited minor safety or child exploitation pattern in prompt",
    });
    return c.json(
      {
        error: {
          message: lockdown.clientResponse.error,
          type: "policy_violation_error",
          param: null,
          code: lockdown.clientResponse.code,
        },
      },
      400,
    );
  }

  const openAiMod = await moderateText(combinedText);
  if (!openAiMod.allowed) {
    const ip = extractClientIp(c);
    const userAgent = c.req.header("user-agent");
    const enforcement = await handleModerationEnforcement(openAiMod, {
      ip,
      userAgent,
      surface: "v1_image_prompt",
      promptText: prompt,
    });
    if (enforcement) {
      return c.json(
        {
          error: {
            message: enforcement.clientResponse.error,
            type: "policy_violation_error",
            param: null,
            code: enforcement.clientResponse.code,
            category: enforcement.clientResponse.category,
            redirect_url: enforcement.clientResponse.redirectUrl,
          },
        },
        400,
      );
    }
  }

  const hordePayload = {
    prompt: fullPrompt,
    params: {
      sampler_name: "k_euler",
      cfg_scale: 7.5,
      steps: Math.min(defaultSteps, maxStepsAllowed),
      width,
      height,
      n: 1,
    },
    nsfw: false,
    censor_nsfw: true,
    models: [baseHordeModel],
  };

  // 1. Submit async generation job to AI Horde
  let jobId = "";
  try {
    const submitRes = await fetch("https://stablehorde.net/api/v2/generate/async", {
      method: "POST",
      headers: {
        apikey: "0000000000",
        "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(hordePayload),
      signal: c.req.raw.signal,
    });

    if (!submitRes.ok) {
      const errData: any = await submitRes.json().catch(() => ({}));
      return c.json(
        {
          error: {
            message:
              errData.message ||
              "AI Horde is currently busy or unable to queue the image generation request.",
            type: "provider_error",
            code: submitRes.status,
          },
        },
        submitRes.status as any,
      );
    }

    const submitData: any = await submitRes.json();
    jobId = submitData.id;
    if (!jobId) {
      return c.json(
        {
          error: {
            message: "Failed to obtain generation job ID from AI Horde.",
            type: "provider_error",
            code: 500,
          },
        },
        500,
      );
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499,
          },
        },
        499 as any,
      );
    }
    console.error("AI Horde Image Submit Error:", err);
    return c.json(
      {
        error: {
          message: "Failed to connect to AI Horde network for image generation.",
          type: "server_error",
          code: 500,
        },
      },
      500,
    );
  }

  // 2. Transparent server-side polling loop (up to 60s timeout, check every 2s)
  const MAX_POLL_MS = 60_000;
  const POLL_INTERVAL_MS = 2_000;
  const startTime = Date.now();
  let isDone = false;

  try {
    while (Date.now() - startTime < MAX_POLL_MS) {
      if (c.req.raw.signal?.aborted) {
        return c.json(
          {
            error: {
              message: "Request aborted by client",
              type: "client_closed_request",
              code: 499,
            },
          },
          499 as any,
        );
      }

      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));

      const checkRes = await fetch(
        `https://stablehorde.net/api/v2/generate/check/${encodeURIComponent(jobId)}`,
        {
          headers: { "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api" },
          signal: c.req.raw.signal,
        },
      );

      if (!checkRes.ok) {
        return c.json(
          {
            error: {
              message: "Job status check failed on AI Horde.",
              type: "provider_error",
              code: checkRes.status,
            },
          },
          checkRes.status as any,
        );
      }

      const checkData: any = await checkRes.json();

      if (checkData.faulted) {
        return c.json(
          {
            error: {
              message: "Generation job faulted on AI Horde worker. Please try again.",
              type: "provider_error",
              code: 500,
            },
          },
          500,
        );
      }

      if (checkData.done) {
        isDone = true;
        break;
      }
    }

    if (!isDone) {
      return c.json(
        {
          error: {
            message:
              "Image generation timed out waiting for an available AI Horde worker. Please retry with a lighter model or resolution.",
            type: "timeout_error",
            code: 504,
          },
        },
        504,
      );
    }

    // 3. Fetch final generation result
    const statusRes = await fetch(
      `https://stablehorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api" },
        signal: c.req.raw.signal,
      },
    );

    if (!statusRes.ok) {
      return c.json(
        {
          error: {
            message: "Failed to retrieve final generation result from AI Horde.",
            type: "provider_error",
            code: statusRes.status,
          },
        },
        statusRes.status as any,
      );
    }

    const statusData: any = await statusRes.json();
    if (!statusData.generations || statusData.generations.length === 0) {
      return c.json(
        {
          error: {
            message: "No image generation returned by worker.",
            type: "provider_error",
            code: 500,
          },
        },
        500,
      );
    }

    const gen = statusData.generations[0];
    if (gen.censored) {
      return c.json(
        {
          error: {
            message: "Generated image was filtered out by AI Horde safety censor.",
            type: "content_policy_violation",
            code: "content_policy_violation",
          },
        },
        400,
      );
    }

    let rawImg = gen.img;
    if (!rawImg || typeof rawImg !== "string") {
      return c.json(
        {
          error: {
            message: "Invalid image output received from worker.",
            type: "provider_error",
            code: 500,
          },
        },
        500,
      );
    }

    // Safety Inspection: CSAM followed by OpenAI Image Moderation
    let imageBuffer: Buffer | null = null;
    if (rawImg.startsWith("http")) {
      try {
        const imgRes = await fetch(rawImg);
        if (imgRes.ok) {
          imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        }
      } catch {
        // Continue if remote CDN is not mock-intercepted or temporarily unavailable
      }
    } else {
      const commaIdx = rawImg.indexOf(",");
      const b64Data = commaIdx !== -1 ? rawImg.slice(commaIdx + 1) : rawImg;
      try {
        imageBuffer = Buffer.from(b64Data, "base64");
      } catch {}
    }

    if (imageBuffer) {
      const safetyCheck = await scanImage(imageBuffer);
      if (!safetyCheck.safe && safetyCheck.severity >= 2) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const lockdown = await executeZeroToleranceLockdown({
          ip,
          userAgent,
          surface: "v1_image_output",
          fileHash: safetyCheck.details?.hash,
          severity: safetyCheck.severity,
          reason: safetyCheck.reason || "Generated image failed safety inspection",
        });
        return c.json(
          {
            error: {
              message: lockdown.clientResponse.error,
              type: "policy_violation_error",
              param: null,
              code: lockdown.clientResponse.code,
            },
          },
          400,
        );
      }

      const openAiImgMod = await moderateImage(imageBuffer);
      if (!openAiImgMod.allowed) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const enforcement = await handleModerationEnforcement(openAiImgMod, {
          ip,
          userAgent,
          surface: "v1_image_output",
          fileHash: safetyCheck.details?.hash,
        });
        if (enforcement) {
          return c.json(
            {
              error: {
                message: enforcement.clientResponse.error,
                type: "policy_violation_error",
                param: null,
                code: enforcement.clientResponse.code,
                category: enforcement.clientResponse.category,
                redirect_url: enforcement.clientResponse.redirectUrl,
              },
            },
            400,
          );
        }
      }
    }

    const createdTime = Math.floor(Date.now() / 1000);

    if (response_format === "b64_json") {
      let b64 = rawImg;
      if (rawImg.startsWith("http")) {
        // Download remote image and convert to base64
        const imgRes = await fetch(rawImg);
        if (!imgRes.ok) {
          return c.json(
            {
              error: {
                message: "Failed to retrieve image data from CDN.",
                type: "provider_error",
                code: 500,
              },
            },
            500,
          );
        }
        const buf = await imgRes.arrayBuffer();
        b64 = Buffer.from(buf).toString("base64");
      } else if (rawImg.startsWith("data:")) {
        const parts = rawImg.split(",");
        b64 = parts[1] || "";
      }

      return c.json({
        created: createdTime,
        data: [{ b64_json: b64 }],
      });
    } else {
      // url response format
      let finalUrl = rawImg;
      if (!rawImg.startsWith("http") && !rawImg.startsWith("data:")) {
        finalUrl = `data:image/webp;base64,${rawImg}`;
      }

      return c.json({
        created: createdTime,
        data: [{ url: finalUrl }],
      });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499,
          },
        },
        499 as any,
      );
    }
    console.error("AI Horde Polling Error:", err);
    return c.json(
      {
        error: {
          message: "Internal server error occurred while retrieving generated image.",
          type: "server_error",
          code: 500,
        },
      },
      500,
    );
  }
});
