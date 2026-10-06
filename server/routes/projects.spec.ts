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
  verifyToken: vi.fn((token: string) => {
    if (token === "valid-user-token") {
      return {
        userId: "user-abc",
        username: "testuser",
        email: "test@example.com",
        role: "user",
        exp: Date.now() + 3600000,
      };
    }
    return null;
  }),
}));

describe("Projects API Routes (/api/projects)", () => {
  beforeEach(() => {
    mockProjectsDb = [];
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

describe("Project requests and undo history", () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer valid-user-token",
  };
  const call = (path: string, body?: any, method = "POST") =>
    app.request(`/api/projects${path === "/" ? "" : path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  let id: string;
  beforeEach(async () => {
    mockProjectsDb = [];
    id = (await (await call("/", { name: "Requests" })).json()).data.id;
  });
  const action = async (
    id: string,
    type: string,
    payload: any,
    pending = false,
  ) => {
    const res = await call(`/${id}/${pending ? "requests" : "actions"}`, {
      type,
      payload,
      origin: pending
        ? { kind: "agent", agentId: "orchestrator-root" }
        : { kind: "user" },
    });
    expect(res.ok).toBe(true);
    return (await res.json()).data;
  };
  it("queues, deduplicates, accepts once, and undoes a hire", async () => {
    let project = await action(
      id,
      "hire_agent",
      { name: "Ada", role: "Engineer" },
      true,
    );
    expect(project.agents).toHaveLength(1);
    expect(project.requests).toHaveLength(1);
    const requestId = project.requests[0].id;
    project = await action(
      id,
      "hire_agent",
      { name: "Ada", role: "Engineer" },
      true,
    );
    expect(project.requests).toHaveLength(1);
    project = (await (await call(`/${id}/requests/${requestId}/accept`)).json())
      .data;
    expect(project.agents).toHaveLength(2);
    expect(project.requests).toHaveLength(0);
    expect((await call(`/${id}/requests/${requestId}/accept`)).status).toBe(
      409,
    );
    const historyId = project.history[0].id;
    project = (await (await call(`/${id}/history/${historyId}/undo`)).json())
      .data;
    expect(project.agents).toHaveLength(1);
    expect(project.history[0].status).toBe("undone");
    expect((await call(`/${id}/history/${historyId}/undo`)).status).toBe(409);
  });
  it("denies without mutation and reopens on undo", async () => {
    let project = await action(id, "hire_agent", { name: "Ada" }, true);
    project = (
      await (
        await call(`/${id}/requests/${project.requests[0].id}/deny`)
      ).json()
    ).data;
    expect(project.agents).toHaveLength(1);
    expect(project.history[0].status).toBe("denied");
    project = (
      await (await call(`/${id}/history/${project.history[0].id}/undo`)).json()
    ).data;
    expect(project.requests).toHaveLength(1);
    expect(project.agents).toHaveLength(1);
    expect(
      (await call(`/${id}/requests/${project.requests[0].id}/accept`)).ok,
    ).toBe(true);
  });
  it("logs direct operations and supports chained memory undo with stable IDs and full metadata", async () => {
    let project = await action(id, "write_memory", {
      filename: "notes.md",
      title: "Notes",
      content: "first",
      always_shown: true,
    });
    const original = project.memoryFiles.find(
      (f: any) => f.filename === "notes.md",
    );
    const createId = project.history[0].id;
    project = await action(id, "write_memory", {
      filename: "notes.md",
      content: "second",
    });
    expect(
      project.memoryFiles.find((f: any) => f.filename === "notes.md").id,
    ).toBe(original.id);
    expect((await call(`/${id}/history/${createId}/undo`)).status).toBe(409);
    const modifyId = project.history[1].id;
    project = await action(id, "delete_memory", { id: original.id });
    const deleteId = project.history[2].id;
    expect((await call(`/${id}/history/${modifyId}/undo`)).status).toBe(409);
    project = (await (await call(`/${id}/history/${deleteId}/undo`)).json())
      .data;
    expect(
      project.memoryFiles.find((f: any) => f.id === original.id).content,
    ).toBe("second");
    project = (await (await call(`/${id}/history/${modifyId}/undo`)).json())
      .data;
    expect(project.memoryFiles.find((f: any) => f.id === original.id)).toEqual(
      original,
    );
    project = (await (await call(`/${id}/history/${createId}/undo`)).json())
      .data;
    expect(project.memoryFiles.some((f: any) => f.id === original.id)).toBe(
      false,
    );
  });
  it("restores fired agents and assignments but protects subsequent assignments and edits", async () => {
    let project = await action(id, "hire_agent", { name: "Ada" });
    const agent = project.agents[1];
    const task = (
      await (
        await call(`/${id}/tasks`, { title: "Work", assignedAgentId: agent.id })
      ).json()
    ).data;
    project = await action(id, "fire_agent", { id: agent.id });
    const entry = project.history[1];
    expect(project.tasks[0].assignedAgentId).toBeUndefined();
    await call(
      `/${id}/tasks/${task.id}`,
      { assignedAgentId: "orchestrator-root" },
      "PATCH",
    );
    expect((await call(`/${id}/history/${entry.id}/undo`)).status).toBe(409);
    mockProjectsDb[0].tasks[0].assignedAgentId = undefined;
    project = (await (await call(`/${id}/history/${entry.id}/undo`)).json())
      .data;
    expect(project.agents.find((a: any) => a.id === agent.id)).toEqual(agent);
    expect(project.tasks[0].assignedAgentId).toBe(agent.id);
    // A hire cannot be undone while its agent owns tasks.
    expect(
      (await call(`/${id}/history/${project.history[0].id}/undo`)).status,
    ).toBe(409);
  });
  it("enforces ownership, protected fields, stale saves, and orchestrator protection", async () => {
    const outsider = await app.request(`/api/projects/${id}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hire_agent",
        payload: { name: "Intruder" },
      }),
    });
    expect(outsider.status).toBe(404);
    for (const field of ["agents", "memoryFiles", "requests", "history"]) {
      expect(
        (await call(`/${id}`, { [field]: [], revision: 0 }, "PATCH")).status,
      ).toBe(400);
    }
    expect(
      (
        await call(`/${id}/actions`, {
          type: "fire_agent",
          payload: { id: "orchestrator-root" },
        })
      ).status,
    ).toBe(400);
    await action(id, "write_memory", { filename: "test.md" });
    expect(
      (await call(`/${id}`, { tasks: [], revision: 0 }, "PATCH")).status,
    ).toBe(409);
    expect(
      (
        await call(`/${id}/actions`, {
          type: "write_memory",
          payload: { filename: "test.md" },
          revision: 0,
        })
      ).status,
    ).toBe(409);
  });
  it("retains agent configuration edits and protects undo from later configuration changes", async () => {
    let project = await action(id, "hire_agent", { name: "Ada" });
    const entryId = project.history[0].id;
    const agentId = project.agents[1].id;
    await call(`/${id}/agents/${agentId}`, { role: "Reviewer" }, "PATCH");
    expect((await call(`/${id}/history/${entryId}/undo`)).status).toBe(409);
    project = (await (await call(`/${id}/agents/orchestrator-root`, { systemPrompt: "Updated lead instructions" }, "PATCH")).json()).data;
    expect(project.orchestratorPrompt).toBe("Updated lead instructions");
    project = (await (await call(`/${id}`, { revision: project.revision, name: "Renamed" }, "PATCH")).json()).data;
    expect(project.agents[0].systemPrompt).toBe("Updated lead instructions");
    expect(project.agents[1].role).toBe("Reviewer");
  });
  it("cannot execute agent-origin sensitive actions via the direct endpoint", async () => {
    const project = (
      await (
        await call(`/${id}/actions`, {
          type: "hire_agent",
          payload: { name: "Ada" },
          origin: { kind: "agent", agentId: "orchestrator-root" },
        })
      ).json()
    ).data;
    expect(project.agents).toHaveLength(1);
    expect(project.requests).toHaveLength(1);
  });
  it("keeps 1000 history entries without losing pending requests and defaults legacy projects", async () => {
    delete mockProjectsDb[0].history;
    delete mockProjectsDb[0].requests;
    let project = (await (await call(`/${id}`, undefined, "GET")).json()).data;
    expect(project.history).toEqual([]);
    expect(project.requests).toEqual([]);
    project = await action(id, "hire_agent", { name: "Pending" }, true);
    project = await action(id, "write_memory", { filename: "entry.md" });
    mockProjectsDb[0].history = Array.from({ length: 1000 }, (_, n) => ({
      ...project.history[0],
      id: `history-${n}`,
    }));
    project = await action(id, "write_memory", { filename: "last.md" });
    expect(project.history).toHaveLength(1000);
    expect(project.history[0].id).toBe("history-1");
    expect(project.requests).toHaveLength(1);
  });
});
