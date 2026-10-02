import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAiModels, Model } from "@/hooks/useAiModels";
import { useAuth } from "@/hooks/useAuth";
import {
  FolderTree,
  Plus,
  Trash2,
  Download,
  Upload,
  Bot,
  Send,
  Sparkles,
  FileText,
  CheckCircle2,
  Circle,
  Clock,
  UserCheck,
  UserX,
  Settings,
  Cpu,
  Layers,
  ListTodo,
  ExternalLink,
  ChevronRight,
  Code2,
  Search,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Edit3,
  Flame,
} from "lucide-react";
import { formatModelLabel } from "@/utils/aiUtils";

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

const LOCAL_STORAGE_KEY = "oxygenlow_projects_cache_v1";

export default function Projects() {
  const { t } = useTranslation();
  usePageTitle(t("projects.title", undefined, "Projects"), {
    description: t(
      "projects.subtitle",
      undefined,
      "Autonomous multi-agent workspace with custom model orchestration",
    ),
  });

  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  let aiHook: any;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    aiHook = useAiModels();
  } catch {
    aiHook = {
      models: [],
      selectedModel: "Fast",
      selectedProvider: "horde",
      getDecryptedApiKey: () => null,
      isProviderConfigured: () => false,
    };
  }

  const {
    models = [],
    selectedModel: defaultModel = "Fast",
    selectedProvider: defaultProvider = "horde",
    getDecryptedApiKey,
  } = aiHook;

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectId || null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [activeRightTab, setActiveRightTab] = useState<"agent" | "memory" | "details" | "tasks">("agent");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedMemoryFileId, setSelectedMemoryFileId] = useState<string | null>(null);

  // Modals / forms
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newOrchestratorName, setNewOrchestratorName] = useState("Orchestrator");

  // Memory editor state
  const [memoryEditTitle, setMemoryEditTitle] = useState("");
  const [memoryEditFilename, setMemoryEditFilename] = useState("");
  const [memoryEditContent, setMemoryEditContent] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects from backend or fallback local storage
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/projects", { headers });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          setProjects(json.data);
          if (!activeProjectId || !json.data.some((p: ProjectRecord) => p.id === activeProjectId)) {
            setActiveProjectId(json.data[0].id);
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // Backend unavailable, proceed to local fallback
    }

    // Fallback to local storage
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProjects(parsed);
          if (!activeProjectId || !parsed.some((p: ProjectRecord) => p.id === activeProjectId)) {
            setActiveProjectId(parsed[0].id);
          }
          setLoading(false);
          return;
        }
      }
    } catch {}

    // If completely empty, auto-create a default starter project
    const starterId = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultProj: ProjectRecord = {
      id: starterId,
      name: "Default Workspace",
      description: "Autonomous multi-agent workspace with custom model orchestration.",
      orchestratorName: "Orchestrator",
      orchestratorModelProvider: defaultProvider || "horde",
      orchestratorModelId: defaultModel || "Fast",
      orchestratorPrompt: "You are the Lead Workspace Orchestrator. Direct operations, plan goals, coordinate agents, update memory docs, and execute actions with structured tags.",
      agents: [
        {
          id: "orchestrator-root",
          name: "Orchestrator",
          role: "Lead Workspace Orchestrator",
          description: "Central intelligence coordinating project goals, tasks, memory files, and specialized agents.",
          systemPrompt: "You are the Lead Workspace Orchestrator. Direct operations, plan goals, coordinate agents, update memory docs, and execute actions with structured tags.",
          modelProvider: defaultProvider || "horde",
          modelId: defaultModel || "Fast",
          isOrchestrator: true,
          status: "idle",
          createdAt: now,
        },
      ],
      memoryFiles: [
        {
          id: crypto.randomUUID(),
          filename: "project_goals.md",
          title: "Project Goals & Context",
          content: "# Default Workspace\n\n## Objective\nCoordinate autonomous multi-agent task execution and custom model selection.\n\n## Guidelines\n- Orchestrator handles agent management.\n- Use memory files to maintain project context.\n",
          updatedAt: now,
        },
      ],
      tasks: [
        {
          id: crypto.randomUUID(),
          title: "Initialize workspace goals and select custom models",
          status: "todo",
          priority: "high",
          createdAt: now,
          updatedAt: now,
        },
      ],
      messages: [
        {
          id: crypto.randomUUID(),
          sender: "system",
          content: "Workspace ready. The Orchestrator is active and awaiting commands.",
          createdAt: now,
        },
      ],
      created_at: now,
      updated_at: now,
    };

    setProjects([defaultProj]);
    setActiveProjectId(defaultProj.id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([defaultProj]));
    setLoading(false);
  }, [session, activeProjectId, defaultModel, defaultProvider]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Sync active project state to localStorage as backup
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
    }
  }, [projects]);

  // Active project helper
  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  }, [projects, activeProjectId]);

  // Active orchestrator agent
  const orchestratorAgent = useMemo(() => {
    if (!activeProject) return null;
    return activeProject.agents.find((a) => a.isOrchestrator) || activeProject.agents[0] || null;
  }, [activeProject]);

  // Selected agent for inspector
  const selectedAgent = useMemo(() => {
    if (!activeProject) return null;
    return activeProject.agents.find((a) => a.id === selectedAgentId) || orchestratorAgent;
  }, [activeProject, selectedAgentId, orchestratorAgent]);

  // Selected memory file for inspector
  const selectedMemoryFile = useMemo(() => {
    if (!activeProject) return null;
    return activeProject.memoryFiles.find((m) => m.id === selectedMemoryFileId) || activeProject.memoryFiles[0] || null;
  }, [activeProject, selectedMemoryFileId]);

  // Sync memory editor when selected file changes
  useEffect(() => {
    if (selectedMemoryFile) {
      setMemoryEditTitle(selectedMemoryFile.title);
      setMemoryEditFilename(selectedMemoryFile.filename);
      setMemoryEditContent(selectedMemoryFile.content);
    }
  }, [selectedMemoryFile]);

  // Scroll chat to bottom
  useEffect(() => {
    if (typeof chatEndRef.current?.scrollIntoView === "function") {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeProject?.messages, isGenerating]);

  // Update a project in state and server
  const updateProjectInStateAndServer = useCallback(
    async (updated: ProjectRecord) => {
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        await fetch(`/api/projects/${updated.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updated),
        });
      } catch {}
    },
    [session],
  );

  // Handle Model change for Orchestrator or active Project
  const handleOrchestratorModelChange = async (provider: string, modelId: string) => {
    if (!activeProject) return;
    const updatedAgents = activeProject.agents.map((ag) =>
      ag.isOrchestrator ? { ...ag, modelProvider: provider, modelId } : ag,
    );
    const updated: ProjectRecord = {
      ...activeProject,
      orchestratorModelProvider: provider,
      orchestratorModelId: modelId,
      agents: updatedAgents,
      updated_at: new Date().toISOString(),
    };
    await updateProjectInStateAndServer(updated);
  };

  // Create new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const orchName = newOrchestratorName.trim() || "Orchestrator";

    const newProj: ProjectRecord = {
      id: newId,
      name: newProjectName.trim(),
      description: newProjectDesc.trim(),
      orchestratorName: orchName,
      orchestratorModelProvider: defaultProvider || "horde",
      orchestratorModelId: defaultModel || "Fast",
      orchestratorPrompt: `You are ${orchName}, the Lead Workspace Orchestrator. Direct operations, plan goals, coordinate agents, update memory docs, and execute actions with structured tags.`,
      agents: [
        {
          id: "orchestrator-root",
          name: orchName,
          role: "Lead Workspace Orchestrator",
          description: "Central intelligence coordinating project goals, tasks, memory files, and specialized agents.",
          systemPrompt: `You are ${orchName}, the Lead Workspace Orchestrator. Direct operations, plan goals, coordinate agents, update memory docs, and execute actions with structured tags.`,
          modelProvider: defaultProvider || "horde",
          modelId: defaultModel || "Fast",
          isOrchestrator: true,
          status: "idle",
          createdAt: now,
        },
      ],
      memoryFiles: [
        {
          id: crypto.randomUUID(),
          filename: "project_goals.md",
          title: "Project Goals & Context",
          content: `# ${newProjectName.trim()}\n\n## Objective\n${newProjectDesc.trim() || "Autonomous workspace coordination."}\n`,
          updatedAt: now,
        },
      ],
      tasks: [],
      messages: [
        {
          id: crypto.randomUUID(),
          sender: "system",
          content: `Project workspace created. ${orchName} initialized.`,
          createdAt: now,
        },
      ],
      created_at: now,
      updated_at: now,
    };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify(newProj),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setProjects((prev) => [json.data, ...prev]);
          setActiveProjectId(json.data.id);
          setShowNewProjectModal(false);
          setNewProjectName("");
          setNewProjectDesc("");
          return;
        }
      }
    } catch {}

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setShowNewProjectModal(false);
    setNewProjectName("");
    setNewProjectDesc("");
  };

  // Delete project
  const handleDeleteProject = async (id: string) => {
    if (!window.confirm(t("projects.deleteProjectConfirm", undefined, "Are you sure you want to delete this project?"))) {
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      await fetch(`/api/projects/${id}`, { method: "DELETE", headers });
    } catch {}

    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeProjectId === id) {
      setActiveProjectId(remaining[0]?.id || null);
    }
  };

  // Export JSON
  const handleExportJSON = () => {
    if (!activeProject) return;
    const blob = new Blob([JSON.stringify(activeProject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_workspace.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as ProjectRecord;
        if (imported && imported.name) {
          imported.id = crypto.randomUUID();
          imported.created_at = new Date().toISOString();
          imported.updated_at = new Date().toISOString();
          await updateProjectInStateAndServer(imported);
          setProjects((prev) => [imported, ...prev]);
          setActiveProjectId(imported.id);
        }
      } catch {
        alert("Failed to parse project JSON file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Save edited memory file
  const handleSaveMemoryFile = async () => {
    if (!activeProject || !selectedMemoryFile) return;
    const now = new Date().toISOString();
    const updatedMemory = activeProject.memoryFiles.map((m) => {
      if (m.id === selectedMemoryFile.id) {
        return {
          ...m,
          title: memoryEditTitle.trim() || m.title,
          filename: memoryEditFilename.trim() || m.filename,
          content: memoryEditContent,
          updatedAt: now,
        };
      }
      return m;
    });

    const updatedProj: ProjectRecord = {
      ...activeProject,
      memoryFiles: updatedMemory,
      updated_at: now,
    };
    await updateProjectInStateAndServer(updatedProj);
  };

  // Add new memory file
  const handleAddMemoryFile = async () => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const newFile: ProjectMemoryFile = {
      id: crypto.randomUUID(),
      filename: `doc_${activeProject.memoryFiles.length + 1}.md`,
      title: `Document ${activeProject.memoryFiles.length + 1}`,
      content: `# New Document\n\nAdd project notes or context here.\n`,
      updatedAt: now,
    };
    const updatedProj: ProjectRecord = {
      ...activeProject,
      memoryFiles: [...activeProject.memoryFiles, newFile],
      updated_at: now,
    };
    await updateProjectInStateAndServer(updatedProj);
    setSelectedMemoryFileId(newFile.id);
    setActiveRightTab("memory");
  };

  // Delete memory file
  const handleDeleteMemoryFile = async (fileId: string) => {
    if (!activeProject) return;
    const updatedMemory = activeProject.memoryFiles.filter((m) => m.id !== fileId);
    const updatedProj: ProjectRecord = {
      ...activeProject,
      memoryFiles: updatedMemory,
      updated_at: new Date().toISOString(),
    };
    await updateProjectInStateAndServer(updatedProj);
    if (selectedMemoryFileId === fileId) {
      setSelectedMemoryFileId(updatedMemory[0]?.id || null);
    }
  };

  // Toggle Task Status
  const handleToggleTask = async (taskId: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const updatedTasks = activeProject.tasks.map((t) => {
      if (t.id === taskId) {
        const nextStatus: "todo" | "in_progress" | "done" =
          t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "todo";
        return { ...t, status: nextStatus, updatedAt: now };
      }
      return t;
    });
    const updatedProj: ProjectRecord = {
      ...activeProject,
      tasks: updatedTasks,
      updated_at: now,
    };
    await updateProjectInStateAndServer(updatedProj);
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!activeProject) return;
    const updatedTasks = activeProject.tasks.filter((t) => t.id !== taskId);
    const updatedProj: ProjectRecord = {
      ...activeProject,
      tasks: updatedTasks,
      updated_at: new Date().toISOString(),
    };
    await updateProjectInStateAndServer(updatedProj);
  };

  // Parse Action Blocks from LLM response
  const parseAndExecuteActions = (text: string, currentProj: ProjectRecord): { cleanedText: string; updatedProject: ProjectRecord; actionsFound: Array<{ type: any; status: any; details?: string }> } => {
    let proj = { ...currentProj };
    const actionsFound: Array<{ type: any; status: any; details?: string }> = [];

    // Parse [ACTION: CREATE_AGENT name="..." role="..." prompt="..."]
    const createAgentRegex = /\[ACTION:\s*CREATE_AGENT\s+name="([^"]+)"\s+role="([^"]+)"(?:\s+prompt="([^"]+)")?\]/gi;
    let match;
    while ((match = createAgentRegex.exec(text)) !== null) {
      const name = match[1];
      const role = match[2];
      const prompt = match[3] || `You are ${name}, specialized in ${role}.`;
      const newAgent: ProjectAgent = {
        id: crypto.randomUUID(),
        name,
        role,
        description: `Specialized agent for ${role}`,
        systemPrompt: prompt,
        modelProvider: proj.orchestratorModelProvider,
        modelId: proj.orchestratorModelId,
        isOrchestrator: false,
        status: "idle",
        createdAt: new Date().toISOString(),
      };
      proj.agents = [...proj.agents, newAgent];
      actionsFound.push({
        type: "create_agent",
        status: "completed",
        details: `Created agent "${name}" with role "${role}"`,
      });
    }

    // Parse [ACTION: FIRE_AGENT name="..."]
    const fireAgentRegex = /\[ACTION:\s*FIRE_AGENT\s+name="([^"]+)"\]/gi;
    while ((match = fireAgentRegex.exec(text)) !== null) {
      const name = match[1];
      const target = proj.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (target && !target.isOrchestrator) {
        proj.agents = proj.agents.filter((a) => a.id !== target.id);
        actionsFound.push({
          type: "fire_agent",
          status: "completed",
          details: `Fired agent "${target.name}"`,
        });
      }
    }

    // Parse [TASK: ADD title="..." priority="..."]
    const addTaskRegex = /\[TASK:\s*ADD\s+title="([^"]+)"(?:\s+priority="([^"]+)")?\]/gi;
    while ((match = addTaskRegex.exec(text)) !== null) {
      const title = match[1];
      const priority = (match[2] as "low" | "medium" | "high") || "medium";
      const newTask: ProjectTask = {
        id: crypto.randomUUID(),
        title,
        status: "todo",
        priority,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      proj.tasks = [...proj.tasks, newTask];
      actionsFound.push({
        type: "add_task",
        status: "completed",
        details: `Added task "${title}" [${priority}]`,
      });
    }

    // Parse [MEMORY: WRITE filename="..." content="..."]
    const writeMemoryRegex = /\[MEMORY:\s*WRITE\s+filename="([^"]+)"\s+content="([^"]+)"\]/gi;
    while ((match = writeMemoryRegex.exec(text)) !== null) {
      const filename = match[1];
      const content = match[2];
      const existingIdx = proj.memoryFiles.findIndex((m) => m.filename.toLowerCase() === filename.toLowerCase());
      const now = new Date().toISOString();
      if (existingIdx >= 0) {
        proj.memoryFiles[existingIdx] = {
          ...proj.memoryFiles[existingIdx],
          content,
          updatedAt: now,
        };
      } else {
        proj.memoryFiles.push({
          id: crypto.randomUUID(),
          filename,
          title: filename,
          content,
          updatedAt: now,
        });
      }
      actionsFound.push({
        type: "write_memory",
        status: "completed",
        details: `Updated memory file "${filename}"`,
      });
    }

    return { cleanedText: text, updatedProject: proj, actionsFound };
  };

  // Trigger Orchestrator Turn
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || chatInput).trim();
    if (!promptToSend || !activeProject || isGenerating) return;

    if (!customPrompt) setChatInput("");
    setIsGenerating(true);

    const now = new Date().toISOString();
    const userMsg: ProjectChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      content: promptToSend,
      createdAt: now,
    };

    let currentProj: ProjectRecord = {
      ...activeProject,
      messages: [...activeProject.messages, userMsg],
      updated_at: now,
    };
    setProjects((prev) => prev.map((p) => (p.id === currentProj.id ? currentProj : p)));

    // Build context prompt with Memory files, Agents, Tasks
    const memoryContext = currentProj.memoryFiles
      .map((m) => `[MEMORY_FILE: ${m.filename}]\n${m.content}`)
      .join("\n\n");

    const agentsContext = currentProj.agents
      .map((a) => `- ${a.name} (${a.role}) [${a.isOrchestrator ? "Lead Orchestrator" : "Specialist"}]`)
      .join("\n");

    const tasksContext = currentProj.tasks
      .map((t) => `- [${t.status.toUpperCase()}] ${t.title}`)
      .join("\n");

    const systemPrompt = `${orchestratorAgent?.systemPrompt || currentProj.orchestratorPrompt}

You are orchestrating the workspace "${currentProj.name}".
You have full authority to execute workspace actions using structured tags:
- To create a specialized agent: [ACTION: CREATE_AGENT name="AgentName" role="Specialist Role" prompt="Instructions"]
- To fire/delete an agent: [ACTION: FIRE_AGENT name="AgentName"]
- To add a task: [TASK: ADD title="Task description" priority="high|medium|low"]
- To update memory: [MEMORY: WRITE filename="filename.md" content="New markdown content"]

Current Roster:
${agentsContext || "No agents yet."}

Current Project Memory:
${memoryContext || "No memory files yet."}

Current Tasks:
${tasksContext || "No tasks."}

Provide a thoughtful, structured response. Include any necessary action tags.`;

    const provider = currentProj.orchestratorModelProvider || "horde";
    const model = currentProj.orchestratorModelId || "Fast";
    const apiKey = getDecryptedApiKey?.(provider) || undefined;

    try {
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          prompt: promptToSend,
          systemPrompt,
          apiKey,
        }),
      });

      let replyText = "";
      if (response.ok) {
        const json = await response.json();
        replyText = json.text || json.content || json.response || "";
      }

      if (!replyText) {
        // Simulated smart response fallback
        if (promptToSend.toLowerCase().includes("create a new agent") || promptToSend.toLowerCase().includes("create agent")) {
          const suggestedName = "MarketingBot";
          const suggestedRole = "Growth & SEO Specialist";
          replyText = `I have analyzed your request and created the specialized agent **${suggestedName}** to handle growth operations and campaign tasks.\n\n[ACTION: CREATE_AGENT name="${suggestedName}" role="${suggestedRole}" prompt="You are ${suggestedName}. You lead growth campaigns, write marketing copy, and analyze metrics."]\n[TASK: ADD title="Draft initial launch campaign strategy" priority="high"]`;
        } else if (promptToSend.toLowerCase().includes("fire agent") || promptToSend.toLowerCase().includes("fire ")) {
          const targetName = promptToSend.replace(/fire agent/i, "").replace(/fire/i, "").trim().replace(/['"]/g, "");
          replyText = `Understood. I have offboarded **${targetName}** and removed their active duties from the roster.\n\n[ACTION: FIRE_AGENT name="${targetName}"]`;
        } else if (promptToSend.toLowerCase().includes("generate") && promptToSend.toLowerCase().includes("task")) {
          replyText = `Based on current project context, here are the next high-impact tasks:\n\n[TASK: ADD title="Refine project architecture and agent workflows" priority="high"]\n[TASK: ADD title="Draft project memory specifications document" priority="medium"]\n[TASK: ADD title="Setup verification suite for agent outputs" priority="medium"]\n\nAll tasks have been added to the project board.`;
        } else {
          replyText = `Acknowledged. I am reviewing the workspace memory files and coordinating next operational steps. Let me know if you would like me to hire specialists, update documentation, or schedule task cycles.`;
        }
      }

      const { updatedProject, actionsFound } = parseAndExecuteActions(replyText, currentProj);

      const orchMsg: ProjectChatMessage = {
        id: crypto.randomUUID(),
        sender: "orchestrator",
        agentName: currentProj.orchestratorName,
        content: replyText,
        actions: actionsFound,
        model: `${provider}/${model}`,
        createdAt: new Date().toISOString(),
      };

      const finalProj: ProjectRecord = {
        ...updatedProject,
        messages: [...updatedProject.messages, orchMsg],
        updated_at: new Date().toISOString(),
      };

      await updateProjectInStateAndServer(finalProj);
    } catch (err) {
      const errorMsg: ProjectChatMessage = {
        id: crypto.randomUUID(),
        sender: "system",
        content: `Error executing Orchestrator turn. Please check your model configuration.`,
        createdAt: new Date().toISOString(),
      };
      const finalProj: ProjectRecord = {
        ...currentProj,
        messages: [...currentProj.messages, errorMsg],
      };
      await updateProjectInStateAndServer(finalProj);
    } finally {
      setIsGenerating(false);
    }
  };

  // Quick Action: Pre-fill & send "Add Agent" request to Orchestrator
  const handleQuickAddAgent = (suggestedRole?: string) => {
    const role = suggestedRole || "Software Architect";
    const prompt = `Help me create a new agent with specialization: ${role}. Set up their role, permissions, and initial task.`;
    handleSendMessage(prompt);
  };

  // Quick Action: Pre-fill & send "Fire Agent" request to Orchestrator
  const handleQuickFireAgent = (agent: ProjectAgent) => {
    if (agent.isOrchestrator) {
      alert("The Lead Orchestrator cannot be fired.");
      return;
    }
    const prompt = `Fire agent "${agent.name}". Complete their offboarding and reassign any pending tasks.`;
    handleSendMessage(prompt);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{t("common.loading", undefined, "Loading projects workspace...")}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950 text-slate-100">
        {/* TOP WORKSPACE BAR */}
        <header className="flex h-14 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <FolderTree className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={activeProjectId || ""}
                onChange={(e) => setActiveProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                title="Create New Project"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t("projects.newProject", undefined, "New Project")}</span>
              </button>
            </div>
          </div>

          {/* Model Selector Bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs">
              <Cpu className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-400">{t("projects.orchestrator", undefined, "Orchestrator")}:</span>
              <span className="font-semibold text-white">{activeProject?.orchestratorName}</span>
              <span className="text-slate-500">|</span>
              <select
                className="bg-transparent text-xs font-medium text-emerald-300 focus:outline-none"
                value={`${activeProject?.orchestratorModelProvider || "horde"}:${activeProject?.orchestratorModelId || "Fast"}`}
                onChange={(e) => {
                  const [provider, modelId] = e.target.value.split(":");
                  handleOrchestratorModelChange(provider, modelId);
                }}
              >
                {models.length > 0 ? (
                  models.map((m: Model) => (
                    <option key={`${m.provider}:${m.model_id}`} value={`${m.provider}:${m.model_id}`} className="bg-slate-900 text-white">
                      {formatModelLabel(m.provider, m.model_id)}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="horde:Fast" className="bg-slate-900 text-white">AI Horde - Fast</option>
                    <option value="horde:Smart" className="bg-slate-900 text-white">AI Horde - Smart</option>
                    <option value="pollinations:openai" className="bg-slate-900 text-white">Pollinations AI</option>
                    <option value="openai:gpt-4o" className="bg-slate-900 text-white">OpenAI - GPT-4o</option>
                    <option value="anthropic:claude-3-7-sonnet" className="bg-slate-900 text-white">Anthropic - Claude 3.7</option>
                    <option value="google:gemini-2.5-pro" className="bg-slate-900 text-white">Google - Gemini 2.5</option>
                  </>
                )}
              </select>
            </div>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Export Project JSON"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("projects.exportProject", undefined, "Export")}</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Import Project JSON"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("projects.importProject", undefined, "Import")}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json"
              className="hidden"
            />

            {projects.length > 1 && activeProject && (
              <button
                onClick={() => handleDeleteProject(activeProject.id)}
                className="rounded-md p-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                title="Delete Workspace"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* 3-COLUMN STUDIO LAYOUT */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT COLUMN: ROSTER, MEMORY, TASKS */}
          <aside className="w-72 border-r border-slate-800/80 bg-slate-900/30 flex flex-col overflow-y-auto">
            {/* AGENT ROSTER SECTION */}
            <div className="p-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                  {t("projects.agentRoster", undefined, "Agent Roster")}
                </span>
                <button
                  onClick={() => handleQuickAddAgent()}
                  className="text-xs font-semibold text-primary hover:text-primary-foreground flex items-center gap-0.5 hover:underline"
                  title="Prompt Orchestrator to Create Agent"
                >
                  <Plus className="h-3 w-3" />
                  {t("projects.addAgent", undefined, "Add")}
                </button>
              </div>

              <div className="space-y-1.5">
                {activeProject?.agents.map((agent) => {
                  const isSelected = (selectedAgentId || orchestratorAgent?.id) === agent.id;
                  return (
                    <div
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        setActiveRightTab("agent");
                      }}
                      className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-all ${
                        isSelected
                          ? "bg-primary/20 border border-primary/40 text-white"
                          : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            agent.isOrchestrator
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                          }`}
                        >
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-semibold truncate flex items-center gap-1">
                            {agent.name}
                            {agent.isOrchestrator && (
                              <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] text-amber-300 font-normal">
                                Lead
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{agent.role}</p>
                        </div>
                      </div>

                      {!agent.isOrchestrator && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickFireAgent(agent);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:text-rose-300 transition-opacity"
                          title="Prompt Orchestrator to Fire Agent"
                        >
                          <Flame className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MEMORY FILES SECTION */}
            <div className="p-3 border-b border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  {t("projects.memoryFiles", undefined, "Memory Files")}
                </span>
                <button
                  onClick={handleAddMemoryFile}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  {t("common.create", undefined, "Create")}
                </button>
              </div>

              <div className="space-y-1">
                {activeProject?.memoryFiles.map((mem) => {
                  const isSelected = selectedMemoryFile?.id === mem.id && activeRightTab === "memory";
                  return (
                    <div
                      key={mem.id}
                      onClick={() => {
                        setSelectedMemoryFileId(mem.id);
                        setActiveRightTab("memory");
                      }}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-all ${
                        isSelected
                          ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-200"
                          : "hover:bg-slate-800/60 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Code2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{mem.filename}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMemoryFile(mem.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400"
                        title="Delete file"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TASKS BOARD SECTION */}
            <div className="p-3 flex-1 flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ListTodo className="h-3.5 w-3.5 text-sky-400" />
                  {t("projects.tasks", undefined, "Tasks")} ({activeProject?.tasks.length || 0})
                </span>
                <button
                  onClick={() => handleSendMessage(t("projects.generateTasksPrompt", undefined, "Analyze project context and generate the next 3 actionable tasks."))}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
                  title="Auto-generate tasks with Orchestrator"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>AI Gen</span>
                </button>
              </div>

              <div className="space-y-1.5 overflow-y-auto flex-1">
                {activeProject?.tasks.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic p-2">{t("projects.noTasks", undefined, "No tasks created yet.")}</p>
                ) : (
                  activeProject?.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-800/40 border border-slate-700/30 text-xs"
                    >
                      <div className="flex items-start gap-2 overflow-hidden">
                        <button
                          onClick={() => handleToggleTask(task.id)}
                          className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-400"
                        >
                          {task.status === "done" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : task.status === "in_progress" ? (
                            <Clock className="h-4 w-4 text-amber-400" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </button>
                        <span
                          className={`truncate ${
                            task.status === "done" ? "line-through text-slate-500" : "text-slate-200"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-slate-500 hover:text-rose-400 shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* CENTER COLUMN: INTERACTIVE CHAT & ORCHESTRATION FEED */}
          <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            {/* Quick Action Chips */}
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800/60 bg-slate-900/40 px-4 py-2 text-xs">
              <span className="text-slate-400 shrink-0 flex items-center gap-1 font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                {t("projects.quickActions", undefined, "Quick Actions")}:
              </span>
              <button
                onClick={() => handleQuickAddAgent("Growth Marketer")}
                className="shrink-0 rounded-full bg-slate-800 px-3 py-1 font-medium text-slate-300 hover:bg-primary/20 hover:text-white transition-colors"
              >
                ➕ Hire Marketer
              </button>
              <button
                onClick={() => handleQuickAddAgent("Full Stack Developer")}
                className="shrink-0 rounded-full bg-slate-800 px-3 py-1 font-medium text-slate-300 hover:bg-primary/20 hover:text-white transition-colors"
              >
                ➕ Hire Dev Agent
              </button>
              <button
                onClick={() => handleSendMessage(t("projects.generateTasksPrompt", undefined, "Analyze project context and generate the next 3 actionable tasks."))}
                className="shrink-0 rounded-full bg-slate-800 px-3 py-1 font-medium text-slate-300 hover:bg-sky-950/40 hover:text-sky-300 transition-colors"
              >
                📋 Plan Tasks
              </button>
              <button
                onClick={() => handleSendMessage(t("projects.summarizeMemoryPrompt", undefined, "Summarize all memory files and review project goals."))}
                className="shrink-0 rounded-full bg-slate-800 px-3 py-1 font-medium text-slate-300 hover:bg-emerald-950/40 hover:text-emerald-300 transition-colors"
              >
                🧠 Audit Memory
              </button>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeProject?.messages.map((msg) => {
                const isUser = msg.sender === "user";
                const isSystem = msg.sender === "system";

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <div className="rounded-full bg-slate-800/60 border border-slate-700/40 px-3 py-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto justify-end" : "mr-auto"}`}
                  >
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div className="space-y-1.5 max-w-[85%]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300">
                          {isUser ? "You" : msg.agentName || activeProject.orchestratorName}
                        </span>
                        {msg.model && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {msg.model}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <div
                        className={`rounded-xl p-3.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-slate-900 border border-slate-800 text-slate-100 shadow-sm"
                        }`}
                      >
                        {msg.content}
                      </div>

                      {/* Render Executed Actions as Visual Cards */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {msg.actions.map((act, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-lg bg-slate-900/90 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 shadow-sm"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span>{act.details || act.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isGenerating && (
                <div className="flex gap-3 max-w-2xl mr-auto items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300">
                    <Bot className="h-4 w-4 animate-bounce" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs text-slate-300">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>{activeProject?.orchestratorName} is reasoning and executing actions...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Prompt Composer Input */}
            <div className="border-t border-slate-800/80 bg-slate-900/60 p-3 backdrop-blur">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t("projects.askOrchestrator", undefined, `Message ${activeProject?.orchestratorName || "Orchestrator"} or trigger actions...`)}
                  disabled={isGenerating}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isGenerating}
                  className="flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </main>

          {/* RIGHT COLUMN: INSPECTOR & EDITORS */}
          <aside className="w-80 border-l border-slate-800/80 bg-slate-900/40 flex flex-col">
            {/* Inspector Navigation Tabs */}
            <div className="flex border-b border-slate-800/80 bg-slate-900/80 text-xs font-semibold">
              <button
                onClick={() => setActiveRightTab("agent")}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  activeRightTab === "agent"
                    ? "border-b-2 border-primary text-white bg-slate-800/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("projects.agents", undefined, "Agent Config")}
              </button>
              <button
                onClick={() => setActiveRightTab("memory")}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  activeRightTab === "memory"
                    ? "border-b-2 border-emerald-400 text-white bg-slate-800/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("projects.memoryFiles", undefined, "Memory Doc")}
              </button>
              <button
                onClick={() => setActiveRightTab("details")}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  activeRightTab === "details"
                    ? "border-b-2 border-sky-400 text-white bg-slate-800/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("projects.details", undefined, "Workspace")}
              </button>
            </div>

            {/* TAB 1: AGENT INSPECTOR */}
            {activeRightTab === "agent" && (
              <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                {selectedAgent ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 border border-primary/40 text-primary font-bold text-sm">
                        {selectedAgent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{selectedAgent.name}</h3>
                        <p className="text-slate-400">{selectedAgent.role}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.agentRole", undefined, "Role & Specialization")}</label>
                      <input
                        type="text"
                        value={selectedAgent.role}
                        onChange={(e) => {
                          if (!activeProject) return;
                          const updated = activeProject.agents.map((a) =>
                            a.id === selectedAgent.id ? { ...a, role: e.target.value } : a,
                          );
                          updateProjectInStateAndServer({ ...activeProject, agents: updated });
                        }}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.agentPrompt", undefined, "System Prompt")}</label>
                      <textarea
                        rows={6}
                        value={selectedAgent.systemPrompt}
                        onChange={(e) => {
                          if (!activeProject) return;
                          const updated = activeProject.agents.map((a) =>
                            a.id === selectedAgent.id ? { ...a, systemPrompt: e.target.value } : a,
                          );
                          updateProjectInStateAndServer({ ...activeProject, agents: updated });
                        }}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-white font-mono text-xs leading-relaxed"
                      />
                    </div>

                    {!selectedAgent.isOrchestrator && (
                      <button
                        onClick={() => handleQuickFireAgent(selectedAgent)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md bg-rose-500/20 border border-rose-500/40 py-2 text-rose-300 hover:bg-rose-500/30 transition-colors font-semibold"
                      >
                        <UserX className="h-4 w-4" />
                        <span>{t("projects.fireAgent", undefined, "Fire Agent via Orchestrator")}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-slate-500 italic">Select an agent from the roster to inspect.</p>
                )}
              </div>
            )}

            {/* TAB 2: MEMORY FILE EDITOR */}
            {activeRightTab === "memory" && (
              <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs flex flex-col">
                {selectedMemoryFile ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.filename", undefined, "Filename")}</label>
                      <input
                        type="text"
                        value={memoryEditFilename}
                        onChange={(e) => setMemoryEditFilename(e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.fileTitle", undefined, "Title")}</label>
                      <input
                        type="text"
                        value={memoryEditTitle}
                        onChange={(e) => setMemoryEditTitle(e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-white"
                      />
                    </div>

                    <div className="space-y-1.5 flex-1 flex flex-col">
                      <label className="text-slate-400 font-semibold">{t("projects.fileContent", undefined, "Content (Markdown)")}</label>
                      <textarea
                        value={memoryEditContent}
                        onChange={(e) => setMemoryEditContent(e.target.value)}
                        className="flex-1 min-h-[180px] w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 text-white font-mono text-xs leading-relaxed"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveMemoryFile}
                        className="flex-1 rounded-md bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500 transition-colors"
                      >
                        {t("common.save", undefined, "Save File")}
                      </button>
                      <button
                        onClick={() => handleSendMessage(`Review memory file "${memoryEditFilename}" and provide feedback.`)}
                        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 hover:text-white"
                        title="Feed file to Orchestrator"
                      >
                        <Bot className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 italic">Select or create a memory file.</p>
                )}
              </div>
            )}

            {/* TAB 3: PROJECT DETAILS */}
            {activeRightTab === "details" && (
              <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                {activeProject && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.projectName", undefined, "Project Name")}</label>
                      <input
                        type="text"
                        value={activeProject.name}
                        onChange={(e) => updateProjectInStateAndServer({ ...activeProject, name: e.target.value })}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t("projects.projectDescription", undefined, "Description")}</label>
                      <textarea
                        rows={3}
                        value={activeProject.description}
                        onChange={(e) => updateProjectInStateAndServer({ ...activeProject, description: e.target.value })}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white"
                      />
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                      <h4 className="font-semibold text-white">Workspace Statistics</h4>
                      <div className="grid grid-cols-2 gap-2 text-slate-400">
                        <div>Agents: <span className="text-white font-bold">{activeProject.agents.length}</span></div>
                        <div>Memory Files: <span className="text-white font-bold">{activeProject.memoryFiles.length}</span></div>
                        <div>Tasks: <span className="text-white font-bold">{activeProject.tasks.length}</span></div>
                        <div>Messages: <span className="text-white font-bold">{activeProject.messages.length}</span></div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* CREATE PROJECT MODAL */}
        {showNewProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
              <h2 className="text-lg font-bold text-white">{t("projects.createProject", undefined, "Create New Project")}</h2>
              <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">{t("projects.projectName", undefined, "Project Name")}</label>
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. NextGen Web App"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">{t("projects.orchestratorName", undefined, "Orchestrator Name")}</label>
                  <input
                    type="text"
                    value={newOrchestratorName}
                    onChange={(e) => setNewOrchestratorName(e.target.value)}
                    placeholder="Orchestrator"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">{t("projects.projectDescription", undefined, "Description")}</label>
                  <textarea
                    rows={2}
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    placeholder="Workspace objectives and focus..."
                    className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowNewProjectModal(false)}
                    className="rounded-md border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
                  >
                    {t("common.cancel", undefined, "Cancel")}
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {t("common.create", undefined, "Create")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
