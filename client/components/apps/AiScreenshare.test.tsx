/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AiScreenshareApp } from "./AiScreenshare";

// Mock scrollIntoView before anything else
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Mock ResizeObserver
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// Save originals
const origFetch = global.fetch;

// Mock supabase
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: vi.fn((onFulfilled) => {
      const res = { data, error: null };
      return onFulfilled ? Promise.resolve(res).then(onFulfilled) : Promise.resolve(res);
    }),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn((table) => {
      if (table === "user_models") return mockSupabaseChain([{ provider: "openai", model_id: "gpt-4-vision" }]);
      return mockSupabaseChain(null);
    }),
  },
}));

// Mock fetch
const fetchSpy = vi.fn((url, options) => {
  if (url === "/api/ai/styles") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        { id: "gaming_coach", title: "Gaming Coach", description: "Test" },
        { id: "video_react", title: "Video React", description: "Test" },
        { id: "viewer", title: "Viewer", description: "Test" }
      ])
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as any;
global.fetch = fetchSpy;

// Mock MediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: vi.fn()
  },
  configurable: true,
  writable: true
});

describe("AiScreenshareApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the AI Screenshare app with settings and authorization", async () => {
    render(<ThemeProvider><AiScreenshareApp /></ThemeProvider>);

    // Assert Styles API called with Auth header
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/ai/styles", expect.objectContaining({
        headers: {
          "Authorization": "Bearer test-token"
        }
      }));
    });

    // Assert UI population
    await waitFor(() => {
      expect(screen.getByText("openai - gpt-4-vision")).toBeDefined();
    });

    expect(screen.getByText("Gaming Coach")).toBeDefined();
    expect(screen.getByText("Video React")).toBeDefined();
    expect(screen.getByText("Viewer")).toBeDefined();
    expect(screen.getByText("Start AI Screenshare")).toBeDefined();
  });

  it("shows preview area", async () => {
    render(<ThemeProvider><AiScreenshareApp /></ThemeProvider>);
    expect(screen.getByText("Capture a window or screen to begin the AI reaction loop.")).toBeDefined();
  });
});
