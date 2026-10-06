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
  always_shown?: boolean;
  updatedAt: string;
}

export interface TaskLogEntry {
  id: string;
  step: string;
  status: "running" | "done" | "info" | "error";
  timestamp: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  assignedAgentId?: string;
  priority?: "low" | "medium" | "high";
  logs?: TaskLogEntry[];
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
    type:
      | "create_agent"
      | "fire_agent"
      | "read_memory"
      | "write_memory"
      | "add_task"
      | "update_task"
      | "web_search";
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
  messages?: ProjectChatMessage[];
  userName?: string;
  isSetupComplete?: boolean;
  setupState?: {
    step: number;
    isComplete: boolean;
  };
  created_at: string;
  updated_at: string;
  revision?: number;
  requests?: ProjectRequest[];
  history?: ProjectHistoryEntry[];
}

export type ProjectAction =
  | { type: "hire_agent"; agent: ProjectAgent }
  | { type: "fire_agent"; agent: ProjectAgent }
  | {
      type: "create_memory" | "modify_memory" | "delete_memory";
      file: ProjectMemoryFile;
    };

export interface ProjectOrigin {
  kind: "user" | "agent";
  agentId?: string;
  agentName?: string;
}

export interface ProjectRequest {
  id: string;
  action: ProjectAction;
  origin: ProjectOrigin;
  createdAt: string;
}

export interface ProjectHistoryEntry extends ProjectRequest {
  status: "applied" | "denied" | "undone";
  resolvedAt: string;
  undoneAt?: string;
  before?: ProjectAgent | ProjectMemoryFile;
  after?: ProjectAgent | ProjectMemoryFile;
  assignments?: Array<{ taskId: string; agentId: string }>;
}
