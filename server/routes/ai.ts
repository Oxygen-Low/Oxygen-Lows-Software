import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import path from "path";
import fs from "fs";
import net from "net";
import { lookup } from "dns/promises";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

export const isPrivateIP = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 0 || parts[0] === 127 || parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254)) return true;
    return false;
  } else if (net.isIPv6(ip)) {
    const expanded = ip.toLowerCase();
    if (expanded === "::1" || expanded === "0:0:0:0:0:0:0:1") return true;
    const v4MappedMatch = expanded.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4MappedMatch) return isPrivateIP(v4MappedMatch[1]);
    if (expanded.startsWith("fc") || expanded.startsWith("fd") || expanded.startsWith("fe8") || expanded.startsWith("fe9") || expanded.startsWith("fea") || expanded.startsWith("feb")) return true;
    return false;
  }
  return false;
};

export const validateAiUrl = async (baseUrl: string): Promise<void> => {
  const u = new URL(baseUrl);
  if (u.protocol !== "https:") throw new Error("HTTPS required");
  if (isPrivateIP(u.hostname) || ["localhost", "127.0.0.1", "::1"].includes(u.hostname.toLowerCase())) throw new Error("Public origin required");
  try {
    const { address } = await lookup(u.hostname);
    if (isPrivateIP(address)) throw new Error("Public origin required");
  } catch (e: any) {
    if (e.message === "Public origin required") throw e;
  }
};

function buildValidatedCustomUrl(baseUrl: string): string {
  try {
    if (baseUrl.includes('/../') || /\/%2e%2e\//i.test(baseUrl)) {
      throw new Error('Invalid path');
    }
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    url.pathname = url.pathname.replace(/\/+$/, "") + "/chat/completions";
    return url.href;
  } catch {
    throw new Error('Invalid URL');
  }
}

const getSystemContentFromYaml = (filePath: string): string | null => {
  try {
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(/role:\s*system\s+content:\s*\|?\s*([\s\S]*?)(?=\n[a-z]+:|$)/i);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
};

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  try {
    const response = await axios.get("http://127.0.0.1:11434/api/tags", { timeout: 2000 });
    const models = (response.data.models || []).map((m: any) => ({
      provider: "ollama",
      model_id: m.name
    }));
    res.json(models);
  } catch (error) {
    res.json([]);
  }
};

export const handleProxyAiRequest: RequestHandler = async (req, res) => {
  const { provider, model, messages, stream, style } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No authorization header" });
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: "Invalid token" });

  const { data: integration } = await supabase
    .from("user_integrations")
    .select("api_key, base_url")
    .eq("provider", provider)
    .single();

  if (!integration?.api_key && provider !== "ollama" && provider !== "kobold") {
    return res.status(400).json({ error: "Provider not configured" });
  }

  const processedMessages = (messages || []).slice(-11);
  const basePromptFile = path.join(process.cwd(), "prompts", "chat", "base_artifacts.prompt.yml");
  const baseContent = getSystemContentFromYaml(basePromptFile);
  if (baseContent) processedMessages.unshift({ role: "system", content: baseContent });

  if (style) {
    const base = path.resolve(process.cwd(), "prompts", "chat");
    const target = path.resolve(base, `${style}.prompt.yml`);
    const relative = path.relative(base, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid file path');
    }
    const styleContent = getSystemContentFromYaml(target);
    if (styleContent) processedMessages.unshift({ role: "system", content: styleContent });
  }

  const abortController = new AbortController();
  const axiosOptions: any = {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
    validateStatus: () => true,
    signal: abortController.signal
  };
  if (stream) axiosOptions.responseType = "stream";

  req.on("close", () => {
    abortController.abort();
  });

  const handleResponse = (response: any) => {
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
        handleResponse(await axios.post("https://api.openai.com/v1/chat/completions", { model, messages: processedMessages, stream }, axiosOptions));
        break;
      case "anthropic": {
        const s = processedMessages.find((m: any) => m.role === "system");
        const transformedMessages = processedMessages.filter((m: any) => m.role !== "system").map((m: any) => {
          if (Array.isArray(m.content)) {
            return {
              role: m.role,
              content: m.content.map((part: any) => {
                if (part.type === "text") return { type: "text", text: part.text };
                if (part.type === "image_url") {
                  const url = part.image_url?.url || part.image_url;
                  if (typeof url === "string" && url.includes(",")) {
                    const [header, base64Data] = url.split(",");
                    const mimeType = header.split(";")[0].split(":")[1] || "image/jpeg";
                    if (base64Data) {
                      return {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: mimeType,
                          data: base64Data
                        }
                      };
                    }
                  }
                }
                return null;
              }).filter(Boolean)
            };
          }
          return m;
        });
        handleResponse(await axios.post("https://api.anthropic.com/v1/messages", {
          model,
          messages: transformedMessages,
          max_tokens: 4096,
          stream,
          system: s?.content
        }, { ...axiosOptions, headers: { ...axiosOptions.headers, "x-api-key": integration?.api_key, "anthropic-version": "2023-06-01" } }));
        break;
      }
      case "google": {
        const safeModel = String(model || "").replace(/[^a-zA-Z0-9\-_]/g, "");
        handleResponse(await axios({
          method: "post",
          baseURL: "https://generativelanguage.googleapis.com",
          url: "/v1beta/models/" + safeModel + ":generateContent",
          data: {
            contents: processedMessages.map((m: any) => {
              const role = m.role === "assistant" ? "model" : "user";
              let parts = [];
              if (Array.isArray(m.content)) {
                parts = m.content.map((part: any) => {
                  if (part.type === "text") return { text: part.text };
                  if (part.type === "image_url") {
                    const url = part.image_url?.url || part.image_url;
                    if (typeof url === "string" && url.includes(",")) {
                      const [header, base64Data] = url.split(",");
                      const mimeType = header.split(";")[0].split(":")[1] || "image/jpeg";
                      if (base64Data) {
                        return { inline_data: { mime_type: mimeType, data: base64Data } };
                      }
                    }
                  }
                  return null;
                }).filter(Boolean);
              } else {
                parts = [{ text: m.content }];
              }
              return { role, parts };
            })
          },
          params: { key: integration?.api_key },
          ...axiosOptions
        }));
        break;
      }
      case "openrouter":
        handleResponse(await axios.post("https://openrouter.ai/api/v1/chat/completions", { model, messages: processedMessages, stream }, {
          ...axiosOptions, headers: { ...axiosOptions.headers, "Authorization": `Bearer ${integration?.api_key}` }
        }));
        break;
      case "grok":
        handleResponse(await axios.post("https://api.x.ai/v1/chat/completions", { model, messages: processedMessages, stream }, {
          ...axiosOptions, headers: { ...axiosOptions.headers, "Authorization": `Bearer ${integration?.api_key}` }
        }));
        break;
      case "ollama":
        handleResponse(await axios.post("http://127.0.0.1:11434/api/chat", { model, messages: processedMessages, stream }, axiosOptions));
        break;
      case "kobold":
        handleResponse(await axios.post("http://127.0.0.1:5001/api/v1/generate", { prompt: processedMessages[processedMessages.length - 1]?.content || "" }, axiosOptions));
        break;
      case "custom": {
        if (!integration?.base_url) return res.status(400).json({ error: "Base URL required" });
        await validateAiUrl(integration.base_url);
        const finalUrl = buildValidatedCustomUrl(integration.base_url);
        const customHeaders = integration?.api_key ? { ...axiosOptions.headers, "Authorization": `Bearer ${integration.api_key}` } : axiosOptions.headers;
        handleResponse(await axios.post(finalUrl, { model, messages: processedMessages, stream }, { ...axiosOptions, headers: customHeaders }));
        break;
      }
      default:
        res.status(400).json({ error: "Unsupported provider" });
    }
  } catch (error: any) {
    if (axios.isCancel(error)) return;
    if (error.code === "ECONNABORTED") return res.status(504).json({ error: "Upstream request timed out" });
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
      if (file.endsWith(".prompt.yml") && file !== "base_artifacts.prompt.yml") {
        const id = file.replace(".prompt.yml", "");
        const descFile = path.join(stylesDir, `${id}.description`);
        let title = id, description = "";
        if (fs.existsSync(descFile)) {
          const content = fs.readFileSync(descFile, "utf-8");
          const lines = content.split("\n");
          title = lines.find(l => l.startsWith("Title:"))?.split(":")[1]?.trim() || id;
          description = lines.find(l => l.startsWith("Description:"))?.split(":")[1]?.trim() || "";
        }
        styles.push({ id, title, description });
      }
    }
    res.json(styles);
  } catch (error) {
    res.status(500).json({ error: "Failed to load styles" });
  }
};
