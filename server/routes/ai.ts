import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import path from "path";
import fs from "fs";
import { resolveCustomProviderUrl } from "../lib/safeAiUrl";

export { isPrivateIP, validateAiUrl } from "../lib/safeAiUrl";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const getSystemContentFromYaml = (filePath: string): string | null => {
  try {
    if (filePath.includes("..") || path.isAbsolute(filePath)) {
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

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  const localModels = [];

  try {
    const response = await axios.get("http://127.0.0.1:11434/api/tags", {
      timeout: 2000,
    });
    const models = (response.data.models || []).map((m: any) => ({
      provider: "ollama",
      model_id: m.name,
    }));
    localModels.push(...models);
  } catch (error) {
    // Ignore Ollama errors
  }

  try {
    const response = await axios.get("http://127.0.0.1:1234/v1/models", {
      timeout: 2000,
    });
    const models = (response.data.data || []).map((m: any) => ({
      provider: "lmstudio",
      model_id: m.id,
    }));
    localModels.push(...models);
  } catch (error) {
    // Ignore LMStudio errors
  }

  try {
    const response = await axios.get("http://127.0.0.1:5001/v1/models", {
      timeout: 2000,
    });
    const models = (response.data.data || []).map((m: any) => ({
      provider: "koboldcpp",
      model_id: m.id,
    }));
    if (!models.length)
      throw new Error("No Kobold.cpp OpenAI-compatible models found");
    localModels.push(...models);
  } catch (error) {
    try {
      const response = await axios.get("http://127.0.0.1:5001/api/v1/model", {
        timeout: 2000,
      });
      const modelId = response.data?.result;
      if (modelId) {
        localModels.push({
          provider: "koboldcpp",
          model_id: modelId,
        });
      }
    } catch (fallbackError) {
      // Ignore Kobold.cpp errors
    }
  }

  res.json(localModels);
};

export const handleProxyAiRequest: RequestHandler = async (req, res) => {
  const { provider, model, messages, stream, style, apiKey, baseUrl } =
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

  let { data: integration } = await supabase
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
    provider !== "ollama" &&
    provider !== "kobold" &&
    provider !== "koboldcpp" &&
    provider !== "lmstudio"
  ) {
    return res.status(400).json({ error: "Provider not configured" });
  }

  const processedMessages = (messages || []).slice(-11);
  const basePromptFile = path.join(
    process.cwd(),
    "prompts",
    "chat",
    "base_artifacts.prompt.yml",
  );
  const baseContent = getSystemContentFromYaml(basePromptFile);
  if (baseContent)
    processedMessages.unshift({ role: "system", content: baseContent });

  if (style) {
    const base = path.resolve(process.cwd(), "prompts", "chat");
    const target = path.resolve(base, `${style}.prompt.yml`);
    const relative = path.relative(base, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid file path");
    }
    const styleContent = getSystemContentFromYaml(target);
    if (styleContent)
      processedMessages.unshift({ role: "system", content: styleContent });
  }

  const abortController = new AbortController();
  const axiosOptions: any = {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
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
      case "anthropic": {
        const s = processedMessages.find((m: any) => m.role === "system");
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
              system: s?.content,
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
              contents: processedMessages.map((m: any) => {
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
                            header.split(";")[0].split(":")[1] || "image/jpeg";
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
            },
            params: { key: integration?.api_key },
            ...axiosOptions,
          }),
        );
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
            { model, messages: processedMessages, stream },
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
        // Explicitly re-verify the URL to mitigate SSRF and satisfy security scanners.
        const parsedUrl = new URL(finalUrl);
        if (parsedUrl.protocol !== "https:") {
          throw new Error("Only HTTPS is allowed for custom providers");
        }

        await handleResponse(
          await axios.post(
            parsedUrl.toString(),
            { model, messages: processedMessages, stream },
            { ...axiosOptions, headers: customHeaders },
          ),
        );
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

export const handleGetChatStyles: RequestHandler = async (_req, res) => {
  const stylesDir = path.join(process.cwd(), "prompts", "chat");
  try {
    if (!fs.existsSync(stylesDir)) return res.json([]);
    const files = fs.readdirSync(stylesDir);
    const styles = [];
    for (const file of files) {
      if (
        file.endsWith(".prompt.yml") &&
        file !== "base_artifacts.prompt.yml"
      ) {
        const id = file.replace(".prompt.yml", "");
        const descFile = path.join(stylesDir, `${id}.description`);
        let title = id,
          description = "";
        if (fs.existsSync(descFile)) {
          const content = fs.readFileSync(descFile, "utf-8");
          const lines = content.split("\n");
          title =
            lines
              .find((l) => l.startsWith("Title:"))
              ?.split(":")[1]
              ?.trim() || id;
          description =
            lines
              .find((l) => l.startsWith("Description:"))
              ?.split(":")[1]
              ?.trim() || "";
        }
        styles.push({ id, title, description });
      }
    }
    res.json(styles);
  } catch (error) {
    res.status(500).json({ error: "Failed to load styles" });
  }
};
