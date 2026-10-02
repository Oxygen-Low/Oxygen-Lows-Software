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

  it("strips raw tool tags from displayed message and executes batch actions", async () => {
    let proxyCallCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-1",
                name: "Alpha Workspace",
                orchestratorName: "MainOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "MainOrchestrator",
                    role: "Lead Workspace Orchestrator",
                    systemPrompt: "You are Lead Orchestrator.",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                ],
                memoryFiles: [
                  {
                    id: "mem-1",
                    filename: "project_goals.md",
                    title: "Project Goals",
                    content: "# Alpha Goals\nExecute autonomous pipelines.",
                    updatedAt: new Date().toISOString(),
                  },
                ],
                tasks: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      if (url === "/api/ai/proxy") {
        proxyCallCount++;
        if (proxyCallCount === 1) {
          return {
            ok: true,
            json: async () => ({
              text: `I have analyzed the goals.\n\n[TASK: ADD title="Implement core auth module" priority="high"]\n[MEMORY: READ filename="project_goals.md"]\n\nScheduling tasks.`,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            text: `All tasks have been scheduled on the board.`,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha Workspace")).toBeTruthy();
    });

    // Type a message in chat input and submit
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Please create initial tasks" } });
    fireEvent.submit(input.closest("form")!);

    // Wait for the action badge and clean text
    await waitFor(() => {
      expect(screen.getByText(/Added task "Implement core auth module"/i)).toBeTruthy();
    });

    // Ensure raw [TASK: ADD ...] tag is NOT visible in the rendered message
    expect(screen.queryByText(/\[TASK:\s*ADD/i)).toBeNull();
    expect(screen.queryByText(/\[MEMORY:\s*READ/i)).toBeNull();
  });

  it("guides through 4-step hiring workflow with Hire Agent quick action", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-1",
                name: "Alpha Workspace",
                orchestratorName: "MainOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "MainOrchestrator",
                    role: "Lead",
                    systemPrompt: "Lead",
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
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha Workspace")).toBeTruthy();
    });

    // Click Hire Agent quick action
    const hireBtn = screen.getByText("Hire Agent");
    fireEvent.click(hireBtn);

    // Orchestrator starts 4-step interview with Question 1: Role
    await waitFor(() => {
      expect(screen.getByText(/1\. Role & Specialization/i)).toBeTruthy();
    });
  });

  it("selects task, assigns agent, and executes task with live action logs", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-1",
                name: "Alpha Workspace",
                orchestratorName: "MainOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "MainOrchestrator",
                    role: "Lead",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                  {
                    id: "ag-2",
                    name: "DevSpecialist",
                    role: "Developer",
                    isOrchestrator: false,
                    createdAt: new Date().toISOString(),
                  },
                ],
                memoryFiles: [
                  {
                    id: "mem-1",
                    filename: "project_goals.md",
                    title: "Project Goals",
                    content: "Build system",
                    updatedAt: new Date().toISOString(),
                  },
                ],
                tasks: [
                  {
                    id: "tsk-100",
                    title: "Build authentication router",
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
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-item-tsk-100")).toBeTruthy();
    });

    // Click task item to open Task Inspector
    const taskItem = screen.getByTestId("task-item-tsk-100");
    fireEvent.click(taskItem);

    // Verify Task tab is active and task details are shown
    await waitFor(() => {
      expect(screen.getByText("Start Task")).toBeTruthy();
    });

    // Click "Start Task"
    const startBtn = screen.getByText("Start Task");
    fireEvent.click(startBtn);

    // Verify task progression and completed log
    await waitFor(
      () => {
        expect(screen.getByText(/Task completed successfully/i)).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it("handles firing an agent with clean name extraction and stripped tags", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-1",
                name: "Alpha Workspace",
                orchestratorName: "MainOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "MainOrchestrator",
                    role: "Lead",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                  {
                    id: "ag-2",
                    name: "MarketingBot",
                    role: "Marketer",
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
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agent-item-ag-2")).toBeTruthy();
    });

    // Click fire agent button (flame icon) on MarketingBot
    const fireBtn = screen.getByTitle("Prompt Orchestrator to Fire Agent");
    fireEvent.click(fireBtn);

    // Verify orchestrator confirms offboarding with clean name and no raw tags
    await waitFor(() => {
      expect(screen.getByText(/I have offboarded \*\*MarketingBot\*\*/i)).toBeTruthy();
      expect(screen.getByText(/Fired agent "MarketingBot"/i)).toBeTruthy();
    });

    expect(screen.queryByText(/\[ACTION:\s*FIRE_AGENT/i)).toBeNull();
  });
});
