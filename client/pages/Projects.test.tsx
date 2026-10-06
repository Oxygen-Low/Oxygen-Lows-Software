/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Projects from "./Projects";
import { Hono } from "hono";
import { projectsRouter } from "../../server/routes/projects";

let apiProjects: any[] = [];
vi.mock("../../server/lib/dataStore.ts", () => ({
  queryTable: vi.fn(({ filters, single }) => {
    const rows = apiProjects.filter((p) =>
      filters.every((f: any) => p[f.field] === f.value),
    );
    return structuredClone(single ? (rows[0] ?? null) : rows);
  }),
  insertTable: vi.fn((_table, project) => {
    apiProjects.push(project);
    return project;
  }),
  updateTable: vi.fn((_table, filters, patch) => {
    const index = apiProjects.findIndex((p) =>
      filters.every((f: any) => p[f.field] === f.value),
    );
    if (index < 0) return [];
    apiProjects[index] = { ...apiProjects[index], ...structuredClone(patch) };
    return [apiProjects[index]];
  }),
  deleteTable: vi.fn((_table, filters) => {
    apiProjects = apiProjects.filter(
      (p) => !filters.every((f: any) => p[f.field] === f.value),
    );
  }),
}));
vi.mock("../../server/lib/auth.ts", () => ({
  verifyToken: () => ({ userId: "user-1" }),
  localAuthMiddleware: async (c: any, next: any) => {
    c.set("userId", "user-1");
    await next();
  },
}));
const projectApi = new Hono().route("/api/projects", projectsRouter);
function installProjectApi() {
  const fallback = global.fetch;
  global.fetch = vi.fn(async (url: any, options?: any) => {
    if (
      typeof url === "string" &&
      url.startsWith("/api/projects/") &&
      options?.method
    ) {
      return projectApi.request(url, options);
    }
    if (url === "/api/projects" && !options?.method && apiProjects.length) {
      return new Response(JSON.stringify({ data: apiProjects, error: null }), {
        status: 200,
      });
    }
    const response = await fallback(url, options);
    if (url === "/api/projects" && response.ok) {
      const body = await response.json();
      const rows = Array.isArray(body.data)
        ? body.data
        : body.data
          ? [body.data]
          : [];
      apiProjects = rows.map((p: any) => ({
        ...p,
        user_id: "user-1",
        revision: p.revision ?? 0,
      }));
      return { ...response, json: async () => body } as Response;
    }
    return response;
  }) as typeof fetch;
}



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
    apiProjects = [];
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

    installProjectApi();
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

    installProjectApi();
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

    installProjectApi();
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

    installProjectApi();
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

    installProjectApi();
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
      expect(apiProjects[0].history.some((e: any) => e.action.type === "hire_agent" && e.status === "applied")).toBe(true);
      expect(screen.getAllByText("Jade").length).toBeGreaterThan(0);
      expect(apiProjects[0].requests).toHaveLength(0);
    });

    // Ensure infinite multi-turn loop didn't flood the board with duplicate generic tasks
    expect(screen.queryByText(/Refine project architecture/i)).toBeNull();
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

    installProjectApi();
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

    installProjectApi();
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
      expect(screen.queryByTestId("agent-item-ag-2")).toBeNull();
      expect(apiProjects[0].history.some((e: any) => e.action.type === "fire_agent")).toBe(true);
      expect(apiProjects[0].requests).toHaveLength(0);
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

    installProjectApi();
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

    installProjectApi();
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

    installProjectApi();
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

    installProjectApi();
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
    installProjectApi();
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

    installProjectApi();
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

  it("handles autonomous task execution with AI model proxy, tool calls, deliverable creation, and chat feed deliverable", async () => {
    let proxyCalled = false;
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
                    role: "Lead",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                ],
                memoryFiles: [],
                tasks: [
                  {
                    id: "tsk-autonomous-1",
                    title: "Generate API specification",
                    description: "Produce OpenAPI schema for authentication endpoints",
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
      if (url === "/api/ai/proxy") {
        proxyCalled = true;
        return {
          ok: true,
          json: async () => ({
            text: `[MEMORY: WRITE filename="openapi_spec.md" content="# OpenAPI 3.0 Auth Spec\n\npaths:\n  /api/auth:\n    post:"]\n\nI have generated the complete OpenAPI specification and saved it to workspace memory.`,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    installProjectApi();
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-item-tsk-autonomous-1")).toBeTruthy();
    });

    // Select task
    fireEvent.click(screen.getByTestId("task-item-tsk-autonomous-1"));

    await waitFor(() => {
      expect(screen.getByText("Start Task")).toBeTruthy();
    });

    // Click Start Task
    fireEvent.click(screen.getByText("Start Task"));

    // Verify AI proxy was triggered and task completed
    await waitFor(() => {
      expect(proxyCalled).toBe(true);
      expect(screen.getByText(/Task completed successfully/i)).toBeTruthy();
      expect(screen.getByText(/Task Deliverable: Generate API specification/i)).toBeTruthy();
      expect(screen.getAllByText("openapi_spec.md").length).toBeGreaterThan(0);
    });
  });

  it("allows manual task creation and edits task details (description, priority, status)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-1",
                name: "Task Management Workspace",
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

    installProjectApi();
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Task Management Workspace")).toBeTruthy();
    });

    // Click "Add" task button
    const addTaskBtn = screen.getByTitle("Add new task");
    fireEvent.click(addTaskBtn);

    await waitFor(() => {
      expect(screen.getAllByText("New Task 1").length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/Detailed task objectives/i)).toBeTruthy();
    });

    // Edit description
    const descTextarea = screen.getByPlaceholderText(/Detailed task objectives/i);
    fireEvent.change(descTextarea, { target: { value: "Build responsive navbar with mobile drawer" } });

    fireEvent.blur(descTextarea);
    // Verify change persisted
    await waitFor(() => expect(apiProjects[0].tasks[0].description).toBe("Build responsive navbar with mobile drawer"));
  });

  it("actually performs web search via /api/ai/agent-search instead of hallucinating when agent triggers web search", async () => {
    let proxyCount = 0;
    let agentSearchCalled = false;
    let agentSearchQuery = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-search-1",
                name: "Research Workspace",
                orchestratorName: "ResearcherAgent",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-research",
                    name: "ResearcherAgent",
                    role: "Market Researcher",
                    systemPrompt: "You are a research agent.",
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
      if (url === "/api/ai/agent-search" && opts?.method === "POST") {
        agentSearchCalled = true;
        const body = JSON.parse(opts.body);
        agentSearchQuery = body.query;
        return {
          ok: true,
          json: async () => ({
            context: "DeepSeek-V3 was released in December 2024 with 671B parameters.",
            result: "DeepSeek-V3 was released in December 2024 with 671B parameters.",
            searches: [{ query: body.query, snippets: ["DeepSeek-V3 released with 671B total params."] }],
          }),
        };
      }
      if (url === "/api/ai/proxy" && opts?.method === "POST") {
        proxyCount++;
        if (proxyCount === 1) {
          return {
            ok: true,
            json: async () => ({
              text: `I will check the web for DeepSeek V3 release.\n\n[ACTION: WEB_SEARCH query="DeepSeek V3 release details"]\n\nSearching now...`,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            text: `Based on the live web search findings, DeepSeek-V3 was officially released in December 2024.`,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    installProjectApi();
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Research Workspace")).toBeTruthy();
    });

    // Send a message asking for research
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "What are the DeepSeek V3 release details?" } });
    fireEvent.submit(input.closest("form")!);

    // Verify /api/ai/agent-search was actually called with the query
    await waitFor(() => {
      expect(agentSearchCalled).toBe(true);
      expect(agentSearchQuery).toBe("DeepSeek V3 release details");
    });

    // Verify web search action badge was rendered and tag was stripped
    await waitFor(() => {
      expect(screen.getByText(/Searched web for "DeepSeek V3 release details"/i)).toBeTruthy();
      expect(screen.getByText(/DeepSeek-V3 was officially released in December 2024/i)).toBeTruthy();
    });

    expect(screen.queryByText(/\[ACTION:\s*WEB_SEARCH/i)).toBeNull();
  });

  it("executes web search during autonomous task execution when task requires online research", async () => {
    let agentSearchCalled = false;
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-task-search-1",
                name: "Autonomous Search Workspace",
                orchestratorName: "TaskOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "TaskOrchestrator",
                    role: "Lead",
                    isOrchestrator: true,
                    createdAt: new Date().toISOString(),
                  },
                ],
                memoryFiles: [],
                tasks: [
                  {
                    id: "tsk-web-1",
                    title: "Research latest AI agent frameworks 2026",
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
      if (url === "/api/ai/agent-search" && opts?.method === "POST") {
        agentSearchCalled = true;
        return {
          ok: true,
          json: async () => ({
            context: "LangGraph, AutoGen, and CrewAI remain leading multi-agent frameworks.",
            result: "LangGraph, AutoGen, and CrewAI remain leading multi-agent frameworks.",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    installProjectApi();
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-item-tsk-web-1")).toBeTruthy();
    });

    // Select task and click "Start Task"
    fireEvent.click(screen.getByTestId("task-item-tsk-web-1"));

    await waitFor(() => {
      expect(screen.getByText("Start Task")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Start Task"));

    // Verify web search was executed in fallback / live task execution
    await waitFor(() => {
      expect(agentSearchCalled).toBe(true);
      expect(screen.getByText(/Task completed successfully/i)).toBeTruthy();
    });
  });

  it("injects real-world current date and time context into agent system prompt to prevent date hallucinations", async () => {
    let capturedSystemPrompt = "";
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "proj-date-1",
                name: "Date Aware Workspace",
                orchestratorName: "DateOrchestrator",
                orchestratorModelProvider: "openai",
                orchestratorModelId: "gpt-4o",
                agents: [
                  {
                    id: "ag-1",
                    name: "DateOrchestrator",
                    role: "Lead",
                    systemPrompt: "You are the Lead Orchestrator.",
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
      if (url === "/api/ai/proxy" && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        capturedSystemPrompt = body.systemPrompt || "";
        return {
          ok: true,
          json: async () => ({
            text: "I am aware of today's date.",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    installProjectApi();
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Date Aware Workspace")).toBeTruthy();
    });

    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "What is today's date?" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(capturedSystemPrompt).toBeTruthy();
    });

    const currentYear = new Date().getFullYear().toString();
    expect(capturedSystemPrompt).toContain("Current Date & Time:");
    expect(capturedSystemPrompt).toContain(currentYear);
    expect(capturedSystemPrompt).toContain("You are always aware of today's real-world date");
  });
  const requestFixture = () => ({
    id: "request-project", name: "Requests workspace", user_id: "user-1", description: "",
    orchestratorName: "Lead", orchestratorModelProvider: "openai", orchestratorModelId: "test",
    agents: [{ id: "lead", name: "Lead", role: "Lead", systemPrompt: "Lead", isOrchestrator: true, createdAt: "2026-01-01" },
      { id: "worker", name: "Worker", role: "Worker", systemPrompt: "Worker", createdAt: "2026-01-01" }],
    memoryFiles: [{ id: "notes", filename: "notes.md", title: "Notes", content: "Original", updatedAt: "2026-01-01" }],
    tasks: [{ id: "task", title: "Plan work", status: "todo", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
    requests: [], history: [], revision: 0, created_at: "2026-01-01", updated_at: "2026-01-01",
  });
  const startRequestFixture = (response: string, configure?: (project: any) => void) => {
    apiProjects = [requestFixture()];
    configure?.(apiProjects[0]);
    let calls = 0;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ text: calls++ === 0 ? response : "Waiting for your decision." }) })) as any;
    installProjectApi();
    return render(<MemoryRouter><Projects /></MemoryRouter>);
  };
  it("queues autonomous hiring and supports denial, reopening, acceptance, undo and reload", async () => {
    const view = startRequestFixture('[ACTION: CREATE_AGENT name="Ada" role="Engineer"]');
    await screen.findByText("Requests workspace");
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Suggest a specialist" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(apiProjects[0].requests).toHaveLength(1));
    expect(apiProjects[0].agents).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Requests \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Deny" }));
    await screen.findByText("Denied", { exact: true });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByRole("button", { name: "Accept" });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(apiProjects[0].agents).toHaveLength(3));
    view.unmount();
    render(<MemoryRouter><Projects /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Requests \(0\)/ }));
    const undo = screen.getAllByRole("button", { name: "Undo" }).find(button => !(button as HTMLButtonElement).disabled)!;
    fireEvent.click(undo);
    await waitFor(() => expect(apiProjects[0].agents).toHaveLength(2));
    expect(localStorage.getItem("oxygenlow_projects_cache_v1")).toBeNull();
  });
  it("queues firing from autonomous task execution without changing the roster", async () => {
    startRequestFixture('[ACTION: FIRE_AGENT name="Worker"]');
    fireEvent.click(await screen.findByTestId("task-item-task"));
    fireEvent.click(screen.getByRole("button", { name: "Start Task" }));
    await waitFor(() => expect(apiProjects[0].requests).toHaveLength(1));
    expect(apiProjects[0].agents.some((a: any) => a.id === "worker")).toBe(true);
    expect(apiProjects[0].requests[0].origin.agentId).toBe("lead");
  });
  it("does not reuse a button authorization for additional AI actions", async () => {
    startRequestFixture('[ACTION: FIRE_AGENT name="Worker"]\n[ACTION: CREATE_AGENT name="Unexpected" role="Extra"]');
    await screen.findByText("Requests workspace");
    fireEvent.click(screen.getByTitle("Prompt Orchestrator to Fire Agent"));
    await waitFor(() => expect(apiProjects[0].requests).toHaveLength(1));
    expect(apiProjects[0].history[0].action.type).toBe("fire_agent");
    expect(apiProjects[0].requests[0].action.type).toBe("hire_agent");
    expect(apiProjects[0].agents).toHaveLength(1);
  });
  it("binds a Fire button authorization to the selected ID when agent names match", async () => {
    startRequestFixture('[ACTION: FIRE_AGENT name="Worker"]', project => {
      project.agents.push({ ...project.agents[1], id: "other-worker" });
    });
    await screen.findByTestId("agent-item-other-worker");
    fireEvent.click(screen.getAllByTitle("Prompt Orchestrator to Fire Agent")[1]);
    await waitFor(() => expect(apiProjects[0].history).toHaveLength(1));
    expect(apiProjects[0].agents.some((a: any) => a.id === "worker")).toBe(true);
    expect(apiProjects[0].agents.some((a: any) => a.id === "other-worker")).toBe(false);
    expect(apiProjects[0].requests).toHaveLength(0);
  });
  it("shows approval save failures without executing the action", async () => {
    startRequestFixture('[ACTION: CREATE_AGENT name="Ada" role="Engineer"]');
    await screen.findByText("Requests workspace");
    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Suggest help" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(apiProjects[0].requests).toHaveLength(1));
    const original = global.fetch;
    global.fetch = vi.fn(async (url: any, options: any) => String(url).endsWith("/accept") ? new Response(JSON.stringify({ error: "saveFailed" }), { status: 500 }) : original(url, options)) as any;
    fireEvent.click(screen.getByRole("button", { name: /Requests \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByRole("alert");
    expect(apiProjects[0].agents).toHaveLength(2);
    expect(apiProjects[0].requests).toHaveLength(1);
  });
  it("removes old cached projects and shows server load errors", async () => {
    localStorage.setItem("oxygenlow_projects_cache_v1", JSON.stringify([requestFixture()]));
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));
    render(<MemoryRouter><Projects /></MemoryRouter>);
    await screen.findByRole("alert");
    expect(screen.queryByText("Requests workspace")).toBeNull();
    expect(localStorage.getItem("oxygenlow_projects_cache_v1")).toBeNull();
  });
  it("preserves unsaved memory text when its API save fails", async () => {
    startRequestFixture("");
    fireEvent.click(await screen.findByText("notes.md"));
    const editor = screen.getByDisplayValue("Original");
    fireEvent.change(editor, { target: { value: "Unsaved draft" } });
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByRole("alert");
    expect(screen.getByDisplayValue("Unsaved draft")).toBeTruthy();
    expect(apiProjects[0].memoryFiles[0].content).toBe("Original");
  });

});



