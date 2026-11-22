/**
 * Cross-platform bridge for AI Runner / Dependencies Manager.
 *
 * Talks to the native shell (WebView2 on desktop, AndroidApp WebMessage on
 * mobile) via a request/response RPC. In a plain browser there is no native
 * shell, so calls reject and the UI shows a "desktop/mobile only" notice.
 */

export interface LlamaModelSettings {
  id?: string;
  fileName: string;
  displayName?: string;
  mmap?: boolean;
  contextSize?: number;
  gpuLayers?: number;
  port?: number;
  source?: string;
  sourceId?: string;
  shards?: string[];
  mmproj?: string;
  useJinja?: boolean;
}

export interface LlamaModelEntry {
  id: string;
  fileName: string;
  displayName: string;
  source: string;
  sourceId: string;
  mmap: boolean;
  contextSize: number;
  gpuLayers: number;
  port: number;
  sizeBytes: number;
  isRunning: boolean;
  shards: string[];
  shardCount: number;
  shardExpected: number;
  shardsComplete: boolean;
  hasVision: boolean;
  mmproj: string;
  useJinja: boolean;
}

export interface LlamaStatus {
  installed: boolean;
  installedVersion: string;
  ignoredVersion: string;
  autoCheckUpdates: boolean;
  binaryPath: string;
  modelsPath: string;
  running: LlamaRunningInstance[];
}

export interface LlamaRunningInstance {
  instanceId: number;
  port: number;
  modelId: string;
  modelFile: string;
  displayName: string;
  baseUrl: string;
  mmap: boolean;
  contextSize: number;
  gpuLayers: number;
  hasVision: boolean;
  useJinja: boolean;
}

export interface DependencyUpdate {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  ignored: boolean;
  releaseUrl: string;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

const pending = new Map<string, Pending>();
const progressListeners = new Set<(id: string, pct: number) => void>();
let listenerInitialized = false;

function getAndroid(): any {
  if (typeof window === "undefined") return null;
  return (window as any).AndroidApp;
}

function getWebview(): any {
  if (typeof window === "undefined") return null;
  return (window as any).chrome?.webview;
}

export function isNativeRunnerAvailable(): boolean {
  return !!getWebview() || !!getAndroid();
}

export function isAndroidRunner(): boolean {
  return !!getAndroid() && !getWebview();
}

function handleMessage(raw: any) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data) return;
    // Progress notifications carry an id but must not resolve the RPC.
    if (typeof data.progress === "number" && data.id) {
      for (const listener of progressListeners) {
        try { listener(String(data.id), data.progress); } catch {}
      }
      return;
    }
    if (!data.id) return;
    const entry = pending.get(String(data.id));
    if (!entry) return;
    pending.delete(String(data.id));
    if (data.success) {
      entry.resolve(data.data !== undefined ? data.data : data);
    } else {
      entry.reject(new Error(data.error || "Bridge call failed"));
    }
  } catch {
    // ignore non-JSON messages
  }
}

function initNativeListener() {
  if (listenerInitialized || typeof window === "undefined") return;
  listenerInitialized = true;

  const webview = getWebview();
  if (webview?.addEventListener) {
    webview.addEventListener("message", (event: any) => handleMessage(event.data));
  }

  // Android posts WebMessages to the page; listen for them on window.
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    handleMessage(event.data);
  });
}

export function callNative<T = any>(
  command: string,
  params: Record<string, any> = {},
  timeoutMs = 120000,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const webview = getWebview();
    const android = getAndroid();
    if (!webview && !android) {
      reject(new Error("Native app required. Open this app in the desktop or mobile app."));
      return;
    }
    initNativeListener();

    const id = crypto.randomUUID();
    const payload = JSON.stringify({ command, id, ...params });
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Bridge call timed out"));
      }
    }, timeoutMs);
    // Note: progress listeners are registered below and always cleaned up by
    // wrappedResolve / wrappedReject / the catch block. On timeout the pending
    // entry is removed, so any late message is ignored by handleMessage.

    const wrappedResolve = (value: any) => {
      clearTimeout(timeout);
      cleanup();
      resolve(value);
    };
    const wrappedReject = (error: Error) => {
      clearTimeout(timeout);
      cleanup();
      reject(error);
    };
    pending.set(id, { resolve: wrappedResolve, reject: wrappedReject });

    const progressHandler = onProgress
      ? (messageId: string, pct: number) => {
          if (messageId === id) onProgress(pct);
        }
      : null;
    if (progressHandler) progressListeners.add(progressHandler);

    const cleanup = () => {
      if (progressHandler) progressListeners.delete(progressHandler);
    };

    try {
      if (webview?.postMessage) {
        webview.postMessage(payload);
      } else if (android?.postMessage) {
        android.postMessage(payload);
      } else {
        throw new Error("No native transport available");
      }
    } catch (err: any) {
      clearTimeout(timeout);
      pending.delete(id);
      cleanup();
      reject(err);
    }
  });
}

// ─── Dependency / llama.cpp commands ───────────────────────────────────────

export function llamaStatus(): Promise<LlamaStatus> {
  return callNative<LlamaStatus>("llama_status");
}

export function llamaCheckUpdate(): Promise<DependencyUpdate> {
  return callNative<DependencyUpdate>("llama_check_update");
}

export function llamaInstall(tag = "", onProgress?: (pct: number) => void): Promise<any> {
  return callNative<any>("llama_install", { tag }, 600000, onProgress);
}

export function llamaUpdate(tag = "", onProgress?: (pct: number) => void): Promise<any> {
  return callNative<any>("llama_update", { tag }, 600000, onProgress);
}

export function llamaUninstall(): Promise<any> {
  return callNative("llama_uninstall");
}

export function llamaIgnoreVersion(version: string): Promise<any> {
  return callNative("llama_ignore_version", { version });
}

export function llamaSetAutoCheck(enabled: boolean): Promise<any> {
  return callNative("llama_set_auto_check", { enabled });
}

export function llamaListModels(): Promise<LlamaModelEntry[]> {
  return callNative<LlamaModelEntry[]>("llama_list_models");
}

export function llamaSaveModel(settings: LlamaModelSettings): Promise<any> {
  return callNative("llama_save_model", settings);
}

export function llamaUploadModel(
  fileName: string,
  data: string,
  mmap: boolean,
  onProgress?: (pct: number) => void,
): Promise<any> {
  return callNative("llama_upload_model", { fileName, data, mmap }, 600000, onProgress);
}

export function llamaDeleteModel(modelId: string): Promise<any> {
  return callNative("llama_delete_model", { fileName: modelId });
}

export interface LlamaPickedFiles {
  paths: string[];
  fileNames: string[];
  /** Backwards-compatible single-file fields. */
  path: string;
  fileName: string;
}

export function llamaPickModel(): Promise<LlamaPickedFiles> {
  return callNative<LlamaPickedFiles>("llama_pick_model");
}

export function llamaImportModel(sourcePath: string): Promise<{ fileName: string }> {
  return callNative<{ fileName: string }>("llama_import_model", { sourcePath });
}

export function llamaImportModels(paths: string[]): Promise<{ fileNames: string[] }> {
  return callNative<{ fileNames: string[] }>("llama_import_models", { paths });
}

export function llamaStart(settings: {
  modelId?: string;
  fileName?: string;
  port?: number;
  mmap?: boolean;
  contextSize?: number;
  gpuLayers?: number;
}): Promise<{ instanceId: number; port: number }> {
  return callNative("llama_start", settings);
}

export function llamaStop(instanceId: number): Promise<any> {
  return callNative("llama_stop", { instanceId });
}

export function llamaStopAll(): Promise<any> {
  return callNative("llama_stop_all");
}
