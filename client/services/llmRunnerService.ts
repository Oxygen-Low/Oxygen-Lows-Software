import {
  getPythonServerInfo,
  restartPythonServer,
  addPushEventListener,
  isDesktopBridgeAvailable,
} from "@/lib/desktopBridge";

export interface LocalLlmModel {
  id: string;
  name: string;
  path: string;
  format: "gguf" | "safetensors" | "directory";
  size_bytes: number;
  size_display: string;
  quantization: string;
  modified_at: string;
  is_active: boolean;
  is_directory: boolean;
}

export interface RunnerHardwareInfo {
  cuda_available: boolean;
  vram_mb: number;
}

export interface RunnerMetrics {
  last_prompt_tokens: number;
  last_completion_tokens: number;
  last_tokens_per_sec: number;
  last_ttft_ms: number;
}

export interface ActiveModelInfo {
  name: string;
  path: string;
  format: string;
  engine_type: "llama-cpp" | "safetensors" | "transformers" | "airllm";
  loaded_at: number;
  params: Record<string, any>;
}

export interface RunnerStatus {
  state: "stopped" | "loading" | "running" | "error";
  is_active: boolean;
  active_model: ActiveModelInfo | null;
  metrics: RunnerMetrics;
  error: string | null;
  hardware: RunnerHardwareInfo;
}

export interface LoadModelParams {
  path: string;
  engine?: "auto" | "llama-cpp" | "transformers" | "airllm";
  n_ctx?: number;
  n_gpu_layers?: number;
  n_threads?: number;
  use_airllm?: boolean;
}

export interface HfDownloadProgress {
  status: "idle" | "downloading" | "completed" | "error" | "cancelled";
  repo_id?: string;
  filename?: string;
  percent: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  speed_mb_s?: number;
  error?: string | null;
  target_path?: string | null;
}

export interface PythonOverview {
  status: string;
  pid: number;
  uptime_seconds: number;
  python_version: string;
  executable: string;
  environment_prefix: string;
  cpu_percent: number;
  memory_mb: number;
  loaded_apps: string[];
}

export interface PythonDependencyItem {
  name: string;
  import_name: string;
  required: string;
  description: string;
  installed: boolean;
  version: string | null;
}

export interface PythonDependenciesStatus {
  dependencies: PythonDependencyItem[];
  cuda: {
    available: boolean;
    device_count: number;
    device_name: string | null;
    total_vram_mb: number;
  };
}

export interface PythonLogEntry {
  id: number;
  timestamp: number;
  time_str: string;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  name: string;
  message: string;
  formatted: string;
  exception: string | null;
}

class LLMRunnerService {
  private serverUrl = "http://127.0.0.1:54123";
  private authToken = "";
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    if (typeof window === "undefined") return;
    addPushEventListener((eventName, payload) => {
      if (eventName === "python_server_ready" && payload) {
        if (payload.url) this.serverUrl = payload.url;
        if (payload.token) this.authToken = payload.token;
      }
    });
  }

  public async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!isDesktopBridgeAvailable()) return;
      try {
        const info = await getPythonServerInfo();
        if (info) {
          if (info.url) this.serverUrl = info.url;
          if (info.token) this.authToken = info.token;
        }
      } catch (err) {
        console.warn("[LLMRunnerService] Could not fetch python server info:", err);
      } finally {
        this.isInitialized = true;
      }
    })();
    return this.initPromise;
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public getAuthToken(): string {
    return this.authToken;
  }

  private async callAction<T = any>(
    appId: string,
    action: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    await this.init();
    const endpoint = `${this.serverUrl}/api/apps/${appId}/${action}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      let errMsg = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data.error) errMsg = data.error;
      } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (data.status === "ok") {
      return data.data as T;
    }
    return data as T;
  }

  // --- LLM Runner APIs ---

  public async getModelsDir(): Promise<{ models_dir: string; exists: boolean }> {
    return this.callAction("llm_runner", "get_models_dir");
  }

  public async listModels(directory?: string): Promise<{ models_dir: string; models: LocalLlmModel[] }> {
    return this.callAction("llm_runner", "list_models", { directory });
  }

  public async deleteModel(path: string): Promise<{ status: string; deleted: boolean }> {
    return this.callAction("llm_runner", "delete_model", { path });
  }

  public async downloadHfModel(repo_id: string, filename?: string): Promise<{ status: string }> {
    return this.callAction("llm_runner", "download_hf_model", { repo_id, filename });
  }

  public async getDownloadProgress(): Promise<HfDownloadProgress> {
    return this.callAction("llm_runner", "get_download_progress");
  }

  public async cancelDownload(): Promise<{ status: string }> {
    return this.callAction("llm_runner", "cancel_download");
  }

  public async loadModel(params: LoadModelParams): Promise<{ status: string; state: string; model_name: string; engine: string }> {
    return this.callAction("llm_runner", "load_model", params);
  }

  public async unloadModel(): Promise<{ status: string; state: string }> {
    return this.callAction("llm_runner", "unload_model");
  }

  public async getStatus(): Promise<RunnerStatus> {
    return this.callAction("llm_runner", "get_status");
  }

  public async chatStream(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      signal?: AbortSignal;
    } = {},
    onDelta: (text: string) => void,
    onDone?: () => void,
    onError?: (err: Error) => void,
  ): Promise<string> {
    await this.init();
    const endpoint = `${this.serverUrl}/v1/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: options.signal,
        body: JSON.stringify({
          messages,
          stream: true,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 1024,
          top_p: options.top_p ?? 0.95,
        }),
      });

      if (!response.ok) {
        let errText = `Chat request failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.error) errText = errJson.error;
        } catch {}
        throw new Error(errText);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream response from local model server.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            onDone?.();
            return fullContent;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              onDelta(delta);
            }
          } catch {}
        }
      }

      onDone?.();
      return fullContent;
    } catch (err: any) {
      if (err.name === "AbortError") {
        onDone?.();
        return "";
      }
      onError?.(err);
      throw err;
    }
  }

  // --- Python Manager APIs ---

  public async getPythonOverview(): Promise<PythonOverview> {
    return this.callAction("python_manager", "get_server_overview");
  }

  public async getPythonDependencies(): Promise<PythonDependenciesStatus> {
    return this.callAction("python_manager", "list_dependencies");
  }

  public async installPythonDependency(
    pkg: string,
  ): Promise<{ success: boolean; package: string; stdout?: string; stderr?: string; error?: string }> {
    return this.callAction("python_manager", "install_dependency", { package: pkg });
  }

  public async getPythonLogs(
    level?: string,
    query?: string,
    limit: number = 200,
  ): Promise<{ total_count: number; logs: PythonLogEntry[] }> {
    return this.callAction("python_manager", "get_logs", { level, query, limit });
  }

  public async clearPythonLogs(): Promise<{ status: string; cleared: boolean }> {
    return this.callAction("python_manager", "clear_logs");
  }

  public async restartServer(): Promise<any> {
    const res = await restartPythonServer();
    if (res?.url) this.serverUrl = res.url;
    if (res?.token) this.authToken = res.token;
    return res;
  }
}

export const llmRunnerService = new LLMRunnerService();
