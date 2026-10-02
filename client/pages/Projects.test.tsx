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

    // Step 1: User provides Role "Growth Specialist."
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Growth Specialist." } });
    fireEvent.submit(input.closest("form")!);

    // Step 2: Must ask for Name (NOT skipped)
    await waitFor(() => {
      expect(screen.getByText(/2\. Name:/i)).toBeTruthy();
    });

    // Step 2: User provides Name "Jade"
    fireEvent.change(input, { target: { value: "Jade" } });
    fireEvent.submit(input.closest("form")!);

    // Step 3: Must ask for Personality & Tone
    await waitFor(() => {
      expect(screen.getByText(/3\. Personality & Tone:/i)).toBeTruthy();
    });

    // Step 3: User provides Personality
    fireEvent.change(input, { target: { value: "Analytical and proactive" } });
    fireEvent.submit(input.closest("form")!);

    // Step 4: Must ask for Confirmation
    await waitFor(() => {
      expect(screen.getByText(/4\. Confirmation:/i)).toBeTruthy();
    });

    // Step 4: User confirms
    fireEvent.change(input, { target: { value: "Confirm" } });
    fireEvent.submit(input.closest("form")!);

    // Step 5: Agent Jade is created and orientation task added
    await waitFor(() => {
      expect(screen.getByText(/has been successfully hired and onboarded/i)).toBeTruthy();
      expect(screen.getAllByText("Jade").length).toBeGreaterThan(0);
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
      expect(screen.getByText(/I have offboarded/i)).toBeTruthy();
      expect(screen.getByText("MarketingBot")).toBeTruthy();
      expect(screen.getByText(/Fired agent "MarketingBot"/i)).toBeTruthy();
    });

    expect(screen.queryByText(/\[ACTION:\s*FIRE_AGENT/i)).toBeNull();
  });

  it("opens workspace directly without setup flow and displays quick actions", async () => {
    let projectInServer = {
      id: "proj-direct-1",
      name: "Direct Workspace",
      description: "Testing direct workspace access without setup",
      orchestratorName: "LeadOrchestrator",
      orchestratorModelProvider: "openai",
      orchestratorModelId: "gpt-4o",
      orchestratorPrompt: "Lead Orchestrator Prompt",
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
      memoryFiles: [
        {
          id: "mem-1",
          filename: "project_goals.md",
          title: "Project Goals",
          content: "# Goals",
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
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    // Verify workspace is immediately unlocked and quick actions are visible
    await waitFor(() => {
      expect(screen.getByText("Direct Workspace")).toBeTruthy();
    });

    expect(screen.queryByText(/Locked during setup/i)).toBeNull();
    expect(screen.queryByText(/Step 1: Project & Domain/i)).toBeNull();
    expect(screen.getByText("Hire Agent")).toBeTruthy();
    expect(screen.getByText("📋 Plan Tasks")).toBeTruthy();
    expect(screen.getByText("🧠 Audit Memory")).toBeTruthy();
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

  it("renders markdown formatting in chat messages and supports memory preview mode", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-md-1",
                name: "Markdown Test Workspace",
                description: "Testing markdown rendering",
                orchestratorName: "DocOrchestrator",
                orchestratorModelProvider: "horde",
                orchestratorModelId: "Fast",
                agents: [
                  {
                    id: "ag-1",
                    name: "DocOrchestrator",
                    role: "Documentation Specialist",
                    description: "Handles docs",
                    systemPrompt: "You are DocOrchestrator.",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                ],
                memoryFiles: [
                  {
                    id: "mem-1",
                    filename: "architecture.md",
                    title: "System Architecture",
                    content: "# Architecture Overview\n\n- **Client:** React 18 SPA\n- **Server:** Hono Node.js\n\n```typescript\nconst message = 'Hello World';\n```",
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
      if (url === "/api/ai/stream-proxy" || url === "/api/ai/proxy") {
        return {
          ok: true,
          json: async () => ({
            text: "Here is your plan:\n\n### Next Steps\n1. **Setup** the database\n2. Run `pnpm test`\n\n```json\n{\"status\": \"ready\"}\n```",
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
      expect(screen.getByText("Markdown Test Workspace")).toBeTruthy();
    });

    // Send a chat message
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Show me the project plan in markdown" } });
    fireEvent.submit(input.closest("form")!);

    // Wait for markdown formatted elements in chat
    await waitFor(() => {
      expect(screen.getByText("Next Steps")).toBeTruthy();
    });

    expect(screen.getByText("Setup")).toBeTruthy();
    expect(screen.getByText("pnpm test")).toBeTruthy();

    // Check Memory File Preview toggle
    fireEvent.click(screen.getByText("architecture.md"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Preview/i })).toBeTruthy();
    });

    // Click Preview button
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));

    // Memory markdown content should now be rendered
    await waitFor(() => {
      expect(screen.getByText("Architecture Overview")).toBeTruthy();
      expect(screen.getByText("Client:")).toBeTruthy();
    });

    // Click Edit button to switch back to textarea
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/# Document Title/i) as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toContain("# Architecture Overview");
    });
  });

  it("persists created project across reloads and does not prompt to create a new project after refreshing", async () => {
    let serverProjects: any[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects" && (!opts || !opts.method || opts.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ data: serverProjects }),
        };
      }
      if (url === "/api/projects" && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        const created = { ...body, id: "persisted-proj-999" };
        serverProjects = [created];
        return {
          ok: true,
          json: async () => ({ data: created }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // 1. Initial render with 0 projects -> shows empty state
    const { unmount } = render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/No projects yet/i).length).toBeGreaterThan(0);
    });

    // 2. User creates a project
    const newProjButtons = screen.getAllByRole("button", { name: /New Project/i });
    fireEvent.click(newProjButtons[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. NextGen Web App/i)).toBeTruthy();
    });

    const nameInput = screen.getByPlaceholderText(/e\.g\. NextGen Web App/i);
    fireEvent.change(nameInput, { target: { value: "Persistent SaaS Workspace" } });

    const createBtn = screen.getByRole("button", { name: /^Create$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText("Persistent SaaS Workspace")).toBeTruthy();
    });

    // 3. Simulate page refresh by unmounting and re-rendering
    unmount();
    cleanup();

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    // 4. Verify project is immediately loaded and workspace is active (NO empty state asking to create)
    await waitFor(() => {
      expect(screen.getByText("Persistent SaaS Workspace")).toBeTruthy();
    });

    expect(screen.queryByText(/No projects yet. Create one to get started!/i)).toBeNull();
  });
});


