import { isDeepStrictEqual } from "node:util";
import type {
  ProjectRecord,
  ProjectAction,
  ProjectRequest,
  ProjectHistoryEntry,
  ProjectOrigin,
} from "../../shared/projects.ts";

export class ProjectActionError extends Error {
  constructor(
    public code: string,
    public status: 400 | 404 | 409 = 409,
  ) {
    super(code);
  }
}
export function normalizeProject(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    revision: project.revision ?? 0,
    requests: project.requests ?? [],
    history: (project.history ?? []).slice(-1000),
  };
}
const fail = (code = "undoConflict"): never => {
  throw new ProjectActionError(code);
};
function append(project: ProjectRecord, entry: ProjectHistoryEntry) {
  // Snapshots must never share mutable objects with the live project.
  project.history = [...project.history, structuredClone(entry)].slice(-1000);
}
function apply(
  project: ProjectRecord,
  request: ProjectRequest,
): ProjectHistoryEntry {
  const { action } = request;
  const entry: ProjectHistoryEntry = {
    ...request,
    status: "applied",
    resolvedAt: new Date().toISOString(),
  };
  if (action.type === "hire_agent") {
    if (project.agents.some((a) => a.id === action.agent.id))
      fail("actionConflict");
    project.agents.push(action.agent);
    entry.after = action.agent;
  } else if (action.type === "fire_agent") {
    const target = project.agents.find((a) => a.id === action.agent.id);
    if (!target || !isDeepStrictEqual(target, action.agent))
      fail("actionConflict");
    if (target.isOrchestrator)
      throw new ProjectActionError("orchestratorProtected", 400);
    entry.before = target;
    entry.assignments = project.tasks
      .filter((t) => t.assignedAgentId === target.id)
      .map((t) => ({ taskId: t.id, agentId: target.id }));
    project.agents = project.agents.filter((a) => a.id !== target.id);
    project.tasks = project.tasks.map((t) =>
      t.assignedAgentId === target.id
        ? { ...t, assignedAgentId: undefined }
        : t,
    );
  } else {
    const index = project.memoryFiles.findIndex((f) => f.id === action.file.id);
    const target = project.memoryFiles[index];
    if (action.type === "create_memory" ? !!target : !target)
      fail("actionConflict");
    if (
      action.type !== "delete_memory" &&
      project.memoryFiles.some(
        (f) =>
          f.id !== action.file.id &&
          f.filename.toLowerCase() === action.file.filename.toLowerCase(),
      )
    )
      fail("actionConflict");
    entry.before = target;
    if (action.type === "delete_memory") project.memoryFiles.splice(index, 1);
    else {
      entry.after = action.file;
      if (index < 0) project.memoryFiles.push(action.file);
      else project.memoryFiles[index] = action.file;
    }
  }
  return entry;
}

export function submitAction(
  input: ProjectRecord,
  action: ProjectAction,
  origin: ProjectOrigin,
  pending = false,
): ProjectRecord {
  const project = structuredClone(normalizeProject(input));
  const request: ProjectRequest = {
    id: crypto.randomUUID(),
    action,
    origin,
    createdAt: new Date().toISOString(),
  };
  if (pending) {
    if (action.type !== "hire_agent" && action.type !== "fire_agent")
      throw new ProjectActionError("invalidAction", 400);
    if (action.type === "fire_agent" && action.agent.isOrchestrator)
      throw new ProjectActionError("orchestratorProtected", 400);
    // Repeated tool output must not fill the queue with the same proposal.
    const duplicate = project.requests.some(
      (r) =>
        r.action.type === action.type &&
        (action.type === "fire_agent" && r.action.type === "fire_agent"
          ? r.action.agent.id === action.agent.id
          : action.type === "hire_agent" &&
            r.action.type === "hire_agent" &&
            r.action.agent.name === action.agent.name &&
            r.action.agent.role === action.agent.role &&
            r.action.agent.systemPrompt === action.agent.systemPrompt),
    );
    if (!duplicate) project.requests.push(request);
  } else append(project, apply(project, request));
  return project;
}

export function decideRequest(
  input: ProjectRecord,
  id: string,
  decision: "accept" | "deny",
) {
  const project = structuredClone(normalizeProject(input));
  const request = project.requests.find((r) => r.id === id);
  if (!request) fail("requestResolved");
  const entry: ProjectHistoryEntry =
    decision === "accept"
      ? apply(project, request)
      : { ...request, status: "denied", resolvedAt: new Date().toISOString() };
  project.requests = project.requests.filter((r) => r.id !== id);
  append(project, entry);
  return project;
}

export function undoAction(input: ProjectRecord, id: string) {
  const project = structuredClone(normalizeProject(input));
  const entry = project.history.find((e) => e.id === id);
  if (!entry || entry.status === "undone") fail("alreadyUndone");
  if (entry.status === "denied") {
    project.requests.push({
      id: crypto.randomUUID(),
      action: entry.action,
      origin: entry.origin,
      createdAt: new Date().toISOString(),
    });
  } else {
    const agentAction =
      entry.action.type === "hire_agent" || entry.action.type === "fire_agent";
    const collection = agentAction ? project.agents : project.memoryFiles;
    const targetId = (entry.after ?? entry.before).id;
    const current = collection.find((item) => item.id === targetId);
    // Compare snapshots, including metadata. Restoring exact snapshots allows chained undo.
    if (!isDeepStrictEqual(current, entry.after)) fail();
    if (
      agentAction &&
      entry.action.type === "hire_agent" &&
      project.tasks.some((t) => t.assignedAgentId === targetId)
    )
      fail();
    if (
      entry.assignments?.some(
        (a) =>
          !project.tasks.some((t) => t.id === a.taskId && !t.assignedAgentId),
      )
    )
      fail();
    if (
      !agentAction &&
      entry.before &&
      project.memoryFiles.some(
        (f) =>
          f.id !== targetId &&
          f.filename.toLowerCase() ===
            (entry.before as { filename: string }).filename.toLowerCase(),
      )
    )
      fail();
    const index = collection.findIndex((item) => item.id === targetId);
    if (index >= 0) collection.splice(index, 1);
    if (entry.before)
      (collection as Array<typeof entry.before>).push(structuredClone(entry.before));
    if (entry.assignments)
      project.tasks = project.tasks.map((t) => {
        const assignment = entry.assignments.find((a) => a.taskId === t.id);
        return assignment ? { ...t, assignedAgentId: assignment.agentId } : t;
      });
  }
  entry.status = "undone";
  entry.undoneAt = new Date().toISOString();
  return project;
}
