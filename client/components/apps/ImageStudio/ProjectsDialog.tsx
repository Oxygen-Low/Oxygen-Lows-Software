import React, { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  Save,
  Trash2,
  Download,
  Upload,
  Loader2,
  FileText,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CanvasProject } from "./types";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProject: CanvasProject;
  onLoadProject: (project: CanvasProject) => void;
}

interface SavedProjectItem {
  name: string;
  fullPath: string;
  updatedAt: string;
  size: number;
}

export const ProjectsDialog: React.FC<ProjectsDialogProps> = ({
  open,
  onOpenChange,
  currentProject,
  onLoadProject,
}) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const [projectsList, setProjectsList] = useState<SavedProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState(currentProject.name);
  const [isSaving, setIsSaving] = useState(false);

  const fetchProjects = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const folder = `${userId}/image-studio/projects`;
      const res = await storage.from("Storage").list(folder);
      if (!res.error && res.data) {
        const items = res.data
          .filter((item) => item.name.endsWith(".json"))
          .map((item) => ({
            name: item.name.replace(/\.json$/, ""),
            fullPath: `${folder}/${item.name}`,
            updatedAt: item.updated_at || item.created_at || "",
            size: item.metadata?.size || 0,
          }));
        setProjectsList(items);
      }
    } catch (e) {
      console.warn("Could not fetch projects list:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSaveName(currentProject.name);
      fetchProjects();
    }
  }, [open, userId, currentProject.name]);

  const handleSaveToStorage = async () => {
    if (!userId) {
      toast.error(t("imageStudio.signInToSaveStorage", undefined, "Please sign in to save to Storage."));
      return;
    }

    const clean = saveName.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim() || "Untitled";
    setIsSaving(true);
    try {
      const updatedProject: CanvasProject = {
        ...currentProject,
        name: clean,
        updatedAt: new Date().toISOString(),
      };

      const path = `${userId}/image-studio/projects/${clean}.json`;
      const jsonBlob = new Blob([JSON.stringify(updatedProject, null, 2)], {
        type: "application/json",
      });

      const res = await storage.from("Storage").upload(path, jsonBlob, {
        contentType: "application/json",
        upsert: true,
      });

      if (res.error) throw res.error;

      toast.success(t("imageStudio.projectSaved", undefined, "Project saved to Storage successfully!"));
      fetchProjects();
    } catch (e: any) {
      toast.error(t("imageStudio.projectSaveError", undefined, "Failed to save project."));
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadProject = async (item: SavedProjectItem) => {
    try {
      setLoading(true);
      const res = await storage.from("Storage").download(item.fullPath);
      if (res.error || !res.data) throw res.error || new Error("Failed to download");

      const text = await res.data.text();
      const proj: CanvasProject = JSON.parse(text);
      onLoadProject(proj);
      toast.success(t("imageStudio.projectLoaded", undefined, "Project loaded!"));
      onOpenChange(false);
    } catch (e) {
      toast.error(t("imageStudio.projectLoadError", undefined, "Failed to load project file."));
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (item: SavedProjectItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storage.from("Storage").remove([item.fullPath]);
      toast.success(t("imageStudio.projectDeleted", undefined, "Project removed."));
      fetchProjects();
    } catch {
      toast.error(t("imageStudio.deleteFailed", undefined, "Failed to delete project."));
    }
  };

  const handleExportJson = () => {
    const clean = currentProject.name.replace(/[^a-zA-Z0-9_\-]/g, "_") || "design";
    const blob = new Blob([JSON.stringify(currentProject, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clean}.imageproj.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("imageStudio.exportedJson", undefined, "Project file exported!"));
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed: CanvasProject = JSON.parse(text);
        if (!parsed.width || !parsed.height || !Array.isArray(parsed.layers)) {
          throw new Error("Invalid project structure");
        }
        onLoadProject(parsed);
        toast.success(t("imageStudio.importedJson", undefined, "Project imported successfully!"));
        onOpenChange(false);
      } catch {
        toast.error(t("imageStudio.invalidProjectFile", undefined, "Invalid project JSON file."));
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-popover border-border text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-amber-400" />
            <span>{t("imageStudio.myProjects", undefined, "My Projects")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Save Current Project */}
          <div className="p-3 rounded-lg border border-border bg-card/40 space-y-2">
            <div className="font-semibold text-foreground">
              {t("imageStudio.saveCurrentProject", undefined, "Save Current Project to Storage")}
            </div>
            <div className="flex gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={t("imageStudio.enterProjectName", undefined, "Project name...")}
                className="h-8 text-xs bg-background"
              />
              <Button
                size="sm"
                disabled={isSaving || !userId}
                onClick={handleSaveToStorage}
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground shrink-0 font-medium"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{t("imageStudio.saveToStorage", undefined, "Save to Storage")}</span>
              </Button>
            </div>
          </div>

          {/* List Saved Projects */}
          <div className="space-y-2">
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] flex justify-between">
              <span>{t("imageStudio.cloudProjects", undefined, "Storage Projects")}</span>
              <span className="font-mono text-[10px]">{projectsList.length}</span>
            </div>

            {loading ? (
              <div className="py-8 flex justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : projectsList.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border border-border/50 rounded-lg p-3 bg-card/20">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>{t("imageStudio.noProjectsFound", undefined, "No saved projects in your Storage yet.")}</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {projectsList.map((item) => (
                  <div
                    key={item.fullPath}
                    onClick={() => handleLoadProject(item)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent cursor-pointer group transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground text-xs truncate group-hover:text-primary transition-colors">
                        {item.name}
                      </div>
                      {item.updatedAt && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDeleteProject(item, e)}
                        title={t("imageStudio.delete", undefined, "Delete project")}
                        className="h-7 w-7 p-0 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Offline Project File Import / Export */}
        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 pt-2 border-t border-border">
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportJson}
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => jsonInputRef.current?.click()}
              className="text-xs gap-1.5 border-border hover:bg-accent flex-1 sm:flex-initial"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("imageStudio.importJson", undefined, "Import File (.json)")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              className="text-xs gap-1.5 border-border hover:bg-accent flex-1 sm:flex-initial"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>{t("imageStudio.exportJson", undefined, "Export File (.json)")}</span>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            {t("imageStudio.close", undefined, "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
