import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db, supabase } from "@/lib/db";
import { useTheme } from "@/hooks/useTheme";
import {
  callDesktopBridge,
  isDesktopBridgeAvailable,
} from "@/lib/desktopBridge";
import {
  encryptApiKey,
  decryptApiKey,
  getActiveMasterKey,
  isEncrypted,
} from "@/lib/crypto";

export interface Model {
  id?: string;
  provider: string;
  model_id: string;
  name?: string;
  isCustom?: boolean;
  isLocal?: boolean;
  isShared?: boolean;
}

export interface LocalProviderStatus {
  ollama: boolean;
  lmstudio: boolean;
  kobold: boolean;
  desktopBridge: boolean;
  totalLocal: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  requiresKey: boolean;
  keyPlaceholder?: string;
  docsUrl?: string;
}

export const SUPPORTED_PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, o1, o3-mini, GPT-4.5 & custom fine-tunes",
    requiresKey: true,
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.7 Sonnet, Claude 3.5 Haiku & Claude 3 Opus",
    requiresKey: true,
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash & 1.5 Pro",
    requiresKey: true,
    keyPlaceholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "DeepSeek, Llama 3.3, Mistral, Qwen & 100+ models",
    requiresKey: true,
    keyPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "grok",
    name: "xAI / Grok",
    description: "Grok 2, Grok 2 Vision & reasoning models",
    requiresKey: true,
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai/",
  },
  {
    id: "pollinations",
    name: "Pollinations AI",
    description: "Free & keyless AI text models (optional priority key)",
    requiresKey: false,
    keyPlaceholder: "Optional secret or priority key",
    docsUrl: "https://pollinations.ai/",
  },
];

export const BUILTIN_MODELS: Model[] = [
  {
    provider: "horde",
    model_id: "Fast",
    name: "Fast - koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
  },
  {
    provider: "horde",
    model_id: "Smart",
    name: "Smart - aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
  },
];

export const POPULAR_PRESETS: Record<
  string,
  Array<{ model_id: string; name: string }>
> = {
  openai: [
    { model_id: "gpt-4o", name: "GPT-4o (Omni)" },
    { model_id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { model_id: "o1", name: "o1 Reasoning" },
    { model_id: "o3-mini", name: "o3-mini Fast Reasoning" },
    { model_id: "gpt-4.5-preview", name: "GPT-4.5 Preview" },
    { model_id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  ],
  pollinations: [
    { model_id: "openai", name: "GPT-4o Mini (Pollinations)" },
    { model_id: "mistral", name: "Mistral Nemo (Pollinations)" },
    { model_id: "deepseek", name: "DeepSeek V3 (Pollinations)" },
    { model_id: "deepseek-r1", name: "DeepSeek R1 (Pollinations)" },
    { model_id: "qwen", name: "Qwen 2.5 72B (Pollinations)" },
    { model_id: "claude-hybrid", name: "Claude 3.5 Sonnet Hybrid (Pollinations)" },
  ],
  anthropic: [
    { model_id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
    { model_id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet v2" },
    { model_id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    { model_id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
  ],
  google: [
    { model_id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { model_id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { model_id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    { model_id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    { model_id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
  ],
  openrouter: [
    { model_id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    { model_id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
    {
      model_id: "meta-llama/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
    },
    { model_id: "mistralai/mistral-large-2411", name: "Mistral Large 2411" },
    { model_id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct" },
    { model_id: "openrouter/free", name: "Auto Select - Free Model" },
  ],
  grok: [
    { model_id: "grok-2-1212", name: "Grok 2" },
    { model_id: "grok-2-vision-1212", name: "Grok 2 Vision" },
    { model_id: "grok-beta", name: "Grok Beta" },
  ],
  horde: [
    {
      model_id: "Fast",
      name: "Fast - koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
    },
    {
      model_id: "Smart",
      name: "Smart - aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
    },
  ],
  "local-ollama": [
    { model_id: "llama3.2:latest", name: "Llama 3.2" },
    { model_id: "mistral:latest", name: "Mistral" },
    { model_id: "deepseek-r1:8b", name: "DeepSeek R1 8B" },
    { model_id: "qwen2.5:7b", name: "Qwen 2.5 7B" },
  ],
  "local-lmstudio": [{ model_id: "local-model", name: "Loaded Local Model" }],
  "local-kobold": [{ model_id: "kobold-active", name: "Active Kobold Model" }],
};

async function probeDirectLocalModels(): Promise<{
  models: Model[];
  status: { ollama: boolean; lmstudio: boolean; kobold: boolean };
}> {
  const discovered: Model[] = [];
  const seen = new Set<string>();
  const status = { ollama: false, lmstudio: false, kobold: false };

  const add = (
    provider: string,
    modelId: string | null | undefined,
    name?: string,
  ) => {
    if (!modelId || typeof modelId !== "string" || !modelId.trim()) return;
    const trimmed = modelId.trim();
    const key = `${provider}:${trimmed}`;
    if (!seen.has(key)) {
      seen.add(key);
      discovered.push({
        provider,
        model_id: trimmed,
        name: name || trimmed,
        isLocal: true,
      });
    }
  };

  const probeUrls: Array<{
    url: string;
    provider: string;
    key: "ollama" | "lmstudio" | "kobold";
    parse: (data: any) => void;
  }> = [
    {
      url: "http://127.0.0.1:1234/v1/models",
      provider: "local-lmstudio",
      key: "lmstudio",
      parse: (data) => {
        if (Array.isArray(data?.data)) {
          for (const item of data.data) {
            if (item.type !== "embeddings" && item.id) {
              add("local-lmstudio", item.id);
            }
          }
        }
      },
    },
    {
      url: "http://127.0.0.1:11434/api/tags",
      provider: "local-ollama",
      key: "ollama",
      parse: (data) => {
        if (Array.isArray(data?.models)) {
          for (const item of data.models) {
            if (item.name) add("local-ollama", item.name);
          }
        }
      },
    },
    {
      url: "http://127.0.0.1:11434/v1/models",
      provider: "local-ollama",
      key: "ollama",
      parse: (data) => {
        if (Array.isArray(data?.data)) {
          for (const item of data.data) {
            if (item.id) add("local-ollama", item.id);
          }
        }
      },
    },
    {
      url: "http://127.0.0.1:5001/api/v1/model",
      provider: "local-kobold",
      key: "kobold",
      parse: (data) => {
        if (data?.result && typeof data.result === "string") {
          add("local-kobold", data.result);
        }
      },
    },
  ];

  await Promise.allSettled(
    probeUrls.map(async ({ url, key, parse }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          status[key] = true;
          const json = await res.json();
          parse(json);
        }
      } catch {
        // Ignore unreachable local endpoints
      }
    }),
  );

  return { models: discovered, status };
}

export const useAiModels = (
  defaultModelId = "gpt-4o",
  defaultProvider = "openai",
) => {
  const {
    lastModelId,
    lastProvider,
    setModelPreference,
    chatbotDefaultModel,
    chatbotDefaultProvider,
    setChatbotDefault,
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    setResearchAgentDefault,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
    setResearchSummarizerDefault,
  } = useTheme();

  const initialProvider =
    (chatbotDefaultProvider && chatbotDefaultProvider !== "cloudflare"
      ? chatbotDefaultProvider
      : lastProvider && lastProvider !== "cloudflare"
        ? lastProvider
        : defaultProvider === "cloudflare"
          ? "horde"
          : defaultProvider) || "horde";
  const initialModel =
    (initialProvider === "horde" &&
    (chatbotDefaultModel?.startsWith("@cf/") ||
      lastModelId?.startsWith("@cf/") ||
      defaultModelId?.startsWith("@cf/"))
      ? "Fast"
      : chatbotDefaultModel || lastModelId || defaultModelId) || "Fast";

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel);
  const [selectedProvider, setSelectedProvider] = useState<string>(initialProvider);
  const [isLoading, setIsLoading] = useState(true);

  // Encrypted & Decrypted API Keys state
  const [encryptedKeys, setEncryptedKeys] = useState<Record<string, string>>({});
  const [decryptedKeys, setDecryptedKeys] = useState<Record<string, string>>({});
  const [isMasterKeyActive, setIsMasterKeyActive] = useState<boolean>(() => !!getActiveMasterKey());

  const configuredProviders = useMemo(() => {
    const set = new Set<string>([
      "horde",
      "pollinations",
      "local-ollama",
      "local-lmstudio",
      "local-kobold",
    ]);
    for (const p of Object.keys(encryptedKeys)) {
      set.add(p.toLowerCase());
    }
    for (const p of Object.keys(decryptedKeys)) {
      set.add(p.toLowerCase());
    }
    return Array.from(set);
  }, [encryptedKeys, decryptedKeys]);

  const [localStatus, setLocalStatus] = useState<LocalProviderStatus>({
    ollama: false,
    lmstudio: false,
    kobold: false,
    desktopBridge: false,
    totalLocal: 0,
  });

  const loadApiKeys = useCallback(async () => {
    try {
      const activeMasterKey = getActiveMasterKey();
      setIsMasterKeyActive(!!activeMasterKey);

      let storedMap: Record<string, string> = {};
      try {
        const rawLocal = localStorage.getItem("oxygen_encrypted_api_keys");
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (parsed && typeof parsed === "object") storedMap = parsed;
        }
      } catch {}

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        if (sessionUser?.id) {
          const { data: dbKeys } = await db
            .from("user_api_keys")
            .select("provider, encrypted_key")
            .eq("user_id", sessionUser.id);
          if (Array.isArray(dbKeys)) {
            for (const row of dbKeys) {
              if (row.provider && row.encrypted_key) {
                storedMap[row.provider.toLowerCase()] = row.encrypted_key;
              }
            }
          }
        }
      } catch {}

      setEncryptedKeys(storedMap);

      if (activeMasterKey) {
        const decrypted: Record<string, string> = {};
        for (const [prov, enc] of Object.entries(storedMap)) {
          try {
            const dec = await decryptApiKey(enc, activeMasterKey);
            if (dec) decrypted[prov.toLowerCase()] = dec;
          } catch {}
        }
        setDecryptedKeys(decrypted);
      } else {
        setDecryptedKeys({});
      }
    } catch (e) {
      console.error("Failed to load API keys", e);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  // Use refs to track current values for the fetch callback
  const selectedModelRef = useRef(selectedModel);
  const selectedProviderRef = useRef(selectedProvider);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
    selectedProviderRef.current = selectedProvider;
  }, [selectedModel, selectedProvider]);

  const [hordeStatus, setHordeStatus] = useState<
    Record<
      string,
      { workers: number; queued: number; speed: string; eta: number }
    >
  >({});

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const discoveredLocalModels: Model[] = [];
      const seenLocal = new Set<string>();

      const addDiscovered = (
        provider: string,
        modelId: string | null | undefined,
        name?: string,
      ) => {
        if (!modelId || typeof modelId !== "string" || !modelId.trim()) return;
        const trimmed = modelId.trim();
        const key = `${provider}:${trimmed}`;
        if (!seenLocal.has(key)) {
          seenLocal.add(key);
          discoveredLocalModels.push({
            provider,
            model_id: trimmed,
            name: name || trimmed,
            isLocal: true,
          });
        }
      };

      const bridgeAvailable = isDesktopBridgeAvailable();
      const bridgeTask = bridgeAvailable
        ? callDesktopBridge<Model[]>("fetch_local_models", {}, 6000).catch(
            () => [],
          )
        : Promise.resolve([]);

      const directLocalTask = probeDirectLocalModels().catch(() => ({
        models: [],
        status: { ollama: false, lmstudio: false, kobold: false },
      }));

      // Guest models from localStorage
      let guestModels: Model[] = [];
      try {
        const rawCustom = localStorage.getItem("custom_user_models");
        if (rawCustom) {
          const parsed = JSON.parse(rawCustom);
          if (Array.isArray(parsed)) {
            guestModels = parsed.map((m) => ({
              ...m,
              isCustom: true,
            }));
          }
        }
      } catch {}

      const sharedModelsTask = Promise.all([
        fetch("/api/models/pinned")
          .then((r) => (r.ok ? r.json() : { pinned: [] }))
          .catch(() => ({ pinned: [] })),
        fetch("/api/models/shared")
          .then((r) => (r.ok ? r.json() : { models: [] }))
          .catch(() => ({ models: [] })),
      ])
        .then(([pinData, sharedData]) => {
          const pinned = new Set(pinData.pinned || []);
          const models = sharedData.models || [];
          return models
            .filter((m: any) => pinned.has(m.id))
            .map((m: any) => ({
              id: m.id,
              provider: "shared-model",
              model_id: m.id,
              name: `${m.name} (${m.hostUsername})`,
              isCustom: true,
              isShared: true,
            }));
        })
        .catch(() => []);

      const fetchTasks = [
        db
          .from("user_models")
          .select("id, provider, model_id, name")
          .order("provider"),
        fetch("/api/ai/local-providers")
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => []),
        bridgeTask,
        directLocalTask,
        sharedModelsTask,
      ];

      const results = await Promise.allSettled(fetchTasks);

      const dbModels =
        results[0].status === "fulfilled"
          ? ((results[0].value as any).data || []).map((m: any) => ({
              ...m,
              isCustom: true,
            }))
          : [];
      const localServerModels =
        results[1].status === "fulfilled"
          ? (results[1].value as Model[]) || []
          : [];
      const bridgeModels =
        results[2].status === "fulfilled"
          ? (results[2].value as Model[]) || []
          : [];
      const directLocalResult =
        results[3].status === "fulfilled"
          ? results[3].value
          : {
              models: [],
              status: { ollama: false, lmstudio: false, kobold: false },
            };
      const sharedPinnedModels =
        results[4].status === "fulfilled"
          ? (results[4].value as Model[]) || []
          : [];

      const directModels = directLocalResult.models || [];
      const localStatusResult = directLocalResult.status || {
        ollama: false,
        lmstudio: false,
        kobold: false,
      };

      // Add bridge and direct models
      for (const bm of bridgeModels) {
        if (bm && bm.provider && bm.model_id) {
          addDiscovered(bm.provider, bm.model_id, bm.name);
        }
      }
      for (const dm of directModels) {
        if (dm && dm.provider && dm.model_id) {
          addDiscovered(dm.provider, dm.model_id, dm.name);
        }
      }
      for (const lm of localServerModels) {
        if (lm && lm.provider && lm.model_id) {
          addDiscovered(lm.provider, lm.model_id, lm.name);
        }
      }

      setLocalStatus({
        ollama:
          localStatusResult.ollama ||
          discoveredLocalModels.some((m) => m.provider.includes("ollama")),
        lmstudio:
          localStatusResult.lmstudio ||
          discoveredLocalModels.some((m) => m.provider.includes("lmstudio")),
        kobold:
          localStatusResult.kobold ||
          discoveredLocalModels.some((m) => m.provider.includes("kobold")),
        desktopBridge: bridgeAvailable,
        totalLocal: discoveredLocalModels.length,
      });

      const combined = [
        ...(dbModels || []),
        ...guestModels,
        ...(localServerModels || []),
        ...discoveredLocalModels,
        ...sharedPinnedModels,
      ];

      const allModels: Model[] = [];
      const seenAll = new Set<string>();

      for (const m of combined) {
        if (m && m.provider && m.model_id) {
          const trimmed = m.model_id.trim();
          const key = `${m.provider}:${trimmed}`;
          if (!seenAll.has(key)) {
            seenAll.add(key);
            allModels.push({
              id: m.id,
              provider: m.provider,
              model_id: trimmed,
              name: m.name || trimmed,
              isCustom: m.isCustom ?? false,
              isLocal:
                m.isLocal ??
                (m.provider.startsWith("local-") ||
                  ["ollama", "lmstudio", "kobold"].includes(m.provider)),
            });
          }
        }
      }

      setModels(allModels);

      if (allModels.length > 0) {
        // Check if current selection is valid in the new list
        const isValid = allModels.some(
          (m) =>
            m.model_id === selectedModelRef.current &&
            m.provider === selectedProviderRef.current,
        );

        if (!isValid) {
          const targetModel = lastModelId || chatbotDefaultModel;
          const targetProvider = lastProvider || chatbotDefaultProvider;

          const prefValid =
            targetModel &&
            targetProvider &&
            allModels.some(
              (m) =>
                m.model_id === targetModel && m.provider === targetProvider,
            );

          const defaultValid =
            defaultModelId &&
            defaultProvider &&
            allModels.some(
              (m) =>
                m.model_id === defaultModelId && m.provider === defaultProvider,
            );

          if (prefValid) {
            setSelectedModel(targetModel!);
            setSelectedProvider(targetProvider!);
          } else if (defaultValid) {
            setSelectedModel(defaultModelId);
            setSelectedProvider(defaultProvider);
          } else {
            setSelectedModel(allModels[0].model_id);
            setSelectedProvider(allModels[0].provider);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch models", e);
    } finally {
      setIsLoading(false);
    }
  }, [lastModelId, lastProvider, chatbotDefaultModel, chatbotDefaultProvider]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/ai/horde-status");
        if (res.ok) {
          const data = await res.json();
          setHordeStatus(data);
        }
      } catch (e) {
        console.error("Failed to fetch horde status", e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateSelection = useCallback(
    (modelId: string, provider: string) => {
      setSelectedModel(modelId);
      setSelectedProvider(provider);
      setModelPreference(modelId, provider);
    },
    [setModelPreference],
  );

  const addCustomModel = useCallback(
    async (provider: string, modelId: string, name?: string) => {
      const cleanModelId = modelId.trim();
      const cleanProvider = provider.trim();
      const cleanName = name?.trim() || cleanModelId;

      if (!cleanModelId || !cleanProvider) {
        return { success: false, error: "Provider and Model ID are required" };
      }

      // Check duplicate
      const isDuplicate = models.some(
        (m) =>
          m.provider.toLowerCase() === cleanProvider.toLowerCase() &&
          m.model_id.toLowerCase() === cleanModelId.toLowerCase(),
      );
      if (isDuplicate) {
        return { success: false, error: "Model is already registered" };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;

      if (sessionUser?.id) {
        const { error } = await supabase.from("user_models").insert({
          user_id: sessionUser.id,
          provider: cleanProvider,
          model_id: cleanModelId,
          name: cleanName,
        });
        if (error) {
          return { success: false, error: error.message };
        }
      }

      // Always save to guest localStorage as fallback
      try {
        const raw = localStorage.getItem("custom_user_models");
        const existing: Array<{
          provider: string;
          model_id: string;
          name?: string;
        }> = raw ? JSON.parse(raw) : [];
        if (
          !existing.some(
            (m) => m.provider === cleanProvider && m.model_id === cleanModelId,
          )
        ) {
          existing.push({
            provider: cleanProvider,
            model_id: cleanModelId,
            name: cleanName,
          });
          localStorage.setItem("custom_user_models", JSON.stringify(existing));
        }
      } catch {}

      await fetchModels();
      return { success: true };
    },
    [models, fetchModels],
  );

  const removeCustomModel = useCallback(
    async (
      provider: string,
      modelId: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;

        if (sessionUser?.id) {
          const { error } = await supabase
            .from("user_models")
            .delete()
            .eq("provider", provider)
            .eq("model_id", modelId);
          if (error) {
            return { success: false, error: error.message };
          }
        }

        // Remove from localStorage
        try {
          const raw = localStorage.getItem("custom_user_models");
          if (raw) {
            const existing: Array<{
              provider: string;
              model_id: string;
              name?: string;
            }> = JSON.parse(raw);
            const filtered = existing.filter(
              (m) =>
                !(
                  m.provider.toLowerCase() === provider.toLowerCase() &&
                  m.model_id.toLowerCase() === modelId.toLowerCase()
                ),
            );
            localStorage.setItem(
              "custom_user_models",
              JSON.stringify(filtered),
            );
          }
        } catch {}

        await fetchModels();
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || "Failed to remove model",
        };
      }
    },
    [fetchModels],
  );

  const saveProviderApiKey = useCallback(
    async (
      provider: string,
      rawKey: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanKey = rawKey.trim();
        const cleanProvider = provider.toLowerCase().trim();
        const masterKey = getActiveMasterKey();

        if (!masterKey) {
          return {
            success: false,
            error:
              "Master Key is locked. Please unlock your master key to encrypt API keys.",
          };
        }

        const encrypted = await encryptApiKey(cleanKey, masterKey);

        const updatedEncrypted = {
          ...encryptedKeys,
          [cleanProvider]: encrypted,
        };
        const updatedDecrypted = {
          ...decryptedKeys,
          [cleanProvider]: cleanKey,
        };
        setEncryptedKeys(updatedEncrypted);
        setDecryptedKeys(updatedDecrypted);

        try {
          localStorage.setItem(
            "oxygen_encrypted_api_keys",
            JSON.stringify(updatedEncrypted),
          );
        } catch {}

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const sessionUser = sessionData?.session?.user;
          if (sessionUser?.id) {
            await db
              .from("user_api_keys")
              .delete()
              .eq("user_id", sessionUser.id)
              .eq("provider", cleanProvider);

            await db.from("user_api_keys").insert({
              user_id: sessionUser.id,
              provider: cleanProvider,
              encrypted_key: encrypted,
              updated_at: new Date().toISOString(),
            });
          }
        } catch {}

        await fetchModels();
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || "Failed to save API key",
        };
      }
    },
    [encryptedKeys, decryptedKeys, fetchModels],
  );

  const removeProviderApiKey = useCallback(
    async (
      provider: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanProvider = provider.toLowerCase().trim();
        const updatedEncrypted = { ...encryptedKeys };
        delete updatedEncrypted[cleanProvider];
        const updatedDecrypted = { ...decryptedKeys };
        delete updatedDecrypted[cleanProvider];

        setEncryptedKeys(updatedEncrypted);
        setDecryptedKeys(updatedDecrypted);

        try {
          localStorage.setItem(
            "oxygen_encrypted_api_keys",
            JSON.stringify(updatedEncrypted),
          );
        } catch {}

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const sessionUser = sessionData?.session?.user;
          if (sessionUser?.id) {
            await db
              .from("user_api_keys")
              .delete()
              .eq("user_id", sessionUser.id)
              .eq("provider", cleanProvider);
          }
        } catch {}

        await fetchModels();
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || "Failed to remove API key",
        };
      }
    },
    [encryptedKeys, decryptedKeys, fetchModels],
  );

  const getDecryptedApiKey = useCallback(
    (provider: string): string | null => {
      const clean = provider.toLowerCase().trim();
      return decryptedKeys[clean] || null;
    },
    [decryptedKeys],
  );

  const fetchProviderModels = useCallback(
    async (
      provider: string,
      explicitKey?: string,
    ): Promise<{
      models?: Array<{ id: string; name: string }>;
      error?: string;
    }> => {
      try {
        const cleanProvider = provider.toLowerCase().trim();
        const key = explicitKey || decryptedKeys[cleanProvider];

        if (
          !key &&
          cleanProvider !== "pollinations" &&
          cleanProvider !== "openrouter"
        ) {
          return {
            error: "API key is required to query models for this provider.",
          };
        }

        const res = await fetch("/api/ai/fetch-provider-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: cleanProvider, apiKey: key }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { error: data?.error || "Failed to fetch models" };
        }
        return { models: data.models || [] };
      } catch (err: any) {
        return { error: err?.message || "Network error fetching models" };
      }
    },
    [decryptedKeys],
  );

  const isProviderConfigured = useCallback(
    (provider: string) => {
      const lower = provider.toLowerCase();
      return configuredProviders.some((p) => p.toLowerCase() === lower);
    },
    [configuredProviders],
  );

  return {
    models,
    selectedModel,
    selectedProvider,
    setSelectedModel: (m: string) => updateSelection(m, selectedProvider),
    setSelectedProvider: (p: string) => updateSelection(selectedModel, p),
    setSelection: updateSelection,
    isLoading,
    refreshModels: fetchModels,
    hordeStatus,
    localStatus,
    configuredProviders,
    isProviderConfigured,
    addCustomModel,
    removeCustomModel,
    // API Key & Provider helpers
    encryptedKeys,
    decryptedKeys,
    isMasterKeyActive,
    loadApiKeys,
    saveProviderApiKey,
    removeProviderApiKey,
    getDecryptedApiKey,
    fetchProviderModels,
    chatbotDefaultModel,
    chatbotDefaultProvider,
    setChatbotDefault,
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    setResearchAgentDefault,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
    setResearchSummarizerDefault,
  };
};
