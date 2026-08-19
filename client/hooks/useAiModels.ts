import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { callDesktopBridge, isDesktopBridgeAvailable } from "@/lib/desktopBridge";

export interface Model {
  provider: string;
  model_id: string;
}

export const useAiModels = (
  defaultModelId = "gpt-4o",
  defaultProvider = "openai",
) => {
  const { lastModelId, lastProvider, setModelPreference } = useTheme();
  const [rawModels, setRawModels] = useState<Model[]>([]);
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

  const models = useMemo(() => {
    return rawModels.filter((m) => {
      if (m.provider === "horde" && m.model_id === "Coder") {
        return (hordeStatus[m.model_id]?.workers ?? 0) > 0;
      }
      return true;
    });
  }, [rawModels, hordeStatus]);

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

      const lmStudioUrls = [
        "http://127.0.0.1:1234/v1/models",
        "http://localhost:1234/v1/models",
        "http://127.0.0.1:1234/api/v0/models",
        "http://localhost:1234/api/v0/models",
      ];

      const ollamaUrls = [
        "http://127.0.0.1:11434/api/tags",
        "http://localhost:11434/api/tags",
        "http://127.0.0.1:11434/v1/models",
        "http://localhost:11434/v1/models",
      ];

      const koboldUrls = [
        "http://127.0.0.1:5001/api/v1/model",
        "http://localhost:5001/api/v1/model",
        "http://127.0.0.1:5000/api/v1/model",
        "http://localhost:5000/api/v1/model",
        "http://127.0.0.1:5001/v1/models",
        "http://localhost:5001/v1/models",
      ];

      const probeJson = (url: string) =>
        fetch(url, { signal: AbortSignal.timeout(2000) })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null);

      const bridgeTask = isDesktopBridgeAvailable()
        ? callDesktopBridge<Model[]>("fetch_local_models", {}, 2500).catch(() => [])
        : Promise.resolve([]);

      const fetchTasks = [
        supabase.from("user_models").select("provider, model_id").order("provider"),
        fetch("/api/ai/local-providers").then((res) => (res.ok ? res.json() : [])).catch(() => []),
        bridgeTask,
        Promise.allSettled(lmStudioUrls.map(probeJson)),
        Promise.allSettled(ollamaUrls.map(probeJson)),
        Promise.allSettled(koboldUrls.map(probeJson)),
      ];

      const results = await Promise.allSettled(fetchTasks);

      const dbModels = results[0].status === "fulfilled" ? (results[0].value as any).data || [] : [];
      const localModels = results[1].status === "fulfilled" ? (results[1].value as Model[]) || [] : [];
      const bridgeModels = results[2].status === "fulfilled" ? (results[2].value as Model[]) || [] : [];

      // Add bridge models
      for (const bm of bridgeModels) {
        if (bm && bm.provider && bm.model_id) {
          addDiscovered(bm.provider, bm.model_id);
        }
      }

      // Add LM Studio models from direct fetch
      const lmStudioSettled = results[3].status === "fulfilled" ? (results[3].value as PromiseSettledResult<any>[]) : [];
      for (const res of lmStudioSettled) {
        if (res.status === "fulfilled" && res.value) {
          const val = res.value;
          const items = Array.isArray(val) ? val : Array.isArray(val.data) ? val.data : Array.isArray(val.models) ? val.models : [];
          for (const item of items) {
            if (item && item.type !== "embeddings") {
              const modelId = item.id || item.name || item.model || item.key;
              addDiscovered("local-lmstudio", modelId);
            }
          }
        }
      }

      // Add Ollama models from direct fetch
      const ollamaSettled = results[4].status === "fulfilled" ? (results[4].value as PromiseSettledResult<any>[]) : [];
      for (const res of ollamaSettled) {
        if (res.status === "fulfilled" && res.value) {
          const val = res.value;
          const items = Array.isArray(val.models) ? val.models : Array.isArray(val.data) ? val.data : Array.isArray(val) ? val : [];
          for (const item of items) {
            if (item) {
              const modelId = item.name || item.model || item.id;
              addDiscovered("local-ollama", modelId);
            }
          }
        }
      }

      // Add Kobold models from direct fetch
      const koboldSettled = results[5].status === "fulfilled" ? (results[5].value as PromiseSettledResult<any>[]) : [];
      for (const res of koboldSettled) {
        if (res.status === "fulfilled" && res.value) {
          const val = res.value;
          if (typeof val.result === "string") {
            addDiscovered("local-kobold", val.result);
          } else {
            const items = Array.isArray(val.data) ? val.data : Array.isArray(val) ? val : [];
            for (const item of items) {
              if (item) {
                const modelId = typeof item === "string" ? item : item.id || item.name;
                addDiscovered("local-kobold", modelId);
              }
            }
          }
        }
      }

      const allModels: Model[] = [...(dbModels || []), ...localModels, ...discoveredLocalModels];
      setRawModels(allModels);
    } catch (e) {
      console.error("Failed to fetch models", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (models.length > 0) {
      // Check if current selection is valid in the visible models list
      const isValid = models.some(
        (m) =>
          m.model_id === selectedModel &&
          m.provider === selectedProvider,
      );

      if (!isValid) {
        // If not valid, try to use last known good from preferences if not already tried
        const prefValid =
          lastModelId &&
          lastProvider &&
          models.some(
            (m) => m.model_id === lastModelId && m.provider === lastProvider,
          );

        if (prefValid) {
          setSelectedModel(lastModelId!);
          setSelectedProvider(lastProvider!);
        } else {
          setSelectedModel(models[0].model_id);
          setSelectedProvider(models[0].provider);
        }
      }
    }
  }, [models, selectedModel, selectedProvider, lastModelId, lastProvider]);

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
