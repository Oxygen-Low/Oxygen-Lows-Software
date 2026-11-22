import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  isNativeRunnerAvailable,
  isAndroidRunner,
  llamaListModels,
  llamaPickModel,
  llamaImportModels,
  llamaUploadModel,
  llamaSaveModel,
  llamaDeleteModel,
  llamaStart,
  llamaStop,
  llamaStopAll,
  llamaStatus,
  type LlamaModelEntry,
  type LlamaStatus,
} from "@/lib/aiRunnerBridge";

interface SearchResult {
  source: "huggingface" | "modelscope";
  id: string;
  name: string;
  author: string;
  description: string;
  downloads: number;
  likes: number;
  fileType: string;
  files: string[];
  url: string;
}

const MODEL_TYPES = ["gguf", "safetensors", "bin", "onnx", "pt", "pth", "ckpt"];

export function AiRunnerApp() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const native = isNativeRunnerAvailable();
  const android = isAndroidRunner();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<LlamaStatus | null>(null);
  const [models, setModels] = useState<LlamaModelEntry[]>([]);
  const [query, setQuery] = useState("");
  const [modelType, setModelType] = useState("gguf");
  const [source, setSource] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!native) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [s, m] = await Promise.all([llamaStatus(), llamaListModels()]);
      setStatus(s);
      setModels(Array.isArray(m) ? m : []);
    } catch {
      // UI still renders with empty state.
    } finally {
      setLoading(false);
    }
  }, [native]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  const searchModels = useCallback(async () => {
    if (!query.trim() || !session?.access_token) {
      if (!session?.access_token) {
        toast.error(
          t("aiRunner.loginRequired", undefined, "Please log in to search models."),
        );
      }
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        type: modelType,
        source,
        limit: "20",
      });
      const res = await fetch(`/api/model-search/search?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      toast.error(
        t("aiRunner.searchFailed", undefined, "Could not search model hubs."),
      );
    } finally {
      setSearching(false);
    }
  }, [query, modelType, source, session, t]);

  const pickLocalModel = async () => {
    try {
      const picked = await llamaPickModel();
      const paths = picked.paths?.length ? picked.paths : [picked.path];
      await toast.promise(llamaImportModels(paths), {
        loading: t("aiRunner.importing", undefined, "Importing model…"),
        success: t("aiRunner.imported", undefined, "Model imported."),
        error: t("aiRunner.importFailed", undefined, "Could not import the model."),
      });
      refresh();
    } catch (e: any) {
      if (e?.message !== "Canceled") {
        toast.error(t("aiRunner.importFailed", undefined, "Could not import the model."));
      }
    }
  };

  const onUpload = async (files: File[]) => {
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await readFileAsBase64(file);
        await llamaUploadModel(file.name, base64, true, (pct) =>
          setUploadProgress(Math.round((i * 100 + pct) / files.length)),
        );
      }
      toast.success(t("aiRunner.uploaded", undefined, "Model saved to this device."));
      refresh();
    } catch {
      toast.error(t("aiRunner.uploadFailed", undefined, "Could not save the model."));
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateSettings = async (model: LlamaModelEntry, patch: Partial<LlamaModelEntry>) => {
    const next = { ...model, ...patch };
    setModels((prev) => prev.map((m) => (m.id === model.id ? next : m)));
    try {
      await llamaSaveModel({
        id: model.id,
        fileName: model.fileName,
        displayName: next.displayName,
        mmap: next.mmap,
        contextSize: next.contextSize,
        gpuLayers: next.gpuLayers,
        port: next.port,
        source: next.source,
        sourceId: next.sourceId,
        shards: next.shards,
        mmproj: next.mmproj,
        useJinja: next.useJinja,
      });
    } catch {
      toast.error(t("aiRunner.saveFailed", undefined, "Could not save model settings."));
    }
  };

  const startModel = async (model: LlamaModelEntry) => {
    setBusyModel(model.id);
    try {
      const res = await llamaStart({
        modelId: model.id,
        mmap: model.mmap,
        contextSize: model.contextSize,
        gpuLayers: model.gpuLayers,
      });
      toast.success(
        t("aiRunner.started", { port: res.port }, `Model running on port ${res.port}`),
      );
      refresh();
    } catch {
      toast.error(t("aiRunner.startFailed", undefined, "Could not start the model."));
    } finally {
      setBusyModel(null);
    }
  };

  const stopModel = async (port: number) => {
    try {
      await llamaStop(port);
      toast.success(t("aiRunner.stopped", undefined, "Model stopped."));
      refresh();
    } catch {
      toast.error(t("aiRunner.stopFailed", undefined, "Could not stop the model."));
    }
  };

  if (!native) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t("aiRunner.title", undefined, "AI Runner")}</CardTitle>
            <CardDescription>
              {t(
                "aiRunner.desktopOnly",
                undefined,
                "Running local AI models requires the desktop or mobile app.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const installed = !!status?.installed;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("aiRunner.title", undefined, "AI Runner")}</h1>
        <p className="text-muted-foreground mt-1">
          {t(
            "aiRunner.subtitle",
            undefined,
            "Run text models locally with llama.cpp.",
          )}
        </p>
      </div>

      {!installed ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {t(
                "aiRunner.installRequired",
                undefined,
                "Install llama.cpp from Dependencies Manager before running models.",
              )}
            </p>
            <Button
              className="mt-3"
              onClick={() => (window.location.href = "/apps/dependencies-manager")}
            >
              {t("aiRunner.goToDependencies", undefined, "Go to dependencies")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Add / import models */}
      <Card>
        <CardHeader>
          <CardTitle>{t("aiRunner.addModel", undefined, "Add a model")}</CardTitle>
          <CardDescription>
            {t(
              "aiRunner.addModelDesc",
              undefined,
              "Search HuggingFace and ModelScope, import a local file, or upload a GGUF.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchModels()}
              placeholder={t("aiRunner.searchPlaceholder", undefined, "Search models…")}
            />
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              aria-label={t("aiRunner.modelType", undefined, "Model type")}
            >
              {MODEL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label={t("aiRunner.source", undefined, "Source")}
            >
              <option value="all">{t("aiRunner.allSources", undefined, "All sources")}</option>
              <option value="huggingface">HuggingFace</option>
              <option value="modelscope">ModelScope</option>
            </select>
            <Button onClick={searchModels} disabled={searching}>
              {searching
                ? t("aiRunner.searching", undefined, "Searching…")
                : t("aiRunner.search", undefined, "Search")}
            </Button>
          </div>

          {results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border">
              {results.map((r) => (
                <div key={`${r.source}:${r.id}`} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.id}</p>
                    <p className="text-xs mt-1 line-clamp-2">{r.description}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">{r.source}</Badge>
                      <Badge variant="outline">{r.fileType.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {t("aiRunner.view", undefined, "View")}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!android ? (
              <Button variant="secondary" onClick={pickLocalModel}>
                {t("aiRunner.importLocal", undefined, "Import local GGUF files")}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              {t("aiRunner.uploadGguf", undefined, "Upload GGUF")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gguf,application/octet-stream"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) onUpload(files);
              }}
            />
          </div>
          {uploadProgress !== null ? <Progress value={uploadProgress} /> : null}
        </CardContent>
      </Card>

      {/* Installed models */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("aiRunner.yourModels", undefined, "Your models")}</CardTitle>
            <CardDescription>
              {t(
                "aiRunner.yourModelsDesc",
                undefined,
                "Configure mmap and start or stop each model.",
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await llamaStopAll();
              refresh();
            }}
          >
            {t("aiRunner.stopAll", undefined, "Stop all")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("aiRunner.loading", undefined, "Loading…")}
            </p>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("aiRunner.noModels", undefined, "No models yet. Add one above.")}
            </p>
          ) : (
            models.map((model) => (
              <div key={model.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{model.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{model.fileName}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {model.shardExpected > 1 ? (
                        <Badge variant={model.shardsComplete ? "outline" : "destructive"}>
                          {t(
                            "aiRunner.shards",
                            { have: model.shardCount, total: model.shardExpected },
                            `${model.shardCount}/${model.shardExpected} shards`,
                          )}
                          {model.shardsComplete
                            ? ""
                            : ` — ${t("aiRunner.missingShards", undefined, "missing files")}`}
                        </Badge>
                      ) : null}
                      {model.hasVision ? (
                        <Badge variant="secondary">
                          {t("aiRunner.vision", undefined, "Vision (mmproj)")}
                        </Badge>
                      ) : null}
                      <Badge variant="outline">
                        {t("aiRunner.modelSize", { size: formatBytes(model.sizeBytes) }, formatBytes(model.sizeBytes))}
                      </Badge>
                    </div>
                    {model.shardCount > 1 ? (
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        {model.shards.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {model.port > 0 ? (
                      <Badge variant="default">
                        {t("aiRunner.running", undefined, "Running")} · {model.port}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("aiRunner.stopped", undefined, "Stopped")}</Badge>
                    )}
                    {model.port > 0 ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => stopModel(model.port)}
                      >
                        {t("aiRunner.stop", undefined, "Stop")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!installed || !model.shardsComplete || busyModel === model.id}
                        onClick={() => startModel(model)}
                      >
                        {t("aiRunner.run", undefined, "Run")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await llamaDeleteModel(model.id);
                        refresh();
                      }}
                    >
                      {t("aiRunner.delete", undefined, "Delete")}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`mmap-${model.fileName}`}>
                      {t("aiRunner.mmap", undefined, "mmap")}
                    </Label>
                    <Switch
                      id={`mmap-${model.fileName}`}
                      checked={model.mmap}
                      onCheckedChange={(checked) => updateSettings(model, { mmap: checked })}
                    />
                  </div>
                  <label className="text-sm">
                    <span className="block text-muted-foreground">
                      {t("aiRunner.contextSize", undefined, "Context size")}
                    </span>
                    <Input
                      type="number"
                      min={512}
                      max={131072}
                      value={model.contextSize}
                      onChange={(e) =>
                        updateSettings(model, { contextSize: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-muted-foreground">
                      {t("aiRunner.gpuLayers", undefined, "GPU layers")}
                    </span>
                    <Input
                      type="number"
                      min={-1}
                      max={9999}
                      value={model.gpuLayers}
                      onChange={(e) =>
                        updateSettings(model, { gpuLayers: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-muted-foreground">
                      {t("aiRunner.displayName", undefined, "Display name")}
                    </span>
                    <Input
                      value={model.displayName}
                      onChange={(e) =>
                        updateSettings(model, { displayName: e.target.value })
                      }
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`jinja-${model.id}`}>
                      {t("aiRunner.jinja", undefined, "Jinja template")}
                    </Label>
                    <Switch
                      id={`jinja-${model.id}`}
                      checked={model.useJinja}
                      onCheckedChange={(checked) => updateSettings(model, { useJinja: checked })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "aiRunner.mmapHint",
                    undefined,
                    "mmap lets large models run by mapping weights from disk, reducing RAM/VRAM use.",
                  )}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
