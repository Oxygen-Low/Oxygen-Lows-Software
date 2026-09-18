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
  EyeOff,
  Key,
  ExternalLink,
  Globe,
  ShieldCheck,
  Bookmark,
  BookmarkCheck,
  Radio,
  Send,
  Loader2,
  ChevronRight,
  Sliders,
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
import { isDesktopHostAvailable } from "@/lib/desktopBridge";
import {
  modelsHostRelay,
  LocalSharedModelConfig,
  RelayActivityLog,
  HostRelayState,
} from "@/lib/modelsHostRelay";
import {
  useAiModels,
  SUPPORTED_PROVIDERS,
  POPULAR_PRESETS,
  type ProviderInfo,
  type Model,
} from "@/hooks/useAiModels";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";

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
  status: "online" | "busy" | "paused" | "disabled";
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

  const {
    models: allModels,
    selectedModel,
    selectedProvider,
    setSelectedModel,
    setSelectedProvider,
    addCustomModel,
    removeCustomModel,
    refreshModels,
    encryptedKeys,
    decryptedKeys,
    isMasterKeyActive,
    loadApiKeys,
    saveProviderApiKey,
    removeProviderApiKey,
    getDecryptedApiKey,
    fetchProviderModels,
  } = useAiModels();

  const [activeTab, setActiveTab] = useState<string>("custom");
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<
    "all" | "my-devices" | "friends" | "public" | "pinned"
  >("all");
  const [modalityFilter, setModalityFilter] = useState<
    "all" | "text" | "vision" | "embeddings"
  >("all");

  // Key Configuration Dialog State
  const [selectedProviderCard, setSelectedProviderCard] =
    useState<ProviderInfo | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyInputValue, setKeyInputValue] = useState("");
  const [showKeyPassword, setShowKeyPassword] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaveError, setKeySaveError] = useState<string | null>(null);

  // Master key unlock modal state
  const [isUnlockPromptOpen, setIsUnlockPromptOpen] = useState(false);

  // Add custom model form state
  const [newModelProvider, setNewModelProvider] = useState<string>("openai");
  const [newModelPreset, setNewModelPreset] = useState<string>("gpt-4o");
  const [newModelId, setNewModelId] = useState<string>("gpt-4o");
  const [newModelName, setNewModelName] = useState<string>("GPT-4o (Omni)");
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [addModelError, setAddModelError] = useState<string | null>(null);

  // Remote models fetching state
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);
  const [fetchedRemoteModels, setFetchedRemoteModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [fetchedModelsSearch, setFetchedModelsSearch] = useState("");
  const [fetchRemoteError, setFetchRemoteError] = useState<string | null>(null);

  // Delete custom model confirmation
  const [customModelToDelete, setCustomModelToDelete] =
    useState<Model | null>(null);
  const [isDeletingCustomModel, setIsDeletingCustomModel] = useState(false);

  // Filter for registered custom models
  const [customProviderFilter, setCustomProviderFilter] =
    useState<string>("all");
  const [customSearchQuery, setCustomSearchQuery] = useState<string>("");

  const registeredCustomModels = useMemo(() => {
    return allModels.filter((m) => m.isCustom && !m.isShared);
  }, [allModels]);

  const filteredCustomModels = useMemo(() => {
    return registeredCustomModels.filter((m) => {
      const matchesProv =
        customProviderFilter === "all" ||
        m.provider.toLowerCase() === customProviderFilter.toLowerCase();
      const matchesQ =
        !customSearchQuery.trim() ||
        (m.name &&
          m.name.toLowerCase().includes(customSearchQuery.toLowerCase())) ||
        m.model_id.toLowerCase().includes(customSearchQuery.toLowerCase()) ||
        m.provider.toLowerCase().includes(customSearchQuery.toLowerCase());
      return matchesProv && matchesQ;
    });
  }, [registeredCustomModels, customProviderFilter, customSearchQuery]);

  const handleProviderSelectChange = (providerId: string) => {
    setNewModelProvider(providerId);
    const presets = POPULAR_PRESETS[providerId] || [];
    if (presets.length > 0) {
      setNewModelPreset(presets[0].model_id);
      setNewModelId(presets[0].model_id);
      setNewModelName(presets[0].name);
    } else {
      setNewModelPreset("custom");
      setNewModelId("");
      setNewModelName("");
    }
  };

  const handlePresetSelectChange = (presetId: string) => {
    setNewModelPreset(presetId);
    if (presetId === "custom") {
      setNewModelId("");
      setNewModelName("");
    } else {
      const found = (POPULAR_PRESETS[newModelProvider] || []).find(
        (p) => p.model_id === presetId,
      );
      if (found) {
        setNewModelId(found.model_id);
        setNewModelName(found.name);
      } else {
        setNewModelId(presetId);
        setNewModelName(presetId);
      }
    }
  };

  const handleOpenKeyModal = (provider: ProviderInfo) => {
    setSelectedProviderCard(provider);
    const existing = decryptedKeys[provider.id.toLowerCase()] || "";
    setKeyInputValue(existing);
    setShowKeyPassword(false);
    setKeySaveError(null);
    setKeyModalOpen(true);
  };

  const handleSaveApiKey = async () => {
    if (!selectedProviderCard) return;
    if (selectedProviderCard.requiresKey && !keyInputValue.trim()) {
      setKeySaveError("API Key is required for this provider");
      return;
    }
    setIsSavingKey(true);
    setKeySaveError(null);
    try {
      const res = await saveProviderApiKey(
        selectedProviderCard.id,
        keyInputValue,
      );
      if (!res.success) {
        setKeySaveError(res.error || "Failed to save key");
      } else {
        toast({
          title: t(
            "models.apiKeyEncryptedSaved",
            undefined,
            "API key encrypted and saved securely!",
          ),
        });
        setKeyModalOpen(false);
      }
    } catch (e: any) {
      setKeySaveError(e?.message || "Failed to save key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!selectedProviderCard) return;
    setIsSavingKey(true);
    setKeySaveError(null);
    try {
      const res = await removeProviderApiKey(selectedProviderCard.id);
      if (!res.success) {
        setKeySaveError(res.error || "Failed to remove key");
      } else {
        toast({
          title: t("models.apiKeyRemoved", undefined, "API key removed."),
        });
        setKeyModalOpen(false);
      }
    } catch (e: any) {
      setKeySaveError(e?.message || "Failed to remove key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleOpenFetchModels = async (providerId: string) => {
    setFetchRemoteError(null);
    setFetchedRemoteModels([]);
    setFetchedModelsSearch("");
    setIsFetchModalOpen(true);
    setIsFetchingRemote(true);
    try {
      const res = await fetchProviderModels(providerId);
      if (res.error) {
        setFetchRemoteError(res.error);
      } else {
        setFetchedRemoteModels(res.models || []);
      }
    } catch (err: any) {
      setFetchRemoteError(err?.message || "Failed to fetch models");
    } finally {
      setIsFetchingRemote(false);
    }
  };

  const handleSelectFetchedModel = (item: { id: string; name: string }) => {
    setNewModelPreset("custom");
    setNewModelId(item.id);
    setNewModelName(item.name || item.id);
    setIsFetchModalOpen(false);
  };

  const handleAddCustomModelSubmit = async () => {
    if (!newModelId.trim()) {
      setAddModelError("Model ID is required");
      return;
    }
    setIsAddingModel(true);
    setAddModelError(null);
    try {
      const res = await addCustomModel(
        newModelProvider,
        newModelId.trim(),
        newModelName.trim() || undefined,
      );
      if (!res.success) {
        setAddModelError(res.error || "Failed to register model");
      } else {
        toast({
          title: t(
            "models.modelRegisteredSuccess",
            undefined,
            "Custom model registered successfully!",
          ),
        });
        setNewModelId("");
        setNewModelName("");
      }
    } catch (e: any) {
      setAddModelError(e?.message || "Failed to register model");
    } finally {
      setIsAddingModel(false);
    }
  };

  const handleDeleteCustomModel = async () => {
    if (!customModelToDelete) return;
    setIsDeletingCustomModel(true);
    try {
      const res = await removeCustomModel(
        customModelToDelete.provider,
        customModelToDelete.model_id,
      );
      if (!res.success) {
        toast({
          title: t("common.error"),
          description: res.error || "Failed to delete model",
          variant: "destructive",
        });
      } else {
        toast({
          title: t(
            "models.modelDeletedSuccess",
            undefined,
            "Custom model deleted successfully.",
          ),
        });
        setCustomModelToDelete(null);
      }
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message || "Failed to delete model",
        variant: "destructive",
      });
    } finally {
      setIsDeletingCustomModel(false);
    }
  };

  const handleTestInPlayground = (model: Model) => {
    setPlaygroundModelId(`${model.provider}:${model.model_id}`);
    setActiveTab("playground");
  };

  // Shared models from server
  const [sharedModels, setSharedModels] = useState<SharedModelItem[]>([]);
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);

  // Desktop bridge detection: model hosting is a desktop-only capability
  const isDesktop = isDesktopHostAvailable();

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

  const selectedPlaygroundModel = useMemo(
    () => sharedModels.find((m) => m.id === playgroundModelId),
    [sharedModels, playgroundModelId],
  );
  const isPlaygroundModelDisabled =
    selectedPlaygroundModel?.status === "disabled";

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
            if (Array.isArray(data.models)) {
              setConfiguredModels(data.models);
              if (data.models.length > 0) {
                modelsHostRelay.startHosting(session.access_token, data.models);
              }
            }
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
              enabled: true,
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
          enabled,
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

    // Check if custom or cloud model
    const customMatch = allModels.find(
      (m) =>
        `${m.provider}:${m.model_id}` === playgroundModelId ||
        m.model_id === playgroundModelId,
    );

    if (customMatch && customMatch.provider !== "shared-model") {
      if (!playgroundPrompt.trim()) return;
      setIsPlaygroundRunning(true);
      setPlaygroundOutput("");
      setPlaygroundQueueStatus(null);

      try {
        const prov = customMatch.provider;
        const mid = customMatch.model_id;
        const key = getDecryptedApiKey(prov);

        const response = await fetch("/api/ai/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session?.access_token
              ? `Bearer ${session.access_token}`
              : "",
          },
          body: JSON.stringify({
            provider: prov,
            model: mid,
            messages: [{ role: "user", content: playgroundPrompt }],
            stream: true,
            apiKey: key || undefined,
          }),
        });

        if (!response.ok || !response.body) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData.error || `HTTP ${response.status}: Generation failed`,
          );
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
            for (const line of lns) {
              if (line.startsWith("data:")) {
                const dataStr = line.slice(5).trim();
                if (dataStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(dataStr);
                  const content =
                    parsed.choices?.[0]?.delta?.content ||
                    parsed.choices?.[0]?.text ||
                    "";
                  if (content) {
                    setPlaygroundOutput((prev) => prev + content);
                  }
                } catch {}
              }
            }
          }
        }
      } catch (err: any) {
        setPlaygroundOutput(`[Error]: ${err.message}`);
      } finally {
        setIsPlaygroundRunning(false);
      }
      return;
    }

    const targetModel = sharedModels.find((m) => m.id === playgroundModelId);
    if (!targetModel || targetModel.status === "disabled") return;

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
                </h1>
                <p className="text-sm text-slate-400">{t("models.subtitle")}</p>
              </div>
            </div>
          </div>

          {/* Quick Host Controls & Status (Desktop only) */}
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
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full max-w-3xl bg-slate-900/60 border border-slate-800 p-1">
          <TabsTrigger
            value="custom"
            className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300"
          >
            <Cpu className="w-4 h-4 mr-2" />
            {t("models.customModelsTab", undefined, "Custom Models")}
            {registeredCustomModels.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 text-xs px-1.5 py-0 h-4 bg-slate-800 text-sky-400"
              >
                {registeredCustomModels.length}
              </Badge>
            )}
          </TabsTrigger>
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
        {/* TAB 0: CUSTOM MODELS (BYO API KEYS & MODELS)                      */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="custom" className="space-y-6 pt-4">
          {/* Zero-Knowledge Master Key Status Card */}
          <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg border ${
                    isMasterKeyActive
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                >
                  {isMasterKeyActive ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {isMasterKeyActive
                        ? t(
                            "models.zeroKnowledgeActive",
                            undefined,
                            "Zero-Knowledge Encryption Active",
                          )
                        : t(
                            "models.sessionLocked",
                            undefined,
                            "Master Key Locked",
                          )}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        isMasterKeyActive
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-950/20"
                          : "border-amber-500/30 text-amber-400 bg-amber-950/20"
                      }`}
                    >
                      {isMasterKeyActive ? "AES-256-GCM" : "Locked"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isMasterKeyActive
                      ? t(
                          "models.zeroKnowledgeDesc",
                          undefined,
                          "Your API keys are encrypted client-side with AES-256-GCM before saving to your account. Plaintext keys are never stored on the server.",
                        )
                      : t(
                          "models.sessionLockedDesc",
                          undefined,
                          "Unlock your Master Key to input, encrypt, or manage private provider API keys.",
                        )}
                  </p>
                </div>
              </div>

              {!isMasterKeyActive && (
                <Button
                  size="sm"
                  onClick={() => setIsUnlockPromptOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs gap-1.5"
                >
                  <Key className="w-3.5 h-3.5" />
                  {t(
                    "models.unlockMasterKey",
                    undefined,
                    "Unlock Master Key",
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Supported Providers Grid */}
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                AI Providers & Credentials
              </h2>
              <p className="text-xs text-slate-400">
                Input your private provider API keys to encrypt and store securely with Zero-Knowledge encryption.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SUPPORTED_PROVIDERS.map((prov) => {
                const isConfigured =
                  !prov.requiresKey ||
                  !!encryptedKeys[prov.id.toLowerCase()] ||
                  !!decryptedKeys[prov.id.toLowerCase()];
                const modelCount = registeredCustomModels.filter(
                  (m) => m.provider.toLowerCase() === prov.id.toLowerCase(),
                ).length;

                return (
                  <Card
                    key={prov.id}
                    className="bg-slate-900/50 border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between"
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                          {prov.name}
                        </CardTitle>
                        {prov.requiresKey ? (
                          isConfigured ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1 py-0"
                            >
                              <Check className="w-2.5 h-2.5" />
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] py-0"
                            >
                              Key Needed
                            </Badge>
                          )
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-sky-500/40 bg-sky-500/10 text-sky-400 text-[10px] py-0"
                          >
                            Keyless Free
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {prov.description}
                      </CardDescription>
                    </CardHeader>

                    <CardFooter className="p-4 pt-2 flex items-center justify-between gap-2 border-t border-slate-800/50">
                      <span className="text-[11px] text-slate-400">
                        {modelCount} {modelCount === 1 ? "model" : "models"}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenKeyModal(prov)}
                          className="h-7 text-xs px-2.5 text-sky-400 hover:text-sky-300 hover:bg-sky-950/30"
                        >
                          <Key className="w-3 h-3 mr-1" />
                          {prov.requiresKey
                            ? isConfigured
                              ? "Edit Key"
                              : "Enter Key"
                            : "Set Key"}
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Register Custom Model Card */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                {t(
                  "models.addCustomModelTitle",
                  undefined,
                  "Register Custom Model",
                )}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {t(
                  "models.addCustomModelDesc",
                  undefined,
                  "Add custom models from OpenAI, Anthropic, Gemini, OpenRouter, Grok, or Pollinations.",
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Provider Select */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">
                    {t("models.selectProvider", undefined, "Provider")}
                  </Label>
                  <Select
                    value={newModelProvider}
                    onValueChange={handleProviderSelectChange}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {SUPPORTED_PROVIDERS.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Model Preset Select */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">
                    {t("models.modelPreset", undefined, "Model Preset")}
                  </Label>
                  <Select
                    value={newModelPreset}
                    onValueChange={handlePresetSelectChange}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[220px]">
                      {(POPULAR_PRESETS[newModelProvider] || []).map((preset) => (
                        <SelectItem
                          key={preset.model_id}
                          value={preset.model_id}
                          className="text-xs"
                        >
                          {preset.name}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value="custom"
                        className="text-xs font-semibold text-sky-400"
                      >
                        +{" "}
                        {t(
                          "models.customModelPreset",
                          undefined,
                          "Custom Model ID...",
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. Model ID / Name Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">
                      {t("models.modelId", undefined, "Model ID / Name")}{" "}
                      <span className="text-red-400">*</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => handleOpenFetchModels(newModelProvider)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Fetch List
                    </button>
                  </div>
                  <Input
                    value={newModelId}
                    onChange={(e) => {
                      setNewModelId(e.target.value);
                      setAddModelError(null);
                    }}
                    placeholder="e.g. gpt-4o, claude-3-7-sonnet"
                    className="bg-slate-950 border-slate-800 text-xs h-9 font-mono"
                  />
                </div>

                {/* 4. Display Name Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">
                    {t(
                      "models.displayName",
                      undefined,
                      "Display Name (Optional)",
                    )}
                  </Label>
                  <Input
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="e.g. GPT-4o (Omni)"
                    className="bg-slate-950 border-slate-800 text-xs h-9"
                  />
                </div>
              </div>

              {addModelError && (
                <p className="text-xs text-red-400 font-medium">{addModelError}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  onClick={handleAddCustomModelSubmit}
                  disabled={isAddingModel || !newModelId.trim()}
                  className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-9"
                >
                  {isAddingModel ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1.5" />
                  )}
                  {t(
                    "models.registerModelButton",
                    undefined,
                    "Register Custom Model",
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Registered Custom Models List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  {t(
                    "models.registeredCustomModels",
                    undefined,
                    "Registered Custom Models",
                  )}
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-slate-800 text-sky-300"
                  >
                    {filteredCustomModels.length}
                  </Badge>
                </h3>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="relative w-44">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <Input
                    placeholder="Filter models..."
                    value={customSearchQuery}
                    onChange={(e) => setCustomSearchQuery(e.target.value)}
                    className="bg-slate-950 border-slate-800 pl-8 h-8 text-xs"
                  />
                </div>

                <Select
                  value={customProviderFilter}
                  onValueChange={setCustomProviderFilter}
                >
                  <SelectTrigger className="w-32 bg-slate-950 border-slate-800 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    <SelectItem value="all" className="text-xs">
                      All Providers
                    </SelectItem>
                    {SUPPORTED_PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredCustomModels.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-slate-800 text-slate-400 text-xs">
                {t(
                  "models.noCustomModelsYet",
                  undefined,
                  "No custom models registered yet. Choose a preset or enter a model ID above.",
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCustomModels.map((m) => {
                  const key = `${m.provider}:${m.model_id}`;
                  return (
                    <Card
                      key={key}
                      className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
                    >
                      <CardHeader className="p-3 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white truncate">
                              {m.name || m.model_id}
                            </h4>
                            <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                              {m.model_id}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 border-sky-800/50 bg-sky-950/30 text-sky-400 shrink-0"
                          >
                            {m.provider}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardFooter className="p-3 pt-2 flex items-center justify-between gap-2 border-t border-slate-800/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestInPlayground(m)}
                          className="h-7 text-xs px-2 text-sky-400 hover:text-sky-300 hover:bg-sky-950/30"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {t("models.testInPlayground", undefined, "Test in Playground")}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCustomModelToDelete(m)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-950/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

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
                          <div className="text-xs text-slate-400 flex items-center gap-1.5">
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
                          </div>
                        </div>

                        {/* Status Badge */}
                        <Badge
                          variant="outline"
                          className={
                            model.status === "disabled"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs"
                              : model.status === "online"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                              : model.status === "busy"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
                                : "bg-slate-800 text-slate-400 border-slate-700 text-xs"
                          }
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              model.status === "disabled"
                                ? "bg-rose-400"
                                : model.status === "online"
                                ? "bg-emerald-400 animate-pulse"
                                : model.status === "busy"
                                  ? "bg-amber-400"
                                  : "bg-slate-500"
                            }`}
                          />
                          {model.status === "disabled"
                            ? t("models.statusDisabled")
                            : model.status === "online"
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
                        disabled={model.status === "disabled"}
                        onClick={() => {
                          if (needsPassword) {
                            setUnlockingModel(model);
                            setEnteredPassword("");
                          } else {
                            setPlaygroundModelId(model.id);
                            setActiveTab("playground");
                          }
                        }}
                        className={
                          model.status === "disabled"
                            ? "h-8 border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed opacity-60"
                            : "h-8 border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
                        }
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
                    const isShared = model.enabled !== false;

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
                            model.status === "disabled"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs"
                              : model.status === "online"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                              : model.status === "busy"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs"
                              : "bg-slate-800 text-slate-400 border-slate-700 text-xs"
                          }
                        >
                          {model.status === "disabled"
                            ? t("models.statusDisabled")
                            : model.status === "online"
                            ? t("models.statusOnline")
                            : model.status === "busy"
                            ? t("models.statusBusy")
                            : t("models.statusPaused")}
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
                        disabled={model.status === "disabled"}
                        onClick={() => {
                          setPlaygroundModelId(model.id);
                          setActiveTab("playground");
                        }}
                        className={
                          model.status === "disabled"
                            ? "h-8 text-xs border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed opacity-60"
                            : "h-8 text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/20"
                        }
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
                  <SelectTrigger className="w-full sm:w-[280px] bg-slate-900 border-slate-800 text-xs">
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[300px]">
                    {registeredCustomModels.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold text-sky-400 uppercase tracking-wider">
                          Custom Models
                        </div>
                        {registeredCustomModels.map((m) => (
                          <SelectItem
                            key={`${m.provider}:${m.model_id}`}
                            value={`${m.provider}:${m.model_id}`}
                            className="text-xs"
                          >
                            {m.name || m.model_id} ({m.provider})
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {sharedModels.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                          Shared Models
                        </div>
                        {sharedModels.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.name} ({m.hostUsername})
                          </SelectItem>
                        ))}
                      </>
                    )}
                    <div className="px-2 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                      Built-in Models
                    </div>
                    <SelectItem value="horde:Fast" className="text-xs">
                      Fast - Llama 3.1 8B (AI Horde)
                    </SelectItem>
                    <SelectItem value="horde:Smart" className="text-xs">
                      Smart - Behemoth 123B (AI Horde)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Selected Model Details */}
              {playgroundModelId && (
                <div className="space-y-3">
                  {allModels.find(
                    (m) =>
                      `${m.provider}:${m.model_id}` === playgroundModelId ||
                      m.model_id === playgroundModelId,
                  ) ? (
                    <div className="text-xs text-slate-400 flex items-center gap-3 p-2.5 rounded bg-slate-950/50 border border-slate-800">
                      <span>
                        Provider:{" "}
                        <strong className="text-white capitalize">
                          {
                            allModels.find(
                              (m) =>
                                `${m.provider}:${m.model_id}` ===
                                  playgroundModelId ||
                                m.model_id === playgroundModelId,
                            )?.provider
                          }
                        </strong>
                      </span>
                      <span>
                        Model ID:{" "}
                        <strong className="text-sky-400 font-mono">
                          {
                            allModels.find(
                              (m) =>
                                `${m.provider}:${m.model_id}` ===
                                  playgroundModelId ||
                                m.model_id === playgroundModelId,
                            )?.model_id
                          }
                        </strong>
                      </span>
                      <span>
                        Status:{" "}
                        <strong className="text-emerald-400">
                          Ready
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 flex items-center gap-3 p-2.5 rounded bg-slate-950/50 border border-slate-800">
                      <span>
                        Host:{" "}
                        <strong className="text-white">
                          {selectedPlaygroundModel?.hostUsername}
                        </strong>
                      </span>
                      <span>
                        Modality:{" "}
                        <strong className="text-sky-400">
                          {selectedPlaygroundModel?.modality.toUpperCase()}
                        </strong>
                      </span>
                      <span>
                        Tokens:{" "}
                        <strong className="text-white">
                          {selectedPlaygroundModel?.max_tokens}
                        </strong>
                      </span>
                    </div>
                  )}

                  {isPlaygroundModelDisabled && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{t("models.modelDisabledNotice")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Chat Interface or Embeddings Test */}
              {selectedPlaygroundModel?.modality === "embeddings" ? (
                <div className="space-y-3">
                  <Label className="text-xs text-slate-300">
                    {t("models.inputEmbeddingText")}
                  </Label>
                  <Input
                    value={embeddingInput}
                    onChange={(e) => setEmbeddingInput(e.target.value)}
                    placeholder="Enter sentence to convert to vector embedding..."
                    disabled={isPlaygroundRunning || isPlaygroundModelDisabled}
                    className="bg-slate-950/60 border-slate-800"
                  />
                  <Button
                    onClick={handleRunPlayground}
                    disabled={
                      isPlaygroundRunning ||
                      isPlaygroundModelDisabled ||
                      !embeddingInput.trim()
                    }
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
                      disabled={isPlaygroundRunning || isPlaygroundModelDisabled}
                      className="bg-slate-950/60 border-slate-800"
                    />
                    <Button
                      onClick={handleRunPlayground}
                      disabled={
                        isPlaygroundRunning ||
                        isPlaygroundModelDisabled ||
                        !playgroundPrompt.trim()
                      }
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

              {/* Enable / Disable Sharing */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div>
                  <Label className="text-xs">{t("models.shareLocalModel")}</Label>
                  <p className="text-[10px] text-slate-500">
                    {editingModel.enabled !== false
                      ? t("models.sharingEnabled")
                      : t("models.sharingDisabled")}
                  </p>
                </div>
                <Switch
                  checked={editingModel.enabled !== false}
                  onCheckedChange={(checked) =>
                    setEditingModel({
                      ...editingModel,
                      enabled: checked,
                    })
                  }
                />
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

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: CONFIGURE PROVIDER API KEY (ZERO-KNOWLEDGE ENCRYPTED)        */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={keyModalOpen} onOpenChange={setKeyModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Key className="w-4 h-4 text-sky-400" />
              Configure API Key: {selectedProviderCard?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {selectedProviderCard?.requiresKey
                ? "Your key will be encrypted client-side with AES-256-GCM using your Zero-Knowledge Master Key."
                : "Pollinations is free and keyless by default. An optional key can be configured if you have a priority or custom tier token."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isMasterKeyActive && (
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200">
                    Master Key is locked. You must unlock your Master Key to encrypt or decrypt API keys.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsUnlockPromptOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 self-start gap-1.5"
                >
                  <Key className="w-3 h-3" />
                  Unlock Master Key
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">
                API Key {selectedProviderCard?.requiresKey && <span className="text-red-400">*</span>}
              </Label>
              <div className="relative">
                <Input
                  type={showKeyPassword ? "text" : "password"}
                  value={keyInputValue}
                  onChange={(e) => {
                    setKeyInputValue(e.target.value);
                    setKeySaveError(null);
                  }}
                  placeholder={selectedProviderCard?.keyPlaceholder || "Enter API key"}
                  className="bg-slate-950 border-slate-800 pr-10 text-xs h-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyPassword((prev) => !prev)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  {showKeyPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {selectedProviderCard?.docsUrl && (
              <a
                href={selectedProviderCard.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Get an API key from {selectedProviderCard.name}
              </a>
            )}

            {keySaveError && (
              <p className="text-xs text-red-400 font-medium">{keySaveError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 justify-between">
            {selectedProviderCard &&
              (encryptedKeys[selectedProviderCard.id.toLowerCase()] ||
                decryptedKeys[selectedProviderCard.id.toLowerCase()]) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveApiKey}
                  disabled={isSavingKey}
                  className="text-red-400 hover:bg-red-950/30 text-xs h-8"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete Key
                </Button>
              )}

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setKeyModalOpen(false)}
                className="border-slate-800 text-xs h-8"
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || (!keyInputValue.trim() && !!selectedProviderCard?.requiresKey)}
                className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-8"
              >
                {isSavingKey ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                )}
                Save & Encrypt
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: MASTER KEY UNLOCK PROMPT                                     */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={isUnlockPromptOpen} onOpenChange={setIsUnlockPromptOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <EncryptionRequiredPrompt
            category="api_keys"
            title="Unlock Master Key"
            description="Enter your master password to unlock Zero-Knowledge decryption for your private API keys."
            onUnlocked={() => {
              loadApiKeys();
              setIsUnlockPromptOpen(false);
              toast({ title: "Master Key unlocked successfully!" });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: FETCH REMOTE MODELS LIST FROM PROVIDER                       */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={isFetchModalOpen} onOpenChange={setIsFetchModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <RefreshCw className="w-4 h-4 text-sky-400" />
              Available Models: {SUPPORTED_PROVIDERS.find((p) => p.id === newModelProvider)?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Select any remote model below to automatically populate the Model ID field.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <Input
                placeholder="Search models by name or id..."
                value={fetchedModelsSearch}
                onChange={(e) => setFetchedModelsSearch(e.target.value)}
                className="bg-slate-950 border-slate-800 pl-8 text-xs h-8"
              />
            </div>

            {isFetchingRemote ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                <p className="text-xs">{t("models.fetchingModels", undefined, "Querying provider models...")}</p>
              </div>
            ) : fetchRemoteError ? (
              <div className="p-4 rounded-lg bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span>{fetchRemoteError}</span>
              </div>
            ) : (
              <ScrollArea className="h-64 border border-slate-800 rounded-lg p-2 bg-slate-950/50">
                {fetchedRemoteModels.filter(
                  (m) =>
                    !fetchedModelsSearch.trim() ||
                    m.id.toLowerCase().includes(fetchedModelsSearch.toLowerCase()) ||
                    m.name.toLowerCase().includes(fetchedModelsSearch.toLowerCase()),
                ).length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 text-center">
                    {t("models.noModelsFoundFromProvider", undefined, "No models found from provider.")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {fetchedRemoteModels
                      .filter(
                        (m) =>
                          !fetchedModelsSearch.trim() ||
                          m.id.toLowerCase().includes(fetchedModelsSearch.toLowerCase()) ||
                          m.name.toLowerCase().includes(fetchedModelsSearch.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectFetchedModel(item)}
                          className="w-full text-left p-2 rounded hover:bg-slate-800/80 transition flex items-center justify-between group"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-medium text-white truncate group-hover:text-sky-300">
                              {item.name || item.id}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              {item.id}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-700 text-slate-400 shrink-0">
                            Select
                          </Badge>
                        </button>
                      ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFetchModalOpen(false)}
              className="border-slate-800 text-xs h-8"
            >
              {t("common.close", undefined, "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* DIALOG: DELETE CUSTOM MODEL CONFIRMATION                             */}
      {/* -------------------------------------------------------------------- */}
      <Dialog
        open={!!customModelToDelete}
        onOpenChange={(open) => {
          if (!open) setCustomModelToDelete(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-white">
              <Trash2 className="w-4 h-4 text-red-400" />
              Delete Custom Model
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Are you sure you want to remove{" "}
              <strong className="text-white font-mono">
                {customModelToDelete?.name || customModelToDelete?.model_id}
              </strong>
              ? You can re-register it at any time.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomModelToDelete(null)}
              className="border-slate-800 text-xs h-8"
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleDeleteCustomModel}
              disabled={isDeletingCustomModel}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-8"
            >
              {isDeletingCustomModel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t("common.delete")}
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
