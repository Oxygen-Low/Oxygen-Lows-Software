import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { callDesktopBridge, isDesktopBridgeAvailable } from "@/lib/desktopBridge";

export interface Model {
  provider: string;
  model_id: string;
}

async function probeDirectLocalModels(): Promise<Model[]> {
  const discovered: Model[] = [];
  const seen = new Set<string>();

  const add = (provider: string, modelId: string | null | undefined) => {
    if (!modelId || typeof modelId !== "string" || !modelId.trim()) return;
    const trimmed = modelId.trim();
    const key = `${provider}:${trimmed}`;
    if (!seen.has(key)) {
      seen.add(key);
      discovered.push({ provider, model_id: trimmed });
    }
  };

  const probeUrls: Array<{ url: string; provider: string; parse: (data: any) => void }> = [
    {
      url: "http://127.0.0.1:1234/v1/models",
      provider: "local-lmstudio",
      parse: (data) => {
        if (Array.isArray(data?.data)) {
          for (const item of data.data) {
            if (item.type !== "embeddings" && item.id) add("local-lmstudio", item.id);
          }
        }
      },
    },
    {
      url: "http://127.0.0.1:11434/api/tags",
      provider: "local-ollama",
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
      parse: (data) => {
        if (data?.result && typeof data.result === "string") {
          add("local-kobold", data.result);
        }
      },
    },
  ];

  await Promise.allSettled(
    probeUrls.map(async ({ url, parse }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          parse(json);
        }
      } catch {
        // Ignore unreachable local endpoints
      }
    }),
  );

  return discovered;
}

export const useAiModels = (
  defaultModelId = "gpt-4o",
  defaultProvider = "openai",
) => {
  const { lastModelId, lastProvider, setModelPreference } = useTheme();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    lastModelId || defaultModelId,
  );
  const [selectedProvider, setSelectedProvider] = useState<string>(
    lastProvider || defaultProvider,
  );
  const [isLoading, setIsLoading] = useState(true);

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

      const addDiscovered = (provider: string, modelId: string | null | undefined) => {
        if (!modelId || typeof modelId !== "string" || !modelId.trim()) return;
        const trimmed = modelId.trim();
        const key = `${provider}:${trimmed}`;
        if (!seenLocal.has(key)) {
          seenLocal.add(key);
          discoveredLocalModels.push({ provider, model_id: trimmed });
        }
      };

      const bridgeTask = isDesktopBridgeAvailable()
        ? callDesktopBridge<Model[]>("fetch_local_models", {}, 6000).catch(() => [])
        : Promise.resolve([]);

      const directLocalTask = probeDirectLocalModels().catch(() => []);

      const fetchTasks = [
        supabase.from("user_models").select("provider, model_id").order("provider"),
        fetch("/api/ai/local-providers").then((res) => (res.ok ? res.json() : [])).catch(() => []),
        bridgeTask,
        directLocalTask,
      ];

      const results = await Promise.allSettled(fetchTasks);

      const dbModels = results[0].status === "fulfilled" ? (results[0].value as any).data || [] : [];
      const localModels = results[1].status === "fulfilled" ? (results[1].value as Model[]) || [] : [];
      const bridgeModels = results[2].status === "fulfilled" ? (results[2].value as Model[]) || [] : [];
      const directModels = results[3].status === "fulfilled" ? (results[3].value as Model[]) || [] : [];

      // Add bridge and direct models
      for (const bm of bridgeModels) {
        if (bm && bm.provider && bm.model_id) {
          addDiscovered(bm.provider, bm.model_id);
        }
      }
      for (const dm of directModels) {
        if (dm && dm.provider && dm.model_id) {
          addDiscovered(dm.provider, dm.model_id);
        }
      }
      const combined = [...(dbModels || []), ...(localModels || []), ...discoveredLocalModels];
      const allModels: Model[] = [];
      const seenAll = new Set<string>();

      for (const m of combined) {
        if (m && m.provider && m.model_id) {
          const trimmed = m.model_id.trim();
          const key = `${m.provider}:${trimmed}`;
          if (!seenAll.has(key)) {
            seenAll.add(key);
            allModels.push({ provider: m.provider, model_id: trimmed });
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
          // If not valid, try to use last known good from preferences if not already tried
          const prefValid =
            lastModelId &&
            lastProvider &&
            allModels.some(
              (m) => m.model_id === lastModelId && m.provider === lastProvider,
            );

          if (prefValid) {
            setSelectedModel(lastModelId!);
            setSelectedProvider(lastProvider!);
          } else {
            // Otherwise, default to the first one but ONLY if we don't have a valid selection yet
            // or if the current selection is completely invalid (which it is here)
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
  }, [lastModelId, lastProvider]);

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
    const interval = setInterval(fetchStatus, 30000); // refresh every 30s
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
  };
};
