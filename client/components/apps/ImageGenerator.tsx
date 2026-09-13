import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Download,
  Copy,
  Maximize2,
  X,
  ExternalLink,
  Dice5,
  Trash2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader2,
  Check,
  Clock,
  Users,
  Layers,
} from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useImageGeneration } from "@/hooks/useImageGeneration";
import { AspectRatio, ASPECT_RATIO_DIMENSIONS } from "@/services/imageGen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SAMPLE_PROMPTS = [
  "A futuristic cyberpunk metropolis at twilight with neon rain reflections",
  "A cozy botanical garden greenhouse filled with sunlight and vintage books",
  "A majestic dragon perched on a snowy mountain cliff during golden hour",
  "Cinematic portrait of an astronaut exploring a bioluminescent alien forest",
];

export function ImageGeneratorApp() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    models,
    isLoadingModels,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
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
  } = useImageGeneration();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegative, setShowNegative] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    try {
      await generate();
      toast.success(
        t("apps.imageGenSuccess", undefined, "Image generated successfully!"),
      );
    } catch (err: any) {
      toast.error(err.message || "Image generation failed");
    }
  };

  const handleCopyImage = async (url: string) => {
    try {
      if (url.startsWith("data:")) {
        const res = await fetch(url);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      } else {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(
        t("apps.imageGenCopied", undefined, "Image copied to clipboard!"),
      );
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(
          t("apps.imageGenLinkCopied", undefined, "Image link copied!"),
        );
      } catch {
        toast.error("Failed to copy image");
      }
    }
  };

  const handleDownload = async (url: string, promptText: string) => {
    try {
      const link = document.createElement("a");
      link.href = url;
      const cleanPrompt = (promptText || "generated")
        .slice(0, 24)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `ai_${cleanPrompt}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(
        t("apps.imageGenDownloaded", undefined, "Download started!"),
      );
    } catch {
      toast.error("Download failed");
    }
  };

  const handleOpenInImageStudio = (imageUrl: string) => {
    try {
      sessionStorage.setItem("image_studio_pending_image", imageUrl);
      navigate("/apps?app=image-studio");
      toast.success(
        t("apps.imageGenOpeningStudio", undefined, "Opening in Image Studio..."),
      );
    } catch (err) {
      console.error(err);
    }
  };

  const currentModelList = models.horde;
  const currentModelObj = currentModelList.find((m) => m.id === selectedModel);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* App Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-primary/20 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </span>
            {t("apps.imageGeneratorTitle", undefined, "AI Image Generator")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t(
              "apps.imageGeneratorDesc",
              undefined,
              "Generate high-quality visuals using AI Horde SFW community workers.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs px-2.5 py-1 border-primary/40 text-primary bg-primary/10 font-mono"
          >
            AI Horde (SFW)
          </Badge>
        </div>
      </div>

      {/* Main App Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="bg-[#121216] border-white/10 text-white shadow-xl">
            <CardContent className="p-5 space-y-4">
              {/* Model Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    {t("apps.imageGenModelLabel", undefined, "Generation Model")}
                  </Label>
                  {selectedProvider === "horde" && currentModelObj?.workers !== undefined && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Users className="w-3 h-3 text-cyan-400" />
                      {currentModelObj.workers} workers
                      {currentModelObj.eta ? ` · ~${currentModelObj.eta}s ETA` : ""}
                    </span>
                  )}
                </div>

                <select
                  aria-label={t("apps.imageGenModelLabel", undefined, "Generation Model")}
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoadingModels || isGenerating}
                  className="w-full bg-black/40 text-sm text-white p-2.5 rounded-lg border border-white/10 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                >
                  {currentModelList.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#1a1a22] text-white">
                      {m.name} {m.eta && m.eta > 0 ? `(~${m.eta}s ETA)` : ""}
                    </option>
                  ))}
                </select>

                {currentModelObj?.description && (
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {currentModelObj.description}
                  </p>
                )}
              </div>

              {/* Prompt Input */}
              <div>
                <Label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                  {t("apps.imageGenPromptLabel", undefined, "Prompt")}
                </Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={t(
                    "apps.imageGenPromptPlaceholder",
                    undefined,
                    "Describe the image you want to generate in detail...",
                  )}
                  rows={4}
                  className="bg-black/40 border-white/10 text-white placeholder-slate-500 resize-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm"
                />

                {/* Sample Prompt Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SAMPLE_PROMPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(sample)}
                      className="text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-2 py-0.5 rounded-md border border-white/5 transition-colors truncate max-w-full text-left"
                      title={sample}
                    >
                      {sample.slice(0, 38)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Negative Prompt Toggle & Input */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowNegative(!showNegative)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showNegative ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {t(
                      "apps.imageGenNegativePromptToggle",
                      undefined,
                      "Negative Prompt (Optional)",
                    )}
                  </span>
                </button>

                {showNegative && (
                  <Input
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder={t(
                      "apps.imageGenNegativePlaceholder",
                      undefined,
                      "Elements to exclude (e.g. blurry, distorted, low quality)",
                    )}
                    className="mt-2 bg-black/40 border-white/10 text-white text-xs placeholder-slate-500"
                  />
                )}
              </div>

              {/* Aspect Ratio Presets */}
              <div>
                <Label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                  {t("apps.imageGenAspectRatioLabel", undefined, "Aspect Ratio")}
                </Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["1:1", "16:9", "9:16", "4:3", "3:4"] as AspectRatio[]).map(
                    (ratio) => {
                      const isSelected = aspectRatio === ratio;
                      return (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={cn(
                            "flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-200",
                            isSelected
                              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm"
                              : "bg-black/30 border-white/10 text-slate-400 hover:text-white hover:bg-white/5",
                          )}
                        >
                          <div
                            className={cn(
                              "border border-current rounded-sm mb-1",
                              ratio === "1:1" && "w-4 h-4",
                              ratio === "16:9" && "w-5 h-3",
                              ratio === "9:16" && "w-3 h-5",
                              ratio === "4:3" && "w-4 h-3",
                              ratio === "3:4" && "w-3 h-4",
                            )}
                          />
                          <span className="text-[10px] font-mono font-medium">
                            {ratio}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Advanced Settings Accordion */}
              <div className="border-t border-white/5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 py-1 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    {t(
                      "apps.imageGenAdvancedSettings",
                      undefined,
                      "Advanced Settings",
                    )}
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="space-y-3 pt-3">
                    {/* Steps */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>{t("apps.imageGenSteps", undefined, "Steps")}</span>
                        <span className="font-mono text-cyan-400">{steps}</span>
                      </div>
                      <Slider
                        value={[steps]}
                        min={1}
                        max={currentModelObj?.maxSteps || 30}
                        step={1}
                        onValueChange={([val]) => setSteps(val)}
                        className="py-1"
                      />
                    </div>

                    {/* Guidance / CFG Scale */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>
                          {t("apps.imageGenGuidance", undefined, "Guidance / CFG")}
                        </span>
                        <span className="font-mono text-cyan-400">{guidance}</span>
                      </div>
                      <Slider
                        value={[guidance]}
                        min={1}
                        max={15}
                        step={0.5}
                        onValueChange={([val]) => setGuidance(val)}
                        className="py-1"
                      />
                    </div>

                    {/* Seed */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>{t("apps.imageGenSeed", undefined, "Seed")}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {seed !== undefined ? seed : "Random (-1)"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={seed !== undefined ? seed : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSeed(v === "" ? undefined : parseInt(v, 10));
                          }}
                          placeholder="Random"
                          className="bg-black/40 border-white/10 text-white text-xs h-8"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSeed(Math.floor(Math.random() * 1000000000))
                          }
                          className="border-white/10 hover:bg-white/10 h-8 px-2.5"
                          title="Randomize seed"
                        >
                          <Dice5 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-2">
                {isGenerating ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={cancel}
                    className="w-full h-11 flex items-center justify-center gap-2 font-medium"
                  >
                    <X className="w-4 h-4" />
                    <span>{t("common.cancel", undefined, "Cancel Generation")}</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    className="w-full h-11 bg-gradient-to-r from-cyan-500 to-primary hover:from-cyan-400 hover:to-primary/90 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all duration-200"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{t("apps.imageGenSubmit", undefined, "Generate Image")}</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Canvas / Preview Area (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="bg-[#121216] border-white/10 text-white shadow-xl overflow-hidden">
            <CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[440px]">
              {isGenerating ? (
                /* Generating State */
                <div className="w-full flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 max-w-md">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                      <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {progress?.message ||
                        t("apps.imageGenCreating", undefined, "Crafting your image...")}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {t(
                        "apps.imageGenHordeWaiting",
                        undefined,
                        "AI Horde distributes tasks across community GPUs. Please hold on.",
                      )}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-primary transition-all duration-300"
                      style={{ width: `${progress?.progressPercent || 30}%` }}
                    />
                  </div>

                  {progress?.waitTime ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Estimated wait: ~{progress.waitTime}s</span>
                    </div>
                  ) : null}
                </div>
              ) : currentImage ? (
                /* Generated Image Canvas */
                <div className="w-full flex flex-col items-center space-y-4">
                  <div
                    className={cn(
                      "relative rounded-xl overflow-hidden border border-white/10 bg-black/50 shadow-2xl group max-w-full max-h-[580px] flex items-center justify-center",
                      ASPECT_RATIO_DIMENSIONS[currentImage.aspectRatio || "1:1"]
                        ?.ratioClass || "aspect-square",
                    )}
                  >
                    <img
                      src={currentImage.url}
                      alt={currentImage.prompt}
                      className="w-full h-full object-contain rounded-xl"
                    />

                    {/* Hover Overlay Toolbar */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className="bg-black/60 text-white text-[10px] backdrop-blur-md border border-white/10 font-mono"
                        >
                          AI Horde
                        </Badge>

                        <button
                          type="button"
                          onClick={() => setLightboxImage(currentImage.url)}
                          className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/90 transition-colors"
                          title="Fullscreen Lightbox"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-left">
                        <p className="text-xs text-white line-clamp-2 drop-shadow">
                          "{currentImage.prompt}"
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleDownload(currentImage.url, currentImage.prompt)
                        }
                        className="border-white/10 text-xs h-8 gap-1.5 hover:bg-white/10"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{t("common.download", undefined, "Download")}</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyImage(currentImage.url)}
                        className="border-white/10 text-xs h-8 gap-1.5 hover:bg-white/10"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-300" />
                        )}
                        <span>
                          {copied
                            ? t("common.copied", undefined, "Copied")
                            : t("common.copy", undefined, "Copy")}
                        </span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleOpenInImageStudio(currentImage.url)
                        }
                        className="border-white/10 text-xs h-8 gap-1.5 hover:bg-white/10"
                        title="Edit in Image Studio"
                      >
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        <span>
                          {t(
                            "apps.imageGenOpenInStudio",
                            undefined,
                            "Open in Image Studio",
                          )}
                        </span>
                      </Button>
                    </div>

                    {currentImage.storagePath && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-green-400 border-green-500/30 flex items-center gap-1 font-mono"
                      >
                        <Check className="w-3 h-3" />
                        {t("apps.imageGenSavedStorage", undefined, "Saved to Storage")}
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty Initial State */
                <div className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-md text-slate-400 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {t("apps.imageGenReadyTitle", undefined, "Ready to Imagine")}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {t(
                        "apps.imageGenReadyDesc",
                        undefined,
                        "Type a prompt on the left and select your favorite model to generate stunning artwork.",
                      )}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History Gallery */}
          {history.length > 0 && (
            <Card className="bg-[#121216] border-white/10 text-white shadow-xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>
                      {t("apps.imageGenHistory", undefined, "Recent Generations")}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {history.length}
                    </Badge>
                  </h4>

                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-[11px] text-slate-500 hover:text-red-400 transition-colors"
                  >
                    {t("apps.imageGenClearHistory", undefined, "Clear All")}
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 overflow-x-auto pb-1">
                  {history.map((item) => {
                    const isCurrent = currentImage?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "relative rounded-lg overflow-hidden border bg-black/40 aspect-square group cursor-pointer transition-all duration-200",
                          isCurrent
                            ? "border-cyan-500 ring-2 ring-cyan-500/30"
                            : "border-white/10 hover:border-white/30",
                        )}
                        onClick={() => setCurrentImage(item)}
                      >
                        <img
                          src={item.url}
                          alt={item.prompt}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFromHistory(item.id);
                          }}
                          className="absolute top-1 right-1 p-1 rounded bg-black/70 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          title="Delete from history"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Generated full view"
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}
