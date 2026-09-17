import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Cpu,
  Server,
  Share2,
  Lock,
  Unlock,
  Users,
  Shield,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Settings,
  Play,
  Check,
  Copy,
  Clock,
  Zap,
  Activity,
  AlertCircle,
  Pause,
  Layers,
  Sparkles,
  Gamepad2,
  Eye,
  Bookmark,
  BookmarkCheck,
  Radio,
  Send,
  Loader2,
  ChevronRight,
  Sliders,
  Globe,
  Download,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { useToast } from "@/components/ui/use-toast";
import { isDesktopBridgeAvailable } from "@/lib/desktopBridge";
import {
  modelsHostRelay,
  LocalSharedModelConfig,
  RelayActivityLog,
  HostRelayState,
} from "@/lib/modelsHostRelay";

export interface SharedModelItem {
  id: string;
  name: string;
  model_id: string;
  hostUserId: string;
  hostUsername: string;
  provider: "ollama" | "lmstudio" | "kobold" | "python" | "custom";
  modality: "text" | "vision" | "embeddings";
  sharing_mode: "public" | "friends" | "private" | "password";
  has_password?: boolean;
  max_tokens: number;
  max_concurrent: number;
  context_length?: number;
  status: "online" | "busy" | "paused";
  activeRequests: number;
  queueLength: number;
  isOwner: boolean;
  isFriend: boolean;
  tokensServedToday: number;
}

export function Models() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<
    "all" | "my-devices" | "friends" | "public" | "pinned"
  >("all");
  const [modalityFilter, setModalityFilter] = useState<
    "all" | "text" | "vision" | "embeddings"
  >("all");

  // Shared models from server
  const [sharedModels, setSharedModels] = useState<SharedModelItem[]>([]);
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);

  // Desktop bridge detection: model hosting is a desktop-only capability
  const isDesktop = isDesktopBridgeAvailable();

  // Host configuration state
  const [hostState, setHostState] = useState<HostRelayState>(
    modelsHostRelay.getState(),
  );
  const [localDiscoveredModels, setLocalDiscoveredModels] = useState<
    Array<{
      model_id: string;
      provider: "ollama" | "lmstudio" | "kobold" | "python" | "custom";
      name?: string;
      customUrl?: string;
    }>
  >([]);
  const [configuredModels, setConfiguredModels] = useState<
    LocalSharedModelConfig[]
  >([]);
  const [customEndpoints, setCustomEndpoints] = useState<string[]>([]);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  // Model Edit Modal
  const [editingModel, setEditingModel] =
    useState<LocalSharedModelConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Password Unlock Modal for Browse
  const [unlockingModel, setUnlockingModel] = useState<SharedModelItem | null>(
    null,
  );
  const [enteredPassword, setEnteredPassword] = useState("");
  const [unlockedPasswords, setUnlockedPasswords] = useState<
    Record<string, string>
  >({});

  // Playground state
  const [playgroundModelId, setPlaygroundModelId] = useState<string>("");
  const [playgroundPrompt, setPlaygroundPrompt] = useState("");
  const [playgroundOutput, setPlaygroundOutput] = useState("");
  const [isPlaygroundRunning, setIsPlaygroundRunning] = useState(false);
  const [playgroundQueueStatus, setPlaygroundQueueStatus] = useState<
    string | null
  >(null);
  const [embeddingInput, setEmbeddingInput] = useState("");
  const [embeddingResult, setEmbeddingResult] = useState<number[] | null>(null);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Subscribe to relay manager events
  useEffect(() => {
    const unsub = modelsHostRelay.subscribe((state) => {
      setHostState(state);
    });
    return unsub;
  }, []);

  // Fetch shared models and pinned models from server
  const fetchSharedModels = useCallback(async () => {
    setIsLoadingShared(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/models/shared", { headers });
      if (res.ok) {
        const data = await res.json();
        setSharedModels(data.models || []);
      }

      if (session?.access_token) {
        const pinRes = await fetch("/api/models/pinned", { headers });
        if (pinRes.ok) {
          const pinData = await pinRes.json();
          setPinnedModelIds(pinData.pinned || []);
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoadingShared(false);
    }
  }, [session?.access_token]);

  // Load host config on mount (desktop only)
  useEffect(() => {
    fetchSharedModels();

    if (isDesktop && session?.access_token) {
      fetch("/api/models/host/config", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            if (Array.isArray(data.models)) setConfiguredModels(data.models);
            if (Array.isArray(data.customEndpoints))
              setCustomEndpoints(data.customEndpoints);
            if (data.masterPaused !== undefined) {
              modelsHostRelay.setMasterPaused(data.masterPaused);
            }
          }
        })
        .catch(() => {});
    }
  }, [session?.access_token, fetchSharedModels, isDesktop]);

  // Initial local models scan (desktop only)
  const handleScanLocal = useCallback(async () => {
    if (!isDesktop) return;
    setIsScanning(true);
    try {
      const discovered =
        await modelsHostRelay.discoverLocalModels(customEndpoints);
      setLocalDiscoveredModels(discovered);

      // Merge newly discovered models into configured models if not already present
      setConfiguredModels((prev) => {
        const existingIds = new Set(prev.map((m) => m.model_id));
        const added: LocalSharedModelConfig[] = [];

        for (const d of discovered) {
          if (!existingIds.has(d.model_id)) {
            added.push({
              id: `${session?.user?.id || "host"}_${d.model_id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
              name: d.name || d.model_id,
              model_id: d.model_id,
              provider: d.provider,
              customUrl: d.customUrl,
              modality: "text",
              sharing_mode: "public",
              max_tokens: 2048,
              max_concurrent: 2,
              rate_limit_rpm: 30,
              daily_token_cap: 200000,
              auto_pause_gaming: true,
              context_length: 4096,
            });
          }
        }
        return [...prev, ...added];
      });
    } catch {
      toast({
        title: t("common.error"),
        description: t("models.noLocalModelsFound"),
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  }, [customEndpoints, session?.user?.id, t, toast, isDesktop]);

  useEffect(() => {
    if (isDesktop) {
      handleScanLocal();
    }
  }, [handleScanLocal, isDesktop]);

  // Start / update hosting whenever configured models change (desktop only)
  const handleSaveHostConfig = async (updated: LocalSharedModelConfig[]) => {
    if (!isDesktop) return;
    setConfiguredModels(updated);
    if (!session?.access_token) return;

    try {
      const activeShares = updated.filter((m) => m.id);
      await modelsHostRelay.startHosting(session.access_token, activeShares);

      await fetch("/api/models/host/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          enabled: true,
          masterPaused: hostState.masterPaused,
          models: updated,
          customEndpoints,
        }),
      });

      fetchSharedModels();
    } catch {
      toast({
        title: t("common.error"),
        description: "Failed to sync sharing config with relay",
        variant: "destructive",
      });
    }
  };

  // Toggle model sharing
  const toggleShareModel = (modelId: string, enabled: boolean) => {
    const updated = configuredModels.map((m) => {
      if (m.model_id === modelId) {
        return {
          ...m,
          sharing_mode: enabled ? ("public" as const) : ("private" as const),
        };
      }
      return m;
    });
    handleSaveHostConfig(updated);
  };

  // Toggle Pin
  const togglePinModel = async (modelId: string) => {
    if (!session?.access_token) {
      toast({
        title: t("common.error"),
        description: t("apps.signInToContinue"),
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/models/pinned", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPinnedModelIds(data.pinned || []);
        toast({
          title: data.isPinned ? t("models.copied") : t("common.success"),
          description: data.isPinned
            ? t("models.pinToMyModels")
            : t("models.unpinModel"),
        });
      }
    } catch {}
  };

  // Copy model ID
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered shared models
  const filteredSharedModels = useMemo(() => {
    return sharedModels.filter((m) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesId = m.model_id.toLowerCase().includes(q);
        const matchesHost = m.hostUsername.toLowerCase().includes(q);
        const matchesProvider = m.provider.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesHost && !matchesProvider)
          return false;
      }

      // Scope
      if (scopeFilter === "my-devices" && !m.isOwner) return false;
      if (scopeFilter === "friends" && !m.isFriend && !m.isOwner) return false;
      if (scopeFilter === "public" && m.sharing_mode !== "public") return false;
      if (scopeFilter === "pinned" && !pinnedModelIds.includes(m.id))
        return false;

      // Modality
      if (modalityFilter !== "all" && m.modality !== modalityFilter)
        return false;

      return true;
    });
  }, [sharedModels, searchQuery, scopeFilter, modalityFilter, pinnedModelIds]);

  // Execute Playground Chat or Embeddings
  const handleRunPlayground = async () => {
    if (!playgroundModelId) return;
    const targetModel = sharedModels.find((m) => m.id === playgroundModelId);
    if (!targetModel) return;

    const password = unlockedPasswords[playgroundModelId];

    if (targetModel.modality === "embeddings") {
      setIsPlaygroundRunning(true);
      setEmbeddingResult(null);
      try {
        const res = await fetch(
          `/api/models/shared/${encodeURIComponent(playgroundModelId)}/embeddings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: session?.access_token
                ? `Bearer ${session.access_token}`
                : "",
              "x-model-password": password || "",
            },
            body: JSON.stringify({ input: embeddingInput }),
          },
        );
        const data = await res.json();
        if (data.embeddings) {
          setEmbeddingResult(data.embeddings);
        } else {
          toast({
            title: t("common.error"),
            description: data.error || "Failed to generate embedding",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        toast({
          title: t("common.error"),
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsPlaygroundRunning(false);
      }
      return;
    }

    // Chat completion
    if (!playgroundPrompt.trim()) return;
    setIsPlaygroundRunning(true);
    setPlaygroundOutput("");
    setPlaygroundQueueStatus(null);

    try {
      const response = await fetch(
        `/api/models/shared/${encodeURIComponent(playgroundModelId)}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session?.access_token
              ? `Bearer ${session.access_token}`
              : "",
            "x-model-password": password || "",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: playgroundPrompt }],
            max_tokens: targetModel.max_tokens || 2048,
          }),
        },
      );

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to start streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const lns = block.split("\n");
          let ev = "message";
          let dt = "";
          for (const line of lns) {
            if (line.startsWith("event:")) ev = line.substring(6).trim();
            else if (line.startsWith("data:")) dt += line.substring(5).trim();
          }

          if (ev === "queue_status" && dt) {
            try {
              const q = JSON.parse(dt);
              setPlaygroundQueueStatus(q.message);
            } catch {}
          } else if (ev === "chunk" && dt) {
            setPlaygroundQueueStatus(null);
            try {
              const c = JSON.parse(dt);
              setPlaygroundOutput((prev) => prev + (c.chunk || ""));
            } catch {}
          } else if (ev === "error" && dt) {
            try {
              const e = JSON.parse(dt);
              setPlaygroundOutput((prev) => prev + `\n[Error: ${e.error}]`);
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setPlaygroundOutput(`[Error]: ${err.message}`);
    } finally {
      setIsPlaygroundRunning(false);
      setPlaygroundQueueStatus(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-900/30 via-cyan-900/20 to-slate-900/30 border border-sky-500/20 p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <Cpu className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  {t("models.title")}
                  <Badge
                    variant="outline"
                    className="border-sky-500/30 text-sky-400 bg-sky-500/10 text-xs"
                  >
                    P2P Relay
                  </Badge>
                </h1>
                <p className="text-sm text-slate-400">{t("models.subtitle")}</p>
              </div>
            </div>
          </div>

          {/* Quick Host Controls & Status (Desktop only) or Web Mode Indicator */}
          {isDesktop ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  hostState.isConnected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }
              >
                <Radio
                  className={`w-3.5 h-3.5 mr-1.5 ${hostState.isConnected ? "animate-pulse" : ""}`}
                />
                {hostState.isConnected
                  ? t("models.hostRelayConnected")
                  : t("models.hostRelayDisconnected")}
              </Badge>

              {hostState.isGaming && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-400 border-amber-500/30"
                >
                  <Gamepad2 className="w-3.5 h-3.5 mr-1.5" />
                  Gaming (Auto-Paused)
                </Badge>
              )}

              <Button
                variant={hostState.masterPaused ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const next = !hostState.masterPaused;
                  modelsHostRelay.setMasterPaused(next);
                }}
                className={
                  hostState.masterPaused
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "border-slate-700 hover:bg-slate-800"
                }
              >
                {hostState.masterPaused ? (
                  <>
                    <Play className="w-4 h-4 mr-1.5" />
                    {t("models.resumeSharing")}
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 mr-1.5" />
                    {t("models.masterPauseSharing")}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-xs"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                {t("models.webModeBadge")}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="border-sky-500/30 text-sky-400 hover:bg-sky-500/10 text-xs h-8"
              >
                <Link to="/download">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  {t("models.downloadDesktopApp")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-slate-900/60 border border-slate-800 p-1">
          <TabsTrigger
            value="browse"
            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300"
          >
            <Layers className="w-4 h-4 mr-2" />
            {t("models.browseTab")}
          </TabsTrigger>
          <TabsTrigger
            value="host"
            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300"
          >
            <Server className="w-4 h-4 mr-2" />
            {t("models.hostTab")}
            {!isDesktop && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-[10px] px-1 py-0 h-4 bg-slate-800 text-slate-400"
              >
                Desktop
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="pinned"
            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300"
          >
            <BookmarkCheck className="w-4 h-4 mr-2" />
            {t("models.pinnedTab")}
            {pinnedModelIds.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-xs px-1.5 py-0 h-4 bg-slate-800 text-sky-400"
              >
                {pinnedModelIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="playground"
            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("models.playgroundTab")}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: BROWSE SHARED MODELS                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="browse" className="space-y-4 pt-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder={t("models.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-900/60 border-slate-800 focus-visible:ring-sky-500"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <Select
                value={scopeFilter}
                onValueChange={(val: any) => setScopeFilter(val)}
              >
                <SelectTrigger className="w-[150px] bg-slate-900/60 border-slate-800">
                  <SelectValue placeholder={t("models.filterAll")} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="all">{t("models.filterAll")}</SelectItem>
                  <SelectItem value="my-devices">
                    {t("models.filterMyDevices")}
                  </SelectItem>
                  <SelectItem value="friends">
                    {t("models.filterFriends")}
                  </SelectItem>
                  <SelectItem value="public">
                    {t("models.filterPublic")}
                  </SelectItem>
                  <SelectItem value="pinned">
                    {t("models.filterPinned")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={modalityFilter}
                onValueChange={(val: any) => setModalityFilter(val)}
              >
                <SelectTrigger className="w-[140px] bg-slate-900/60 border-slate-800">
                  <SelectValue placeholder={t("models.modalityAll")} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="all">
                    {t("models.modalityAll")}
                  </SelectItem>
                  <SelectItem value="text">
                    {t("models.modalityText")}
                  </SelectItem>
                  <SelectItem value="vision">
                    {t("models.modalityVision")}
                  </SelectItem>
                  <SelectItem value="embeddings">
                    {t("models.modalityEmbeddings")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={fetchSharedModels}
                disabled={isLoadingShared}
                className="border-slate-800 bg-slate-900/60 hover:bg-slate-800"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoadingShared ? "animate-spin text-sky-400" : ""}`}
                />
              </Button>
            </div>
          </div>

          {/* Model Cards Grid */}
          {filteredSharedModels.length === 0 ? (
            <Card className="bg-slate-900/40 border-slate-800 text-center py-12">
              <CardContent className="space-y-3">
                <Cpu className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-base">
                  {t("models.noModelsFound")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("host")}
                  className="border-slate-700 hover:bg-slate-800"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  {t("models.startSharingPrompt")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSharedModels.map((model) => {
                const isPinned = pinnedModelIds.includes(model.id);
                const hasUnlocked = !!unlockedPasswords[model.id];
                const needsPassword =
                  model.has_password && !hasUnlocked && !model.isOwner;

                return (
                  <Card
                    key={model.id}
                    className="bg-slate-900/50 border-slate-800 hover:border-sky-500/40 transition-all flex flex-col justify-between"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                            {model.name}
                            {model.has_password && (
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-400 flex items-center gap-1.5">
                            <span>by {model.hostUsername}</span>
                            {model.isOwner && (
                              <Badge className="text-[10px] px-1 py-0 bg-sky-500/20 text-sky-400 border-none">
                                You
                              </Badge>
                            )}
                            {model.isFriend && !model.isOwner && (
                              <Badge className="text-[10px] px-1 py-0 bg-emerald-500/20 text-emerald-400 border-none">
                                Friend
                              </Badge>
                            )}
                          </CardDescription>
                        </div>

                        {/* Status Badge */}
                        <Badge
                          variant="outline"
                          className={
                            model.status === "online"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                              : model.status === "busy"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
                                : "bg-slate-800 text-slate-400 border-slate-700 text-xs"
                          }
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              model.status === "online"
                                ? "bg-emerald-400 animate-pulse"
                                : model.status === "busy"
                                  ? "bg-amber-400"
                                  : "bg-slate-500"
                            }`}
                          />
                          {model.status === "online"
                            ? t("models.statusOnline")
                            : model.status === "busy"
                              ? t("models.statusBusy")
                              : t("models.statusPaused")}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 text-xs text-slate-400">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant="secondary"
                          className="bg-slate-800 text-slate-300 text-[11px]"
                        >
                          {model.provider.toUpperCase()}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-sky-950/40 text-sky-400 border border-sky-800/40 text-[11px]"
                        >
                          {model.modality.toUpperCase()}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-slate-700 text-[11px]"
                        >
                          {model.max_tokens} tokens
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-slate-500" />
                          Concurrent: {model.activeRequests}/
                          {model.max_concurrent}
                        </span>
                        {model.queueLength > 0 && (
                          <span className="text-amber-400">
                            Queue: {model.queueLength}
                          </span>
                        )}
                      </div>
                    </CardContent>

                    <CardFooter className="pt-2 border-t border-slate-800/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePinModel(model.id)}
                          className={
                            isPinned
                              ? "text-sky-400 hover:text-sky-300 h-8 px-2.5"
                              : "text-slate-400 hover:text-white h-8 px-2.5"
                          }
                        >
                          {isPinned ? (
                            <>
                              <BookmarkCheck className="w-4 h-4 mr-1 text-sky-400" />
                              {t("models.filterPinned")}
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-4 h-4 mr-1" />
                              Pin
                            </>
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyId(model.id)}
                          className="h-8 w-8 text-slate-400 hover:text-white"
                          title={t("models.copyId")}
                        >
                          {copiedId === model.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (needsPassword) {
                            setUnlockingModel(model);
                            setEnteredPassword("");
                          } else {
                            setPlaygroundModelId(model.id);
                            setActiveTab("playground");
                          }
                        }}
                        className="h-8 border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                      >
                        {needsPassword ? (
                          <>
                            <Lock className="w-3.5 h-3.5 mr-1" />
                            Unlock
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 mr-1" />
                            {t("models.testInPlayground")}
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: HOST LOCAL MODELS                                          */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="host" className="space-y-6 pt-4">
          {!isDesktop ? (
            <div className="w-full min-h-[460px] flex items-center justify-center p-4 sm:p-8">
              <Card className="max-w-xl w-full bg-slate-900/90 border-slate-800 text-center backdrop-blur shadow-2xl p-6 sm:p-10">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-6 text-sky-400 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
                  <Cpu className="w-10 h-10 animate-pulse" />
                </div>

                <CardTitle className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
                  {t("models.desktopRequiredHostTitle")}
                </CardTitle>

                <CardDescription className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
                  {t("models.desktopRequiredHostDesc")}
                </CardDescription>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    asChild
                    className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-lg shadow-sky-500/20 text-sm rounded-lg"
                  >
                    <Link to="/download">
                      <Download className="w-4 h-4 mr-2" />
                      {t("models.downloadDesktopApp")}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("browse")}
                    className="w-full sm:w-auto px-6 py-2.5 border-slate-700 hover:bg-slate-800 text-slate-300 text-sm rounded-lg"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    {t("models.browseModelsAction")}
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <>
              {/* Host Protection & Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">
                  {t("models.activeRequests")}
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-sky-400" />
                  {hostState.activeRequests}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">
                  {t("models.totalServed")}
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-400" />
                  {hostState.totalRequests}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">
                  {t("models.tokensServed")}
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  {hostState.totalTokens.toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">
                  {t("models.autoPauseGaming")}
                </CardDescription>
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-indigo-400" />
                  {hostState.isGaming ? "Active Game (Paused)" : "Monitoring"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Local Engines Discovery & Action Bar */}
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg text-white">
                    {t("models.hostLocalModelsTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("models.hostLocalModelsDesc")}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleScanLocal}
                  disabled={isScanning}
                  className="border-slate-700 bg-slate-800/80 hover:bg-slate-800"
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${isScanning ? "animate-spin text-sky-400" : ""}`}
                  />
                  {isScanning
                    ? t("models.scanning")
                    : t("models.scanLocalModels")}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Add Custom Endpoint */}
              <div className="flex gap-2">
                <Input
                  placeholder={t("models.endpointUrlPlaceholder")}
                  value={newEndpointUrl}
                  onChange={(e) => setNewEndpointUrl(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (
                      newEndpointUrl.trim() &&
                      !customEndpoints.includes(newEndpointUrl.trim())
                    ) {
                      setCustomEndpoints((prev) => [
                        ...prev,
                        newEndpointUrl.trim(),
                      ]);
                      setNewEndpointUrl("");
                      handleScanLocal();
                    }
                  }}
                  className="whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {t("models.addCustomEndpoint")}
                </Button>
              </div>

              {/* Models List */}
              <div className="space-y-3 pt-2">
                {configuredModels.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    {t("models.noLocalModelsFound")}
                  </div>
                ) : (
                  configuredModels.map((model) => {
                    const isShared = model.sharing_mode !== "private";

                    return (
                      <div
                        key={model.model_id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 gap-3 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">
                              {model.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] border-slate-700 text-slate-400"
                            >
                              {model.provider.toUpperCase()}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-slate-800 text-sky-400"
                            >
                              {model.modality.toUpperCase()}
                            </Badge>
                            {model.sharing_mode === "password" && (
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {model.model_id} • Max: {model.max_tokens} tokens •
                            Limit: {model.rate_limit_rpm} RPM
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingModel({ ...model });
                              setIsEditModalOpen(true);
                            }}
                            className="h-8 text-xs border border-slate-800 hover:bg-slate-800 text-slate-300"
                          >
                            <Sliders className="w-3.5 h-3.5 mr-1.5" />
                            {t("models.configureModel")}
                          </Button>

                          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                            <Switch
                              checked={isShared}
                              onCheckedChange={(checked) =>
                                toggleShareModel(model.model_id, checked)
                              }
                            />
                            <Label className="text-xs cursor-pointer">
                              {isShared
                                ? t("models.sharingEnabled")
                                : t("models.sharingDisabled")}
                            </Label>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Activity Log */}
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                {t("models.liveActivityLog")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48 rounded-md border border-slate-800 p-3 bg-slate-950/40 font-mono text-xs">
                {hostState.logs.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">
                    {t("models.noActivityLogs")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {hostState.logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between text-[11px] border-b border-slate-900 pb-1.5"
                      >
                        <span className="text-slate-500">[{log.timestamp}]</span>
                        <span className="text-sky-300 font-semibold">
                          {log.modelName}
                        </span>
                        <span className="text-slate-400 uppercase">
                          {log.type}
                        </span>
                        {log.tokens !== undefined && (
                          <span className="text-amber-400">
                            {log.tokens} tok
                          </span>
                        )}
                        {log.durationMs !== undefined && (
                          <span className="text-slate-400">
                            {log.durationMs}ms
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            log.status === "success"
                              ? "text-emerald-400 border-emerald-500/30 text-[10px]"
                              : log.status === "error"
                                ? "text-rose-400 border-rose-500/30 text-[10px]"
                                : "text-amber-400 border-amber-500/30 text-[10px]"
                          }
                        >
                          {log.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
            </>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: PINNED MODELS                                              */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="pinned" className="space-y-4 pt-4">
          <div className="p-4 rounded-lg bg-sky-950/20 border border-sky-800/30 text-xs text-sky-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p>
              Pinned models are saved to your account and automatically appear
              in the Model selection dropdowns inside <strong>Chatbot</strong>,{" "}
              <strong>LLM Agent</strong>, and other tools across Oxygen Low's
              Software.
            </p>
          </div>

          {pinnedModelIds.length === 0 ? (
            <Card className="bg-slate-900/40 border-slate-800 text-center py-12">
              <CardContent className="space-y-2">
                <Bookmark className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">
                  {t("models.noPinnedModels")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("browse")}
                  className="border-slate-700 hover:bg-slate-800"
                >
                  {t("models.browseTab")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedModels
                .filter((m) => pinnedModelIds.includes(m.id))
                .map((model) => (
                  <Card
                    key={model.id}
                    className="bg-slate-900/50 border-slate-800 hover:border-sky-500/40 transition-all"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-base text-white">
                          {model.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={
                            model.status === "online"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                              : "bg-slate-800 text-slate-400 border-slate-700 text-xs"
                          }
                        >
                          {model.status}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-slate-400">
                        Shared by {model.hostUsername}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-2 flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePinModel(model.id)}
                        className="text-rose-400 hover:text-rose-300 h-8 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {t("models.unpinModel")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPlaygroundModelId(model.id);
                          setActiveTab("playground");
                        }}
                        className="h-8 text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/20"
                      >
                        <Play className="w-3.5 h-3.5 mr-1" />
                        {t("models.testInPlayground")}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: PLAYGROUND / TESTING                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="playground" className="space-y-4 pt-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sky-400" />
                  {t("models.playgroundTitle")}
                </CardTitle>

                {/* Select Model */}
                <Select
                  value={playgroundModelId}
                  onValueChange={setPlaygroundModelId}
                >
                  <SelectTrigger className="w-full sm:w-[260px] bg-slate-900 border-slate-800">
                    <SelectValue placeholder="Select a shared model..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {sharedModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.hostUsername})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Selected Model Details */}
              {playgroundModelId && (
                <div className="text-xs text-slate-400 flex items-center gap-3 p-2.5 rounded bg-slate-950/50 border border-slate-800">
                  <span>
                    Host:{" "}
                    <strong className="text-white">
                      {
                        sharedModels.find((m) => m.id === playgroundModelId)
                          ?.hostUsername
                      }
                    </strong>
                  </span>
                  <span>
                    Modality:{" "}
                    <strong className="text-sky-400">
                      {sharedModels
                        .find((m) => m.id === playgroundModelId)
                        ?.modality.toUpperCase()}
                    </strong>
                  </span>
                  <span>
                    Tokens:{" "}
                    <strong className="text-white">
                      {
                        sharedModels.find((m) => m.id === playgroundModelId)
                          ?.max_tokens
                      }
                    </strong>
                  </span>
                </div>
              )}

              {/* Chat Interface or Embeddings Test */}
              {sharedModels.find((m) => m.id === playgroundModelId)?.modality ===
              "embeddings" ? (
                <div className="space-y-3">
                  <Label className="text-xs text-slate-300">
                    {t("models.inputEmbeddingText")}
                  </Label>
                  <Input
                    value={embeddingInput}
                    onChange={(e) => setEmbeddingInput(e.target.value)}
                    placeholder="Enter sentence to convert to vector embedding..."
                    className="bg-slate-950/60 border-slate-800"
                  />
                  <Button
                    onClick={handleRunPlayground}
                    disabled={isPlaygroundRunning || !embeddingInput.trim()}
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {isPlaygroundRunning ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {t("models.testEmbeddings")}
                  </Button>

                  {embeddingResult && (
                    <div className="mt-4 p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <span>
                          Dimensions: <strong>{embeddingResult.length}</strong>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              JSON.stringify(embeddingResult),
                            );
                            toast({ title: t("models.copied") });
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy Vector
                        </Button>
                      </div>
                      <ScrollArea className="h-32 text-[11px] font-mono text-slate-300">
                        {JSON.stringify(embeddingResult)}
                      </ScrollArea>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {playgroundQueueStatus && (
                    <div className="flex items-center gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-pulse">
                      <Clock className="w-4 h-4 shrink-0" />
                      {playgroundQueueStatus}
                    </div>
                  )}

                  {/* Output Box */}
                  <ScrollArea className="h-64 rounded-md border border-slate-800 p-4 bg-slate-950/60 font-mono text-xs whitespace-pre-wrap text-slate-200">
                    {playgroundOutput || (
                      <span className="text-slate-600">
                        {t("models.playgroundPromptPlaceholder")}
                      </span>
                    )}
                  </ScrollArea>

                  {/* Input & Send */}
                  <div className="flex gap-2">
                    <Input
                      value={playgroundPrompt}
                      onChange={(e) => setPlaygroundPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleRunPlayground();
                        }
                      }}
                      placeholder={t("models.playgroundPromptPlaceholder")}
                      disabled={isPlaygroundRunning}
                      className="bg-slate-950/60 border-slate-800"
                    />
                    <Button
                      onClick={handleRunPlayground}
                      disabled={isPlaygroundRunning || !playgroundPrompt.trim()}
                      className="bg-sky-600 hover:bg-sky-700 text-white"
                    >
                      {isPlaygroundRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: CONFIGURE MODEL (Host Side)                                 */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{t("models.configureModel")}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingModel?.model_id}
            </DialogDescription>
          </DialogHeader>

          {editingModel && (
            <div className="space-y-4 py-2 text-xs">
              {/* Friendly Name */}
              <div className="space-y-1.5">
                <Label>{t("common.edit")} Name</Label>
                <Input
                  value={editingModel.name}
                  onChange={(e) =>
                    setEditingModel({ ...editingModel, name: e.target.value })
                  }
                  className="bg-slate-950 border-slate-800"
                />
              </div>

              {/* Modality */}
              <div className="space-y-1.5">
                <Label>Modality</Label>
                <Select
                  value={editingModel.modality}
                  onValueChange={(val: any) =>
                    setEditingModel({ ...editingModel, modality: val })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="text">
                      {t("models.modalityText")}
                    </SelectItem>
                    <SelectItem value="vision">
                      {t("models.modalityVision")}
                    </SelectItem>
                    <SelectItem value="embeddings">
                      {t("models.modalityEmbeddings")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sharing Mode */}
              <div className="space-y-1.5">
                <Label>{t("models.accessMode")}</Label>
                <Select
                  value={editingModel.sharing_mode}
                  onValueChange={(val: any) =>
                    setEditingModel({ ...editingModel, sharing_mode: val })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="public">
                      {t("models.accessModePublic")}
                    </SelectItem>
                    <SelectItem value="friends">
                      {t("models.accessModeFriends")}
                    </SelectItem>
                    <SelectItem value="private">
                      {t("models.accessModePrivate")}
                    </SelectItem>
                    <SelectItem value="password">
                      {t("models.accessModePassword")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Optional Password */}
              {editingModel.sharing_mode === "password" && (
                <div className="space-y-1.5">
                  <Label>{t("models.modelPassword")}</Label>
                  <Input
                    type="password"
                    placeholder="Enter access code..."
                    value={editingModel.password || ""}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        password: e.target.value,
                      })
                    }
                    className="bg-slate-950 border-slate-800"
                  />
                </div>
              )}

              {/* Limits: Concurrency & Max Tokens */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label>
                    {t("models.maxConcurrentRequests")}:{" "}
                    {editingModel.max_concurrent}
                  </Label>
                  <Slider
                    value={[editingModel.max_concurrent]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([val]) =>
                      setEditingModel({
                        ...editingModel,
                        max_concurrent: val,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("models.maxOutputTokens")}: {editingModel.max_tokens}
                  </Label>
                  <Slider
                    value={[editingModel.max_tokens]}
                    min={256}
                    max={8192}
                    step={256}
                    onValueChange={([val]) =>
                      setEditingModel({ ...editingModel, max_tokens: val })
                    }
                  />
                </div>
              </div>

              {/* Rate limit & Daily Cap */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label>{t("models.rateLimitRpm")}</Label>
                  <Input
                    type="number"
                    value={editingModel.rate_limit_rpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        rate_limit_rpm: Number(e.target.value) || 30,
                      })
                    }
                    className="bg-slate-950 border-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("models.dailyTokenCap")}</Label>
                  <Input
                    type="number"
                    value={editingModel.daily_token_cap}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        daily_token_cap: Number(e.target.value) || 200000,
                      })
                    }
                    className="bg-slate-950 border-slate-800"
                  />
                </div>
              </div>

              {/* Auto Pause Gaming */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div>
                  <Label className="text-xs">
                    {t("models.autoPauseGaming")}
                  </Label>
                  <p className="text-[10px] text-slate-500">
                    {t("models.autoPauseGamingDesc")}
                  </p>
                </div>
                <Switch
                  checked={editingModel.auto_pause_gaming}
                  onCheckedChange={(checked) =>
                    setEditingModel({
                      ...editingModel,
                      auto_pause_gaming: checked,
                    })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              className="border-slate-800"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editingModel) {
                  const updated = configuredModels.map((m) =>
                    m.model_id === editingModel.model_id ? editingModel : m,
                  );
                  handleSaveHostConfig(updated);
                  setIsEditModalOpen(false);
                  toast({ title: t("models.settingsSaved") });
                }
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {t("models.saveConfiguration")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: UNLOCK PASSWORD PROTECTED MODEL                              */}
      {/* -------------------------------------------------------------------- */}
      <Dialog
        open={!!unlockingModel}
        onOpenChange={(open) => {
          if (!open) setUnlockingModel(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              {t("models.passwordProtected")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t("models.enterPasswordPrompt")} for{" "}
              <strong>{unlockingModel?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <Input
              type="password"
              placeholder={t("models.passwordPlaceholder")}
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && unlockingModel) {
                  setUnlockedPasswords((prev) => ({
                    ...prev,
                    [unlockingModel.id]: enteredPassword,
                  }));
                  setPlaygroundModelId(unlockingModel.id);
                  setUnlockingModel(null);
                  setActiveTab("playground");
                }
              }}
              className="bg-slate-950 border-slate-800"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlockingModel(null)}
              className="border-slate-800"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (unlockingModel) {
                  setUnlockedPasswords((prev) => ({
                    ...prev,
                    [unlockingModel.id]: enteredPassword,
                  }));
                  setPlaygroundModelId(unlockingModel.id);
                  setUnlockingModel(null);
                  setActiveTab("playground");
                }
              }}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {t("models.submitPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ModelsApp() {
  return <Models />;
}

export default ModelsApp;
