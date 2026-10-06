import { Hono } from "hono";
import {
  queryTable,
  insertTable,
  updateTable,
  deleteTable,
} from "../lib/dataStore.ts";
import { verifyToken } from "../lib/auth.ts";

export const projectsRouter = new Hono();

import type {
  ProjectAgent,
  ProjectMemoryFile,
  ProjectTask,
  ProjectChatMessage,
  ProjectRecord,
} from "../../shared/projects.ts";
import {
  normalizeProject,
  submitAction,
  decideRequest,
  undoAction,
  ProjectActionError,
} from "../lib/projectActions.ts";
export type {
  ProjectAgent,
  ProjectMemoryFile,
  ProjectTask,
  ProjectChatMessage,
  ProjectRecord,
} from "../../shared/projects.ts";

function resolveUserId(c: any): string {
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer /i, "");
    const payload = verifyToken(token);
    if (payload?.userId) {
      return String(payload.userId);
    }
  }
  return "guest";
}

projectsRouter.onError((err, c) => {
  if (err instanceof SyntaxError)
    return c.json({ data: null, error: "invalidAction" }, 400);
  if (err instanceof ProjectActionError)
    return c.json({ data: null, error: err.code }, err.status);
  console.error("Project operation failed", err);
  return c.json({ data: null, error: "saveFailed" }, 500);
});

function loadProject(c: any): ProjectRecord {
  const userId = resolveUserId(c);
  const project = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: c.req.param("id") },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId,
  }) as ProjectRecord | null;
  if (!project) throw new ProjectActionError("projectNotFound", 404);
  return structuredClone(normalizeProject(project));
}
function saveProject(c: any, project: ProjectRecord) {
  const updated = {
    ...project,
    revision: (project.revision ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  const rows = updateTable(
    "projects",
    [
      { field: "id", operator: "eq", value: project.id },
      { field: "user_id", operator: "eq", value: resolveUserId(c) },
    ],
    updated,
    resolveUserId(c),
  );
  if (!rows?.[0]) throw new Error("Project save failed");
  return normalizeProject(rows[0]);
}
function stringField(value: unknown, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string")
    throw new ProjectActionError("invalidAction", 400);
  return value;
}
function makeAction(project: ProjectRecord, body: any) {
  const now = new Date().toISOString();
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ProjectActionError("invalidAction", 400);
  const payload = body.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ProjectActionError("invalidAction", 400);
  if (body.type === "hire_agent") {
    const name = stringField(payload.name, "Agent").trim();
    const role = stringField(payload.role, "Specialist").trim();
    if (!name || !role) throw new ProjectActionError("invalidAction", 400);
    return {
      type: "hire_agent" as const,
      agent: {
        id: crypto.randomUUID(),
        name,
        role,
        description: stringField(payload.description),
        systemPrompt: stringField(
          payload.systemPrompt,
          `You are ${name}, specialized in ${role}.`,
        ),
        modelProvider: stringField(
          payload.modelProvider,
          project.orchestratorModelProvider,
        ),
        modelId: stringField(payload.modelId, project.orchestratorModelId),
        isOrchestrator: false,
        status: "idle" as const,
        createdAt: now,
      },
    };
  }
  if (body.type === "fire_agent") {
    const agent = project.agents.find((a) => a.id === payload.id);
    if (!agent) throw new ProjectActionError("agentNotFound", 404);
    if (agent.isOrchestrator)
      throw new ProjectActionError("orchestratorProtected", 400);
    return { type: "fire_agent" as const, agent };
  }
  if (body.type === "write_memory") {
    const filename = stringField(payload.filename, "context.md").trim();
    if (!filename) throw new ProjectActionError("invalidAction", 400);
    const existing = payload.id
      ? project.memoryFiles.find((f) => f.id === payload.id)
      : project.memoryFiles.find(
          (f) => f.filename.toLowerCase() === filename.toLowerCase(),
        );
    if (payload.id && !existing)
      throw new ProjectActionError("memoryNotFound", 404);
    if (
      payload.always_shown !== undefined &&
      typeof payload.always_shown !== "boolean"
    )
      throw new ProjectActionError("invalidAction", 400);
    return {
      type: existing ? ("modify_memory" as const) : ("create_memory" as const),
      file: {
        id: existing?.id ?? crypto.randomUUID(),
        filename,
        title: stringField(payload.title, existing?.title ?? filename),
        content: stringField(payload.content, existing?.content ?? ""),
        always_shown: payload.always_shown ?? existing?.always_shown ?? false,
        updatedAt: now,
      },
    };
  }
  if (body.type === "delete_memory") {
    const file = project.memoryFiles.find((f) => f.id === payload.id);
    if (!file) throw new ProjectActionError("memoryNotFound", 404);
    return { type: "delete_memory" as const, file };
  }
  throw new ProjectActionError("invalidAction", 400);
}
function performAction(
  c: any,
  project: ProjectRecord,
  body: any,
  pending = false,
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ProjectActionError("invalidAction", 400);
  if (body.revision !== undefined && body.revision !== project.revision)
    throw new ProjectActionError("staleProject");
  const action = makeAction(project, body);
  const origin =
    body.origin?.kind === "agent"
      ? {
          kind: "agent" as const,
          agentId: stringField(body.origin.agentId),
          agentName:
            project.agents.find((a) => a.id === body.origin.agentId)?.name ??
            stringField(body.origin.agentName),
        }
      : { kind: "user" as const };
  // Agent-origin sensitive actions always go through approval.
  return saveProject(
    c,
    submitAction(
      project,
      action,
      origin,
      pending ||
        (origin.kind === "agent" &&
          (action.type === "hire_agent" || action.type === "fire_agent")),
    ),
  );
}

projectsRouter.post("/:id/actions", async (c) => {
  const body = await c.req.json();
  return c.json({ data: performAction(c, loadProject(c), body), error: null });
});
projectsRouter.post("/:id/requests", async (c) => {
  const body = await c.req.json();
  return c.json(
    { data: performAction(c, loadProject(c), body, true), error: null },
    201,
  );
});
projectsRouter.post("/:id/requests/:requestId/:decision", async (c) => {
  const decision = c.req.param("decision");
  if (decision !== "accept" && decision !== "deny")
    throw new ProjectActionError("invalidAction", 400);
  return c.json({
    data: saveProject(
      c,
      decideRequest(loadProject(c), c.req.param("requestId"), decision),
    ),
    error: null,
  });
});
projectsRouter.post("/:id/history/:entryId/undo", (c) => {
  return c.json({
    data: saveProject(c, undoAction(loadProject(c), c.req.param("entryId"))),
    error: null,
  });
});
projectsRouter.patch("/:id/agents/:agentId", async (c) => {
  const body = await c.req.json();
  const project = loadProject(c);
  const agent = project.agents.find((a) => a.id === c.req.param("agentId"));
  if (!agent) throw new ProjectActionError("agentNotFound", 404);
  for (const key of ["role", "systemPrompt"] as const) {
    if (body[key] !== undefined) agent[key] = stringField(body[key]);
  }
  if (agent.isOrchestrator && body.systemPrompt !== undefined) {
    project.orchestratorPrompt = agent.systemPrompt;
  }
  return c.json({ data: saveProject(c, project), error: null });
});

// GET /api/projects - list projects
projectsRouter.get("/", async (c) => {
  const userId = resolveUserId(c);
  const result = queryTable({
    table: "projects",
    filters: [{ field: "user_id", operator: "eq", value: userId }],
    order: { column: "updated_at", ascending: false },
    userId: userId,
  });

  const projects = (Array.isArray(result) ? result : result?.data || []) as ProjectRecord[];
  return c.json({ data: projects.map(normalizeProject), error: null });
});

// POST /api/projects - create new project
projectsRouter.post("/", async (c) => {
  const userId = resolveUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const orchestratorName = body.orchestratorName || "Orchestrator";
  const orchestratorModelProvider = body.orchestratorModelProvider || "horde";
  const orchestratorModelId = body.orchestratorModelId || "Fast";

  const defaultOrchestratorAgent: ProjectAgent = {
    id: "orchestrator-root",
    name: orchestratorName,
    role: "Lead Workspace Orchestrator",
    description: "Central intelligence coordinating project goals, tasks, memory files, and specialized agents.",
    systemPrompt:
      body.orchestratorPrompt ||
      "You are the Lead Workspace Orchestrator. You direct operations, plan goals, create and coordinate specialized agents, manage memory docs, and execute structured workspace actions.",
    modelProvider: orchestratorModelProvider,
    modelId: orchestratorModelId,
    isOrchestrator: true,
    status: "idle",
    createdAt: now,
  };

  const starterMemory: ProjectMemoryFile[] = [
    {
      id: crypto.randomUUID(),
      filename: "project_goals.md",
      title: "Project Goals & Context",
      content: `# Project: ${body.name || "Untitled Project"}\n\n## Objective\n${body.description || "Initialize project workspace and coordinate autonomous execution."}\n\n## Core Guidelines\n- High code quality & reliable agent execution.\n- Update task progress transparently.\n`,
      updatedAt: now,
    },
  ];

  const starterMessages: ProjectChatMessage[] = [
    {
      id: crypto.randomUUID(),
      sender: "system",
      content: `Project workspace created. ${orchestratorName} initialized and ready to orchestrate tasks.`,
      createdAt: now,
    },
  ];

  const project: ProjectRecord = {
    id,
    user_id: userId,
    name: body.name || "New Project",
    description: body.description || "",
    orchestratorName,
    orchestratorModelProvider,
    orchestratorModelId,
    orchestratorPrompt: body.orchestratorPrompt || defaultOrchestratorAgent.systemPrompt,
    agents: [defaultOrchestratorAgent],
    memoryFiles: starterMemory,
    tasks: [],
    messages: starterMessages,
    userName: body.userName ?? "",
    revision: 0,
    requests: [],
    history: [],
    created_at: now,
    updated_at: now,
  };

  const inserted = insertTable("projects", project, userId);

  return c.json({ data: inserted || project, error: null }, 201);
});

// GET /api/projects/:id - get single project
projectsRouter.get("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");

  const project = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!project) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  return c.json({ data: normalizeProject(project), error: null });
});

// PATCH /api/projects/:id - update project details
projectsRouter.patch("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const existing = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!existing) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  if (
    ["agents", "memoryFiles", "requests", "history"].some((key) => key in body)
  ) {
    throw new ProjectActionError("protectedFields", 400);
  }
  if (body.revision !== (existing.revision ?? 0))
    throw new ProjectActionError("staleProject");

  const updated: Partial<ProjectRecord> = {
    ...existing,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    orchestratorName: body.orchestratorName ?? existing.orchestratorName,
    orchestratorModelProvider: body.orchestratorModelProvider ?? existing.orchestratorModelProvider,
    orchestratorModelId: body.orchestratorModelId ?? existing.orchestratorModelId,
    orchestratorPrompt: body.orchestratorPrompt ?? existing.orchestratorPrompt,
    agents: existing.agents,
    memoryFiles: existing.memoryFiles,
    tasks: body.tasks ?? existing.tasks,
    messages: body.messages ?? existing.messages,
    userName: body.userName ?? existing.userName,
    updated_at: now,
  };

  // Sync orchestrator agent in agents array if orchestratorName or model changed
  if (updated.agents) {
    updated.agents = updated.agents.map((ag) => {
      if (ag.isOrchestrator) {
        return {
          ...ag,
          name: updated.orchestratorName || ag.name,
          modelProvider: updated.orchestratorModelProvider || ag.modelProvider,
          modelId: updated.orchestratorModelId || ag.modelId,
          systemPrompt: updated.orchestratorPrompt || ag.systemPrompt,
        };
      }
      return ag;
    });
  }

  return c.json({
    data: saveProject(c, updated as ProjectRecord),
    error: null,
  });
});

// DELETE /api/projects/:id - delete project
projectsRouter.delete("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");

  deleteTable(
    "projects",
    [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    userId,
  );

  return c.json({ data: { success: true, id }, error: null });
});

// Legacy direct operations retain their response shape and also return the saved project.
projectsRouter.post("/:id/agents", async (c) => {
  const body = await c.req.json();
  const project = performAction(c, loadProject(c), {
    type: "hire_agent",
    payload: body,
    origin: body.origin,
  });
  return c.json(
    {
      data: project.history[project.history.length - 1]?.after,
      project,
      error: null,
    },
    201,
  );
});
projectsRouter.delete("/:id/agents/:agentId", (c) => {
  const project = performAction(c, loadProject(c), {
    type: "fire_agent",
    payload: { id: c.req.param("agentId") },
  });
  return c.json({
    data: { success: true, firedAgentId: c.req.param("agentId") },
    project,
    error: null,
  });
});
projectsRouter.post("/:id/memory", async (c) => {
  const body = await c.req.json();
  const project = performAction(c, loadProject(c), {
    type: "write_memory",
    payload: body,
    origin: body.origin,
  });
  return c.json({
    data: project.history[project.history.length - 1]?.after,
    project,
    error: null,
  });
});
projectsRouter.delete("/:id/memory/:fileId", (c) => {
  const project = performAction(c, loadProject(c), {
    type: "delete_memory",
    payload: { id: c.req.param("fileId") },
  });
  return c.json({
    data: { success: true, deletedFileId: c.req.param("fileId") },
    project,
    error: null,
  });
});

// POST /api/projects/:id/tasks - add task
projectsRouter.post("/:id/tasks", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existing = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!existing) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const now = new Date().toISOString();

  const newTask: ProjectTask = {
    id: crypto.randomUUID(),
    title: body.title || "Untitled Task",
    description: body.description || "",
    status: body.status || "todo",
    assignedAgentId: body.assignedAgentId,
    priority: body.priority || "medium",
    createdAt: now,
    updatedAt: now,
  };

  const updatedTasks = [...existing.tasks, newTask];

  updateTable(
    "projects",
    [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    {
      tasks: updatedTasks,
      updated_at: now,
      revision: (existing.revision ?? 0) + 1,
    },
    userId,
  );

  return c.json({ data: newTask, error: null }, 201);
});

// PATCH /api/projects/:id/tasks/:taskId - update task
projectsRouter.patch("/:id/tasks/:taskId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const body = await c.req.json().catch(() => ({}));

  const existing = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!existing) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const now = new Date().toISOString();

  const updatedTasks = existing.tasks.map((t) => {
    if (t.id === taskId) {
      return {
        ...t,
        title: body.title ?? t.title,
        description: body.description ?? t.description,
        status: body.status ?? t.status,
        assignedAgentId: body.assignedAgentId ?? t.assignedAgentId,
        priority: body.priority ?? t.priority,
        updatedAt: now,
      };
    }
    return t;
  });

  updateTable(
    "projects",
    [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    {
      tasks: updatedTasks,
      updated_at: now,
      revision: (existing.revision ?? 0) + 1,
    },
    userId,
  );

  const updatedTask = updatedTasks.find((t) => t.id === taskId);
  return c.json({ data: updatedTask, error: null });
});

// DELETE /api/projects/:id/tasks/:taskId - delete task
projectsRouter.delete("/:id/tasks/:taskId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const taskId = c.req.param("taskId");

  const existing = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!existing) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const updatedTasks = existing.tasks.filter((t) => t.id !== taskId);
  const now = new Date().toISOString();

  updateTable(
    "projects",
    [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    {
      tasks: updatedTasks,
      updated_at: now,
      revision: (existing.revision ?? 0) + 1,
    },
    userId,
  );

  return c.json({ data: { success: true, deletedTaskId: taskId }, error: null });
});

// POST /api/projects/:id/messages - append message
projectsRouter.post("/:id/messages", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existing = queryTable({
    table: "projects",
    filters: [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId,
  }) as ProjectRecord | null;

  if (!existing) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const now = new Date().toISOString();

  const newMsg: ProjectChatMessage = {
    id: body.id || crypto.randomUUID(),
    sender: body.sender || "user",
    agentName: body.agentName,
    agentId: body.agentId,
    content: body.content || "",
    actions: body.actions || [],
    model: body.model,
    createdAt: now,
  };

  const updatedMessages = [...existing.messages, newMsg];

  updateTable(
    "projects",
    [
      { field: "id", operator: "eq", value: id },
      { field: "user_id", operator: "eq", value: userId },
    ],
    {
      messages: updatedMessages,
      updated_at: now,
      revision: (existing.revision ?? 0) + 1,
    },
    userId,
  );

  return c.json({ data: newMsg, error: null }, 201);
});
