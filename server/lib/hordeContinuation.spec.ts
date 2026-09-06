import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stripEosTokens,
  deduplicateOverlap,
  EosStreamFilter,
  streamHordeWithContinuation,
  fetchHordeNonStreamWithContinuation,
  MAX_HORDE_CONTINUATIONS,
  CONTINUATION_USER_PROMPT,
} from "./hordeContinuation";

describe("hordeContinuation", () => {
  describe("stripEosTokens", () => {
    it("should detect and strip </s>", () => {
      const input = "This is a completed sentence.</s> extra junk";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(true);
      expect(res.cleanText).toBe("This is a completed sentence.");
    });

    it("should detect and strip <|eot_id|>", () => {
      const input = "Llama 3 generation complete.<|eot_id|>";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(true);
      expect(res.cleanText).toBe("Llama 3 generation complete.");
    });

    it("should detect and strip <|end_of_text|>", () => {
      const input = "Done here.<|end_of_text|>";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(true);
      expect(res.cleanText).toBe("Done here.");
    });

    it("should detect and strip <|im_end|>", () => {
      const input = "ChatML end.<|im_end|>";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(true);
      expect(res.cleanText).toBe("ChatML end.");
    });

    it("should detect and strip [EOS]", () => {
      const input = "Classic EOS.[EOS]";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(true);
      expect(res.cleanText).toBe("Classic EOS.");
    });

    it("should return unchanged text if no EOS token is present", () => {
      const input = "Continuing generating text...";
      const res = stripEosTokens(input);
      expect(res.hasEos).toBe(false);
      expect(res.cleanText).toBe(input);
    });

    it("should handle empty or null string safely", () => {
      expect(stripEosTokens("")).toEqual({ cleanText: "", hasEos: false });
    });
  });

  describe("deduplicateOverlap", () => {
    it("should trim repeated words at the boundary", () => {
      const prev = "The capital of France is ";
      const next = "France is Paris.";
      expect(deduplicateOverlap(prev, next)).toBe("Paris.");
    });

    it("should repair word interrupted mid-word", () => {
      const prev = "The system was interrup";
      const next = "interrupted by a signal.";
      expect(deduplicateOverlap(prev, next)).toBe("ted by a signal.");
    });

    it("should not trim if there is no overlap", () => {
      const prev = "Hello world.";
      const next = " How are you today?";
      expect(deduplicateOverlap(prev, next)).toBe(" How are you today?");
    });

    it("should not trim trivial 1 or 2 character matches", () => {
      const prev = "banana";
      const next = "apple";
      expect(deduplicateOverlap(prev, next)).toBe("apple");
    });
  });

  describe("EosStreamFilter", () => {
    it("should process normal chunks cleanly", () => {
      const filter = new EosStreamFilter();
      expect(filter.process("Hello ").text).toBe("Hello ");
      expect(filter.process("world!").text).toBe("world!");
      expect(filter.flush()).toBe("");
    });

    it("should hold back potential prefix of EOS token and strip when completed", () => {
      const filter = new EosStreamFilter();
      // Chunk 1 ends with "<|"
      const res1 = filter.process("The end is near<|");
      expect(res1.text).toBe("The end is near");
      expect(res1.hasEos).toBe(false);

      // Chunk 2 completes the token "eot_id|>"
      const res2 = filter.process("eot_id|>");
      expect(res2.text).toBe("");
      expect(res2.hasEos).toBe(true);
    });

    it("should flush held-back prefix if subsequent chunk shows it was not an EOS token", () => {
      const filter = new EosStreamFilter();
      // Chunk 1 ends with "<"
      const res1 = filter.process("x <");
      expect(res1.text).toBe("x ");

      // Chunk 2 continues with " 5" (math expression, not an EOS token)
      const res2 = filter.process(" 5");
      expect(res2.text).toBe("< 5");
    });

    it("should flush held-back buffer on end of stream", () => {
      const filter = new EosStreamFilter();
      const res1 = filter.process("HTML tag <|");
      expect(res1.text).toBe("HTML tag ");
      expect(filter.flush()).toBe("<|");
    });
  });

  describe("streamHordeWithContinuation", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    function createMockSseResponse(chunks: string[], status = 200) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        status,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    it("should stream single response if finish_reason is stop", async () => {
      const mockChunks = [
        `data: {"choices":[{"delta":{"content":"Hello world!"},"finish_reason":null}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      globalThis.fetch = vi.fn().mockResolvedValue(createMockSseResponse(mockChunks));

      const res = await streamHordeWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Hi" }],
        },
      });

      expect(res.ok).toBe(true);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      expect(fullText).toContain("Hello world!");
      expect(fullText).toContain("[DONE]");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should automatically continue when finish_reason is length until stop", async () => {
      const round1Chunks = [
        `data: {"choices":[{"delta":{"content":"Part 1 of the story... "},"finish_reason":null}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const round2Chunks = [
        `data: {"choices":[{"delta":{"content":"Part 2 of the story."},"finish_reason":null}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(createMockSseResponse(round1Chunks))
        .mockResolvedValueOnce(createMockSseResponse(round2Chunks));

      globalThis.fetch = fetchMock;

      const res = await streamHordeWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Tell me a long story" }],
        },
      });

      expect(res.ok).toBe(true);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      expect(fullText).toContain("Part 1 of the story... ");
      expect(fullText).toContain("Part 2 of the story.");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify continuation prompt format
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondCallBody.messages).toHaveLength(3);
      expect(secondCallBody.messages[1]).toEqual({
        role: "assistant",
        content: "Part 1 of the story... ",
      });
      expect(secondCallBody.messages[2]).toEqual({
        role: "user",
        content: CONTINUATION_USER_PROMPT,
      });
    });

    it("should stop immediately when EOS token is encountered in content", async () => {
      const mockChunks = [
        `data: {"choices":[{"delta":{"content":"Here is your answer: 42</s> leaked tokens"},"finish_reason":null}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const fetchMock = vi.fn().mockResolvedValue(createMockSseResponse(mockChunks));
      globalThis.fetch = fetchMock;

      const res = await streamHordeWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "What is 6 * 7?" }],
        },
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      expect(fullText).toContain("Here is your answer: 42");
      expect(fullText).not.toContain("leaked tokens");
      expect(fullText).not.toContain("</s>");
      // Even though finish_reason was "length", EOS token forced an immediate stop
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should gracefully finish with prior output if continuation request network fails", async () => {
      const round1Chunks = [
        `data: {"choices":[{"delta":{"content":"First chunk succeeded."},"finish_reason":null}]}\n\n`,
        `data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(createMockSseResponse(round1Chunks))
        .mockRejectedValueOnce(new Error("Network connection dropped"));

      globalThis.fetch = fetchMock;

      const res = await streamHordeWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Go" }],
        },
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      expect(fullText).toContain("First chunk succeeded.");
      expect(fullText).toContain("[DONE]");
    });

    it("should return initial error directly if the very first request fails", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      globalThis.fetch = fetchMock;

      const res = await streamHordeWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer bad-key" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Go" }],
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("fetchHordeNonStreamWithContinuation", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("should return single response if finish_reason is stop", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: "assistant", content: "Short answer." },
              finish_reason: "stop",
            },
          ],
        }),
      });

      const res = await fetchHordeNonStreamWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Question" }],
        },
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.choices[0].message.content).toBe("Short answer.");
      expect(data.choices[0].finish_reason).toBe("stop");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should loop and concatenate when finish_reason is length", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: { role: "assistant", content: "Part 1 content " },
                finish_reason: "length",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: { role: "assistant", content: "Part 2 content." },
                finish_reason: "stop",
              },
            ],
          }),
        });

      globalThis.fetch = fetchMock;

      const res = await fetchHordeNonStreamWithContinuation({
        targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
        fetchHeaders: { Authorization: "Bearer test" },
        requestBody: {
          model: "Fast",
          messages: [{ role: "user", content: "Long task" }],
        },
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.choices[0].message.content).toBe("Part 1 content Part 2 content.");
      expect(data.choices[0].finish_reason).toBe("stop");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
