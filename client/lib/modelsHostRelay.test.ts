import { describe, it, expect, beforeEach, vi } from "vitest";
import { modelsHostRelay } from "./modelsHostRelay";

describe("modelsHostRelay Client Manager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    modelsHostRelay.stopHosting();
    modelsHostRelay.setGaming(false);
    modelsHostRelay.setMasterPaused(false);
  });

  it("should provide initial state and notify on changes", () => {
    const state = modelsHostRelay.getState();
    expect(state.isConnected).toBe(false);
    expect(state.isGaming).toBe(false);
    expect(state.masterPaused).toBe(false);

    let observedGaming = false;
    const unsub = modelsHostRelay.subscribe((s) => {
      observedGaming = s.isGaming;
    });

    modelsHostRelay.setGaming(true);
    expect(observedGaming).toBe(true);
    expect(modelsHostRelay.getState().isGaming).toBe(true);

    unsub();
  });

  it("should update master paused state", () => {
    modelsHostRelay.setMasterPaused(true);
    expect(modelsHostRelay.getState().masterPaused).toBe(true);

    modelsHostRelay.setMasterPaused(false);
    expect(modelsHostRelay.getState().masterPaused).toBe(false);
  });

  it("should disable hosting and discovery when desktop bridge is not available (web mode)", async () => {
    delete (globalThis as any).window?.chrome;
    delete (globalThis as any).chrome;

    expect(modelsHostRelay.isHostingAvailable()).toBe(false);

    const discovered = await modelsHostRelay.discoverLocalModels(["http://localhost:8080/v1"]);
    expect(discovered).toEqual([]);

    await expect(modelsHostRelay.startHosting("test-token", [])).rejects.toThrow(
      "Model hosting is only available in the Oxygen Low's Software desktop app."
    );
  });

  it("should discover local models across custom endpoints when desktop bridge is present", async () => {
    // Mock desktop bridge presence
    (globalThis as any).window = globalThis.window || {};
    (globalThis as any).window.chrome = {
      webview: {
        postMessage: vi.fn(),
      },
    };

    expect(modelsHostRelay.isHostingAvailable()).toBe(true);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("11434/api/tags")) {
        return {
          ok: true,
          json: async () => ({
            models: [{ name: "llama3.2:3b" }, { name: "nomic-embed-text:latest" }],
          }),
        } as any;
      }
      if (urlStr.includes("1234/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "qwen2.5-coder-7b-instruct" }],
          }),
        } as any;
      }
      if (urlStr.includes("8080/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "my-vllm-model" }],
          }),
        } as any;
      }
      return { ok: false } as any;
    });

    const models = await modelsHostRelay.discoverLocalModels(["http://localhost:8080/v1"]);
    expect(models.length).toBeGreaterThanOrEqual(3);
    expect(models.some((m) => m.model_id === "llama3.2:3b")).toBe(true);
    expect(models.some((m) => m.model_id === "qwen2.5-coder-7b-instruct")).toBe(true);
    expect(models.some((m) => m.model_id === "my-vllm-model")).toBe(true);

    delete (globalThis as any).window.chrome;
  });
});
