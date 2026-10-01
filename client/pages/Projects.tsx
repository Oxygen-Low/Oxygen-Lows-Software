import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderTree,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Trash2,
  Edit3,
  ExternalLink,
  RefreshCw,
  Layers,
  Lock,
  Unlock,
  Globe,
  Activity,
  Filter,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Check,
  Zap,
  Settings,
  Tag,
  Flame,
  Bug,
  ListTodo,
  Copy,
  SlidersHorizontal,
  X,
  Server,
  FileCode,
} from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  defender_app_ids: string[];
  resources: Array<{
    type: string;
    id: string;
    name?: string;
    metadata?: Record<string, any>;
  }>;
  tags: string[];
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  attached_apps_count?: number;
  threat_count?: number;
  open_issues_count?: number;
  has_critical?: boolean;
  attached_apps?: any[];
}

export interface ProjectIssue {
  id: string;
  project_id: string;
  user_id?: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "open" | "in_progress" | "resolved";
  category: "security" | "config" | "task" | "bug" | "enhancement";
  target_app_id?: string | null;
  target_app_name?: string | null;
  is_automated?: boolean;
  quick_fix_type?: string | null;
  quick_fix_payload?: any;
  created_at: string;
  updated_at?: string;
}

export interface ProjectThreat {
  id: string;
  app_id: string;
  app_name?: string;
  type: string;
  ip: string;
  country?: string;
  path?: string;
  method?: string;
  blocked?: boolean;
  score?: number;
  created_at: string;
  headers?: Record<string, string>;
  payload?: any;
}

export interface DefenderAppSummary {
  id: string;
  name: string;
  block_mode_enabled: boolean;
  abuseipdb_configured: boolean;
  created_at?: string;
}

export default function Projects() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();

  usePageTitle(t("titles.projects", undefined, "Projects"), {
    description: t(
      "projects.subtitle",
      undefined,
      "Manage projects, attach WebDefender apps, resolve security issues, and monitor live threats.",
    ),
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [threats, setThreats] = useState<ProjectThreat[]>([]);
  const [userDefenderApps, setUserDefenderApps] = useState<DefenderAppSummary[]>([]);
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Loading states
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isApplyingFix, setIsApplyingFix] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState("all");
  const [issueStatusFilter, setIssueStatusFilter] = useState("all");
  const [issueCategoryFilter, setIssueCategoryFilter] = useState("all");
  const [threatTypeFilter, setThreatTypeFilter] = useState("all");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectTags, setNewProjectTags] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [isAttachAppModalOpen, setIsAttachAppModalOpen] = useState(false);
  const [selectedAppToAttach, setSelectedAppToAttach] = useState("");
  const [isAttachingApp, setIsAttachingApp] = useState(false);

  const [isCreateAppModalOpen, setIsCreateAppModalOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [createdAppApiKey, setCreatedAppApiKey] = useState<string | null>(null);
  const [isCreatingApp, setIsCreatingApp] = useState(false);

  const [isCreateIssueModalOpen, setIsCreateIssueModalOpen] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueDesc, setNewIssueDesc] = useState("");
  const [newIssueSeverity, setNewIssueSeverity] = useState<ProjectIssue["severity"]>("high");
  const [newIssueCategory, setNewIssueCategory] = useState<ProjectIssue["category"]>("security");
  const [newIssueTargetApp, setNewIssueTargetApp] = useState<string>("");
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
      if (!res.ok) {
        let errorMsg = `Request failed with status ${res.status}`;
        try {
          const json = await res.clone().json();
          if (json.error) errorMsg = json.error;
        } catch {
          try {
            const errorText = await res.text();
            if (errorText) errorMsg = errorText;
          } catch {}
        }
        throw new Error(errorMsg);
      }
      return res;
    },
    [session],
  );

  // Load user defender apps for attaching
  const loadUserDefenderApps = useCallback(async () => {
    try {
      const res = await authFetch("/api/webdefender/apps");
      const data = await res.json();
      setUserDefenderApps(data || []);
    } catch (err) {
      console.warn("Failed to load user defender apps:", err);
    }
  }, [authFetch]);

  // Load active project details, issues, and threats
  const loadActiveProjectData = useCallback(async (id: string) => {
    try {
      setIsLoadingDetails(true);
      const [projRes, issuesRes, threatsRes] = await Promise.all([
        authFetch(`/api/projects/${id}`),
        authFetch(`/api/projects/${id}/issues`),
        authFetch(`/api/projects/${id}/threats?limit=100`),
      ]);

      const projData: Project = await projRes.json();
      const issuesData: ProjectIssue[] = await issuesRes.json();
      const threatsData = await threatsRes.json();

      setActiveProject(projData);
      setIssues(issuesData || []);
      setThreats(threatsData.threats || []);
    } catch (err) {
      console.error("Failed to load project details:", err);
      toast.error(t("projects.loadError", undefined, "Failed to load project details."));
    } finally {
      setIsLoadingDetails(false);
    }
  }, [authFetch, t]);

  // Load all projects
  const loadProjects = useCallback(async (selectId?: string) => {
    try {
      setIsLoadingProjects(true);
      const res = await authFetch("/api/projects");
      const data: Project[] = await res.json();
      setProjects(data || []);

      if (data && data.length > 0) {
        const targetId = selectId || projectId || data[0].id;
        const matched = data.find((p) => p.id === targetId) || data[0];
        if (matched) {
          if (!projectId || projectId !== matched.id) {
            navigate(`/projects/${matched.id}`, { replace: true });
          }
          await loadActiveProjectData(matched.id);
        }
      } else {
        setActiveProject(null);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
      toast.error(t("projects.loadError", undefined, "Failed to load projects."));
    } finally {
      setIsLoadingProjects(false);
    }
  }, [authFetch, projectId, navigate, loadActiveProjectData, t]);

  useEffect(() => {
    if (session) {
      loadProjects();
      loadUserDefenderApps();
    }
  }, [session, loadUserDefenderApps]);

  useEffect(() => {
    if (projectId && session) {
      loadActiveProjectData(projectId);
    }
  }, [projectId, session, loadActiveProjectData]);

  // Filtered projects for sidebar
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(query))),
    );
  }, [projects, searchQuery]);

  // Available defender apps not yet attached to active project
  const unattachedApps = useMemo(() => {
    if (!activeProject) return [];
    const attachedIds = activeProject.defender_app_ids || [];
    return userDefenderApps.filter((a) => !attachedIds.includes(a.id));
  }, [activeProject, userDefenderApps]);

  // Computed summary counts
  const stats = useMemo(() => {
    const critical = issues.filter(
      (i) => i.severity === "critical" && i.status !== "resolved",
    ).length;
    const high = issues.filter(
      (i) => i.severity === "high" && i.status !== "resolved",
    ).length;
    const medium = issues.filter(
      (i) => i.severity === "medium" && i.status !== "resolved",
    ).length;
    const openTotal = issues.filter((i) => i.status !== "resolved").length;
    const quickFixesCount = issues.filter(
      (i) => i.status !== "resolved" && Boolean(i.quick_fix_type),
    ).length;

    return {
      critical,
      high,
      medium,
      openTotal,
      quickFixesCount,
      attachedAppsCount: activeProject?.defender_app_ids?.length || 0,
      threatCount: threats.length,
    };
  }, [issues, threats, activeProject]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (issueSeverityFilter !== "all" && issue.severity !== issueSeverityFilter) {
        return false;
      }
      if (issueStatusFilter !== "all" && issue.status !== issueStatusFilter) {
        return false;
      }
      if (issueCategoryFilter !== "all" && issue.category !== issueCategoryFilter) {
        return false;
      }
      return true;
    });
  }, [issues, issueSeverityFilter, issueStatusFilter, issueCategoryFilter]);

  // Filtered threats
  const filteredThreats = useMemo(() => {
    return threats.filter((threat) => {
      if (threatTypeFilter !== "all" && threat.type !== threatTypeFilter) {
        return false;
      }
      return true;
    });
  }, [threats, threatTypeFilter]);

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      setIsCreatingProject(true);
      const tagsArray = newProjectTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDescription.trim(),
          tags: tagsArray,
        }),
      });
      const created: Project = await res.json();
      toast.success(t("projects.projectCreated", undefined, "Project created successfully!"));
      setIsCreateModalOpen(false);
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectTags("");

      // Immediately set active project and update local projects list
      setActiveProject(created);
      setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      navigate(`/projects/${created.id}`);

      // Fetch fresh issues, threats and reload full projects summary
      await Promise.all([
        loadActiveProjectData(created.id),
        loadProjects(created.id),
      ]);
    } catch (err: any) {
      toast.error(err.message || t("projects.createProjectError", undefined, "Failed to create project"));
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Delete Project
  const handleDeleteProject = async () => {
    if (!activeProject) return;
    try {
      setIsDeletingProject(true);
      await authFetch(`/api/projects/${activeProject.id}`, {
        method: "DELETE",
      });
      toast.success("Project deleted successfully");
      setIsDeleteModalOpen(false);
      await loadProjects();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    } finally {
      setIsDeletingProject(false);
    }
  };

  // Attach Existing App
  const handleAttachApp = async () => {
    if (!activeProject || !selectedAppToAttach) return;
    try {
      setIsAttachingApp(true);
      const currentIds = activeProject.defender_app_ids || [];
      const updatedIds = [...currentIds, selectedAppToAttach];

      const res = await authFetch(`/api/projects/${activeProject.id}`, {
        method: "PUT",
        body: JSON.stringify({ defender_app_ids: updatedIds }),
      });
      const updated: Project = await res.json();
      setActiveProject(updated);
      toast.success("WebDefender app attached to project");
      setIsAttachAppModalOpen(false);
      setSelectedAppToAttach("");
      loadActiveProjectData(activeProject.id);
      loadProjects(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to attach app");
    } finally {
      setIsAttachingApp(false);
    }
  };

  // Detach App
  const handleDetachApp = async (appId: string) => {
    if (!activeProject) return;
    try {
      const currentIds = activeProject.defender_app_ids || [];
      const updatedIds = currentIds.filter((id) => id !== appId);

      await authFetch(`/api/projects/${activeProject.id}`, {
        method: "PUT",
        body: JSON.stringify({ defender_app_ids: updatedIds }),
      });
      toast.success("App detached from project");
      loadActiveProjectData(activeProject.id);
      loadProjects(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to detach app");
    }
  };

  // Create and Attach WebDefender App
  const handleCreateAndAttachApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !newAppName.trim()) return;
    try {
      setIsCreatingApp(true);
      const res = await authFetch("/api/webdefender/apps", {
        method: "POST",
        body: JSON.stringify({ name: newAppName.trim() }),
      });
      const data = await res.json();
      setCreatedAppApiKey(data.apiKey);

      // Now attach to active project
      const currentIds = activeProject.defender_app_ids || [];
      const updatedIds = [...currentIds, data.id];
      await authFetch(`/api/projects/${activeProject.id}`, {
        method: "PUT",
        body: JSON.stringify({ defender_app_ids: updatedIds }),
      });

      toast.success("WebDefender app created and attached!");
      loadUserDefenderApps();
      loadActiveProjectData(activeProject.id);
      loadProjects(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to create WebDefender app");
    } finally {
      setIsCreatingApp(false);
    }
  };

  // Create Custom Issue
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !newIssueTitle.trim()) return;
    try {
      setIsCreatingIssue(true);
      await authFetch(`/api/projects/${activeProject.id}/issues`, {
        method: "POST",
        body: JSON.stringify({
          title: newIssueTitle.trim(),
          description: newIssueDesc.trim(),
          severity: newIssueSeverity,
          category: newIssueCategory,
          target_app_id: newIssueTargetApp || null,
        }),
      });
      toast.success("Issue created successfully!");
      setIsCreateIssueModalOpen(false);
      setNewIssueTitle("");
      setNewIssueDesc("");
      setNewIssueTargetApp("");
      loadActiveProjectData(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to create issue");
    } finally {
      setIsCreatingIssue(false);
    }
  };

  // Execute 1-Click Quick Fix
  const handleQuickFix = async (issue: ProjectIssue) => {
    if (!activeProject || !issue.quick_fix_type) return;
    try {
      setIsApplyingFix(issue.id);
      const payload: any = {
        fixType: issue.quick_fix_type,
        targetAppId: issue.target_app_id || issue.quick_fix_payload?.appId,
        ip: issue.quick_fix_payload?.ip,
        issueId: issue.id,
      };

      const res = await authFetch(`/api/projects/${activeProject.id}/issues/quick-fix`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      toast.success(data.message || t("projects.issues.quickFixApplied", undefined, "Quick fix applied successfully"));
      await loadActiveProjectData(activeProject.id);
      await loadProjects(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply quick fix");
    } finally {
      setIsApplyingFix(null);
    }
  };

  // 1-Click Block Threat IP
  const handleBlockThreatIp = async (appId: string, ip: string) => {
    if (!activeProject) return;
    try {
      const res = await authFetch(`/api/projects/${activeProject.id}/issues/quick-fix`, {
        method: "POST",
        body: JSON.stringify({
          fixType: "block_ip",
          targetAppId: appId,
          ip,
        }),
      });
      const data = await res.json();
      toast.success(data.message || `IP ${ip} has been blocked`);
      loadActiveProjectData(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to block IP");
    }
  };

  // Toggle Custom Issue Status
  const handleToggleIssueStatus = async (issue: ProjectIssue) => {
    if (!activeProject || issue.is_automated) return;
    try {
      const nextStatus = issue.status === "resolved" ? "open" : "resolved";
      await authFetch(`/api/projects/${activeProject.id}/issues/${issue.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(
        nextStatus === "resolved"
          ? t("projects.issues.markResolved", undefined, "Issue resolved")
          : t("projects.issues.reopen", undefined, "Issue reopened"),
      );
      loadActiveProjectData(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to update issue status");
    }
  };

  // Delete Custom Issue
  const handleDeleteIssue = async (issueId: string) => {
    if (!activeProject) return;
    try {
      await authFetch(`/api/projects/${activeProject.id}/issues/${issueId}`, {
        method: "DELETE",
      });
      toast.success("Issue deleted");
      loadActiveProjectData(activeProject.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete issue");
    }
  };

  const getSeverityBadge = (severity: ProjectIssue["severity"]) => {
    switch (severity) {
      case "critical":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1 font-semibold">
            <Flame className="w-3.5 h-3.5 animate-pulse" />
            {t("projects.issues.severityCritical", undefined, "Critical")}
          </Badge>
        );
      case "high":
        return (
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 flex items-center gap-1 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("projects.issues.severityHigh", undefined, "High")}
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 flex items-center gap-1 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" />
            {t("projects.issues.severityMedium", undefined, "Medium")}
          </Badge>
        );
      case "low":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 flex items-center gap-1 font-semibold">
            <Info className="w-3.5 h-3.5" />
            {t("projects.issues.severityLow", undefined, "Low")}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 flex items-center gap-1 font-semibold">
            <Info className="w-3.5 h-3.5" />
            {t("projects.issues.severityInfo", undefined, "Info")}
          </Badge>
        );
    }
  };

  const getCategoryBadge = (category: ProjectIssue["category"]) => {
    switch (category) {
      case "security":
        return (
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
            <Shield className="w-3 h-3 mr-1" />
            {t("projects.issues.categorySecurity", undefined, "Security")}
          </Badge>
        );
      case "config":
        return (
          <Badge variant="outline" className="border-purple-500/30 text-purple-400">
            <SlidersHorizontal className="w-3 h-3 mr-1" />
            {t("projects.issues.categoryConfig", undefined, "Config")}
          </Badge>
        );
      case "bug":
        return (
          <Badge variant="outline" className="border-rose-500/30 text-rose-400">
            <Bug className="w-3 h-3 mr-1" />
            {t("projects.issues.categoryBug", undefined, "Bug")}
          </Badge>
        );
      case "enhancement":
        return (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
            <Zap className="w-3 h-3 mr-1" />
            {t("projects.issues.categoryEnhancement", undefined, "Enhancement")}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-slate-500/30 text-slate-400">
            <ListTodo className="w-3 h-3 mr-1" />
            {t("projects.issues.categoryTask", undefined, "Task")}
          </Badge>
        );
    }
  };

  return (
    <Layout fullWidth>
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
        {/* ========================================================================= */}
        {/* LEFT PROJECTS SIDEBAR */}
        {/* ========================================================================= */}
        <aside className="w-full md:w-80 lg:w-96 border-r border-slate-800/80 bg-slate-900/50 backdrop-blur flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <FolderTree className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-white text-base leading-tight">
                  {t("projects.title", undefined, "Projects")}
                </h1>
                <p className="text-xs text-slate-400">
                  {projects.length} {projects.length === 1 ? "project" : "projects"}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 h-8 px-2.5 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t("projects.newProject", undefined, "New")}
            </Button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-800/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t("projects.searchProjects", undefined, "Search projects...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-slate-950/60 border-slate-800 focus-visible:ring-cyan-500"
              />
            </div>
          </div>

          {/* Project List */}
          <ScrollArea className="flex-1 p-2">
            {isLoadingProjects ? (
              <div className="p-6 flex flex-col items-center justify-center text-slate-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="text-xs">{t("common.loading", undefined, "Loading...")}</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-6 text-center text-slate-500 space-y-3">
                <FolderTree className="w-8 h-8 mx-auto opacity-30 text-cyan-400" />
                <p className="text-xs">
                  {searchQuery
                    ? t("projects.noProjectsFound", undefined, "No projects found")
                    : t("projects.noProjectsDescription", undefined, "Create your first project to organize WebDefender apps.")}
                </p>
                {!searchQuery && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {t("projects.createNewProject", undefined, "Create Project")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredProjects.map((project) => {
                  const isActive = activeProject?.id === project.id;
                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all relative group flex flex-col gap-1.5",
                        isActive
                          ? "bg-cyan-500/10 border-cyan-500/40 text-white shadow-sm shadow-cyan-950"
                          : "bg-slate-900/40 border-slate-800/70 hover:bg-slate-850 hover:border-slate-700 text-slate-300",
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-sm truncate pr-2 text-white">
                          {project.name}
                        </span>
                        {project.has_critical && (
                          <span
                            title="Critical security finding"
                            className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0"
                          />
                        )}
                      </div>

                      {project.description && (
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {project.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-cyan-400" />
                          {project.attached_apps_count || 0} apps
                        </span>
                        <span>•</span>
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            (project.open_issues_count || 0) > 0 ? "text-amber-400" : "text-slate-400",
                          )}
                        >
                          <AlertCircle className="w-3 h-3" />
                          {project.open_issues_count || 0} issues
                        </span>
                        {project.threat_count !== undefined && project.threat_count > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-rose-400 flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              {project.threat_count} threats
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* ========================================================================= */}
        {/* MAIN WORKSPACE CONTENT */}
        {/* ========================================================================= */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto">
          {!activeProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <FolderTree className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md">
                <h2 className="text-xl font-bold text-white">
                  {t("projects.selectProject", undefined, "Select a Project")}
                </h2>
                <p className="text-sm text-slate-400">
                  {t("projects.selectProjectPrompt", undefined, "Select a project from the sidebar or create a new one to get started.")}
                </p>
              </div>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("projects.createNewProject", undefined, "Create Project")}
              </Button>
            </div>
          ) : (
            <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
              {/* Project Header Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                      {activeProject.name}
                    </h2>
                    {stats.critical > 0 ? (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                        {stats.critical} Critical Action Required
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                        Healthy
                      </Badge>
                    )}
                  </div>
                  {activeProject.description && (
                    <p className="text-sm text-slate-400 max-w-3xl">
                      {activeProject.description}
                    </p>
                  )}
                  {activeProject.tags && activeProject.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeProject.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-slate-300 border border-slate-700/60"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadActiveProjectData(activeProject.id)}
                    className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs h-9"
                  >
                    <RefreshCw
                      className={cn(
                        "w-3.5 h-3.5 mr-1.5 text-cyan-400",
                        isLoadingDetails && "animate-spin",
                      )}
                    />
                    {t("common.refresh", undefined, "Refresh")}
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => setIsCreateIssueModalOpen(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-9"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {t("projects.issues.newIssue", undefined, "New Issue")}
                  </Button>
                </div>
              </div>

              {/* Key Metrics Stat Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <Card className="bg-slate-900/50 border-slate-800/80 backdrop-blur">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        {t("projects.stats.criticalIssues", undefined, "Critical Issues")}
                      </p>
                      <p className={cn("text-2xl font-bold mt-1", stats.critical > 0 ? "text-red-400" : "text-slate-100")}>
                        {stats.critical}
                      </p>
                    </div>
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stats.critical > 0 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-slate-800 text-slate-400")}>
                      <Flame className="w-5 h-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800/80 backdrop-blur">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        {t("projects.stats.openIssues", undefined, "Open Issues")}
                      </p>
                      <p className="text-2xl font-bold text-amber-400 mt-1">
                        {stats.openTotal}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800/80 backdrop-blur">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        {t("projects.stats.totalThreats", undefined, "Total Threats")}
                      </p>
                      <p className="text-2xl font-bold text-rose-400 mt-1">
                        {stats.threatCount}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                      <Activity className="w-5 h-5" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800/80 backdrop-blur">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        {t("projects.stats.attachedApps", undefined, "WebDefender Apps")}
                      </p>
                      <p className="text-2xl font-bold text-cyan-400 mt-1">
                        {stats.attachedAppsCount}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                      <Shield className="w-5 h-5" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Workspace Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                <TabsList className="bg-slate-900/80 border border-slate-800 p-1 w-full sm:w-auto flex flex-wrap justify-start">
                  <TabsTrigger value="overview" className="text-xs px-3.5 data-[state=active]:bg-cyan-500 data-[state=active]:text-white">
                    {t("projects.tabs.overview", undefined, "Overview")}
                  </TabsTrigger>
                  <TabsTrigger value="issues" className="text-xs px-3.5 data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex items-center gap-1.5">
                    {t("projects.tabs.issues", undefined, "Issues Manager")}
                    {stats.openTotal > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-300 font-bold">
                        {stats.openTotal}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="threats" className="text-xs px-3.5 data-[state=active]:bg-cyan-500 data-[state=active]:text-white flex items-center gap-1.5">
                    {t("projects.tabs.threats", undefined, "Recent Threats")}
                    {stats.threatCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/30 text-rose-300 font-bold">
                        {stats.threatCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="apps" className="text-xs px-3.5 data-[state=active]:bg-cyan-500 data-[state=active]:text-white">
                    {t("projects.tabs.apps", undefined, "WebDefender Apps")} ({stats.attachedAppsCount})
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs px-3.5 data-[state=active]:bg-cyan-500 data-[state=active]:text-white">
                    {t("projects.tabs.settings", undefined, "Settings")}
                  </TabsTrigger>
                </TabsList>

                {/* ================================================================= */}
                {/* TAB 1: OVERVIEW */}
                {/* ================================================================= */}
                <TabsContent value="overview" className="space-y-6 m-0">
                  {/* Critical Action Banner if needed */}
                  {stats.critical > 0 && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Flame className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-red-300 text-sm">
                            {stats.critical} Critical Security Issue{stats.critical > 1 ? "s" : ""} Requiring Attention
                          </h4>
                          <p className="text-xs text-red-300/80 mt-0.5">
                            Unblocked attack sources or unprotected endpoints have been detected. Remediate with 1-click quick fixes.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("issues")}
                        className="bg-red-600 hover:bg-red-500 text-white shrink-0 text-xs"
                      >
                        Review Issues
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Highest Severity Issues Card */}
                    <Card className="bg-slate-900/60 border-slate-800">
                      <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-base text-white flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            {t("projects.issues.title", undefined, "Issues Manager")}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-400">
                            Highest severity issues to fix first
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab("issues")}
                          className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        >
                          View All ({issues.length})
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {issues.filter((i) => i.status !== "resolved").slice(0, 4).length === 0 ? (
                          <div className="p-6 text-center text-slate-500 space-y-2">
                            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 opacity-60" />
                            <p className="text-xs text-emerald-300 font-medium">
                              All clear! No unresolved issues found.
                            </p>
                          </div>
                        ) : (
                          issues
                            .filter((i) => i.status !== "resolved")
                            .slice(0, 4)
                            .map((issue) => (
                              <div
                                key={issue.id}
                                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col gap-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {getSeverityBadge(issue.severity)}
                                      {getCategoryBadge(issue.category)}
                                      {issue.is_automated && (
                                        <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-300">
                                          Automated
                                        </Badge>
                                      )}
                                    </div>
                                    <h5 className="font-semibold text-sm text-white">
                                      {issue.title}
                                    </h5>
                                  </div>

                                  {issue.quick_fix_type && (
                                    <Button
                                      size="sm"
                                      disabled={isApplyingFix === issue.id}
                                      onClick={() => handleQuickFix(issue)}
                                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-7 px-2.5 shrink-0"
                                    >
                                      <Zap className="w-3 h-3 mr-1" />
                                      {isApplyingFix === issue.id ? "Fixing..." : "Quick Fix"}
                                    </Button>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 line-clamp-2">
                                  {issue.description}
                                </p>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>

                    {/* Recent Threats Summary Card */}
                    <Card className="bg-slate-900/60 border-slate-800">
                      <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-base text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-rose-400" />
                            {t("projects.threats.title", undefined, "Recent Threats")}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-400">
                            Live telemetry across attached WebDefender apps
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab("threats")}
                          className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        >
                          View All ({threats.length})
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2.5">
                        {threats.slice(0, 4).length === 0 ? (
                          <div className="p-6 text-center text-slate-500 space-y-2">
                            <ShieldCheck className="w-8 h-8 mx-auto text-cyan-400 opacity-40" />
                            <p className="text-xs">
                              {t("projects.threats.noThreats", undefined, "No threats detected yet.")}
                            </p>
                          </div>
                        ) : (
                          threats.slice(0, 4).map((threat) => (
                            <div
                              key={threat.id}
                              className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <CountryFlag countryCode={threat.country} className="w-4 h-3 shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-slate-200">{threat.ip}</span>
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px] px-1.5 py-0",
                                        threat.blocked
                                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                                          : "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                      )}
                                    >
                                      {threat.type}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {threat.app_name} • {threat.path || "/"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-500">
                                  {new Date(threat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                {!threat.blocked && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleBlockThreatIp(threat.app_id, threat.ip)}
                                    className="h-6 px-2 text-[10px] border-red-500/40 text-red-400 hover:bg-red-500/10"
                                  >
                                    Block
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Attached Apps Section Overview */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        {t("projects.apps.title", undefined, "Attached WebDefender Apps")}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAttachAppModalOpen(true)}
                        className="text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {t("projects.apps.attachExistingApp", undefined, "Attach App")}
                      </Button>
                    </div>

                    {(!activeProject.attached_apps || activeProject.attached_apps.length === 0) ? (
                      <Card className="bg-slate-900/40 border-dashed border-slate-800">
                        <CardContent className="p-6 text-center space-y-3">
                          <Shield className="w-8 h-8 mx-auto text-slate-600" />
                          <p className="text-xs text-slate-400">
                            {t("projects.apps.noApps", undefined, "No WebDefender apps attached to this project yet.")}
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => setIsAttachAppModalOpen(true)}
                              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                            >
                              {t("projects.apps.attachExistingApp", undefined, "Attach Existing App")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setIsCreateAppModalOpen(true)}
                              className="border-slate-700 text-slate-300 text-xs"
                            >
                              {t("projects.apps.createAndAttach", undefined, "Create & Attach App")}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeProject.attached_apps.map((app: any) => (
                          <Card key={app.id} className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all">
                            <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                              <div className="space-y-1">
                                <CardTitle className="text-sm text-white font-semibold flex items-center gap-1.5">
                                  <Shield className="w-4 h-4 text-cyan-400" />
                                  {app.name}
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    className={cn(
                                      "text-[10px]",
                                      app.block_mode_enabled
                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                        : "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                    )}
                                  >
                                    {app.block_mode_enabled
                                      ? t("projects.apps.blockModeOn", undefined, "Active Blocking")
                                      : t("projects.apps.blockModeOff", undefined, "Detection Only")}
                                  </Badge>
                                  {app.abuseipdb_configured && (
                                    <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                                      AbuseIPDB
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <Link
                                to="/apps/webdefender"
                                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                                title="Open in WebDefender"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                                <span>Attached to project</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDetachApp(app.id)}
                                  className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                  Detach
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ================================================================= */}
                {/* TAB 2: ISSUES MANAGER */}
                {/* ================================================================= */}
                <TabsContent value="issues" className="space-y-4 m-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <h3 className="font-bold text-white text-base">
                        {t("projects.issues.title", undefined, "Issues Manager")}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t("projects.issues.subtitle", undefined, "Prioritized security findings and operational tasks sorted by highest severity.")}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setIsCreateIssueModalOpen(true)}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      {t("projects.issues.newIssue", undefined, "New Issue")}
                    </Button>
                  </div>

                  {/* Filter controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select value={issueSeverityFilter} onValueChange={setIssueSeverityFilter}>
                      <SelectTrigger className="bg-slate-900/60 border-slate-800 text-xs h-9">
                        <SelectValue placeholder="Filter Severity" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                        <SelectItem value="all">{t("projects.issues.allSeverities", undefined, "All Severities")}</SelectItem>
                        <SelectItem value="critical">{t("projects.issues.severityCritical", undefined, "Critical")}</SelectItem>
                        <SelectItem value="high">{t("projects.issues.severityHigh", undefined, "High")}</SelectItem>
                        <SelectItem value="medium">{t("projects.issues.severityMedium", undefined, "Medium")}</SelectItem>
                        <SelectItem value="low">{t("projects.issues.severityLow", undefined, "Low")}</SelectItem>
                        <SelectItem value="info">{t("projects.issues.severityInfo", undefined, "Info")}</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={issueStatusFilter} onValueChange={setIssueStatusFilter}>
                      <SelectTrigger className="bg-slate-900/60 border-slate-800 text-xs h-9">
                        <SelectValue placeholder="Filter Status" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                        <SelectItem value="all">{t("projects.issues.allStatuses", undefined, "All Statuses")}</SelectItem>
                        <SelectItem value="open">{t("projects.issues.statusOpen", undefined, "Open")}</SelectItem>
                        <SelectItem value="in_progress">{t("projects.issues.statusInProgress", undefined, "In Progress")}</SelectItem>
                        <SelectItem value="resolved">{t("projects.issues.statusResolved", undefined, "Resolved")}</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={issueCategoryFilter} onValueChange={setIssueCategoryFilter}>
                      <SelectTrigger className="bg-slate-900/60 border-slate-800 text-xs h-9">
                        <SelectValue placeholder="Filter Category" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                        <SelectItem value="all">{t("projects.issues.allCategories", undefined, "All Categories")}</SelectItem>
                        <SelectItem value="security">{t("projects.issues.categorySecurity", undefined, "Security")}</SelectItem>
                        <SelectItem value="config">{t("projects.issues.categoryConfig", undefined, "Config")}</SelectItem>
                        <SelectItem value="task">{t("projects.issues.categoryTask", undefined, "Task")}</SelectItem>
                        <SelectItem value="bug">{t("projects.issues.categoryBug", undefined, "Bug")}</SelectItem>
                        <SelectItem value="enhancement">{t("projects.issues.categoryEnhancement", undefined, "Enhancement")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Issues List */}
                  <div className="space-y-3">
                    {filteredIssues.length === 0 ? (
                      <Card className="bg-slate-900/40 border-dashed border-slate-800">
                        <CardContent className="p-8 text-center space-y-2">
                          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 opacity-60" />
                          <h4 className="font-semibold text-white text-sm">
                            {t("projects.issues.noIssues", undefined, "No issues found matching the selected criteria. Great job!")}
                          </h4>
                        </CardContent>
                      </Card>
                    ) : (
                      filteredIssues.map((issue) => (
                        <Card
                          key={issue.id}
                          className={cn(
                            "border transition-all",
                            issue.status === "resolved"
                              ? "bg-slate-950/40 border-slate-800/50 opacity-60"
                              : "bg-slate-900/60 border-slate-800 hover:border-slate-700",
                          )}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getSeverityBadge(issue.severity)}
                                {getCategoryBadge(issue.category)}
                                {issue.is_automated ? (
                                  <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                                    {t("projects.issues.automatedBadge", undefined, "Automated Audit")}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                                    {t("projects.issues.customBadge", undefined, "Custom Task")}
                                  </Badge>
                                )}
                                {issue.target_app_name && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    • <Shield className="w-3 h-3 text-cyan-400" />
                                    {issue.target_app_name}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {issue.quick_fix_type && issue.status !== "resolved" && (
                                  <Button
                                    size="sm"
                                    disabled={isApplyingFix === issue.id}
                                    onClick={() => handleQuickFix(issue)}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-7 px-3"
                                  >
                                    <Zap className="w-3 h-3 mr-1" />
                                    {isApplyingFix === issue.id ? "Applying Fix..." : t("projects.issues.quickFix", undefined, "Quick Fix")}
                                  </Button>
                                )}

                                {!issue.is_automated && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleToggleIssueStatus(issue)}
                                      className={cn(
                                        "text-xs h-7 px-2.5",
                                        issue.status === "resolved"
                                          ? "border-slate-700 text-slate-300"
                                          : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10",
                                      )}
                                    >
                                      <Check className="w-3 h-3 mr-1" />
                                      {issue.status === "resolved"
                                        ? t("projects.issues.reopen", undefined, "Reopen")
                                        : t("projects.issues.markResolved", undefined, "Resolve")}
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteIssue(issue.id)}
                                      className="h-7 w-7 p-0 text-slate-500 hover:text-red-400"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div>
                              <h4 className={cn("text-base font-semibold text-white", issue.status === "resolved" && "line-through text-slate-400")}>
                                {issue.title}
                              </h4>
                              {issue.description && (
                                <p className="text-xs text-slate-300/80 mt-1 leading-relaxed">
                                  {issue.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
                              <span>Created {new Date(issue.created_at).toLocaleDateString()}</span>
                              <span className="capitalize">Status: {issue.status}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* ================================================================= */}
                {/* TAB 3: RECENT THREATS */}
                {/* ================================================================= */}
                <TabsContent value="threats" className="space-y-4 m-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <h3 className="font-bold text-white text-base">
                        {t("projects.threats.title", undefined, "Recent Threats")}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t("projects.threats.subtitle", undefined, "Aggregated live threat log across all attached WebDefender apps.")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadActiveProjectData(activeProject.id)}
                        className="text-xs border-slate-800 text-slate-300"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                        {t("projects.threats.refreshThreats", undefined, "Refresh")}
                      </Button>
                    </div>
                  </div>

                  {/* Threat Feed Table */}
                  <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-950/80">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.country", undefined, "Country")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.clientIp", undefined, "Client IP")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.threatType", undefined, "Threat Type")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.targetApp", undefined, "App & Path")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.action", undefined, "Action")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">{t("projects.threats.timestamp", undefined, "Time")}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredThreats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-500">
                              {t("projects.threats.noThreats", undefined, "No threats detected on attached apps yet.")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredThreats.map((threat) => (
                            <TableRow key={threat.id} className="border-slate-800/80 hover:bg-slate-850/50">
                              <TableCell>
                                <CountryFlag countryCode={threat.country} className="w-4 h-3" />
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium text-white">
                                {threat.ip}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    "text-[10px]",
                                    threat.blocked
                                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                                      : "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                  )}
                                >
                                  {threat.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className="text-cyan-300 font-medium">{threat.app_name}</span>
                                <span className="text-slate-500 font-mono text-[11px] block truncate max-w-[200px]">
                                  {threat.path || "/"}
                                </span>
                              </TableCell>
                              <TableCell>
                                {threat.blocked ? (
                                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                    {t("projects.threats.actionBlocked", undefined, "Blocked")}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                                    {t("projects.threats.actionLogged", undefined, "Logged")}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] text-slate-400">
                                {new Date(threat.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {!threat.blocked ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleBlockThreatIp(threat.app_id, threat.ip)}
                                    className="h-7 px-2.5 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
                                  >
                                    {t("projects.threats.blockIp", undefined, "Block IP")}
                                  </Button>
                                ) : (
                                  <span className="text-[11px] text-slate-500">Blocked</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                {/* ================================================================= */}
                {/* TAB 4: WEBDEFENDER APPS */}
                {/* ================================================================= */}
                <TabsContent value="apps" className="space-y-4 m-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                    <div>
                      <h3 className="font-bold text-white text-base">
                        {t("projects.apps.title", undefined, "Attached WebDefender Apps")}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t("projects.apps.subtitle", undefined, "Manage security applications attached to this project.")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAttachAppModalOpen(true)}
                        className="text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {t("projects.apps.attachExistingApp", undefined, "Attach Existing App")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIsCreateAppModalOpen(true)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {t("projects.apps.createAndAttach", undefined, "Create App")}
                      </Button>
                    </div>
                  </div>

                  {(!activeProject.attached_apps || activeProject.attached_apps.length === 0) ? (
                    <Card className="bg-slate-900/40 border-dashed border-slate-800">
                      <CardContent className="p-8 text-center space-y-3">
                        <Shield className="w-10 h-10 mx-auto text-slate-600" />
                        <h4 className="font-semibold text-white text-sm">
                          {t("projects.apps.noApps", undefined, "No WebDefender apps attached to this project yet.")}
                        </h4>
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => setIsAttachAppModalOpen(true)}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                          >
                            {t("projects.apps.attachExistingApp", undefined, "Attach Existing App")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeProject.attached_apps.map((app: any) => (
                        <Card key={app.id} className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all">
                          <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between">
                            <div className="space-y-1">
                              <CardTitle className="text-base text-white font-semibold flex items-center gap-2">
                                <Shield className="w-4 h-4 text-cyan-400" />
                                {app.name}
                              </CardTitle>
                              <div className="flex items-center gap-2 pt-1">
                                <Badge
                                  className={cn(
                                    "text-[10px]",
                                    app.block_mode_enabled
                                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                      : "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                  )}
                                >
                                  {app.block_mode_enabled
                                    ? t("projects.apps.blockModeOn", undefined, "Active Blocking")
                                    : t("projects.apps.blockModeOff", undefined, "Detection Only")}
                                </Badge>
                                {app.abuseipdb_configured && (
                                  <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                                    AbuseIPDB Active
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <Link
                              to="/apps/webdefender"
                              className="text-cyan-400 hover:text-cyan-300 p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20"
                              title={t("projects.apps.openDefender", undefined, "Open in WebDefender")}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </CardHeader>
                          <CardContent className="p-5 pt-2 space-y-3">
                            <p className="text-xs text-slate-400">
                              Connected WebDefender security guard protecting your application traffic.
                            </p>
                            <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800">
                              <span className="text-slate-500">ID: {app.id.slice(0, 8)}...</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDetachApp(app.id)}
                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              >
                                {t("projects.apps.detachApp", undefined, "Detach")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ================================================================= */}
                {/* TAB 5: SETTINGS */}
                {/* ================================================================= */}
                <TabsContent value="settings" className="space-y-6 m-0">
                  <Card className="bg-slate-900/60 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base text-white">
                        {t("projects.editProject", undefined, "Project Details")}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-400">
                        Update project name, description, and metadata tags
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-300">{t("projects.projectName", undefined, "Project Name")}</Label>
                        <Input
                          value={activeProject.name}
                          onChange={(e) => setActiveProject({ ...activeProject, name: e.target.value })}
                          className="bg-slate-950/60 border-slate-800 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-300">{t("projects.projectDescription", undefined, "Project Description")}</Label>
                        <Input
                          value={activeProject.description || ""}
                          onChange={(e) => setActiveProject({ ...activeProject, description: e.target.value })}
                          className="bg-slate-950/60 border-slate-800 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-300">{t("projects.tags", undefined, "Tags")}</Label>
                        <Input
                          value={(activeProject.tags || []).join(", ")}
                          onChange={(e) =>
                            setActiveProject({
                              ...activeProject,
                              tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                            })
                          }
                          className="bg-slate-950/60 border-slate-800 text-sm"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t border-slate-800/80 pt-4">
                      <Button
                        onClick={async () => {
                          try {
                            await authFetch(`/api/projects/${activeProject.id}`, {
                              method: "PUT",
                              body: JSON.stringify({
                                name: activeProject.name,
                                description: activeProject.description,
                                tags: activeProject.tags,
                              }),
                            });
                            toast.success("Project updated successfully!");
                            loadProjects(activeProject.id);
                          } catch (err: any) {
                            toast.error(err.message || "Failed to update project");
                          }
                        }}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                      >
                        {t("projects.saveProjectBtn", undefined, "Save Changes")}
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Danger Zone */}
                  <Card className="bg-red-500/5 border-red-500/30">
                    <CardHeader>
                      <CardTitle className="text-base text-red-400 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Danger Zone
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-400">
                        Permanently delete this project and all its custom issues. Attached WebDefender apps remain intact.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="text-xs bg-red-600 hover:bg-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        {t("projects.deleteProject", undefined, "Delete Project")}
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* DIALOGS */}
      {/* ========================================================================= */}

      {/* 1. Create Project Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-cyan-400" />
              {t("projects.createNewProject", undefined, "Create New Project")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Organize your WebDefender apps, security issues, and live traffic threats.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProject} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">{t("projects.projectName", undefined, "Project Name")}</Label>
              <Input
                required
                placeholder={t("projects.projectNamePlaceholder", undefined, "e.g., Production Core")}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="bg-slate-950/60 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">{t("projects.projectDescription", undefined, "Description")}</Label>
              <Input
                placeholder={t("projects.projectDescriptionPlaceholder", undefined, "Describe the purpose of this project...")}
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="bg-slate-950/60 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">{t("projects.tags", undefined, "Tags")}</Label>
              <Input
                placeholder={t("projects.tagsPlaceholder", undefined, "prod, api, web")}
                value={newProjectTags}
                onChange={(e) => setNewProjectTags(e.target.value)}
                className="bg-slate-950/60 border-slate-800 text-sm"
              />
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                className="border-slate-800 text-slate-300 text-xs"
              >
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isCreatingProject || !newProjectName.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              >
                {isCreatingProject ? t("projects.saving", undefined, "Creating...") : t("projects.createProjectBtn", undefined, "Create Project")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Attach Existing App Dialog */}
      <Dialog open={isAttachAppModalOpen} onOpenChange={setIsAttachAppModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              {t("projects.apps.attachExistingApp", undefined, "Attach Existing WebDefender App")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Select one of your existing WebDefender applications to attach to this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {unattachedApps.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-950 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  {t("projects.apps.noAvailableApps", undefined, "All your WebDefender apps are already attached to this project.")}
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsAttachAppModalOpen(false);
                    setIsCreateAppModalOpen(true);
                  }}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                >
                  Create New App Instead
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">
                  {t("projects.apps.selectAppToAttach", undefined, "Choose an app to attach")}
                </Label>
                <Select value={selectedAppToAttach} onValueChange={setSelectedAppToAttach}>
                  <SelectTrigger className="bg-slate-950/60 border-slate-800 text-sm">
                    <SelectValue placeholder={t("projects.apps.chooseApp", undefined, "Choose an app...")} />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-sm">
                    {unattachedApps.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name} ({app.block_mode_enabled ? "Active Blocking" : "Detection Only"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAttachAppModalOpen(false)}
              className="border-slate-800 text-slate-300 text-xs"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              disabled={!selectedAppToAttach || isAttachingApp}
              onClick={handleAttachApp}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
            >
              {isAttachingApp ? "Attaching..." : t("projects.apps.attachBtn", undefined, "Attach to Project")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Create & Attach App Dialog */}
      <Dialog open={isCreateAppModalOpen} onOpenChange={setIsCreateAppModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              {t("projects.apps.createAndAttach", undefined, "Create & Attach WebDefender App")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Create a new WebDefender application protection endpoint and attach it directly to this project.
            </DialogDescription>
          </DialogHeader>

          {createdAppApiKey ? (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
                <p className="font-semibold">App created and attached successfully!</p>
                <p>Copy your new WebDefender API key below. You will not be able to see it again.</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 font-mono text-xs">
                <span className="truncate text-cyan-300">{createdAppApiKey}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (navigator?.clipboard?.writeText) {
                      navigator.clipboard
                        .writeText(createdAppApiKey)
                        .catch(() => {});
                    }
                    toast.success("API key copied to clipboard");
                  }}
                  className="border-slate-800 text-slate-300 h-7 text-xs"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </Button>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => {
                    setIsCreateAppModalOpen(false);
                    setCreatedAppApiKey(null);
                    setNewAppName("");
                  }}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs w-full"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateAndAttachApp} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">App Name</Label>
                <Input
                  required
                  placeholder="e.g., User Auth Service"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  className="bg-slate-950/60 border-slate-800 text-sm"
                />
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateAppModalOpen(false)}
                  className="border-slate-800 text-slate-300 text-xs"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingApp || !newAppName.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                >
                  {isCreatingApp ? "Creating..." : "Create & Attach"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 4. Create Issue Dialog */}
      <Dialog open={isCreateIssueModalOpen} onOpenChange={setIsCreateIssueModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              {t("projects.issues.createIssue", undefined, "Create Project Issue")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Add a tracked task, security objective, or bug to this project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateIssue} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">{t("projects.issues.issueTitle", undefined, "Title")}</Label>
              <Input
                required
                placeholder="e.g., Enable rate limiting on login endpoint"
                value={newIssueTitle}
                onChange={(e) => setNewIssueTitle(e.target.value)}
                className="bg-slate-950/60 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">{t("projects.issues.issueDescription", undefined, "Description")}</Label>
              <Input
                placeholder="Details, steps to reproduce or remediation details..."
                value={newIssueDesc}
                onChange={(e) => setNewIssueDesc(e.target.value)}
                className="bg-slate-950/60 border-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Severity</Label>
                <Select
                  value={newIssueSeverity}
                  onValueChange={(val: any) => setNewIssueSeverity(val)}
                >
                  <SelectTrigger className="bg-slate-950/60 border-slate-800 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Category</Label>
                <Select
                  value={newIssueCategory}
                  onValueChange={(val: any) => setNewIssueCategory(val)}
                >
                  <SelectTrigger className="bg-slate-950/60 border-slate-800 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="config">Configuration</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="enhancement">Enhancement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeProject?.attached_apps && activeProject.attached_apps.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">{t("projects.issues.targetApp", undefined, "Target App (Optional)")}</Label>
                <Select value={newIssueTargetApp} onValueChange={setNewIssueTargetApp}>
                  <SelectTrigger className="bg-slate-950/60 border-slate-800 text-xs">
                    <SelectValue placeholder="None / General Project" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                    <SelectItem value="none">None / General</SelectItem>
                    {activeProject.attached_apps.map((app: any) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateIssueModalOpen(false)}
                className="border-slate-800 text-slate-300 text-xs"
              >
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isCreatingIssue || !newIssueTitle.trim()}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
              >
                {isCreatingIssue ? "Creating..." : t("projects.issues.createIssue", undefined, "Create Issue")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Delete Project Confirmation Dialog */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              {t("projects.deleteProject", undefined, "Delete Project")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              {t("projects.deleteProjectConfirm", { name: activeProject?.name || "" }, `Are you sure you want to delete "${activeProject?.name}"? This action cannot be undone.`)}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              className="border-slate-800 text-slate-300 text-xs"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingProject}
              onClick={handleDeleteProject}
              className="bg-red-600 hover:bg-red-500 text-white text-xs"
            >
              {isDeletingProject ? t("projects.deleting", undefined, "Deleting...") : t("common.delete", undefined, "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
