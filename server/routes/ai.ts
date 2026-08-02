import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import path from "path";
import fs from "fs";
import { resolveCustomProviderUrl } from "../lib/safeAiUrl.ts";

export { isPrivateIP, validateAiUrl } from "../lib/safeAiUrl.ts";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const getSystemContentFromYaml = (filePath: string): string | null => {
  try {
    if (filePath.includes("..")) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(
      /role:\s*system\s+content:\s*\|?\s*([\s\S]*?)(?=\n[a-z]+:|$)/i,
    );
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
};

const DEFAULT_HORDE_MODELS = [
  { provider: "horde", model_id: "Fast" },
  { provider: "horde", model_id: "Balanced" },
  { provider: "horde", model_id: "Smart" },
  { provider: "horde", model_id: "Write" },
  { provider: "horde", model_id: "Code" },
];

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  const localModels = [...DEFAULT_HORDE_MODELS];

  const results = await Promise.allSettled([
    axios.get("http://127.0.0.1:11434/api/tags", { timeout: 2000 }).then((r) =>
      (r.data.models || []).map((m: any) => ({
        provider: "ollama",
        model_id: m.name,
      })),
    ),
    axios.get("http://127.0.0.1:1234/v1/models", { timeout: 2000 }).then((r) =>
      (r.data.data || []).map((m: any) => ({
        provider: "lmstudio",
        model_id: m.id,
      })),
    ),
    axios
      .get("http://127.0.0.1:5001/v1/models", { timeout: 2000 })
      .then((r) => {
        const models = (r.data.data || []).map((m: any) => ({
          provider: "koboldcpp",
          model_id: m.id,
        }));
        if (!models.length) throw new Error("No models");
        return models;
      })
      .catch(() =>
        axios
          .get("http://127.0.0.1:5001/api/v1/model", { timeout: 2000 })
          .then((r) =>
            r.data?.result
              ? [{ provider: "koboldcpp", model_id: r.data.result }]
              : [],
          ),
      ),
  ]);

  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      localModels.push(...result.value);
    }
  }

  res.json(localModels);
};

const HORDE_MODELS_MAP: Record<string, string[]> = {
  Fast: [
    "koboldcpp/Llama-3.2-3B",
    "koboldcpp/Meta-Llama-3-2-3B-Instruct.Q4_K_M",
    "koboldcpp/digo-prayudha/unsloth-llama-3.2-1b-gguf",
    "koboldcpp/Qwen_Qwen3-0.6B-IQ4_XS",
    "koboldcpp/Qwen/Qwen3.5-0.8B",
    "koboldcpp/mradermacher/Cerebras-GPT-111M-instruction-GGUF",
    "koboldcpp/mradermacher/pythia-70m-deduped.f16.gguf",
  ],
  Balanced: [
    "google/gemma-4-31b",
    "neroued/Qwen3.6-27B-nvfp4-NInfer",
    "aphrodite/TheDrummer/Cydonia-24B-v4.3",
    "koboldcpp/TheDrummer/Cydonia-24B-v4.3",
    "koboldcpp/Magidonia-24B-v4.3",
    "koboldcpp/Laguna-XS-2.1",
  ],
  Smart: [
    "koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    "google/gemma-4-31b",
    "koboldcpp/Sprinkle-Vanilla-Gemma-4-31B.i1-Q4_K_M.gguf",
    "neroued/Qwen3.6-27B-nvfp4-NInfer",
    "aphrodite/TheDrummer/Skyfall-31B-v4.2",
  ],
  Write: [
    "koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    "aphrodite/TheDrummer/Skyfall-31B-v4.2",
    "aphrodite/TheDrummer/Cydonia-24B-v4.3",
    "koboldcpp/TheDrummer/Cydonia-24B-v4.3",
    "koboldcpp/Magidonia-24B-v4.3",
    "google/gemma-4-31b",
    "koboldcpp/L3-Super-Nova-RP-8B",
    "koboldcpp/L3-8B-Stheno-v3.2-Q8_0",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "aphrodite/SicariusSicariiStuff/Impish_Bloodmoon_12B",
    "koboldcpp/Izuku Midoriya (Before U.A.)",
  ],
  Code: [
    "Qwen3-Coder-480B-A35B-Instruct",
    "Qwen3-Coder-Next",
    "koboldcpp/Laguna-XS-2.1",
    "neroued/Qwen3.6-27B-nvfp4-NInfer",
    "google/gemma-4-31b",
    "koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    "koboldcpp/Llama-3.2-3B",
    "koboldcpp/Meta-Llama-3-2-3B-Instruct.Q4_K_M",
  ],
};

export const handleGetHordeStatus: RequestHandler = async (_req, res) => {
  try {
    const response = await axios.get(
      "https://stablehorde.net/api/v2/status/models?type=text",
      { timeout: 10000 },
    );
    const allModels: any[] = response.data || [];

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

    res.json(result);
  } catch (e) {
    res.json({});
  }
};

export const handleProxyAiRequest: RequestHandler = async (req, res) => {
  const { provider, model, messages, stream, apiKey, baseUrl, tools } =
    req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ error: "No authorization header" });
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return res.status(401).json({ error: "Invalid token" });

  let { data: integration, error: integrationError } = await supabase
    .from("user_integrations")
    .select("api_key, base_url")
    .eq("provider", provider)
    .single();

  if (integrationError && integrationError.code !== "PGRST116") {
    console.error("Integration lookup error:", integrationError);
    return res
      .status(500)
      .json({ error: "Failed to fetch integration settings" });
  }

  if (apiKey) {
    integration = { ...integration, api_key: apiKey };
  }
  if (baseUrl) {
    integration = { ...integration, base_url: baseUrl };
  }

  if (
    !integration?.api_key &&
    provider !== "ollama" &&
    provider !== "kobold" &&
    provider !== "koboldcpp" &&
    provider !== "lmstudio" &&
    provider !== "horde"
  ) {
    return res.status(400).json({ error: "Provider not configured" });
  }

  const processedMessages = (messages || []).slice(-20);
  const basePromptFile = path.join(
    process.cwd(),
    "prompts",
    "chat",
    "base_artifacts.prompt.yml",
  );
  const baseContent = getSystemContentFromYaml(basePromptFile);
  if (baseContent)
    processedMessages.unshift({ role: "system", content: baseContent });

  const abortController = new AbortController();
  const axiosOptions: any = {
    headers: { "Content-Type": "application/json" },
    timeout: 120000,
    validateStatus: () => true,
    signal: abortController.signal,
  };
  if (stream) axiosOptions.responseType = "stream";

  req.on("close", () => {
    abortController.abort();
  });

  const handleResponse = async (response: any) => {
    if (response.status >= 400) {
      let errorData = response.data;
      if (stream && response.data && typeof response.data.on === "function") {
        try {
          const chunks = [];
          for await (const chunk of response.data) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString();
          try {
            errorData = JSON.parse(text);
          } catch {
            errorData = text;
          }
        } catch (e) {
          errorData = "Error reading upstream error response";
        }
      }

      const errorMessage =
        typeof errorData === "string"
          ? errorData
          : errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            "Upstream service error";

      return res.status(response.status).json({
        error: errorMessage,
        status: response.status,
        upstream: errorData,
      });
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      response.data.pipe(res);
      response.data.on("end", () => {
        abortController.abort();
      });
    } else {
      res.status(response.status).json(response.data);
    }
  };

  try {
    switch (provider) {
      case "openai":
        await handleResponse(
          await axios.post(
            "https://api.openai.com/v1/chat/completions",
            { model, messages: processedMessages, stream, tools },
            {
              ...axiosOptions,
              headers: {
                ...axiosOptions.headers,
                Authorization: `Bearer ${integration?.api_key}`,
              },
            },
          ),
        );
        break;
      case "anthropic": {
        const systemMessages = processedMessages.filter(
          (m: any) => m.role === "system",
        );
        const systemContent = systemMessages
          .map((m: any) => m.content)
          .join("\n\n");
        const transformedMessages = processedMessages
          .filter((m: any) => m.role !== "system")
          .map((m: any) => {
            if (Array.isArray(m.content)) {
              return {
                role: m.role,
                content: m.content
                  .map((part: any) => {
                    if (part.type === "text")
                      return { type: "text", text: part.text };
                    if (part.type === "image_url") {
                      const url = part.image_url?.url || part.image_url;
                      if (typeof url === "string" && url.includes(",")) {
                        const [header, base64Data] = url.split(",");
                        const mimeType =
                          header.split(";")[0].split(":")[1] || "image/jpeg";
                        if (base64Data) {
                          return {
                            type: "image",
                            source: {
                              type: "base64",
                              media_type: mimeType,
                              data: base64Data,
                            },
                          };
                        }
                      }
                    }
                    return null;
                  })
                  .filter(Boolean),
              };
            }
            return m;
          });
        await handleResponse(
          await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
              model,
              messages: transformedMessages,
              max_tokens: 4096,
              stream,
              system: systemContent || undefined,
              tools,
            },
            {
              ...axiosOptions,
              headers: {
                ...axiosOptions.headers,
                "x-api-key": integration?.api_key,
                "anthropic-version": "2023-06-01",
              },
            },
          ),
        );
        break;
      }
      case "google": {
        if (typeof model !== "string" || !/^[a-zA-Z0-9\-_]+$/.test(model)) {
          return res.status(400).json({ error: "Invalid Google model ID" });
        }
        await handleResponse(
          await axios({
            method: "post",
            baseURL: "https://generativelanguage.googleapis.com",
            url: "/v1beta/models/" + model + ":generateContent",
            data: {
              systemInstruction: {
                parts: processedMessages
                  .filter((m: any) => m.role === "system")
                  .map((m: any) => ({ text: m.content })),
              },
              contents: processedMessages
                .filter((m: any) => m.role !== "system")
                .map((m: any) => {
                  const role = m.role === "assistant" ? "model" : "user";
                  let parts = [];
                  if (Array.isArray(m.content)) {
                    parts = m.content
                      .map((part: any) => {
                        if (part.type === "text") return { text: part.text };
                        if (part.type === "image_url") {
                          const url = part.image_url?.url || part.image_url;
                          if (typeof url === "string" && url.includes(",")) {
                            const [header, base64Data] = url.split(",");
                            const mimeType =
                              header.split(";")[0].split(":")[1] ||
                              "image/jpeg";
                            if (base64Data) {
                              return {
                                inline_data: {
                                  mime_type: mimeType,
                                  data: base64Data,
                                },
                              };
                            }
                          }
                        }
                        return null;
                      })
                      .filter(Boolean);
                  } else {
                    parts = [{ text: m.content }];
                  }
                  return { role, parts };
                }),
              tools: tools
                ? tools.map((t: any) => ({
                    function_declarations: [t.function],
                  }))
                : undefined,
            },
            params: { key: integration?.api_key },
            ...axiosOptions,
          }),
        );
        break;
      }
      case "horde": {
        let hordeModels = HORDE_MODELS_MAP[model] || [model];

        try {
          const statusRes = await axios.get(
            "https://stablehorde.net/api/v2/status/models?type=text",
            { timeout: 5000 },
          );
          if (statusRes.data && Array.isArray(statusRes.data)) {
            const modelStats = statusRes.data.reduce((acc: any, m: any) => {
              if (m.name)
                acc[m.name] = { eta: m.eta || 0, count: m.count || 0 };
              return acc;
            }, {});

            let bestModel = null;
            if (model === "Fast") {
              const onlineFastModels = hordeModels.filter(
                (m: string) => modelStats[m] && modelStats[m].count > 0,
              );
              if (onlineFastModels.length > 0) {
                const minEta = Math.min(
                  ...onlineFastModels.map((m: string) => modelStats[m].eta),
                );
                const fastestModels = onlineFastModels.filter(
                  (m: string) => modelStats[m].eta === minEta,
                );
                bestModel = fastestModels[0];
              }
            } else {
              for (const m of hordeModels) {
                const stats = modelStats[m];
                if (stats && stats.count > 0 && stats.eta <= 30) {
                  bestModel = m;
                  break;
                }
              }
            }

            if (bestModel) {
              hordeModels = [bestModel];
            } else {
              const onlineModels = hordeModels.filter(
                (m) => modelStats[m] && modelStats[m].count > 0,
              );
              if (onlineModels.length > 0) {
                hordeModels = [onlineModels[0]];
              }
            }
          }
        } catch (e) {
          // Keep hordeModels as default if API fails
        }
        const prompt =
          processedMessages
            .map((m: any) => {
              const role =
                m.role === "system"
                  ? "### System"
                  : m.role === "user"
                    ? "### Instruction"
                    : "### Response";
              return role + ":\n" + m.content;
            })
            .join("\n\n") + "\n\n### Response:\n";
        const clientAgent =
          "OxygenLowsSoftware:0.1.1:https://github.com/Oxygen-Low/Oxygen-Lows-Software";
        const hordeApiKey = integration?.api_key || "0000000000";

        // Submit to native async API
        const submitResponse = await axios.post(
          "https://stablehorde.net/api/v2/generate/text/async",
          {
            models: hordeModels,
            prompt,
            params: {
              max_context_length: 1024,
              max_length: 500,
            },
          },
          {
            ...axiosOptions,
            responseType: "json",
            headers: {
              ...axiosOptions.headers,
              apikey: hordeApiKey,
              "Client-Agent": clientAgent,
            },
          },
        );

        if (submitResponse.status >= 400) {
          return res.status(submitResponse.status).json(submitResponse.data);
        }

        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();
        }

        const jobId = submitResponse.data.id;
        let finished = false;
        let resultText = "";
        let attempts = 0;
        const maxAttempts = 300; // 10 minutes wait
        let lastWorkers = 0;
        let lastQueued = 0;

        while (!finished && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;

          if (stream) {
            // Send keep-alive to prevent intermediate proxies or browser from dropping connection
            res.write(": keepalive\n\n");
            if (typeof (res as any).flush === "function") {
              (res as any).flush();
            }
          }

          try {
            const statusResponse = await axios.get(
              `https://stablehorde.net/api/v2/generate/text/status/${jobId}`,
              {
                headers: {
                  apikey: hordeApiKey,
                  "Client-Agent": clientAgent,
                },
                timeout: 10000,
                signal: abortController.signal,
                validateStatus: () => true,
              },
            );

            if (statusResponse.status === 404) {
              if (stream) {
                res.write(
                  `data: ${JSON.stringify({ error: "AI Horde job not found or expired" })}\n\n`,
                );
                res.write("data: [DONE]\n\n");
                return res.end();
              }
              return res
                .status(404)
                .json({ error: "AI Horde job not found or expired" });
            }

            if (
              statusResponse.status >= 400 &&
              statusResponse.status !== 503 &&
              statusResponse.status !== 502
            ) {
              if (stream) {
                res.write(
                  `data: ${JSON.stringify({ error: `AI Horde generation failed with status ${statusResponse.status}` })}\n\n`,
                );
                res.write("data: [DONE]\n\n");
                return res.end();
              }
              return res.status(statusResponse.status).json({
                error: `AI Horde generation failed with status ${statusResponse.status}`,
              });
            }

            if (statusResponse.data?.done) {
              finished = true;
              if (
                statusResponse.data.generations &&
                statusResponse.data.generations.length > 0
              ) {
                resultText = statusResponse.data.generations[0].text;
              }
            } else if (statusResponse.data?.faulted) {
              if (stream) {
                res.write(
                  `data: ${JSON.stringify({ error: "AI Horde generation faulted" })}\n\n`,
                );
                res.write("data: [DONE]\n\n");
                return res.end();
              }
              return res
                .status(500)
                .json({ error: "AI Horde generation faulted" });
            } else if (statusResponse.data?.is_possible === false) {
              if (stream) {
                res.write(
                  `data: ${JSON.stringify({ error: "AI Horde generation is not possible (no workers)" })}\n\n`,
                );
                res.write("data: [DONE]\n\n");
                return res.end();
              }
              return res.status(503).json({
                error: "AI Horde generation is not possible (no workers)",
              });
            } else {
              if (stream) {
                const pollThrottleInterval = 5;
                if ((attempts - 1) % pollThrottleInterval === 0) {
                  try {
                    const modelStatusRes = await axios.get(
                      "https://stablehorde.net/api/v2/status/models?type=text",
                      {
                        timeout: 5000,
                        signal: abortController.signal,
                        headers: {
                          "Client-Agent": clientAgent,
                        },
                      },
                    );
                    const allModels = modelStatusRes.data || [];
                    const hordeNames = HORDE_MODELS_MAP[model] || [model];
                    const statusByName: Record<string, any> = {};
                    for (const m of allModels) {
                      if (m.name) statusByName[m.name] = m;
                    }
                    let currentWorkers = 0;
                    let currentQueued = 0;
                    for (const name of hordeNames) {
                      const info = statusByName[name];
                      if (info) {
                        currentWorkers += info.count || 0;
                        currentQueued += info.queued || 0;
                      }
                    }
                    lastWorkers = currentWorkers;
                    lastQueued = currentQueued;
                  } catch (e) {
                    // Ignore errors, keep the last known workers & queued
                  }
                }

                const chunk = {
                  id: jobId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: hordeModels[0],
                  choices: [
                    {
                      index: 0,
                      delta: {},
                    },
                  ],
                  queue_info: {
                    eta: statusResponse.data?.wait_time ?? 0,
                    position: statusResponse.data?.queue_position ?? 0,
                    workers: lastWorkers,
                    totalInQueue: lastQueued,
                  },
                };
                res.write("data: " + JSON.stringify(chunk) + "\n\n");
                if (typeof (res as any).flush === "function") {
                  (res as any).flush();
                }
              }
            }
          } catch (err: any) {
            // ignore timeout/network errors during polling and try again
            if (axios.isCancel(err)) throw err;
            console.error("AI Horde poll error:", err.message);
          }
        }

        if (!finished) {
          if (stream) {
            res.write(
              `data: ${JSON.stringify({ error: "AI Horde generation timed out" })}\n\n`,
            );
            res.write("data: [DONE]\n\n");
            return res.end();
          }
          return res
            .status(504)
            .json({ error: "AI Horde generation timed out" });
        }

        if (stream) {
          const chunk = {
            id: jobId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: hordeModels[0],
            choices: [
              {
                index: 0,
                delta: { content: resultText },
                finish_reason: "stop",
              },
            ],
          };
          res.write("data: " + JSON.stringify(chunk) + "\n\n");
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.json({
            id: jobId,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: hordeModels[0],
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: resultText },
                finish_reason: "stop",
              },
            ],
          });
        }
        break;
      }
      case "openrouter":
        await handleResponse(
          await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            { model, messages: processedMessages, stream },
            {
              ...axiosOptions,
              headers: {
                ...axiosOptions.headers,
                Authorization: `Bearer ${integration?.api_key}`,
              },
            },
          ),
        );
        break;
      case "grok":
        await handleResponse(
          await axios.post(
            "https://api.x.ai/v1/chat/completions",
            { model, messages: processedMessages, stream },
            {
              ...axiosOptions,
              headers: {
                ...axiosOptions.headers,
                Authorization: `Bearer ${integration?.api_key}`,
              },
            },
          ),
        );
        break;
      case "ollama":
        await handleResponse(
          await axios.post(
            "http://127.0.0.1:11434/api/chat",
            { model, messages: processedMessages, stream },
            axiosOptions,
          ),
        );
        break;
      case "lmstudio":
        await handleResponse(
          await axios.post(
            "http://127.0.0.1:1234/v1/chat/completions",
            {
              model,
              messages: processedMessages,
              stream,
            },
            axiosOptions,
          ),
        );
        break;
      case "koboldcpp":
      case "kobold":
        await handleResponse(
          await axios.post(
            "http://127.0.0.1:5001/v1/chat/completions",
            { model, messages: processedMessages, stream },
            axiosOptions,
          ),
        );
        break;
      case "custom": {
        if (!integration?.base_url)
          return res.status(400).json({ error: "Base URL required" });
        const finalUrl = await resolveCustomProviderUrl(integration.base_url);
        const customHeaders = integration?.api_key
          ? {
              ...axiosOptions.headers,
              Authorization: `Bearer ${integration.api_key}`,
            }
          : axiosOptions.headers;

        // lgtm [js/ssrf]
        // codeql [js/ssrf]
        const customResponse = await axios.post(
          finalUrl,
          { model, messages: processedMessages, stream },
          { ...axiosOptions, headers: customHeaders },
        );
        await handleResponse(customResponse);
        break;
      }
      default:
        res.status(400).json({ error: "Unsupported provider" });
    }
  } catch (error: any) {
    if (axios.isCancel(error)) return;
    if (error.code === "ECONNABORTED")
      return res.status(504).json({ error: "Upstream request timed out" });
    res.status(500).json({ error: error.message });
  }
};
