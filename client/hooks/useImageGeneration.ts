import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import {
  fetchImageModels,
  generateImage,
  saveGeneratedImageToStorage,
  ImageModelInfo,
  ImageModelsResponse,
  AspectRatio,
  GenerateProgress,
  GeneratedImageResult,
} from "@/services/imageGen";

const HISTORY_STORAGE_KEY = "ai_image_generation_history";

export function useImageGeneration() {
  const { session } = useAuth();
  const isAuthenticated = !!session?.user;

  const [models, setModels] = useState<ImageModelsResponse>({
    cloudflare: [],
    horde: [],
  });
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Model selection state
  const [selectedProvider, setSelectedProvider] = useState<"cloudflare" | "horde">(
    isAuthenticated ? "cloudflare" : "horde",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    "@cf/black-forest-labs/flux-1-schnell",
  );

  // Generation options
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [steps, setSteps] = useState<number>(4);
  const [guidance, setGuidance] = useState<number>(7.5);
  const [seed, setSeed] = useState<number | undefined>(undefined);

  // Runtime generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [currentImage, setCurrentImage] = useState<GeneratedImageResult | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Gallery history
  const [history, setHistory] = useState<GeneratedImageResult[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync provider default based on authentication
  useEffect(() => {
    if (!isAuthenticated && selectedProvider === "cloudflare") {
      setSelectedProvider("horde");
      setSelectedModel("SDXL 1.0");
    }
  }, [isAuthenticated, selectedProvider]);

  // Load models on mount
  const loadModels = useCallback(async () => {
    setIsLoadingModels(true);
    setModelsError(null);
    try {
      const data = await fetchImageModels();
      setModels(data);

      // Pick sensible default if none chosen
      if (selectedProvider === "cloudflare" && data.cloudflare.length > 0) {
        if (!data.cloudflare.some((m) => m.id === selectedModel)) {
          setSelectedModel(data.cloudflare[0].id);
          setSteps(data.cloudflare[0].defaultSteps || 4);
        }
      } else if (selectedProvider === "horde" && data.horde.length > 0) {
        if (!data.horde.some((m) => m.id === selectedModel)) {
          setSelectedModel(data.horde[0].id);
          setSteps(data.horde[0].defaultSteps || 20);
        }
      }
    } catch (err: any) {
      setModelsError(err.message || "Failed loading image models");
    } finally {
      setIsLoadingModels(false);
    }
  }, [selectedProvider, selectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Save history to localStorage
  useEffect(() => {
    try {
      // Keep up to 50 recent images
      const trimmed = history.slice(0, 50);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("Failed saving image history to localStorage:", e);
    }
  }, [history]);

  // Update default steps when model changes
  const handleSelectModel = useCallback(
    (modelId: string, provider?: "cloudflare" | "horde") => {
      const p = provider || selectedProvider;
      setSelectedModel(modelId);
      if (provider) setSelectedProvider(provider);

      const list = p === "cloudflare" ? models.cloudflare : models.horde;
      const found = list.find((m) => m.id === modelId);
      if (found) {
        setSteps(found.defaultSteps || (modelId.includes("flux") ? 4 : 20));
      }
    },
    [models, selectedProvider],
  );

  // Execute generation
  const generate = useCallback(
    async (
      overridePrompt?: string,
      overrideModel?: string,
      overrideProvider?: "cloudflare" | "horde",
      overrideRatio?: AspectRatio,
    ): Promise<GeneratedImageResult> => {
      const p = overridePrompt !== undefined ? overridePrompt : prompt;
      const m = overrideModel || selectedModel;
      const prov = overrideProvider || selectedProvider;
      const ratio = overrideRatio || aspectRatio;

      if (!p.trim()) {
        throw new Error("Please enter a prompt.");
      }

      setIsGenerating(true);
      setGenerationError(null);
      setProgress({
        phase: "submitting",
        progressPercent: 5,
        message: "Initializing image generation...",
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const result = await generateImage(
          {
            provider: prov,
            model: m,
            prompt: p.trim(),
            negative_prompt: negativePrompt.trim() || undefined,
            aspectRatio: ratio,
            steps,
            guidance,
            seed,
            signal: abortController.signal,
          },
          (prog) => setProgress(prog),
        );

        // Find model name for display
        const list = prov === "cloudflare" ? models.cloudflare : models.horde;
        const modelObj = list.find((item) => item.id === m);
        result.modelName = modelObj ? modelObj.name : m;

        setCurrentImage(result);
        setHistory((prev) => [result, ...prev]);

        // Auto-save to user storage if authenticated
        if (isAuthenticated && session?.user) {
          saveGeneratedImageToStorage(result.url, result.prompt)
            .then((storageRes) => {
              if (storageRes?.url) {
                setCurrentImage((curr) =>
                  curr && curr.id === result.id
                    ? { ...curr, storagePath: storageRes.url }
                    : curr,
                );
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === result.id
                      ? { ...item, storagePath: storageRes.url }
                      : item,
                  ),
                );
              }
            })
            .catch((e) => console.error("Storage background save failed:", e));
        }

        return result;
      } catch (err: any) {
        if (err.name === "AbortError" || err.message?.includes("aborted")) {
          setGenerationError("Generation cancelled.");
        } else {
          setGenerationError(err.message || "Failed to generate image.");
        }
        throw err;
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [
      prompt,
      selectedModel,
      selectedProvider,
      aspectRatio,
      negativePrompt,
      steps,
      guidance,
      seed,
      models,
      isAuthenticated,
      session,
    ],
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setProgress(null);
    }
  }, []);

  const deleteFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {}
  }, []);

  return {
    models,
    isLoadingModels,
    modelsError,
    loadModels,

    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel: handleSelectModel,

    aspectRatio,
    setAspectRatio,
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    steps,
    setSteps,
    guidance,
    setGuidance,
    seed,
    setSeed,

    isGenerating,
    progress,
    currentImage,
    setCurrentImage,
    generationError,

    history,
    generate,
    cancel,
    deleteFromHistory,
    clearHistory,
    isAuthenticated,
  };
}
