import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderSync,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { db } from "@/lib/db";
import {
  isDesktopBridgeAvailable,
  pickGameExecutable,
  type InstalledGame,
} from "@/lib/desktopBridge";
import {
  SUPPORTED_GAMES,
  validateCustomPath,
  type SupportedGameDefinition,
  type SupportedGameId,
  type GameCategoryDefinition,
} from "@/lib/supportedGames";
import {
  gameSyncService,
  type GameSyncEvent,
  type GameSyncState,
} from "@/lib/gameSyncService";
import type {
  GameSyncConfigRecord,
  GameConflictRecord,
} from "../../../../server/lib/dataStore";

export interface SupportedGamesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installedGames: InstalledGame[];
  onOpenGameDetails?: (
    game: InstalledGame,
    initialTab?: "overview" | "saves_mods"
  ) => void;
  onOpenConflictResolver?: (conflict: GameConflictRecord) => void;
}

export type GameDetectionStatus = "installed" | "path_resolved" | "not_found";

export const SupportedGamesModal: React.FC<SupportedGamesModalProps> = ({
  open,
  onOpenChange,
  installedGames,
  onOpenGameDetails,
  onOpenConflictResolver,
}) => {
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState("");
  const [configs, setConfigs] = useState<Record<string, GameSyncConfigRecord>>({});
  const [conflicts, setConflicts] = useState<Record<string, GameConflictRecord>>({});
  const [expandedPathsGameId, setExpandedPathsGameId] = useState<string | null>(null);
  const [customPathInputs, setCustomPathInputs] = useState<
    Record<string, { installPath: string; savePath: string; error?: string | null }>
  >({});
  const [syncingGames, setSyncingGames] = useState<Record<string, boolean>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStates, setSyncStates] = useState<Record<string, GameSyncState>>({});

  // 1. Fetch configs and active conflicts on open
  const loadConfigsAndConflicts = useCallback(async () => {
    try {
      const [configsRes, conflictsRes] = await Promise.all([
        db.rpc("get_game_sync_configs", {}),
        db.rpc("get_game_conflicts", { status: "active" }),
      ]);

      if (configsRes.data?.configs && Array.isArray(configsRes.data.configs)) {
        const map: Record<string, GameSyncConfigRecord> = {};
        for (const cfg of configsRes.data.configs) {
          map[cfg.game_id] = cfg;
        }
        setConfigs(map);

        // Pre-populate custom path inputs
        const initialPaths: Record<
          string,
          { installPath: string; savePath: string; error?: string | null }
        > = {};
        for (const game of SUPPORTED_GAMES) {
          const cfg = map[game.id];
          initialPaths[game.id] = {
            installPath: cfg?.custom_paths?.install_path || "",
            savePath: cfg?.custom_paths?.save_path || "",
            error: null,
          };
        }
        setCustomPathInputs(initialPaths);
      }

      if (conflictsRes.data?.conflicts && Array.isArray(conflictsRes.data.conflicts)) {
        const conflictMap: Record<string, GameConflictRecord> = {};
        for (const c of conflictsRes.data.conflicts) {
          conflictMap[c.game_id] = c;
        }
        setConflicts(conflictMap);
      }
    } catch (err) {
      console.error("Failed to load game sync configs or conflicts:", err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadConfigsAndConflicts();
      setSyncStates(gameSyncService.getAllStates());
    }
  }, [open, loadConfigsAndConflicts]);

  // 2. Subscribe to reactive GameSyncService events
  useEffect(() => {
    const unsubscribe = gameSyncService.subscribe((event: GameSyncEvent) => {
      if (event.type === "state_changed") {
        setSyncStates((prev) => ({
          ...prev,
          [event.gameId]: event.state,
        }));
      } else if (event.type === "conflict_detected") {
        setConflicts((prev) => ({
          ...prev,
          [event.gameId]: event.conflict,
        }));
      } else if (event.type === "conflict_resolved") {
        setConflicts((prev) => {
          const next = { ...prev };
          delete next[event.gameId];
          return next;
        });
      } else if (event.type === "sync_completed" || event.type === "sync_error") {
        setSyncingGames((prev) => ({ ...prev, [event.gameId]: false }));
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. Match installed games to determine detection status
  const detectionMap = useMemo<Record<SupportedGameId, GameDetectionStatus>>(() => {
    const map = {} as Record<SupportedGameId, GameDetectionStatus>;

    for (const game of SUPPORTED_GAMES) {
      // Check if matching game exists in installedGames
      const isInstalled = installedGames.some((g) => {
        if (g.id === game.id) return true;
        if (game.steamAppId && g.launchUri?.includes(String(game.steamAppId))) return true;
        if (g.title && g.title.toLowerCase() === game.name.toLowerCase()) return true;
        if (g.executablePath) {
          const exe = g.executablePath.toLowerCase();
          for (const defExe of game.defaultExecutableNames) {
            if (exe.endsWith(defExe.toLowerCase())) return true;
          }
        }
        return false;
      });

      if (isInstalled) {
        map[game.id] = "installed";
      } else if (
        configs[game.id]?.custom_paths?.install_path ||
        configs[game.id]?.custom_paths?.save_path
      ) {
        map[game.id] = "path_resolved";
      } else {
        map[game.id] = "not_found";
      }
    }

    return map;
  }, [installedGames, configs]);

  // 4. Filtered games list based on search
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return SUPPORTED_GAMES;
    const query = searchQuery.toLowerCase();
    return SUPPORTED_GAMES.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.title.toLowerCase().includes(query) ||
        g.categories.some((cat) => cat.name.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  // 5. Global Toggle Actions
  const handleToggleAll = async (enabled: boolean) => {
    try {
      const nextConfigs: Record<string, GameSyncConfigRecord> = { ...configs };
      for (const game of SUPPORTED_GAMES) {
        const prev = configs[game.id] || {
          id: game.id,
          user_id: "",
          game_id: game.id,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updated: GameSyncConfigRecord = {
          ...prev,
          enabled,
        };
        nextConfigs[game.id] = updated;

        // Persist to server
        await db.rpc("upsert_game_sync_config", {
          game_id: game.id,
          enabled,
        });
      }
      setConfigs(nextConfigs);
      toast.success(
        enabled
          ? t("gameLibrary.enableAll", undefined, "Enable All")
          : t("gameLibrary.disableAll", undefined, "Disable All")
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to update global sync switches");
    }
  };

  // 6. Global Sync All
  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    toast.info(t("gameLibrary.syncingAll", undefined, "Syncing all games..."));
    try {
      for (const game of SUPPORTED_GAMES) {
        const cfg = configs[game.id];
        if (cfg?.enabled !== false) {
          setSyncingGames((prev) => ({ ...prev, [game.id]: true }));
          await gameSyncService.syncNow(game.id);
          setSyncingGames((prev) => ({ ...prev, [game.id]: false }));
        }
      }
      toast.success(
        t(
          "gameLibrary.toastSyncAllComplete",
          undefined,
          "All supported games synchronized successfully"
        )
      );
    } catch (err: any) {
      toast.error(err?.message || "Sync all completed with errors");
    } finally {
      setIsSyncingAll(false);
    }
  };

  // 7. Toggle master switch for individual game
  const handleToggleGameMaster = async (gameId: SupportedGameId, enabled: boolean) => {
    try {
      const prev = configs[gameId];
      const updated: GameSyncConfigRecord = {
        ...(prev || {
          id: gameId,
          user_id: "",
          game_id: gameId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        enabled,
      };

      setConfigs((prevMap) => ({ ...prevMap, [gameId]: updated }));

      await db.rpc("upsert_game_sync_config", {
        game_id: gameId,
        enabled,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update game sync switch");
    }
  };

  // 8. Toggle individual category
  const handleToggleCategory = async (
    gameId: SupportedGameId,
    categoryId: string,
    currentEnabled: boolean
  ) => {
    try {
      const nextEnabled = !currentEnabled;
      const prev = configs[gameId];
      const prevCategories = prev?.categories || {};

      const updatedCategories = {
        ...prevCategories,
        [categoryId]: nextEnabled,
      };

      const updated: GameSyncConfigRecord = {
        ...(prev || {
          id: gameId,
          user_id: "",
          game_id: gameId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        categories: updatedCategories,
      };

      setConfigs((prevMap) => ({ ...prevMap, [gameId]: updated }));

      await db.rpc("upsert_game_sync_config", {
        game_id: gameId,
        categories: { [categoryId]: nextEnabled },
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update category switch");
    }
  };

  // 9. Manual Sync Now for a single game
  const handleSyncGame = async (gameId: SupportedGameId) => {
    setSyncingGames((prev) => ({ ...prev, [gameId]: true }));
    try {
      const res = await gameSyncService.syncNow(gameId);
      if (res.conflictsDetected && res.conflictsDetected.length > 0) {
        toast.warning(
          t(
            "gameLibrary.toastConflictDetected",
            { game: gameId, category: res.conflictsDetected[0].category },
            `Conflict detected in ${gameId}`
          )
        );
      } else {
        toast.success(
          t(
            "gameLibrary.toastSyncCompleted",
            { game: gameId },
            `Sync completed successfully for ${gameId}`
          )
        );
      }
    } catch (err: any) {
      toast.error(
        t(
          "gameLibrary.toastSyncFailed",
          { game: gameId, error: err?.message || String(err) },
          `Sync failed for ${gameId}`
        )
      );
    } finally {
      setSyncingGames((prev) => ({ ...prev, [gameId]: false }));
    }
  };

  // 10. Browse for game executable / custom path
  const handleBrowseCustomPath = async (
    gameId: SupportedGameId,
    targetField: "installPath" | "savePath"
  ) => {
    if (isDesktopBridgeAvailable()) {
      try {
        const picked = await pickGameExecutable();
        if (picked && picked.executablePath) {
          setCustomPathInputs((prev) => ({
            ...prev,
            [gameId]: {
              ...(prev[gameId] || { installPath: "", savePath: "" }),
              [targetField]: picked.executablePath,
              error: null,
            },
          }));
        }
      } catch (err) {
        console.error("Failed to pick game executable via bridge:", err);
      }
    }
  };

  // 11. Save custom path overrides
  const handleSaveCustomPaths = async (gameId: SupportedGameId) => {
    const inputs = customPathInputs[gameId];
    if (!inputs) return;

    // Validate if non-empty
    if (inputs.installPath.trim()) {
      const val = validateCustomPath(inputs.installPath);
      if (!val.valid) {
        setCustomPathInputs((prev) => ({
          ...prev,
          [gameId]: {
            ...inputs,
            error: t(
              "gameLibrary.pathSecurityWarning",
              undefined,
              "Path traversal outside allowed directories is blocked for security."
            ),
          },
        }));
        return;
      }
    }

    if (inputs.savePath.trim()) {
      const val = validateCustomPath(inputs.savePath);
      if (!val.valid) {
        setCustomPathInputs((prev) => ({
          ...prev,
          [gameId]: {
            ...inputs,
            error: t(
              "gameLibrary.pathSecurityWarning",
              undefined,
              "Path traversal outside allowed directories is blocked for security."
            ),
          },
        }));
        return;
      }
    }

    try {
      const custom_paths: Record<string, string> = {};
      if (inputs.installPath.trim()) {
        custom_paths.install_path = inputs.installPath.trim();
      }
      if (inputs.savePath.trim()) {
        custom_paths.save_path = inputs.savePath.trim();
      }

      const prev = configs[gameId];
      const updated: GameSyncConfigRecord = {
        ...(prev || {
          id: gameId,
          user_id: "",
          game_id: gameId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        custom_paths: {
          ...(prev?.custom_paths || {}),
          ...custom_paths,
        },
      };

      setConfigs((prevMap) => ({ ...prevMap, [gameId]: updated }));

      await db.rpc("upsert_game_sync_config", {
        game_id: gameId,
        custom_paths,
      });

      setCustomPathInputs((prev) => ({
        ...prev,
        [gameId]: { ...inputs, error: null },
      }));

      toast.success(
        t(
          "gameLibrary.toastCustomPathSaved",
          undefined,
          "Custom paths updated successfully"
        )
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to save custom paths");
    }
  };

  // 12. Reset custom path overrides to default
  const handleResetCustomPaths = async (gameId: SupportedGameId) => {
    try {
      setCustomPathInputs((prev) => ({
        ...prev,
        [gameId]: { installPath: "", savePath: "", error: null },
      }));

      const prev = configs[gameId];
      const updated: GameSyncConfigRecord = {
        ...(prev || {
          id: gameId,
          user_id: "",
          game_id: gameId,
          enabled: true,
          categories: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        custom_paths: {},
      };

      setConfigs((prevMap) => ({ ...prevMap, [gameId]: updated }));

      await db.rpc("upsert_game_sync_config", {
        game_id: gameId,
        custom_paths: {},
      });

      toast.success(
        t("gameLibrary.resetToDefault", undefined, "Reset to Default")
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset paths");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl"
        data-testid="supported-games-modal"
      >
        <DialogHeader className="p-6 pb-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-700/50 flex items-center justify-center text-cyan-400 shadow-inner">
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  {t(
                    "gameLibrary.supportedGamesTitle",
                    undefined,
                    "Supported Games Directory"
                  )}
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 bg-cyan-950/60 border-cyan-600/50 text-cyan-300 font-mono"
                  >
                    8 Titles
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  {t(
                    "gameLibrary.supportedGamesSubtitle",
                    undefined,
                    "Cloud sync, custom mod packaging, and path resolution across recognized titles."
                  )}
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={isSyncingAll}
              className="border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-200 text-xs h-8 gap-1.5 shadow-sm"
              data-testid="sync-all-now-btn"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingAll ? "animate-spin text-cyan-400" : ""}`}
              />
              {t("gameLibrary.syncAllNow", undefined, "Sync All Now")}
            </Button>
          </div>

          {/* Master Switches & Search Bar */}
          <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-300">
              <span className="font-medium text-slate-400">
                {t(
                  "gameLibrary.globalSyncSwitches",
                  undefined,
                  "Global Sync Switches:"
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleAll(true)}
                  className="h-7 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                  data-testid="enable-all-btn"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  {t("gameLibrary.enableAll", undefined, "Enable All")}
                </Button>
                <span className="text-slate-600">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleAll(false)}
                  className="h-7 px-2.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
                  data-testid="disable-all-btn"
                >
                  {t("gameLibrary.disableAll", undefined, "Disable All")}
                </Button>
              </div>
            </div>

            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(
                  "gameLibrary.searchSupportedGames",
                  undefined,
                  "Search supported games..."
                )}
                className="pl-8 h-8 text-xs bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500 focus-visible:ring-cyan-500/50"
                data-testid="search-supported-games-input"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body: 8 Game Cards */}
        <ScrollArea className="max-h-[62vh] p-6 pt-4">
          <div className="space-y-4">
            {filteredGames.map((game) => {
              const cfg = configs[game.id];
              const isMasterEnabled = cfg ? cfg.enabled : true;
              const detection = detectionMap[game.id] || "not_found";
              const conflict = conflicts[game.id];
              const syncState = syncStates[game.id];
              const isSyncing = syncingGames[game.id] || syncState?.status === "syncing";
              const isExpanded = expandedPathsGameId === game.id;
              const pathState = customPathInputs[game.id] || {
                installPath: "",
                savePath: "",
              };

              return (
                <div
                  key={game.id}
                  className={`rounded-xl border transition-all ${
                    conflict
                      ? "border-amber-600/60 bg-amber-950/15"
                      : isMasterEnabled
                        ? "border-slate-800/90 bg-slate-900/40 hover:border-slate-700/80"
                        : "border-slate-800/40 bg-slate-950/40 opacity-75"
                  } p-4 shadow-sm`}
                  data-testid={`supported-game-card-${game.id}`}
                >
                  {/* Top Row: Title, Steam App ID, Detection Badge, Master Switch, Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 font-semibold text-xs shadow-inner">
                        {game.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-slate-100">
                            {game.name}
                          </h4>
                          {game.steamAppId && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-slate-900 border-slate-700/60 text-slate-400 font-mono"
                            >
                              Steam {game.steamAppId}
                            </Badge>
                          )}
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2 mt-1">
                          {detection === "installed" ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-950/70 border-emerald-700/50 text-emerald-400 font-normal">
                              <ShieldCheck className="w-2.5 h-2.5 mr-1 text-emerald-400" />
                              {t("gameLibrary.statusInstalled", undefined, "Installed")}
                            </Badge>
                          ) : detection === "path_resolved" ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-cyan-950/70 border-cyan-700/50 text-cyan-400 font-normal">
                              <Sparkles className="w-2.5 h-2.5 mr-1 text-cyan-400" />
                              {t(
                                "gameLibrary.statusPathResolved",
                                undefined,
                                "Path Resolved"
                              )}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-slate-900/60 border-slate-700/50 text-slate-400 font-normal"
                            >
                              {t(
                                "gameLibrary.statusNotDetected",
                                undefined,
                                "Not Detected"
                              )}
                            </Badge>
                          )}

                          {conflict && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-950/80 border-amber-600/70 text-amber-300 animate-pulse font-normal">
                              <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                              {t(
                                "gameLibrary.statusPausedConflict",
                                undefined,
                                "Paused (Conflict)"
                              )}
                            </Badge>
                          )}

                          {!conflict && isMasterEnabled && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              {syncState?.lastSyncedAt
                                ? `${t("gameLibrary.lastSyncedTime", { time: new Date(syncState.lastSyncedAt).toLocaleTimeString() }, "Last synced: " + new Date(syncState.lastSyncedAt).toLocaleTimeString())}`
                                : t("gameLibrary.neverSynced", undefined, "Never synced")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Conflict button, Sync button, Details link, Master switch */}
                    <div className="flex items-center gap-2">
                      {conflict && onOpenConflictResolver && (
                        <Button
                          size="sm"
                          onClick={() => onOpenConflictResolver(conflict)}
                          className="h-7 px-2.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 gap-1.5 shadow-sm"
                          data-testid={`resolve-conflict-btn-${game.id}`}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          {t(
                            "gameLibrary.resolveConflict",
                            undefined,
                            "Resolve Conflict"
                          )}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncGame(game.id)}
                        disabled={isSyncing || !isMasterEnabled}
                        className="h-7 px-2.5 text-xs border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 gap-1"
                        data-testid={`sync-game-now-btn-${game.id}`}
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isSyncing ? "animate-spin text-cyan-400" : ""}`}
                        />
                        {t("gameLibrary.syncNow", undefined, "Sync Now")}
                      </Button>

                      {onOpenGameDetails && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const foundInstalled = installedGames.find(
                              (ig) =>
                                ig.id === game.id ||
                                (game.steamAppId &&
                                  ig.launchUri?.includes(String(game.steamAppId)))
                            );
                            const fallbackGame: InstalledGame = foundInstalled || {
                              id: game.id,
                              title: game.name,
                              platform: "steam",
                              isCustom: false,
                            };
                            onOpenGameDetails(fallbackGame, "saves_mods");
                          }}
                          className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}

                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                        <Switch
                          checked={isMasterEnabled}
                          onCheckedChange={(checked) =>
                            handleToggleGameMaster(game.id, checked)
                          }
                          data-testid={`master-switch-${game.id}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Independent Category Sync Toggles */}
                  <div className="mt-3 pt-3 border-t border-slate-800/50">
                    <div className="text-[11px] text-slate-400 mb-2 font-medium">
                      {t("gameLibrary.categoryData", undefined, "Data Categories")} ({game.categories.length}):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {game.categories.map((cat: GameCategoryDefinition) => {
                        const isCatEnabled =
                          cfg?.categories?.[cat.id] !== undefined
                            ? Boolean(cfg.categories[cat.id])
                            : cat.defaultEnabled;

                        return (
                          <button
                            key={cat.id}
                            type="button"
                            disabled={!isMasterEnabled}
                            onClick={() =>
                              handleToggleCategory(game.id, cat.id, isCatEnabled)
                            }
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all ${
                              isCatEnabled && isMasterEnabled
                                ? "bg-cyan-950/50 border-cyan-700/60 text-cyan-200 hover:bg-cyan-900/50"
                                : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400"
                            }`}
                            title={cat.description}
                            data-testid={`category-toggle-${game.id}-${cat.id}`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isCatEnabled && isMasterEnabled
                                  ? "bg-cyan-400"
                                  : "bg-slate-600"
                              }`}
                            />
                            <span className="capitalize">{cat.name}</span>
                            {cat.isModList && (
                              <span className="text-[9px] px-1 py-0 rounded bg-slate-800 text-slate-400 font-mono">
                                24h
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Collapsible: Custom Path Configuration */}
                  <div className="mt-3 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPathsGameId(isExpanded ? null : game.id)
                      }
                      className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      <span>
                        {t(
                          "gameLibrary.customPathsTitle",
                          undefined,
                          "Path Configuration"
                        )}
                      </span>
                      {(cfg?.custom_paths?.install_path ||
                        cfg?.custom_paths?.save_path) && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 bg-cyan-950/60 border-cyan-800 text-cyan-300 font-mono ml-1"
                        >
                          Custom
                        </Badge>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-3">
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {t(
                            "gameLibrary.customPathsDesc",
                            undefined,
                            "Override automatic paths if this game or its saves are installed in non-standard locations."
                          )}
                        </p>

                        {/* Install Path Input */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
                            {t(
                              "gameLibrary.customInstallPath",
                              undefined,
                              "Custom Install Directory"
                            )}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              value={pathState.installPath}
                              onChange={(e) =>
                                setCustomPathInputs((prev) => ({
                                  ...prev,
                                  [game.id]: {
                                    ...pathState,
                                    installPath: e.target.value,
                                    error: null,
                                  },
                                }))
                              }
                              placeholder={
                                game.defaultInstallFolder ||
                                "C:\\Games\\" + game.name
                              }
                              className="h-8 text-xs bg-slate-900 border-slate-800 font-mono text-slate-200"
                              data-testid={`custom-install-path-input-${game.id}`}
                            />
                            {isDesktopBridgeAvailable() && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleBrowseCustomPath(game.id, "installPath")
                                }
                                className="h-8 px-2.5 text-xs border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 gap-1 shrink-0"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                {t("gameLibrary.browseFolder", undefined, "Browse...")}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Save Path Input */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
                            {t(
                              "gameLibrary.customSavePath",
                              undefined,
                              "Custom Saves Directory"
                            )}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              value={pathState.savePath}
                              onChange={(e) =>
                                setCustomPathInputs((prev) => ({
                                  ...prev,
                                  [game.id]: {
                                    ...pathState,
                                    savePath: e.target.value,
                                    error: null,
                                  },
                                }))
                              }
                              placeholder="%APPDATA%\\LocalLow\\..."
                              className="h-8 text-xs bg-slate-900 border-slate-800 font-mono text-slate-200"
                              data-testid={`custom-save-path-input-${game.id}`}
                            />
                            {isDesktopBridgeAvailable() && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleBrowseCustomPath(game.id, "savePath")
                                }
                                className="h-8 px-2.5 text-xs border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 gap-1 shrink-0"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                {t("gameLibrary.browseFolder", undefined, "Browse...")}
                              </Button>
                            )}
                          </div>
                        </div>

                        {pathState.error && (
                          <p className="text-xs text-rose-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {pathState.error}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetCustomPaths(game.id)}
                            className="h-7 px-2.5 text-xs text-slate-400 hover:text-slate-200 gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t(
                              "gameLibrary.resetToDefault",
                              undefined,
                              "Reset to Default"
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveCustomPaths(game.id)}
                            className="h-7 px-3 text-xs bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm"
                            data-testid={`save-custom-paths-btn-${game.id}`}
                          >
                            {t("gameLibrary.savePaths", undefined, "Save Paths")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
export default SupportedGamesModal;
