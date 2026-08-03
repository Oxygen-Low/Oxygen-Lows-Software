import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const aiRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const DEFAULT_HORDE_MODELS = [
  { provider: "horde", model_id: "Fast" },
  { provider: "horde", model_id: "Balanced" },
  { provider: "horde", model_id: "Smart" },
  { provider: "horde", model_id: "Write" },
  { provider: "horde", model_id: "Code" },
];

const HORDE_MODELS_MAP: Record<string, string[]> = {
  Fast: [
    "koboldcpp/Llama-3.2-3B",
    "koboldcpp/Meta-Llama-3-2-3B-Instruct.Q4_K_M",
    "koboldcpp/Qwen_Qwen3-0.6B-IQ4_XS",
  ],
  Balanced: [
    "google/gemma-4-31b",
    "neroued/Qwen3.6-27B-nvfp4-NInfer",
  ],
  Smart: [
    "koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    "google/gemma-4-31b",
  ],
  Write: [
    "koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    "google/gemma-4-31b",
  ],
  Code: [
    "Qwen3-Coder-Next",
    "neroued/Qwen3.6-27B-nvfp4-NInfer",
    "google/gemma-4-31b",
  ],
};

const apiLimiter = async (c: any, next: any) => {
  await next();
};

aiRouter.get("/local-providers", apiLimiter, async (c) => {
  // Edge workers cannot reach local network providers reliably.
  // We only return the default horde models.
  return c.json([...DEFAULT_HORDE_MODELS]);
});

aiRouter.get("/horde-status", apiLimiter, async (c) => {
  try {
    const response = await fetch("https://stablehorde.net/api/v2/status/models?type=text");
    if (!response.ok) return c.json({});
    const allModels: any[] = await response.json();

    const statusByName: Record<string, any> = {};
    for (const m of allModels) {
      if (m.name) statusByName[m.name] = m;
    }

    const result: Record<string, { workers: number; queued: number; speed: string; eta: number }> = {};

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
  const { provider, model, messages, stream, apiKey, baseUrl, tools } = await c.req.json();
  const authHeader = c.req.header("authorization");
  if (!authHeader) return c.json({ error: "No authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
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

  if (!integration?.api_key && provider !== "horde") {
    return c.json({ error: "Provider not configured" }, 400);
  }

  const processedMessages = (messages || []).slice(-20);
  
  // Basic system prompt for edge (simplified, as file read isn't available)
  const baseContent = "You are an AI assistant.";
  processedMessages.unshift({ role: "system", content: baseContent });

  const fetchOptions: any = {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    }
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
      const systemMessages = processedMessages.filter((m: any) => m.role === "system");
      const systemContent = systemMessages.map((m: any) => m.content).join("\n\n");
      const transformedMessages = processedMessages.filter((m: any) => m.role !== "system");
      requestBody = { ...requestBody, model, messages: transformedMessages, max_tokens: 4096, system: systemContent || undefined };
      fetchOptions.headers["x-api-key"] = integration?.api_key;
      fetchOptions.headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "google") {
      targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${integration?.api_key}`;
      requestBody = {
          systemInstruction: {
            parts: processedMessages.filter((m: any) => m.role === "system").map((m: any) => ({ text: m.content })),
          },
          contents: processedMessages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          tools: tools ? tools.map((t: any) => ({ function_declarations: [t.function] })) : undefined,
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
      return c.json({ error: "Horde streaming not supported directly in edge via this simplified proxy yet." }, 501);
    } else {
        return c.json({ error: "Unsupported provider" }, 400);
    }

    fetchOptions.body = JSON.stringify(requestBody);

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    if (!upstreamResponse.ok) {
        const errData = await upstreamResponse.text();
        return c.json({ error: "Upstream error", details: errData }, upstreamResponse.status as any);
    }

    if (stream) {
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');
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
