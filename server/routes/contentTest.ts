import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import { extractBearerToken } from "./ai.ts";
import { scanText, scanImage } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateText,
  moderateImage,
  handleModerationEnforcement,
  isOpenAiConfigured,
} from "../lib/safety/openAiModeration.ts";

export const contentTestRouter = new Hono();

/**
 * Authentication middleware for content test route
 */
async function authenticate(c: any): Promise<any | null> {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader) || c.req.query("token");
  if (!token || token === "undefined" || token === "null") {
    return null;
  }
  return resolveUserFromToken(token);
}

/**
 * GET /status
 * Returns whether OpenAI Moderation API key is currently detected and active.
 */
contentTestRouter.get("/status", async (c) => {
  const user = await authenticate(c);
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const configured = isOpenAiConfigured();
  return c.json({
    openAiConfigured: configured,
    model: "omni-moderation-latest",
  });
});

/**
 * POST /
 * Tests text or image content against the tiered safety pipeline (CSAM Guard + OpenAI Moderation).
 * Returns { safe: boolean, category?: string, reason?: string, details?: any }.
 */
contentTestRouter.post("/", async (c) => {
  const user = await authenticate(c);
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  let body: any = {};
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await c.req.formData();
      const text = formData.get("text");
      const file = formData.get("file") || formData.get("image");

      if (typeof text === "string") {
        body.text = text;
      }

      if (file && typeof (file as any).arrayBuffer === "function") {
        const arrayBuf = await (file as any).arrayBuffer();
        body.imageBuffer = Buffer.from(arrayBuf);
        body.mimeType = (file as any).type || "image/png";
        body.fileName = (file as any).name || "uploaded_image";
      }
    } catch (err: any) {
      return c.json({ error: "Invalid form-data payload: " + (err.message || String(err)) }, 400);
    }
  } else {
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }
  }

  const { text, image, imageBuffer: directBuffer, mimeType: directMime } = body;
  const apiKeyOverride = c.req.header("x-openai-api-key") || body.apiKey;
  const isCloudActive = isOpenAiConfigured(apiKeyOverride);

  if (!text && !image && !directBuffer) {
    return c.json({ error: "Please provide either 'text' or 'image' to moderate" }, 400);
  }

  const ip = extractClientIp(c);
  const userAgent = c.req.header("user-agent");

  // 1. Text Moderation
  if (text && typeof text === "string" && text.trim().length > 0) {
    // Step 1: CSAM & Child Safety Local Guard
    const textSafety = await scanText(text);
    if (!textSafety.safe && textSafety.severity >= 2) {
      const lockdown = await executeZeroToleranceLockdown({
        ip,
        user,
        userAgent,
        surface: "content_test_text",
        promptText: text,
        severity: textSafety.severity,
        reason: textSafety.reason || "Prohibited child exploitation pattern",
      });
      return c.json(
        {
          safe: false,
          openAiConfigured: isCloudActive,
          category: textSafety.category || "CSAM/CSAE",
          reason: textSafety.reason || "Matched prohibited child safety policy",
          ...lockdown.clientResponse,
        },
        400,
      );
    }

    // Step 2: OpenAI Multimodal Moderation
    const openAiTextMod = await moderateText(text, apiKeyOverride);
    if (!openAiTextMod.allowed) {
      const enforcement = await handleModerationEnforcement(openAiTextMod, {
        ip,
        user,
        userAgent,
        surface: "content_test_text",
        promptText: text,
      });

      return c.json(
        {
          safe: false,
          openAiConfigured: isCloudActive,
          category: openAiTextMod.category,
          reason: openAiTextMod.reason || `Violated safety policy: ${openAiTextMod.category}`,
          ...enforcement?.clientResponse,
        },
        400,
      );
    }
  }

  // 2. Image Moderation
  let imageBuf: Buffer | null = directBuffer || null;
  let mime = directMime || "image/png";

  if (!imageBuf && image && typeof image === "string") {
    if (image.startsWith("data:")) {
      const commaIdx = image.indexOf(",");
      if (commaIdx !== -1) {
        const mimeMatch = image.slice(0, commaIdx).match(/data:([^;]+);/);
        if (mimeMatch) mime = mimeMatch[1];
        imageBuf = Buffer.from(image.slice(commaIdx + 1), "base64");
      }
    } else {
      imageBuf = Buffer.from(image, "base64");
    }
  }

  if (imageBuf && imageBuf.length > 0) {
    // Step 1: CSAM & Image Binary Inspection
    const imgSafety = await scanImage(imageBuf, mime);
    if (!imgSafety.safe && imgSafety.severity >= 2) {
      const lockdown = await executeZeroToleranceLockdown({
        ip,
        user,
        userAgent,
        surface: "content_test_image",
        fileHash: imgSafety.details?.hash,
        mimeType: mime,
        severity: imgSafety.severity,
        reason: imgSafety.reason || "Prohibited image content",
      });
      return c.json(
        {
          safe: false,
          openAiConfigured: isCloudActive,
          category: imgSafety.category || "CSAM/CSAE",
          reason: imgSafety.reason || "Matched prohibited child safety policy",
          ...lockdown.clientResponse,
        },
        400,
      );
    }

    // Step 2: OpenAI Image Moderation
    const openAiImgMod = await moderateImage(imageBuf, mime, apiKeyOverride);
    if (!openAiImgMod.allowed) {
      const enforcement = await handleModerationEnforcement(openAiImgMod, {
        ip,
        user,
        userAgent,
        surface: "content_test_image",
        fileHash: imgSafety.details?.hash,
        mimeType: mime,
      });

      return c.json(
        {
          safe: false,
          openAiConfigured: isCloudActive,
          category: openAiImgMod.category,
          reason: openAiImgMod.reason || `Violated safety policy: ${openAiImgMod.category}`,
          ...enforcement?.clientResponse,
        },
        400,
      );
    }
  }

  return c.json({
    safe: true,
    openAiConfigured: isCloudActive,
    message: isCloudActive
      ? "Content passed all safety checks (CSAM Guard + OpenAI Multimodal Moderation)."
      : "Content passed local CSAM check. Notice: OpenAI cloud moderation was bypassed because OPENAI_API_KEY is not detected by Node.",
  });
});
