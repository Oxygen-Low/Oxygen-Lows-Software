import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { isDesktopBridgeAvailable } from "@/lib/desktopBridge";
import {
  llmRunnerService,
  PythonOverview,
  PythonDependenciesStatus,
  PythonLogEntry,
} from "@/services/llmRunnerService";
import {
  Terminal,
  Activity,
  Cpu,
  RotateCw,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  HardDrive,
  Layers,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export function PythonManagerApp() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"overview" | "logs">("overview");

  // Overview & Server State
  const [overview, setOverview] = useState<PythonOverview | null>(null);
  const [dependencies, setDependencies] = useState<PythonDependenciesStatus | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [installingPackage, setInstallingPackage] = useState<string | null>(null);

  // Logs State
  const [logs, setLogs] = useState<PythonLogEntry[]>([]);
  const [selectedLogLevel, setSelectedLogLevel] = useState<string>("ALL");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  const fetchOverviewData = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const [ov, deps] = await Promise.all([
        llmRunnerService.getPythonOverview().catch(() => null),
        llmRunnerService.getPythonDependencies().catch(() => null),
      ]);
      if (ov) setOverview(ov);
      if (deps) setDependencies(deps);
    } catch (e: any) {
      console.warn("Error fetching python overview:", e);
    } finally {
      setIsLoadingOverview(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await llmRunnerService.getPythonLogs(
        selectedLogLevel === "ALL" ? undefined : selectedLogLevel,
        logSearchQuery.trim() || undefined,
        250,
      );
      setLogs(res.logs || []);
    } catch {}
  }, [selectedLogLevel, logSearchQuery]);

  useEffect(() => {
    fetchOverviewData();
    fetchLogs();

    const interval = setInterval(() => {
      fetchLogs();
      if (activeTab === "overview") {
        llmRunnerService.getPythonOverview().then((ov) => ov && setOverview(ov)).catch(() => {});
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchOverviewData, fetchLogs, activeTab]);

  useEffect(() => {
    if (autoScroll && logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleRestartServer = async () => {
    if (!isDesktopBridgeAvailable()) {
      toast.error(t("pythonManager.desktopRequired", undefined, "Desktop environment required."));
      return;
    }
    setIsRestarting(true);
    try {
      await llmRunnerService.restartServer();
      toast.success(t("pythonManager.serverRestarted", undefined, "Python background server restarted successfully!"));
      await fetchOverviewData();
      await fetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to restart Python server");
    } finally {
      setIsRestarting(false);
    }
  };

  const handleInstallPackage = async (pkgName: string) => {
    setInstallingPackage(pkgName);
    toast.info(t("pythonManager.installStarted", undefined, `Installing '${pkgName}' into isolated venv...`));
    try {
      const res = await llmRunnerService.installPythonDependency(pkgName);
      if (res.success) {
        toast.success(t("pythonManager.installSuccess", undefined, `Successfully installed '${pkgName}'!`));
        fetchOverviewData();
      } else {
        toast.error(
          t("pythonManager.installFailed", undefined, `Failed to install '${pkgName}': `) +
            (res.error || res.stderr?.slice(0, 150) || "Check logs for details"),
        );
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to install '${pkgName}'`);
    } finally {
      setInstallingPackage(null);
    }
  };

  const handleInstallAllMissing = async () => {
    if (!dependencies?.dependencies) return;
    const missing = dependencies.dependencies.filter((d) => !d.installed);
    if (missing.length === 0) {
      toast.info(t("pythonManager.allInstalled", undefined, "All AI dependencies are already installed!"));
      return;
    }

    for (const item of missing) {
      await handleInstallPackage(item.name);
    }
  };

  const handleClearLogs = async () => {
    try {
      await llmRunnerService.clearPythonLogs();
      setLogs([]);
      toast.success(t("pythonManager.logsCleared", undefined, "Logs cleared."));
    } catch (err: any) {
      toast.error(err.message || "Failed to clear logs");
    }
  };

  const handleExportLogs = () => {
    if (logs.length === 0) {
      toast.info("No logs to export.");
      return;
    }
    const content = logs
      .map(
        (l) =>
          `[${l.time_str}] [${l.level}] [${l.name}] ${l.message}${
            l.exception ? `\nException:\n${l.exception}` : ""
          }`,
      )
      .join("\n\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `python-server-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs exported to file.");
  };

  const formattedUptime = useMemo(() => {
    if (!overview?.uptime_seconds) return "0s";
    const sec = Math.floor(overview.uptime_seconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }, [overview?.uptime_seconds]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 text-slate-100">
      {/* Top Header & Server Telemetry */}
      <div className="bg-gradient-to-r from-slate-900/90 via-slate-950 to-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Terminal className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
                  {t("apps.pythonManagerTitle", undefined, "Python Manager")}
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  Desktop Exclusive
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                {t(
                  "apps.pythonManagerDesc",
                  undefined,
                  "Inspect Python server runtime status, manage AI packages, and view live error and warning logs.",
                )}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRestartServer}
              disabled={isRestarting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? "animate-spin" : ""}`} />
              {isRestarting ? "Restarting Server..." : "Restart Python Server"}
            </button>

            <button
              type="button"
              onClick={() => {
                fetchOverviewData();
                fetchLogs();
              }}
              disabled={isLoadingOverview}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingOverview ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Server Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold text-emerald-400 capitalize">{overview?.status || "Running"}</span>
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Process PID & Uptime</span>
            <div className="font-semibold text-white mt-1">
              PID {overview?.pid || "—"} • {formattedUptime}
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Memory & CPU</span>
            <div className="font-semibold text-cyan-400 mt-1">
              {overview?.memory_mb || 0} MB • {overview?.cpu_percent || 0}% CPU
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Loaded Apps</span>
            <div className="font-semibold text-white mt-1">
              {overview?.loaded_apps?.length || 0} modular apps
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 space-x-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            activeTab === "overview"
              ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Activity className="w-4 h-4" />
          {t("pythonManager.overviewTab", undefined, "Environment & Dependencies")}
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
            activeTab === "logs"
              ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Terminal className="w-4 h-4" />
          {t("pythonManager.logsTab", undefined, "Logs & Diagnostics")}
          <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
            {logs.length}
          </span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & DEPENDENCIES */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Virtualenv Info Box */}
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              Isolated Virtual Environment Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">Virtualenv Prefix</span>
                <span className="font-mono text-slate-200 break-all select-all">
                  {overview?.environment_prefix || "%LOCALAPPDATA%\\OxygenLowsSoftware\\PythonEnv"}
                </span>
              </div>
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">Executable Path</span>
                <span className="font-mono text-slate-200 break-all select-all">
                  {overview?.executable || "python.exe"}
                </span>
              </div>
            </div>
          </div>

          {/* CUDA Hardware Card */}
          {dependencies?.cuda && (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-400" />
                  <h3 className="text-base font-semibold text-white">CUDA GPU Acceleration</h3>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                    dependencies.cuda.available
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-white/5 text-slate-400 border-white/10"
                  }`}
                >
                  {dependencies.cuda.available ? "Hardware Acceleration Enabled" : "CPU Fallback"}
                </span>
              </div>

              <div className="text-xs text-slate-300 pt-1">
                {dependencies.cuda.available ? (
                  <span>
                    Detected GPU: <strong>{dependencies.cuda.device_name}</strong> with{" "}
                    <strong>{Math.round(dependencies.cuda.total_vram_mb / 1024)}GB VRAM</strong>. PyTorch will offload tensor layers directly to VRAM.
                  </span>
                ) : (
                  <span>
                    No CUDA GPU detected or PyTorch CUDA runtime not configured. Models will execute via multithreaded CPU inference.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Dependencies Card */}
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Tracked AI Dependencies & Libraries
                </h3>
                <p className="text-xs text-slate-400">
                  Required packages for GGUF, SafeTensors, and AirLLM inference.
                </p>
              </div>

              <button
                type="button"
                onClick={handleInstallAllMissing}
                disabled={installingPackage !== null}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Install Missing Packages
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {dependencies?.dependencies?.map((dep) => (
                <div
                  key={dep.name}
                  className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-white text-xs font-mono">{dep.name}</span>
                      {dep.installed ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          v{dep.version}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          Missing
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{dep.description}</p>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">Req: {dep.required}</span>
                    <button
                      type="button"
                      onClick={() => handleInstallPackage(dep.name)}
                      disabled={installingPackage !== null}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 text-[11px] font-semibold transition-all disabled:opacity-40"
                    >
                      {installingPackage === dep.name ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : dep.installed ? (
                        "Update"
                      ) : (
                        "Install"
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOGS & DIAGNOSTICS */}
      {activeTab === "logs" && (
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl flex flex-col h-[650px] overflow-hidden shadow-2xl">
          {/* Log Controls Header */}
          <div className="p-4 border-b border-white/10 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Level:</span>
              <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/10 text-xs">
                {["ALL", "ERROR", "WARNING", "INFO"].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLogLevel(lvl)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      selectedLogLevel === lvl
                        ? "bg-cyan-500 text-black font-semibold shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter logs by message..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0"
                />
                Auto-scroll
              </label>

              <button
                type="button"
                onClick={handleExportLogs}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition-all"
                title="Download log file"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>

              <button
                type="button"
                onClick={handleClearLogs}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-xs text-slate-300 hover:text-red-400 flex items-center gap-1 transition-all"
                title="Clear buffer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>

          {/* Logs Viewport */}
          <div
            ref={logsScrollRef}
            className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 bg-black/40"
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                <Terminal className="w-8 h-8 opacity-40" />
                <p>No log records match the current filter.</p>
              </div>
            ) : (
              logs.map((log) => {
                const isError = log.level === "ERROR";
                const isWarning = log.level === "WARNING";

                return (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg border transition-colors ${
                      isError
                        ? "bg-red-950/20 border-red-500/30 text-red-200"
                        : isWarning
                        ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                        : "bg-white/[0.02] border-white/5 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500 select-none">[{log.time_str}]</span>
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded ${
                          isError
                            ? "bg-red-500/20 text-red-400"
                            : isWarning
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-cyan-500/20 text-cyan-400"
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="text-slate-400">{log.name}</span>
                    </div>

                    <div className="mt-1 whitespace-pre-wrap break-all">{log.message}</div>

                    {log.exception && (
                      <div className="mt-2 p-2 bg-black/50 rounded border border-red-500/20 text-[10px] text-red-300 overflow-x-auto whitespace-pre">
                        {log.exception}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
