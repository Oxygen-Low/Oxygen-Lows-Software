import { RequestHandler } from "express";
import { supabase } from "../../client/lib/supabase";
import axios from "axios";
import net from "net";

const checkPort = (port: number, host: string = "127.0.0.1"): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1000;

    socket.setTimeout(timeout);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
};

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  const ollamaActive = await checkPort(11434);
  const koboldActive = await checkPort(5001);

  const providers = [];
  if (ollamaActive) providers.push({ id: "ollama", name: "Ollama", url: "http://127.0.0.1:11434" });
  if (koboldActive) providers.push({ id: "kobold", name: "Kobold.cpp", url: "http://127.0.0.1:5001" });

  res.json(providers);
};

export const handleProxyAiRequest: RequestHandler = async (req, res) => {
  const { provider, model, messages, stream } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Fetch API key from database
  const { data: integration, error: dbError } = await supabase
    .from("user_integrations")
    .select("api_key, base_url")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .single();

  if (dbError || (!integration?.api_key && provider !== "ollama" && provider !== "kobold")) {
    return res.status(400).json({ error: "Provider not configured" });
  }

  let url = "";
  let headers: any = { "Content-Type": "application/json" };
  let body: any = {};

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages, stream };
      break;
    case "anthropic":
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = integration.api_key;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, messages, max_tokens: 4096, stream };
      break;
    case "google":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${integration.api_key}`;
      body = { contents: messages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
      break;
    case "openrouter":
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages, stream };
      break;
    case "grok":
      url = "https://api.x.ai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages, stream };
      break;
    case "custom":
      url = `${integration.base_url}/chat/completions`;
      if (integration.api_key) headers["Authorization"] = `Bearer ${integration.api_key}`;
      body = { model, messages, stream };
      break;
    case "ollama":
      url = "http://127.0.0.1:11434/api/chat";
      body = { model, messages, stream: false }; // Keeping it simple for now
      break;
    case "kobold":
      url = "http://127.0.0.1:5001/api/v1/generate";
      body = { prompt: messages[messages.length - 1].content }; // Kobold simple API
      break;
    default:
      return res.status(400).json({ error: "Unsupported provider" });
  }

  try {
    const response = await axios.post(url, body, { headers });
    res.json(response.data);
  } catch (error: any) {
    console.error("AI Proxy Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
};

import fs from "fs";
import path from "path";

export const handleGetChatStyles: RequestHandler = async (_req, res) => {
  const stylesDir = path.join(process.cwd(), "prompts", "chat");
  try {
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
          title = lines.find(l => l.startsWith("Title:"))?.replace("Title:", "").trim() || id;
          description = lines.find(l => l.startsWith("Description:"))?.replace("Description:", "").trim() || "";
        }

        styles.push({ id, title, description });
      }
    }
    res.json(styles);
  } catch (error) {
    res.status(500).json({ error: "Failed to load styles" });
  }
};
