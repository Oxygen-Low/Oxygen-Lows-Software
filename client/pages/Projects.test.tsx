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

    const modelSelect = screen.getByDisplayValue("Fast - koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M");
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

  it("handles workspace setup chat, locking UI, domain research, name capture, and unlocking", async () => {
    let projectInServer = {
      id: "proj-setup-1",
      name: "Beta Studio",
      description: "Testing setup chat",
      orchestratorName: "LeadOrchestrator",
      orchestratorModelProvider: "openai",
      orchestratorModelId: "gpt-4o",
      orchestratorPrompt: "Lead Orchestrator Prompt",
      isSetupComplete: false,
      agents: [
        {
          id: "ag-lead",
          name: "LeadOrchestrator",
          role: "Lead Workspace Orchestrator",
          systemPrompt: "Lead Orchestrator Prompt",
          isOrchestrator: true,
          createdAt: new Date().toISOString(),
        },
      ],
      memoryFiles: [],
      tasks: [],
      setupState: {
        isComplete: false,
        step: 1,
        messages: [
          {
            id: "msg-q1",
            sender: "orchestrator",
            agentName: "LeadOrchestrator",
            content: "Welcome to your new workspace! Let's get things set up.\n\n1. Does this project or business already exist, and does it have an official website or domain?",
            createdAt: new Date().toISOString(),
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects" && (!opts || !opts.method || opts.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ data: [projectInServer] }),
        };
      }
      if (url.startsWith("/api/projects/") && opts?.method === "PATCH") {
        const body = JSON.parse(opts.body);
        projectInServer = { ...projectInServer, ...body };
        return {
          ok: true,
          json: async () => ({ data: projectInServer }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    // Verify setup mode is active and locked banner is shown
    await waitFor(() => {
      expect(screen.getByText("Beta Studio")).toBeTruthy();
    });

    expect(screen.getAllByText(/Locked during setup/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Step 1: Project & Domain/i)).toBeTruthy();
    expect(screen.getByText(/Does this project or business already exist/i)).toBeTruthy();

    // Answer Question 1 with a domain
    const input = screen.getByPlaceholderText(/Enter whether project exists and website domain/i);

    fireEvent.change(input, { target: { value: "Yes, our website is https://betastudio.dev" } });
    fireEvent.submit(input.closest("form")!);

    // Verify advances to Step 2
    await waitFor(() => {
      expect(screen.getByText(/Step 2: User Profile/i)).toBeTruthy();
      expect(screen.getByText(/What is your name, or what would you like me to call you\?/i)).toBeTruthy();
    });

    // Answer Question 2 with user's name
    const inputStep2 = screen.getByPlaceholderText(/Enter your name or what you would like to be called/i);
    fireEvent.change(inputStep2, { target: { value: "Call me John" } });
    fireEvent.submit(inputStep2.closest("form")!);

    // Verify setup completes and unlocks the workspace
    await waitFor(() => {
      expect(screen.getByText(/Workspace setup complete/i)).toBeTruthy();
    });

    // Verify locked banner is gone and Quick Actions are unlocked
    expect(screen.queryByText(/Step 1: Project & Domain/i)).toBeNull();
    expect(screen.getByText("Hire Agent")).toBeTruthy();
    expect(screen.getByText("📋 Plan Tasks")).toBeTruthy();
    expect(screen.getByText("🧠 Audit Memory")).toBeTruthy();
  });

  it("supports Reset Setup to wipe partial setup and restart at question 1", async () => {
    let projectInServer = {
      id: "proj-setup-2",
      name: "Gamma Labs",
      orchestratorName: "Orchestrator",
      orchestratorModelProvider: "horde",
      orchestratorModelId: "Fast",
      isSetupComplete: false,
      agents: [
        {
          id: "ag-lead",
          name: "Orchestrator",
          role: "Lead",
          systemPrompt: "Lead Prompt",
          isOrchestrator: true,
          createdAt: new Date().toISOString(),
        },
      ],
      memoryFiles: [],
      tasks: [],
      setupState: {
        isComplete: false,
        step: 2,
        domain: "gammalabs.ai",
        messages: [
          {
            id: "msg-q1",
            sender: "orchestrator",
            agentName: "Orchestrator",
            content: "Welcome to your new workspace! Let's get things set up.\n\n1. Does this project or business already exist, and does it have an official website or domain?",
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-a1",
            sender: "user",
            content: "https://gammalabs.ai",
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-q2",
            sender: "orchestrator",
            agentName: "Orchestrator",
            content: "Great! I've recorded that.\n\n2. What is your name, or what would you like me to call you?",
            createdAt: new Date().toISOString(),
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects" && (!opts || !opts.method || opts.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ data: [projectInServer] }),
        };
      }
      if (url.startsWith("/api/projects/") && opts?.method === "PATCH") {
        const body = JSON.parse(opts.body);
        projectInServer = { ...projectInServer, ...body };
        return {
          ok: true,
          json: async () => ({ data: projectInServer }),
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
      expect(screen.getByText("Gamma Labs")).toBeTruthy();
      expect(screen.getByText(/Step 2: User Profile/i)).toBeTruthy();
    });

    // Click "Reset Setup"
    const resetBtn = screen.getByRole("button", { name: /Reset Setup/i });
    fireEvent.click(resetBtn);

    // Verify restarts at Step 1
    await waitFor(() => {
      expect(screen.getByText(/Step 1: Project & Domain/i)).toBeTruthy();
    });
  });

  it("renders Always badge and injects always_shown memory files directly into agent prompt", async () => {
    let lastProxyPayload: any = null;
    let projectInServer = {
      id: "proj-always-shown",
      name: "Autonomous Core Workspace",
      isSetupComplete: true,
      orchestratorName: "Arthur",
      orchestratorModelProvider: "horde",
      orchestratorModelId: "Fast",
      orchestratorPrompt: "You are Arthur, Lead Workspace Orchestrator.",
      agents: [
        {
          id: "ag-lead",
          name: "Arthur",
          role: "Lead Workspace Orchestrator",
          systemPrompt: "You are Arthur, Lead Workspace Orchestrator.",
          isOrchestrator: true,
          createdAt: new Date().toISOString(),
        },
      ],
      memoryFiles: [
        {
          id: "mem-user",
          filename: "user_profile.md",
          title: "User Profile",
          content: "# User Profile\n- **Name:** Alice\n- **Role:** Founder",
          always_shown: true,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "mem-secondary",
          filename: "extra_notes.md",
          title: "Extra Notes",
          content: "# Extra Notes\nSome background notes.",
          always_shown: false,
          updatedAt: new Date().toISOString(),
        },
      ],
      tasks: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects" && (!opts || !opts.method || opts.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ data: [projectInServer] }),
        };
      }
      if (url.startsWith("/api/projects/") && opts?.method === "PATCH") {
        const body = JSON.parse(opts.body);
        projectInServer = { ...projectInServer, ...body };
        return {
          ok: true,
          json: async () => ({ data: projectInServer }),
        };
      }
      if (url === "/api/ai/proxy" && opts?.method === "POST") {
        lastProxyPayload = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ response: "Hello Alice, I have your profile in mind." }),
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
      expect(screen.getByText("Autonomous Core Workspace")).toBeTruthy();
    });

    // Check that user_profile.md shows the Always badge in memory list
    expect(screen.getByText("user_profile.md")).toBeTruthy();
    expect(screen.getByText(/Always/i)).toBeTruthy();

    // Click on user_profile.md to open memory editor
    fireEvent.click(screen.getByText("user_profile.md"));

    // Check that the "Always in Prompt" checkbox is checked
    await waitFor(() => {
      const checkbox = screen.getByRole("checkbox", { name: /Always.*Prompt/i }) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    // Send a message to verify systemPrompt contains the always_shown memory
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "What is my name?" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(lastProxyPayload).toBeTruthy();
    });

    expect(lastProxyPayload.systemPrompt).toContain("Core Workspace Memory (Always Available to All Agents):");
    expect(lastProxyPayload.systemPrompt).toContain("--- [CORE MEMORY: user_profile.md - \"User Profile\"] ---");
    expect(lastProxyPayload.systemPrompt).toContain("# User Profile\n- **Name:** Alice\n- **Role:** Founder");
    expect(lastProxyPayload.systemPrompt).toContain("Available Workspace Memory Files (Requires [MEMORY: READ filename=\"<filename>\"] to view body):");
    expect(lastProxyPayload.systemPrompt).toContain("- extra_notes.md");
  });

  it("renders empty state when no projects exist and allows user to create one manually", async () => {
    let createdProject: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects" && (!opts || !opts.method || opts.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ data: createdProject ? [createdProject] : [] }),
        };
      }
      if (url === "/api/projects" && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        createdProject = { ...body, id: "created-proj-123" };
        return {
          ok: true,
          json: async () => ({ data: createdProject }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    // Verify empty state is displayed and no default project exists
    await waitFor(() => {
      expect(screen.getAllByText(/No projects yet/i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Default Workspace")).toBeNull();

    // Click "New Project" button in the empty state
    const newProjButtons = screen.getAllByRole("button", { name: /New Project/i });
    fireEvent.click(newProjButtons[0]);

    // Fill in modal
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. NextGen Web App/i)).toBeTruthy();
    });

    const nameInput = screen.getByPlaceholderText(/e\.g\. NextGen Web App/i);
    fireEvent.change(nameInput, { target: { value: "My Custom Startup" } });

    const createSubmitBtn = screen.getByRole("button", { name: /^Create$/i });
    fireEvent.click(createSubmitBtn);

    // Verify created workspace is now active
    await waitFor(() => {
      expect(screen.getByText("My Custom Startup")).toBeTruthy();
    });
  });
});

