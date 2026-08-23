import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface AgentSearchImage {
  data: string;  // base64 or https:// URL
  type?: string; // MIME type
}

export interface AgentSearchOptions {
  query: string;
  responseFormat: "conclusion" | "description" | "summary" | "analysis" | "comparison" | string;
  images?: AgentSearchImage[];
  stream?: boolean;
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

  const search = useCallback(async (options: AgentSearchOptions): Promise<AgentSearchResult> => {
    setIsSearching(true);
    setStatus("");
    setToolCalls([]);
    setResult("");
    setError(null);
    
    abortControllerRef.current = new AbortController();
    
    let finalResult: AgentSearchResult = {
      result: "",
      searches: [],
      totalPointsUsed: 0
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Unauthorized: Please sign in");
      }

      const streamMode = options.stream !== false;
      const res = await fetch("/api/ai/agent-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ ...options, stream: streamMode }),
        signal: abortControllerRef.current.signal
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
                setToolCalls(prev => [...prev, { name: data.name, args: data.args }]);
                break;
              case "tool_result":
                setToolCalls(prev => {
                  const newCalls = [...prev];
                  const lastCall = newCalls[newCalls.length - 1];
                  if (lastCall && lastCall.name === data.name) {
                    lastCall.result = data.result;
                  }
                  return newCalls;
                });
                break;
              case "delta":
                setResult(prev => (prev || "") + data.content);
                break;
              case "result":
                finalResult = {
                  result: data.content,
                  searches: data.searches || [],
                  totalPointsUsed: data.totalPointsUsed || 0
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
  }, []);

  return {
    search,
    isSearching,
    status,
    toolCalls,
    result,
    error,
    totalPointsUsed,
    abort
  };
}
