import { useState, useRef, useCallback, useEffect } from "react";
import { db } from "@/lib/db";
import { useTheme } from "@/hooks/useTheme";

export interface AgentSearchImage {
  data: string; // base64 or https:// URL
  type?: string; // MIME type
}

export interface AgentSearchOptions {
  query: string;
  responseFormat:
    | "conclusion"
    | "description"
    | "summary"
    | "analysis"
    | "comparison"
    | string;
  images?: AgentSearchImage[];
  stream?: boolean;
  researchModel?: string;
  researchProvider?: string;
  summarizerModel?: string;
  summarizerProvider?: string;
}

export interface SearchRecord {
  query: string;
  snippets: string[];
  urls: string[];
}

export interface ToolCallRecord {
  name: string;
  args: any;
  result?: any;
}

export interface AgentSearchResult {
  result: string;
  searches: SearchRecord[];
  totalPointsUsed: number;
}

export interface UseAgentSearchReturn {
  search: (options: AgentSearchOptions) => Promise<AgentSearchResult>;
  isSearching: boolean;
  status: string;
  toolCalls: ToolCallRecord[];
  result: string | null;
  error: string | null;
  totalPointsUsed: number;
  abort: () => void;
}

export function useAgentSearch(): UseAgentSearchReturn {
  const {
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
  } = useTheme();

  const defaultsRef = useRef({
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
  });

  useEffect(() => {
    defaultsRef.current = {
      researchAgentDefaultModel,
      researchAgentDefaultProvider,
      researchSummarizerDefaultModel,
      researchSummarizerDefaultProvider,
    };
  }, [
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
  ]);

  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalPointsUsed, setTotalPointsUsed] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const search = useCallback(
    async (options: AgentSearchOptions): Promise<AgentSearchResult> => {
      setIsSearching(true);
      setStatus("Connecting to search agent...");
      setToolCalls([]);
      setResult("");
      setError(null);
      setTotalPointsUsed(0);

      abortControllerRef.current = new AbortController();

      let finalResult: AgentSearchResult = {
        result: "",
        searches: [],
        totalPointsUsed: 0,
      };

      try {
        const {
          data: { session },
        } = await db.auth.getSession();
        if (!session) {
          throw new Error("Unauthorized: Please sign in");
        }

        const streamMode = options.stream !== false;
        const effectiveResearchModel =
          options.researchModel ||
          researchAgentDefaultModel ||
          defaultsRef.current.researchAgentDefaultModel;
        const effectiveResearchProvider =
          options.researchProvider ||
          researchAgentDefaultProvider ||
          defaultsRef.current.researchAgentDefaultProvider;
        const effectiveSummarizerModel =
          options.summarizerModel ||
          researchSummarizerDefaultModel ||
          defaultsRef.current.researchSummarizerDefaultModel;
        const effectiveSummarizerProvider =
          options.summarizerProvider ||
          researchSummarizerDefaultProvider ||
          defaultsRef.current.researchSummarizerDefaultProvider;

        const bodyPayload = {
          ...options,
          stream: streamMode,
          ...(effectiveResearchModel
            ? { researchModel: effectiveResearchModel }
            : {}),
          ...(effectiveResearchProvider
            ? { researchProvider: effectiveResearchProvider }
            : {}),
          ...(effectiveSummarizerModel
            ? { summarizerModel: effectiveSummarizerModel }
            : {}),
          ...(effectiveSummarizerProvider
            ? { summarizerProvider: effectiveSummarizerProvider }
            : {}),
        };

        const res = await fetch("/api/ai/agent-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          let errorMessage = "Failed to fetch";
          try {
            const errData = await res.json();
            errorMessage = errData.error || errData.message || errorMessage;
          } catch {
            errorMessage = res.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        if (!streamMode) {
          finalResult = await res.json();
          setResult(finalResult.result);
          setTotalPointsUsed(finalResult.totalPointsUsed || 0);
          setIsSearching(false);
          return finalResult;
        }

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep the incomplete line in the buffer

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const dataStr = line.replace(/^data: /, "").trim();

            if (dataStr === "[DONE]") {
              break;
            }

            try {
              const data = JSON.parse(dataStr);
              switch (data.type) {
                case "status":
                  setStatus(data.message);
                  break;
                case "tool_call":
                  setToolCalls((prev) => [
                    ...prev,
                    { name: data.name, args: data.args },
                  ]);
                  break;
                case "tool_result":
                  setToolCalls((prev) => {
                    const newCalls = [...prev];
                    for (let idx = newCalls.length - 1; idx >= 0; idx--) {
                      if (
                        newCalls[idx].name === data.name &&
                        newCalls[idx].result === undefined
                      ) {
                        newCalls[idx] = {
                          ...newCalls[idx],
                          result: data.result,
                        };
                        return newCalls;
                      }
                    }
                    const lastCall = newCalls[newCalls.length - 1];
                    if (lastCall && lastCall.name === data.name) {
                      lastCall.result = data.result;
                    }
                    return newCalls;
                  });
                  break;
                case "delta":
                  setResult((prev) => (prev || "") + data.content);
                  break;
                case "result":
                  finalResult = {
                    result: data.content,
                    searches: data.searches || [],
                    totalPointsUsed: data.totalPointsUsed || 0,
                  };
                  setResult(data.content);
                  setTotalPointsUsed(data.totalPointsUsed || 0);
                  break;
              }
            } catch (err) {
              console.error("Failed to parse SSE data:", err, dataStr);
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          setError("Search aborted");
        } else {
          setError(err.message || "An unexpected error occurred");
        }
        throw err;
      } finally {
        setIsSearching(false);
        setStatus("");
        abortControllerRef.current = null;
      }

      return finalResult;
    },
    [
      researchAgentDefaultModel,
      researchAgentDefaultProvider,
      researchSummarizerDefaultModel,
      researchSummarizerDefaultProvider,
    ],
  );

  return {
    search,
    isSearching,
    status,
    toolCalls,
    result,
    error,
    totalPointsUsed,
    abort,
  };
}
