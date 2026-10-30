import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { isDesktopBridgeAvailable, PythonServerInfo } from "@/lib/desktopBridge";
import {
  llmRunnerService,
  PythonOverview,
  PythonDependenciesStatus,
  PythonLogEntry,
} from "@/services/llmRunnerService";
import {
  Terminal,
  Activity,
  RotateCw,
  Download,
  Trash2,
  Search,
  Layers,
  Loader2,
  RefreshCw,
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
  const [serverInfo, setServerInfo] = useState<PythonServerInfo | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [installingPackage, setInstallingPackage] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<
    Record<string, { progress: number; stage: string }>
  >({});

  // Logs State
  const [logs, setLogs] = useState<PythonLogEntry[]>([]);
  const [selectedLogLevel, setSelectedLogLevel] = useState<string>("ALL");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  const fetchOverviewData = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const info = await llmRunnerService.getDesktopServerInfo().catch(() => null);
      if (info) setServerInfo(info);

      const [ov, deps] = await Promise.all([
        llmRunnerService.getPythonOverview().catch(() => null),
        llmRunnerService.getPythonDependencies().catch(() => null),
      ]);
      setOverview(ov);
      setDependencies(deps);
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
        fetchOverviewData();
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
    setInstallProgress((prev) => ({
      ...prev,
      [pkgName]: {
        progress: 10,
        stage: t("pythonManager.installResolving", undefined, "Resolving dependencies..."),
      },
    }));

    toast.info(t("pythonManager.installStarted", { name: pkgName }, `Installing '${pkgName}' into isolated venv...`));

    try {
      const res = await llmRunnerService.installPythonDependency(pkgName);

      // If the backend runs asynchronously, poll real progress
      if (res.status === "started" || res.status === "installing") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            clearInterval(pollInterval);
            reject(new Error("Installation timed out after 300 seconds."));
          }, 300000);

          const pollInterval = setInterval(async () => {
            try {
              const info = await llmRunnerService.getPythonInstallProgress();
              if (info && info.package === pkgName) {
                if (info.status === "installing") {
                  setInstallProgress((prev) => ({
                    ...prev,
                    [pkgName]: {
                      progress: Math.max(10, Math.min(95, Math.round(info.percent || 15))),
                      stage: info.stage || t("pythonManager.installingPackage", undefined, "Installing packages..."),
                    },
                  }));
                } else if (info.status === "completed") {
                  clearInterval(pollInterval);
                  clearTimeout(timeout);
                  resolve();
                } else if (info.status === "error") {
                  clearInterval(pollInterval);
                  clearTimeout(timeout);
                  reject(new Error(info.error || "Package installation failed"));
                }
              }
            } catch {
              // Ignore temporary poll network errors
            }
          }, 500);
        });
      } else if (!res.success) {
        throw new Error(res.error || res.stderr?.slice(0, 150) || "Check logs for details");
      }

      setInstallProgress((prev) => ({
        ...prev,
        [pkgName]: {
          progress: 100,
          stage: t("pythonManager.installComplete", undefined, "Installed"),
        },
      }));
      toast.success(t("pythonManager.installSuccess", { name: pkgName }, `Successfully installed '${pkgName}'!`));
      await fetchOverviewData();
      setTimeout(() => {
        setInstallProgress((prev) => {
          const copy = { ...prev };
          delete copy[pkgName];
          return copy;
        });
      }, 1200);
    } catch (err: any) {
      setInstallProgress((prev) => {
        const copy = { ...prev };
        delete copy[pkgName];
        return copy;
      });
      toast.error(
        t("pythonManager.installFailed", { name: pkgName }, `Failed to install '${pkgName}': `) +
          (err.message || "Check logs for details"),
      );
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

  const isOnline = overview?.status === "running";

  const serverStatusDisplay = useMemo(() => {
    if (isRestarting) {
      return {
        label: t("pythonManager.statusRestarting", undefined, "Restarting"),
        state: "restarting" as const,
      };
    }
    if (isOnline) {
      return {
        label: t("pythonManager.statusRunning", undefined, "Running"),
        state: "running" as const,
      };
    }
    if (serverInfo) {
      if (
        serverInfo.status === "StartingServer" ||
        serverInfo.status === "Initializing" ||
        serverInfo.status === "CreatingVirtualEnv" ||
        serverInfo.status === "InstallingDependencies"
      ) {
        return {
          label: t("pythonManager.statusStarting", undefined, "Starting..."),
          state: "starting" as const,
        };
      }
      if (serverInfo.status === "Failed") {
        return {
          label: t("pythonManager.statusFailed", undefined, "Failed"),
          state: "error" as const,
        };
      }
      if (serverInfo.status === "Stopped" || !serverInfo.isRunning) {
        return {
          label: t("pythonManager.statusStopped", undefined, "Stopped"),
          state: "stopped" as const,
        };
      }
    }
    if (isLoadingOverview) {
      return {
        label: t("pythonManager.statusConnecting", undefined, "Connecting..."),
        state: "starting" as const,
      };
    }
    return {
      label: t("pythonManager.statusOffline", undefined, "Offline"),
      state: "stopped" as const,
    };
  }, [isOnline, isRestarting, serverInfo, isLoadingOverview, t]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 text-slate-100">
      {/* Top Controls & Server Telemetry */}
      <div className="bg-slate-900/60 border border-white/10 rounded-xl p-4 sm:p-5 backdrop-blur-sm">
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleRestartServer}
            disabled={isRestarting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold transition-all disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? "animate-spin" : ""}`} />
            {isRestarting
              ? t("pythonManager.statusRestarting", undefined, "Restarting")
              : t("pythonManager.restartServer", undefined, "Restart Python Server")}
          </button>

          <button
            type="button"
            onClick={() => {
              fetchOverviewData();
              fetchLogs();
            }}
            disabled={isLoadingOverview}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOverview ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-black/25 p-3 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
              {t("pythonManager.serverStatus", undefined, "Server Status")}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`font-semibold capitalize ${
                  serverStatusDisplay.state === "running"
                    ? "text-emerald-400"
                    : serverStatusDisplay.state === "starting" || serverStatusDisplay.state === "restarting"
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {serverStatusDisplay.label}
              </span>
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
              {t("pythonManager.processPidUptime", undefined, "Process PID & Uptime")}
            </span>
            <div className="font-semibold text-white mt-1">
              {overview ? `PID ${overview.pid} • ${formattedUptime}` : "—"}
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
              {t("pythonManager.memoryCpu", undefined, "Memory & CPU")}
            </span>
            <div className="font-semibold text-cyan-400 mt-1">
              {overview ? `${overview.memory_mb} MB • ${overview.cpu_percent}% CPU` : "—"}
            </div>
          </div>

          <div className="bg-black/25 p-3 rounded-xl border border-white/5">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider">
              {t("pythonManager.loadedApps", undefined, "Loaded Apps")}
            </span>
            <div className="font-semibold text-white mt-1">
              {overview ? `${overview.loaded_apps?.length || 0} modular apps` : "—"}
            </div>
          </div>
        </div>

        {/* Offline / Error / Starting Banner */}
        {!isOnline && (
          <div
            className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              serverStatusDisplay.state === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-200"
                : serverStatusDisplay.state === "starting"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                : "bg-slate-800/80 border-white/10 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {serverStatusDisplay.state === "error" ? (
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              ) : serverStatusDisplay.state === "starting" ? (
                <Loader2 className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
              ) : (
                <Info className="w-5 h-5 text-slate-400 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {serverStatusDisplay.state === "error"
                    ? t("pythonManager.serverFailedTitle", undefined, "Python Server Error")
                    : serverStatusDisplay.state === "starting"
                    ? t("pythonManager.serverStartingTitle", undefined, "Starting Python Runtime...")
                    : t("pythonManager.serverOfflineTitle", undefined, "Python Background Server is Offline")}
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  {serverInfo?.error
                    ? serverInfo.error
                    : serverStatusDisplay.state === "starting"
                    ? t("pythonManager.serverStartingDesc", undefined, "Initializing virtual environment and background worker...")
                    : t("pythonManager.serverOfflineDesc", undefined, "Click 'Restart Python Server' to start the local runtime.")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRestartServer}
              disabled={isRestarting}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shrink-0 self-start sm:self-auto disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? "animate-spin" : ""}`} />
              {t("pythonManager.startServer", undefined, "Start / Restart Server")}
            </button>
          </div>
        )}
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
          {/* Dependencies Card */}
          <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  {t("pythonManager.dependenciesTitle", undefined, "Dependencies")}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleInstallAllMissing}
                disabled={installingPackage !== null || !isOnline}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {t("pythonManager.installMissing", undefined, "Install Missing Packages")}
              </button>
            </div>

            {!dependencies ? (
              !isOnline ? (
                <div className="bg-black/20 border border-white/5 rounded-xl p-8 text-center space-y-2">
                  <Layers className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">
                    {t("pythonManager.depsUnavailableTitle", undefined, "Dependencies Unavailable")}
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {t(
                      "pythonManager.depsUnavailableDesc",
                      undefined,
                      "Start the Python background server to detect and manage installed AI inference libraries.",
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  <span className="text-xs">
                    {t("pythonManager.loadingDependencies", undefined, "Querying installed packages...")}
                  </span>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {dependencies.dependencies.map((dep) => (
                  <div
                    key={dep.name}
                    className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-white text-xs font-mono">{dep.name}</span>
                        {dep.installed ? (
                          <span className="text-[11px] font-mono text-emerald-400">
                            v{dep.version}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-400">
                            Missing
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{dep.description}</p>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      {installProgress[dep.name] ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 truncate">
                              {installProgress[dep.name].stage}
                            </span>
                            <span className="text-cyan-400 font-mono font-medium ml-2 shrink-0">
                              {installProgress[dep.name].progress}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-500 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${installProgress[dep.name].progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-mono">Req: {dep.required}</span>
                          <button
                            type="button"
                            onClick={() => handleInstallPackage(dep.name)}
                            disabled={installingPackage !== null}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 text-[11px] font-semibold transition-all disabled:opacity-40"
                          >
                            {dep.installed
                              ? t("pythonManager.update", undefined, "Update")
                              : t("pythonManager.install", undefined, "Install")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <p>
                  {!isOnline
                    ? t("pythonManager.serverOfflineDesc", undefined, "Start the Python background server to view logs.")
                    : "No log records match the current filter."}
                </p>
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
