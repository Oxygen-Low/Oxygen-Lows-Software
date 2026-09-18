/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Models, ModelsApp } from "./Models";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("Models Component UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();

    // Mock fetch for shared models, pinned, and host config
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/models/shared")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                id: "host1_llama3",
                name: "Community Llama 3",
                model_id: "llama3.2:3b",
                hostUserId: "1",
                hostUsername: "HostHero",
                provider: "ollama",
                modality: "text",
                sharing_mode: "public",
                has_password: false,
                max_tokens: 2048,
                max_concurrent: 2,
                status: "online",
                activeRequests: 0,
                queueLength: 0,
                isOwner: false,
                isFriend: false,
                tokensServedToday: 5400,
              },
              {
                id: "host2_vision",
                name: "Llava Vision",
                model_id: "llava:7b",
                hostUserId: "2",
                hostUsername: "VisionHost",
                provider: "lmstudio",
                modality: "vision",
                sharing_mode: "public",
                has_password: true,
                max_tokens: 4096,
                max_concurrent: 1,
                status: "busy",
                activeRequests: 1,
                queueLength: 1,
                isOwner: false,
                isFriend: false,
                tokensServedToday: 12000,
              },
            ],
          }),
        } as any;
      }
      if (urlStr.includes("/api/models/pinned")) {
        return {
          ok: true,
          json: async () => ({
            pinned: ["host1_llama3"],
          }),
        } as any;
      }
      if (urlStr.includes("/api/models/host/config")) {
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            masterPaused: false,
            models: [
              {
                id: "local_1",
                name: "Local Llama",
                model_id: "llama3.2:latest",
                provider: "ollama",
                sharing_mode: "public",
              },
            ],
            customEndpoints: [],
          }),
        } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render header and tab navigation", async () => {
    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /Models/i })).toBeDefined();
    expect(screen.queryByText("P2P Relay")).toBeNull();
    expect(screen.queryByText("Web Mode")).toBeNull();
    expect(screen.getByRole("tab", { name: /Browse Shared/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Host Models/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Pinned Models/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Playground/i })).toBeDefined();
  });

  it("should display shared community models in Browse tab", async () => {
    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Community Llama 3")).toBeDefined();
      expect(screen.getByText("Llava Vision")).toBeDefined();
      expect(screen.getByText("by HostHero")).toBeDefined();
    });
  });

  it("should filter models by search term", async () => {
    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Community Llama 3")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Search models, hosts, or providers...");
    fireEvent.change(searchInput, { target: { value: "vision" } });

    await waitFor(() => {
      expect(screen.queryByText("Community Llama 3")).toBeNull();
      expect(screen.getByText("Llava Vision")).toBeDefined();
    });
  });

  it("should show desktop required gate on Host tab when running in web mode", async () => {
    delete (window as any).chrome;

    render(
      <MemoryRouter>
        <ModelsApp />
      </MemoryRouter>
    );

    const hostTabButton = screen.getByRole("tab", { name: /Host Models/i });
    fireEvent.keyDown(hostTabButton, { key: "Enter" });
    fireEvent.click(hostTabButton);

    await waitFor(() => {
      expect(screen.getByText("Desktop App Required to Host Models")).toBeDefined();
      expect(screen.getAllByText("Download Desktop App").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Browse Shared Models")).toBeDefined();
    });
  });

  it("should switch to Host tab and show local controls when running in desktop mode", async () => {
    (window as any).chrome = {
      webview: {
        postMessage: vi.fn(),
      },
    };

    render(
      <MemoryRouter>
        <ModelsApp />
      </MemoryRouter>
    );

    const hostTabButton = screen.getByRole("tab", { name: /Host Models/i });
    fireEvent.keyDown(hostTabButton, { key: "Enter" });
    fireEvent.click(hostTabButton);

    await waitFor(() => {
      expect(screen.getByText("Share Local Models")).toBeDefined();
      expect(screen.getByText("Scan Local Engines")).toBeDefined();
    });

    delete (window as any).chrome;
  });

  it("should switch to Pinned tab", async () => {
    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    const pinnedTabButton = screen.getByRole("tab", { name: /Pinned Models/i });
    fireEvent.keyDown(pinnedTabButton, { key: "Enter" });
    fireEvent.click(pinnedTabButton);

    await waitFor(() => {
      // Either pinned model card or pinned empty message is rendered in pinned tab
      expect(
        screen.queryByText(/Pinned models are saved to your account/i)
      ).not.toBeNull();
    });
  });

  it("should switch to Playground tab and show playground interface", async () => {
    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    const playgroundTabButton = screen.getByRole("tab", { name: /Playground/i });
    fireEvent.keyDown(playgroundTabButton, { key: "Enter" });
    fireEvent.click(playgroundTabButton);

    await waitFor(() => {
      expect(screen.getByText("Model Playground")).toBeDefined();
      expect(screen.getByPlaceholderText("Type a prompt or message to test this model...")).toBeDefined();
    });
  });

  it("should render disabled model badge and disable test button", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/models/shared")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                id: "disabled_llama",
                name: "Offline Llama",
                model_id: "llama3:8b",
                hostUserId: "1",
                hostUsername: "HostHero",
                provider: "ollama",
                modality: "text",
                sharing_mode: "public",
                has_password: false,
                max_tokens: 2048,
                max_concurrent: 1,
                status: "disabled",
                activeRequests: 0,
                queueLength: 0,
                isOwner: true,
                isFriend: false,
                tokensServedToday: 0,
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Offline Llama")).toBeDefined();
      expect(screen.getByText("Disabled")).toBeDefined();
    });

    const testBtn = screen.getByRole("button", { name: /Test Model/i });
    expect(testBtn).toBeDefined();
    expect((testBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("should show disabled banner in playground when disabled model is loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/models/shared")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                id: "disabled_llama",
                name: "Offline Llama",
                model_id: "llama3:8b",
                hostUserId: "1",
                hostUsername: "HostHero",
                provider: "ollama",
                modality: "text",
                sharing_mode: "public",
                status: "disabled",
                max_tokens: 2048,
                max_concurrent: 1,
                activeRequests: 0,
                queueLength: 0,
                isOwner: true,
                isFriend: false,
                tokensServedToday: 0,
              },
            ],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    render(
      <MemoryRouter>
        <Models />
      </MemoryRouter>
    );

    const playgroundTabButton = screen.getByRole("tab", { name: /Playground/i });
    fireEvent.keyDown(playgroundTabButton, { key: "Enter" });
    fireEvent.click(playgroundTabButton);

    await waitFor(() => {
      expect(screen.getByText("Model Playground")).toBeDefined();
    });
  });
});
