import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";
import path from "path";
import dns from "dns";
import net from "net";
import { promisify } from "util";

const lookup = promisify(dns.lookup);

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

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

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  res.json([]);
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
  if (fs.existsSync(basePromptFile)) {
    try {
      const content = fs.readFileSync(basePromptFile, "utf-8");
      const match = content.match(/role: system\s+content: \|?\s+([\s\S]*)/);
      if (match) processedMessages.unshift({ role: "system", content: match[1].trim() });
    } catch (e) {}
  }

  if (style) {
    const promptFile = path.join(process.cwd(), "prompts", "chat", `${style}.prompt.yml`);
    if (fs.existsSync(promptFile)) {
      try {
        const content = fs.readFileSync(promptFile, "utf-8");
        const match = content.match(/role: system\s+content: \|?\s+([\s\S]*)/);
        if (match) processedMessages.unshift({ role: "system", content: match[1].trim() });
      } catch (e) {}
    }
  }

  const axiosOptions: any = { headers: { "Content-Type": "application/json" }, timeout: 30000, validateStatus: () => true };
  if (stream) axiosOptions.responseType = "stream";

  const pipeRes = (response: any) => {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      response.data.pipe(res);
    } else {
      res.status(response.status).json(response.data);
    }
  };

  try {
    if (provider === "openai") {
      pipeRes(await axios.post("https://api.openai.com/v1/chat/completions", { model, messages: processedMessages, stream }, axiosOptions));
    } else if (provider === "anthropic") {
      const s = processedMessages.find((m: any) => m.role === "system");
      pipeRes(await axios.post("https://api.anthropic.com/v1/messages", {
        model,
        messages: processedMessages.filter((m: any) => m.role !== "system"),
        max_tokens: 4096,
        stream,
        system: s?.content
      }, { ...axiosOptions, headers: { ...axiosOptions.headers, "x-api-key": integration?.api_key, "anthropic-version": "2023-06-01" } }));
    } else if (provider === "google") {
      const safeModel = String(model || "").replace(/[^a-zA-Z0-9\-_]/g, "");
      const googleUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + safeModel + ":generateContent";
      pipeRes(await axios.post(googleUrl, {
        contents: processedMessages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      }, { ...axiosOptions, params: { key: integration?.api_key } }));
    } else if (provider === "openrouter") {
      pipeRes(await axios.post("https://openrouter.ai/api/v1/chat/completions", { model, messages: processedMessages, stream }, {
        ...axiosOptions, headers: { ...axiosOptions.headers, "Authorization": `Bearer ${integration?.api_key}` }
      }));
    } else if (provider === "grok") {
      pipeRes(await axios.post("https://api.x.ai/v1/chat/completions", { model, messages: processedMessages, stream }, {
        ...axiosOptions, headers: { ...axiosOptions.headers, "Authorization": `Bearer ${integration?.api_key}` }
      }));
    } else if (provider === "ollama") {
      pipeRes(await axios.post("http://127.0.0.1:11434/api/chat", { model, messages: processedMessages, stream }, axiosOptions));
    } else if (provider === "kobold") {
      pipeRes(await axios.post("http://127.0.0.1:5001/api/v1/generate", { prompt: processedMessages[processedMessages.length - 1]?.content || "" }, axiosOptions));
    } else if (provider === "custom") {
      if (!integration?.base_url) return res.status(400).json({ error: "Base URL required" });
      await validateAiUrl(integration.base_url);
      const u = new URL(integration.base_url);
      const finalUrl = u.origin + u.pathname.replace(/\/+$/, "") + "/chat/completions";
      const customHeaders = integration?.api_key ? { ...axiosOptions.headers, "Authorization": `Bearer ${integration.api_key}` } : axiosOptions.headers;
      pipeRes(await axios.post(finalUrl, { model, messages: processedMessages, stream }, { ...axiosOptions, headers: customHeaders }));
    } else {
      res.status(400).json({ error: "Unsupported provider" });
    }
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') return res.status(504).json({ error: "Upstream request timed out" });
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
