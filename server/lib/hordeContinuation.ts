export const MAX_HORDE_CONTINUATIONS = 6;
export const CONTINUATION_USER_PROMPT =
  "Continue directly from where you left off without repeating previous text or adding introductory remarks.";

export const KNOWN_EOS_TOKENS = [
  "</s>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "[EOS]",
  "<|endoftext|>",
];

/**
 * Strips known EOS tokens from text and reports whether an EOS token was found.
 */
export function stripEosTokens(text: string): {
  cleanText: string;
  hasEos: boolean;
} {
  if (!text) return { cleanText: text, hasEos: false };
  let minIndex = -1;
  for (const token of KNOWN_EOS_TOKENS) {
    const idx = text.indexOf(token);
    if (idx !== -1 && (minIndex === -1 || idx < minIndex)) {
      minIndex = idx;
    }
  }

  if (minIndex !== -1) {
    return { cleanText: text.substring(0, minIndex), hasEos: true };
  }
  return { cleanText: text, hasEos: false };
}

/**
 * Deduplicates boundary overlap between previous text and continuation text.
 * Avoids repeated words or characters when an LLM re-emits the last few tokens.
 */
export function deduplicateOverlap(prevText: string, newText: string): string {
  if (!prevText || !newText) return newText;
  const maxOverlap = Math.min(prevText.length, newText.length, 120);
  for (let len = maxOverlap; len >= 3; len--) {
    const prevSlice = prevText.slice(-len);
    if (newText.startsWith(prevSlice)) {
      return newText.slice(len);
    }
  }
  return newText;
}

/**
 * Filters stream chunks to detect and strip EOS tokens even if split across chunks.
 */
export class EosStreamFilter {
  private buffer = "";

  public process(chunk: string): { text: string; hasEos: boolean } {
    this.buffer += chunk;
    const { cleanText, hasEos } = stripEosTokens(this.buffer);
    if (hasEos) {
      this.buffer = "";
      return { text: cleanText, hasEos: true };
    }

    // Check if the end of this.buffer matches a prefix of any known EOS token
    let holdBackLen = 0;
    for (const token of KNOWN_EOS_TOKENS) {
      for (let i = 1; i < token.length; i++) {
        const prefix = token.slice(0, i);
        if (this.buffer.endsWith(prefix)) {
          holdBackLen = Math.max(holdBackLen, prefix.length);
        }
      }
    }

    if (holdBackLen > 0) {
      const emitText = this.buffer.slice(0, -holdBackLen);
      this.buffer = this.buffer.slice(-holdBackLen);
      return { text: emitText, hasEos: false };
    }

    const emitText = this.buffer;
    this.buffer = "";
    return { text: emitText, hasEos: false };
  }

  public flush(): string {
    const text = this.buffer;
    this.buffer = "";
    return stripEosTokens(text).cleanText;
  }
}

export interface HordeContinuationRequestOptions {
  targetUrl: string;
  fetchHeaders: Record<string, string>;
  requestBody: Record<string, any>;
  signal?: AbortSignal;
}

/**
 * Executes a streaming AI Horde request with automatic continuation until EOS or MAX_HORDE_CONTINUATIONS.
 * Returns a Response wrapping a ReadableStream of SSE events.
 */
export async function streamHordeWithContinuation(
  options: HordeContinuationRequestOptions,
): Promise<Response> {
  const { targetUrl, fetchHeaders, requestBody, signal } = options;

  let currentMessages = [...(requestBody.messages || [])];
  const initialBody = {
    ...requestBody,
    stream: true,
    messages: currentMessages,
  };

  // Perform initial fetch so HTTP errors (401, 429, etc.) can be returned immediately
  const initialRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      ...fetchHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(initialBody),
    signal,
  });

  if (!initialRes.ok) {
    return initialRes;
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const writeSse = async (text: string) => {
    try {
      await writer.write(encoder.encode(text));
    } catch {}
  };

  // Background loop managing stream piping and subsequent continuation requests
  (async () => {
    let accumulatedContent = "";
    let continuationCount = 0;
    const eosFilter = new EosStreamFilter();
    let currentRes: Response | null = initialRes;

    try {
      while (continuationCount <= MAX_HORDE_CONTINUATIONS) {
        if (!currentRes) {
          const nextBody = {
            ...requestBody,
            stream: true,
            messages: currentMessages,
          };

          try {
            currentRes = await fetch(targetUrl, {
              method: "POST",
              headers: {
                ...fetchHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(nextBody),
              signal,
            });
          } catch (fetchErr) {
            console.warn(
              `AI Horde continuation request #${continuationCount} network failed; preserving accumulated content.`,
              fetchErr,
            );
            break;
          }

          if (!currentRes.ok) {
            console.warn(
              `AI Horde continuation request #${continuationCount} returned status ${currentRes.status}; preserving accumulated content.`,
            );
            break;
          }
        }

        if (!currentRes.body) {
          break;
        }

        const reader = currentRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let roundTokensGenerated = 0;
        let lastFinishReason: string | null = null;
        let isDone = false;
        let isFirstDeltaThisRound = true;

        while (true) {
          let readResult;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            console.warn(
              `AI Horde stream read error in round ${continuationCount}:`,
              readErr,
            );
            break;
          }

          const { done, value } = readResult;
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);
              const choice = data.choices?.[0];
              if (choice?.finish_reason) {
                lastFinishReason = choice.finish_reason;
              }

              let rawDelta =
                choice?.delta?.content || data.response || "";

              if (rawDelta) {
                if (continuationCount > 0 && isFirstDeltaThisRound) {
                  rawDelta = deduplicateOverlap(accumulatedContent, rawDelta);
                  isFirstDeltaThisRound = false;
                }

                const { text: cleanDelta, hasEos } =
                  eosFilter.process(rawDelta);

                if (cleanDelta) {
                  roundTokensGenerated++;
                  accumulatedContent += cleanDelta;

                  // Forward cleaned delta chunk to client
                  const clientChunk = {
                    ...data,
                    choices: [
                      {
                        ...choice,
                        delta: {
                          ...choice?.delta,
                          content: cleanDelta,
                        },
                        // Suppress finish_reason if we might continue
                        finish_reason: null,
                      },
                    ],
                  };
                  await writeSse(`data: ${JSON.stringify(clientChunk)}\n\n`);
                }

                if (hasEos) {
                  isDone = true;
                  lastFinishReason = "stop";
                  break;
                }
              } else if (choice?.delta?.tool_calls) {
                // Pass tool calls through untouched
                await writeSse(`data: ${dataStr}\n\n`);
              }
            } catch {}
          }

          if (isDone) break;
        }

        // Flush filter buffer
        const flushed = eosFilter.flush();
        if (flushed) {
          roundTokensGenerated++;
          accumulatedContent += flushed;
          const flushedChunk = {
            choices: [
              {
                delta: { content: flushed },
                finish_reason: null,
              },
            ],
          };
          await writeSse(`data: ${JSON.stringify(flushedChunk)}\n\n`);
        }

        // Evaluate stopping conditions
        if (
          isDone ||
          lastFinishReason === "stop" ||
          lastFinishReason === "tool_calls"
        ) {
          // Model naturally completed with EOS or stop token
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
          );
          break;
        }

        if (roundTokensGenerated === 0) {
          // No tokens generated in this iteration; avoid infinite empty calls
          break;
        }

        if (continuationCount >= MAX_HORDE_CONTINUATIONS) {
          // Reached safety cap
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
          );
          break;
        }

        // Prepare next continuation
        continuationCount++;
        currentMessages = [
          ...(requestBody.messages || []),
          { role: "assistant", content: accumulatedContent },
          { role: "user", content: CONTINUATION_USER_PROMPT },
        ];
        currentRes = null; // Forces fetch in next loop
      }

      await writeSse("data: [DONE]\n\n");
    } finally {
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Executes a non-streaming AI Horde request with automatic continuation until EOS or MAX_HORDE_CONTINUATIONS.
 */
export async function fetchHordeNonStreamWithContinuation(
  options: HordeContinuationRequestOptions,
): Promise<Response> {
  const { targetUrl, fetchHeaders, requestBody, signal } = options;

  let currentMessages = [...(requestBody.messages || [])];
  let accumulatedContent = "";
  let continuationCount = 0;
  let lastData: any = null;

  while (continuationCount <= MAX_HORDE_CONTINUATIONS) {
    const currentBody = {
      ...requestBody,
      stream: false,
      messages: currentMessages,
    };

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          ...fetchHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentBody),
        signal,
      });
    } catch (err) {
      if (continuationCount === 0) throw err;
      console.warn(
        `AI Horde non-streaming continuation #${continuationCount} failed; returning accumulated content.`,
      );
      break;
    }

    if (!res.ok) {
      if (continuationCount === 0) return res;
      console.warn(
        `AI Horde non-streaming continuation #${continuationCount} returned status ${res.status}; returning accumulated content.`,
      );
      break;
    }

    const data = await res.json();
    lastData = data;

    const choice = data.choices?.[0];
    let rawContent = choice?.message?.content || data.response || "";

    if (continuationCount > 0) {
      rawContent = deduplicateOverlap(accumulatedContent, rawContent);
    }

    const { cleanText, hasEos } = stripEosTokens(rawContent);
    accumulatedContent += cleanText;

    const finishReason = choice?.finish_reason;
    if (
      hasEos ||
      finishReason === "stop" ||
      finishReason === "tool_calls" ||
      !cleanText
    ) {
      break;
    }

    if (finishReason === "length" && continuationCount < MAX_HORDE_CONTINUATIONS) {
      continuationCount++;
      currentMessages = [
        ...(requestBody.messages || []),
        { role: "assistant", content: accumulatedContent },
        { role: "user", content: CONTINUATION_USER_PROMPT },
      ];
    } else {
      break;
    }
  }

  const finalResponseData = {
    ...(lastData || {}),
    choices: [
      {
        ...(lastData?.choices?.[0] || {}),
        message: {
          role: "assistant",
          content: accumulatedContent,
        },
        finish_reason: "stop",
      },
    ],
  };

  return new Response(JSON.stringify(finalResponseData), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
