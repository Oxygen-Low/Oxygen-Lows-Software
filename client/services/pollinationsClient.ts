export class PollinationsRateLimitError extends Error {
  statusCode: number;
  constructor(message = "Pollinations AI rate limit exceeded (HTTP 429)") {
    super(message);
    this.name = "PollinationsRateLimitError";
    this.statusCode = 429;
  }
}

export class PollinationsNotFoundError extends Error {
  statusCode: number;
  constructor(message = "Pollinations AI endpoint or model not found (HTTP 404)") {
    super(message);
    this.name = "PollinationsNotFoundError";
    this.statusCode = 404;
  }
}

export class PollinationsAuthError extends Error {
  statusCode: number;
  constructor(message = "Pollinations AI authentication required (HTTP 401)") {
    super(message);
    this.name = "PollinationsAuthError";
    this.statusCode = 401;
  }
}

export interface PollinationsMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PollinationsStreamOptions {
  model: string;
  messages: PollinationsMessage[];
  signal?: AbortSignal;
  apiKey?: string | null;
  onChunk: (delta: string) => void;
  onQueueInfo?: (info: any) => void;
}

export const POLLINATIONS_TEXT_API_URL = "https://gen.pollinations.ai/v1/chat/completions";

export interface SseDeltaTranslator {
  translate: (parsed: any) => string;
  flush: () => string;
}

/**
 * Creates an SSE delta translator that normalizes Anthropic and OpenAI-compatible streaming
 * tool-call events and text deltas into unified stream text with <tool_call> markup.
 */
export function createSseDeltaTranslator(): SseDeltaTranslator {
  const openAnthropicToolBlocks = new Map<number, { hasArgs: boolean }>();

  return {
    translate(parsed: any): string {
      let delta = "";

      if (
        parsed?.type === "content_block_start" &&
        parsed.content_block?.type === "tool_use"
      ) {
        const idx = parsed.index ?? openAnthropicToolBlocks.size;
        openAnthropicToolBlocks.set(idx, { hasArgs: false });
        const nameStr = JSON.stringify(parsed.content_block.name || "");
        delta += `<tool_call>\n{"name": ${nameStr}, "args": `;
      } else if (
        parsed?.type === "content_block_delta" &&
        parsed.delta?.type === "input_json_delta"
      ) {
        const idx = parsed.index ?? openAnthropicToolBlocks.size - 1;
        if (openAnthropicToolBlocks.has(idx)) {
          openAnthropicToolBlocks.get(idx)!.hasArgs = true;
        }
        delta += parsed.delta.partial_json || "";
      } else if (
        parsed?.type === "content_block_delta" &&
        parsed.delta?.type === "text_delta"
      ) {
        delta += parsed.delta.text || "";
      } else if (parsed?.type === "content_block_stop") {
        const idx = parsed.index ?? openAnthropicToolBlocks.size - 1;
        if (openAnthropicToolBlocks.has(idx)) {
          const block = openAnthropicToolBlocks.get(idx)!;
          if (!block.hasArgs) {
            delta += "{}";
          }
          delta += `\n}</tool_call>`;
          openAnthropicToolBlocks.delete(idx);
        }
      } else if (
        parsed?.type === "message_stop" ||
        parsed?.type === "message_delta"
      ) {
        if (openAnthropicToolBlocks.size > 0) {
          for (const [, block] of openAnthropicToolBlocks.entries()) {
            if (!block.hasArgs) delta += "{}";
            delta += `\n}</tool_call>`;
          }
          openAnthropicToolBlocks.clear();
        }
      } else {
        delta =
          parsed?.choices?.[0]?.delta?.content ||
          parsed?.choices?.[0]?.text ||
          parsed?.response ||
          parsed?.delta?.text ||
          "";
        const tc = parsed?.choices?.[0]?.delta?.tool_calls?.[0];
        if (tc) {
          if (tc.function?.name) {
            const nameStr = JSON.stringify(tc.function.name);
            delta += `<tool_call>\n{"name": ${nameStr}, "args": `;
          }
          if (tc.function?.arguments) delta += tc.function.arguments;
        }
        if (parsed?.choices?.[0]?.finish_reason === "tool_calls") {
          delta += `\n}</tool_call>`;
        }
      }

      return delta;
    },

    flush(): string {
      let unclosedDelta = "";
      if (openAnthropicToolBlocks.size > 0) {
        for (const [, block] of openAnthropicToolBlocks.entries()) {
          if (!block.hasArgs) unclosedDelta += "{}";
          unclosedDelta += `\n}</tool_call>`;
        }
        openAnthropicToolBlocks.clear();
      }
      return unclosedDelta;
    },
  };
}

/**
 * Sends a streaming chat completion request directly to Pollinations AI from the browser client.
 * Throws PollinationsRateLimitError if the server returns HTTP 429.
 * Throws PollinationsNotFoundError if the server returns HTTP 404.
 * Throws PollinationsAuthError if the server returns HTTP 401 or 403.
 */
export async function streamPollinationsClient({
  model,
  messages,
  signal,
  apiKey,
  onChunk,
  onQueueInfo,
}: PollinationsStreamOptions): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(POLLINATIONS_TEXT_API_URL, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new PollinationsAuthError();
  }

  if (response.status === 429) {
    throw new PollinationsRateLimitError();
  }

  if (response.status === 404) {
    throw new PollinationsNotFoundError();
  }

  if (!response.ok) {
    let errorText = `Pollinations error: ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorText = errJson.error.message;
      } else if (errJson?.error) {
        errorText = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
      }
    } catch {
      // fallback to status text
    }
    const err = new Error(errorText) as any;
    err.statusCode = response.status;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Unable to read response stream from Pollinations.");
  }

  const decoder = new TextDecoder();
  let fullContent = "";
  let streamBuffer = "";
  const translator = createSseDeltaTranslator();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    streamBuffer += decoder.decode(value, { stream: true });
    const lines = streamBuffer.split("\n");
    streamBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") break;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.queue_info) onQueueInfo?.(parsed.queue_info);
        const delta = translator.translate(parsed);

        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // ignore parse error on partial chunks
      }
    }
  }

  const flushed = translator.flush();
  if (flushed) {
    fullContent += flushed;
    onChunk(flushed);
  }

  return fullContent;
}

/**
 * Sends a non-streaming chat completion request directly to Pollinations AI from the browser client.
 * Throws PollinationsRateLimitError if the server returns HTTP 429.
 * Throws PollinationsNotFoundError if the server returns HTTP 404.
 */
export async function fetchPollinationsClient({
  model,
  messages,
  signal,
  apiKey,
}: {
  model: string;
  messages: PollinationsMessage[];
  signal?: AbortSignal;
  apiKey?: string | null;
}): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(POLLINATIONS_TEXT_API_URL, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new PollinationsAuthError();
  }

  if (response.status === 429) {
    throw new PollinationsRateLimitError();
  }

  if (response.status === 404) {
    throw new PollinationsNotFoundError();
  }

  if (!response.ok) {
    let errorText = `Pollinations error: ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorText = errJson.error.message;
      } else if (errJson?.error) {
        errorText = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
      }
    } catch {}
    const err = new Error(errorText) as any;
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  const text =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    data?.content?.[0]?.text ||
    (typeof data === "string" ? data : "");
  return text;
}

export interface PollinationsBalanceResult {
  pollen: number;
  raw?: any;
}

/**
 * Fetches the user's Pollen wallet balance from Pollinations AI.
 * If a direct key is provided, calls Pollinations directly.
 * Otherwise, queries the server balance endpoint using the authenticated session.
 */
export async function fetchPollinationsBalance(
  tokenOrKey?: string | null,
): Promise<number> {
  const trimmed = tokenOrKey ? tokenOrKey.trim() : "";

  // If a direct Pollinations key (pk_... / sk_...) is provided, fetch directly
  if (trimmed && (trimmed.startsWith("pk_") || trimmed.startsWith("sk_"))) {
    try {
      const response = await fetch(
        "https://gen.pollinations.ai/account/balance",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${trimmed}`,
          },
        },
      );

      if (!response || !response.ok || typeof response.json !== "function") {
        return 0;
      }

      const data = await response.json();
      if (typeof data?.pollen === "number") {
        return data.pollen;
      }
      if (typeof data?.balance === "number") {
        return data.pollen || data.balance;
      }
      if (typeof data?.credits === "number") {
        return data.credits;
      }
      return 0;
    } catch (err) {
      console.warn("Failed to fetch Pollinations balance:", err);
      return 0;
    }
  }

  // Otherwise, query the server-side balance endpoint with the session token
  try {
    const headers: Record<string, string> = {};
    if (trimmed) {
      headers["Authorization"] = `Bearer ${trimmed}`;
    }
    const res = await fetch("/api/ai/pollinations/balance", { headers });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.pollen === "number") return data.pollen;
      if (typeof data?.balance === "number") return data.balance;
    }
  } catch (err) {
    console.warn("Failed to fetch Pollinations balance from server:", err);
  }

  return 0;
}

