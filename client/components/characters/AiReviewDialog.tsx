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
  onClose: () => void;
}

const modelKey = (model: Model) =>
  JSON.stringify([model.provider, model.model_id]);

export function AiReviewDialog({
  character,
  universe,
  race,
  onClose,
}: AiReviewDialogProps) {
  const { t, language } = useTranslation();
  const {
    models,
    selectedModel,
    selectedProvider,
    getDecryptedApiKey,
    encryptedKeys,
    isMasterKeyActive,
  } = useAiModels();
  const availableModels = models.length ? models : BUILTIN_MODELS;
  const [selection, setSelection] = useState(() =>
    modelKey({ provider: selectedProvider, model_id: selectedModel }),
  );
  const chosenModel =
    availableModels.find((model) => modelKey(model) === selection) ||
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
    const provider = chosenModel.provider.toLowerCase().trim();
    const apiKey = getDecryptedApiKey(provider) || undefined;
    const keyless =
      provider === "horde" ||
      provider === "pollinations" ||
      provider.startsWith("local-") ||
      chosenModel.isLocal;
    if (!keyless && !apiKey) {
      setError(
        encryptedKeys[provider] && !isMasterKeyActive
          ? t("apps.chatbotMasterKeyLocked")
          : t("apps.chatbotProviderNotConfigured", {
              provider: chosenModel.provider,
            }),
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
            {t("characters.aiReview.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="review-model" className="text-sm text-slate-300">
            {t("characters.aiGenerate.model")}
          </label>
          <select
            id="review-model"
            value={modelKey(chosenModel)}
            disabled={isReviewing}
            onChange={(event) => {
              setSelection(event.target.value);
              setResult(null);
              setError(null);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            {availableModels.map((model) => (
              <option key={modelKey(model)} value={modelKey(model)}>
                {model.name || model.model_id} ({model.provider})
              </option>
            ))}
          </select>
        </div>
        {isReviewing && (
          <p role="status" className="flex items-center gap-2 text-cyan-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("characters.aiReview.reviewing")}
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
                    {t(`characters.aiReview.${area}`)}
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
