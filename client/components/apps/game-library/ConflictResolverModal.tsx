import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Cloud,
  Laptop,
  CheckCircle2,
  Clock,
  HardDrive,
  Hash,
  Layers,
  ArrowRight,
  ShieldAlert,
  Archive,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  gameSyncService,
  type ResolveConflictResult,
} from "@/lib/gameSyncService";
import type { GameConflictRecord } from "../../../../server/lib/dataStore";

export interface ConflictResolverModalProps {
  open: boolean;
  conflict: GameConflictRecord | null;
  onClose: () => void;
  onResolved?: (result: ResolveConflictResult) => void;
}

export type ConflictResolutionChoice = "keep_local" | "keep_cloud" | "keep_both";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || "MB"}`;
}

export const ConflictResolverModal: React.FC<ConflictResolverModalProps> = ({
  open,
  conflict,
  onClose,
  onResolved,
}) => {
  const { t } = useTranslation();

  const [selectedChoice, setSelectedChoice] =
    useState<ConflictResolutionChoice>("keep_both");
  const [archiveName, setArchiveName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default archive name based on conflict details
  useEffect(() => {
    if (conflict) {
      setArchiveName(
        `${conflict.game_id}_${conflict.category}_backup_${new Date().toISOString().slice(0, 10)}`
      );
    }
  }, [conflict]);

  const diffAnalysis = useMemo(() => {
    if (!conflict) return null;

    const localTime = new Date(conflict.local_version.timestamp).getTime();
    const cloudTime = new Date(conflict.cloud_version.timestamp).getTime();
    const isLocalNewer = localTime > cloudTime;
    const isCloudNewer = cloudTime > localTime;

    const localSize = conflict.local_version.file_size || 0;
    const cloudSize = conflict.cloud_version.file_size || 0;
    const isLocalLarger = localSize > cloudSize;
    const isCloudLarger = cloudSize > localSize;

    const localItems = conflict.local_version.item_count || 0;
    const cloudItems = conflict.cloud_version.item_count || 0;
    const isLocalMoreItems = localItems > cloudItems;
    const isCloudMoreItems = cloudItems > localItems;

    return {
      isLocalNewer,
      isCloudNewer,
      isLocalLarger,
      isCloudLarger,
      isLocalMoreItems,
      isCloudMoreItems,
    };
  }, [conflict]);

  if (!conflict) return null;

  const handleConfirmResolution = async () => {
    setIsSubmitting(true);
    try {
      const res = await gameSyncService.resolveConflict({
        conflictId: conflict.id,
        resolution: selectedChoice,
        archiveName:
          selectedChoice === "keep_both" ? archiveName.trim() : undefined,
      });

      if (res.success) {
        toast.success(
          t(
            "gameLibrary.toastConflictResolved",
            { resolution: selectedChoice },
            `Conflict resolved (${selectedChoice})`
          )
        );
        onResolved?.(res);
        onClose();
      } else {
        toast.error(res.error || "Failed to resolve conflict");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve conflict");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="max-w-3xl bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl"
        data-testid="conflict-resolver-modal"
      >
        <DialogHeader className="p-6 pb-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/70 border border-amber-700/50 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                {t(
                  "gameLibrary.conflictModalTitle",
                  undefined,
                  "Cloud Sync Conflict"
                )}
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 bg-amber-950/60 border-amber-600/50 text-amber-300 font-mono capitalize"
                >
                  {conflict.game_id} • {conflict.category}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                {t(
                  "gameLibrary.conflictModalDesc",
                  undefined,
                  "Modifications were made both locally on this machine and in cloud storage. Select how you would like to resolve this conflict to resume synchronization."
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          {/* Side-by-Side Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Local Version */}
            <div
              onClick={() => setSelectedChoice("keep_local")}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selectedChoice === "keep_local"
                  ? "border-cyan-500 bg-cyan-950/20 ring-1 ring-cyan-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
              data-testid="local-version-card"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    {t(
                      "gameLibrary.localVersionTitle",
                      undefined,
                      "Local Version (This Computer)"
                    )}
                  </span>
                </div>
                {diffAnalysis?.isLocalNewer && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-emerald-950 border-emerald-700 text-emerald-400 font-normal">
                    {t("gameLibrary.diffNewer", undefined, "Newer")}
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Modified:
                  </span>
                  <span className="font-mono text-slate-200">
                    {new Date(conflict.local_version.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                    Size:
                  </span>
                  <span className="font-mono text-slate-200">
                    {formatBytes(conflict.local_version.file_size)}
                    {diffAnalysis?.isLocalLarger && (
                      <span className="text-[10px] text-cyan-400 ml-1.5">
                        ({t("gameLibrary.diffLarger", undefined, "Larger")})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    Items:
                  </span>
                  <span className="font-mono text-slate-200">
                    {conflict.local_version.item_count}
                    {diffAnalysis?.isLocalMoreItems && (
                      <span className="text-[10px] text-cyan-400 ml-1.5">
                        ({t("gameLibrary.diffMoreItems", undefined, "More items")})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-500" />
                    Hash:
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.local_version.content_hash.slice(0, 16)}...
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800 leading-relaxed">
                {t(
                  "gameLibrary.localVersionDesc",
                  undefined,
                  "Files currently present in your local game directory."
                )}
              </p>
            </div>

            {/* Right Column: Cloud Version */}
            <div
              onClick={() => setSelectedChoice("keep_cloud")}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selectedChoice === "keep_cloud"
                  ? "border-cyan-500 bg-cyan-950/20 ring-1 ring-cyan-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
              data-testid="cloud-version-card"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    {t(
                      "gameLibrary.cloudVersionTitle",
                      undefined,
                      "Cloud Version (Oxygen Low's Software Cloud)"
                    )}
                  </span>
                </div>
                {diffAnalysis?.isCloudNewer && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-emerald-950 border-emerald-700 text-emerald-400 font-normal">
                    {t("gameLibrary.diffNewer", undefined, "Newer")}
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Modified:
                  </span>
                  <span className="font-mono text-slate-200">
                    {new Date(conflict.cloud_version.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                    Size:
                  </span>
                  <span className="font-mono text-slate-200">
                    {formatBytes(conflict.cloud_version.file_size)}
                    {diffAnalysis?.isCloudLarger && (
                      <span className="text-[10px] text-cyan-400 ml-1.5">
                        ({t("gameLibrary.diffLarger", undefined, "Larger")})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    Items:
                  </span>
                  <span className="font-mono text-slate-200">
                    {conflict.cloud_version.item_count}
                    {diffAnalysis?.isCloudMoreItems && (
                      <span className="text-[10px] text-cyan-400 ml-1.5">
                        ({t("gameLibrary.diffMoreItems", undefined, "More items")})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-500" />
                    Hash:
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {conflict.cloud_version.content_hash.slice(0, 16)}...
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800 leading-relaxed">
                {t(
                  "gameLibrary.cloudVersionDesc",
                  undefined,
                  "Snapshot stored in your Oxygen Low's Software account storage."
                )}
              </p>
            </div>
          </div>

          {/* Resolution Choices */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Select Resolution Option:
            </h4>

            {/* Option 1: Keep Both */}
            <div
              onClick={() => setSelectedChoice("keep_both")}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selectedChoice === "keep_both"
                  ? "border-cyan-500 bg-cyan-950/25 ring-1 ring-cyan-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
              data-testid="choice-keep-both"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      selectedChoice === "keep_both"
                        ? "border-cyan-400 bg-cyan-400"
                        : "border-slate-600"
                    }`}
                  >
                    {selectedChoice === "keep_both" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200">
                      {t(
                        "gameLibrary.keepBoth",
                        undefined,
                        "Keep Both (Recommended)"
                      )}
                    </span>
                    <Badge className="ml-2 text-[9px] px-1.5 py-0 bg-cyan-950 border-cyan-700 text-cyan-300">
                      Safe
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 pl-6 leading-relaxed">
                {t(
                  "gameLibrary.keepBothDesc",
                  undefined,
                  "Keep the newer version active and safely preserve the alternate version as an archived backup."
                )}
              </p>

              {selectedChoice === "keep_both" && (
                <div className="mt-3 pl-6 space-y-1.5">
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    Archive Backup Name:
                  </label>
                  <Input
                    value={archiveName}
                    onChange={(e) => setArchiveName(e.target.value)}
                    placeholder="Backup name..."
                    className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200"
                    data-testid="archive-name-input"
                  />
                </div>
              )}
            </div>

            {/* Option 2: Keep Local */}
            <div
              onClick={() => setSelectedChoice("keep_local")}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selectedChoice === "keep_local"
                  ? "border-cyan-500 bg-cyan-950/25 ring-1 ring-cyan-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
              data-testid="choice-keep-local"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedChoice === "keep_local"
                      ? "border-cyan-400 bg-cyan-400"
                      : "border-slate-600"
                  }`}
                >
                  {selectedChoice === "keep_local" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-200">
                  {t("gameLibrary.keepLocal", undefined, "Keep Local")}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 pl-6 leading-relaxed">
                {t(
                  "gameLibrary.keepLocalDesc",
                  undefined,
                  "Upload your local version to the cloud. The cloud version will be replaced."
                )}
              </p>
            </div>

            {/* Option 3: Keep Cloud */}
            <div
              onClick={() => setSelectedChoice("keep_cloud")}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selectedChoice === "keep_cloud"
                  ? "border-cyan-500 bg-cyan-950/25 ring-1 ring-cyan-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
              data-testid="choice-keep-cloud"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selectedChoice === "keep_cloud"
                      ? "border-cyan-400 bg-cyan-400"
                      : "border-slate-600"
                  }`}
                >
                  {selectedChoice === "keep_cloud" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-200">
                  {t("gameLibrary.keepCloud", undefined, "Keep Cloud")}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 pl-6 leading-relaxed">
                {t(
                  "gameLibrary.keepCloudDesc",
                  undefined,
                  "Download the cloud version to this computer. Your local files will be overwritten."
                )}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200"
            data-testid="resolve-later-btn"
          >
            {t("gameLibrary.resolveLater", undefined, "Resolve Later")}
          </Button>

          <Button
            size="sm"
            onClick={handleConfirmResolution}
            disabled={isSubmitting}
            className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-sm gap-1.5 px-4"
            data-testid="confirm-resolution-btn"
          >
            {isSubmitting
              ? t(
                  "gameLibrary.resolvingConflict",
                  undefined,
                  "Resolving conflict..."
                )
              : t("gameLibrary.resolveConflict", undefined, "Resolve Conflict")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export default ConflictResolverModal;
