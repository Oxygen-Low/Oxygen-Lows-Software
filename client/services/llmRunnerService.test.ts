import { describe, it, expect, vi, beforeEach } from "vitest";
import { llmRunnerService } from "./llmRunnerService";

describe("LLMRunnerService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should have default server configuration", () => {
    expect(llmRunnerService.getServerUrl()).toContain("54123");
  });

  it("should parse streaming SSE chunks in chatStream correctly", async () => {
    const sseResponseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const mockReadableStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseResponseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      body: mockReadableStream,
    } as any);

    const deltas: string[] = [];
    let doneCalled = false;

    const full = await llmRunnerService.chatStream(
      [{ role: "user", content: "Hi" }],
      {},
      (delta) => deltas.push(delta),
      () => {
        doneCalled = true;
      },
    );

    expect(deltas).toEqual(["Hello", " world"]);
    expect(full).toBe("Hello world");
    expect(doneCalled).toBe(true);
  });

  it("should handle error responses from model server", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Model out of memory" }),
    } as any);

    let errorCaught: Error | null = null;
    await expect(
      llmRunnerService.chatStream(
        [{ role: "user", content: "Hi" }],
        {},
        () => {},
        () => {},
        (err) => {
          errorCaught = err;
        },
      ),
    ).rejects.toThrow("Model out of memory");

    expect(errorCaught?.message).toContain("Model out of memory");
  });
});
