import React, { useState, useEffect } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAiModels, type Model } from "@/hooks/useAiModels";
import {
  executeEntityGeneration,
  type GeneratedEntityResult,
  type GenerationStep,
} from "@/services/entityGenerator";
export type { GeneratedEntityResult, GenerationStep };

import {
  Sparkles,
  Loader2,
  StopCircle,
  Globe,
  User,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface Character {
  id?: string;
  name: string;
  display_name?: string | null;
  short_description?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
  hidden_description?: string | null;
  is_universe?: boolean;
  is_race?: boolean;
  race_id?: string | null;
  universe_id?: string | null;
}

export interface AiGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: "character" | "universe" | "race";
  initialUniverse?: Character | null;
  initialRace?: Character | null;
  universes: Character[];
  races?: Character[];
  onApply: (entity: GeneratedEntityResult) => void;
  generateEntityFn?: (options: any) => Promise<GeneratedEntityResult>;
}

export function AiGenerateDialog({
  open,
  onOpenChange,
  initialType = "character",
  initialUniverse = null,
  initialRace = null,
  universes = [],
  races = [],
  onApply,
  generateEntityFn,
}: AiGenerateDialogProps) {
  const { t } = useTranslation();
  let hookData: any;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    hookData = useAiModels();
  } catch {
    hookData = {
      models: [],
      selectedModel: "@cf/nvidia/nemotron-3-120b-a12b",
      selectedProvider: "cloudflare",
    };
  }

  const {
    models = [],
    selectedModel: hookModel = "@cf/nvidia/nemotron-3-120b-a12b",
    selectedProvider: hookProvider = "cloudflare",
  } = hookData;

  const [targetType, setTargetType] = useState<
    "character" | "universe" | "race"
  >(initialType || "character");
  const [prompt, setPrompt] = useState("");
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(
    initialUniverse?.id || "",
  );
  const [selectedRaceId, setSelectedRaceId] = useState<string>(
    initialRace?.id || "",
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(
    hookModel || "@cf/nvidia/nemotron-3-120b-a12b",
  );
  const [selectedProvider, setSelectedProvider] = useState<string>(
    hookProvider || "cloudflare",
  );
  const [includeStats, setIncludeStats] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<GenerationStep>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      if (initialType) setTargetType(initialType);
      if (initialUniverse) setSelectedUniverseId(initialUniverse.id || "");
      if (initialRace) setSelectedRaceId(initialRace.id || "");
    }
  }, [open, initialType, initialUniverse, initialRace]);

  useEffect(() => {
    if (hookModel) {
      setSelectedModelId(hookModel);
    }
    if (hookProvider) {
      setSelectedProvider(hookProvider);
    }
  }, [hookModel, hookProvider]);

  if (!open) return null;

  const handleStartGeneration = async () => {
    if (!prompt.trim()) {
      setErrorMessage(
        t(
          "characters.aiGenerate.errorPromptRequired",
          undefined,
          "Please enter a concept or prompt to generate.",
        ),
      );
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);
    setCurrentStep("idle");

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const chosenUniverse =
        (targetType === "character" || targetType === "race") &&
        selectedUniverseId
          ? universes.find((u) => u.id === selectedUniverseId) || null
          : null;

      const chosenRace =
        targetType === "character" && selectedRaceId
          ? races.find((r) => r.id === selectedRaceId) || null
          : null;

      const chosenModel = models.find(
        (m) => m.model_id === selectedModelId,
      ) || {
        provider: selectedProvider,
        model_id: selectedModelId,
      };

      const generator = generateEntityFn || executeEntityGeneration;

      const result = await generator({
        type: targetType,
        prompt,
        include_stats: targetType === "character" && includeStats,
        model: chosenModel,
        universe: chosenUniverse,
        race: chosenRace,
        onProgress: (step: GenerationStep, detail?: string) => {
          setCurrentStep(step);
          if (detail) setStatusMessage(detail);
        },
        signal: controller.signal,
      });

      setIsGenerating(false);
      onApply(result);
      onOpenChange(false);
    } catch (err: any) {
      setIsGenerating(false);
      if (controller.signal.aborted || err.name === "AbortError") {
        setCurrentStep("idle");
        setStatusMessage("");
      } else {
        setCurrentStep("error");
        setErrorMessage(
          err.message ||
            t(
              "characters.aiGenerate.errorGeneric",
              undefined,
              "Failed to generate. Please try again.",
            ),
        );
      }
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsGenerating(false);
    setCurrentStep("idle");
    setStatusMessage("");
  };

  const availableModels: Model[] =
    models.length > 0
      ? models
      : [
          {
            provider: "cloudflare",
            model_id: "@cf/nvidia/nemotron-3-120b-a12b",
            name: "Nemotron 3 120B (Smart)",
          },
          {
            provider: "cloudflare",
            model_id: "@cf/google/gemma-4-26b-a4b-it",
            name: "Gemma 4 26B IT (Balanced)",
          },
          {
            provider: "horde",
            model_id: "Fast",
            name: "Fast - google/gemma-4-31b",
          },
        ];

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : onOpenChange}>
      <DialogContent
        data-testid="ai-generate-dialog"
        className="max-w-2xl bg-slate-900 border-slate-800 text-white shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            {targetType === "character"
              ? t(
                  "characters.aiGenerate.titleCharacter",
                  undefined,
                  "AI Character Generator",
                )
              : targetType === "race"
                ? t(
                    "characters.aiGenerate.titleRace",
                    undefined,
                    "AI Race Generator",
                  )
                : t(
                    "characters.aiGenerate.titleUniverse",
                    undefined,
                    "AI Universe Generator",
                  )}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-sm">
            {t(
              "characters.aiGenerate.subtitle",
              undefined,
              "Describe your concept and let AI research and generate detailed lore and attributes.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Target Type Selector */}
          <div className="space-y-1.5" data-testid="target-type-selector">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t(
                "characters.aiGenerate.targetType",
                undefined,
                "Generation Target",
              )}
            </label>
            <div className="flex gap-2 p-1 bg-slate-950/60 border border-slate-800 rounded-lg">
              <label
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md cursor-pointer text-sm font-medium transition-all ${
                  targetType === "character"
                    ? "bg-cyan-600/20 border border-cyan-500/50 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="targetType"
                  value="character"
                  checked={targetType === "character"}
                  disabled={isGenerating}
                  onChange={() => setTargetType("character")}
                  className="sr-only"
                />
                <User className="w-4 h-4" />
                {t("characters.aiGenerate.character", undefined, "Character")}
              </label>
              <label
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md cursor-pointer text-sm font-medium transition-all ${
                  targetType === "race"
                    ? "bg-cyan-600/20 border border-cyan-500/50 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="targetType"
                  value="race"
                  checked={targetType === "race"}
                  disabled={isGenerating}
                  onChange={() => setTargetType("race")}
                  className="sr-only"
                />
                <Users className="w-4 h-4" />
                {t("characters.aiGenerate.race", undefined, "Race")}
              </label>
              <label
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md cursor-pointer text-sm font-medium transition-all ${
                  targetType === "universe"
                    ? "bg-cyan-600/20 border border-cyan-500/50 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <input
                  type="radio"
                  name="targetType"
                  value="universe"
                  checked={targetType === "universe"}
                  disabled={isGenerating}
                  onChange={() => setTargetType("universe")}
                  className="sr-only"
                />
                <Globe className="w-4 h-4" />
                {t("characters.aiGenerate.universe", undefined, "Universe")}
              </label>
            </div>
          </div>

          {/* Race Selector (Only when targetType === character) */}
          {targetType === "character" && (
            <div className="space-y-1.5" data-testid="race-selector-container">
              <label
                htmlFor="race-select"
                className="text-xs font-semibold text-slate-400 uppercase tracking-wider block"
              >
                {t(
                  "characters.aiGenerate.targetRace",
                  undefined,
                  "Character Race (Optional)",
                )}
              </label>
              <select
                id="race-select"
                data-testid="race-select"
                value={selectedRaceId}
                disabled={isGenerating}
                onChange={(e) => setSelectedRaceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
              >
                <option value="">
                  {t(
                    "characters.aiGenerate.noRaceOption",
                    undefined,
                    "None / Any Race",
                  )}
                </option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name || r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Universe Selector (When targetType === character or targetType === race) */}
          {(targetType === "character" || targetType === "race") && (
            <div
              className="space-y-1.5"
              data-testid="universe-selector-container"
            >
              <label
                htmlFor="universe-select"
                className="text-xs font-semibold text-slate-400 uppercase tracking-wider block"
              >
                {t(
                  "characters.aiGenerate.targetUniverse",
                  undefined,
                  "Target Universe (Optional)",
                )}
              </label>
              <select
                id="universe-select"
                data-testid="universe-select"
                value={selectedUniverseId}
                disabled={isGenerating}
                onChange={(e) => setSelectedUniverseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
              >
                <option value="">
                  {t(
                    "characters.aiGenerate.standaloneOption",
                    undefined,
                    "None (Standalone / Any Universe)",
                  )}
                </option>
                {universes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AI Model Selector */}
          <div className="space-y-1.5" data-testid="model-selector-container">
            <label
              htmlFor="model-select"
              className="text-xs font-semibold text-slate-400 uppercase tracking-wider block"
            >
              {t("characters.aiGenerate.model", undefined, "AI Model")}
            </label>
            <select
              id="model-select"
              data-testid="model-select"
              value={selectedModelId}
              disabled={isGenerating}
              onChange={(e) => {
                const found = availableModels.find(
                  (m) => m.model_id === e.target.value,
                );
                setSelectedModelId(e.target.value);
                if (found) setSelectedProvider(found.provider);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
            >
              {availableModels.map((m) => (
                <option key={`${m.provider}-${m.model_id}`} value={m.model_id}>
                  {m.name || m.model_id} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          {/* Prompt / Concept Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="prompt-input"
              className="text-xs font-semibold text-slate-400 uppercase tracking-wider block"
            >
              {t(
                "characters.aiGenerate.promptLabel",
                undefined,
                "Concept & Prompt",
              )}
            </label>
            <Textarea
              id="prompt-input"
              data-testid="prompt-input"
              value={prompt}
              disabled={isGenerating}
              placeholder={t(
                "characters.aiGenerate.promptPlaceholder",
                undefined,
                "Describe the character's background, personality, role, or universe theme...",
              )}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-slate-950 border-slate-800 min-h-[110px] text-sm text-slate-200 placeholder:text-slate-500 focus:ring-cyan-500"
            />
            {targetType === "character" && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="include-stats-checkbox"
                  data-testid="include-stats-checkbox"
                  checked={includeStats}
                  disabled={isGenerating}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="include-stats-checkbox"
                  className="text-xs text-slate-300 cursor-pointer select-none"
                >
                  {t(
                    "characters.aiGenerate.includeStats",
                    undefined,
                    "Generate Character Stats",
                  )}
                </label>
              </div>
            )}
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              data-testid="ai-generate-error"
              className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Visual Multi-Stage Progress Tracker */}
          {isGenerating && (
            <div
              data-testid="progress-tracker"
              className="p-4 bg-slate-950/80 border border-cyan-900/60 rounded-lg space-y-3 animate-in fade-in"
            >
              <div className="flex items-center gap-2 text-sm text-cyan-300">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span data-testid="status-message">{statusMessage}</span>
              </div>
              <div
                data-testid="step-indicators"
                className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs"
              >
                <span
                  data-testid="step-summarizing"
                  style={{
                    fontWeight:
                      currentStep === "summarizing" ? "bold" : "normal",
                  }}
                  className={`p-2 rounded text-center transition-all ${
                    currentStep === "summarizing"
                      ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                      : "text-slate-500 bg-slate-900/40"
                  }`}
                >
                  {t(
                    "characters.aiGenerate.stepSummarizing",
                    undefined,
                    "Step 1: Summarizing Universe",
                  )}
                </span>
                <span
                  data-testid="step-researching"
                  style={{
                    fontWeight:
                      currentStep === "researching" ? "bold" : "normal",
                  }}
                  className={`p-2 rounded text-center transition-all ${
                    currentStep === "researching"
                      ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                      : "text-slate-500 bg-slate-900/40"
                  }`}
                >
                  {t(
                    "characters.aiGenerate.stepResearching",
                    undefined,
                    "Step 2: Researching via Search Agent",
                  )}
                </span>
                <span
                  data-testid="step-generating"
                  style={{
                    fontWeight:
                      currentStep === "generating" ? "bold" : "normal",
                  }}
                  className={`p-2 rounded text-center transition-all ${
                    currentStep === "generating"
                      ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                      : "text-slate-500 bg-slate-900/40"
                  }`}
                >
                  {t(
                    "characters.aiGenerate.stepGenerating",
                    undefined,
                    "Step 3: Generating",
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter data-testid="dialog-actions" className="gap-2 sm:gap-0">
          {isGenerating ? (
            <Button
              type="button"
              data-testid="stop-generate-btn"
              onClick={handleStop}
              variant="destructive"
              className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
            >
              <StopCircle className="w-4 h-4" />
              {t(
                "characters.aiGenerate.stopGeneration",
                undefined,
                "Stop Generation",
              )}
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="start-generate-btn"
              onClick={handleStartGeneration}
              className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              {t("characters.aiGenerate.generate", undefined, "Generate")}
            </Button>
          )}
          <Button
            type="button"
            data-testid="cancel-dialog-btn"
            disabled={isGenerating}
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {t("common.cancel", undefined, "Cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
