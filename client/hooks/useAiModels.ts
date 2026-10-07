import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/db";
import { fetchPollinationsBalance } from "@/services/pollinationsClient";
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
  rate?: string;
  category?: "standard" | "community" | "custom";
  isCustom?: boolean;
  isCommunity?: boolean;
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
    id: "pollinations",
    name: "Pollinations AI",
    description: "Free & community text AI models (API key from enter.pollinations.ai)",
    requiresKey: true,
    keyPlaceholder: "API Key (pk_... / sk_... from enter.pollinations.ai)",
    docsUrl: "https://enter.pollinations.ai",
  },
];

export const BUILTIN_MODELS: Model[] = [
  {
    provider: "pollinations",
    model_id: "inclusionai/ling-3.1-flash",
    name: "Free",
    rate: "infinite requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "amazon/nova-micro-v1",
    name: "Cheap",
    rate: "around 10.2k requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "openai/gpt-6-luna",
    name: "Fast",
    rate: "around 3k requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "openai/gpt-5.6-terra",
    name: "Balanced",
    rate: "around 55 requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "openai/gpt-6.1-sol",
    name: "Smart",
    rate: "around 85 requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "openai/gpt-6-astra",
    name: "Smartest",
    rate: "around 20 requests/$1",
    category: "standard",
  },
  {
    provider: "pollinations",
    model_id: "community/MarcosFRG/deepseek-v4-flash-0731",
    name: "Deepseek v4 Flash",
    rate: "infinite requests/$1",
    category: "community",
    isCommunity: true,
  },
  {
    provider: "pollinations",
    model_id: "community/vendouple/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    rate: "infinite requests/$1",
    category: "community",
    isCommunity: true,
  },
];

export const POPULAR_PRESETS: Record<
  string,
  Array<{ model_id: string; name: string }>
> = {
  pollinations: [
    { model_id: "inclusionai/ling-3.1-flash", name: "Free" },
    { model_id: "amazon/nova-micro-v1", name: "Cheap" },
    { model_id: "openai/gpt-6-luna", name: "Fast" },
    { model_id: "openai/gpt-5.6-terra", name: "Balanced" },
    { model_id: "openai/gpt-6.1-sol", name: "Smart" },
    { model_id: "openai/gpt-6-astra", name: "Smartest" },
    {
      model_id: "community/MarcosFRG/deepseek-v4-flash-0731",
      name: "Deepseek v4 Flash",
    },
    {
      model_id: "community/vendouple/gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
    },
  ],
};

const DEFAULT_CHATBOT_MODEL = "inclusionai/ling-3.1-flash";
const DEFAULT_RESEARCH_MODEL = "inclusionai/ling-3.1-flash";
const DEFAULT_SUMMARIZER_MODEL = "inclusionai/ling-3.1-flash";

const LOCAL_STORAGE_KEY_POLLINATIONS = "pollinations_api_key";
const LOCAL_STORAGE_CUSTOM_MODELS = "pollinations_custom_models";
const LOCAL_STORAGE_DEFAULTS = "pollinations_feature_defaults";

export function useAiModels() {
  const [models, setModels] = useState<Model[]>(BUILTIN_MODELS);
  const [customModels, setCustomModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pollinationsApiKey, setPollinationsApiKeyState] = useState<string>(
    () => {
      try {
        const direct =
          localStorage.getItem(LOCAL_STORAGE_KEY_POLLINATIONS) ||
          localStorage.getItem("oxygen_pollinations_api_key");
        if (direct && direct.trim()) return direct.trim();
        const legacy = localStorage.getItem("oxygen_api_keys");
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed?.pollinations) return parsed.pollinations;
        }
      } catch {}
      return "";
    },
  );
  const [pollenBalance, setPollenBalance] = useState<number>(0);
  const [isMasterKeyActive, setIsMasterKeyActive] = useState(false);
  const loadIdRef = useRef<number>(0);

  // Feature Defaults
  const [chatbotDefaultModel, setChatbotDefaultModelState] = useState<string>(
    () => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_DEFAULTS);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.chatbot) return parsed.chatbot;
        }
      } catch {}
      return DEFAULT_CHATBOT_MODEL;
    },
  );
  const [researchAgentDefaultModel, setResearchAgentDefaultModelState] =
    useState<string>(() => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_DEFAULTS);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.researchAgent) return parsed.researchAgent;
        }
      } catch {}
      return DEFAULT_RESEARCH_MODEL;
    });
  const [
    researchSummarizerDefaultModel,
    setResearchSummarizerDefaultModelState,
  ] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_DEFAULTS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.researchSummarizer) return parsed.researchSummarizer;
      }
    } catch {}
    return DEFAULT_SUMMARIZER_MODEL;
  });

  // Load Custom Models from storage
  const loadCustomModels = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_CUSTOM_MODELS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.map((m: any) => ({
            id: m.id || m.model_id,
            provider: "pollinations",
            model_id: m.model_id || m.id,
            name: m.name || m.model_id || m.id,
            isCustom: true,
          }));
          setCustomModels(valid);
          return valid;
        }
      }
    } catch (e) {
      console.error("Failed to load custom pollinations models:", e);
    }
    return [];
  }, []);

  // Load Defaults
  const loadDefaults = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_DEFAULTS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.chatbot) setChatbotDefaultModelState(parsed.chatbot);
        if (parsed.research) setResearchAgentDefaultModelState(parsed.research);
        if (parsed.summarizer)
          setResearchSummarizerDefaultModelState(parsed.summarizer);
      }
    } catch {}
  }, []);

  // Load Pollinations API Key
  const loadApiKey = useCallback(async () => {
    const currentLoadId = ++loadIdRef.current;
    let key = "";
    try {
      const direct =
        localStorage.getItem(LOCAL_STORAGE_KEY_POLLINATIONS) ||
        localStorage.getItem("oxygen_pollinations_api_key");
      if (direct && direct.trim()) {
        key = direct.trim();
      } else {
        const legacyEncrypted = localStorage.getItem("oxygen_api_keys");
        if (legacyEncrypted) {
          const parsed = JSON.parse(legacyEncrypted);
          if (parsed?.pollinations) {
            key = parsed.pollinations;
          }
        }
      }

      if (!key && supabase?.auth?.getSession) {
        const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }));
        const token = sessionData?.session?.access_token;
        if (token && typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null") {
          try {
            const url = new URL("/api/ai/keys", window.location.origin).toString();
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              const polliKey = data?.keys?.find(
                (k: any) => k.provider === "pollinations",
              );
              if (polliKey?.key) {
                key = polliKey.key;
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn("Failed to load pollinations api key", e);
    }

    if (currentLoadId !== loadIdRef.current) return;

    setPollinationsApiKeyState(key);
    if (key) {
      try {
        const bal = await fetchPollinationsBalance(key);
        if (currentLoadId === loadIdRef.current) {
          setPollenBalance(bal);
        }
      } catch {}
    } else {
      setPollenBalance(0);
    }
  }, []);

  useEffect(() => {
    loadCustomModels();
    loadDefaults();
    loadApiKey();
    setIsMasterKeyActive(!!getActiveMasterKey());
  }, [loadCustomModels, loadDefaults, loadApiKey]);

  // Combine built-in models and custom models
  useEffect(() => {
    const combined = [...BUILTIN_MODELS];
    for (const cm of customModels) {
      if (!combined.some((m) => m.model_id === cm.model_id)) {
        combined.push(cm);
      }
    }
    setModels(combined);
  }, [customModels]);

  const refreshPollenBalance = useCallback(
    async (keyToUse?: string) => {
      const activeKey = keyToUse !== undefined ? keyToUse : pollinationsApiKey;
      if (!activeKey || !activeKey.trim()) {
        setPollenBalance(0);
        return 0;
      }
      try {
        const bal = await fetchPollinationsBalance(activeKey);
        setPollenBalance(bal);
        return bal;
      } catch {
        setPollenBalance(0);
        return 0;
      }
    },
    [pollinationsApiKey],
  );

  const setPollinationsApiKey = useCallback(
    async (key: string) => {
      loadIdRef.current++;
      const trimmed = key.trim();
      setPollinationsApiKeyState(trimmed);
      try {
        if (trimmed) {
          localStorage.setItem(LOCAL_STORAGE_KEY_POLLINATIONS, trimmed);
          // Also sync to legacy map for cross-component compatibility
          const legacy = localStorage.getItem("oxygen_api_keys");
          const parsed = legacy ? JSON.parse(legacy) : {};
          parsed.pollinations = trimmed;
          localStorage.setItem("oxygen_api_keys", JSON.stringify(parsed));
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY_POLLINATIONS);
          localStorage.removeItem("oxygen_pollinations_api_key");
          const legacy = localStorage.getItem("oxygen_api_keys");
          if (legacy) {
            const parsed = JSON.parse(legacy);
            delete parsed.pollinations;
            localStorage.setItem("oxygen_api_keys", JSON.stringify(parsed));
          }
        }

        // Sync to server if authenticated
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token && typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null") {
          if (trimmed) {
            const url = new URL("/api/ai/keys", window.location.origin).toString();
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ provider: "pollinations", apiKey: trimmed, key: trimmed }),
            });
            if (!res.ok) {
              let errorMsg = `Failed to save API key to server (${res.status})`;
              try {
                const errData = await res.json();
                if (errData?.error) {
                  errorMsg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
                }
              } catch {}
              throw new Error(errorMsg);
            }
          } else {
            const url = new URL("/api/ai/keys/pollinations", window.location.origin).toString();
            const res = await fetch(url, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              let errorMsg = `Failed to remove API key from server (${res.status})`;
              try {
                const errData = await res.json();
                if (errData?.error) {
                  errorMsg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
                }
              } catch {}
              throw new Error(errorMsg);
            }
          }
        }
      } catch (e) {
        console.error("Failed to save pollinations API key:", e);
        throw e;
      }

      await refreshPollenBalance(trimmed);
    },
    [refreshPollenBalance],
  );

  const saveApiKey = useCallback(
    async (provider: string, key: string) => {
      if (provider.toLowerCase() === "pollinations" || !provider) {
        await setPollinationsApiKey(key);
      }
    },
    [setPollinationsApiKey],
  );

  const getApiKey = useCallback(
    async (provider?: string) => {
      if (!provider || provider.toLowerCase() === "pollinations") {
        return pollinationsApiKey || null;
      }
      return null;
    },
    [pollinationsApiKey],
  );

  const isProviderConfigured = useCallback(
    (provider: string) => {
      if (provider.toLowerCase() === "pollinations") {
        return !!pollinationsApiKey && pollinationsApiKey.trim().length > 0;
      }
      return false;
    },
    [pollinationsApiKey],
  );

  const configuredProviders = useMemo(() => {
    return pollinationsApiKey && pollinationsApiKey.trim() ? ["pollinations"] : [];
  }, [pollinationsApiKey]);

  const addCustomModel = useCallback(
    async (newModel: { model_id: string; name?: string; provider?: string }) => {
      const trimmedId = newModel.model_id.trim();
      if (!trimmedId) return;

      const item: Model = {
        id: trimmedId,
        provider: "pollinations",
        model_id: trimmedId,
        name: newModel.name?.trim() || trimmedId,
        isCustom: true,
      };

      const updated = [...customModels.filter((m) => m.model_id !== trimmedId), item];
      setCustomModels(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_CUSTOM_MODELS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to persist custom model:", e);
      }
    },
    [customModels],
  );

  const removeCustomModel = useCallback(
    async (model_id: string) => {
      const updated = customModels.filter((m) => m.model_id !== model_id);
      setCustomModels(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_CUSTOM_MODELS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to persist model deletion:", e);
      }
    },
    [customModels],
  );

  const saveDefaults = (key: string, val: string) => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_DEFAULTS);
      const parsed = stored ? JSON.parse(stored) : {};
      parsed[key] = val;
      localStorage.setItem(LOCAL_STORAGE_DEFAULTS, JSON.stringify(parsed));
    } catch {}
  };

  const setChatbotDefault = useCallback(
    async (modelId: string, _provider?: string) => {
      setChatbotDefaultModelState(modelId);
      saveDefaults("chatbot", modelId);
    },
    [],
  );

  const setResearchAgentDefault = useCallback(
    async (modelId: string, _provider?: string) => {
      setResearchAgentDefaultModelState(modelId);
      saveDefaults("research", modelId);
    },
    [],
  );

  const setResearchSummarizerDefault = useCallback(
    async (modelId: string, _provider?: string) => {
      setResearchSummarizerDefaultModelState(modelId);
      saveDefaults("summarizer", modelId);
    },
    [],
  );

  const refreshModels = useCallback(async () => {
    setIsLoading(true);
    try {
      loadCustomModels();
      await refreshPollenBalance();
    } finally {
      setIsLoading(false);
    }
  }, [loadCustomModels, refreshPollenBalance]);

  return {
    models,
    customModels,
    isLoading,
    refreshModels,
    pollinationsApiKey,
    setPollinationsApiKey,
    saveApiKey,
    getApiKey,
    isProviderConfigured,
    configuredProviders,
    addCustomModel,
    removeCustomModel,
    chatbotDefaultModel,
    chatbotDefaultProvider: "pollinations",
    setChatbotDefault,
    researchAgentDefaultModel,
    researchAgentDefaultProvider: "pollinations",
    setResearchAgentDefault,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider: "pollinations",
    setResearchSummarizerDefault,
    pollenBalance,
    refreshPollenBalance,
    isMasterKeyActive,
    localStatus: {
      ollama: false,
      lmstudio: false,
      kobold: false,
      desktopBridge: false,
      totalLocal: 0,
    } as LocalProviderStatus,
    hordeStatus: {} as Record<string, any>,
  };
}
