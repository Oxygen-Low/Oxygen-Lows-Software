import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import { queryTable } from "../lib/dataStore.ts";
import { WEBSITE_KNOWLEDGE_SYSTEM_PROMPT } from "../../shared/websiteKnowledge.ts";
import { safeParseJson } from "../../shared/jsonRepair.ts";
import {
  streamHordeWithContinuation,
  fetchHordeNonStreamWithContinuation,
} from "../lib/hordeContinuation.ts";
import { scanText } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateText,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";
import {
  getUserApiKey,
  getAllUserApiKeys,
  setUserApiKey,
  deleteUserApiKey,
} from "../lib/userApiKeys.ts";

export const aiRouter = new Hono();

const DEFAULT_MODELS = [
  { provider: "pollinations", model_id: "inclusionai/ling-3.1-flash" },
];

export const HORDE_MODELS_MAP: Record<string, string[]> = {
  TitleGen: [
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "meta-llama/Llama-3.2-3B-Instruct",
  ],
  Fast: [
    "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
  ],
  "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M": [
    "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
  ],
  "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M": [
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "koboldcpp/llama-3.2-3b-instruct-q4_k_m",
    "meta-llama/Llama-3.2-3B-Instruct",
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/L3-Super-Nova-RP-8B",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
  ],
  Smart: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"],
  Writing: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"],
};

export function resolveHordeModel(model: string): string {
  if (HORDE_MODELS_MAP[model]) {
    return HORDE_MODELS_MAP[model].join(",");
  }
  return model;
}

export async function getFallbackHordeModel(
  preference: "fast" | "general" = "fast",
): Promise<string | null> {
  try {
    const res = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=text",
    );
    if (!res.ok) return null;
    const models: Array<{ name: string; count: number }> = await res.json();
    const sorted = models
      .filter((m) => m && m.count > 0 && typeof m.name === "string")
      .sort((a, b) => b.count - a.count);

    if (preference === "fast") {
      const fast = sorted.find((m) =>
        /(?:^|[^0-9])([1378])b(?:[^0-9]|$)/i.test(m.name),
      );
      if (fast) return fast.name;
    }
    return sorted[0]?.name || null;
  } catch {
    return null;
  }
}

export interface SearchIntent {
  search: boolean;
  query?: string;
}

export function parseSearchIntent(content: unknown): SearchIntent | null {
  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = safeParseJson<any>(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    if (parsed.search === true && typeof parsed.query === "string") {
      const trimmedQuery = parsed.query.trim();
      if (trimmedQuery.length > 0) {
        return {
          search: true,
          query: trimmedQuery.slice(0, 300),
        };
      }
    }

    if (parsed.search === false) {
      return { search: false };
    }

    return null;
  } catch {
    return null;
  }
}

export function stripHtmlTags(input: unknown): string {
  if (typeof input !== "string") return "";
  let prev = "";
  let sanitized = input;
  do {
    prev = sanitized;
    sanitized = sanitized.replace(/<[^<>]*>/g, "");
  } while (sanitized !== prev);
  return sanitized.trim();
}

// A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
}

const apiLimiter = rateLimiter(30, 60_000, "ai");

aiRouter.get("/local-providers", apiLimiter, async (c) => {
  return c.json([...DEFAULT_MODELS]);
});

// User LLM API Key Management (Server-side Encrypted)
aiRouter.get("/keys", apiLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await resolveUserFromToken(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const keys = await getAllUserApiKeys(user.id);
  return c.json({ keys });
});

aiRouter.post("/keys", apiLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await resolveUserFromToken(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const provider = body.provider;
  const rawKey = body.apiKey || body.key;
  if (!provider || typeof provider !== "string") {
    return c.json({ error: "Provider is required" }, 400);
  }
  if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
    return c.json({ error: "API key is required" }, 400);
  }

  const result = await setUserApiKey(user.id, provider, rawKey.trim());
  return c.json({ success: true, provider: result.provider, prefix: result.prefix });
});

aiRouter.delete("/keys/:provider", apiLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await resolveUserFromToken(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const provider = c.req.param("provider");
  if (!provider) return c.json({ error: "Provider is required" }, 400);

  await deleteUserApiKey(user.id, provider);
  return c.json({ success: true, provider: provider.toLowerCase() });
});

aiRouter.get("/horde-status", apiLimiter, async (c) => {
  try {
    const response = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=text",
    );
    if (!response.ok) return c.json({});
    const allModels: any[] = await response.json();

    const statusByName: Record<string, any> = {};
    for (const m of allModels) {
      if (m.name) statusByName[m.name] = m;
    }

    const result: Record<
      string,
      { workers: number; queued: number; speed: string; eta: number }
    > = {};

    for (const [modelId, hordeNames] of Object.entries(HORDE_MODELS_MAP)) {
      let workers = 0;
      let queued = 0;
      let speed = "";
      let eta = 0;

      for (const name of hordeNames) {
        const info = statusByName[name];
        if (info) {
          workers += info.count || 0;
          queued += info.queued || 0;
          if (!speed && info.performance) speed = String(info.performance);
          eta = Math.max(eta, info.eta || 0);
        }
      }

      result[modelId] = { workers, queued, speed, eta };
    }

    return c.json(result);
  } catch (e) {
    return c.json({});
  }
});

aiRouter.post("/transcribe", apiLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  let user = null;
  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }

  let fileBuffer: Buffer | null = null;
  let clientApiKey = "";
  let clientProvider = "pollinations";
  let requestedModel = "openai/whisper-large-v3";

  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ error: "Invalid form data" }, 400);
    const file = formData.get("file");
    clientApiKey = (formData.get("apiKey") as string) || "";
    clientProvider = (formData.get("provider") as string) || "pollinations";
    const m = (formData.get("model") as string);
    if (m) requestedModel = m;
    if (file && typeof (file as any).arrayBuffer === "function") {
      const ab = await (file as any).arrayBuffer();
      fileBuffer = Buffer.from(ab);
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    if (body.audio) {
      fileBuffer = Buffer.from(body.audio, "base64");
    }
    clientApiKey = body.apiKey || "";
    clientProvider = body.provider || "pollinations";
    if (body.model) requestedModel = body.model;
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return c.json({ error: "Audio data is required" }, 400);
  }

  let effectiveApiKey = clientApiKey;
  if (!effectiveApiKey && user?.id) {
    effectiveApiKey =
      (await getUserApiKey(user.id, clientProvider)) ||
      (await getUserApiKey(user.id, "openai")) ||
      (await getUserApiKey(user.id, "pollinations")) ||
      "";
  }
  if (!effectiveApiKey) {
    effectiveApiKey = process.env.OPENAI_API_KEY || process.env.POLLINATIONS_API_KEY || "";
  }

  try {
    const isOpenAiDirect =
      effectiveApiKey && effectiveApiKey.startsWith("sk-") && !effectiveApiKey.startsWith("pk_");

    const upstreamForm = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: "audio/webm" });
    upstreamForm.append("file", blob, "audio.webm");
    upstreamForm.append(
      "model",
      isOpenAiDirect ? "whisper-1" : (requestedModel || "openai/whisper-large-v3"),
    );

    const headers: Record<string, string> = {};
    if (effectiveApiKey) {
      headers["Authorization"] = `Bearer ${effectiveApiKey}`;
    }

    const endpoint = isOpenAiDirect
      ? "https://api.openai.com/v1/audio/transcriptions"
      : "https://gen.pollinations.ai/v1/audio/transcriptions";

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: upstreamForm,
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `Transcription upstream error: ${err}` }, 502);
    }

    const json = await res.json();
    return c.json({ text: json.text || json.transcript || "" });
  } catch (err: any) {
    return c.json({ error: err?.message || "Transcription failed" }, 500);
  }
});

aiRouter.post("/tts", apiLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  let user = null;
  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }

  const { input, text, voice = "alloy", model = "openai/tts-1", apiKey, provider = "pollinations" } =
    await c.req.json().catch(() => ({}));
  const inputText = input || text;
  if (!inputText || typeof inputText !== "string" || !inputText.trim()) {
    return c.json({ error: "Text is required for TTS" }, 400);
  }

  let effectiveApiKey = apiKey || "";
  if (!effectiveApiKey && user?.id) {
    effectiveApiKey =
      (await getUserApiKey(user.id, provider)) ||
      (await getUserApiKey(user.id, "openai")) ||
      (await getUserApiKey(user.id, "pollinations")) ||
      "";
  }
  if (!effectiveApiKey) {
    effectiveApiKey = process.env.OPENAI_API_KEY || process.env.POLLINATIONS_API_KEY || "";
  }

  const isOpenAiDirect =
    effectiveApiKey && effectiveApiKey.startsWith("sk-") && !effectiveApiKey.startsWith("pk_");
  const targetUrl = isOpenAiDirect
    ? "https://api.openai.com/v1/audio/speech"
    : "https://gen.pollinations.ai/v1/audio/speech";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (effectiveApiKey) {
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
  }

  const upstreamModel = isOpenAiDirect ? "tts-1" : (model || "openai/tts-1");

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: upstreamModel,
        input: inputText.slice(0, 4096),
        voice: voice || "alloy",
      }),
    });

    if (!res.ok) {
      // Fallback to GET audio endpoint on Pollinations if /v1/audio/speech returns error
      if (!isOpenAiDirect) {
        const fallbackUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(
          inputText.slice(0, 500),
        )}?voice=${encodeURIComponent(voice || "alloy")}`;
        const fallbackRes = await fetch(fallbackUrl, {
          headers: effectiveApiKey ? { Authorization: `Bearer ${effectiveApiKey}` } : {},
        });
        if (fallbackRes.ok) {
          const contentType = fallbackRes.headers.get("content-type") || "audio/mpeg";
          c.header("Content-Type", contentType);
          return c.body(fallbackRes.body as any);
        }
      }
      const err = await res.text();
      return c.json({ error: `TTS upstream error: ${err}` }, 502);
    }

    const contentType = res.headers.get("content-type") || "audio/mpeg";
    c.header("Content-Type", contentType);
    return c.body(res.body as any);
  } catch (err: any) {
    return c.json({ error: err?.message || "TTS generation failed" }, 500);
  }
});

aiRouter.post("/proxy", apiLimiter, async (c) => {
  const { provider, model, messages, prompt, systemPrompt, stream, apiKey, baseUrl, tools } =
    await c.req.json();
  const authHeader = c.req.header("authorization");
  // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
  const token = extractBearerToken(authHeader);
  let user = null;

  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }

  if (!user && provider !== "horde" && provider !== "pollinations") {
    return c.json({ error: "Authentication required for this model." }, 401);
  }

  let envKey = "";
  if (provider === "openrouter") {
    envKey = process.env.OPENROUTER_API_KEY || "";
  } else if (provider === "openai") {
    envKey = process.env.OPENAI_API_KEY || "";
  } else if (provider === "anthropic") {
    envKey = process.env.ANTHROPIC_API_KEY || "";
  } else if (provider === "google" || provider === "gemini") {
    envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  } else if (provider === "grok" || provider === "xai") {
    envKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || "";
  }

  let effectiveApiKey = apiKey;
  if (!effectiveApiKey && user?.id) {
    effectiveApiKey = (await getUserApiKey(user.id, provider)) || "";
  }
  if (!effectiveApiKey) {
    effectiveApiKey = envKey;
  }
  let integration: any = effectiveApiKey ? { api_key: effectiveApiKey } : null;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") {
        return c.json({ error: "Custom base URL must use HTTPS" }, 400);
      }
      const blockedHosts = [
        "localhost",
        "127.0.0.1",
        "::1",
        "169.254.169.254",
        "metadata.google.internal",
      ];
      if (
        blockedHosts.includes(parsed.hostname) ||
        parsed.hostname.startsWith("10.") ||
        parsed.hostname.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)
      ) {
        return c.json(
          { error: "Custom base URL must point to a public server" },
          400,
        );
      }
      integration = { ...integration, base_url: baseUrl };
    } catch {
      return c.json({ error: "Invalid custom base URL" }, 400);
    }
  }

  if (
    !integration?.api_key &&
    provider !== "horde" &&
    provider !== "pollinations" &&
    provider !== "shared-model"
  ) {
    return c.json({ error: "Provider not configured" }, 400);
  }

  // A03: cap message history and enforce a per-message content length limit
  const MAX_MSG_CONTENT_LENGTH = 32_768; // 32 KB per message
  const rawMessages = Array.isArray(messages)
    ? messages
    : [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...(prompt ? [{ role: "user", content: prompt }] : []),
      ];
  const processedMessages = rawMessages.slice(-20).map((m: any) => ({
    ...m,
    content:
      typeof m.content === "string" && m.content.length > MAX_MSG_CONTENT_LENGTH
        ? m.content.slice(0, MAX_MSG_CONTENT_LENGTH)
        : m.content,
  }));
  let finalMessages = [...processedMessages];

  // Pre-dispatch CSAM & Child Safety Scanning on User Messages
  const latestUserMessages = (processedMessages || [])
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
        user,
        userAgent,
        surface: "ai_chat",
        promptText: latestUserMessages,
        severity: textSafety.severity,
        reason: textSafety.reason || "CSAM / Child safety violation in AI prompt",
      });
      return c.json(lockdown.clientResponse, 400);
    }

    // Post-CSAM OpenAI Text Moderation
    const openAiTextCheck = await moderateText(latestUserMessages);
    if (!openAiTextCheck.allowed) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const enforcement = await handleModerationEnforcement(openAiTextCheck, {
        ip,
        user,
        userAgent,
        surface: "ai_chat",
        promptText: latestUserMessages,
      });
      if (enforcement) {
        return c.json(enforcement.clientResponse, 400);
      }
    }
  }

  const hasDateContext = finalMessages.some(
    (m: any) =>
      m.role === "system" &&
      typeof m.content === "string" &&
      m.content.includes("Current Date:"),
  );
  if (!hasDateContext) {
    const nowObj = new Date();
    const dateStr = nowObj.toISOString().split("T")[0];
    const fullDateStr = nowObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    finalMessages.unshift({
      role: "system",
      content: `Current Date: ${dateStr} (${fullDateStr}). You are always aware of today's real-world date; do not hallucinate past training cutoffs or older years.`,
    });
  }

  const hasWebsiteKnowledge = finalMessages.some(
    (m: any) =>
      m.role === "system" &&
      typeof m.content === "string" &&
      m.content.includes("Oxygen Low's Software"),
  );
  if (!hasWebsiteKnowledge) {
    finalMessages.unshift({
      role: "system",
      content: WEBSITE_KNOWLEDGE_SYSTEM_PROMPT,
    });
  }

  const fetchOptions: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: c.req.raw.signal,
  };

  try {
    let targetUrl = "";
    let requestBody: any = { stream, tools };

    if (provider === "openai") {
      targetUrl = "https://api.openai.com/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "anthropic") {
      targetUrl = "https://api.anthropic.com/v1/messages";
      const systemMessages = finalMessages.filter(
        (m: any) => m.role === "system",
      );
      const systemContent = systemMessages
        .map((m: any) => m.content)
        .join("\n\n");
      const transformedMessages = finalMessages.filter(
        (m: any) => m.role !== "system",
      );
      requestBody = {
        ...requestBody,
        model,
        messages: transformedMessages,
        max_tokens: 4096,
        system: systemContent || undefined,
      };
      fetchOptions.headers["x-api-key"] = integration?.api_key;
      fetchOptions.headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "google" || provider === "gemini") {
      const action = stream
        ? "streamGenerateContent?alt=sse&"
        : "generateContent?";
      targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}key=${integration?.api_key}`;
      requestBody = {
        systemInstruction: {
          parts: finalMessages
            .filter((m: any) => m.role === "system")
            .map((m: any) => ({ text: m.content })),
        },
        contents: finalMessages
          .filter((m: any) => m.role !== "system")
          .map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        tools: tools
          ? tools.map((t: any) => ({ function_declarations: [t.function] }))
          : undefined,
      };
    } else if (provider === "openrouter") {
      targetUrl = "https://openrouter.ai/api/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
      fetchOptions.headers["HTTP-Referer"] = "https://oxygenlow.com";
      fetchOptions.headers["X-Title"] = "Oxygen Low's Software";
    } else if (provider === "grok" || provider === "xai") {
      targetUrl = "https://api.x.ai/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "pollinations") {
      targetUrl = "https://gen.pollinations.ai/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      if (integration?.api_key) {
        fetchOptions.headers["Authorization"] = `Bearer ${integration.api_key}`;
      }
    } else if (provider === "horde") {
      let actualModel = resolveHordeModel(model);
      const hordeHeaders: Record<string, string> = {
        Authorization: `Bearer ${integration?.api_key || "0000000000"}`,
      };
      let hordeRequestBody = {
        max_tokens: requestBody.max_tokens || 512,
        ...requestBody,
        model: actualModel,
        messages: finalMessages,
      };

      if (stream) {
        let hordeResponse = await streamHordeWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal,
        });

        if (hordeResponse.status === 406) {
          const dynamicFallback = await getFallbackHordeModel(
            model.toLowerCase().includes("fast") ? "fast" : "general",
          );
          if (dynamicFallback && dynamicFallback !== actualModel) {
            actualModel = dynamicFallback;
            hordeRequestBody = { ...hordeRequestBody, model: actualModel };
            hordeResponse = await streamHordeWithContinuation({
              targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
              fetchHeaders: hordeHeaders,
              requestBody: hordeRequestBody,
              signal: c.req.raw.signal,
            });
          }
        }

        if (!hordeResponse.ok) {
          const status = hordeResponse.status;
          let userMessage = "The AI provider returned an error.";
          if (status === 401 || status === 403)
            userMessage = "Invalid or expired API key for this provider.";
          else if (status === 429)
            userMessage = "Rate limit exceeded. Please try again later.";
          else if (status === 503 || status === 502)
            userMessage = "The AI provider is temporarily unavailable.";
          return c.json({ error: userMessage }, status as any);
        }

        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        return c.body(hordeResponse.body as any);
      } else {
        let hordeResponse = await fetchHordeNonStreamWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal,
        });

        if (hordeResponse.status === 406) {
          const dynamicFallback = await getFallbackHordeModel(
            model.toLowerCase().includes("fast") ? "fast" : "general",
          );
          if (dynamicFallback && dynamicFallback !== actualModel) {
            actualModel = dynamicFallback;
            hordeRequestBody = { ...hordeRequestBody, model: actualModel };
            hordeResponse = await fetchHordeNonStreamWithContinuation({
              targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
              fetchHeaders: hordeHeaders,
              requestBody: hordeRequestBody,
              signal: c.req.raw.signal,
            });
          }
        }

        if (!hordeResponse.ok) {
          const status = hordeResponse.status;
          let userMessage = "The AI provider returned an error.";
          if (status === 401 || status === 403)
            userMessage = "Invalid or expired API key for this provider.";
          else if (status === 429)
            userMessage = "Rate limit exceeded. Please try again later.";
          else if (status === 503 || status === 502)
            userMessage = "The AI provider is temporarily unavailable.";
          return c.json({ error: userMessage }, status as any);
        }

        const data = await hordeResponse.json();
        return c.json(data);
      }
    } else if (provider === "shared-model") {
      const targetModelId = model;
      const origin = new URL(c.req.url).origin;
      const sharedUrl = `${origin}/api/models/shared/${encodeURIComponent(targetModelId)}/chat`;
      const sharedRes = await fetch(sharedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(c.req.header("Authorization")
            ? { Authorization: c.req.header("Authorization")! }
            : {}),
        },
        body: JSON.stringify({ messages: finalMessages, stream }),
        signal: c.req.raw.signal,
      });
      if (stream) {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        return c.body(sharedRes.body as any);
      } else {
        const data = await sharedRes.json();
        return c.json(data);
      }
    } else {
      return c.json({ error: "Unsupported provider" }, 400);
    }

    fetchOptions.body = JSON.stringify(requestBody);

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status;
      let userMessage = "The AI provider returned an error.";
      if (status === 401 || status === 403)
        userMessage = "Invalid or expired API key for this provider.";
      else if (status === 429)
        userMessage = "Rate limit exceeded. Please try again later.";
      else if (status === 503 || status === 502)
        userMessage = "The AI provider is temporarily unavailable.";
      return c.json({ error: userMessage }, status as any);
    }

    if (stream) {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      return c.body(upstreamResponse.body as any);
    } else {
      const data = await upstreamResponse.json();
      return c.json(data);
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return c.json({ error: "Request aborted" }, 499 as any);
    }
    // A09: log full error server-side; return generic message to client
    console.error("AI Proxy Error", err);
    return c.json({ error: "An internal error occurred" }, 500);
  }
});

aiRouter.post("/fetch-provider-models", apiLimiter, async (c) => {
  try {
    const { provider, apiKey } = await c.req.json();
    const cleanProvider = (provider || "").toLowerCase();

    let effectiveApiKey = apiKey;
    if (!effectiveApiKey) {
      const authHeader = c.req.header("authorization");
      const token = extractBearerToken(authHeader);
      if (token) {
        const user = await resolveUserFromToken(token);
        if (user?.id) {
          effectiveApiKey = (await getUserApiKey(user.id, cleanProvider)) || "";
        }
      }
    }

    if (cleanProvider === "pollinations") {
      try {
        const fetchHeaders: Record<string, string> = {};
        if (effectiveApiKey) {
          fetchHeaders["Authorization"] = `Bearer ${effectiveApiKey}`;
        }
        let res = await fetch("https://gen.pollinations.ai/v1/models", {
          headers: fetchHeaders,
        });
        if (!res.ok) {
          res = await fetch("https://text.pollinations.ai/models");
        }
        if (res.ok) {
          const list = await res.json();
          const items = Array.isArray(list) ? list : list?.data;
          if (Array.isArray(items)) {
            const models = items.map((m: any) => ({
              id: typeof m === "string" ? m : (m.id || m.name),
              name: typeof m === "string" ? m : (m.description || m.name || m.id),
            }));
            return c.json({ models });
          }
        }
      } catch {}
      return c.json({
        models: [
          { id: "inclusionai/ling-3.1-flash", name: "Free" },
          { id: "amazon/nova-micro-v1", name: "Cheap" },
          { id: "openai/gpt-6-luna", name: "Fast" },
          { id: "openai/gpt-5.6-terra", name: "Balanced" },
          { id: "openai/gpt-6.1-sol", name: "Smart" },
          { id: "openai/gpt-6-astra", name: "Smartest" },
        ],
      });
    }

    if (!effectiveApiKey && cleanProvider !== "openrouter") {
      return c.json(
        { error: "API key is required to fetch models for this provider" },
        400,
      );
    }

    if (cleanProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${effectiveApiKey}` },
      });
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `OpenAI returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.data || [])
        .filter(
          (m: any) =>
            m.id &&
            !m.id.includes("whisper") &&
            !m.id.includes("tts") &&
            !m.id.includes("dall-e") &&
            !m.id.includes("embedding") &&
            !m.id.includes("babbage") &&
            !m.id.includes("davinci"),
        )
        .map((m: any) => ({ id: m.id, name: m.id }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));
      return c.json({ models });
    }

    if (cleanProvider === "openrouter") {
      const headers: Record<string, string> = {};
      if (effectiveApiKey) headers["Authorization"] = `Bearer ${effectiveApiKey}`;
      const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
      if (!res.ok) {
        const err = await res.text();
        return c.json(
          { error: `OpenRouter returned ${res.status}: ${err}` },
          400,
        );
      }
      const json = await res.json();
      const models = (json.data || []).map((m: any) => ({
        id: m.id,
        name: m.name ? `${m.name} (${m.id})` : m.id,
      }));
      return c.json({ models });
    }

    if (cleanProvider === "grok" || cleanProvider === "xai") {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${effectiveApiKey}` },
      });
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `xAI returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
      }));
      return c.json({ models });
    }

    if (cleanProvider === "google" || cleanProvider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          effectiveApiKey,
        )}`,
      );
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `Google returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.models || [])
        .filter((m: any) =>
          (m.supportedGenerationMethods || []).includes("generateContent"),
        )
        .map((m: any) => ({
          id: (m.name || "").replace(/^models\//, ""),
          name: m.displayName
            ? `${m.displayName} (${(m.name || "").replace(/^models\//, "")})`
            : (m.name || "").replace(/^models\//, ""),
        }));
      return c.json({ models });
    }

    if (cleanProvider === "anthropic") {
      return c.json({
        models: [
          { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet v2" },
          { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
        ],
      });
    }

    return c.json(
      { error: "Unsupported provider for remote model fetching" },
      400,
    );
  } catch (err: any) {
    return c.json(
      { error: err?.message || "Failed to fetch provider models" },
      500,
    );
  }
});

aiRouter.get("/pollinations/config", (c) => {
  const appKey = process.env.POLLINATIONS_APP?.trim() || null;
  const supporterAppKey = process.env.POLLINATIONS_SUPPORTER_APP?.trim() || null;
  return c.json({
    configured: !!(appKey || supporterAppKey),
    appKey,
    supporterAppKey,
    hasSupporterApp: !!supporterAppKey,
  });
});

aiRouter.post("/pollinations/token", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code, code_verifier, redirect_uri, client_id } = body;
    if (!code || !code_verifier || !redirect_uri) {
      return c.json(
        { error: "code, code_verifier, and redirect_uri are required" },
        400,
      );
    }

    const effectiveClientId =
      client_id ||
      process.env.POLLINATIONS_APP?.trim() ||
      process.env.POLLINATIONS_SUPPORTER_APP?.trim() ||
      undefined;

    const tokenResponse = await fetch(
      "https://enter.pollinations.ai/api/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          code_verifier,
          redirect_uri,
          ...(effectiveClientId ? { client_id: effectiveClientId } : {}),
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      return c.json(
        { error: `Pollinations token exchange failed: ${errText}` },
        tokenResponse.status as any,
      );
    }

    const data = await tokenResponse.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err?.message || "Token exchange failed" }, 500);
  }
});

