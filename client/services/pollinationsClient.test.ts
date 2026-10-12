import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  streamPollinationsClient,
  fetchPollinationsClient,
  PollinationsRateLimitError,
  PollinationsNotFoundError,
  PollinationsAuthError,
  POLLINATIONS_TEXT_API_URL,
} from "./pollinationsClient";

describe("pollinationsClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("streamPollinationsClient", () => {
    it("throws PollinationsRateLimitError when receiving HTTP 429", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const onChunk = vi.fn();
      await expect(
        streamPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
          onChunk,
        }),
      ).rejects.toThrow(PollinationsRateLimitError);

      expect(onChunk).not.toHaveBeenCalled();
    });

    it("throws PollinationsAuthError when receiving HTTP 401", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const onChunk = vi.fn();
      await expect(
        streamPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
          onChunk,
        }),
      ).rejects.toThrow(PollinationsAuthError);

      expect(onChunk).not.toHaveBeenCalled();
    });

    it("throws PollinationsNotFoundError when receiving HTTP 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const onChunk = vi.fn();
      await expect(
        streamPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
          onChunk,
        }),
      ).rejects.toThrow(PollinationsNotFoundError);

      expect(onChunk).not.toHaveBeenCalled();
    });

    it("streams response chunks successfully", async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      const encoder = new TextEncoder();
      let index = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (index < sseData.length) {
            controller.enqueue(encoder.encode(sseData[index]));
            index++;
          } else {
            controller.close();
          }
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream,
      });

      const chunks: string[] = [];
      const result = await streamPollinationsClient({
        model: "inclusionai/ling-3.1-flash",
        messages: [{ role: "user", content: "Hi" }],
        apiKey: "test-api-key",
        onChunk: (delta) => chunks.push(delta),
      });

      expect(result).toBe("Hello world!");
      expect(chunks).toEqual(["Hello", " world!"]);
      expect(global.fetch).toHaveBeenCalledWith(
        POLLINATIONS_TEXT_API_URL,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
    });

    it("throws an error when status is not ok (e.g. 500)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: { message: "Internal failure" } }),
      });

      await expect(
        streamPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hi" }],
          onChunk: vi.fn(),
        }),
      ).rejects.toThrow("Internal failure");
    });
  });

  describe("fetchPollinationsClient", () => {
    it("throws PollinationsRateLimitError when receiving HTTP 429", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      await expect(
        fetchPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow(PollinationsRateLimitError);
    });

    it("throws PollinationsAuthError when receiving HTTP 401", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(
        fetchPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow(PollinationsAuthError);
    });

    it("throws PollinationsNotFoundError when receiving HTTP 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        fetchPollinationsClient({
          model: "inclusionai/ling-3.1-flash",
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow(PollinationsNotFoundError);
    });

    it("fetches non-streaming completion content successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Generated title response" } }],
        }),
      });

      const result = await fetchPollinationsClient({
        model: "inclusionai/ling-3.1-flash",
        messages: [{ role: "user", content: "Title prompt" }],
      });

      expect(result).toBe("Generated title response");
    });
  });
});
