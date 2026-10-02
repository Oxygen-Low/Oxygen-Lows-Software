import { Hono } from "hono";
import {
  queryTable,
  insertTable,
  updateTable,
  deleteTable,
} from "../lib/dataStore.ts";
import { verifyToken } from "../lib/auth.ts";

export const projectsRouter = new Hono();

export interface ProjectAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  modelProvider?: string;
  modelId?: string;
  isOrchestrator?: boolean;
  status?: "idle" | "thinking" | "executing";
  createdAt: string;
}

export interface ProjectMemoryFile {
  id: string;
  filename: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  assignedAgentId?: string;
  priority?: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChatMessage {
  id: string;
  sender: "user" | "orchestrator" | "agent" | "system";
  agentName?: string;
  agentId?: string;
  content: string;
  actions?: Array<{
    type: "create_agent" | "fire_agent" | "read_memory" | "write_memory" | "add_task" | "update_task";
    status: "pending" | "running" | "completed" | "failed";
    details?: string;
  }>;
  model?: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  orchestratorName: string;
  orchestratorModelProvider: string;
  orchestratorModelId: string;
  orchestratorPrompt?: string;
  agents: ProjectAgent[];
  memoryFiles: ProjectMemoryFile[];
  tasks: ProjectTask[];
  messages: ProjectChatMessage[];
  created_at: string;
  updated_at: string;
}

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

// GET /api/projects - list projects
projectsRouter.get("/", async (c) => {
  const userId = resolveUserId(c);
  const result = queryTable({
    table: "projects",
    filters: [{ column: "user_id", operator: "eq", value: userId }],
    order: { column: "updated_at", ascending: false },
    userId: userId !== "guest" ? userId : undefined,
  });

  const projects = (result.data || []) as ProjectRecord[];
  return c.json({ data: projects, error: null });
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
    systemPrompt: body.orchestratorPrompt || "You are the Lead Workspace Orchestrator. You direct operations, plan goals, create and coordinate specialized agents, manage memory docs, and execute structured workspace actions.",
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
    created_at: now,
    updated_at: now,
  };

  const insertRes = insertTable({
    table: "projects",
    record: project,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (insertRes.error) {
    return c.json({ data: null, error: insertRes.error }, 500);
  }

  return c.json({ data: insertRes.data, error: null }, 201);
});

// GET /api/projects/:id - get single project
projectsRouter.get("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");

  const result = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!result.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  return c.json({ data: result.data, error: null });
});

// PATCH /api/projects/:id - update project details
projectsRouter.patch("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;

  const updated: Partial<ProjectRecord> = {
    ...existing,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    orchestratorName: body.orchestratorName ?? existing.orchestratorName,
    orchestratorModelProvider: body.orchestratorModelProvider ?? existing.orchestratorModelProvider,
    orchestratorModelId: body.orchestratorModelId ?? existing.orchestratorModelId,
    orchestratorPrompt: body.orchestratorPrompt ?? existing.orchestratorPrompt,
    agents: body.agents ?? existing.agents,
    memoryFiles: body.memoryFiles ?? existing.memoryFiles,
    tasks: body.tasks ?? existing.tasks,
    messages: body.messages ?? existing.messages,
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

  const updateRes = updateTable({
    table: "projects",
    id,
    updates: updated,
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: updateRes.data, error: updateRes.error });
});

// DELETE /api/projects/:id - delete project
projectsRouter.delete("/:id", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");

  const deleteRes = deleteTable({
    table: "projects",
    id,
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: { success: !deleteRes.error, id }, error: deleteRes.error });
});

// POST /api/projects/:id/agents - add agent
projectsRouter.post("/:id/agents", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
  const now = new Date().toISOString();

  const newAgent: ProjectAgent = {
    id: crypto.randomUUID(),
    name: body.name || "Agent",
    role: body.role || "Specialist",
    description: body.description || "",
    systemPrompt: body.systemPrompt || `You are ${body.name}, specialized in ${body.role}.`,
    modelProvider: body.modelProvider || existing.orchestratorModelProvider,
    modelId: body.modelId || existing.orchestratorModelId,
    isOrchestrator: false,
    status: "idle",
    createdAt: now,
  };

  const updatedAgents = [...existing.agents, newAgent];
  updateTable({
    table: "projects",
    id,
    updates: { agents: updatedAgents, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: newAgent, error: null }, 201);
});

// DELETE /api/projects/:id/agents/:agentId - fire agent
projectsRouter.delete("/:id/agents/:agentId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const agentId = c.req.param("agentId");

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
  const target = existing.agents.find((a) => a.id === agentId);
  if (target?.isOrchestrator) {
    return c.json({ data: null, error: "Cannot fire the Lead Orchestrator" }, 400);
  }

  const updatedAgents = existing.agents.filter((a) => a.id !== agentId);
  const now = new Date().toISOString();

  updateTable({
    table: "projects",
    id,
    updates: { agents: updatedAgents, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: { success: true, firedAgentId: agentId }, error: null });
});

// POST /api/projects/:id/memory - create/update memory file
projectsRouter.post("/:id/memory", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
  const now = new Date().toISOString();
  const fileId = body.id || crypto.randomUUID();

  const fileRecord: ProjectMemoryFile = {
    id: fileId,
    filename: body.filename || "context.md",
    title: body.title || body.filename || "Context Document",
    content: body.content ?? "",
    updatedAt: now,
  };

  const existingIdx = existing.memoryFiles.findIndex((m) => m.id === fileId || m.filename === fileRecord.filename);
  let updatedMemory: ProjectMemoryFile[];
  if (existingIdx >= 0) {
    updatedMemory = [...existing.memoryFiles];
    updatedMemory[existingIdx] = fileRecord;
  } else {
    updatedMemory = [...existing.memoryFiles, fileRecord];
  }

  updateTable({
    table: "projects",
    id,
    updates: { memoryFiles: updatedMemory, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: fileRecord, error: null });
});

// DELETE /api/projects/:id/memory/:fileId - delete memory file
projectsRouter.delete("/:id/memory/:fileId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const fileId = c.req.param("fileId");

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
  const updatedMemory = existing.memoryFiles.filter((m) => m.id !== fileId);
  const now = new Date().toISOString();

  updateTable({
    table: "projects",
    id,
    updates: { memoryFiles: updatedMemory, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: { success: true, deletedFileId: fileId }, error: null });
});

// POST /api/projects/:id/tasks - add task
projectsRouter.post("/:id/tasks", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
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

  updateTable({
    table: "projects",
    id,
    updates: { tasks: updatedTasks, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: newTask, error: null }, 201);
});

// PATCH /api/projects/:id/tasks/:taskId - update task
projectsRouter.patch("/:id/tasks/:taskId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const taskId = c.req.param("taskId");
  const body = await c.req.json().catch(() => ({}));

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
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

  updateTable({
    table: "projects",
    id,
    updates: { tasks: updatedTasks, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  const updatedTask = updatedTasks.find((t) => t.id === taskId);
  return c.json({ data: updatedTask, error: null });
});

// DELETE /api/projects/:id/tasks/:taskId - delete task
projectsRouter.delete("/:id/tasks/:taskId", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const taskId = c.req.param("taskId");

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
  const updatedTasks = existing.tasks.filter((t) => t.id !== taskId);
  const now = new Date().toISOString();

  updateTable({
    table: "projects",
    id,
    updates: { tasks: updatedTasks, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: { success: true, deletedTaskId: taskId }, error: null });
});

// POST /api/projects/:id/messages - append message
projectsRouter.post("/:id/messages", async (c) => {
  const userId = resolveUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const existingRes = queryTable({
    table: "projects",
    filters: [
      { column: "id", operator: "eq", value: id },
      { column: "user_id", operator: "eq", value: userId },
    ],
    single: true,
    userId: userId !== "guest" ? userId : undefined,
  });

  if (!existingRes.data) {
    return c.json({ data: null, error: "Project not found" }, 404);
  }

  const existing = existingRes.data as ProjectRecord;
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

  updateTable({
    table: "projects",
    id,
    updates: { messages: updatedMessages, updated_at: now },
    userId: userId !== "guest" ? userId : undefined,
  });

  return c.json({ data: newMsg, error: null }, 201);
});
