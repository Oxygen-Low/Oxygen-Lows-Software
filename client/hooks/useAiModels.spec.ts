/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { useAiModels, BUILTIN_MODELS, SUPPORTED_PROVIDERS } from "./useAiModels";
import { ThemeProvider } from "@/contexts/ThemeContext";

vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: "test-user-id" }, access_token: "mock-token" },
        },
        error: null,
      }),
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  };

  return {
    db: mockClient,
    supabase: mockClient,
    getAuthenticatedClient: () => mockClient,
  };
});

vi.mock("@/services/pollinationsClient", () => ({
  fetchPollinationsBalance: vi.fn().mockImplementation(async (key?: string) => {
    if (key && key.trim()) {
      return 15.5;
    }
    return 0;
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ThemeProvider, null, children);

describe("useAiModels Hook (Pollinations Exclusive)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(""),
    } as unknown as Response);
  });

  afterEach(() => {
    localStorage.clear();
    global.fetch = originalFetch;
  });

  it("loads only Pollinations in supported providers and contains built-in models", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    expect(SUPPORTED_PROVIDERS.length).toBe(1);
    expect(SUPPORTED_PROVIDERS[0].id).toBe("pollinations");

    expect(result.current.models.length).toBeGreaterThan(0);
    expect(
      result.current.models.every((m) => m.provider === "pollinations"),
    ).toBe(true);
  });

  it("manages Pollinations API key and queries Pollen balance", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    expect(result.current.pollinationsApiKey).toBe("");
    expect(result.current.pollenBalance).toBe(0);
    expect(result.current.isProviderConfigured("pollinations")).toBe(false);

    await act(async () => {
      await result.current.setPollinationsApiKey("pk_test_12345");
    });

    expect(result.current.pollinationsApiKey).toBe("pk_test_12345");
    expect(result.current.isProviderConfigured("pollinations")).toBe(true);
    expect(result.current.configuredProviders).toContain("pollinations");
    expect(result.current.pollenBalance).toBe(15.5);
  });

  it("allows adding and removing custom Pollinations models", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await act(async () => {
      await result.current.addCustomModel({
        model_id: "custom/my-fine-tuned-model",
        name: "My Custom Model",
      });
    });

    expect(
      result.current.models.some((m) => m.model_id === "custom/my-fine-tuned-model"),
    ).toBe(true);
    expect(
      result.current.customModels.some((m) => m.model_id === "custom/my-fine-tuned-model"),
    ).toBe(true);

    await act(async () => {
      await result.current.removeCustomModel("custom/my-fine-tuned-model");
    });

    expect(
      result.current.customModels.some((m) => m.model_id === "custom/my-fine-tuned-model"),
    ).toBe(false);
  });

  it("updates chatbot and feature default models", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await act(async () => {
      await result.current.setChatbotDefault("deepseek-r1");
    });

    expect(result.current.chatbotDefaultModel).toBe("deepseek-r1");
  });
});
