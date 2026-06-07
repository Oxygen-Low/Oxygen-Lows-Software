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

  let finalUrl = "";
  const headers: any = { "Content-Type": "application/json" };
  let body: any = {};

  const processedMessages = (messages || []).slice(-11);

  // Base prompt for artifacts
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

  switch (provider) {
    case "openai":
      finalUrl = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration?.api_key}`;
      body = { model, messages: processedMessages, stream };
      break;
    case "anthropic":
      finalUrl = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = integration?.api_key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, messages: processedMessages.filter((m: any) => m.role !== 'system'), max_tokens: 4096, stream };
      const s = processedMessages.find((m: any) => m.role === 'system');
      if (s) body.system = s.content;
      break;
    case "google":
      finalUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${integration?.api_key}`;
      // Google doesn't follow OpenAI format, this is a simplified proxy
      body = { contents: processedMessages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
      break;
    case "openrouter":
      finalUrl = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration?.api_key}`;
      body = { model, messages: processedMessages, stream };
      break;
    case "grok":
      finalUrl = "https://api.x.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration?.api_key}`;
      body = { model, messages: processedMessages, stream };
      break;
    case "custom":
      if (!integration?.base_url) return res.status(400).json({ error: "Base URL required" });
      try {
        await validateAiUrl(integration.base_url);
        const u = new URL(integration.base_url);
        finalUrl = new URL("/chat/completions", u.origin + u.pathname.replace(/\/+$/, "")).href;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Invalid base URL" });
      }
      if (integration?.api_key) headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages: processedMessages, stream };
      break;
    case "ollama":
      finalUrl = "http://127.0.0.1:11434/api/chat";
      body = { model, messages: processedMessages, stream };
      break;
    case "kobold":
      finalUrl = "http://127.0.0.1:5001/api/v1/generate";
      body = { prompt: processedMessages[processedMessages.length - 1]?.content || "" };
      break;
    default:
      return res.status(400).json({ error: "Unsupported provider" });
  }

  if (stream) {
    try {
      const response = await axios.post(finalUrl, body, {
        headers,
        responseType: "stream",
        timeout: 30000,
        validateStatus: () => true
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      response.data.pipe(res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    try {
      const response = await axios.post(finalUrl, body, { headers, timeout: 30000, validateStatus: () => true });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      if (error.code === 'ECONNABORTED') return res.status(504).json({ error: "Upstream request timed out" });
      res.status(500).json({ error: error.message });
    }
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
        let title = id;
        let description = "";
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
