import { useCallback, useEffect, useState } from "react";
import type { Model } from "./useAiModels";
import {
  isNativeRunnerAvailable,
  llamaStatus,
  type LlamaRunningInstance,
} from "@/lib/aiRunnerBridge";

/**
 * Discovers llama.cpp models currently running on the device via the native
 * bridge. Each running instance becomes a selectable local model in apps like
 * the Chatbot. The model id encodes the server port so requests can be routed
 * back to the correct process.
 */
export function encodeLlamaModelId(port: number, name: string): string {
  return `llamacpp:${port}:${name}`;
}

export function decodeLlamaModelId(modelId: string): number | null {
  const match = /^llamacpp:(\d+):/.exec(modelId);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : null;
}

export function useLocalLlamaModels(refreshMs = 5000) {
  const [instances, setInstances] = useState<LlamaRunningInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNativeRunnerAvailable()) {
      setInstances([]);
      return;
    }
    try {
      const status = await llamaStatus();
      setInstances(Array.isArray(status?.running) ? status.running : []);
    } catch {
      setInstances([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, [refresh, refreshMs]);

  const models: Model[] = instances.map((instance) => ({
    id: `local-llamacpp:${instance.modelId}:${instance.port}`,
    provider: "local-llamacpp",
    model_id: encodeLlamaModelId(instance.port, instance.displayName || instance.modelFile),
    name: instance.displayName || instance.modelFile,
    category: "custom" as const,
    isCustom: true,
    isLocal: true,
  }));

  return { models, instances, loading, refresh };
}
