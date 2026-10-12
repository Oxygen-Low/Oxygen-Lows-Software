import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAiModels, BUILTIN_MODELS, type Model } from "@/hooks/useAiModels";
import {
  reviewCharacter,
  type CharacterReview,
  type ReviewCharacter,
} from "@/services/characterReviewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AiReviewDialogProps {
  character: ReviewCharacter;
  universe?: ReviewCharacter | null;
  race?: ReviewCharacter | null;
  entityType?: "character" | "universe" | "race";
  onClose: () => void;
}

const modelKey = (model: Model) =>
  JSON.stringify([model.provider, model.model_id]);

export function AiReviewDialog({
  character,
  universe,
  race,
  entityType,
  onClose,
}: AiReviewDialogProps) {
  const { t, language } = useTranslation();
  const resolvedType =
    entityType ||
    ((character as any).is_universe
      ? "universe"
      : (character as any).is_race
        ? "race"
        : "character");
  const { models, pollinationsApiKey } = useAiModels();
  const availableModels = models.length ? models : BUILTIN_MODELS;
  const [selectedModelId, setSelectedModelId] = useState(() => availableModels[0]?.model_id || "openai");
  const chosenModel =
    availableModels.find((model) => model.model_id === selectedModelId) ||
    availableModels[0];
  const [result, setResult] = useState<CharacterReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  const stop = () => {
    request.current?.abort();
    request.current = null;
    setIsReviewing(false);
  };
  const close = () => {
    stop();
    onClose();
  };

  const start = async () => {
    if (request.current) return;
    setError(null);
    setResult(null);
    const apiKey = pollinationsApiKey || undefined;

    if (!apiKey) {
      setError(
        t("apps.pollinationsGateRequired", undefined, "A Pollinations API key is required. Please configure it in Account settings."),
      );
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setIsReviewing(true);
    try {
      const review = await reviewCharacter({
        character,
        universe,
        race,
        entityType: resolvedType,
        model: chosenModel,
        language,
        apiKey,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResult(review);
    } catch {
      if (!controller.signal.aborted) setError(t("characters.aiReview.error"));
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setIsReviewing(false);
      }
    }
  };

  const getAreaLabel = (
    area: "story" | "appearance" | "personality" | "consistency",
  ) => {
    if (resolvedType === "universe") {
      const keyMap = {
        story: "universeStory",
        appearance: "universeAppearance",
        personality: "universePersonality",
        consistency: "universeConsistency",
      } as const;
      return t(`characters.aiReview.${keyMap[area]}`);
    }
    if (resolvedType === "race") {
      const keyMap = {
        story: "raceStory",
        appearance: "raceAppearance",
        personality: "racePersonality",
        consistency: "raceConsistency",
      } as const;
      return t(`characters.aiReview.${keyMap[area]}`);
    }
    return t(`characters.aiReview.${area}`);
  };

  const descriptionText =
    resolvedType === "universe"
      ? t("characters.aiReview.descriptionUniverse")
      : resolvedType === "race"
        ? t("characters.aiReview.descriptionRace")
        : t("characters.aiReview.description");

  const reviewingText =
    resolvedType === "universe"
      ? t("characters.aiReview.reviewingUniverse")
      : resolvedType === "race"
        ? t("characters.aiReview.reviewingRace")
        : t("characters.aiReview.reviewing");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="z-[70] max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            {t("characters.aiReview.title", {
              name: character.display_name || character.name,
            })}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {descriptionText}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="review-model" className="text-sm text-slate-300">
            {t("characters.aiGenerate.model")}
          </label>
          <select
            id="review-model"
            value={chosenModel.model_id}
            disabled={isReviewing}
            onChange={(event) => {
              setSelectedModelId(event.target.value);
              setResult(null);
              setError(null);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            {availableModels.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.name || model.model_id} ({model.provider})
              </option>
            ))}
          </select>
        </div>
        {isReviewing && (
          <p role="status" className="flex items-center gap-2 text-cyan-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            {reviewingText}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        {result && (
          <div aria-live="polite" className="space-y-4 break-words">
            <p className="text-sm text-slate-200">{result.summary}</p>
            <section className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-4">
              <h3 className="font-semibold text-emerald-300">
                {t("characters.aiReview.strengths")}
              </h3>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-200">
                {result.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </section>
            <h3 className="font-semibold">
              {t("characters.aiReview.improvements")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                ["story", "appearance", "personality", "consistency"] as const
              ).map((area) => (
                <section
                  key={area}
                  className="rounded-lg border border-slate-700 bg-slate-950/40 p-4"
                >
                  <h4 className="font-medium text-cyan-300">
                    {getAreaLabel(area)}
                  </h4>
                  <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                    {result.improvements[area]}
                  </p>
                </section>
              ))}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {t("common.close")}
          </Button>
          {isReviewing ? (
            <Button type="button" variant="destructive" onClick={stop}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={start}
            >
              {t("characters.aiReview.start")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
