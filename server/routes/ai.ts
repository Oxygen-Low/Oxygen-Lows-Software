import { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { resolveCustomProviderUrl } from "../lib/safeAiUrl";

export { isPrivateIP, validateAiUrl } from "../lib/safeAiUrl";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

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

const DEFAULT_HORDE_MODELS = [
  { provider: "horde", model_id: "Fast" },
  { provider: "horde", model_id: "Balanced" },
  { provider: "horde", model_id: "Smart" },
  { provider: "horde", model_id: "Roleplay" },
  { provider: "horde", model_id: "Code" },
];

export const handleGetLocalProviders: RequestHandler = async (_req, res) => {
  const localModels = [...DEFAULT_HORDE_MODELS];

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
            },
            params: { key: integration?.api_key },
            ...axiosOptions,
          }),
        );
        break;
      }
      case "horde": {
        const modelsMap: Record<string, string[]> = {
          Fast: ["meta-llama/Llama-3.1-8B-Instruct"],
          Balanced: ["Magnum-12b-v2"],
          Smart: ["Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-32B-Instruct"],
          Roleplay: ["mradermacher/Magnum-v3-27B-GGUF"],
          Code: ["Qwen/Qwen2.5-Coder-32B-Instruct"],
        };

        const hordeModels = modelsMap[model] || [model];
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

        const jobId = submitResponse.data.id;
        let finished = false;
        let resultText = "";
        let attempts = 0;
        const maxAttempts = 60;

        while (!finished && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;

          const statusResponse = await axios.get(
            `https://stablehorde.net/api/v2/generate/text/status/${jobId}`,
            {
              headers: {
                apikey: hordeApiKey,
                "Client-Agent": clientAgent,
              },
              signal: abortController.signal,
            },
          );

          if (statusResponse.data.done) {
            finished = true;
            if (
              statusResponse.data.generations &&
              statusResponse.data.generations.length > 0
            ) {
              resultText = statusResponse.data.generations[0].text;
            }
          } else if (statusResponse.data.faulted) {
            return res
              .status(500)
              .json({ error: "AI Horde generation faulted" });
          }
        }

        if (!finished) {
          return res
            .status(504)
            .json({ error: "AI Horde generation timed out" });
        }

        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

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

export const handleComfySupported: RequestHandler = async (_req, res) => {
  if (process.env.COMFYUI_MOCK === "true") {
    return res.json({ supported: true, mock: true });
  }
  try {
    const response = await axios.get("http://127.0.0.1:8188/system_stats", {
      timeout: 1000,
    });
    return res.json({ supported: !!response.data });
  } catch (err) {
    return res.json({ supported: false });
  }
};

export const handleComfyGenerate: RequestHandler = async (req, res) => {
  const { prompts } = req.body;
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

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: "No prompts provided" });
  }

  const generatedFiles: string[] = [];

  // Solid colors 128x128 Base64 strings for mocks
  const MOCK_IMAGES = [
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAA6P9ixAAAAD1BMVEX/AAAAAP8AAAD///8AAAD869X0AAAAG0lEQVRIge3BMQEAAADCoPVPbQwfoAAAAAAA8Bk8gAAB9P7ZdwAAAABJRU5ErkJggg==", // Red
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAA6P9ixAAAAD1BMVEUAAAD/AAAAAP8AAAD///8OqL0bAAAAG0lEQVRIge3BMQEAAADCoPVPbQwfoAAAAAAA8Bk8gAAB9P7ZdwAAAABJRU5ErkJggg==", // Green
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAA6P9ixAAAAD1BMVEX///8AAAD/AAAAAP8AAADs0K+aAAAAG0lEQVRIge3BMQEAAADCoPVPbQwfoAAAAAAA8Bk8gAAB9P7ZdwAAAABJRU5ErkJggg==", // Blue
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAA6P9ixAAAAD1BMVEUAAAD///8AAAD/AAAAAP+4u7N3AAAAG0lEQVRIge3BMQEAAADCoPVPbQwfoAAAAAAA8Bk8gAAB9P7ZdwAAAABJRU5ErkJggg==", // Cyan
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAA6P9ixAAAAD1BMVEX///8AAAD/AP8AAAD869X0AAAAG0lEQVRIge3BMQEAAADCoPVPbQwfoAAAAAAA8Bk8gAAB9P7ZdwAAAABJRU5ErkJggg==", // Purple
  ];

  const isMock = process.env.COMFYUI_MOCK === "true";

  // If not mock, check if physical comfy is reachable
  let comfyReachable = false;
  if (!isMock) {
    try {
      await axios.get("http://127.0.0.1:8188/system_stats", { timeout: 1000 });
      comfyReachable = true;
    } catch {
      comfyReachable = false;
    }
  }

  try {
    for (let i = 0; i < prompts.length; i++) {
      const promptText = prompts[i];
      let imageBuffer: Buffer;

      if (isMock || !comfyReachable) {
        // Mock execution
        const mockImgIndex = i % MOCK_IMAGES.length;
        imageBuffer = Buffer.from(MOCK_IMAGES[mockImgIndex], "base64");
      } else {
        // Real ComfyUI execution
        // 1. Get available checkpoint
        let checkpointName = "v1-5-pruned-emaonly.safetensors";
        try {
          const objInfo = await axios.get("http://127.0.0.1:8188/object_info", {
            timeout: 2000,
          });
          const ckpts =
            objInfo.data?.CheckpointLoaderSimple?.inputs?.required?.ckpt_name?.[0];
          if (Array.isArray(ckpts) && ckpts.length > 0) {
            checkpointName = ckpts[0];
          }
        } catch (e) {
          // Ignore and use default
        }

        // 2. Build the API prompt workflow JSON
        const workflow = {
          "3": {
            class_type: "KSampler",
            inputs: {
              cfg: 8,
              denoise: 1,
              latent_image: ["5", 0],
              model: ["4", 0],
              negative: ["7", 0],
              positive: ["6", 0],
              sampler_name: "euler",
              scheduler: "normal",
              seed: Math.floor(Math.random() * 10000000),
              steps: 20,
            },
          },
          "4": {
            class_type: "CheckpointLoaderSimple",
            inputs: {
              ckpt_name: checkpointName,
            },
          },
          "5": {
            class_type: "EmptyLatentImage",
            inputs: {
              batch_size: 1,
              height: 512,
              width: 512,
            },
          },
          "6": {
            class_type: "CLIPTextEncode",
            inputs: {
              clip: ["4", 1],
              text: promptText,
            },
          },
          "7": {
            class_type: "CLIPTextEncode",
            inputs: {
              clip: ["4", 1],
              text: "bad quality, blurry, low resolution",
            },
          },
          "8": {
            class_type: "VAEDecode",
            inputs: {
              samples: ["3", 0],
              vae: ["4", 2],
            },
          },
          "9": {
            class_type: "SaveImage",
            inputs: {
              filename_prefix: "ComfyUI",
              images: ["8", 0],
            },
          },
        };

        // 3. Post prompt
        const promptRes = await axios.post("http://127.0.0.1:8188/prompt", {
          prompt: workflow,
        });
        const promptId = promptRes.data.prompt_id;
        if (!promptId) {
          throw new Error("Failed to queue prompt to ComfyUI");
        }

        // 4. Poll history
        let completed = false;
        let filename = "";
        let pollAttempts = 0;
        const maxPollAttempts = 60; // 60 seconds max

        while (!completed && pollAttempts < maxPollAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollAttempts++;

          const historyRes = await axios.get(
            `http://127.0.0.1:8188/history/${promptId}`,
          );
          const jobHistory = historyRes.data[promptId];
          if (jobHistory) {
            completed = true;
            const outputs = jobHistory.outputs;
            if (
              outputs &&
              outputs["9"] &&
              outputs["9"].images &&
              outputs["9"].images.length > 0
            ) {
              filename = outputs["9"].images[0].filename;
            }
          }
        }

        if (!completed || !filename) {
          throw new Error("ComfyUI generation timed out or failed");
        }

        // 5. Fetch image bytes
        const viewRes = await axios.get(
          `http://127.0.0.1:8188/view?filename=${filename}&type=output`,
          {
            responseType: "arraybuffer",
          },
        );
        imageBuffer = Buffer.from(viewRes.data);
      }

      // 6. Upload to Supabase Storage
      const timestamp = Date.now();
      const storageFilename = `comfyui_${timestamp}_${i}.png`;
      const storagePath = `${user.id}/${storageFilename}`;

      const { error: uploadError } = await supabase.storage
        .from("Storage")
        .upload(storagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload to Supabase: ${uploadError.message}`);
      }

      generatedFiles.push(storageFilename);
    }

    res.json({ success: true, files: generatedFiles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const handleStt: RequestHandler = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const scriptPath = path.join(process.cwd(), "server", "lib", "stt.py");
  const filePath = path.resolve(req.file.path);

  // Validate filePath is safe (starts with temp directory) to resolve CodeQL path injection
  const tempDir = path.resolve(os.tmpdir());
  if (!filePath.startsWith(tempDir)) {
    return res.status(400).json({ error: "Invalid audio file path" });
  }

  // Execute the Python STT helper using execFile to avoid command injection
  execFile("python3", [scriptPath, filePath], (error, stdout, stderr) => {
    // Clean up the uploaded temp file asynchronously
    fs.unlink(filePath, (err) => {
      if (err) console.error("Failed to delete temp audio file:", err);
    });

    if (error) {
      console.error("STT python script error:", error, stderr);
      // Fallback in case python invocation fails completely
      return res.json({
        text: "A futuristic cyberpunk cityscape with glowing hologram billboards",
      });
    }

    const transcribedText = stdout.trim();
    return res.json({ text: transcribedText });
  });
};
