/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AiScreenshareApp } from "./AiScreenshare";

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function() {};

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
    },
    from: vi.fn((table) => {
      if (table === "user_models") return mockSupabaseChain([{ provider: "openai", model_id: "gpt-4-vision" }]);
      return mockSupabaseChain(null);
    }),
  },
}));

// Mock fetch
global.fetch = vi.fn((url) => {
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

// Mock MediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: vi.fn()
  },
  writable: true
});

describe("AiScreenshareApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the AI Screenshare app with settings", async () => {
    render(<AiScreenshareApp />);

    await waitFor(() => {
      expect(screen.getByText("Gaming Coach")).toBeDefined();
    });

    expect(screen.getByText("Video React")).toBeDefined();
    expect(screen.getByText("Viewer")).toBeDefined();
    expect(screen.getByText("Start AI Screenshare")).toBeDefined();
  });

  it("shows preview area", async () => {
    render(<AiScreenshareApp />);
    expect(screen.getByText("Capture a window or screen to begin the AI reaction loop.")).toBeDefined();
  });
});
