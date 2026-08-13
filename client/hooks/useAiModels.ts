import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

export interface Model {
  provider: string;
  model_id: string;
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
      const localUrls = [
        "http://127.0.0.1:11434/api/tags",
        "http://127.0.0.1:1234/v1/models",
        "http://127.0.0.1:5001/api/v1/model"
      ];

      const fetchTasks = [
        supabase.from("user_models").select("provider, model_id").order("provider"),
        fetch("/api/ai/local-providers").then(res => res.ok ? res.json() : []).catch(() => []),
        ...localUrls.map(url => fetch(url, { signal: AbortSignal.timeout(2000) }).then(res => res.ok ? res.json() : null).catch(() => null))
      ];

      const results = await Promise.allSettled(fetchTasks);

      const dbModels = results[0].status === "fulfilled" ? results[0].value.data || [] : [];
      const localModels = results[1].status === "fulfilled" ? results[1].value || [] : [];

      const discoveredLocalModels: Model[] = [];
      
      const ollamaData = results[2].status === "fulfilled" ? results[2].value : null;
      if (ollamaData && ollamaData.models) {
        for (const m of ollamaData.models) {
          discoveredLocalModels.push({ provider: "local-ollama", model_id: m.name });
        }
      }

      const lmStudioData = results[3].status === "fulfilled" ? results[3].value : null;
      if (lmStudioData && lmStudioData.data) {
        for (const m of lmStudioData.data) {
          discoveredLocalModels.push({ provider: "local-lmstudio", model_id: m.id });
        }
      }

      const koboldData = results[4].status === "fulfilled" ? results[4].value : null;
      if (koboldData && koboldData.result) {
        discoveredLocalModels.push({ provider: "local-kobold", model_id: koboldData.result });
      }

      const allModels: Model[] = [...(dbModels || []), ...localModels, ...discoveredLocalModels];
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
