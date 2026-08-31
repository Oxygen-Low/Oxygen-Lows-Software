/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useAgentSearch } from "./useAgentSearch";
import { ThemeContext, ThemeContextType } from "@/contexts/ThemeContext";

let lastFetchCall: { url: string; options: any } | null = null;

vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: "test-user-id" }, access_token: "test-token" },
        },
        error: null,
      }),
    },
  };
  return {
    db: mockClient,
    supabase: mockClient,
  };
});

describe("useAgentSearch Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastFetchCall = null;

    global.fetch = vi.fn().mockImplementation((url, options) => {
      lastFetchCall = { url: String(url), options };
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            result: "mock result",
            searches: [],
            totalPointsUsed: 5,
          }),
        body: null,
      });
    });
  });

  it("uses theme default research and summarizer models in search payload", async () => {
    const mockThemeValue: Partial<ThemeContextType> = {
      researchAgentDefaultModel: "my-custom-research-model",
      researchAgentDefaultProvider: "openrouter",
      researchSummarizerDefaultModel: "my-custom-summarizer-model",
      researchSummarizerDefaultProvider: "cloudflare",
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ThemeContext.Provider,
        { value: mockThemeValue as ThemeContextType },
        children,
      );

    const { result } = renderHook(() => useAgentSearch(), { wrapper });

    await act(async () => {
      await result.current.search({
        query: "test query",
        responseFormat: "summary",
        stream: false,
      });
    });

    expect(lastFetchCall).not.toBeNull();
    expect(lastFetchCall?.url).toBe("/api/ai/agent-search");
    const body = JSON.parse(lastFetchCall?.options?.body);
    expect(body.researchModel).toBe("my-custom-research-model");
    expect(body.researchProvider).toBe("openrouter");
    expect(body.summarizerModel).toBe("my-custom-summarizer-model");
    expect(body.summarizerProvider).toBe("cloudflare");
  });

  it("allows explicit search options to override theme defaults", async () => {
    const mockThemeValue: Partial<ThemeContextType> = {
      researchAgentDefaultModel: "default-research-model",
      researchAgentDefaultProvider: "openrouter",
      researchSummarizerDefaultModel: "default-summarizer-model",
      researchSummarizerDefaultProvider: "cloudflare",
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ThemeContext.Provider,
        { value: mockThemeValue as ThemeContextType },
        children,
      );

    const { result } = renderHook(() => useAgentSearch(), { wrapper });

    await act(async () => {
      await result.current.search({
        query: "override test",
        responseFormat: "conclusion",
        stream: false,
        researchModel: "explicit-research-model",
        researchProvider: "openai",
        summarizerModel: "explicit-summarizer-model",
        summarizerProvider: "anthropic",
      });
    });

    const body = JSON.parse(lastFetchCall?.options?.body);
    expect(body.researchModel).toBe("explicit-research-model");
    expect(body.researchProvider).toBe("openai");
    expect(body.summarizerModel).toBe("explicit-summarizer-model");
    expect(body.summarizerProvider).toBe("anthropic");
  });
});
