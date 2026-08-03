import { Hono } from "hono";
import { env } from "hono/adapter";
import { createClient } from "@supabase/supabase-js";

export const aiRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const DEFAULT_MODELS = [
  { provider: "horde", model_id: "Fast" },
  { provider: "horde", model_id: "Smart" },
  { provider: "cloudflare", model_id: "@cf/nvidia/nemotron-3-120b-a12b" },
  { provider: "cloudflare", model_id: "@cf/google/gemma-4-26b-a4b-it" },
  { provider: "cloudflare", model_id: "@cf/zai-org/glm-4.7-flash" },
  { provider: "cloudflare", model_id: "@cf/ibm-granite/granite-4.0-h-micro" },
  { provider: "cloudflare", model_id: "@cf/meta/llama-3.1-8b-instruct-fast" },
];

const HORDE_MODELS_MAP: Record<string, string[]> = {
  Fast: ["koboldcpp/Llama-3.2-1B-Instruct"],
  Smart: ["koboldcpp/Behemoth-128B-v3b-Q4_K_M"],
};

const apiLimiter = async (c: any, next: any) => {
  await next();
};

aiRouter.get("/local-providers", apiLimiter, async (c) => {
  return c.json([...DEFAULT_MODELS]);
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

aiRouter.post("/proxy", apiLimiter, async (c) => {
  const { provider, model, messages, stream, apiKey, baseUrl, tools } =
    await c.req.json();
  const authHeader = c.req.header("authorization");
  if (!authHeader) return c.json({ error: "No authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return c.json({ error: "Invalid token" }, 401);

  let { data: integration, error: integrationError } = await supabase
    .from("user_integrations")
    .select("api_key, base_url")
    .eq("provider", provider)
    .single();

  if (apiKey) {
    integration = { ...integration, api_key: apiKey };
  }
  if (baseUrl) {
    integration = { ...integration, base_url: baseUrl };
  }

  if (
    !integration?.api_key &&
    provider !== "horde" &&
    provider !== "cloudflare"
  ) {
    return c.json({ error: "Provider not configured" }, 400);
  }

  const processedMessages = (messages || []).slice(-20);

  // Basic system prompt for edge (simplified, as file read isn't available)
  const baseContent = "You are an AI assistant.";
  processedMessages.unshift({ role: "system", content: baseContent });

  const fetchOptions: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  try {
    let targetUrl = "";
    let requestBody: any = { stream, tools };

    if (provider === "openai") {
      targetUrl = "https://api.openai.com/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: processedMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "anthropic") {
      targetUrl = "https://api.anthropic.com/v1/messages";
      const systemMessages = processedMessages.filter(
        (m: any) => m.role === "system",
      );
      const systemContent = systemMessages
        .map((m: any) => m.content)
        .join("\n\n");
      const transformedMessages = processedMessages.filter(
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
    } else if (provider === "google") {
      const action = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
      targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}key=${integration?.api_key}`;
      requestBody = {
        systemInstruction: {
          parts: processedMessages
            .filter((m: any) => m.role === "system")
            .map((m: any) => ({ text: m.content })),
        },
        contents: processedMessages
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
      requestBody = { ...requestBody, model, messages: processedMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "grok") {
      targetUrl = "https://api.x.ai/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: processedMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "horde") {
      targetUrl = "https://oai.stablehorde.net/v1/chat/completions";
      const actualModel = HORDE_MODELS_MAP[model]?.[0] || model;
      requestBody = {
        ...requestBody,
        model: actualModel,
        messages: processedMessages,
      };
      fetchOptions.headers["Authorization"] =
        `Bearer ${integration?.api_key || "0000000000"}`;
    } else if (provider === "cloudflare") {
      // Deduct points first
      const { data: success, error: rpcError } = await supabase.rpc(
        "spend_points",
        { p_amount: 50 },
      );
      if (rpcError || !success) {
        return c.json({ error: "Insufficient points" }, 402);
      }

      const rawEnv = (c.env || {}) as any;
      let AccountID = "";
      let CloudflareAPIToken = "";

      for (const [key, value] of Object.entries(rawEnv)) {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey === "accountid" || cleanKey === "account_id")
          AccountID = (value as string).trim();
        if (
          cleanKey === "cloudflareapitoken" ||
          cleanKey === "cloudflare_api_token"
        )
          CloudflareAPIToken = (value as string).trim();
      }

      const procEnv =
        typeof process !== "undefined" ? process.env : ({} as any);
      if (!AccountID) {
        AccountID = (procEnv.AccountID || procEnv.ACCOUNT_ID || "").trim();
      }
      if (!CloudflareAPIToken) {
        CloudflareAPIToken = (
          procEnv.CloudflareAPIToken ||
          procEnv.CLOUDFLARE_API_TOKEN ||
          ""
        ).trim();
      }

      if (!AccountID || !CloudflareAPIToken) {
        return c.json(
          {
            error: `Cloudflare Server Environment Variables (AccountID, CloudflareAPIToken) are missing or empty. Found keys: ${Object.keys(
              rawEnv,
            )
              .map((k) => '"' + k + '"')
              .join(", ")}`,
          },
          500,
        );
      }

      targetUrl = `https://api.cloudflare.com/client/v4/accounts/${AccountID}/ai/v1/chat/completions`;
      requestBody = { model, messages: processedMessages };
      if (stream) {
        requestBody.stream = true;
      }
      fetchOptions.headers["Authorization"] = `Bearer ${CloudflareAPIToken}`;
    } else {
      return c.json({ error: "Unsupported provider" }, 400);
    }

    fetchOptions.body = JSON.stringify(requestBody);

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    if (!upstreamResponse.ok) {
      const errData = await upstreamResponse.text();
      return c.json(
        { error: "Upstream error", details: errData },
        upstreamResponse.status as any,
      );
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
    console.error("AI Proxy Error", err);
    return c.json({ error: err.message }, 500);
  }
});
