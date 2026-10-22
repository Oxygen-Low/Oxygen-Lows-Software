import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  openModelsFolder,
  pickModelFile,
  pickModelFolder,
  isDesktopBridgeAvailable,
} from "@/lib/desktopBridge";
import {
  llmRunnerService,
  LocalLlmModel,
  RunnerStatus,
  HfDownloadProgress,
} from "@/services/llmRunnerService";
import {
  Cpu,
  FolderOpen,
  Upload,
  Download,
  Trash2,
  Play,
  Square,
  RotateCw,
  MessageSquare,
  Sparkles,
  Zap,
  HardDrive,
  Sliders,
  Search,
  Copy,
  Check,
  AlertCircle,
  Terminal,
  Send,
  Loader2,
  Layers,
  Settings2,
  RefreshCw,
  Database,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokensPerSec?: number;
  ttftMs?: number;
  tokensCount?: number;
}

export function LLMRunnerApp() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"models" | "runner" | "chat">("models");

  // Models State
  const [models, setModels] = useState<LocalLlmModel[]>([]);
  const [modelsDir, setModelsDir] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // HF Downloader State
  const [hfRepoId, setHfRepoId] = useState("");
  const [hfFilename, setHfFilename] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<HfDownloadProgress | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);

  // Runner Configuration & Status
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus | null>(null);
  const [selectedModelPath, setSelectedModelPath] = useState<string>("");
  const [selectedEngine, setSelectedEngine] = useState<"auto" | "llama-cpp" | "transformers" | "airllm">("auto");
  const [nCtx, setNCtx] = useState<number>(4096);
  const [nGpuLayers, setNGpuLayers] = useState<number>(32);
  const [nThreads, setNThreads] = useState<number>(4);
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(0.95);
  const [isOperatingModel, setIsOperatingModel] = useState(false);

  // Testing Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful, brilliant, and concise local AI assistant running on Oxygen Low's Software desktop environment.",
  );
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Telemetry poll interval
  const pollTimerRef = useRef<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await llmRunnerService.getStatus();
      setRunnerStatus(status);
      if (status.is_active && status.active_model?.path) {
        setSelectedModelPath(status.active_model.path);
      }
    } catch {}
  }, []);

  const refreshModelsList = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const dirInfo = await llmRunnerService.getModelsDir();
      setModelsDir(dirInfo.models_dir);
      const res = await llmRunnerService.listModels();
      setModels(res.models || []);
    } catch (err: any) {
      console.error("Failed to load models list:", err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  const pollDownload = useCallback(async () => {
    try {
      const prog = await llmRunnerService.getDownloadProgress();
      setDownloadProgress(prog);
      if (prog.status === "completed") {
        toast.success(t("llmRunner.downloadSuccess", undefined, "Model downloaded successfully into AppData!"));
        refreshModelsList();
      } else if (prog.status === "error") {
        toast.error(
          t("llmRunner.downloadError", undefined, "Download failed: ") + (prog.error || "Unknown error"),
        );
      }
    } catch {}
  }, [refreshModelsList, t]);

  useEffect(() => {
    refreshModelsList();
    fetchStatus();

    // Start background status poll
    pollTimerRef.current = setInterval(() => {
      fetchStatus();
      if (downloadProgress?.status === "downloading") {
        pollDownload();
      }
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refreshModelsList, fetchStatus, downloadProgress?.status, pollDownload]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isStreamingChat]);

  const handleOpenFolder = async () => {
    if (!isDesktopBridgeAvailable()) {
      toast.error(t("llmRunner.desktopRequired", undefined, "Desktop environment required."));
      return;
    }
    try {
      await openModelsFolder();
      toast.success(t("llmRunner.folderOpened", undefined, "Models folder opened in File Explorer."));
    } catch (err: any) {
      toast.error(err.message || "Failed to open folder");
    }
  };

  const handlePickFile = async () => {
    if (!isDesktopBridgeAvailable()) {
      toast.error(t("llmRunner.desktopRequired", undefined, "Desktop environment required."));
      return;
    }
    try {
      const file = await pickModelFile();
      if (file?.path) {
        toast.success(t("llmRunner.fileSelected", undefined, `Selected model: ${file.name}`));
        setSelectedModelPath(file.path);
        refreshModelsList();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to select model file");
    }
  };

  const handlePickFolder = async () => {
    if (!isDesktopBridgeAvailable()) {
      toast.error(t("llmRunner.desktopRequired", undefined, "Desktop environment required."));
      return;
    }
    try {
      const folder = await pickModelFolder();
      if (folder?.path) {
        toast.success(t("llmRunner.folderSelected", undefined, `Selected checkpoint folder: ${folder.name}`));
        setSelectedModelPath(folder.path);
        refreshModelsList();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to select checkpoint folder");
    }
  };

  const handleDeleteModel = async (model: LocalLlmModel) => {
    if (!confirm(t("llmRunner.confirmDelete", undefined, `Are you sure you want to delete ${model.name}?`))) {
      return;
    }
    try {
      await llmRunnerService.deleteModel(model.path);
      toast.success(t("llmRunner.modelDeleted", undefined, `Deleted ${model.name}`));
      refreshModelsList();
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete model");
    }
  };

  const handleStartDownload = async () => {
    if (!hfRepoId.trim()) {
      toast.error(t("llmRunner.enterHfRepo", undefined, "Please enter a Hugging Face repo ID."));
      return;
    }
    setIsStartingDownload(true);
    try {
      await llmRunnerService.downloadHfModel(hfRepoId.trim(), hfFilename.trim() || undefined);
      toast.info(t("llmRunner.downloadInitiated", undefined, "Model download initiated in background."));
      setHfRepoId("");
      setHfFilename("");
      pollDownload();
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate download");
    } finally {
      setIsStartingDownload(false);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await llmRunnerService.cancelDownload();
      toast.info(t("llmRunner.downloadCancelled", undefined, "Download cancelled."));
      setDownloadProgress(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel download");
    }
  };

  const handleLoadModel = async (pathOverride?: string) => {
    const targetPath = pathOverride || selectedModelPath;
    if (!targetPath) {
      toast.error(t("llmRunner.noModelSelected", undefined, "Please select a model file to load."));
      return;
    }

    setIsOperatingModel(true);
    try {
      const res = await llmRunnerService.loadModel({
        path: targetPath,
        engine: selectedEngine,
        n_ctx: nCtx,
        n_gpu_layers: nGpuLayers,
        n_threads: nThreads,
        use_airllm: selectedEngine === "airllm",
      });
      toast.success(
        t(
          "llmRunner.modelLoadedSuccess",
          undefined,
          `Loaded ${res.model_name} via ${res.engine.toUpperCase()}`,
        ),
      );
      fetchStatus();
      refreshModelsList();
      setActiveTab("runner");
    } catch (err: any) {
      toast.error(err.message || "Failed to load model. Check Python Manager for logs.");
    } finally {
      setIsOperatingModel(false);
    }
  };

  const handleUnloadModel = async () => {
    setIsOperatingModel(true);
    try {
      await llmRunnerService.unloadModel();
      toast.info(t("llmRunner.modelUnloaded", undefined, "Model unloaded and memory freed."));
      fetchStatus();
      refreshModelsList();
    } catch (err: any) {
      toast.error(err.message || "Failed to unload model");
    } finally {
      setIsOperatingModel(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    if (!runnerStatus?.is_active) {
      toast.error(t("llmRunner.mustLoadModelToChat", undefined, "Please load a model first in the Models or Runner tab."));
      return;
    }

    const userText = chatInput.trim();
    setChatInput("");

    const newMsgs: ChatMessage[] = [
      ...chatMessages,
      { id: Date.now().toString(), role: "user", content: userText },
    ];
    setChatMessages(newMsgs);

    const assistantMsgId = (Date.now() + 1).toString();
    setChatMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    setIsStreamingChat(true);
    chatAbortRef.current = new AbortController();

    const messagesPayload = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...newMsgs.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      await llmRunnerService.chatStream(
        messagesPayload,
        {
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          signal: chatAbortRef.current.signal,
        },
        (delta) => {
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + delta }
                : msg,
            ),
          );
        },
        () => {
          setIsStreamingChat(false);
          fetchStatus();
        },
        (err) => {
          setIsStreamingChat(false);
          toast.error(err.message || "Error generating response");
        },
      );
    } catch (e: any) {
      setIsStreamingChat(false);
    }
  };

  const handleStopChatStream = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      setIsStreamingChat(false);
      toast.info(t("llmRunner.stoppedGeneration", undefined, "Generation stopped."));
    }
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.format.toLowerCase().includes(q) ||
        m.quantization.toLowerCase().includes(q),
    );
  }, [models, searchQuery]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 text-slate-100">
      {/* Top Header & Telemetry Bar */}
      <div className="bg-gradient-to-r from-slate-900/90 via-cyan-950/40 to-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Cpu className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
                    {t("apps.llmRunnerTitle", undefined, "LLM Runner")}
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                    Desktop Exclusive
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "apps.llmRunnerDesc",
                    undefined,
                    "Run local GGUF, SafeTensors, and massive AirLLM models right on your desktop hardware.",
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Real-time Status Badge & Hardware Tag */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                runnerStatus?.is_active
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : runnerStatus?.state === "loading"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  runnerStatus?.is_active
                    ? "bg-emerald-400 animate-ping"
                    : runnerStatus?.state === "loading"
                    ? "bg-amber-400 animate-spin"
                    : "bg-slate-500"
                }`}
              />
              {runnerStatus?.is_active
                ? `Running: ${runnerStatus.active_model?.name || "Model"}`
                : runnerStatus?.state === "loading"
                ? "Loading Model..."
                : "Idle / Stopped"}
            </div>

            {runnerStatus?.hardware?.cuda_available && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>CUDA Active</span>
                {runnerStatus.hardware.vram_mb > 0 && (
                  <span className="text-purple-400/80">
                    ({Math.round(runnerStatus.hardware.vram_mb / 1024)}GB VRAM)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Header Row (If model is active) */}
        {runnerStatus?.is_active && (
          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Engine</span>
              <span className="font-semibold text-cyan-400">
                {runnerStatus.active_model?.engine_type.toUpperCase()}
              </span>
            </div>
            <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Speed</span>
              <span className="font-semibold text-white">
                {runnerStatus.metrics.last_tokens_per_sec > 0
                  ? `${runnerStatus.metrics.last_tokens_per_sec} t/s`
                  : "Standby"}
              </span>
            </div>
            <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Time to First Token</span>
              <span className="font-semibold text-white">
                {runnerStatus.metrics.last_ttft_ms > 0
                  ? `${runnerStatus.metrics.last_ttft_ms} ms`
                  : "0 ms"}
              </span>
            </div>
            <div className="bg-black/20 p-2.5 rounded-lg border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Context Window</span>
              <span className="font-semibold text-white">
                {runnerStatus.active_model?.params?.n_ctx || 4096} tokens
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/10 space-x-2">
        <button
          onClick={() => setActiveTab("models")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            activeTab === "models"
              ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <HardDrive className="w-4 h-4" />
          {t("llmRunner.modelsTab", undefined, "Models & Storage")}
          <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
            {models.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("runner")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            activeTab === "runner"
              ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sliders className="w-4 h-4" />
          {t("llmRunner.runnerTab", undefined, "Runner Controls")}
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            activeTab === "chat"
              ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {t("llmRunner.chatTab", undefined, "Testing Chat")}
          {runnerStatus?.is_active && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* TAB 1: MODELS & STORAGE */}
      {activeTab === "models" && (
        <div className="space-y-6">
          {/* AppData Folder Bar */}
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                {t("llmRunner.storageLocation", undefined, "AppData Storage Directory")}
              </span>
              <p className="text-xs sm:text-sm text-slate-300 font-mono break-all select-all">
                {modelsDir || "%LOCALAPPDATA%\\OxygenLowsSoftware\\Models"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold transition-all shadow-sm"
              >
                <FolderOpen className="w-4 h-4" />
                {t("llmRunner.openFolder", undefined, "Open in Explorer")}
              </button>

              <button
                type="button"
                onClick={handlePickFile}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all"
              >
                <Upload className="w-4 h-4" />
                {t("llmRunner.importFile", undefined, "Import Model File")}
              </button>

              <button
                type="button"
                onClick={handlePickFolder}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all"
              >
                <Layers className="w-4 h-4" />
                {t("llmRunner.importFolder", undefined, "Import Checkpoint Folder")}
              </button>

              <button
                type="button"
                onClick={refreshModelsList}
                disabled={isLoadingModels}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
                title="Refresh models list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingModels ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Hugging Face Downloader Card */}
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">
                  {t("llmRunner.hfDownloader", undefined, "Hugging Face Downloader")}
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Downloads directly to your AppData Models storage
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs text-slate-400 font-medium">
                  {t("llmRunner.repoIdLabel", undefined, "Hugging Face Repo ID")}
                </label>
                <input
                  type="text"
                  placeholder="e.g. TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"
                  value={hfRepoId}
                  onChange={(e) => setHfRepoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">
                  {t("llmRunner.filenameLabel", undefined, "File Name (Optional for GGUF)")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. model.Q4_K_M.gguf"
                    value={hfFilename}
                    onChange={(e) => setHfFilename(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    disabled={isStartingDownload || downloadProgress?.status === "downloading"}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs sm:text-sm flex items-center gap-1.5 flex-shrink-0 transition-all shadow-md disabled:opacity-50"
                  >
                    {isStartingDownload ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {t("llmRunner.downloadBtn", undefined, "Download")}
                  </button>
                </div>
              </div>
            </div>

            {/* Active Download Progress Card */}
            {downloadProgress && downloadProgress.status === "downloading" && (
              <div className="bg-black/30 border border-cyan-500/30 rounded-xl p-4 space-y-2 animate-pulse">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-cyan-400">
                    Downloading: {downloadProgress.repo_id} {downloadProgress.filename ? `(${downloadProgress.filename})` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelDownload}
                    className="text-red-400 hover:text-red-300 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(5, downloadProgress.percent || 0)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Target: AppData\OxygenLowsSoftware\Models</span>
                  <span>{downloadProgress.percent ? `${downloadProgress.percent.toFixed(1)}%` : "Connecting..."}</span>
                </div>
              </div>
            )}
          </div>

          {/* Model Files Filter & Grid */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                {t("llmRunner.installedModels", undefined, "Stored Models")} ({filteredModels.length})
              </h3>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {filteredModels.length === 0 ? (
              <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-10 text-center space-y-3">
                <HardDrive className="w-10 h-10 text-slate-500 mx-auto" />
                <h4 className="text-base font-semibold text-white">No Models Found in AppData</h4>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  Drag and drop <span className="text-cyan-400 font-mono">.gguf</span> or{" "}
                  <span className="text-purple-400 font-mono">.safetensors</span> files into your Models folder, or use the Hugging Face downloader above.
                </p>
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold transition-all"
                >
                  <FolderOpen className="w-4 h-4" />
                  Open Models Folder in Explorer
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredModels.map((model) => {
                  const isActive = runnerStatus?.is_active && runnerStatus.active_model?.path === model.path;

                  return (
                    <div
                      key={model.id}
                      className={`relative bg-slate-900/70 border rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4 transition-all duration-300 hover:border-white/20 ${
                        isActive
                          ? "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] bg-slate-900/90"
                          : "border-white/10"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                model.format === "gguf"
                                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                  : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              }`}
                            >
                              {model.format}
                            </span>
                            {model.quantization && model.quantization !== "Standard" && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/10">
                                {model.quantization}
                              </span>
                            )}
                          </div>

                          {isActive && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                              Active
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-semibold text-white truncate" title={model.name}>
                          {model.name}
                        </h4>

                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
                          <span>Size: {model.size_display}</span>
                          <span>{model.modified_at.split(" ")[0]}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2">
                        {isActive ? (
                          <button
                            type="button"
                            onClick={handleUnloadModel}
                            disabled={isOperatingModel}
                            className="flex-1 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Square className="w-3.5 h-3.5" />
                            Unload
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModelPath(model.path);
                              handleLoadModel(model.path);
                            }}
                            disabled={isOperatingModel}
                            className="flex-1 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Run Model
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteModel(model)}
                          disabled={isActive || isOperatingModel}
                          className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-all disabled:opacity-30"
                          title="Delete model from disk"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RUNNER CONTROLS */}
      {activeTab === "runner" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Configuration Form */}
            <div className="lg:col-span-2 bg-slate-900/70 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-semibold text-white">
                    {t("llmRunner.runtimeSettings", undefined, "Runtime Engine & Hardware Configuration")}
                  </h3>
                </div>
              </div>

              {/* Model File Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Target Model Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedModelPath}
                    onChange={(e) => setSelectedModelPath(e.target.value)}
                    placeholder="Path to .gguf or .safetensors model"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handlePickFile}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse
                  </button>
                </div>
              </div>

              {/* Engine Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Inference Engine</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "auto", label: "Auto-Detect", desc: "Selects best engine by format" },
                    { id: "llama-cpp", label: "llama.cpp", desc: "Quantized GGUF engine" },
                    { id: "transformers", label: "Transformers", desc: "SafeTensors causal LM" },
                    { id: "airllm", label: "AirLLM", desc: "Massive 70B+ layer-wise" },
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => setSelectedEngine(engine.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedEngine === engine.id
                          ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="font-semibold text-xs text-white">{engine.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-tight">{engine.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AirLLM Special Feature Notice */}
              {selectedEngine === "airllm" && (
                <div className="bg-purple-950/30 border border-purple-500/40 rounded-xl p-4 text-xs text-purple-200 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-purple-300">AirLLM Layer-Wise Loading Active</span>
                    AirLLM streams model weights layer-by-layer directly from disk to GPU/RAM during inference. This lets you run 70B+ parameter models on a single 4GB/8GB GPU or normal laptop memory without requiring 140GB+ of VRAM!
                  </div>
                </div>
              )}

              {/* Hardware Offload Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">GPU Offload Layers</span>
                    <span className="text-cyan-400 font-mono font-semibold">{nGpuLayers}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="64"
                    step="1"
                    value={nGpuLayers}
                    onChange={(e) => setNGpuLayers(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <span className="text-[10px] text-slate-400 block">0 = Pure CPU, 32+ = High GPU offload</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">Context Length (Tokens)</span>
                    <span className="text-cyan-400 font-mono font-semibold">{nCtx}</span>
                  </div>
                  <select
                    value={nCtx}
                    onChange={(e) => setNCtx(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value={2048}>2048 tokens</option>
                    <option value={4096}>4096 tokens (Standard)</option>
                    <option value={8192}>8192 tokens</option>
                    <option value={16384}>16384 tokens</option>
                    <option value={32768}>32768 tokens (High VRAM)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">CPU Threads</span>
                    <span className="text-cyan-400 font-mono font-semibold">{nThreads}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={nThreads}
                    onChange={(e) => setNThreads(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">Temperature</span>
                    <span className="text-cyan-400 font-mono font-semibold">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                {runnerStatus?.is_active ? (
                  <button
                    type="button"
                    onClick={handleUnloadModel}
                    disabled={isOperatingModel}
                    className="px-6 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-sm font-semibold flex items-center gap-2 transition-all"
                  >
                    {isOperatingModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                    Unload Current Model
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLoadModel()}
                    disabled={isOperatingModel || !selectedModelPath}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isOperatingModel ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    Load & Initialize Model
                  </button>
                )}

                {runnerStatus?.is_active && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold flex items-center gap-2 transition-all"
                  >
                    <MessageSquare className="w-4 h-4 text-cyan-400" />
                    Open Testing Chat
                  </button>
                )}
              </div>
            </div>

            {/* Right: Telemetry & Status Card */}
            <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                Live Status & Telemetry
              </h3>

              <div className="space-y-3">
                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Model State</span>
                  <div className="text-sm font-bold text-white capitalize">{runnerStatus?.state || "Stopped"}</div>
                </div>

                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Active Model</span>
                  <div className="text-xs font-semibold text-cyan-400 break-all">
                    {runnerStatus?.active_model?.name || "None loaded"}
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Last Generation Speed</span>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {runnerStatus?.metrics?.last_tokens_per_sec || 0} t/s
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Time to First Token</span>
                  <div className="text-lg font-bold text-cyan-400 font-mono">
                    {runnerStatus?.metrics?.last_ttft_ms || 0} ms
                  </div>
                </div>

                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">VRAM / GPU Support</span>
                  <div className="text-xs font-semibold text-white">
                    {runnerStatus?.hardware?.cuda_available
                      ? `CUDA Available (${Math.round(runnerStatus.hardware.vram_mb / 1024)}GB VRAM)`
                      : "CPU Inference Only"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TESTING CHAT */}
      {activeTab === "chat" && (
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl flex flex-col h-[650px] overflow-hidden shadow-2xl">
          {/* Chat Header */}
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">
                {runnerStatus?.is_active
                  ? `Chatting with: ${runnerStatus.active_model?.name}`
                  : "Testing Chat (No Model Loaded)"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSystemPromptEditor(!showSystemPromptEditor)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1.5 transition-all"
              >
                <Settings2 className="w-3.5 h-3.5" />
                System Prompt
              </button>
              <button
                type="button"
                onClick={() => setChatMessages([])}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* System Prompt Collapsible Drawer */}
          {showSystemPromptEditor && (
            <div className="p-3 bg-black/40 border-b border-white/10 space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">System Instructions</label>
              <textarea
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* Messages Scroll Area */}
          <div ref={chatScrollRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
            {!runnerStatus?.is_active && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-400" />
                <h4 className="text-base font-semibold text-white">No Local Model Active</h4>
                <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
                  Go to the <strong>Models</strong> tab to select and load an installed model before chatting.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("models")}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-semibold"
                >
                  Select a Model
                </button>
              </div>
            )}

            {runnerStatus?.is_active && chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-400">
                <Sparkles className="w-8 h-8 text-cyan-400 mb-2" />
                <h4 className="text-sm font-semibold text-white">Local Model Ready</h4>
                <p className="text-xs max-w-sm">
                  Send a prompt below to test speed, reasoning, and real-time token streaming on your hardware.
                </p>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0 mt-1">
                    <Cpu className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan-500 text-black font-medium rounded-tr-none shadow-md"
                      : "bg-white/5 border border-white/10 text-white rounded-tl-none shadow-md"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="prose prose-invert prose-xs max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || (isStreamingChat ? "..." : "")}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 border-t border-white/10 bg-slate-900/90">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder={
                  runnerStatus?.is_active
                    ? "Type your testing prompt here..."
                    : "Load a model first to chat..."
                }
                disabled={!runnerStatus?.is_active || isStreamingChat}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-40"
              />

              {isStreamingChat ? (
                <button
                  type="button"
                  onClick={handleStopChatStream}
                  className="px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendChatMessage}
                  disabled={!runnerStatus?.is_active || !chatInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
