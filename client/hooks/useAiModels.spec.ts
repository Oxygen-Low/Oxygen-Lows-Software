/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAiModels } from "./useAiModels";

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    lastModelId: null,
    lastProvider: null,
    setModelPreference: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}));

vi.mock("@/lib/desktopBridge", () => ({
  isDesktopBridgeAvailable: () => false,
  callDesktopBridge: vi.fn(() => Promise.resolve([])),
}));

describe("useAiModels Horde Coder visibility", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should hide Coder when Coder is not active (0 workers)", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === "/api/ai/local-providers") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { provider: "horde", model_id: "Fast" },
              { provider: "horde", model_id: "Smart" },
              { provider: "horde", model_id: "Coder" },
            ]),
        } as Response);
      }
      if (urlStr === "/api/ai/horde-status") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              Fast: { workers: 5, queued: 0, speed: "10", eta: 0 },
              Smart: { workers: 2, queued: 0, speed: "5", eta: 0 },
              Coder: { workers: 0, queued: 0, speed: "", eta: 0 },
            }),
        } as Response);
      }
      return Promise.reject(new Error("Network error"));
    });

    const { result } = renderHook(() => useAiModels("Fast", "horde"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Coder should be filtered out
    const modelIds = result.current.models.map((m) => m.model_id);
    expect(modelIds).toContain("Fast");
    expect(modelIds).toContain("Smart");
    expect(modelIds).not.toContain("Coder");
  });

  it("should display Coder when Coder is active (>0 workers)", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === "/api/ai/local-providers") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { provider: "horde", model_id: "Fast" },
              { provider: "horde", model_id: "Smart" },
              { provider: "horde", model_id: "Coder" },
            ]),
        } as Response);
      }
      if (urlStr === "/api/ai/horde-status") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              Fast: { workers: 5, queued: 0, speed: "10", eta: 0 },
              Smart: { workers: 2, queued: 0, speed: "5", eta: 0 },
              Coder: { workers: 1, queued: 0, speed: "12", eta: 5 },
            }),
        } as Response);
      }
      return Promise.reject(new Error("Network error"));
    });

    const { result } = renderHook(() => useAiModels("Fast", "horde"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      const modelIds = result.current.models.map((m) => m.model_id);
      expect(modelIds).toContain("Coder");
    });
  });
});
