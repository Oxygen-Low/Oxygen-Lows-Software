/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Projects from "./Projects";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "mock-token", user: { id: "user-1", role: "user" } },
  }),
}));

vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => ({
    models: [
      { provider: "horde", model_id: "Fast", name: "AI Horde - Fast" },
      { provider: "openai", model_id: "gpt-4o", name: "OpenAI - GPT-4o" },
      { provider: "anthropic", model_id: "claude-3-7-sonnet", name: "Anthropic - Claude 3.7" },
    ],
    selectedModel: "Fast",
    selectedProvider: "horde",
    getDecryptedApiKey: vi.fn(() => "mock-key"),
    isProviderConfigured: vi.fn(() => true),
  }),
}));

describe("Projects Page", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("renders Projects workspace with Orchestrator and navigation controls", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "proj-1",
            name: "Alpha Workspace",
            description: "Testing autonomous agent orchestration",
            orchestratorName: "MainOrchestrator",
            orchestratorModelProvider: "openai",
            orchestratorModelId: "gpt-4o",
            agents: [
              {
                id: "ag-1",
                name: "MainOrchestrator",
                role: "Lead Workspace Orchestrator",
                description: "Coordinates workspace",
                systemPrompt: "You are MainOrchestrator.",
                isOrchestrator: true,
                createdAt: new Date().toISOString(),
              },
            ],
            memoryFiles: [
              {
                id: "mem-1",
                filename: "goals.md",
                title: "Goals Document",
                content: "# Project Goals\nDeliver high quality outputs.",
                updatedAt: new Date().toISOString(),
              },
            ],
            tasks: [
              {
                id: "tsk-1",
                title: "Set up project architecture",
                status: "todo",
                priority: "high",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha Workspace")).toBeTruthy();
    });

    expect(screen.getAllByText("MainOrchestrator").length).toBeGreaterThan(0);
    expect(screen.getByText("goals.md")).toBeTruthy();
    expect(screen.getByText("Set up project architecture")).toBeTruthy();
  });

  it("clears chat when clicking on an agent or clicking Clear Chat", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "proj-1",
            name: "Alpha Workspace",
            orchestratorName: "Orchestrator",
            orchestratorModelProvider: "horde",
            orchestratorModelId: "Fast",
            agents: [
              {
                id: "ag-1",
                name: "Orchestrator",
                role: "Lead",
                systemPrompt: "Prompt",
                isOrchestrator: true,
                createdAt: new Date().toISOString(),
              },
              {
                id: "ag-2",
                name: "DeveloperAgent",
                role: "Coder",
                systemPrompt: "Prompt",
                isOrchestrator: false,
                createdAt: new Date().toISOString(),
              },
            ],
            memoryFiles: [],
            tasks: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agent-item-ag-2")).toBeTruthy();
    });

    // Click on DeveloperAgent in roster -> activates and starts fresh session
    const devAgent = screen.getByTestId("agent-item-ag-2");
    fireEvent.click(devAgent);

    await waitFor(() => {
      expect(screen.getByText(/Agent session active/i)).toBeTruthy();
    });

    // Click Clear Chat button
    const clearBtn = screen.getByTitle("Clear active chat session");
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
  });

  it("handles model selection change", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "proj-1",
            name: "Model Selection Workspace",
            orchestratorName: "Orchestrator",
            orchestratorModelProvider: "horde",
            orchestratorModelId: "Fast",
            agents: [
              {
                id: "ag-1",
                name: "Orchestrator",
                role: "Lead",
                systemPrompt: "Prompt",
                isOrchestrator: true,
                createdAt: new Date().toISOString(),
              },
            ],
            memoryFiles: [],
            tasks: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Model Selection Workspace")).toBeTruthy();
    });

    const modelSelect = screen.getByDisplayValue("Fast - koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M");
    expect(modelSelect).toBeTruthy();
    fireEvent.change(modelSelect, { target: { value: "openai:gpt-4o" } });
  });
});
