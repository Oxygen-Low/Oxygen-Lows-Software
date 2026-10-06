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
}

export const POLLINATIONS_TEXT_API_URL = "https://gen.pollinations.ai/v1/chat/completions";

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
        const delta =
          parsed?.choices?.[0]?.delta?.content ||
          parsed?.choices?.[0]?.text ||
          "";
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // ignore parse error on partial chunks
      }
    }
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
    "";
  return text;
}
