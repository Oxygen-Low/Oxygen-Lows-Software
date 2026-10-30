import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Save,
  Download,
  Upload,
  Trash2,
  Sparkles,
  Cloud,
  FileJson,
  Loader2,
} from "lucide-react";
import type { MusicProject } from "./types";
import { Modal } from "./controls";
import {
  createDemoProject,
  createEmptyProject,
  normalizeProject,
  DEMO_IDS,
} from "./audio/demoProjects";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { MusicT } from "./useMusicT";

interface ProjectsDialogProps {
  t: MusicT;
  open: boolean;
  onClose: () => void;
  project: MusicProject;
  onLoadProject: (p: MusicProject) => void;
}

interface SavedCloudFile {
  name: string;
  fullPath: string;
  updatedAt?: string;
}

export const ProjectsDialog: React.FC<ProjectsDialogProps> = ({
  t,
  open,
  onClose,
  project,
  onLoadProject,
}) => {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [cloudFiles, setCloudFiles] = useState<SavedCloudFile[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [saveName, setSaveName] = useState(project.name);

  const fetchCloudProjects = async () => {
    if (!userId) return;
    setLoadingCloud(true);
    try {
      const folder = `${userId}/music-studio/projects`;
      const res = await storage.from("Storage").list(folder);
      if (!res.error && res.data) {
        const items = res.data
          .filter((item) => item.name.endsWith(".json"))
          .map((item) => ({
            name: item.name.replace(/\.json$/, ""),
            fullPath: `${folder}/${item.name}`,
            updatedAt: item.updated_at || item.created_at,
          }));
        setCloudFiles(items);
      }
    } catch (e) {
      console.warn("Could not fetch cloud projects:", e);
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSaveName(project.name);
      fetchCloudProjects();
    }
  }, [open, userId, project.name]);

  const handleExportJson = () => {
    const clean = project.name.replace(/[^a-zA-Z0-9_\-]/g, "_").trim() || "untitled";
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clean}.musicstudio.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("exportedJsonSuccess"));
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const normalized = normalizeProject(parsed);
        if (normalized) {
          onLoadProject(normalized);
          toast.success(t("importedJsonSuccess"));
          onClose();
        } else {
          toast.error(t("invalidProjectFile"));
        }
      } catch {
        toast.error(t("invalidProjectFile"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveToCloud = async () => {
    if (!userId) {
      toast.error(t("signInRequiredCloud"));
      return;
    }
    const clean = saveName.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim() || "Untitled";
    setSavingCloud(true);
    try {
      const updated: MusicProject = {
        ...project,
        name: clean,
        updatedAt: new Date().toISOString(),
      };
      const path = `${userId}/music-studio/projects/${clean}.json`;
      const blob = new Blob([JSON.stringify(updated, null, 2)], {
        type: "application/json",
      });

      const res = await storage.from("Storage").upload(path, blob, {
        contentType: "application/json",
        upsert: true,
      });
      if (res.error) throw res.error;

      toast.success(t("savedCloudSuccess"));
      fetchCloudProjects();
    } catch (e) {
      toast.error(t("saveCloudFailed"));
      console.error(e);
    } finally {
      setSavingCloud(false);
    }
  };

  const handleLoadFromCloud = async (item: SavedCloudFile) => {
    setLoadingCloud(true);
    try {
      if (item.fullPath.includes('..')) throw new Error("Invalid path");
      const res = await storage.from("Storage").download(item.fullPath);
      if (res.error || !res.data) throw res.error || new Error("Failed to download");

      const text = await res.data.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeProject(parsed);
      if (normalized) {
        onLoadProject(normalized);
        toast.success(t("loadedCloudSuccess"));
        onClose();
      }
    } catch (e) {
      toast.error(t("loadCloudFailed"));
      console.error(e);
    } finally {
      setLoadingCloud(false);
    }
  };

  const handleDeleteCloud = async (item: SavedCloudFile, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (item.fullPath.includes('..')) {
        throw new Error('Invalid path');
      }
      await storage.from("Storage").remove([item.fullPath]);
      toast.success(t("deletedCloudSuccess"));
      fetchCloudProjects();
    } catch {
      toast.error(t("deleteCloudFailed"));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("projects")}
      closeLabel={t("close")}
      wide
    >
      <div className="flex flex-col gap-5 text-xs">
        {/* Starter Demo Templates */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold uppercase tracking-wider text-[11px]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t("starterTemplates")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onLoadProject(createEmptyProject(t("emptyProjectName")));
                onClose();
              }}
              className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left transition flex flex-col gap-1"
            >
              <span className="font-bold text-slate-200">{t("newBlankProject")}</span>
              <span className="text-[10px] text-slate-500">{t("newBlankDesc")}</span>
            </button>

            {DEMO_IDS.map((demoId) => (
              <button
                key={demoId}
                type="button"
                onClick={() => {
                  onLoadProject(createDemoProject(demoId, t(`demos.${demoId}`)));
                  onClose();
                }}
                className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-700 text-left transition flex flex-col gap-1"
              >
                <span className="font-bold text-cyan-400">{t(`demos.${demoId}`)}</span>
                <span className="text-[10px] text-slate-400">{t(`demos.${demoId}Desc`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Local File Export / Import */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-slate-200 font-bold uppercase tracking-wider text-[11px]">
            <FileJson className="w-3.5 h-3.5 text-orange-400" />
            <span>{t("localFileManagement")}</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("downloadProjectJson")}</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" />
              <span>{t("loadProjectJson")}</span>
              <input
                type="file"
                accept=".json,.musicstudio.json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Cloud Account Sync (Storage integration) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-200 font-bold uppercase tracking-wider text-[11px]">
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("cloudSaveTitle")}</span>
            </div>
            {userId ? (
              <span className="text-[10px] text-green-400 font-mono">
                {t("cloudConnected")}
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 font-mono">
                {t("signInToSync")}
              </span>
            )}
          </div>

          {userId ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("projectName")}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={savingCloud}
                  onClick={handleSaveToCloud}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-semibold text-xs transition disabled:opacity-50"
                >
                  {savingCloud ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{t("saveToCloud")}</span>
                </button>
              </div>

              {/* Saved Cloud Files List */}
              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg p-1 space-y-1">
                {loadingCloud ? (
                  <div className="p-4 text-center text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>{t("loadingCloudProjects")}</span>
                  </div>
                ) : cloudFiles.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    {t("noCloudProjectsFound")}
                  </div>
                ) : (
                  cloudFiles.map((item) => (
                    <div
                      key={item.fullPath}
                      onClick={() => handleLoadFromCloud(item)}
                      className="flex items-center justify-between p-2 rounded hover:bg-slate-800/80 cursor-pointer transition text-xs group"
                    >
                      <span className="font-semibold text-slate-200 group-hover:text-cyan-400">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.updatedAt && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCloud(item, e)}
                          className="p-1 text-slate-500 hover:text-red-400 rounded"
                          title={t("delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-xs">{t("cloudSignInPrompt")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
};
