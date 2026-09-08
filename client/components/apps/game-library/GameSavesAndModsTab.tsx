import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderSync,
  RefreshCw,
  Clock,
  Pin,
  Trash2,
  RotateCcw,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Package,
  Layers,
  Sparkles,
  ExternalLink,
  Archive,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { db } from "@/lib/db";
import type { InstalledGame } from "@/lib/desktopBridge";
import {
  getSupportedGame,
  type SupportedGameDefinition,
  type GameCategoryDefinition,
} from "@/lib/supportedGames";
import {
  gameSyncService,
  type GameSyncEvent,
  type GameSyncState,
} from "@/lib/gameSyncService";
import type {
  GameSyncConfigRecord,
  GameSnapshotRecord,
  GameConflictRecord,
} from "../../../../server/lib/dataStore";

export interface GameSavesAndModsTabProps {
  game: InstalledGame;
  supportedDef?: SupportedGameDefinition;
  onOpenConflictResolver?: (conflict: GameConflictRecord) => void;
  onOpenSupportedGamesDirectory?: () => void;
}

// DLC folder names protected from custom mod packaging
const OFFICIAL_EXPANSION_NAMES = new Set([
  "core",
  "royalty",
  "ideology",
  "biotech",
  "anomaly",
  "moreslugcats",
  "expedition",
  "vanilla",
]);

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || "MB"}`;
}

export const GameSavesAndModsTab: React.FC<GameSavesAndModsTabProps> = ({
  game,
  supportedDef,
  onOpenConflictResolver,
  onOpenSupportedGamesDirectory,
}) => {
  const { t } = useTranslation();

  // Resolve definition if not directly passed
  const activeSupportedDef = useMemo(() => {
    if (supportedDef) return supportedDef;
    return getSupportedGame(game.id) || getSupportedGame(game.title);
  }, [supportedDef, game.id, game.title]);

  const canonicalId = activeSupportedDef?.id || game.id;

  const [config, setConfig] = useState<GameSyncConfigRecord | null>(null);
  const [snapshots, setSnapshots] = useState<GameSnapshotRecord[]>([]);
  const [activeConflict, setActiveConflict] = useState<GameConflictRecord | null>(null);
  const [syncState, setSyncState] = useState<GameSyncState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Manual snapshot form
  const [manualSnapshotName, setManualSnapshotName] = useState("");
  const [manualSnapshotCategory, setManualSnapshotCategory] = useState<string>("");
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Custom mod packaging loading
  const [packagingModName, setPackagingModName] = useState<string | null>(null);
  const [customModInput, setCustomModInput] = useState("");

  // 1. Fetch config, snapshots, and active conflicts for this game
  const loadGameData = useCallback(async () => {
    if (!canonicalId) return;

    try {
      const [cfgRes, snapsRes, conflictsRes] = await Promise.all([
        db.rpc("get_game_sync_configs", { game_id: canonicalId }),
        db.rpc("get_game_snapshots", { game_id: canonicalId, include_archived: true }),
        db.rpc("get_game_conflicts", { game_id: canonicalId, status: "active" }),
      ]);

      if (cfgRes.data?.config) {
        setConfig(cfgRes.data.config);
      }

      if (snapsRes.data?.snapshots && Array.isArray(snapsRes.data.snapshots)) {
        setSnapshots(snapsRes.data.snapshots);
      }

      if (conflictsRes.data?.conflicts && Array.isArray(conflictsRes.data.conflicts)) {
        setActiveConflict(conflictsRes.data.conflicts[0] || null);
      } else {
        setActiveConflict(null);
      }

      setSyncState(gameSyncService.getState(canonicalId));
    } catch (err) {
      console.error("Failed to load game sync data:", err);
    }
  }, [canonicalId]);

  useEffect(() => {
    loadGameData();
    // Default manual category to first category if available
    if (activeSupportedDef?.categories?.[0]) {
      setManualSnapshotCategory(activeSupportedDef.categories[0].id);
    }
  }, [loadGameData, activeSupportedDef]);

  // 2. Subscribe to reactive sync service events
  useEffect(() => {
    const unsubscribe = gameSyncService.subscribe((event: GameSyncEvent) => {
      if (event.gameId === canonicalId) {
        if (event.type === "state_changed") {
          setSyncState(event.state);
        } else if (event.type === "conflict_detected") {
          setActiveConflict(event.conflict);
        } else if (event.type === "conflict_resolved") {
          setActiveConflict(null);
          loadGameData();
        } else if (event.type === "sync_completed") {
          setIsSyncing(false);
          loadGameData();
        } else if (event.type === "sync_error") {
          setIsSyncing(false);
        }
      }
    });

    return () => unsubscribe();
  }, [canonicalId, loadGameData]);

  // 3. Fallback for Unsupported Game
  if (!activeSupportedDef) {
    return (
      <div className="p-6 space-y-4" data-testid="unsupported-game-view">
        <Card className="bg-slate-900/60 border-slate-800 text-slate-200">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto">
              <FolderSync className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              {t(
                "gameLibrary.notSupportedTitle",
                undefined,
                "Cloud Sync Not Supported for This Title"
              )}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {t(
                "gameLibrary.notSupportedDesc",
                undefined,
                "Cloud save and mod synchronization is currently enabled for 8 recognized PC games with specialized category schemas (Rain World, RimWorld, Barotrauma, Kenshi, etc.)."
              )}
            </p>
            {onOpenSupportedGamesDirectory && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSupportedGamesDirectory}
                className="mt-2 text-xs border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                {t(
                  "gameLibrary.viewSupportedGames",
                  undefined,
                  "View Supported Games Directory"
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Master switch
  const isMasterEnabled = config?.enabled !== false;

  // Toggle master sync
  const handleToggleMaster = async (enabled: boolean) => {
    try {
      const updated: GameSyncConfigRecord = {
        ...(config || {
          id: canonicalId,
          user_id: "",
          game_id: canonicalId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        enabled,
      };
      setConfig(updated);

      await db.rpc("upsert_game_sync_config", {
        game_id: canonicalId,
        enabled,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update master sync switch");
    }
  };

  // Toggle category switch
  const handleToggleCategory = async (categoryId: string, currentEnabled: boolean) => {
    try {
      const nextEnabled = !currentEnabled;
      const prevCategories = config?.categories || {};
      const updatedCategories = {
        ...prevCategories,
        [categoryId]: nextEnabled,
      };

      const updated: GameSyncConfigRecord = {
        ...(config || {
          id: canonicalId,
          user_id: "",
          game_id: canonicalId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        categories: updatedCategories,
      };
      setConfig(updated);

      await db.rpc("upsert_game_sync_config", {
        game_id: canonicalId,
        categories: { [categoryId]: nextEnabled },
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update category switch");
    }
  };

  // Trigger manual sync now
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await gameSyncService.syncNow(canonicalId);
      if (res.conflictsDetected && res.conflictsDetected.length > 0) {
        setActiveConflict(res.conflictsDetected[0]);
        toast.warning(
          t(
            "gameLibrary.toastConflictDetected",
            { game: activeSupportedDef.name, category: res.conflictsDetected[0].category },
            `Conflict detected in ${activeSupportedDef.name}`
          )
        );
      } else {
        toast.success(
          t("gameLibrary.syncSuccess", undefined, "Sync completed successfully")
        );
        loadGameData();
      }
    } catch (err: any) {
      toast.error(
        t(
          "gameLibrary.toastSyncFailed",
          { game: activeSupportedDef.name, error: err?.message || String(err) },
          "Sync failed"
        )
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Create manual snapshot
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameToUse =
      manualSnapshotName.trim() ||
      `Manual Save - ${new Date().toLocaleDateString()}`;

    const cat = manualSnapshotCategory || activeSupportedDef.categories[0].id;

    setIsCreatingSnapshot(true);
    try {
      await gameSyncService.createManualSnapshot({
        gameId: canonicalId,
        category: cat,
        name: nameToUse,
        fileSize: 1024 * 64, // Mock/working size
        itemCount: 1,
        summary: { createdBy: "user", category: cat },
      });

      setManualSnapshotName("");
      toast.success(
        t(
          "gameLibrary.toastSnapshotCreated",
          { name: nameToUse },
          `Snapshot '${nameToUse}' created successfully`
        )
      );
      loadGameData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create snapshot");
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Promote 24h snapshot to permanent
  const handlePromoteSnapshot = async (snapshot: GameSnapshotRecord) => {
    try {
      await gameSyncService.promoteSnapshot(snapshot.id);
      toast.success(
        t(
          "gameLibrary.toastSnapshotPinned",
          undefined,
          "Snapshot pinned as permanent save"
        )
      );
      loadGameData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to pin snapshot");
    }
  };

  // Restore snapshot
  const handleRestoreSnapshot = async (snapshot: GameSnapshotRecord) => {
    if (!confirm(t("gameLibrary.restoreConfirmDesc", undefined, "Restoring will replace your current local files with the contents of this snapshot. This cannot be undone."))) {
      return;
    }

    try {
      await db.rpc("restore_game_snapshot", { snapshot_id: snapshot.id });
      toast.success(
        t(
          "gameLibrary.toastSnapshotRestored",
          { name: snapshot.name },
          `Snapshot '${snapshot.name}' restored successfully`
        )
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to restore snapshot");
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async (snapshot: GameSnapshotRecord) => {
    if (!confirm(t("gameLibrary.deleteConfirmDesc", undefined, "Are you sure you want to permanently delete this snapshot from cloud storage?"))) {
      return;
    }

    try {
      await db.rpc("delete_game_snapshot", { snapshot_id: snapshot.id });
      toast.success(
        t(
          "gameLibrary.toastSnapshotDeleted",
          undefined,
          "Snapshot deleted successfully"
        )
      );
      loadGameData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete snapshot");
    }
  };

  // Package custom mod
  const handlePackageCustomMod = async (modName: string) => {
    const cleanModName = modName.trim();
    if (!cleanModName) return;

    if (OFFICIAL_EXPANSION_NAMES.has(cleanModName.toLowerCase())) {
      toast.error(
        t(
          "gameLibrary.customModDlcProtected",
          undefined,
          "Official expansion files are protected and cannot be packaged as custom mods."
        )
      );
      return;
    }

    setPackagingModName(cleanModName);
    try {
      const res = await gameSyncService.packageCustomMod(
        canonicalId,
        cleanModName,
        [
          {
            relativePath: `${cleanModName}/About.xml`,
            data: new TextEncoder().encode("<About><name>" + cleanModName + "</name></About>"),
            size: 64,
          },
        ]
      );

      if (res.success) {
        toast.success(
          t(
            "gameLibrary.toastCustomModPackaged",
            { name: cleanModName },
            `Custom mod '${cleanModName}' packaged and synced`
          )
        );
        setCustomModInput("");
        loadGameData();
      } else {
        toast.error(res.error || "Packaging failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to package custom mod");
    } finally {
      setPackagingModName(null);
    }
  };

  // Filter snapshots
  const filteredSnapshots = useMemo(() => {
    if (categoryFilter === "all") return snapshots;
    return snapshots.filter((s) => s.category === categoryFilter);
  }, [snapshots, categoryFilter]);

  // Check if custom_mods category exists for this game
  const supportsCustomMods = activeSupportedDef.categories.some(
    (c) => c.id === "custom_mods"
  );

  return (
    <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto" data-testid="game-saves-mods-tab">
      {/* 1. Active Conflict Alert Banner */}
      {activeConflict && (
        <div
          className="rounded-xl border border-amber-600/80 bg-amber-950/40 p-4 shadow-lg flex items-center justify-between gap-4"
          data-testid="conflict-warning-banner"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-amber-200">
                {t(
                  "gameLibrary.conflictAlertTitle",
                  undefined,
                  "Sync Paused — Conflict Detected"
                )}
              </h4>
              <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                {t(
                  "gameLibrary.conflictAlertDesc",
                  undefined,
                  "Local files and cloud storage have divergent changes. Please resolve this conflict to resume synchronization."
                )}
              </p>
            </div>
          </div>

          {onOpenConflictResolver && (
            <Button
              size="sm"
              onClick={() => onOpenConflictResolver(activeConflict)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold h-8 px-3.5 shrink-0 shadow"
              data-testid="resolve-conflict-banner-btn"
            >
              {t("gameLibrary.resolveConflict", undefined, "Resolve Conflict")}
            </Button>
          )}
        </div>
      )}

      {/* 2. Sync Status & Controls Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-950/70 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
            <FolderSync className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                {t("gameLibrary.savesAndModsTitle", undefined, "Cloud Saves & Mod Synchronization")}
              </span>
              <Badge
                className={`text-[9px] px-1.5 py-0 font-normal ${
                  activeConflict
                    ? "bg-amber-950/80 border-amber-600/70 text-amber-300"
                    : isSyncing
                      ? "bg-cyan-950/80 border-cyan-600/70 text-cyan-300"
                      : isMasterEnabled
                        ? "bg-emerald-950/70 border-emerald-700/50 text-emerald-400"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
                data-testid="sync-status-badge"
              >
                {activeConflict
                  ? t("gameLibrary.statusPausedConflict", undefined, "Paused (Conflict)")
                  : isSyncing
                    ? t("gameLibrary.statusSyncing", undefined, "Syncing...")
                    : isMasterEnabled
                      ? t("gameLibrary.statusIdle", undefined, "Up to Date")
                      : t("gameLibrary.statusNotInstalled", undefined, "Disabled")}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {syncState?.lastSyncedAt
                ? `${t("gameLibrary.lastSyncedTime", { time: new Date(syncState.lastSyncedAt).toLocaleTimeString() }, "Last synced: " + new Date(syncState.lastSyncedAt).toLocaleTimeString())}`
                : t("gameLibrary.neverSynced", undefined, "Never synced")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={isSyncing || !isMasterEnabled}
            className="border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 text-xs h-8 gap-1.5"
            data-testid="sync-now-btn"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-cyan-400" : ""}`}
            />
            {t("gameLibrary.syncNow", undefined, "Sync Now")}
          </Button>

          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Sync:</span>
            <Switch
              checked={isMasterEnabled}
              onCheckedChange={handleToggleMaster}
              data-testid="tab-master-switch"
            />
          </div>
        </div>
      </div>

      {/* 3. Category Sync Configuration */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t("gameLibrary.categoryData", undefined, "Data Categories & Sync Switches")}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activeSupportedDef.categories.map((cat: GameCategoryDefinition) => {
            const isCatEnabled =
              config?.categories?.[cat.id] !== undefined
                ? Boolean(config.categories[cat.id])
                : cat.defaultEnabled;

            return (
              <div
                key={cat.id}
                className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3 flex items-start justify-between gap-3 hover:border-slate-700/80 transition-all"
                data-testid={`category-config-row-${cat.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">
                      {cat.name}
                    </span>
                    {cat.isModList && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 bg-cyan-950/60 border-cyan-800 text-cyan-300 font-mono"
                      >
                        24h Retention
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {cat.description}
                  </p>
                  <span className="text-[9px] text-slate-500 font-mono block">
                    Type: {cat.pathType} / {cat.relativePath}
                  </span>
                </div>

                <Switch
                  checked={isCatEnabled && isMasterEnabled}
                  disabled={!isMasterEnabled}
                  onCheckedChange={() =>
                    handleToggleCategory(cat.id, isCatEnabled)
                  }
                  data-testid={`category-switch-${cat.id}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Take Manual Snapshot Form */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-semibold text-slate-200">
            {t("gameLibrary.takeSnapshot", undefined, "Take Snapshot / Create Manual Save")}
          </h4>
        </div>
        <form
          onSubmit={handleCreateSnapshot}
          className="flex flex-wrap items-center gap-3"
        >
          <Input
            value={manualSnapshotName}
            onChange={(e) => setManualSnapshotName(e.target.value)}
            placeholder={t(
              "gameLibrary.snapshotNamePlaceholder",
              undefined,
              "Snapshot name (e.g. Before Boss Fight)..."
            )}
            className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 flex-1 min-w-[200px]"
            data-testid="snapshot-name-input"
          />

          <select
            value={manualSnapshotCategory}
            onChange={(e) => setManualSnapshotCategory(e.target.value)}
            className="h-8 text-xs bg-slate-950 border border-slate-800 text-slate-300 rounded-md px-2.5 outline-none focus:ring-1 focus:ring-cyan-500"
            data-testid="snapshot-category-select"
          >
            {activeSupportedDef.categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <Button
            type="submit"
            size="sm"
            disabled={isCreatingSnapshot}
            className="h-8 px-3 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm gap-1.5"
            data-testid="create-snapshot-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("gameLibrary.createSnapshot", undefined, "Create Snapshot")}
          </Button>
        </form>
      </div>

      {/* 5. Cloud Snapshots & Retention Browser */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              {t("gameLibrary.snapshotsTitle", undefined, "Snapshots & Backups")}
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-slate-900 border-slate-700/60 text-slate-400 font-mono"
              >
                {filteredSnapshots.length}
              </Badge>
            </h4>
            <p className="text-[11px] text-slate-400">
              {t(
                "gameLibrary.retentionNotice",
                undefined,
                "Auto-synced mod lists expire automatically after 24 hours. Pin a snapshot to preserve it permanently."
              )}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                categoryFilter === "all"
                  ? "bg-cyan-950/60 border-cyan-700/60 text-cyan-300 font-medium"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
              }`}
            >
              {t("gameLibrary.allCategories", undefined, "All Categories")}
            </button>
            {activeSupportedDef.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                  categoryFilter === cat.id
                    ? "bg-cyan-950/60 border-cyan-700/60 text-cyan-300 font-medium"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Snapshot Cards List */}
        {filteredSnapshots.length === 0 ? (
          <div
            className="p-6 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20 text-slate-500 text-xs"
            data-testid="no-snapshots-message"
          >
            {t(
              "gameLibrary.noSnapshots",
              undefined,
              "No snapshots found for this game."
            )}
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="snapshots-list">
            {filteredSnapshots.map((snap) => {
              // Calculate expiration hours if auto-sync
              let expiryNotice: string | null = null;
              if (!snap.is_manual && snap.expires_at) {
                const diffMs = new Date(snap.expires_at).getTime() - Date.now();
                const hours = Math.max(0, Math.round(diffMs / (1000 * 60 * 60)));
                expiryNotice = t(
                  "gameLibrary.expiresInHours",
                  { hours },
                  `Expires in ${hours}h`
                );
              }

              return (
                <div
                  key={snap.id}
                  className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-3 flex flex-wrap items-center justify-between gap-3 hover:border-slate-700 transition-all"
                  data-testid={`snapshot-item-${snap.id}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        {snap.name}
                      </span>

                      {/* Retention Badges */}
                      {snap.is_manual ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-950/70 border-emerald-700/60 text-emerald-400 font-normal">
                          <Pin className="w-2.5 h-2.5 mr-1 text-emerald-400" />
                          {t(
                            "gameLibrary.retentionPermanent",
                            undefined,
                            "Permanent Save"
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-cyan-950/60 border-cyan-700/60 text-cyan-300 font-mono"
                        >
                          <Clock className="w-2.5 h-2.5 mr-1" />
                          {t(
                            "gameLibrary.retentionAutoSync",
                            undefined,
                            "24h Auto-Sync"
                          )}
                        </Badge>
                      )}

                      {snap.is_archived && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-slate-800 border-slate-700 text-slate-400 font-mono"
                        >
                          <Archive className="w-2.5 h-2.5 mr-1" />
                          {t(
                            "gameLibrary.retentionArchived",
                            undefined,
                            "Archived Backup"
                          )}
                        </Badge>
                      )}

                      {expiryNotice && (
                        <span className="text-[10px] text-amber-400/90 font-mono">
                          {expiryNotice}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span>Category: {snap.category}</span>
                      <span>•</span>
                      <span>{formatBytes(snap.file_size)}</span>
                      <span>•</span>
                      <span>
                        {t(
                          "gameLibrary.itemCount",
                          { count: snap.item_count },
                          `Items: ${snap.item_count}`
                        )}
                      </span>
                      <span>•</span>
                      <span>{new Date(snap.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!snap.is_manual && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePromoteSnapshot(snap)}
                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 gap-1"
                        title={t(
                          "gameLibrary.pinSnapshot",
                          undefined,
                          "Pin as Permanent"
                        )}
                        data-testid={`pin-snapshot-btn-${snap.id}`}
                      >
                        <Pin className="w-3 h-3" />
                        <span>{t("gameLibrary.pinSnapshot", undefined, "Pin")}</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreSnapshot(snap)}
                      className="h-7 px-2.5 text-xs border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 gap-1"
                      data-testid={`restore-snapshot-btn-${snap.id}`}
                    >
                      <RotateCcw className="w-3 h-3 text-cyan-400" />
                      <span>{t("gameLibrary.restoreSnapshot", undefined, "Restore")}</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSnapshot(snap)}
                      className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                      data-testid={`delete-snapshot-btn-${snap.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Custom Mod Manager (If Supported) */}
      {supportsCustomMods && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                {t(
                  "gameLibrary.customModManager",
                  undefined,
                  "Custom Mod Manager"
                )}
              </h4>
              <p className="text-[11px] text-slate-400">
                {t(
                  "gameLibrary.customModDesc",
                  undefined,
                  "Detect, package, and synchronize local custom (non-Steam Workshop) mods."
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={customModInput}
              onChange={(e) => setCustomModInput(e.target.value)}
              placeholder="Custom mod folder name (e.g. MyCustomMod)..."
              className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200"
              data-testid="custom-mod-name-input"
            />
            <Button
              size="sm"
              disabled={!customModInput.trim() || !!packagingModName}
              onClick={() => handlePackageCustomMod(customModInput)}
              className="h-8 px-3 text-xs bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 shrink-0"
              data-testid="package-mod-btn"
            >
              <Package
                className={`w-3.5 h-3.5 ${packagingModName ? "animate-spin" : ""}`}
              />
              {t(
                "gameLibrary.packageAndSyncMod",
                undefined,
                "Package & Sync Mod"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
export default GameSavesAndModsTab;
