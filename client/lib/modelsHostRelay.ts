import { isDesktopBridgeAvailable, callDesktopBridge } from "./desktopBridge";

export interface LocalSharedModelConfig {
  id: string;
  name: string;
  model_id: string;
  provider: "ollama" | "lmstudio" | "kobold" | "python" | "custom";
  customUrl?: string;
  modality: "text" | "vision" | "embeddings";
  sharing_mode: "public" | "friends" | "private" | "password";
  password?: string;
  max_tokens: number;
  max_concurrent: number;
  rate_limit_rpm: number;
  daily_token_cap: number;
  auto_pause_gaming: boolean;
  context_length?: number;
}

export interface RelayActivityLog {
  id: string;
  timestamp: string;
  modelName: string;
  type: "chat" | "embeddings";
  status: "success" | "error" | "in-progress";
  tokens?: number;
  durationMs?: number;
  error?: string;
}

export interface HostRelayState {
  isConnected: boolean;
  isGaming: boolean;
  masterPaused: boolean;
  activeRequests: number;
  totalRequests: number;
  totalTokens: number;
  logs: RelayActivityLog[];
}

type StateListener = (state: HostRelayState) => void;

class ModelsHostRelayManager {
  private isConnected = false;
  private isGaming = false;
  private masterPaused = false;
  private activeRequests = 0;
  private totalRequests = 0;
  private totalTokens = 0;
  private logs: RelayActivityLog[] = [];
  private listeners = new Set<StateListener>();
  private abortController: AbortController | null = null;
  private registeredModels: LocalSharedModelConfig[] = [];
  private authToken: string | null = null;

  constructor() {
    // Listen for desktop game monitor messages if running inside DesktopApp
    if (typeof window !== "undefined") {
      window.addEventListener("message", (event) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data?.event === "game_session_started") {
            this.setGaming(true);
          } else if (data?.event === "game_session_ended") {
            this.setGaming(false);
          }
        } catch {}
      });
    }
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  public getState(): HostRelayState {
    return {
      isConnected: this.isConnected,
      isGaming: this.isGaming,
      masterPaused: this.masterPaused,
      activeRequests: this.activeRequests,
      totalRequests: this.totalRequests,
      totalTokens: this.totalTokens,
      logs: [...this.logs].slice(-30),
    };
  }

  public setGaming(gaming: boolean) {
    if (this.isGaming !== gaming) {
      this.isGaming = gaming;
      this.notify();
      this.syncRelayStatus();
    }
  }

  public setMasterPaused(paused: boolean) {
    if (this.masterPaused !== paused) {
      this.masterPaused = paused;
      this.notify();
      this.syncRelayStatus();
    }
  }

  private async syncRelayStatus() {
    if (!this.authToken || !this.isConnected) return;
    try {
      await fetch("/api/models/relay/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          isGaming: this.isGaming,
          masterPaused: this.masterPaused,
        }),
      });
    } catch {}
  }

  public async startHosting(token: string, models: LocalSharedModelConfig[]) {
    this.authToken = token;
    this.registeredModels = models;

    // Register models with the server
    const regRes = await fetch("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        models,
        isGaming: this.isGaming,
        masterPaused: this.masterPaused,
      }),
    });

    if (!regRes.ok) {
      throw new Error("Failed to register models with relay server");
    }

    // Disconnect existing tunnel if any
    this.stopTunnel();

    // Start tunnel stream
    this.abortController = new AbortController();
    this.connectTunnel(token, this.abortController.signal);
  }

  public stopHosting() {
    this.stopTunnel();
    this.isConnected = false;
    this.notify();
  }

  private stopTunnel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async connectTunnel(token: string, signal: AbortSignal) {
    const url = `/api/models/relay/tunnel?token=${encodeURIComponent(token)}`;

    try {
      const response = await fetch(url, { signal });
      if (!response.ok || !response.body) {
        this.isConnected = false;
        this.notify();
        return;
      }

      this.isConnected = true;
      this.notify();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          this.handleSSEEvent(block);
        }
      }
    } catch (err: any) {
      if (!signal.aborted) {
        this.isConnected = false;
        this.notify();
        // Auto-reconnect after delay
        setTimeout(() => {
          if (!signal.aborted && this.authToken) {
            this.connectTunnel(this.authToken, signal);
          }
        }, 5000);
      }
    } finally {
      this.isConnected = false;
      this.notify();
    }
  }

  private handleSSEEvent(block: string) {
    const lines = block.split("\n");
    let eventName = "message";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        data += line.substring(5).trim();
      }
    }

    if (eventName === "inference_job" && data) {
      try {
        const job = JSON.parse(data);
        this.handleInferenceJob(job);
      } catch (err) {
        console.error("Error parsing inference job", err);
      }
    }
  }

  private async handleInferenceJob(job: any) {
    const startTime = Date.now();
    const modelConfig = this.registeredModels.find(
      (m) => m.model_id === job.model_id || m.id === job.model_id,
    );

    const logEntry: RelayActivityLog = {
      id: job.jobId,
      timestamp: new Date().toLocaleTimeString(),
      modelName: modelConfig?.name || job.model_id,
      type: job.type || "chat",
      status: "in-progress",
    };
    this.logs.push(logEntry);
    this.activeRequests++;
    this.totalRequests++;
    this.notify();

    // Check gaming pause
    if (this.isGaming && modelConfig?.auto_pause_gaming) {
      await this.sendChunk(job.jobId, {
        error: "Host is currently in an active game session.",
      });
      logEntry.status = "error";
      logEntry.error = "Paused (Gaming)";
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.notify();
      return;
    }

    // Check master pause
    if (this.masterPaused) {
      await this.sendChunk(job.jobId, {
        error: "Host sharing is paused.",
      });
      logEntry.status = "error";
      logEntry.error = "Host Paused";
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.notify();
      return;
    }

    try {
      if (job.type === "embeddings") {
        await this.executeEmbeddings(job, modelConfig);
      } else {
        await this.executeChatCompletion(job, modelConfig);
      }
      logEntry.status = "success";
      logEntry.durationMs = Date.now() - startTime;
    } catch (err: any) {
      await this.sendChunk(job.jobId, {
        error: err.message || "Execution error on host",
      });
      logEntry.status = "error";
      logEntry.error = err.message || "Failed";
      logEntry.durationMs = Date.now() - startTime;
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.notify();
    }
  }

  private async executeChatCompletion(job: any, config?: LocalSharedModelConfig) {
    const provider = config?.provider || job.provider || "ollama";
    let targetUrl = "http://127.0.0.1:11434/api/chat";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any = {};

    if (provider === "ollama") {
      targetUrl = "http://127.0.0.1:11434/api/chat";
      body = {
        model: job.model_id,
        messages: job.messages || [],
        stream: true,
        options: {
          num_predict: job.max_tokens,
          temperature: job.temperature,
        },
      };
    } else if (provider === "lmstudio" || provider === "custom") {
      const base = config?.customUrl || (provider === "lmstudio" ? "http://127.0.0.1:1234/v1" : "http://127.0.0.1:8000/v1");
      targetUrl = `${base.replace(/\/+$/, "")}/chat/completions`;
      body = {
        model: job.model_id,
        messages: job.messages || [],
        max_tokens: job.max_tokens,
        temperature: job.temperature,
        stream: true,
      };
    } else if (provider === "kobold") {
      targetUrl = "http://127.0.0.1:5001/v1/chat/completions";
      body = {
        model: job.model_id,
        messages: job.messages || [],
        max_tokens: job.max_tokens,
        temperature: job.temperature,
        stream: true,
      };
    } else {
      // Fallback OpenAI format
      targetUrl = "http://127.0.0.1:11434/v1/chat/completions";
      body = {
        model: job.model_id,
        messages: job.messages || [],
        stream: true,
      };
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Local engine responded with HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body from local engine");

    const decoder = new TextDecoder();
    let accumulatedTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const raw = decoder.decode(value, { stream: true });
      if (provider === "ollama") {
        // Ollama ndjson
        const lines = raw.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const chunkText = parsed.message?.content || "";
            if (chunkText) {
              accumulatedTokens++;
              this.totalTokens++;
              await this.sendChunk(job.jobId, { chunk: chunkText });
            }
            if (parsed.done) {
              await this.sendChunk(job.jobId, { done: true, tokens: accumulatedTokens });
              return;
            }
          } catch {}
        }
      } else {
        // SSE standard data: {...}
        const lines = raw.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") {
              await this.sendChunk(job.jobId, { done: true, tokens: accumulatedTokens });
              return;
            }
            try {
              const parsed = JSON.parse(payload);
              const deltaContent = parsed.choices?.[0]?.delta?.content || "";
              if (deltaContent) {
                accumulatedTokens++;
                this.totalTokens++;
                await this.sendChunk(job.jobId, { chunk: deltaContent });
              }
            } catch {}
          }
        }
      }
    }

    await this.sendChunk(job.jobId, { done: true, tokens: accumulatedTokens });
  }

  private async executeEmbeddings(job: any, config?: LocalSharedModelConfig) {
    const provider = config?.provider || job.provider || "ollama";
    let targetUrl = "http://127.0.0.1:11434/api/embeddings";
    let body: any = {};

    if (provider === "ollama") {
      targetUrl = "http://127.0.0.1:11434/api/embeddings";
      body = {
        model: job.model_id,
        prompt: typeof job.input === "string" ? job.input : Array.isArray(job.input) ? job.input.join(" ") : "",
      };
    } else {
      const base = config?.customUrl || "http://127.0.0.1:1234/v1";
      targetUrl = `${base.replace(/\/+$/, "")}/embeddings`;
      body = {
        model: job.model_id,
        input: job.input,
      };
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Embedding request failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    let embeddings: number[] = [];
    if (data.embedding) {
      embeddings = data.embedding;
    } else if (data.data?.[0]?.embedding) {
      embeddings = data.data[0].embedding;
    }

    await this.sendChunk(job.jobId, {
      done: true,
      embeddings,
    });
  }

  private async sendChunk(jobId: string, payload: any) {
    try {
      await fetch("/api/models/relay/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...payload }),
      });
    } catch (err) {
      console.error("Error forwarding chunk to server relay", err);
    }
  }

  // Probe local models using direct fetch or desktop bridge
  public async discoverLocalModels(customUrls: string[] = []): Promise<Array<{ model_id: string; provider: "ollama" | "lmstudio" | "kobold" | "python" | "custom"; name?: string; customUrl?: string }>> {
    const discovered: Array<{ model_id: string; provider: any; name?: string; customUrl?: string }> = [];
    const seen = new Set<string>();

    const add = (provider: any, model_id: string, name?: string, customUrl?: string) => {
      const key = `${provider}:${model_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        discovered.push({ model_id, provider, name: name || model_id, customUrl });
      }
    };

    // 1. If inside Desktop bridge, ask bridge
    if (isDesktopBridgeAvailable()) {
      try {
        const bridgeModels = await callDesktopBridge<any[]>("fetch_local_models", {}, 4000);
        if (Array.isArray(bridgeModels)) {
          for (const m of bridgeModels) {
            const prov = m.provider?.replace(/^local-/, "") || "ollama";
            add(prov, m.model_id, m.name);
          }
        }
      } catch {}
    }

    // 2. Direct browser probes (works in WebView2 or when CORS allows)
    // Ollama
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.models || []) {
          add("ollama", m.name || m.model);
        }
      }
    } catch {}

    // LM Studio
    try {
      const res = await fetch("http://127.0.0.1:1234/v1/models", { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.data || []) {
          add("lmstudio", m.id);
        }
      }
    } catch {}

    // Kobold
    try {
      const res = await fetch("http://127.0.0.1:5001/api/v1/model", { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        const data = await res.json();
        if (data.result) {
          add("kobold", data.result);
        }
      }
    } catch {}

    // Custom URLs
    for (const cUrl of customUrls) {
      if (!cUrl.trim()) continue;
      try {
        const clean = cUrl.replace(/\/+$/, "");
        const res = await fetch(`${clean}/models`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const data = await res.json();
          for (const m of data.data || []) {
            add("custom", m.id, m.id, clean);
          }
        }
      } catch {}
    }

    return discovered;
  }
}

export const modelsHostRelay = new ModelsHostRelayManager();
