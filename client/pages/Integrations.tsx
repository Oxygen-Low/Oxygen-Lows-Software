import { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import {
  KeyRound,
  ShieldCheck,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Edit2,
  ExternalLink,
  Search,
  CheckCircle2,
  Sparkles,
  Cpu,
  Layers,
  Bot,
  AlertCircle,
  Plus,
  Loader2,
  RefreshCw,
  Server,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import {
  isCategoryLocked,
  isCategoryEncryptionEnabled,
  setCategoryEncryptionEnabled,
  getActiveMasterKey,
  generateAes256Key,
  setActiveMasterKey,
  encryptIntegrationData,
  decryptIntegrationData,
  type IntegrationData,
} from "@/lib/crypto";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";
import { cn } from "@/lib/utils";

export type IntegrationCategoryKey = "all" | "llm_models" | "llm_integrations" | "llm_mcps";

export interface IntegrationDefinition {
  provider: string;
  name: string;
  category: "llm_models" | "llm_integrations" | "llm_mcps";
  descriptionKey: string;
  defaultDescription: string;
  placeholder: string;
  docsUrl?: string;
  defaultBaseUrl?: string;
  iconType?: "model" | "integration" | "mcp";
}

export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  // Category 1: LLM Models
  {
    provider: "openai",
    name: "OpenAI / ChatGPT",
    category: "llm_models",
    descriptionKey: "integrations.openaiDesc",
    defaultDescription: "API key for OpenAI models including GPT-4o, o1, and o3-mini.",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    iconType: "model",
  },
  {
    provider: "gemini",
    name: "Google / Gemini",
    category: "llm_models",
    descriptionKey: "integrations.geminiDesc",
    defaultDescription: "API key for Google Gemini Flash, Pro, and embedding models.",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    iconType: "model",
  },
  {
    provider: "openrouter",
    name: "OpenRouter",
    category: "llm_models",
    descriptionKey: "integrations.openrouterDesc",
    defaultDescription: "Universal API key providing access to hundreds of AI models.",
    placeholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    iconType: "model",
  },
  {
    provider: "xai",
    name: "xAI / Grok",
    category: "llm_models",
    descriptionKey: "integrations.xaiDesc",
    defaultDescription: "API key for xAI Grok frontier and vision models.",
    placeholder: "xai-...",
    docsUrl: "https://console.x.ai/",
    defaultBaseUrl: "https://api.x.ai/v1",
    iconType: "model",
  },
  {
    provider: "anthropic",
    name: "Anthropic / Claude",
    category: "llm_models",
    descriptionKey: "integrations.anthropicDesc",
    defaultDescription: "API key for Claude 3.5 Sonnet, Claude 3.7 Sonnet, Haiku, and Opus.",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    iconType: "model",
  },

  // Category 2: LLM Integrations
  {
    provider: "google_jules",
    name: "Google Jules",
    category: "llm_integrations",
    descriptionKey: "integrations.googleJulesDesc",
    defaultDescription: "API key and integration credentials for Google Jules coding workflows.",
    placeholder: "Enter Jules API key or access token...",
    docsUrl: "https://developers.google.com/jules/api",
    defaultBaseUrl: "https://jules.googleapis.com/v1alpha",
    iconType: "integration",
  },

  // Category 3: LLM Mcps
  {
    provider: "google_stitch_mcp",
    name: "Google Stitch MCP",
    category: "llm_mcps",
    descriptionKey: "integrations.googleStitchMcpDesc",
    defaultDescription: "Model Context Protocol (MCP) server token and endpoint for Google Stitch.",
    placeholder: "Enter Stitch MCP token or connection string...",
    docsUrl: "https://stitch.withgoogle.com",
    defaultBaseUrl: "https://stitch.googleapis.com/mcp",
    iconType: "mcp",
  },
  {
    provider: "github_mcp",
    name: "GitHub MCP",
    category: "llm_mcps",
    descriptionKey: "integrations.githubMcpDesc",
    defaultDescription: "GitHub Personal Access Token (PAT) for GitHub MCP repository tools.",
    placeholder: "ghp_... or github_pat_...",
    docsUrl: "https://github.com/settings/tokens",
    defaultBaseUrl: "https://api.github.com",
    iconType: "mcp",
  },
];

export default function Integrations() {
  const { session } = useAuth();
  const { t } = useTranslation();

  // Active Integrations State
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<IntegrationCategoryKey>("all");

  // Encryption Check State
  const [encryptionEnabled, setEncryptionEnabled] = useState<boolean>(() =>
    isCategoryEncryptionEnabled("integrations")
  );
  const [encryptionLocked, setEncryptionLocked] = useState<boolean>(() =>
    isCategoryLocked("integrations")
  );
  const [activeKey, setActiveKey] = useState<Uint8Array | null>(() => getActiveMasterKey());

  // Edit / Add Modal State
  const [editingDef, setEditingDef] = useState<IntegrationDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [inputApiKey, setInputApiKey] = useState<string>("");
  const [isMaskedInput, setIsMaskedInput] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Delete Alert State
  const [deletingIntegration, setDeletingIntegration] = useState<IntegrationData | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Copied state tracker by provider
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);
  const [revealedProviders, setRevealedProviders] = useState<Record<string, boolean>>({});

  // Sync encryption status
  const refreshEncryptionState = useCallback(() => {
    const enabled = isCategoryEncryptionEnabled("integrations");
    const locked = isCategoryLocked("integrations");
    const key = getActiveMasterKey();
    setEncryptionEnabled(enabled);
    setEncryptionLocked(locked);
    setActiveKey(key);
  }, []);

  useEffect(() => {
    refreshEncryptionState();
  }, [refreshEncryptionState]);

  // Fetch and decrypt stored integrations
  const fetchIntegrations = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", session.user.id);

      if (error) throw error;

      const key = getActiveMasterKey();
      const decryptedList = await Promise.all(
        (data || []).map((item) => decryptIntegrationData(item, key))
      );

      setIntegrations(decryptedList);
    } catch (err: any) {
      console.error("Failed to fetch integrations:", err);
      toast.error(err?.message || t("integrations.fetchError", undefined, "Failed to load integrations"));
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, t]);

  useEffect(() => {
    if (encryptionEnabled && !encryptionLocked) {
      fetchIntegrations();
    } else {
      setLoading(false);
    }
  }, [encryptionEnabled, encryptionLocked, fetchIntegrations]);

  // Handle Unlocked callback from prompt
  const handleUnlocked = () => {
    refreshEncryptionState();
    fetchIntegrations();
  };

  // Enable encryption directly from prompt
  const handleEnableEncryption = async () => {
    let key = getActiveMasterKey();
    if (!key) {
      // Generate a new key and activate it
      key = generateAes256Key();
      setActiveMasterKey(key);
      toast.success(
        t("security.keyCopiedToast", undefined, "Generated and activated new AES-256 masterkey")
      );
    }

    setCategoryEncryptionEnabled("integrations", true);
    setEncryptionEnabled(true);
    setEncryptionLocked(false);
    setActiveKey(key);
    toast.success(
      t("integrations.encryptionEnabledToast", undefined, "Encryption enabled for API keys & integrations")
    );
    fetchIntegrations();
  };

  // Open Configure / Edit Modal
  const handleOpenConfigure = (def: IntegrationDefinition) => {
    const existing = integrations.find((i) => i.provider === def.provider);
    setEditingDef(def);
    setInputApiKey(existing?.api_key || "");
    setIsMaskedInput(true);
    setModalOpen(true);
  };

  // Save Integration Key
  const handleSaveIntegration = async () => {
    if (!editingDef || !session?.user?.id) return;
    const trimmedKey = inputApiKey.trim();

    if (!trimmedKey) {
      toast.error(t("integrations.keyRequiredError", undefined, "API key / token is required"));
      return;
    }

    const key = getActiveMasterKey();
    if (!key) {
      toast.error(t("integrations.masterKeyMissingError", undefined, "Masterkey required to encrypt integration"));
      return;
    }

    setSaving(true);
    try {
      const integrationPayload: IntegrationData = {
        user_id: session.user.id,
        category: editingDef.category,
        provider: editingDef.provider,
        name: editingDef.name,
        api_key: trimmedKey,
        base_url: editingDef.defaultBaseUrl || null,
      };

      const encrypted = await encryptIntegrationData(integrationPayload, key);

      const { data, error } = await supabase
        .from("user_integrations")
        .upsert(
          {
            user_id: session.user.id,
            category: encrypted.category,
            provider: encrypted.provider,
            name: encrypted.name,
            api_key: encrypted.api_key,
            base_url: encrypted.base_url,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,provider" }
        )
        .select()
        .single();

      if (error) throw error;

      // Update local state with decrypted record
      const decrypted = await decryptIntegrationData(data, key);
      setIntegrations((prev) => {
        const index = prev.findIndex((i) => i.provider === editingDef.provider);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = decrypted;
          return updated;
        }
        return [...prev, decrypted];
      });

      toast.success(
        t(
          "integrations.savedToast",
          { name: editingDef.name },
          `${editingDef.name} credentials saved securely.`
        )
      );
      setModalOpen(false);
    } catch (err: any) {
      console.error("Failed to save integration:", err);
      toast.error(err?.message || t("integrations.saveError", undefined, "Failed to save integration"));
    } finally {
      setSaving(false);
    }
  };

  // Delete Integration
  const handleDeleteIntegration = async () => {
    if (!deletingIntegration || !session?.user?.id) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("user_integrations")
        .delete()
        .eq("user_id", session.user.id)
        .eq("provider", deletingIntegration.provider);

      if (error) throw error;

      setIntegrations((prev) =>
        prev.filter((i) => i.provider !== deletingIntegration.provider)
      );
      toast.success(
        t(
          "integrations.deletedToast",
          { name: deletingIntegration.name },
          `${deletingIntegration.name} integration removed.`
        )
      );
      setDeleteConfirmOpen(false);
      setDeletingIntegration(null);
    } catch (err: any) {
      console.error("Failed to delete integration:", err);
      toast.error(err?.message || t("integrations.deleteError", undefined, "Failed to delete integration"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy API key to clipboard
  const handleCopyKey = async (provider: string, rawKey?: string | null) => {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopiedProvider(provider);
      toast.success(t("integrations.copiedToast", undefined, "API key copied to clipboard"));
      setTimeout(() => setCopiedProvider(null), 2500);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error(t("common.error", undefined, "Failed to copy to clipboard"));
    }
  };

  // Toggle reveal for individual integration card
  const toggleReveal = (provider: string) => {
    setRevealedProviders((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  // Format masked key string
  const formatMaskedKey = (key?: string | null) => {
    if (!key) return "••••••••••••••••";
    if (key.length <= 10) return "••••••••••••";
    return `${key.slice(0, 6)}••••••••${key.slice(-4)}`;
  };

  // Filtered definitions
  const filteredDefinitions = useMemo(() => {
    return INTEGRATION_DEFINITIONS.filter((def) => {
      // Category filter
      if (activeCategory !== "all" && def.category !== activeCategory) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = def.name.toLowerCase().includes(query);
        const matchesProvider = def.provider.toLowerCase().includes(query);
        const matchesDesc = def.defaultDescription.toLowerCase().includes(query);
        return matchesName || matchesProvider || matchesDesc;
      }
      return true;
    });
  }, [activeCategory, searchQuery]);

  // Counts
  const configuredCount = useMemo(() => {
    return integrations.filter((i) => i.api_key && i.api_key.trim().length > 0).length;
  }, [integrations]);

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-20 animate-in fade-in duration-500">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 flex items-center gap-2.5">
              <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
              <span>{t("integrations.title", undefined, "Integrations & API Keys")}</span>
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-3xl">
              {t(
                "integrations.subtitle",
                undefined,
                "Securely manage API keys and credentials for LLM models, integrations, and MCP servers with AES-256 zero-knowledge client encryption."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {encryptionEnabled && !encryptionLocked ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1 px-3 text-xs font-medium"
              >
                <Lock className="w-3.5 h-3.5" />
                {t("integrations.aesEncryptedBadge", undefined, "AES-256 Encrypted")}
              </Badge>
            ) : encryptionLocked ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-400 gap-1.5 py-1 px-3 text-xs font-medium"
              >
                <Unlock className="w-3.5 h-3.5" />
                {t("security.keyRequiredBadge", undefined, "Key Required")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-destructive/40 bg-destructive/10 text-destructive gap-1.5 py-1 px-3 text-xs font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {t("integrations.encryptionDisabledBadge", undefined, "Encryption Required")}
              </Badge>
            )}
          </div>
        </div>

        {/* Case 1: Masterkey Encryption is completely disabled */}
        {!encryptionEnabled ? (
          <Card className="border-amber-500/30 bg-slate-900/80 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/80 to-amber-500/0" />
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-lg">
                <Lock className="w-5 h-5" />
                <span>{t("integrations.encryptionRequiredTitle", undefined, "Zero-Knowledge Encryption Required")}</span>
              </div>
              <CardDescription className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                {t(
                  "integrations.encryptionRequiredDesc",
                  undefined,
                  "To protect your private API keys and tokens from unauthorized access, Oxygen Low's Software requires client-side AES-256 masterkey encryption for all stored integrations. Data is encrypted directly in your browser before saving."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  {t(
                    "integrations.encryptionNoticeDetail",
                    undefined,
                    "Your masterkey is held only in your local session and is never uploaded or accessible to the server."
                  )}
                </span>
              </div>
              <Button
                id="enable-integration-encryption-btn"
                onClick={handleEnableEncryption}
                className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-950/40"
              >
                <Lock className="w-4 h-4" />
                <span>{t("integrations.enableEncryptionButton", undefined, "Enable Integration Encryption")}</span>
              </Button>
            </CardContent>
          </Card>
        ) : encryptionLocked ? (
          /* Case 2: Encryption is enabled, but locked in session */
          <EncryptionRequiredPrompt
            category="integrations"
            categoryLabel={t("security.integrations", undefined, "API Keys & Integrations")}
            onUnlocked={handleUnlocked}
          />
        ) : (
          /* Case 3: Fully Active & Unlocked */
          <div className="space-y-6">
            {/* Stats Summary Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {t("integrations.totalAvailable", undefined, "Total Supported")}
                  </p>
                  <p className="text-2xl font-bold text-white mt-0.5">
                    {INTEGRATION_DEFINITIONS.length}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Layers className="w-5 h-5" />
                </div>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {t("integrations.configuredCount", undefined, "Configured")}
                  </p>
                  <p className="text-2xl font-bold text-emerald-400 mt-0.5">
                    {configuredCount}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {t("integrations.securityStatus", undefined, "Protection")}
                  </p>
                  <p className="text-sm font-semibold text-cyan-400 mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{t("integrations.aesProtected", undefined, "AES-256 Zero-Knowledge")}</span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
              </Card>
            </div>

            {/* Filter and Search Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <Tabs
                value={activeCategory}
                onValueChange={(val) => setActiveCategory(val as IntegrationCategoryKey)}
                className="w-full md:w-auto"
              >
                <TabsList className="bg-slate-900/80 p-1 border border-slate-800 rounded-xl flex flex-wrap h-auto gap-1">
                  <TabsTrigger
                    value="all"
                    className="text-xs sm:text-sm rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    {t("common.all", undefined, "All")} ({INTEGRATION_DEFINITIONS.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="llm_models"
                    className="text-xs sm:text-sm rounded-lg px-3 py-1.5 gap-1.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{t("integrations.categoryModels", undefined, "LLM Models")}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="llm_integrations"
                    className="text-xs sm:text-sm rounded-lg px-3 py-1.5 gap-1.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{t("integrations.categoryIntegrations", undefined, "LLM Integrations")}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="llm_mcps"
                    className="text-xs sm:text-sm rounded-lg px-3 py-1.5 gap-1.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>{t("integrations.categoryMcps", undefined, "LLM Mcps")}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder={t("integrations.searchPlaceholder", undefined, "Search integrations...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs sm:text-sm bg-slate-950 border-slate-800 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Integrations Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <span>{t("common.loading", undefined, "Loading integrations...")}</span>
              </div>
            ) : filteredDefinitions.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
                <p className="text-sm text-slate-400">
                  {t("integrations.noIntegrationsFound", undefined, "No integrations found matching your search.")}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredDefinitions.map((def) => {
                  const stored = integrations.find((i) => i.provider === def.provider);
                  const isConfigured = Boolean(stored?.api_key && stored.api_key.trim().length > 0);
                  const isRevealed = Boolean(revealedProviders[def.provider]);

                  return (
                    <Card
                      key={def.provider}
                      data-testid={`integration-card-${def.provider}`}
                      className={cn(
                        "bg-slate-900/50 border-slate-800 transition-all duration-200 flex flex-col justify-between hover:bg-slate-900 hover:border-cyan-500/40 overflow-hidden",
                        isConfigured ? "border-slate-800/90 shadow-sm" : "border-slate-800/60"
                      )}
                    >
                      <CardHeader className="pb-3 p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "p-2.5 rounded-xl border shrink-0 mt-0.5",
                                def.iconType === "model"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                  : def.iconType === "integration"
                                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              )}
                            >
                              {def.iconType === "model" ? (
                                <Cpu className="w-5 h-5" />
                              ) : def.iconType === "integration" ? (
                                <Bot className="w-5 h-5" />
                              ) : (
                                <Server className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              <CardTitle className="text-base sm:text-lg text-white font-semibold flex items-center gap-2">
                                <span>{def.name}</span>
                              </CardTitle>
                              <CardDescription className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {t(def.descriptionKey as any, undefined, def.defaultDescription)}
                              </CardDescription>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isConfigured ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-wider py-0.5 px-2 gap-1"
                              >
                                <Check className="w-3 h-3" />
                                {t("integrations.configuredBadge", undefined, "Configured")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-slate-800 bg-slate-950/80 text-slate-500 text-[10px] font-mono uppercase tracking-wider py-0.5 px-2"
                              >
                                {t("integrations.notConfiguredBadge", undefined, "Not Set")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pt-0 px-4 sm:px-5 pb-4 sm:pb-5">
                        {/* Stored Key Preview Box */}
                        {isConfigured ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                {t("integrations.apiKeyLabel", undefined, "API Key / Token")}:
                              </span>
                              {(stored?.base_url || def.defaultBaseUrl) && (
                                <span
                                  className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]"
                                  title={stored?.base_url || def.defaultBaseUrl}
                                >
                                  {stored?.base_url || def.defaultBaseUrl}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200">
                              <div className="flex-1 truncate select-all">
                                {isRevealed ? stored?.api_key : formatMaskedKey(stored?.api_key)}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800"
                                  onClick={() => toggleReveal(def.provider)}
                                  title={isRevealed ? t("security.maskKey", undefined, "Hide") : t("security.revealKey", undefined, "Reveal")}
                                >
                                  {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800"
                                  onClick={() => handleCopyKey(def.provider, stored?.api_key)}
                                  title={t("integrations.copyKey", undefined, "Copy Key")}
                                >
                                  {copiedProvider === def.provider ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 text-xs text-slate-500 flex items-center justify-between">
                            <span>{t("integrations.noKeyStored", undefined, "No API key configured yet")}</span>
                            {def.docsUrl && (
                              <a
                                href={def.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                              >
                                <span>{t("integrations.getKeyLink", undefined, "Get API Key")}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          {def.docsUrl ? (
                            <a
                              href={def.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-slate-400 hover:text-cyan-400 inline-flex items-center gap-1 transition-colors"
                            >
                              <span>{t("integrations.documentation", undefined, "Documentation")}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span />
                          )}

                          <div className="flex items-center gap-2">
                            {isConfigured && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeletingIntegration(stored!);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t("common.delete", undefined, "Delete")}</span>
                              </Button>
                            )}

                            <Button
                              type="button"
                              variant={isConfigured ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleOpenConfigure(def)}
                              className={cn(
                                "h-8 text-xs gap-1.5 transition-all font-medium",
                                isConfigured
                                  ? "border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white"
                                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
                              )}
                            >
                              {isConfigured ? (
                                <>
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>{t("common.edit", undefined, "Edit")}</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{t("integrations.configureButton", undefined, "Configure")}</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Configure / Edit Dialog */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg text-white">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <span>
                  {editingDef
                    ? t(
                        "integrations.configureModalTitle",
                        { name: editingDef.name },
                        `Configure ${editingDef.name}`
                      )
                    : t("integrations.configureModalDefaultTitle", undefined, "Configure Integration")}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-slate-400">
                {editingDef &&
                  t(editingDef.descriptionKey as any, undefined, editingDef.defaultDescription)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="input-api-key" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    {t("integrations.apiKeyLabel", undefined, "API Key / Access Token")} *
                  </Label>
                  {editingDef?.docsUrl && (
                    <a
                      href={editingDef.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1"
                    >
                      <span>{t("integrations.getKeyLink", undefined, "Get API Key")}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <Input
                    id="input-api-key"
                    type={isMaskedInput ? "password" : "text"}
                    placeholder={editingDef?.placeholder || "Enter API key..."}
                    value={inputApiKey}
                    onChange={(e) => setInputApiKey(e.target.value)}
                    className="font-mono text-xs pr-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMaskedInput((prev) => !prev)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-white"
                    title={isMaskedInput ? t("security.revealKey", undefined, "Reveal") : t("security.maskKey", undefined, "Hide")}
                  >
                    {isMaskedInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {editingDef?.defaultBaseUrl && (
                <div className="space-y-1 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                    {t("integrations.defaultEndpointLabel", undefined, "Default Endpoint")}:
                  </span>
                  <p className="font-mono text-xs text-slate-200 break-all">
                    {editingDef.defaultBaseUrl}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {t(
                      "integrations.fixedBaseUrlHelp",
                      undefined,
                      "This integration always uses the standard official endpoint."
                    )}
                  </p>
                </div>
              )}

              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {t(
                    "integrations.dialogEncryptionNotice",
                    undefined,
                    "Credentials will be encrypted with your 256-bit AES masterkey before transmission."
                  )}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                id="save-integration-submit-btn"
                type="button"
                onClick={handleSaveIntegration}
                disabled={saving || !inputApiKey.trim()}
                className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{t("common.save", undefined, "Save")}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Alert Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                {deletingIntegration
                  ? t(
                      "integrations.deleteConfirmTitle",
                      { name: deletingIntegration.name },
                      `Delete ${deletingIntegration.name} integration?`
                    )
                  : t("integrations.deleteConfirmDefaultTitle", undefined, "Delete integration?")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400 text-xs sm:text-sm">
                {t(
                  "integrations.deleteConfirmDesc",
                  undefined,
                  "This will permanently remove the stored API key and credentials from your encrypted cloud storage."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white">
                {t("common.cancel", undefined, "Cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                id="confirm-delete-integration-btn"
                onClick={handleDeleteIntegration}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {t("common.delete", undefined, "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
