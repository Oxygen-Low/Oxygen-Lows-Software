import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FolderGit2,
  Plus,
  Users,
  MessageSquare,
  FileCode,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  Trash2,
  Edit3,
  Copy,
  Check,
  RefreshCw,
  Search,
  Upload,
  ArrowLeft,
  Share2,
  Clock,
  Shield,
  AlertTriangle,
  Send,
  Eye,
  Settings,
  UserMinus,
  LogOut,
  FolderOpen,
  File,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { storage, StorageFileItem } from "@/lib/storage";
import { supabase } from "@/lib/db";
import { toast } from "sonner";

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  invite_code: string;
  role: "owner" | "collaborator";
  member_count: number;
  file_count: number;
  owner_name: string;
  created_at: string;
  updated_at: string;
  members?: WorkspaceMember[];
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  role: "owner" | "collaborator";
  joined_at: string;
}

export interface WorkspaceFile {
  id: string;
  workspace_id: string;
  name: string;
  size: number;
  mime_type: string;
  created_by: string;
  created_by_username: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceComment {
  id: string;
  workspace_id: string;
  file_id: string | null;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
}

export interface WorkspaceActivity {
  id: string;
  workspace_id: string;
  user_id: string;
  username: string;
  action: string;
  details?: string;
  created_at: string;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getFileIcon(fileName: string, mime: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-emerald-400" />;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) {
    return <Music className="w-5 h-5 text-amber-400" />;
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) {
    return <Video className="w-5 h-5 text-purple-400" />;
  }
  if (["ts", "tsx", "js", "jsx", "html", "css", "json", "py", "rs", "c", "cpp"].includes(ext)) {
    return <FileCode className="w-5 h-5 text-cyan-400" />;
  }
  if (["md", "txt", "log", "doc", "docx", "pdf"].includes(ext)) {
    return <FileText className="w-5 h-5 text-blue-400" />;
  }
  return <File className="w-5 h-5 text-slate-400" />;
}

export function WorkspacesApp() {
  const { session } = useAuth();
  const token = session?.access_token;
  const currentUserId = session?.user?.id ? String(session.user.id) : null;
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // Navigation & view states
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [membersOpen, setMembersOpen] = useState(false);
  const [membersList, setMembersList] = useState<WorkspaceMember[]>([]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  // Files state
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState("");

  // Add Files Modal
  const [addFilesOpen, setAddFilesOpen] = useState(false);
  const [personalFiles, setPersonalFiles] = useState<StorageFileItem[]>([]);
  const [personalFilesLoading, setPersonalFilesLoading] = useState(false);
  const [selectedStorageFiles, setSelectedStorageFiles] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Editor Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<WorkspaceFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorInitialContent, setEditorInitialContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState("");
  const [conflictPromptOpen, setConflictPromptOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");

  // Per-file Comments
  const [fileCommentsOpen, setFileCommentsOpen] = useState(false);
  const [activeCommentFile, setActiveCommentFile] = useState<WorkspaceFile | null>(null);
  const [fileComments, setFileComments] = useState<WorkspaceComment[]>([]);
  const [fileCommentInput, setFileCommentInput] = useState("");
  const [sendingFileComment, setSendingFileComment] = useState(false);

  // Workspace-wide Discussions & Activities
  const [discussionComments, setDiscussionComments] = useState<WorkspaceComment[]>([]);
  const [discussionInput, setDiscussionInput] = useState("");
  const [sendingDiscussion, setSendingDiscussion] = useState(false);
  const [activities, setActivities] = useState<WorkspaceActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [copiedInvite, setCopiedInvite] = useState(false);

  // 1. Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data) {
        setWorkspaces(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // 2. Fetch specific workspace details, files, and discussions
  const loadWorkspaceDetails = useCallback(
    async (workspaceId: string) => {
      if (!token) return;
      setFilesLoading(true);
      try {
        const [wsRes, filesRes, commentsRes, actsRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/workspaces/${workspaceId}/files`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/workspaces/${workspaceId}/comments?fileId=general`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/workspaces/${workspaceId}/activities`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const wsJson = await wsRes.json();
        const filesJson = await filesRes.json();
        const commentsJson = await commentsRes.json();
        const actsJson = await actsRes.json();

        if (wsJson.data) {
          setSelectedWorkspace(wsJson.data);
          setMembersList(wsJson.data.members || []);
        }
        if (filesJson.data) {
          setFiles(filesJson.data);
        }
        if (commentsJson.data) {
          setDiscussionComments(commentsJson.data);
        }
        if (actsJson.data) {
          setActivities(actsJson.data);
        }
      } catch (err) {
        console.error("Error loading workspace data:", err);
        toast.error(t("workspaces.errorLoading", undefined, "Failed to load workspace data"));
      } finally {
        setFilesLoading(false);
      }
    },
    [token, t],
  );

  // 3. Realtime SSE subscription
  useEffect(() => {
    if (!selectedWorkspace?.id) return;
    const currentWsId = selectedWorkspace.id;

    const channel = supabase
      .channel(`workspace_${currentWsId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_files" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new?.workspace_id === currentWsId) {
            setFiles((prev) => {
              if (prev.some((f) => f.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === "UPDATE" && payload.new?.workspace_id === currentWsId) {
            setFiles((prev) =>
              prev.map((f) => (f.id === payload.new.id ? { ...f, ...payload.new } : f)),
            );
          } else if (payload.eventType === "DELETE" && payload.old) {
            setFiles((prev) => prev.filter((f) => f.id !== payload.old.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_comments" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new?.workspace_id === currentWsId) {
            if (!payload.new.file_id) {
              setDiscussionComments((prev) => {
                if (prev.some((c) => c.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
            } else if (activeCommentFile && payload.new.file_id === activeCommentFile.id) {
              setFileComments((prev) => {
                if (prev.some((c) => c.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
            }
          } else if (payload.eventType === "DELETE" && payload.old) {
            setDiscussionComments((prev) => prev.filter((c) => c.id !== payload.old.id));
            setFileComments((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_activities" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new?.workspace_id === currentWsId) {
            setActivities((prev) => [payload.new, ...prev.slice(0, 49)]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedWorkspace?.id, activeCommentFile]);

  // 4. Handle auto-join from URL parameter `?invite=<code>`
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("invite");
    if (!code) return;

    if (!token) {
      const returnUrl = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/auth?returnTo=${returnUrl}`);
      return;
    }

    const autoJoin = async () => {
      try {
        const res = await fetch(`/api/workspaces/invite/${code}/join`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.data?.workspaceId) {
          toast.success(
            json.data.alreadyMember
              ? t("workspaces.alreadyMemberToast", undefined, "Opened your workspace")
              : t("workspaces.joinSuccessToast", undefined, "Successfully joined workspace!"),
          );
          await fetchWorkspaces();
          await loadWorkspaceDetails(json.data.workspaceId);
          // Clean URL param
          navigate(location.pathname, { replace: true });
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch (e: any) {
        toast.error(e.message || "Failed to join workspace");
      }
    };

    autoJoin();
  }, [location.search, token, navigate, location.pathname, t, fetchWorkspaces, loadWorkspaceDetails]);

  // Create Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || !token) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newWsName.trim(),
          description: newWsDesc.trim(),
        }),
      });
      const json = await res.json();
      if (json.data) {
        toast.success(t("workspaces.createdSuccess", undefined, "Workspace created successfully!"));
        setNewWsName("");
        setNewWsDesc("");
        setCreateOpen(false);
        await fetchWorkspaces();
        await loadWorkspaceDetails(json.data.id);
      } else {
        toast.error(json.error || "Failed to create workspace");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setCreating(false);
    }
  };

  // Join via manual code
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !token) return;
    setJoining(true);
    try {
      const clean = joinCode.trim();
      const res = await fetch(`/api/workspaces/invite/${clean}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data?.workspaceId) {
        toast.success(t("workspaces.joinSuccessToast", undefined, "Successfully joined workspace!"));
        setJoinCode("");
        setJoinOpen(false);
        await fetchWorkspaces();
        await loadWorkspaceDetails(json.data.workspaceId);
      } else {
        toast.error(json.error || "Invalid invite code");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  // Copy Invite Link
  const handleCopyInviteLink = () => {
    if (!selectedWorkspace) return;
    const url = `${window.location.origin}/apps/workspaces?invite=${selectedWorkspace.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    toast.success(t("workspaces.inviteCopied", undefined, "Invite link copied to clipboard!"));
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  // Regenerate Invite Link
  const handleRegenerateInvite = async () => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/regenerate-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data?.invite_code) {
        setSelectedWorkspace((prev) =>
          prev ? { ...prev, invite_code: json.data.invite_code } : null,
        );
        toast.success(t("workspaces.inviteRegenerated", undefined, "Generated new invite code!"));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate invite");
    }
  };

  // Delete Workspace
  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(t("workspaces.deletedSuccess", undefined, "Workspace deleted."));
        setSelectedWorkspace(null);
        setDeleteConfirmOpen(false);
        fetchWorkspaces();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete workspace");
    }
  };

  // Leave Workspace
  const handleLeaveWorkspace = async () => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (res.ok) {
        toast.success(t("workspaces.leftSuccess", undefined, "Left workspace."));
        setSelectedWorkspace(null);
        setLeaveConfirmOpen(false);
        fetchWorkspaces();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to leave workspace");
    }
  };

  // Remove Collaborator
  const handleRemoveMember = async (memberUserId: string) => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/members/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: memberUserId }),
      });
      if (res.ok) {
        toast.success(t("workspaces.memberRemoved", undefined, "Member removed from workspace."));
        setMembersList((prev) => prev.filter((m) => m.user_id !== memberUserId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  };

  // Open "Add Files" modal and fetch personal storage files
  const handleOpenAddFiles = async () => {
    setAddFilesOpen(true);
    setSelectedStorageFiles([]);
    if (!currentUserId) return;
    setPersonalFilesLoading(true);
    try {
      const { data, error } = await storage.from("Storage").list(currentUserId);
      if (data && !error) {
        setPersonalFiles(data.filter((item) => item.id !== null));
      }
    } catch (err) {
      console.error("Failed to load personal storage files:", err);
    } finally {
      setPersonalFilesLoading(false);
    }
  };

  // Import selected personal storage files
  const handleImportPersonalFiles = async () => {
    if (!selectedWorkspace || !token || selectedStorageFiles.length === 0) return;
    setImporting(true);
    try {
      let importedCount = 0;
      for (const filePath of selectedStorageFiles) {
        const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/import-file`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourcePath: filePath }),
        });
        const json = await res.json();
        if (json.data) {
          importedCount++;
          setFiles((prev) => [json.data, ...prev]);
        } else if (json.error) {
          toast.error(json.error);
        }
      }
      if (importedCount > 0) {
        toast.success(
          t(
            "workspaces.importedCount",
            { count: importedCount },
            `Imported ${importedCount} file(s) into workspace.`,
          ),
        );
        setAddFilesOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Direct File Upload to Workspace
  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedWorkspace || !token) return;

    setUploading(true);
    try {
      let uploadedCount = 0;
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const json = await res.json();
        if (json.data) {
          uploadedCount++;
          setFiles((prev) => [json.data, ...prev]);
        } else if (json.error) {
          toast.error(json.error);
        }
      }
      if (uploadedCount > 0) {
        toast.success(
          t(
            "workspaces.uploadedCount",
            { count: uploadedCount },
            `Uploaded ${uploadedCount} file(s) to workspace.`,
          ),
        );
        setAddFilesOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
    }
  };

  // Open file in in-browser editor
  const handleOpenFileEditor = async (file: WorkspaceFile) => {
    if (!selectedWorkspace || !token) return;
    setEditingFile(file);
    setEditorLoading(true);
    setEditorOpen(true);
    setEditorTab("edit");
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/files/${file.id}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = await res.json();
      if (json.data) {
        setEditorContent(json.data.content);
        setEditorInitialContent(json.data.content);
        setLastKnownUpdatedAt(json.data.file.updated_at);
      } else {
        toast.error(json.error || "Cannot view binary or large file in editor.");
        setEditorOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load file content");
      setEditorOpen(false);
    } finally {
      setEditorLoading(false);
    }
  };

  // Save file content
  const handleSaveFileContent = async (force = false) => {
    if (!selectedWorkspace || !editingFile || !token) return;
    setEditorSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/files/${editingFile.id}/content`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: editorContent,
            lastKnownUpdatedAt,
            force,
          }),
        },
      );

      const json = await res.json();
      if (res.status === 409 && json.conflict) {
        setConflictPromptOpen(true);
        return;
      }

      if (json.data) {
        toast.success(t("workspaces.fileSaved", undefined, "File saved successfully!"));
        setLastKnownUpdatedAt(json.data.updated_at);
        setEditorInitialContent(editorContent);
        setConflictPromptOpen(false);
        setFiles((prev) =>
          prev.map((f) => (f.id === editingFile.id ? { ...f, ...json.data } : f)),
        );
      } else {
        toast.error(json.error || "Failed to save file");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error while saving");
    } finally {
      setEditorSaving(false);
    }
  };

  // Download File
  const handleDownloadFile = (file: WorkspaceFile) => {
    if (!selectedWorkspace || !token) return;
    const downloadUrl = `/api/workspaces/${selectedWorkspace.id}/files/${file.id}/download?token=${token}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete File
  const handleDeleteFile = async (file: WorkspaceFile) => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/files/${file.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        toast.success(t("workspaces.fileDeleted", undefined, "File deleted from workspace."));
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete file");
    }
  };

  // Open file comments
  const handleOpenFileComments = async (file: WorkspaceFile) => {
    if (!selectedWorkspace || !token) return;
    setActiveCommentFile(file);
    setFileCommentsOpen(true);
    setFileCommentInput("");
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/comments?fileId=${file.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = await res.json();
      if (json.data) {
        setFileComments(json.data);
      }
    } catch (err) {
      console.error("Failed to load file comments:", err);
    }
  };

  // Post file comment
  const handleSendFileComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !activeCommentFile || !fileCommentInput.trim() || !token) return;
    setSendingFileComment(true);
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: activeCommentFile.id,
          content: fileCommentInput.trim(),
        }),
      });
      const json = await res.json();
      if (json.data) {
        setFileComments((prev) => [...prev, json.data]);
        setFileCommentInput("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post comment");
    } finally {
      setSendingFileComment(false);
    }
  };

  // Post discussion message
  const handleSendDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !discussionInput.trim() || !token) return;
    setSendingDiscussion(true);
    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileId: null,
          content: discussionInput.trim(),
        }),
      });
      const json = await res.json();
      if (json.data) {
        setDiscussionComments((prev) => [...prev, json.data]);
        setDiscussionInput("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to post message");
    } finally {
      setSendingDiscussion(false);
    }
  };

  // Delete a comment
  const handleDeleteComment = async (commentId: string) => {
    if (!selectedWorkspace || !token) return;
    try {
      const res = await fetch(
        `/api/workspaces/${selectedWorkspace.id}/comments/${commentId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        setDiscussionComments((prev) => prev.filter((c) => c.id !== commentId));
        setFileComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete comment");
    }
  };

  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return workspaces;
    const q = searchQuery.toLowerCase();
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q)) ||
        w.owner_name.toLowerCase().includes(q),
    );
  }, [workspaces, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return files;
    const q = fileSearch.toLowerCase();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.created_by_username.toLowerCase().includes(q),
    );
  }, [files, fileSearch]);

  // If viewing a single workspace
  if (selectedWorkspace) {
    const isOwner = selectedWorkspace.role === "owner";

    return (
      <div className="flex flex-col h-full space-y-4">
        {/* Workspace Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedWorkspace(null);
                fetchWorkspaces();
              }}
              title={t("workspaces.backToWorkspaces", undefined, "Back to Workspaces")}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  {selectedWorkspace.name}
                </h2>
                <Badge
                  variant="outline"
                  className={
                    isOwner
                      ? "border-cyan-500/50 text-cyan-400 bg-cyan-950/20"
                      : "border-slate-600 text-slate-300 bg-slate-800/40"
                  }
                >
                  {isOwner
                    ? t("workspaces.owner", undefined, "Owner")
                    : t("workspaces.collaborator", undefined, "Collaborator")}
                </Badge>
              </div>
              {selectedWorkspace.description && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedWorkspace.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInviteLink}
              className="border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white gap-1.5"
            >
              {copiedInvite ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Share2 className="w-4 h-4 text-cyan-400" />
              )}
              {copiedInvite
                ? t("workspaces.copied", undefined, "Copied!")
                : t("workspaces.copyInviteLink", undefined, "Invite Link")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMembersOpen(true)}
              className="border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white gap-1.5"
            >
              <Users className="w-4 h-4 text-cyan-400" />
              {t("workspaces.members", undefined, "Members")} (
              {membersList.length || selectedWorkspace.member_count})
            </Button>

            {isOwner ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="gap-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300"
              >
                <Trash2 className="w-4 h-4" />
                {t("workspaces.deleteWorkspace", undefined, "Delete Workspace")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLeaveConfirmOpen(true)}
                className="gap-1.5 border-red-900/40 hover:bg-red-950/30 text-red-400"
              >
                <LogOut className="w-4 h-4" />
                {t("workspaces.leaveWorkspace", undefined, "Leave")}
              </Button>
            )}
          </div>
        </div>

        {/* Workspace Body Tabs: Files vs Discussions/Activity */}
        <Tabs defaultValue="files" className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-slate-900 border border-slate-800 self-start">
            <TabsTrigger value="files" className="gap-2">
              <FolderGit2 className="w-4 h-4 text-cyan-400" />
              {t("workspaces.filesTab", undefined, "Project Files")} ({files.length})
            </TabsTrigger>
            <TabsTrigger value="discussion" className="gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              {t("workspaces.discussionTab", undefined, "Team Discussion & Activity")}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FILES */}
          <TabsContent value="files" className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                <Input
                  placeholder={t("workspaces.searchFiles", undefined, "Search project files...")}
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="pl-9 bg-slate-900/80 border-slate-800 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadWorkspaceDetails(selectedWorkspace.id)}
                  disabled={filesLoading}
                  className="border-slate-800 hover:bg-slate-800 text-slate-400"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${filesLoading ? "animate-spin" : ""}`}
                  />
                </Button>

                <Button
                  onClick={handleOpenAddFiles}
                  size="sm"
                  className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {t("workspaces.addFiles", undefined, "Add Files")}
                </Button>
              </div>
            </div>

            {/* Files List Table */}
            <div className="flex-1 border border-slate-800 rounded-lg bg-slate-950/40 overflow-hidden flex flex-col">
              {filesLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                  {t("workspaces.loadingFiles", undefined, "Loading files...")}
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
                  <FolderOpen className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-slate-300 font-medium">
                    {fileSearch
                      ? t("workspaces.noMatchingFiles", undefined, "No files matching your search")
                      : t("workspaces.noFilesYet", undefined, "No files in this workspace yet")}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                    {t(
                      "workspaces.addFilesPrompt",
                      undefined,
                      "Import files from your personal storage or upload fresh assets to collaborate with your team.",
                    )}
                  </p>
                  <Button
                    onClick={handleOpenAddFiles}
                    size="sm"
                    className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {t("workspaces.addFiles", undefined, "Add Files")}
                  </Button>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-xs text-slate-400 font-medium">
                        <th className="py-2.5 px-4">{t("workspaces.fileName", undefined, "Name")}</th>
                        <th className="py-2.5 px-4 hidden sm:table-cell">
                          {t("workspaces.fileSize", undefined, "Size")}
                        </th>
                        <th className="py-2.5 px-4 hidden md:table-cell">
                          {t("workspaces.updated", undefined, "Updated")}
                        </th>
                        <th className="py-2.5 px-4 hidden lg:table-cell">
                          {t("workspaces.author", undefined, "By")}
                        </th>
                        <th className="py-2.5 px-4 text-right">
                          {t("workspaces.actions", undefined, "Actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredFiles.map((file) => (
                        <tr
                          key={file.id}
                          className="hover:bg-slate-900/40 transition group"
                        >
                          <td className="py-2.5 px-4 font-medium text-slate-200">
                            <div className="flex items-center gap-2.5">
                              {getFileIcon(file.name, file.mime_type)}
                              <span className="truncate max-w-[180px] sm:max-w-xs">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-400 hidden sm:table-cell">
                            {formatBytes(file.size)}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-400 hidden md:table-cell">
                            {new Date(file.updated_at).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-400 hidden lg:table-cell">
                            {file.created_by_username}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenFileEditor(file)}
                                title={t("workspaces.editView", undefined, "Edit / View")}
                                className="h-8 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenFileComments(file)}
                                title={t("workspaces.comments", undefined, "Comments")}
                                className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadFile(file)}
                                title={t("workspaces.download", undefined, "Download")}
                                className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
                              >
                                <Download className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteFile(file)}
                                title={t("workspaces.deleteFile", undefined, "Delete file")}
                                className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: DISCUSSION & ACTIVITIES */}
          <TabsContent
            value="discussion"
            className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 pt-3"
          >
            {/* Left: General Chat / Discussion */}
            <div className="flex-1 flex flex-col border border-slate-800 rounded-lg bg-slate-950/40 p-4 min-h-0">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-semibold text-sm text-slate-200">
                    {t("workspaces.discussionBoard", undefined, "Team Discussion")}
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  {discussionComments.length} {t("workspaces.messages", undefined, "messages")}
                </span>
              </div>

              {/* Discussion messages list */}
              <ScrollArea className="flex-1 py-3 pr-2">
                {discussionComments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 text-xs">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                    {t(
                      "workspaces.noDiscussionYet",
                      undefined,
                      "No messages yet. Start the conversation with your team!",
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {discussionComments.map((comm) => (
                      <div
                        key={comm.id}
                        className="flex items-start gap-2.5 group text-sm"
                      >
                        <div className="w-7 h-7 rounded-full bg-cyan-900/50 border border-cyan-700/50 flex items-center justify-center font-bold text-xs text-cyan-200 shrink-0">
                          {comm.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-xs text-slate-300">
                              {comm.username}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">
                                {new Date(comm.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {(comm.user_id === currentUserId || isOwner) && (
                                <button
                                  onClick={() => handleDeleteComment(comm.id)}
                                  className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                                  title={t("workspaces.deleteComment", undefined, "Delete comment")}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-200 whitespace-pre-wrap">
                            {comm.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <form onSubmit={handleSendDiscussion} className="flex gap-2 pt-2 border-t border-slate-800">
                <Input
                  placeholder={t("workspaces.typeDiscussion", undefined, "Share an update or comment...")}
                  value={discussionInput}
                  onChange={(e) => setDiscussionInput(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-sm"
                />
                <Button
                  type="submit"
                  disabled={sendingDiscussion || !discussionInput.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>

            {/* Right: Activity Log */}
            <div className="w-full md:w-80 border border-slate-800 rounded-lg bg-slate-950/40 p-4 flex flex-col min-h-0">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-sm text-slate-200">
                  {t("workspaces.activityFeed", undefined, "Project Activity")}
                </h3>
              </div>

              <ScrollArea className="flex-1 py-3 pr-2">
                {activities.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    {t("workspaces.noActivities", undefined, "No recent project activities")}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {activities.map((act) => (
                      <div
                        key={act.id}
                        className="text-xs bg-slate-900/40 border border-slate-800/60 rounded p-2"
                      >
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="font-medium text-slate-300">
                            {act.username}
                          </span>
                          <span className="text-[10px]">
                            {new Date(act.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-300 font-sans">
                          {act.details || act.action}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        {/* MODAL: ADD FILES (Import from Personal Storage OR Upload Fresh) */}
        <Dialog open={addFilesOpen} onOpenChange={setAddFilesOpen}>
          <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-cyan-400" />
                {t("workspaces.addFilesToProject", undefined, "Add Files to Project")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.addFilesDesc",
                  undefined,
                  "Import files copied from your encrypted personal storage, or upload directly from your device.",
                )}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="storage" className="w-full">
              <TabsList className="bg-slate-900 border border-slate-800 w-full grid grid-cols-2">
                <TabsTrigger value="storage" className="gap-2">
                  <FolderOpen className="w-4 h-4 text-cyan-400" />
                  {t("workspaces.importFromStorage", undefined, "Import from My Storage")}
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  {t("workspaces.uploadFromDevice", undefined, "Upload from Device")}
                </TabsTrigger>
              </TabsList>

              {/* Subtab: Personal Storage */}
              <TabsContent value="storage" className="space-y-3 pt-3">
                <div className="border border-slate-800 rounded-md p-2 bg-slate-900/50 max-h-64 overflow-y-auto">
                  {personalFilesLoading ? (
                    <div className="flex items-center justify-center p-8 text-slate-500 text-xs">
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      {t("workspaces.loadingStorage", undefined, "Loading your personal files...")}
                    </div>
                  ) : personalFiles.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      {t("workspaces.noPersonalFiles", undefined, "No personal storage files found.")}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {personalFiles.map((file) => {
                        const isSelected = selectedStorageFiles.includes(file.name);
                        return (
                          <div
                            key={file.name}
                            onClick={() => {
                              setSelectedStorageFiles((prev) =>
                                isSelected
                                  ? prev.filter((n) => n !== file.name)
                                  : [...prev, file.name],
                              );
                            }}
                            className={`flex items-center justify-between p-2 rounded cursor-pointer transition text-xs ${
                              isSelected
                                ? "bg-cyan-950/60 border border-cyan-700/60 text-cyan-200"
                                : "hover:bg-slate-800/60 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {getFileIcon(file.name, file.metadata?.mimetype || "")}
                              <span className="font-medium truncate">{file.name}</span>
                            </div>
                            <span className="text-slate-500 text-[11px] shrink-0 ml-2">
                              {formatBytes(file.metadata?.size || 0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>
                    {selectedStorageFiles.length}{" "}
                    {t("workspaces.filesSelected", undefined, "file(s) selected")}
                  </span>
                  <Button
                    onClick={handleImportPersonalFiles}
                    disabled={importing || selectedStorageFiles.length === 0}
                    size="sm"
                    className="bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    {importing && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    {t("workspaces.copyIntoWorkspace", undefined, "Copy into Workspace")}
                  </Button>
                </div>
              </TabsContent>

              {/* Subtab: Direct Upload */}
              <TabsContent value="upload" className="space-y-4 pt-3">
                <div
                  onClick={() => uploadFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-500/80 rounded-lg p-8 text-center cursor-pointer transition bg-slate-900/30 flex flex-col items-center justify-center"
                >
                  <Upload className="w-10 h-10 text-cyan-400 mb-2 opacity-80" />
                  <p className="text-sm font-medium text-slate-200">
                    {uploading
                      ? t("workspaces.uploadingFiles", undefined, "Uploading files...")
                      : t("workspaces.dropFilesPrompt", undefined, "Click to choose files from device")}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("workspaces.uploadQuotaNote", undefined, "Counts against workspace owner quota")}
                  </p>
                  <input
                    ref={uploadFileInputRef}
                    type="file"
                    multiple
                    onChange={handleDirectUpload}
                    className="hidden"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* MODAL: IN-APP FILE EDITOR */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-4xl h-[85vh] flex flex-col bg-slate-950 border-slate-800 text-slate-200 p-0 overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2 truncate">
                {editingFile && getFileIcon(editingFile.name, editingFile.mime_type)}
                <span className="font-semibold text-sm text-slate-100 truncate">
                  {editingFile?.name}
                </span>
                {editingFile && (
                  <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                    {formatBytes(editingFile.size)}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingFile?.name.endsWith(".md") && (
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 text-xs">
                    <button
                      onClick={() => setEditorTab("edit")}
                      className={`px-2 py-1 rounded ${
                        editorTab === "edit"
                          ? "bg-cyan-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {t("workspaces.edit", undefined, "Edit")}
                    </button>
                    <button
                      onClick={() => setEditorTab("preview")}
                      className={`px-2 py-1 rounded ${
                        editorTab === "preview"
                          ? "bg-cyan-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {t("workspaces.preview", undefined, "Preview")}
                    </button>
                  </div>
                )}

                <Button
                  onClick={() => handleSaveFileContent(false)}
                  disabled={editorSaving || editorLoading}
                  size="sm"
                  className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 h-8"
                >
                  {editorSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Edit3 className="w-3.5 h-3.5" />
                  )}
                  {t("workspaces.save", undefined, "Save")}
                </Button>
              </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 p-4 flex flex-col min-h-0 bg-slate-950">
              {editorLoading ? (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                  {t("workspaces.loadingEditor", undefined, "Loading file content...")}
                </div>
              ) : editorTab === "preview" ? (
                <ScrollArea className="flex-1 border border-slate-800 rounded-md p-4 bg-slate-900/30 font-sans text-sm text-slate-200">
                  <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                    {editorContent}
                  </div>
                </ScrollArea>
              ) : (
                <Textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder={t("workspaces.editorPlaceholder", undefined, "Enter file content here...")}
                  className="flex-1 font-mono text-xs sm:text-sm bg-slate-900/70 border-slate-800 text-slate-100 resize-none focus-visible:ring-cyan-500/50"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* MODAL: CONFLICT RESOLUTION ALERT */}
        <AlertDialog open={conflictPromptOpen} onOpenChange={setConflictPromptOpen}>
          <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                {t("workspaces.conflictTitle", undefined, "Editing Conflict Detected")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.conflictDesc",
                  undefined,
                  "Another collaborator saved changes to this file while you were editing. Would you like to overwrite their changes, or discard your unsaved edits?",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setConflictPromptOpen(false);
                  if (editingFile) handleOpenFileEditor(editingFile);
                }}
                className="bg-slate-800 border-slate-700 text-slate-300"
              >
                {t("workspaces.reloadLatest", undefined, "Reload Latest")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleSaveFileContent(true)}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                {t("workspaces.overwriteAnyway", undefined, "Overwrite Anyway")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MODAL: PER-FILE COMMENTS */}
        <Dialog open={fileCommentsOpen} onOpenChange={setFileCommentsOpen}>
          <DialogContent className="max-w-md h-[70vh] flex flex-col bg-slate-950 border-slate-800 text-slate-200 p-4">
            <DialogHeader className="pb-3 border-b border-slate-800">
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                {t("workspaces.commentsFor", undefined, "Comments for")}{" "}
                <span className="text-cyan-300 truncate max-w-[200px]">
                  {activeCommentFile?.name}
                </span>
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1 py-3 pr-2">
              {fileComments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 text-xs">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                  {t(
                    "workspaces.noFileCommentsYet",
                    undefined,
                    "No comments on this file yet. Leave feedback for collaborators.",
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {fileComments.map((comm) => (
                    <div
                      key={comm.id}
                      className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-xs group"
                    >
                      <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="font-semibold text-slate-200">
                          {comm.username}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]">
                            {new Date(comm.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {(comm.user_id === currentUserId || isOwner) && (
                            <button
                              onClick={() => handleDeleteComment(comm.id)}
                              className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {comm.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleSendFileComment} className="flex gap-2 pt-2 border-t border-slate-800">
              <Input
                placeholder={t("workspaces.addFileComment", undefined, "Write a comment...")}
                value={fileCommentInput}
                onChange={(e) => setFileCommentInput(e.target.value)}
                className="bg-slate-900 border-slate-800 text-xs"
              />
              <Button
                type="submit"
                disabled={sendingFileComment || !fileCommentInput.trim()}
                size="sm"
                className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* MODAL: MEMBERS MANAGEMENT */}
        <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
          <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                {t("workspaces.projectMembers", undefined, "Project Members")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.membersDesc",
                  undefined,
                  "Collaborators can view, modify, and discuss project files.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 max-h-64 overflow-y-auto py-2">
              {membersList.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-cyan-900/50 border border-cyan-700/50 flex items-center justify-center font-bold text-xs text-cyan-200">
                      {m.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-200">
                        {m.username}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {m.role === "owner"
                          ? t("workspaces.owner", undefined, "Owner")
                          : t("workspaces.collaborator", undefined, "Collaborator")}
                      </span>
                    </div>
                  </div>

                  {isOwner && m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30 h-7 px-2 text-[11px]"
                    >
                      <UserMinus className="w-3.5 h-3.5 mr-1" />
                      {t("workspaces.remove", undefined, "Remove")}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {isOwner && (
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateInvite}
                  className="border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                  {t("workspaces.regenerateInvite", undefined, "Reset Invite Code")}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* CONFIRM DELETE DIALOG */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-400">
                {t("workspaces.confirmDeleteTitle", undefined, "Delete Workspace?")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.confirmDeleteDesc",
                  undefined,
                  "This permanently deletes all files, comments, and members inside this project workspace. This action cannot be undone.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">
                {t("common.cancel", undefined, "Cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteWorkspace}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                {t("common.delete", undefined, "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* CONFIRM LEAVE DIALOG */}
        <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
          <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-200">
                {t("workspaces.confirmLeaveTitle", undefined, "Leave Workspace?")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.confirmLeaveDesc",
                  undefined,
                  "You will lose access to the files and discussions in this workspace unless re-invited.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">
                {t("common.cancel", undefined, "Cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeaveWorkspace}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                {t("workspaces.leave", undefined, "Leave")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // DEFAULT DASHBOARD: Workspaces Listing
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FolderGit2 className="w-7 h-7 text-cyan-400" />
            {t("workspaces.title", undefined, "Workspaces")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t(
              "workspaces.subtitle",
              undefined,
              "Collaborative project spaces to share, write, edit, and discuss files with invited team members.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="border-slate-700 hover:bg-slate-800 text-slate-300 gap-1.5"
          >
            <Share2 className="w-4 h-4 text-cyan-400" />
            {t("workspaces.joinWithCode", undefined, "Join with Code")}
          </Button>

          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t("workspaces.newWorkspace", undefined, "New Workspace")}
          </Button>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
          <Input
            placeholder={t("workspaces.searchWorkspaces", undefined, "Search workspaces...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-900/80 border-slate-800 text-sm"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={fetchWorkspaces}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Workspaces Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          {t("workspaces.loading", undefined, "Loading workspaces...")}
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <Card className="bg-slate-950/60 border-slate-800 text-center p-8">
          <CardContent className="flex flex-col items-center justify-center p-0">
            <FolderGit2 className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-base font-medium text-slate-300">
              {searchQuery
                ? t("workspaces.noMatchingWorkspaces", undefined, "No workspaces matching your search.")
                : t("workspaces.noWorkspacesYet", undefined, "You have not joined any workspaces yet.")}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              {t(
                "workspaces.emptyDescription",
                undefined,
                "Create a project workspace or join an existing one using an invite code or link from a collaborator.",
              )}
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t("workspaces.createFirstWorkspace", undefined, "Create Workspace")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkspaces.map((ws) => (
            <Card
              key={ws.id}
              onClick={() => loadWorkspaceDetails(ws.id)}
              className="bg-slate-900/60 border-slate-800 hover:border-cyan-500/50 transition cursor-pointer flex flex-col group relative overflow-hidden"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold text-white group-hover:text-cyan-400 transition truncate">
                    {ws.name}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      ws.role === "owner"
                        ? "border-cyan-500/40 text-cyan-400 bg-cyan-950/20 text-[10px]"
                        : "border-slate-700 text-slate-300 bg-slate-800/40 text-[10px]"
                    }
                  >
                    {ws.role === "owner"
                      ? t("workspaces.owner", undefined, "Owner")
                      : t("workspaces.collaborator", undefined, "Collaborator")}
                  </Badge>
                </div>
                {ws.description && (
                  <CardDescription className="text-xs text-slate-400 line-clamp-2 mt-1">
                    {ws.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="mt-auto pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    {ws.file_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    {ws.member_count}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {new Date(ws.updated_at).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* CREATE WORKSPACE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-200">
          <form onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-cyan-400" />
                {t("workspaces.createWorkspace", undefined, "Create New Workspace")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.createWorkspaceDesc",
                  undefined,
                  "Create a collaborative space for your team to share storage files, edit code, and discuss tasks.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t("workspaces.workspaceNameLabel", undefined, "Workspace Name *")}
                </label>
                <Input
                  required
                  placeholder="e.g. Mobile App Redesign"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t("workspaces.workspaceDescLabel", undefined, "Description (optional)")}
                </label>
                <Textarea
                  placeholder="Briefly describe the purpose of this workspace..."
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  rows={3}
                  className="bg-slate-900 border-slate-800 text-sm resize-none"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={creating || !newWsName.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {creating && <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />}
                {t("workspaces.createButton", undefined, "Create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* JOIN WITH CODE DIALOG */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-200">
          <form onSubmit={handleJoinByCode}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-cyan-400" />
                {t("workspaces.joinTitle", undefined, "Join Workspace")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "workspaces.joinDesc",
                  undefined,
                  "Enter the invite code or token shared with you by the workspace owner.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label className="text-xs font-medium text-slate-300 block mb-1">
                {t("workspaces.inviteCodeLabel", undefined, "Invite Code")}
              </label>
              <Input
                required
                placeholder="e.g. 7f8a9b1c2d3e"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="bg-slate-900 border-slate-800 font-mono text-sm"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setJoinOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {joining && <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />}
                {t("workspaces.joinButton", undefined, "Join")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
