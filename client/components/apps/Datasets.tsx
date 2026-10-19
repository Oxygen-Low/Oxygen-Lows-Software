import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAiModels } from "@/hooks/useAiModels";
import { getLocalSession } from "@/lib/localSession";
import { supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Plus,
  ArrowLeft,
  Download,
  Archive,
  ArchiveRestore,
  Trash2,
  Sparkles,
  CloudDownload,
  ListOrdered,
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Save,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";

export type DatasetType = "standard" | "post-training";
export type GenerationMode = "tokens" | "individual";

export interface DatasetRow {
  instruction: string;
  input: string;
  output: string;
  prompt?: string;
  chosen?: string;
  rejected?: string;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  rowCount: number;
  tokenCount: number;
  model: string;
  prompt: string;
  datasetType?: DatasetType;
  archived?: boolean;
  bytesOnDisk?: number;
}

export interface DatasetQueueItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  model: string;
  datasetType: DatasetType;
  generationMode: GenerationMode;
  targetTokens: number;
  targetRowCount: number;
  contextLimit?: number;
  retryOnFail: boolean;
  status: "queued" | "generating" | "saving" | "completed" | "failed";
  error?: string;
  progressCurrent?: number;
  progressTotal?: number;
  generatedRows?: number;
}

const QUEUE_STORAGE_KEY = "oxygen_datasets_queue";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const local = getLocalSession();
  const token = local?.access_token || (local as any)?.accessToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

async function getAuthToken(): Promise<string> {
  const local = getLocalSession();
  const token = local?.access_token || (local as any)?.accessToken;
  if (token) return token;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch {
    // ignore
  }
  return "";
}

export function DatasetsApp() {
  const { t } = useTranslation();
  const { models, chatbotDefaultModel, pollinationsApiKey, isPollinationsSupporter } =
    useAiModels();

  // Navigation state
  const [viewMode, setViewMode] = useState<"list" | "view" | "create">("list");
  const [createTab, setCreateTab] = useState<
    "generate" | "huggingface" | "queue" | "refine"
  >("generate");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "active" | "archived">(
    "all",
  );

  // Datasets list state
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // View / Edit dataset state
  const [selectedDataset, setSelectedDataset] = useState<DatasetMetadata | null>(
    null,
  );
  const [datasetRows, setDatasetRows] = useState<DatasetRow[]>([]);
  const [loadingRows, setLoadingRows] = useState<boolean>(false);
  const [savingRows, setSavingRows] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Generate form state
  const [datasetName, setDatasetName] = useState<string>("");
  const [datasetDescription, setDatasetDescription] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [datasetType, setDatasetType] = useState<DatasetType>("standard");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("tokens");
  const [generationPrompt, setGenerationPrompt] = useState<string>("");
  const [targetTokens, setTargetTokens] = useState<number>(2000);
  const [targetRowCount, setTargetRowCount] = useState<number>(20);
  const [contextLimit, setContextLimit] = useState<number>(5);
  const [retryOnFail, setRetryOnFail] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(0);
  const [generatedRows, setGeneratedRows] = useState<DatasetRow[]>([]);
  const [addedToQueueFeedback, setAddedToQueueFeedback] = useState<boolean>(false);

  // HuggingFace import form state
  const [hfName, setHfName] = useState<string>("");
  const [hfDescription, setHfDescription] = useState<string>("");
  const [hfDatasetPath, setHfDatasetPath] = useState<string>("");
  const [hfSubset, setHfSubset] = useState<string>("default");
  const [hfSplit, setHfSplit] = useState<string>("train");
  const [hfMaxRows, setHfMaxRows] = useState<number>(1000);
  const [hfToken, setHfToken] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);

  // Queue state
  const [queue, setQueue] = useState<DatasetQueueItem[]>(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DatasetQueueItem[];
        return parsed.map((item) =>
          item.status === "generating" || item.status === "saving"
            ? { ...item, status: "queued" as const }
            : item,
        );
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [queueRunning, setQueueRunning] = useState<boolean>(false);
  const queueStopRequestedRef = useRef<boolean>(false);

  // Refine state
  const [refineDatasetId, setRefineDatasetId] = useState<string>("");
  const [refineModel, setRefineModel] = useState<string>("");
  const [refineInstructions, setRefineInstructions] = useState<string>("");
  const [refining, setRefining] = useState<boolean>(false);

  // Shared status messages
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Default model initialization
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      const def = chatbotDefaultModel || models[0].model_id;
      setSelectedModel(def);
    }
    if (!refineModel && models.length > 0) {
      const def = chatbotDefaultModel || models[0].model_id;
      setRefineModel(def);
    }
  }, [models, chatbotDefaultModel, selectedModel, refineModel]);

  // Save queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // ignore
    }
  }, [queue]);

  const loadDatasets = useCallback(async () => {
    setLoadingList(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/datasets", { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.datasets)) {
        setDatasets(data.datasets);
      }
    } catch (err) {
      console.error("Failed to load datasets:", err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // Filtered datasets
  const activeDatasetsCount = useMemo(
    () => datasets.filter((d) => !d.archived).length,
    [datasets],
  );
  const archivedDatasetsCount = useMemo(
    () => datasets.filter((d) => d.archived).length,
    [datasets],
  );
  const activeDatasets = useMemo(
    () => datasets.filter((d) => !d.archived),
    [datasets],
  );
  const filteredDatasets = useMemo(() => {
    if (archiveFilter === "active") return datasets.filter((d) => !d.archived);
    if (archiveFilter === "archived") return datasets.filter((d) => d.archived);
    return datasets;
  }, [datasets, archiveFilter]);

  const switchToCreate = () => {
    setViewMode("create");
    setErrorMessage("");
    setSuccessMessage("");
  };

  const switchToList = () => {
    if (
      viewMode === "view" &&
      hasUnsavedChanges &&
      !window.confirm(t("datasets.unsavedChangesConfirm"))
    ) {
      return;
    }
    setViewMode("list");
    setSelectedDataset(null);
    setDatasetRows([]);
    setHasUnsavedChanges(false);
    setErrorMessage("");
    setSuccessMessage("");
    loadDatasets();
  };

  const openDataset = async (ds: DatasetMetadata) => {
    setSelectedDataset(ds);
    setViewMode("view");
    setLoadingRows(true);
    setHasUnsavedChanges(false);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/datasets/${encodeURIComponent(ds.id)}/rows`, {
        headers,
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.rows)) {
        setDatasetRows(data.rows.map((r: DatasetRow) => ({ ...r })));
      } else {
        setDatasetRows([]);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load rows");
      setDatasetRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  const handleRowChange = (
    index: number,
    field: keyof DatasetRow,
    value: string,
  ) => {
    setDatasetRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const addEmptyRow = () => {
    const isPostTraining = selectedDataset?.datasetType === "post-training";
    setDatasetRows((prev) => [
      ...prev,
      isPostTraining
        ? {
            instruction: "",
            input: "",
            output: "",
            prompt: "",
            chosen: "",
            rejected: "",
          }
        : { instruction: "", input: "", output: "" },
    ]);
    setHasUnsavedChanges(true);
  };

  const removeRow = (index: number) => {
    setDatasetRows((prev) => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const saveEditedRows = async () => {
    if (!selectedDataset) return;
    setSavingRows(true);
    setErrorMessage("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/datasets/${encodeURIComponent(selectedDataset.id)}/rows`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ rows: datasetRows }),
        },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedDataset(data.metadata);
        setHasUnsavedChanges(false);
        toast.success(t("datasets.saveSuccess"));
      } else {
        setErrorMessage(data.error || "Failed to save changes");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to save changes");
    } finally {
      setSavingRows(false);
    }
  };

  const handleDownload = async (id: string, format: "parquet" | "jsonl" = "parquet") => {
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (format === "jsonl") params.set("format", "jsonl");
      if (token) params.set("token", token);
      const url = `/api/datasets/${encodeURIComponent(id)}/download${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "jsonl" ? `${id}.jsonl` : `${id}.parquet`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error(err?.message || "Download failed");
    }
  };

  const handleArchive = async (ds: DatasetMetadata) => {
    setArchivingId(ds.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/datasets/${encodeURIComponent(ds.id)}/archive`,
        { method: "POST", headers },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t("datasets.archiveSuccess"));
        await loadDatasets();
      } else {
        toast.error(data.error || "Failed to archive dataset");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to archive dataset");
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (ds: DatasetMetadata) => {
    setArchivingId(ds.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/datasets/${encodeURIComponent(ds.id)}/unarchive`,
        { method: "POST", headers },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t("datasets.unarchiveSuccess"));
        await loadDatasets();
      } else {
        toast.error(data.error || "Failed to unarchive dataset");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to unarchive dataset");
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async (ds: DatasetMetadata) => {
    if (!window.confirm(t("datasets.confirmDelete", { name: ds.name }))) {
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/datasets/${encodeURIComponent(ds.id)}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t("datasets.deleteSuccess"));
        setDatasets((prev) => prev.filter((d) => d.id !== ds.id));
      } else {
        toast.error(data.error || "Failed to delete dataset");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete dataset");
    }
  };

  // Helper to run generation (batch or individual SSE)
  const executeGenerateRequest = async (params: {
    prompt: string;
    model: string;
    datasetType: DatasetType;
    generationMode: GenerationMode;
    targetTokens: number;
    targetRowCount: number;
    contextLimit?: number;
    retryOnFail: boolean;
    onProgress?: (current: number, total: number, row: DatasetRow) => void;
  }): Promise<{ rows: DatasetRow[]; tokenCount: number }> => {
    const headers = await getAuthHeaders();
    const body = {
      prompt: params.prompt,
      model: params.model,
      datasetType: params.datasetType,
      generationMode: params.generationMode,
      targetTokens: params.targetTokens,
      targetRowCount: params.targetRowCount,
      contextLimit: params.contextLimit,
      retryOnFail: params.retryOnFail,
      apiKey: pollinationsApiKey || undefined,
      isSupporter: isPollinationsSupporter,
    };

    const response = await fetch("/api/datasets/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (params.generationMode === "individual") {
      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: { rows: DatasetRow[]; tokenCount: number } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          let event: any;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }
          if (event.type === "progress" && params.onProgress) {
            params.onProgress(event.current, event.total, event.row);
          } else if (event.type === "done") {
            finalResult = {
              rows: event.rows || [],
              tokenCount: event.tokenCount || 0,
            };
          } else if (event.type === "error") {
            throw new Error(event.error || "Generation failed");
          }
        }
      }

      if (finalResult) return finalResult;
      throw new Error("Stream ended without completion event");
    } else {
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Generation failed");
      }
      return {
        rows: data.rows || [],
        tokenCount: data.tokenCount || 0,
      };
    }
  };

  const canGenerate =
    datasetName.trim().length > 0 &&
    selectedModel.trim().length > 0 &&
    generationPrompt.trim().length > 0 &&
    (generationMode === "individual"
      ? targetRowCount >= 1 && targetRowCount <= 500
      : targetTokens >= 100 && targetTokens <= 100000);

  const handleGenerateAndSave = async () => {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setErrorMessage("");
    setSuccessMessage("");
    setGeneratedRows([]);
    setProgressCurrent(0);
    setProgressTotal(generationMode === "individual" ? targetRowCount : 0);

    try {
      const genResult = await executeGenerateRequest({
        prompt: generationPrompt,
        model: selectedModel,
        datasetType,
        generationMode,
        targetTokens,
        targetRowCount,
        contextLimit,
        retryOnFail,
        onProgress: (current, total, row) => {
          setProgressCurrent(current);
          setProgressTotal(total);
          setGeneratedRows((prev) => [...prev, row]);
        },
      });

      if (!genResult.rows || genResult.rows.length === 0) {
        setErrorMessage("Failed to generate dataset rows");
        return;
      }

      setGeneratedRows(genResult.rows);

      const headers = await getAuthHeaders();
      const saveRes = await fetch("/api/datasets/save", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: datasetName.trim(),
          description: datasetDescription.trim(),
          rows: genResult.rows,
          model: selectedModel,
          prompt: generationPrompt,
          datasetType,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) {
        setErrorMessage(saveData.error || "Failed to save dataset");
        return;
      }

      setSuccessMessage(
        `${t("datasets.saveSuccess")} (${saveData.metadata.rowCount} ${t("datasets.rows")}, ~${saveData.metadata.tokenCount.toLocaleString()} ${t("datasets.tokens")})`,
      );
      toast.success(t("datasets.saveSuccess"));
      await loadDatasets();
      setDatasetName("");
      setDatasetDescription("");
      setGenerationPrompt("");
    } catch (err: any) {
      setErrorMessage(err?.message || "An error occurred during generation");
    } finally {
      setGenerating(false);
    }
  };

  // Queue handlers
  const handleAddToQueue = () => {
    if (!canGenerate) return;
    const item: DatasetQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: datasetName.trim(),
      description: datasetDescription.trim(),
      prompt: generationPrompt.trim(),
      model: selectedModel,
      datasetType,
      generationMode,
      targetTokens,
      targetRowCount,
      contextLimit,
      retryOnFail,
      status: "queued",
    };
    setQueue((prev) => [...prev, item]);
    setDatasetName("");
    setDatasetDescription("");
    setGenerationPrompt("");
    setAddedToQueueFeedback(true);
    setTimeout(() => setAddedToQueueFeedback(false), 1800);
  };

  const queuedCount = useMemo(
    () => queue.filter((i) => i.status === "queued").length,
    [queue],
  );
  const completedCount = useMemo(
    () => queue.filter((i) => i.status === "completed").length,
    [queue],
  );
  const failedCount = useMemo(
    () => queue.filter((i) => i.status === "failed").length,
    [queue],
  );

  const startQueue = async () => {
    if (queueRunning) return;
    setQueueRunning(true);
    queueStopRequestedRef.current = false;

    // Process queued items sequentially
    while (!queueStopRequestedRef.current) {
      let nextItem: DatasetQueueItem | undefined;
      setQueue((prev) => {
        nextItem = prev.find((i) => i.status === "queued");
        return prev;
      });
      // Read directly from current state snapshot via functional lookup or localStorage
      const currentSnapshot: DatasetQueueItem[] = JSON.parse(
        localStorage.getItem(QUEUE_STORAGE_KEY) || "[]",
      );
      nextItem = currentSnapshot.find((i) => i.status === "queued");
      if (!nextItem) break;

      const itemId = nextItem.id;
      const updateItem = (patch: Partial<DatasetQueueItem>) => {
        setQueue((prev) => {
          const updated = prev.map((it) =>
            it.id === itemId ? { ...it, ...patch } : it,
          );
          try {
            localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      };

      updateItem({
        status: "generating",
        error: undefined,
        progressCurrent: 0,
        progressTotal:
          nextItem.generationMode === "individual" ? nextItem.targetRowCount : 0,
      });

      try {
        const genResult = await executeGenerateRequest({
          prompt: nextItem.prompt,
          model: nextItem.model,
          datasetType: nextItem.datasetType,
          generationMode: nextItem.generationMode,
          targetTokens: nextItem.targetTokens,
          targetRowCount: nextItem.targetRowCount,
          contextLimit: nextItem.contextLimit,
          retryOnFail: nextItem.retryOnFail,
          onProgress: (current, total) => {
            updateItem({ progressCurrent: current, progressTotal: total });
          },
        });

        if (!genResult.rows || genResult.rows.length === 0) {
          updateItem({ status: "failed", error: "No rows generated" });
          continue;
        }

        updateItem({ status: "saving" });
        const headers = await getAuthHeaders();
        const saveRes = await fetch("/api/datasets/save", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: nextItem.name,
            description: nextItem.description,
            rows: genResult.rows,
            model: nextItem.model,
            prompt: nextItem.prompt,
            datasetType: nextItem.datasetType,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok || !saveData.success) {
          updateItem({
            status: "failed",
            error: saveData.error || "Failed to save dataset",
          });
          continue;
        }

        updateItem({
          status: "completed",
          generatedRows: saveData.metadata?.rowCount || genResult.rows.length,
        });
        await loadDatasets();
      } catch (err: any) {
        updateItem({
          status: "failed",
          error: err?.message || "Unexpected error",
        });
      }
    }

    setQueueRunning(false);
    queueStopRequestedRef.current = false;
  };

  const stopQueue = () => {
    queueStopRequestedRef.current = true;
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const retryQueueItem = (id: string) => {
    setQueue((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "queued",
              error: undefined,
              progressCurrent: undefined,
              progressTotal: undefined,
            }
          : i,
      ),
    );
  };

  const clearCompletedFromQueue = () => {
    setQueue((prev) =>
      prev.filter((i) => i.status !== "completed" && i.status !== "failed"),
    );
  };

  const clearAllQueue = () => {
    if (queueRunning) return;
    setQueue([]);
  };

  // HuggingFace Import handler
  const canImport =
    hfName.trim().length > 0 &&
    hfDatasetPath.trim().length > 0 &&
    hfDatasetPath.includes("/") &&
    hfMaxRows >= 1 &&
    hfMaxRows <= 10000;

  const handleImportFromHuggingFace = async () => {
    if (!canImport || importing) return;
    setImporting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/datasets/import-huggingface", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: hfName.trim(),
          description: hfDescription.trim(),
          hfDataset: hfDatasetPath.trim(),
          subset: hfSubset.trim() || "default",
          split: hfSplit,
          maxRows: hfMaxRows,
          hfToken: hfToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to import dataset");
        return;
      }

      setSuccessMessage(
        `${t("datasets.importSuccess")} (${data.metadata.rowCount} ${t("datasets.rows")}, ~${data.metadata.tokenCount.toLocaleString()} ${t("datasets.tokens")})`,
      );
      toast.success(t("datasets.importSuccess"));
      await loadDatasets();
      setHfName("");
      setHfDescription("");
      setHfDatasetPath("");
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to import dataset");
    } finally {
      setImporting(false);
    }
  };

  // Refine handler
  const canRefine =
    refineDatasetId.trim().length > 0 && refineModel.trim().length > 0;

  const handleRefineDataset = async () => {
    if (!canRefine || refining) return;
    setRefining(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/datasets/${encodeURIComponent(refineDatasetId)}/refine`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: refineModel,
            instructions: refineInstructions.trim() || undefined,
            apiKey: pollinationsApiKey || undefined,
            isSupporter: isPollinationsSupporter,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to refine dataset");
        return;
      }

      const msg = t("datasets.refineSuccess", {
        count: String(data.metadata.rowCount),
        tokens: data.metadata.tokenCount.toLocaleString(),
      });
      setSuccessMessage(msg);
      toast.success(msg);
      await loadDatasets();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to refine dataset");
    } finally {
      setRefining(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* ==================== LIST VIEW ==================== */}
      {viewMode === "list" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
                <Database className="w-7 h-7 text-cyan-500" />
                {t("datasets.title")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("datasets.subtitle")}
              </p>
            </div>
            <Button onClick={switchToCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              {t("datasets.createDataset")}
            </Button>
          </div>

          {!loadingList && datasets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={archiveFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setArchiveFilter("all")}
              >
                {t("datasets.all")} ({datasets.length})
              </Button>
              <Button
                variant={archiveFilter === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setArchiveFilter("active")}
              >
                {t("datasets.active")} ({activeDatasetsCount})
              </Button>
              <Button
                variant={archiveFilter === "archived" ? "default" : "outline"}
                size="sm"
                onClick={() => setArchiveFilter("archived")}
              >
                {t("datasets.archived")} ({archivedDatasetsCount})
              </Button>
            </div>
          )}

          {loadingList ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <p>{t("datasets.loadingDatasets")}</p>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center space-y-4">
              <Database className="w-12 h-12 mx-auto text-muted-foreground/60" />
              {datasets.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold">
                    {t("datasets.noDatasetsYet")}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {t("datasets.noDatasetsHint")}
                  </p>
                  <Button onClick={switchToCreate} className="gap-2">
                    <Plus className="w-4 h-4" />
                    {t("datasets.createFirstDataset")}
                  </Button>
                </>
              ) : archiveFilter === "archived" ? (
                <>
                  <h3 className="text-lg font-semibold">
                    {t("datasets.noArchivedDatasets")}
                  </h3>
                  <Button
                    variant="outline"
                    onClick={() => setArchiveFilter("all")}
                  >
                    {t("datasets.showAllDatasets")}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold">
                    {t("datasets.noActiveDatasets")}
                  </h3>
                  <Button
                    variant="outline"
                    onClick={() => setArchiveFilter("all")}
                  >
                    {t("datasets.showAllDatasets")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDatasets.map((ds) => (
                <div
                  key={ds.id}
                  className={`rounded-xl border border-border bg-card p-5 flex flex-col justify-between gap-4 transition-all hover:border-cyan-500/40 ${
                    ds.archived ? "opacity-75" : ""
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg break-all">
                          {ds.name}
                        </h3>
                        {ds.datasetType === "post-training" && (
                          <Badge
                            variant="secondary"
                            className="bg-purple-500/15 text-purple-400 border-purple-500/30"
                          >
                            {t("datasets.postTrainingBadge")}
                          </Badge>
                        )}
                        {ds.archived && (
                          <Badge variant="outline">
                            {t("datasets.archivedBadge")}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                      >
                        {ds.rowCount} {t("datasets.rows")}
                      </Badge>
                    </div>

                    {ds.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {ds.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
                      <span className="px-2 py-0.5 rounded bg-muted font-mono">
                        {ds.model}
                      </span>
                      {ds.tokenCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                          ~{ds.tokenCount.toLocaleString()} {t("datasets.tokens")}
                        </span>
                      )}
                      <span>
                        {t("datasets.createdAt")}: {formatDate(ds.createdAt)}
                      </span>
                      {ds.updatedAt !== ds.createdAt && (
                        <span>
                          • {t("datasets.updatedAt")}: {formatDate(ds.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                    {!ds.archived && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5"
                          onClick={() => openDataset(ds)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t("datasets.viewEdit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDownload(ds.id, "parquet")}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t("datasets.downloadParquet")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDownload(ds.id, "jsonl")}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t("datasets.downloadJsonl")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={archivingId === ds.id}
                          onClick={() => handleArchive(ds)}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          {archivingId === ds.id
                            ? t("datasets.archiving")
                            : t("datasets.archive")}
                        </Button>
                      </>
                    )}
                    {ds.archived && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={archivingId === ds.id}
                        onClick={() => handleUnarchive(ds)}
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        {archivingId === ds.id
                          ? t("datasets.unarchiving")
                          : t("datasets.unarchive")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5 ml-auto"
                      onClick={() => handleDelete(ds)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("datasets.delete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== VIEW / EDIT DATASET ==================== */}
      {viewMode === "view" && selectedDataset && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit gap-2"
              onClick={switchToList}
            >
              <ArrowLeft className="w-4 h-4" />
              {t("datasets.backToList")}
            </Button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-bold">{selectedDataset.name}</h2>
                  {selectedDataset.datasetType === "post-training" && (
                    <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30">
                      {t("datasets.postTrainingBadge")}
                    </Badge>
                  )}
                </div>
                {selectedDataset.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedDataset.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {datasetRows.length} {t("datasets.rows")}
                  </Badge>
                  <span className="px-2 py-0.5 rounded bg-muted font-mono">
                    {selectedDataset.model}
                  </span>
                  {selectedDataset.tokenCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                      ~{selectedDataset.tokenCount.toLocaleString()}{" "}
                      {t("datasets.tokens")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={addEmptyRow} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  {t("datasets.addRow")}
                </Button>
                <Button
                  size="sm"
                  disabled={!hasUnsavedChanges || savingRows}
                  onClick={saveEditedRows}
                  className="gap-1.5"
                >
                  {savingRows ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {savingRows ? t("datasets.saving") : t("datasets.saveChanges")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(selectedDataset.id, "parquet")}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  {t("datasets.downloadParquet")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(selectedDataset.id, "jsonl")}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  {t("datasets.downloadJsonl")}
                </Button>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {loadingRows ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <p>{t("datasets.loadingRows")}</p>
            </div>
          ) : datasetRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
              <p className="text-muted-foreground">{t("datasets.noRowsYet")}</p>
              <Button onClick={addEmptyRow} size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" />
                {t("datasets.addFirstRow")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {datasetRows.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2.5 py-1 rounded bg-cyan-500/15 text-cyan-400">
                      #{idx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(idx)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {selectedDataset.datasetType === "post-training" ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("datasets.prompt")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.prompt ?? row.instruction ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "prompt", e.target.value)
                          }
                          placeholder={t("datasets.promptPlaceholder")}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          {t("datasets.chosen")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.chosen ?? row.output ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "chosen", e.target.value)
                          }
                          placeholder={t("datasets.chosenPlaceholder")}
                          className="w-full rounded-md border border-emerald-500/30 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                          {t("datasets.rejected")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.rejected ?? row.input ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "rejected", e.target.value)
                          }
                          placeholder={t("datasets.rejectedPlaceholder")}
                          className="w-full rounded-md border border-rose-500/30 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("datasets.instruction")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.instruction ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "instruction", e.target.value)
                          }
                          placeholder={t("datasets.instructionPlaceholder")}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("datasets.input")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.input ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "input", e.target.value)
                          }
                          placeholder={t("datasets.inputPlaceholder")}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("datasets.output")}
                        </label>
                        <textarea
                          rows={3}
                          value={row.output ?? ""}
                          onChange={(e) =>
                            handleRowChange(idx, "output", e.target.value)
                          }
                          placeholder={t("datasets.outputPlaceholder")}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== CREATE VIEW ==================== */}
      {viewMode === "create" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit gap-2"
              onClick={switchToList}
            >
              <ArrowLeft className="w-4 h-4" />
              {t("datasets.backToList")}
            </Button>
            <h2 className="text-2xl font-bold">{t("datasets.createDataset")}</h2>
          </div>

          {/* Create Mode Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <Button
              variant={createTab === "generate" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setCreateTab("generate");
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              <Sparkles className="w-4 h-4" />
              {t("datasets.tabGenerate")}
            </Button>
            <Button
              variant={createTab === "huggingface" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setCreateTab("huggingface");
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              <CloudDownload className="w-4 h-4" />
              {t("datasets.tabHuggingface")}
            </Button>
            <Button
              variant={createTab === "queue" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setCreateTab("queue");
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              <ListOrdered className="w-4 h-4" />
              {t("datasets.tabQueue")}
              {queue.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {queue.length}
                </Badge>
              )}
              {queueRunning && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </Button>
            <Button
              variant={createTab === "refine" ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setCreateTab("refine");
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              <Wand2 className="w-4 h-4" />
              {t("datasets.tabRefine")}
            </Button>
          </div>

          {/* ---------- TAB 1: GENERATE WITH AI ---------- */}
          {createTab === "generate" && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.datasetName")} *
                  </label>
                  <Input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder={t("datasets.datasetNamePlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.datasetNameHint")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.aiModel")} *
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {models.map((m) => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.name ? `${m.name} (${m.model_id})` : m.model_id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("datasets.description")}
                </label>
                <Input
                  value={datasetDescription}
                  onChange={(e) => setDatasetDescription(e.target.value)}
                  placeholder={t("datasets.descriptionPlaceholder")}
                />
              </div>

              {/* Dataset Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("datasets.datasetType")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={datasetType === "standard" ? "default" : "outline"}
                    className="justify-start h-auto py-2.5 px-3 text-left"
                    onClick={() => setDatasetType("standard")}
                  >
                    {t("datasets.typeStandard")}
                  </Button>
                  <Button
                    type="button"
                    variant={
                      datasetType === "post-training" ? "default" : "outline"
                    }
                    className="justify-start h-auto py-2.5 px-3 text-left"
                    onClick={() => setDatasetType("post-training")}
                  >
                    {t("datasets.typePostTraining")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {datasetType === "standard"
                    ? t("datasets.typeStandardHint")
                    : t("datasets.typePostTrainingHint")}
                </p>
              </div>

              {/* Generation Prompt */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("datasets.generationPrompt")} *
                </label>
                <textarea
                  rows={4}
                  value={generationPrompt}
                  onChange={(e) => setGenerationPrompt(e.target.value)}
                  placeholder={
                    datasetType === "post-training"
                      ? t("datasets.generationPromptPostTrainingPlaceholder")
                      : t("datasets.generationPromptStandardPlaceholder")
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <p className="text-xs text-muted-foreground">
                  {t("datasets.generationPromptHint")}
                </p>
              </div>

              {/* Generation Mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("datasets.generationMode")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={generationMode === "tokens" ? "default" : "outline"}
                    className="justify-start h-auto py-2.5 px-3 text-left"
                    onClick={() => setGenerationMode("tokens")}
                  >
                    {t("datasets.modeTokens")}
                  </Button>
                  <Button
                    type="button"
                    variant={
                      generationMode === "individual" ? "default" : "outline"
                    }
                    className="justify-start h-auto py-2.5 px-3 text-left"
                    onClick={() => setGenerationMode("individual")}
                  >
                    {t("datasets.modeIndividual")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {generationMode === "tokens"
                    ? t("datasets.modeTokensHint")
                    : t("datasets.modeIndividualHint")}
                </p>
              </div>

              {generationMode === "tokens" ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.targetTokens")} *
                  </label>
                  <Input
                    type="number"
                    min={100}
                    max={100000}
                    step={500}
                    value={targetTokens}
                    onChange={(e) =>
                      setTargetTokens(parseInt(e.target.value, 10) || 100)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.targetTokensHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {t("datasets.targetRowCount")} *
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      step={1}
                      value={targetRowCount}
                      onChange={(e) =>
                        setTargetRowCount(parseInt(e.target.value, 10) || 1)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("datasets.targetRowCountHint")}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {t("datasets.contextLimit")}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      step={1}
                      value={contextLimit}
                      onChange={(e) =>
                        setContextLimit(
                          Math.max(
                            0,
                            Math.min(50, parseInt(e.target.value, 10) || 0),
                          ),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("datasets.contextLimitHint")}
                    </p>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={retryOnFail}
                      onChange={(e) => setRetryOnFail(e.target.checked)}
                      className="mt-1 rounded border-input"
                    />
                    <div>
                      <span className="text-sm font-medium">
                        {t("datasets.retryOnFail")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {t("datasets.retryOnFailHint")}
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Generation Progress */}
              {generating && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        {t("datasets.generatingDataset")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {generationMode === "individual" && progressTotal > 0
                          ? t("datasets.generatingRowProgress", {
                              current: String(progressCurrent),
                              total: String(progressTotal),
                            })
                          : t("datasets.generatingBatchProgress", {
                              model: selectedModel,
                            })}
                      </p>
                    </div>
                  </div>
                  {generationMode === "individual" && progressTotal > 0 && (
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((progressCurrent / progressTotal) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Generated Rows Preview */}
              {generatedRows.length > 0 && (
                <div className="rounded-lg border border-border bg-background/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {t("datasets.generatedRowsPreview", {
                        count: String(generatedRows.length),
                      })}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGeneratedRows([])}
                    >
                      {t("datasets.clearGeneratedRows")}
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {generatedRows.slice(0, 10).map((r, i) => (
                      <div
                        key={i}
                        className="rounded border border-border p-2.5 text-xs space-y-1 bg-card"
                      >
                        <div className="font-semibold text-cyan-400">
                          #{i + 1}
                        </div>
                        {datasetType === "post-training" ? (
                          <>
                            <div>
                              <strong>{t("datasets.prompt")}:</strong>{" "}
                              {r.prompt || r.instruction}
                            </div>
                            <div className="text-emerald-400">
                              <strong>{t("datasets.chosen")}:</strong>{" "}
                              {r.chosen || r.output}
                            </div>
                            <div className="text-rose-400">
                              <strong>{t("datasets.rejected")}:</strong>{" "}
                              {r.rejected || r.input}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <strong>{t("datasets.instruction")}:</strong>{" "}
                              {r.instruction}
                            </div>
                            {r.input && (
                              <div>
                                <strong>{t("datasets.input")}:</strong> {r.input}
                              </div>
                            )}
                            <div>
                              <strong>{t("datasets.output")}:</strong> {r.output}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {successMessage}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  disabled={!canGenerate || generating}
                  onClick={handleGenerateAndSave}
                  className="gap-2"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {generating
                    ? t("datasets.generatingDataset")
                    : t("datasets.generateAndSave")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canGenerate || generating}
                  onClick={handleAddToQueue}
                  className="gap-2"
                >
                  <ListOrdered className="w-4 h-4" />
                  {addedToQueueFeedback
                    ? t("datasets.addedToQueue")
                    : t("datasets.addToQueue")}
                </Button>
              </div>
            </div>
          )}

          {/* ---------- TAB 2: IMPORT FROM HUGGINGFACE ---------- */}
          {createTab === "huggingface" && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.datasetName")} *
                  </label>
                  <Input
                    value={hfName}
                    onChange={(e) => setHfName(e.target.value)}
                    placeholder={t("datasets.datasetNamePlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.datasetNameHint")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.hfDatasetPath")} *
                  </label>
                  <Input
                    value={hfDatasetPath}
                    onChange={(e) => setHfDatasetPath(e.target.value)}
                    placeholder={t("datasets.hfDatasetPathPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.hfDatasetPathHint")}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("datasets.description")}
                </label>
                <Input
                  value={hfDescription}
                  onChange={(e) => setHfDescription(e.target.value)}
                  placeholder={t("datasets.descriptionPlaceholder")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.hfSubset")}
                  </label>
                  <Input
                    value={hfSubset}
                    onChange={(e) => setHfSubset(e.target.value)}
                    placeholder={t("datasets.hfSubsetPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.hfSubsetHint")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.hfSplit")}
                  </label>
                  <select
                    value={hfSplit}
                    onChange={(e) => setHfSplit(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="train">train</option>
                    <option value="test">test</option>
                    <option value="validation">validation</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.hfMaxRows")}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    step={100}
                    value={hfMaxRows}
                    onChange={(e) =>
                      setHfMaxRows(parseInt(e.target.value, 10) || 100)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("datasets.hfMaxRowsHint")}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("datasets.hfToken")}
                </label>
                <Input
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder={t("datasets.hfTokenPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("datasets.hfTokenHint")}
                </p>
              </div>

              {importing && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      {t("datasets.importingDataset")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("datasets.importingFromHf")}
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {successMessage}
                </div>
              )}

              <Button
                disabled={!canImport || importing}
                onClick={handleImportFromHuggingFace}
                className="gap-2"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudDownload className="w-4 h-4" />
                )}
                {importing
                  ? t("datasets.importingDataset")
                  : t("datasets.importDataset")}
              </Button>
            </div>
          )}

          {/* ---------- TAB 3: QUEUE ---------- */}
          {createTab === "queue" && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              {queue.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <ListOrdered className="w-12 h-12 mx-auto text-muted-foreground/60" />
                  <h3 className="text-lg font-semibold">
                    {t("datasets.queueEmptyTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {t("datasets.queueEmptyDesc")}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setCreateTab("generate")}
                  >
                    {t("datasets.goToGenerate")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {t("datasets.queuedCount", {
                          count: String(queuedCount),
                        })}
                      </Badge>
                      {completedCount > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          {t("datasets.completedCount", {
                            count: String(completedCount),
                          })}
                        </Badge>
                      )}
                      {failedCount > 0 && (
                        <Badge variant="destructive">
                          {t("datasets.failedCount", {
                            count: String(failedCount),
                          })}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!queueRunning && queuedCount > 0 && (
                        <Button size="sm" onClick={startQueue}>
                          {t("datasets.startQueue", {
                            count: String(queuedCount),
                          })}
                        </Button>
                      )}
                      {queueRunning && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={stopQueue}
                        >
                          {t("datasets.stopAfterCurrent")}
                        </Button>
                      )}
                      {(completedCount > 0 || failedCount > 0) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={clearCompletedFromQueue}
                        >
                          {t("datasets.clearCompleted")}
                        </Button>
                      )}
                      {!queueRunning && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={clearAllQueue}
                        >
                          {t("datasets.clearAll")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {queue.map((item, idx) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              #{idx + 1}
                            </span>
                            <span className="font-semibold">{item.name}</span>
                            {item.datasetType === "post-training" && (
                              <Badge
                                variant="secondary"
                                className="bg-purple-500/15 text-purple-400"
                              >
                                {t("datasets.postTrainingBadge")}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {item.status === "queued" &&
                                t("datasets.statusQueued")}
                              {item.status === "generating" &&
                                t("datasets.statusGenerating")}
                              {item.status === "saving" &&
                                t("datasets.statusSaving")}
                              {item.status === "completed" &&
                                `${t("datasets.statusCompleted")} (${item.generatedRows || 0})`}
                              {item.status === "failed" &&
                                t("datasets.statusFailed")}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                            <span>
                              <strong>{t("datasets.aiModel")}:</strong>{" "}
                              {item.model}
                            </span>
                            <span>
                              <strong>{t("datasets.generationMode")}:</strong>{" "}
                              {item.generationMode === "individual"
                                ? `${item.targetRowCount} ${t("datasets.rows")}`
                                : `~${item.targetTokens.toLocaleString()} ${t("datasets.tokens")}`}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.prompt}
                          </p>
                          {item.error && (
                            <p className="text-xs text-destructive">
                              {item.error}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {item.status === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryQueueItem(item.id)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {item.status !== "generating" &&
                            item.status !== "saving" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFromQueue(item.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------- TAB 4: REFINE ---------- */}
          {createTab === "refine" && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-cyan-400" />
                  {t("datasets.refineTitle")}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("datasets.refineDesc")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.selectDatasetToRefine")} *
                  </label>
                  <select
                    value={refineDatasetId}
                    onChange={(e) => setRefineDatasetId(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">
                      {t("datasets.chooseDatasetPlaceholder")}
                    </option>
                    {activeDatasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.rowCount} {t("datasets.rows")}
                        {ds.datasetType === "post-training"
                          ? `, ${t("datasets.postTrainingBadge")}`
                          : ""}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("datasets.aiModel")} *
                  </label>
                  <select
                    value={refineModel}
                    onChange={(e) => setRefineModel(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {models.map((m) => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.name ? `${m.name} (${m.model_id})` : m.model_id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("datasets.refinementInstructions")}
                </label>
                <textarea
                  rows={4}
                  value={refineInstructions}
                  onChange={(e) => setRefineInstructions(e.target.value)}
                  placeholder={t("datasets.refinementInstructionsPlaceholder")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <p className="text-xs text-muted-foreground">
                  {t("datasets.refinementInstructionsHint")}
                </p>
              </div>

              {refining && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      {t("datasets.refiningDataset")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("datasets.refiningProgress")}
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {successMessage}
                </div>
              )}

              <Button
                disabled={!canRefine || refining}
                onClick={handleRefineDataset}
                className="gap-2"
              >
                {refining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {refining
                  ? t("datasets.refiningDataset")
                  : t("datasets.refineDatasetButton")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default DatasetsApp;
