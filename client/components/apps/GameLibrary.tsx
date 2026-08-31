import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Gamepad2,
  Play,
  Plus,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Clock,
  Users,
  FolderOpen,
  Download,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Layers,
  ArrowUpDown,
  Monitor,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { db, supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  isDesktopBridgeAvailable,
  scanInstalledGames,
  launchGame,
  pickGameExecutable,
  getGameIcon,
  getRunningGames,
  setupGameBridgeListeners,
  type InstalledGame,
  type RunningGameSession,
} from "@/lib/desktopBridge";

export type PlatformFilter =
  "all" | "steam" | "epic" | "ea" | "xbox" | "gog" | "ubisoft" | "custom";

export type SortOption =
  "recent" | "playtime" | "alphabetical_az" | "alphabetical_za";

export interface FriendGameOwnership {
  user_id: string;
  friend_id?: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  playtime_seconds: number;
  is_playing: boolean;
  last_played_at?: string | null;
}

export function formatPlaytime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 60) {
    return "< 1 min";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatDetailedPlaytime(
  totalSeconds: number,
  hoursLabel = "hrs",
  minutesLabel = "min",
): string {
  if (!totalSeconds || totalSeconds < 60) {
    return `0 ${minutesLabel}`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} ${hoursLabel} ${minutes} ${minutesLabel}`;
  }
  return `${minutes} ${minutesLabel}`;
}

const PLATFORM_CONFIG: Record<
  PlatformFilter,
  {
    label: string;
    color: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
  }
> = {
  all: {
    label: "All",
    color: "cyan",
    badgeBg: "bg-slate-800/80",
    badgeBorder: "border-slate-700",
    badgeText: "text-slate-300",
  },
  steam: {
    label: "Steam",
    color: "blue",
    badgeBg: "bg-sky-950/80",
    badgeBorder: "border-sky-700/60",
    badgeText: "text-sky-300",
  },
  epic: {
    label: "Epic Games",
    color: "zinc",
    badgeBg: "bg-zinc-900/80",
    badgeBorder: "border-zinc-700",
    badgeText: "text-zinc-300",
  },
  ea: {
    label: "EA App",
    color: "orange",
    badgeBg: "bg-orange-950/80",
    badgeBorder: "border-orange-700/60",
    badgeText: "text-orange-300",
  },
  xbox: {
    label: "Xbox",
    color: "emerald",
    badgeBg: "bg-emerald-950/80",
    badgeBorder: "border-emerald-700/60",
    badgeText: "text-emerald-300",
  },
  gog: {
    label: "GOG Galaxy",
    color: "purple",
    badgeBg: "bg-purple-950/80",
    badgeBorder: "border-purple-700/60",
    badgeText: "text-purple-300",
  },
  ubisoft: {
    label: "Ubisoft",
    color: "indigo",
    badgeBg: "bg-indigo-950/80",
    badgeBorder: "border-indigo-700/60",
    badgeText: "text-indigo-300",
  },
  custom: {
    label: "Custom",
    color: "cyan",
    badgeBg: "bg-cyan-950/80",
    badgeBorder: "border-cyan-700/60",
    badgeText: "text-cyan-300",
  },
};

export function GameLibrary() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const desktopAvailable = isDesktopBridgeAvailable();

  const [games, setGames] = useState<InstalledGame[]>([]);
  const [playtimeMap, setPlaytimeMap] = useState<Record<string, number>>({});
  const [runningSessions, setRunningSessions] = useState<RunningGameSession[]>(
    [],
  );
  const [isScanning, setIsScanning] = useState(false);
  const [activePlatform, setActivePlatform] = useState<PlatformFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Selected game for details modal / drawer
  const [selectedGame, setSelectedGame] = useState<InstalledGame | null>(null);
  const [friendsWithGame, setFriendsWithGame] = useState<FriendGameOwnership[]>(
    [],
  );
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);

  // Custom game modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customExePath, setCustomExePath] = useState("");
  const [customIconData, setCustomIconData] = useState<string | undefined>(
    undefined,
  );
  const [isSubmittingCustom, setIsSubmittingCustom] = useState(false);

  // Image load error fallback cache
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // 1. Initial Load: Fetch Server Games & Playtimes
  const loadServerGamesAndPlaytimes = useCallback(async () => {
    try {
      // Load user games
      const { data: dbGames } = await db
        .from("user_games")
        .select("*")
        .execute();

      // Load user playtimes
      const { data: ptData } = await supabase.rpc("get_user_playtime");
      const ptObj: Record<string, number> = {};
      if (ptData && typeof ptData === "object") {
        const source = ptData.playtime || ptData.games || ptData;
        if (typeof source === "object") {
          for (const [k, v] of Object.entries(source)) {
            if (typeof v === "number") ptObj[k] = v;
          }
        }
      }
      setPlaytimeMap(ptObj);

      if (Array.isArray(dbGames) && dbGames.length > 0) {
        const mapped: InstalledGame[] = dbGames.map((g: any) => ({
          id: g.game_id || g.id,
          title: g.title || "Unknown Game",
          platform: g.platform || "custom",
          launchUri: g.launch_url || g.launchUri,
          executablePath: g.executable_path || g.executablePath,
          installPath: g.install_path || g.installPath,
          iconUrl: g.icon_url || g.iconUrl,
          bannerUrl: g.banner_url || g.bannerUrl,
          isCustom: Boolean(g.is_custom),
          playtime_seconds: Math.max(
            Number(g.playtime_seconds) || 0,
            ptObj[g.game_id || g.id] || 0,
          ),
          last_played_at: g.last_played_at || null,
        }));
        setGames((prev) => {
          const map = new Map<string, InstalledGame>();
          for (const item of mapped) map.set(item.id, item);
          for (const item of prev) {
            if (!map.has(item.id)) map.set(item.id, item);
          }
          return Array.from(map.values());
        });
      }
    } catch {
      // Ignored in offline / test mode
    }
  }, []);

  // 2. Perform Full Desktop Scan & Server Sync
  const handleScanGames = useCallback(async () => {
    if (!desktopAvailable) return;
    setIsScanning(true);
    try {
      const scanned = await scanInstalledGames();
      if (scanned && scanned.length > 0) {
        // Sync with server
        try {
          const { data: syncRes } = await supabase.rpc("sync_user_games", {
            games: scanned,
          });
          if (syncRes && syncRes.games && Array.isArray(syncRes.games)) {
            const merged: InstalledGame[] = syncRes.games.map((g: any) => ({
              id: g.game_id || g.id,
              title: g.title || "Unknown Game",
              platform: g.platform || "custom",
              launchUri: g.launch_url || g.launchUri,
              executablePath: g.executable_path || g.executablePath,
              installPath: g.install_path || g.installPath,
              iconUrl: g.icon_url || g.iconUrl,
              bannerUrl: g.banner_url || g.bannerUrl,
              isCustom: Boolean(g.is_custom),
              playtime_seconds: Number(g.playtime_seconds) || 0,
              last_played_at: g.last_played_at || null,
            }));
            setGames(merged);
            toast.success(`Found ${scanned.length} installed games`);
            return;
          }
        } catch {
          // Fallback to local scanned list
        }

        setGames((prev) => {
          const map = new Map<string, InstalledGame>();
          for (const item of scanned) map.set(item.id, item);
          for (const item of prev) {
            if (item.isCustom && !map.has(item.id)) {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values());
        });
        toast.success(`Found ${scanned.length} installed games`);
      } else {
        toast.info("No installed games found on default launcher paths.");
      }
    } catch (err: any) {
      toast.error(`Scan failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsScanning(false);
    }
  }, [desktopAvailable]);

  // Initial scanning on mount if desktop mode
  useEffect(() => {
    loadServerGamesAndPlaytimes();
    if (desktopAvailable) {
      handleScanGames();
      getRunningGames()
        .then((res) => {
          if (res?.runningGames) setRunningSessions(res.runningGames);
        })
        .catch(() => {});
    }
  }, [desktopAvailable, loadServerGamesAndPlaytimes, handleScanGames]);

  // 3. Setup Push Event Listeners (playtime ticks, session ended/started)
  useEffect(() => {
    if (!desktopAvailable) return;

    const unsubscribe = setupGameBridgeListeners(
      // On Playtime Tick
      (data) => {
        const gameId = data.gameId || data.game_id;
        const delta = data.deltaSeconds || data.delta_seconds || 15;
        if (!gameId) return;

        // Log to server
        supabase
          .rpc("log_playtime", {
            game_id: gameId,
            duration_seconds: delta,
          })
          .catch(() => {});

        // Set presence
        supabase
          .rpc("set_game_presence", {
            game_id: gameId,
            is_playing: true,
          })
          .catch(() => {});

        // Update local playtime state
        setPlaytimeMap((prev) => ({
          ...prev,
          [gameId]: (prev[gameId] || 0) + delta,
        }));
        setGames((prev) =>
          prev.map((g) => {
            if (g.id === gameId) {
              return {
                ...g,
                playtime_seconds: (g.playtime_seconds || 0) + delta,
                last_played_at: new Date().toISOString(),
              };
            }
            return g;
          }),
        );
      },
      // On Session Ended
      (data) => {
        const gameId = data.gameId || data.game_id;
        if (gameId) {
          supabase
            .rpc("set_game_presence", {
              game_id: gameId,
              is_playing: false,
            })
            .catch(() => {});
        }
        setRunningSessions((prev) => prev.filter((s) => s.gameId !== gameId));
        loadServerGamesAndPlaytimes();
      },
      // On Session Started
      (data) => {
        const gameId = data.gameId || data.game_id;
        if (gameId) {
          supabase
            .rpc("set_game_presence", {
              game_id: gameId,
              game_title: data.title,
              platform: data.platform,
              is_playing: true,
            })
            .catch(() => {});

          setRunningSessions((prev) => {
            if (prev.some((s) => s.gameId === gameId)) return prev;
            return [
              ...prev,
              {
                gameId,
                title: data.title || "",
                platform: data.platform || "",
                startedAt: data.startedAt || new Date().toISOString(),
                elapsedSeconds: 0,
              },
            ];
          });
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [desktopAvailable, loadServerGamesAndPlaytimes]);

  // 4. Fetch Friends with this Game when Selected Game changes
  useEffect(() => {
    if (!selectedGame) {
      setFriendsWithGame([]);
      return;
    }

    setLoadingFriends(true);
    supabase
      .rpc("get_game_friends", {
        game_id: selectedGame.id,
        game_title: selectedGame.title,
      })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setFriendsWithGame(data);
        } else {
          setFriendsWithGame([]);
        }
      })
      .catch(() => {
        setFriendsWithGame([]);
      })
      .finally(() => {
        setLoadingFriends(false);
      });
  }, [selectedGame]);

  // 5. Game Launch Handler
  const handleLaunchGame = async (game: InstalledGame) => {
    if (!desktopAvailable) {
      toast.error(
        t(
          "gameLibrary.desktopRequiredTitle",
          undefined,
          "Desktop App Required",
        ),
      );
      return;
    }

    setLaunchingGameId(game.id);
    try {
      const res = await launchGame({
        gameId: game.id,
        platform: game.platform,
        title: game.title,
        launchUri: game.launchUri,
        executablePath: game.executablePath,
        executableName: game.executableName,
      });

      if (res.success) {
        toast.success(`Launching ${game.title}...`);
        // Update server presence
        await supabase.rpc("set_game_presence", {
          game_id: game.id,
          game_title: game.title,
          platform: game.platform,
          is_playing: true,
        });
      } else {
        toast.error(
          res.message ||
            t(
              "gameLibrary.errorLaunchFailed",
              undefined,
              "Failed to launch game",
            ),
        );
      }
    } catch (err: any) {
      toast.error(
        err.message ||
          t(
            "gameLibrary.errorLaunchFailed",
            undefined,
            "Failed to launch game",
          ),
      );
    } finally {
      setTimeout(() => {
        setLaunchingGameId(null);
      }, 1500);
    }
  };

  // 6. Custom Game Picker & Submission
  const handleBrowseCustomExecutable = async () => {
    try {
      const result = await pickGameExecutable();
      if (result) {
        setCustomExePath(result.executablePath);
        if (!customTitle.trim() && result.title) {
          setCustomTitle(result.title);
        }
        if (result.iconDataUrl) {
          setCustomIconData(result.iconDataUrl);
        }
      }
    } catch (err: any) {
      toast.error(`File pick failed: ${err.message}`);
    }
  };

  const handleAddCustomGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customExePath.trim()) {
      toast.error("Please enter a game title and executable path.");
      return;
    }

    setIsSubmittingCustom(true);
    try {
      let iconToSave = customIconData;
      if (!iconToSave && desktopAvailable) {
        try {
          const iconRes = await getGameIcon(customExePath);
          if (iconRes?.iconDataUrl) {
            iconToSave = iconRes.iconDataUrl;
          }
        } catch {}
      }

      const { data, error } = await supabase.rpc("add_custom_game", {
        title: customTitle.trim(),
        executable_path: customExePath.trim(),
        icon_url: iconToSave,
      });

      if (error) throw error;

      const newCustomGame: InstalledGame = {
        id: data?.game_id || data?.id || `custom_${crypto.randomUUID()}`,
        title: customTitle.trim(),
        platform: "custom",
        executablePath: customExePath.trim(),
        iconUrl: iconToSave,
        isCustom: true,
        playtime_seconds: 0,
        last_played_at: null,
      };

      setGames((prev) => [newCustomGame, ...prev]);
      toast.success(
        t(
          "gameLibrary.successCustomAdded",
          undefined,
          "Custom game added successfully",
        ),
      );
      setIsAddModalOpen(false);
      setCustomTitle("");
      setCustomExePath("");
      setCustomIconData(undefined);
    } catch (err: any) {
      toast.error(`Failed to add game: ${err.message}`);
    } finally {
      setIsSubmittingCustom(false);
    }
  };

  // 7. Filtering & Sorting Logic
  const filteredAndSortedGames = useMemo(() => {
    return games
      .filter((game) => {
        // Platform filter
        if (activePlatform !== "all") {
          if (activePlatform === "custom") {
            if (!game.isCustom && game.platform !== "custom") return false;
          } else {
            if (game.platform?.toLowerCase() !== activePlatform.toLowerCase()) {
              return false;
            }
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = game.title?.toLowerCase().includes(q);
          const matchPlatform = game.platform?.toLowerCase().includes(q);
          if (!matchTitle && !matchPlatform) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aPlaytime = a.playtime_seconds || playtimeMap[a.id] || 0;
        const bPlaytime = b.playtime_seconds || playtimeMap[b.id] || 0;

        if (sortBy === "recent") {
          const aTime = a.last_played_at
            ? new Date(a.last_played_at).getTime()
            : 0;
          const bTime = b.last_played_at
            ? new Date(b.last_played_at).getTime()
            : 0;
          if (aTime !== bTime) return bTime - aTime;
          return a.title.localeCompare(b.title);
        }
        if (sortBy === "playtime") {
          if (aPlaytime !== bPlaytime) return bPlaytime - aPlaytime;
          return a.title.localeCompare(b.title);
        }
        if (sortBy === "alphabetical_az") {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === "alphabetical_za") {
          return b.title.localeCompare(a.title);
        }
        return 0;
      });
  }, [games, activePlatform, searchQuery, sortBy, playtimeMap]);

  // Platform count helper
  const platformCounts = useMemo(() => {
    const counts: Record<PlatformFilter, number> = {
      all: games.length,
      steam: 0,
      epic: 0,
      ea: 0,
      xbox: 0,
      gog: 0,
      ubisoft: 0,
      custom: 0,
    };
    for (const g of games) {
      if (g.isCustom || g.platform === "custom") {
        counts.custom++;
      } else {
        const p = g.platform?.toLowerCase() as PlatformFilter;
        if (counts[p] !== undefined) {
          counts[p]++;
        }
      }
    }
    return counts;
  }, [games]);

  // Is game currently running
  const isGameRunning = (gameId: string) => {
    return runningSessions.some((s) => s.gameId === gameId);
  };

  // 8. Render Web Browser Gating if not running in Desktop App
  if (!desktopAvailable) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center p-4 sm:p-8">
        <Card className="max-w-xl w-full bg-slate-900/90 border-slate-800 text-center backdrop-blur shadow-2xl p-6 sm:p-10">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-6 text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
            <Gamepad2 className="w-10 h-10 animate-pulse" />
          </div>

          <CardTitle className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
            {t(
              "gameLibrary.desktopRequiredTitle",
              undefined,
              "Desktop App Required",
            )}
          </CardTitle>

          <CardDescription className="text-slate-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
            {t(
              "gameLibrary.desktopRequiredDesc",
              undefined,
              "Game Library requires Oxygen Low's Software desktop app to scan local game launchers, launch executables, and track active playtime.",
            )}
          </CardDescription>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              className="w-full sm:w-auto px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-500/20 text-sm rounded-lg"
            >
              <Link to="/download">
                <Download className="w-4 h-4 mr-2" />
                {t(
                  "gameLibrary.downloadDesktopApp",
                  undefined,
                  "Download Desktop App",
                )}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full sm:w-auto border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white text-sm rounded-lg"
            >
              <Link to="/apps">
                {t("common.back", undefined, "Back to Apps")}
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col space-y-6 pb-12">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col gap-4">
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                {t("gameLibrary.title", undefined, "Game Library")}
                <Badge
                  variant="outline"
                  className="text-xs bg-cyan-950/60 border-cyan-500/40 text-cyan-400 font-normal ml-2"
                >
                  {games.length} {games.length === 1 ? "game" : "games"}
                </Badge>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {t(
                  "gameLibrary.subtitle",
                  undefined,
                  "Manage, launch, and track playtime across all your installed PC games.",
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              onClick={handleScanGames}
              disabled={isScanning}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs h-9"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5 mr-1.5",
                  isScanning && "animate-spin text-cyan-400",
                )}
              />
              {isScanning
                ? t("gameLibrary.scanning", undefined, "Scanning...")
                : t("gameLibrary.scanGames", undefined, "Scan Games")}
            </Button>

            <Button
              onClick={() => setIsAddModalOpen(true)}
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-9 shadow-md shadow-cyan-500/20"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("gameLibrary.addCustomGame", undefined, "Add Custom Game")}
            </Button>
          </div>
        </div>

        {/* Filter, Search & View Switcher Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                "gameLibrary.searchPlaceholder",
                undefined,
                "Search library...",
              )}
              className="pl-9 bg-slate-950/80 border-slate-800 text-white placeholder:text-slate-500 h-9 text-xs sm:text-sm rounded-lg focus-visible:ring-cyan-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            )}
          </div>

          {/* Controls: Sort Dropdown & Grid/List Switcher */}
          <div className="flex items-center gap-2.5 self-end lg:self-auto">
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-800 bg-slate-950/80 text-slate-300 hover:text-white text-xs h-9 gap-1.5"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline text-slate-500">
                    {t("gameLibrary.sortBy", undefined, "Sort by")}:
                  </span>
                  <span>
                    {sortBy === "recent" &&
                      t(
                        "gameLibrary.sortRecentlyPlayed",
                        undefined,
                        "Recently Played",
                      )}
                    {sortBy === "playtime" &&
                      t("gameLibrary.sortPlaytime", undefined, "Playtime")}
                    {sortBy === "alphabetical_az" &&
                      t(
                        "gameLibrary.sortAlphabeticalAZ",
                        undefined,
                        "Alphabetical (A-Z)",
                      )}
                    {sortBy === "alphabetical_za" &&
                      t(
                        "gameLibrary.sortAlphabeticalZA",
                        undefined,
                        "Alphabetical (Z-A)",
                      )}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-slate-900 border-slate-800 text-slate-200 text-xs"
              >
                <DropdownMenuItem
                  onClick={() => setSortBy("recent")}
                  className={cn(
                    sortBy === "recent" && "text-cyan-400 font-medium",
                  )}
                >
                  {t(
                    "gameLibrary.sortRecentlyPlayed",
                    undefined,
                    "Recently Played",
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("playtime")}
                  className={cn(
                    sortBy === "playtime" && "text-cyan-400 font-medium",
                  )}
                >
                  {t("gameLibrary.sortPlaytime", undefined, "Playtime")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("alphabetical_az")}
                  className={cn(
                    sortBy === "alphabetical_az" && "text-cyan-400 font-medium",
                  )}
                >
                  {t(
                    "gameLibrary.sortAlphabeticalAZ",
                    undefined,
                    "Alphabetical (A-Z)",
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("alphabetical_za")}
                  className={cn(
                    sortBy === "alphabetical_za" && "text-cyan-400 font-medium",
                  )}
                >
                  {t(
                    "gameLibrary.sortAlphabeticalZA",
                    undefined,
                    "Alphabetical (Z-A)",
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle Group */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Grid View"
                title={t("gameLibrary.viewGrid", undefined, "Grid View")}
                className={cn(
                  "p-1.5 rounded-md text-slate-400 hover:text-white transition",
                  viewMode === "grid" &&
                    "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label="List View"
                title={t("gameLibrary.viewList", undefined, "List View")}
                className={cn(
                  "p-1.5 rounded-md text-slate-400 hover:text-white transition",
                  viewMode === "list" &&
                    "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Platform Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              "all",
              "steam",
              "epic",
              "ea",
              "xbox",
              "gog",
              "ubisoft",
              "custom",
            ] as PlatformFilter[]
          ).map((plat) => {
            const config = PLATFORM_CONFIG[plat];
            const isActive = activePlatform === plat;
            const count = platformCounts[plat] || 0;

            return (
              <button
                key={plat}
                onClick={() => setActivePlatform(plat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap flex items-center gap-1.5",
                  isActive
                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80",
                )}
              >
                <span>{config.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full",
                    isActive
                      ? "bg-cyan-500/30 text-cyan-200"
                      : "bg-slate-800 text-slate-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Grid vs List vs Empty State */}
      {filteredAndSortedGames.length === 0 ? (
        <Card className="w-full bg-slate-900/40 border-slate-800/80 py-16 text-center">
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-slate-500">
              <Gamepad2 className="w-8 h-8 opacity-40" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">
                {games.length === 0
                  ? t(
                      "gameLibrary.emptyLibrary",
                      undefined,
                      "Your library is empty",
                    )
                  : t("gameLibrary.noGamesFound", undefined, "No games found")}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
                {games.length === 0
                  ? t(
                      "gameLibrary.emptyLibraryDesc",
                      undefined,
                      "Click 'Scan Games' to detect installed games or add a custom executable.",
                    )
                  : t(
                      "gameLibrary.noGamesFoundDesc",
                      undefined,
                      "No games match the current filters or search query.",
                    )}
              </p>
            </div>
            {games.length === 0 && (
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleScanGames}
                  disabled={isScanning}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                >
                  <RefreshCw
                    className={cn(
                      "w-3.5 h-3.5 mr-1.5",
                      isScanning && "animate-spin",
                    )}
                  />
                  {t("gameLibrary.scanGames", undefined, "Scan Games")}
                </Button>
                <Button
                  onClick={() => setIsAddModalOpen(true)}
                  variant="outline"
                  className="border-slate-700 bg-slate-800/50 text-slate-300 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t("gameLibrary.addCustomGame", undefined, "Add Custom Game")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        /* ─── Grid View ───────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredAndSortedGames.map((game) => {
            const playtime = game.playtime_seconds || playtimeMap[game.id] || 0;
            const isRunning = isGameRunning(game.id);
            const isLaunching = launchingGameId === game.id;
            const platformConf =
              PLATFORM_CONFIG[
                (game.isCustom
                  ? "custom"
                  : (game.platform?.toLowerCase() as PlatformFilter)) ||
                  "custom"
              ] || PLATFORM_CONFIG.custom;

            const hasBanner =
              game.bannerUrl && !brokenImages[`banner_${game.id}`];
            const hasIcon =
              (game.iconUrl || game.executablePath) &&
              !brokenImages[`icon_${game.id}`];

            return (
              <Card
                key={game.id}
                onClick={() => setSelectedGame(game)}
                className="group relative overflow-hidden bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-cyan-500/40 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-cyan-500/5"
              >
                {/* Artwork Banner / Header */}
                <div className="relative w-full aspect-[16/9] bg-slate-950 overflow-hidden border-b border-slate-800/60">
                  {hasBanner ? (
                    <img
                      src={game.bannerUrl}
                      alt={game.title}
                      onError={() =>
                        setBrokenImages((prev) => ({
                          ...prev,
                          [`banner_${game.id}`]: true,
                        }))
                      }
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : hasIcon && game.iconUrl ? (
                    <div className="w-full h-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-slate-950">
                      <img
                        src={game.iconUrl}
                        alt={game.title}
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [`icon_${game.id}`]: true,
                          }))
                        }
                        className="w-14 h-14 object-contain rounded-lg drop-shadow-md group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-600">
                      <Gamepad2 className="w-12 h-12 opacity-30 group-hover:text-cyan-400 group-hover:opacity-60 transition-all duration-300" />
                    </div>
                  )}

                  {/* Gradient Overlay for Text Readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent pointer-events-none" />

                  {/* Top-Right Platform Badge */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 backdrop-blur-md",
                        platformConf.badgeBg,
                        platformConf.badgeBorder,
                        platformConf.badgeText,
                      )}
                    >
                      {platformConf.label}
                    </Badge>
                  </div>

                  {/* Live "Running" / "Now Playing" Banner Badge */}
                  {isRunning && (
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {t("gameLibrary.running", undefined, "Playing")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h3
                      title={game.title}
                      className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors line-clamp-1"
                    >
                      {game.title}
                    </h3>

                    {/* Metadata: Playtime & Last Played */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatPlaytime(playtime)}
                      </span>

                      {game.last_played_at && (
                        <span className="text-slate-500 truncate max-w-[100px]">
                          {new Date(game.last_played_at).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Play Button */}
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchGame(game);
                    }}
                    disabled={isLaunching}
                    className={cn(
                      "w-full h-8 text-xs font-semibold rounded-md transition-all",
                      isRunning
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                        : "bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white border border-slate-700/60 hover:border-cyan-500",
                    )}
                  >
                    <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                    {isLaunching
                      ? t("gameLibrary.launching", undefined, "Launching...")
                      : isRunning
                        ? t("gameLibrary.running", undefined, "Playing")
                        : t("gameLibrary.play", undefined, "Play")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ─── List View ───────────────────────────────────────────────────────── */
        <div className="w-full bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-800/60">
            {filteredAndSortedGames.map((game) => {
              const playtime =
                game.playtime_seconds || playtimeMap[game.id] || 0;
              const isRunning = isGameRunning(game.id);
              const isLaunching = launchingGameId === game.id;
              const platformConf =
                PLATFORM_CONFIG[
                  (game.isCustom
                    ? "custom"
                    : (game.platform?.toLowerCase() as PlatformFilter)) ||
                    "custom"
                ] || PLATFORM_CONFIG.custom;

              const hasIcon =
                (game.iconUrl || game.bannerUrl) &&
                !brokenImages[`icon_${game.id}`];

              return (
                <div
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  className="flex items-center justify-between p-3 sm:px-4 hover:bg-slate-800/50 transition cursor-pointer gap-4 group"
                >
                  {/* Left: Thumbnail & Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                      {hasIcon ? (
                        <img
                          src={game.iconUrl || game.bannerUrl}
                          alt={game.title}
                          onError={() =>
                            setBrokenImages((prev) => ({
                              ...prev,
                              [`icon_${game.id}`]: true,
                            }))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Gamepad2 className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                          {game.title}
                        </h4>
                        {isRunning && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs sm:max-w-md">
                        {game.executablePath ||
                          game.installPath ||
                          game.platform}
                      </p>
                    </div>
                  </div>

                  {/* Middle: Platform Badge & Playtime */}
                  <div className="hidden md:flex items-center gap-6 text-xs text-slate-400 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5",
                        platformConf.badgeBg,
                        platformConf.badgeBorder,
                        platformConf.badgeText,
                      )}
                    >
                      {platformConf.label}
                    </Badge>

                    <span className="flex items-center gap-1 w-20">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {formatPlaytime(playtime)}
                    </span>
                  </div>

                  {/* Right: Play Button */}
                  <div className="shrink-0">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLaunchGame(game);
                      }}
                      disabled={isLaunching}
                      className={cn(
                        "h-8 px-4 text-xs font-semibold rounded-md",
                        isRunning
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-cyan-600 hover:bg-cyan-500 text-white",
                      )}
                    >
                      <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                      {isLaunching
                        ? t("gameLibrary.launching", undefined, "Launching...")
                        : isRunning
                          ? t("gameLibrary.running", undefined, "Playing")
                          : t("gameLibrary.play", undefined, "Play")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Responsive Game Details Modal / Dialog ─────────────────────────── */}
      <Dialog
        open={!!selectedGame}
        onOpenChange={(open) => {
          if (!open) setSelectedGame(null);
        }}
      >
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-200 p-0 overflow-hidden shadow-2xl">
          {selectedGame && (
            <div>
              {/* Header Artwork Banner */}
              <div className="relative w-full aspect-[21/9] sm:aspect-[24/9] bg-slate-950 overflow-hidden border-b border-slate-800">
                {selectedGame.bannerUrl ? (
                  <img
                    src={selectedGame.bannerUrl}
                    alt={selectedGame.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-slate-700">
                    <Gamepad2 className="w-16 h-16 opacity-30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />

                {/* Banner Content Overlay */}
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {selectedGame.iconUrl && (
                      <img
                        src={selectedGame.iconUrl}
                        alt={selectedGame.title}
                        className="w-12 h-12 rounded-xl object-contain bg-slate-950/80 p-1 border border-slate-700 shadow-md"
                      />
                    )}
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-md">
                        {selectedGame.title}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            PLATFORM_CONFIG[
                              (selectedGame.isCustom
                                ? "custom"
                                : (selectedGame.platform?.toLowerCase() as PlatformFilter)) ||
                                "custom"
                            ]?.badgeBg,
                            PLATFORM_CONFIG[
                              (selectedGame.isCustom
                                ? "custom"
                                : (selectedGame.platform?.toLowerCase() as PlatformFilter)) ||
                                "custom"
                            ]?.badgeBorder,
                            PLATFORM_CONFIG[
                              (selectedGame.isCustom
                                ? "custom"
                                : (selectedGame.platform?.toLowerCase() as PlatformFilter)) ||
                                "custom"
                            ]?.badgeText,
                          )}
                        >
                          {selectedGame.isCustom
                            ? "Custom"
                            : selectedGame.platform}
                        </Badge>

                        {isGameRunning(selectedGame.id) && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {t(
                              "gameLibrary.playingNow",
                              undefined,
                              "Playing Now",
                            )}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Primary Play Button in Header */}
                  <Button
                    onClick={() => handleLaunchGame(selectedGame)}
                    disabled={launchingGameId === selectedGame.id}
                    className={cn(
                      "px-6 py-2.5 font-bold shadow-lg text-sm rounded-lg shrink-0",
                      isGameRunning(selectedGame.id)
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                        : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20",
                    )}
                  >
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    {launchingGameId === selectedGame.id
                      ? t("gameLibrary.launching", undefined, "Launching...")
                      : isGameRunning(selectedGame.id)
                        ? t("gameLibrary.running", undefined, "Playing")
                        : t("gameLibrary.play", undefined, "Play")}
                  </Button>
                </div>
              </div>

              {/* Modal Body Info & Friends */}
              <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[11px] text-slate-500 block mb-1 font-medium">
                      {t("gameLibrary.totalPlaytime", undefined, "Playtime")}
                    </span>
                    <span className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {formatDetailedPlaytime(
                        selectedGame.playtime_seconds ||
                          playtimeMap[selectedGame.id] ||
                          0,
                        t("gameLibrary.hours", undefined, "hrs"),
                        t("gameLibrary.minutes", undefined, "min"),
                      )}
                    </span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                    <span className="text-[11px] text-slate-500 block mb-1 font-medium">
                      {t("gameLibrary.lastPlayed", undefined, "Last Played")}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">
                      {selectedGame.last_played_at
                        ? new Date(
                            selectedGame.last_played_at,
                          ).toLocaleDateString()
                        : t("gameLibrary.never", undefined, "Never")}
                    </span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 col-span-2 sm:col-span-1">
                    <span className="text-[11px] text-slate-500 block mb-1 font-medium">
                      {t("gameLibrary.platform", undefined, "Platform")}
                    </span>
                    <span className="text-sm font-semibold text-slate-200 capitalize">
                      {selectedGame.platform}
                    </span>
                  </div>
                </div>

                {/* Executable Path / Directory if available */}
                {(selectedGame.executablePath || selectedGame.installPath) && (
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3 text-xs">
                    <span className="text-slate-500 block mb-1 font-medium">
                      {selectedGame.executablePath
                        ? t("gameLibrary.executable", undefined, "Executable")
                        : t(
                            "gameLibrary.installLocation",
                            undefined,
                            "Install Location",
                          )}
                    </span>
                    <code className="text-slate-300 break-all select-all font-mono">
                      {selectedGame.executablePath || selectedGame.installPath}
                    </code>
                  </div>
                )}

                {/* Friends with this Game Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      {t(
                        "gameLibrary.friendsWithGame",
                        undefined,
                        "Friends with this Game",
                      )}
                    </h4>
                    <span className="text-xs text-slate-500">
                      {friendsWithGame.length}{" "}
                      {friendsWithGame.length === 1 ? "friend" : "friends"}
                    </span>
                  </div>

                  {loadingFriends ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-cyan-400" />
                      {t("common.loading", undefined, "Loading...")}
                    </div>
                  ) : friendsWithGame.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/30 rounded-lg border border-slate-800/40">
                      <Users className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      <p>
                        {t(
                          "gameLibrary.noFriendsWithGame",
                          undefined,
                          "None of your friends own this game yet.",
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/50 bg-slate-950/40 rounded-lg border border-slate-800/60 overflow-hidden">
                      {friendsWithGame.map((friend) => {
                        const initials = (
                          friend.display_name ||
                          friend.username ||
                          "U"
                        )
                          .slice(0, 2)
                          .toUpperCase();

                        return (
                          <div
                            key={friend.user_id || friend.username}
                            className="flex items-center justify-between p-2.5 sm:px-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar className="w-8 h-8 rounded-full border border-slate-700">
                                {friend.avatar_url && (
                                  <AvatarImage
                                    src={friend.avatar_url}
                                    alt={friend.username}
                                  />
                                )}
                                <AvatarFallback className="bg-slate-800 text-[10px] text-cyan-400 font-bold">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-200 truncate">
                                    {friend.display_name || friend.username}
                                  </span>
                                  {friend.is_playing && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded-full border border-emerald-600/40 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      {t(
                                        "gameLibrary.playingNow",
                                        undefined,
                                        "Playing Now",
                                      )}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  @{friend.username}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-slate-400 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {formatPlaytime(friend.playtime_seconds)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <DialogFooter className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGame(null)}
                  className="border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-xs"
                >
                  {t("common.close", undefined, "Close")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add Custom Game Modal ─────────────────────────────────────────── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-200 shadow-2xl">
          <form onSubmit={handleAddCustomGame}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                {t("gameLibrary.dialogTitle", undefined, "Add Custom Game")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "gameLibrary.dialogDesc",
                  undefined,
                  "Add any non-launcher game or executable to your library.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Game Title Field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="custom-title"
                  className="text-xs text-slate-300"
                >
                  {t("gameLibrary.gameTitleLabel", undefined, "Game Title")}{" "}
                  <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="custom-title"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={t(
                    "gameLibrary.gameTitlePlaceholder",
                    undefined,
                    "e.g. Cyberpunk 2077",
                  )}
                  required
                  className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                />
              </div>

              {/* Executable Path Field with Browse Button */}
              <div className="space-y-1.5">
                <Label htmlFor="custom-exe" className="text-xs text-slate-300">
                  {t(
                    "gameLibrary.executablePathLabel",
                    undefined,
                    "Executable Path",
                  )}{" "}
                  <span className="text-rose-500">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-exe"
                    value={customExePath}
                    onChange={(e) => setCustomExePath(e.target.value)}
                    placeholder={t(
                      "gameLibrary.executablePathPlaceholder",
                      undefined,
                      "C:\\Games\\MyGame\\game.exe",
                    )}
                    required
                    className="bg-slate-950 border-slate-800 text-white text-xs h-9 flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleBrowseCustomExecutable}
                    variant="outline"
                    className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-9 px-3 shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1" />
                    {t("gameLibrary.browse", undefined, "Browse...")}
                  </Button>
                </div>
              </div>

              {/* Icon Preview if extracted */}
              {customIconData && (
                <div className="flex items-center gap-3 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <img
                    src={customIconData}
                    alt="Preview Icon"
                    className="w-10 h-10 object-contain rounded-md"
                  />
                  <span className="text-xs text-slate-400">
                    Extracted application icon
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                className="border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs"
              >
                {t("gameLibrary.cancel", undefined, "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingCustom}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              >
                {isSubmittingCustom ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                )}
                {t("gameLibrary.addGameButton", undefined, "Add Game")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GameLibraryApp() {
  return <GameLibrary />;
}

export default GameLibraryApp;
