/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { useAiModels, BUILTIN_MODELS } from "./useAiModels";
import { ThemeProvider } from "@/contexts/ThemeContext";

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
const mockInsert = vi
  .fn()
  .mockResolvedValue({ data: [{ id: "m-1" }], error: null });
const mockDelete = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();

let mockDbModels: any[] = [];
let mockIntegrations: any[] = [];

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
    },
    from: vi.fn((table: string) => {
      if (table === "user_models") {
        return {
          select: vi.fn(() => ({
            order: vi
              .fn()
              .mockResolvedValue({ data: mockDbModels, error: null }),
          })),
          insert: mockInsert,
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        };
      }
      if (table === "user_integrations") {
        return {
          select: vi
            .fn()
            .mockResolvedValue({ data: mockIntegrations, error: null }),
        };
      }
      if (table === "user_preferences") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  theme: "default",
                  font: "font-zilla",
                  use_gradient: true,
                  last_model_id: "gpt-4o",
                  last_provider: "openai",
                  chatbot_default_model: "gpt-4o",
                  chatbot_default_provider: "openai",
                  research_agent_default_model: "google/gemma-4-31b",
                  research_agent_default_provider: "horde",
                  research_summarizer_default_model:
                    "@cf/nvidia/nemotron-3-120b-a12b",
                  research_summarizer_default_provider: "cloudflare",
                },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
    rpc: (...args: any[]) => mockRpc(...args),
  };

  return {
    db: mockClient,
    supabase: mockClient,
    getAuthenticatedClient: () => mockClient,
  };
});

vi.mock("@/lib/desktopBridge", () => ({
  isDesktopBridgeAvailable: () => false,
  callDesktopBridge: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-id" }, access_token: "mock-token" },
    loading: false,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ThemeProvider, null, children);

describe("useAiModels Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockDbModels = [];
    mockIntegrations = [
      { provider: "openai", is_active: true, api_key: "sk-test" },
      { provider: "anthropic", is_active: true, api_key: "sk-ant" },
    ];

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes(":11434/api/tags")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ models: [{ name: "llama3.2:latest" }] }),
        });
      }
      if (urlStr.includes(":1234/v1/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: "lm-local-qwen" }] }),
        });
      }
      if (urlStr.includes(":5001/api/v1/model")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: "kobold-pygmalion" }),
        });
      }
      if (urlStr.includes("/api/ai/local-providers")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (urlStr.includes("/api/ai/horde-status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              Fast: { workers: 10, queued: 0, speed: "fast", eta: 0 },
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("loads built-in models and probes local models successfully", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify built-in models definition
    expect(BUILTIN_MODELS.some((m) => m.provider === "cloudflare")).toBe(true);
    expect(
      BUILTIN_MODELS.some(
        (m) => m.provider === "horde" && m.model_id === "Fast",
      ),
    ).toBe(true);

    // Verify probed local models
    expect(
      result.current.models.some((m) => m.model_id === "llama3.2:latest"),
    ).toBe(true);
    expect(
      result.current.models.some((m) => m.model_id === "lm-local-qwen"),
    ).toBe(true);
    expect(
      result.current.models.some((m) => m.model_id === "kobold-pygmalion"),
    ).toBe(true);

    // Verify localStatus
    expect(result.current.localStatus.ollama).toBe(true);
    expect(result.current.localStatus.lmstudio).toBe(true);
    expect(result.current.localStatus.kobold).toBe(true);
    expect(result.current.localStatus.totalLocal).toBeGreaterThan(0);
  });

  it("detects configured integrations from user_integrations", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.isProviderConfigured("openai")).toBe(true);
      expect(result.current.isProviderConfigured("anthropic")).toBe(true);
      expect(result.current.isProviderConfigured("google")).toBe(false);
    });
  });

  it("allows adding a custom model and prevents duplicates", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let addRes: any;
    await act(async () => {
      addRes = await result.current.addCustomModel(
        "openai",
        "gpt-4o-custom",
        "My Custom 4o",
      );
    });

    expect(addRes.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "test-user-id",
      provider: "openai",
      model_id: "gpt-4o-custom",
      name: "My Custom 4o",
    });

    // Try adding duplicate
    let dupRes: any;
    await act(async () => {
      dupRes = await result.current.addCustomModel("openai", "gpt-4o-custom");
    });

    expect(dupRes.success).toBe(false);
    expect(dupRes.error).toContain("already registered");
  });

  it("allows removing a custom model", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let removeRes: any;
    await act(async () => {
      removeRes = await result.current.removeCustomModel(
        "openai",
        "gpt-4o-custom",
      );
    });

    expect(removeRes.success).toBe(true);
  });

  it("removes custom models from localStorage case-insensitively", async () => {
    localStorage.setItem(
      "custom_user_models",
      JSON.stringify([
        { provider: "OpenAI", model_id: "GPT-4O-CUSTOM", name: "Custom 4O" },
        {
          provider: "anthropic",
          model_id: "claude-custom",
          name: "Claude Custom",
        },
      ]),
    );

    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.removeCustomModel("openai", "gpt-4o-custom");
    });

    const remaining = JSON.parse(
      localStorage.getItem("custom_user_models") || "[]",
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].provider).toBe("anthropic");
    expect(remaining[0].model_id).toBe("claude-custom");
  });

  it("exposes feature default model preferences and setters", async () => {
    const { result } = renderHook(() => useAiModels(), { wrapper });

    await waitFor(() => {
      expect(result.current.chatbotDefaultModel).toBe("gpt-4o");
      expect(result.current.researchAgentDefaultModel).toBe(
        "google/gemma-4-31b",
      );
      expect(result.current.researchSummarizerDefaultModel).toBe(
        "@cf/nvidia/nemotron-3-120b-a12b",
      );
    });

    await act(async () => {
      await result.current.setChatbotDefault("claude-3-7-sonnet", "anthropic");
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "upsert_user_preferences",
      expect.objectContaining({
        p_chatbot_default_model: "claude-3-7-sonnet",
        p_chatbot_default_provider: "anthropic",
      }),
    );
  });
});
