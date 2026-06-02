import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

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
  if (style) {
    const promptFile = path.join(process.cwd(), "prompts", "chat", `${style}.prompt.yml`);
    if (fs.existsSync(promptFile)) {
      try {
        const content = fs.readFileSync(promptFile, "utf-8");
        const match = content.match(/role: system\s+content: (.*)/);
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
        const u = new URL(integration.base_url);
        if (u.protocol !== 'https:') throw new Error("HTTPS required");
        if (/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(u.hostname)) {
            return res.status(400).json({ error: "Public origin required" });
        }
        finalUrl = new URL("/chat/completions", u.origin + u.pathname.replace(/\/+$/, "")).href;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Invalid base URL" });
      }
      if (integration?.api_key) headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages: processedMessages, stream };
      break;
    case "ollama":
      finalUrl = "http://127.0.0.1:11434/api/chat";
      body = { model, messages: processedMessages, stream: false };
      break;
    case "kobold":
      finalUrl = "http://127.0.0.1:5001/api/v1/generate";
      body = { prompt: processedMessages[processedMessages.length - 1]?.content || "" };
      break;
    default:
      return res.status(400).json({ error: "Unsupported provider" });
  }

  try {
    const response = await axios.post(finalUrl, body, { headers, timeout: 15000, validateStatus: () => true });
    res.status(response.status).json(response.data);
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
      if (file.endsWith(".prompt.yml")) {
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
