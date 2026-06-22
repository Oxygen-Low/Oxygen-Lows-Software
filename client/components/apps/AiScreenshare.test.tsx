/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AiScreenshareApp } from "./AiScreenshare";

// Mock react-i18next


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

// Mock supabase
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null })),
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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "test-user" }, access_token: "test-token" } }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn((table) => {
      if (table === "user_models") return mockSupabaseChain([{ provider: "openai", model_id: "gpt-4-vision" }]);
      if (table === "user_preferences") return mockSupabaseChain({ theme: "default", language: "English" });
      return mockSupabaseChain(null);
    }),
    rpc: vi.fn((name) => {
      if (name === 'get_chat_styles') return Promise.resolve({ data: [
        { id: "gaming_coach", title: "Gaming Coach", description: "Test" },
        { id: "video_react", title: "Video React", description: "Test" },
        { id: "viewer", title: "Viewer", description: "Test" }
      ], error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

// Mock fetch
global.fetch = vi.fn((url, options) => {
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as any;

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

    // Assert UI population
    await waitFor(() => {
      expect(screen.getByText("openai - gpt-4-vision")).toBeDefined();
    });

    expect(screen.getByText("Gaming Coach")).toBeDefined();
    expect(screen.getByText("Video React")).toBeDefined();
    expect(screen.getByText("Viewer")).toBeDefined();
    expect(screen.getByText("Start Screenshare")).toBeDefined();
  });

  it("shows preview area", async () => {
    render(<ThemeProvider><AiScreenshareApp /></ThemeProvider>);
    expect(screen.getByText("Capture a window or screen to let the AI start reacting.")).toBeDefined();
  });
});
