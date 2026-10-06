import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { projectsRouter } from "./projects.ts";

const app = new Hono();
app.route("/api/projects", projectsRouter);

let mockProjectsDb: any[] = [];

vi.mock("../lib/dataStore.ts", () => ({
  queryTable: vi.fn(({ table, filters, single }) => {
    let list = [...mockProjectsDb];
    if (filters) {
      for (const f of filters) {
        if (f.operator === "eq") {
          list = list.filter((item) => item[f.field] === f.value);
        }
      }
    }
    if (single) {
      return list[0] || null;
    }
    return list;
  }),
  insertTable: vi.fn((table, data, userId) => {
    const record = Array.isArray(data) ? data[0] : data;
    mockProjectsDb.push(record);
    return record;
  }),
  updateTable: vi.fn((table, filters, updates, userId) => {
    const idFilter = filters?.find((f: any) => f.field === "id");
    const id = idFilter ? idFilter.value : null;
    const idx = mockProjectsDb.findIndex((item) => item.id === id);
    if (idx >= 0) {
      mockProjectsDb[idx] = { ...mockProjectsDb[idx], ...updates };
      return [mockProjectsDb[idx]];
    }
    return [];
  }),
  deleteTable: vi.fn((table, filters, userId) => {
    const idFilter = filters?.find((f: any) => f.field === "id");
    const id = idFilter ? idFilter.value : null;
    const idx = mockProjectsDb.findIndex((item) => item.id === id);
    if (idx >= 0) {
      const deleted = mockProjectsDb.splice(idx, 1);
      return deleted;
    }
    return [];
  }),
}));

vi.mock("../lib/auth.ts", () => ({
  localAuthMiddleware: async (c: any, next: any) => {
    if (c.req.header("Authorization") !== "Bearer valid-user-token") return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", "user-abc");
    await next();
  },
}));

describe("Projects API Routes (/api/projects)", () => {
  beforeEach(() => {
    mockProjectsDb = [];
  });

  it("rejects anonymous project reads and writes", async () => {
    mockProjectsDb = [{ id: "guest-secret", user_id: "guest" }];
    expect((await app.request("/api/projects")).status).toBe(401);
    expect((await app.request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "forged" }) })).status).toBe(401);
    expect(mockProjectsDb).toHaveLength(1);
  });

  it("POST /api/projects creates a new project with default orchestrator and memory", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({
        name: "Alpha Project",
        description: "Autonomous workspace testing",
        orchestratorName: "PrimeOrchestrator",
        orchestratorModelProvider: "openai",
        orchestratorModelId: "gpt-4o",
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.name).toBe("Alpha Project");
    expect(json.data.orchestratorName).toBe("PrimeOrchestrator");
    expect(json.data.agents).toHaveLength(1);
    expect(json.data.agents[0].isOrchestrator).toBe(true);
    expect(json.data.agents[0].name).toBe("PrimeOrchestrator");
    expect(json.data.memoryFiles).toHaveLength(1);
  });

  it("GET /api/projects lists projects for the user", async () => {
    // Create one project
    await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Project One" }),
    });

    const res = await app.request("/api/projects", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-user-token",
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe("Project One");
  });

  it("GET /api/projects/:id returns single project", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Detailed Project" }),
    });
    const created = await createRes.json();
    const projId = created.data.id;

    const res = await app.request(`/api/projects/${projId}`, {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(projId);
  });

  it("POST /api/projects/:id/agents adds a new specialized agent", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Agent Team Project" }),
    });
    const created = await createRes.json();
    const projId = created.data.id;

    const agentRes = await app.request(`/api/projects/${projId}/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({
        name: "CodeArchitect",
        role: "Full Stack Engineer",
        description: "Designs system architecture and writes code",
        systemPrompt: "You are CodeArchitect. Focus on clean code.",
      }),
    });

    expect(agentRes.status).toBe(201);
    const agentJson = await agentRes.json();
    expect(agentJson.data.name).toBe("CodeArchitect");
    expect(agentJson.data.isOrchestrator).toBe(false);

    // Verify project has 2 agents
    const fetchRes = await app.request(`/api/projects/${projId}`, {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    const fetchJson = await fetchRes.json();
    expect(fetchJson.data.agents).toHaveLength(2);
  });

  it("DELETE /api/projects/:id/agents/:agentId fires an agent but protects orchestrator", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Fire Agent Test" }),
    });
    const created = await createRes.json();
    const projId = created.data.id;
    const orchestratorId = created.data.agents[0].id;

    // Try firing orchestrator -> should fail
    const fireOrchRes = await app.request(`/api/projects/${projId}/agents/${orchestratorId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(fireOrchRes.status).toBe(400);

    // Add normal agent
    const addRes = await app.request(`/api/projects/${projId}/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "TemporaryAgent", role: "Tester" }),
    });
    const addJson = await addRes.json();
    const tempAgentId = addJson.data.id;

    // Fire normal agent
    const fireRes = await app.request(`/api/projects/${projId}/agents/${tempAgentId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(fireRes.status).toBe(200);

    const checkRes = await app.request(`/api/projects/${projId}`, {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    const checkJson = await checkRes.json();
    expect(checkJson.data.agents).toHaveLength(1);
  });

  it("POST /api/projects/:id/memory creates and updates memory files", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Memory Test Project" }),
    });
    const created = await createRes.json();
    const projId = created.data.id;

    const memRes = await app.request(`/api/projects/${projId}/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({
        filename: "tech_stack.md",
        title: "Technical Stack",
        content: "# Stack\n- React\n- Hono\n- Vitest\n",
        always_shown: true,
      }),
    });

    expect(memRes.status).toBe(200);
    const memJson = await memRes.json();
    expect(memJson.data.filename).toBe("tech_stack.md");
    expect(memJson.data.always_shown).toBe(true);

    const fetchRes = await app.request(`/api/projects/${projId}`, {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    const fetchJson = await fetchRes.json();
    expect(fetchJson.data.memoryFiles).toHaveLength(2);
    expect(fetchJson.data.memoryFiles.find((m: any) => m.filename === "tech_stack.md")?.always_shown).toBe(true);
  });

  it("POST /api/projects/:id/tasks and PATCH /api/projects/:id/tasks/:taskId handles task lifecycle", async () => {
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ name: "Task Test Project" }),
    });
    const created = await createRes.json();
    const projId = created.data.id;

    // Create task
    const taskRes = await app.request(`/api/projects/${projId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({
        title: "Implement Model Selection",
        priority: "high",
      }),
    });

    expect(taskRes.status).toBe(201);
    const taskJson = await taskRes.json();
    const taskId = taskJson.data.id;
    expect(taskJson.data.status).toBe("todo");

    // Update task
    const updateRes = await app.request(`/api/projects/${projId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
      },
      body: JSON.stringify({ status: "done" }),
    });

    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.data.status).toBe("done");
  });
});
