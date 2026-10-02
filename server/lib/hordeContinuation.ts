export const MAX_HORDE_CONTINUATIONS = 25;
export const CONTINUATION_USER_PROMPT =
  "Continue directly from where you left off without repeating previous text or adding introductory remarks.";

export const KNOWN_EOS_TOKENS = [
  "</s>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "[EOS]",
  "<|endoftext|>",
  "<|end|>",
  "<eos>",
  "[DONE]",
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
 * Strips standard conversational continuation preamble introduced by some LLMs
 * during continuation turns (e.g. "Sure, continuing from where I left off:").
 */
export function stripContinuationPrefixes(text: string): string {
  if (!text) return text;
  const prefixRegex =
    /^(?:sure,?\s*(?:here\s*(?:is|'s)\s*(?:the\s*)?)?(?:continuing|continuation)(?:\s*(?:from\s*)?(?:where\s*i\s*left\s*off|the\s*previous\s*text)?)?[:\n\s]*|^(?:continuing\s*(?:from\s*where\s*i\s*left\s*off|directly|the\s*previous\s*text)?[:\n\s]*)|^(?:here\s*(?:is|'s)\s*(?:the\s*)?(?:rest|continuation)[:\n\s]*))/i;
  return text.replace(prefixRegex, "");
}

/**
 * Checks whether an LLM generation is genuinely complete or was truncated/cut off.
 */
export function isGenerationComplete(
  accumulatedText: string,
  latestChunk: string,
  hasEos: boolean,
  finishReason: string | null | undefined,
): boolean {
  if (hasEos) return true;
  if (finishReason === "tool_calls") return true;
  if (
    finishReason === "length" ||
    finishReason === "model_length" ||
    finishReason === "max_tokens"
  ) {
    return false;
  }

  const combined = (accumulatedText + (latestChunk || "")).trim();
  if (!combined) return false;

  // Check for unclosed action/memory/task tags e.g. [ACTION: ..., [MEMORY: ..., [TASK: ...
  const lastOpenBracket = combined.lastIndexOf("[");
  const lastCloseBracket = combined.lastIndexOf("]");
  if (lastOpenBracket > lastCloseBracket) {
    return false; // Unclosed tag
  }

  // Check for unclosed code fences
  const codeBlockCount = (combined.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    return false; // Inside an unclosed code block
  }

  // If finishReason is explicitly "stop", check if text ends cleanly
  if (finishReason === "stop") {
    const lastChar = combined.slice(-1);
    const validEndings = [
      ".",
      "!",
      "?",
      '"',
      "'",
      "]",
      "}",
      ">",
      ")",
      "`",
      "\n",
      "*",
      "#",
    ];
    if (validEndings.includes(lastChar)) {
      return true;
    }
    // Ended mid-word or mid-phrase without EOS token
    return false;
  }

  // If finishReason is null/undefined/unknown and no EOS was found, it is not complete
  return false;
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
  maxContinuations?: number;
}

/**
 * Executes a streaming AI Horde request with automatic continuation until EOS or maxContinuations.
 * Returns a Response wrapping a ReadableStream of SSE events.
 */
export async function streamHordeWithContinuation(
  options: HordeContinuationRequestOptions,
): Promise<Response> {
  const {
    targetUrl,
    fetchHeaders,
    requestBody,
    signal,
    maxContinuations = MAX_HORDE_CONTINUATIONS,
  } = options;

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
      while (continuationCount <= maxContinuations) {
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
                  rawDelta = stripContinuationPrefixes(
                    deduplicateOverlap(accumulatedContent, rawDelta),
                  );
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

        const complete = isGenerationComplete(
          accumulatedContent,
          "",
          isDone,
          lastFinishReason,
        );

        if (complete || lastFinishReason === "tool_calls") {
          // Model naturally completed with EOS or stop condition
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
          );
          break;
        }

        if (roundTokensGenerated === 0) {
          // No tokens generated in this iteration; avoid infinite empty calls
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
          );
          break;
        }

        if (continuationCount >= maxContinuations) {
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
 * Executes a non-streaming AI Horde request with automatic continuation until EOS or maxContinuations.
 */
export async function fetchHordeNonStreamWithContinuation(
  options: HordeContinuationRequestOptions,
): Promise<Response> {
  const {
    targetUrl,
    fetchHeaders,
    requestBody,
    signal,
    maxContinuations = MAX_HORDE_CONTINUATIONS,
  } = options;

  let currentMessages = [...(requestBody.messages || [])];
  let accumulatedContent = "";
  let continuationCount = 0;
  let lastData: any = null;

  while (continuationCount <= maxContinuations) {
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
      rawContent = stripContinuationPrefixes(
        deduplicateOverlap(accumulatedContent, rawContent),
      );
    }

    const { cleanText, hasEos } = stripEosTokens(rawContent);
    const prevLen = accumulatedContent.length;
    accumulatedContent += cleanText;
    const finishReason = choice?.finish_reason;

    // Check if zero new tokens were generated
    if (accumulatedContent.length === prevLen) {
      break;
    }

    const complete = isGenerationComplete(
      accumulatedContent,
      cleanText,
      hasEos,
      finishReason,
    );

    if (complete || finishReason === "tool_calls") {
      break;
    }

    if (continuationCount < maxContinuations) {
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

export const HORDE_MODELS_MAP: Record<string, string[]> = {
  Fast: [
    "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
    "koboldcpp/Llama-3.2-1B-Instruct",
  ],
  Smart: ["aphrodite/DeepSeek-V4.1-Flash"],
  Writing: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"],
};

export function resolveHordeModel(modelName: string): string {
  if (HORDE_MODELS_MAP[modelName]) {
    return HORDE_MODELS_MAP[modelName].join(",");
  }
  return modelName;
}

export async function getFallbackHordeModel(
  category: "fast" | "general" = "general",
): Promise<string> {
  try {
    const res = await fetch("https://stablehorde.net/api/v2/status/models?type=text");
    if (!res.ok) return "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M";
    const models: any[] = await res.json();
    if (!Array.isArray(models) || models.length === 0) {
      return "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M";
    }
    const available = models.filter((m) => m.count > 0 && m.performance > 0);
    if (available.length === 0) return models[0].name;
    available.sort((a, b) => b.count - a.count);
    return available[0].name;
  } catch {
    return "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M";
  }
}
