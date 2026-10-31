import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Gamepad2,
  Search,
  Play,
  Trophy,
  Sparkles,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  User,
} from "lucide-react";
import {
  CustomGameRecord,
} from "@shared/customGames";
import { GameSandbox } from "./game-studio/GameSandbox";
import { LightDismissDialog } from "./game-studio/LightDismissDialog";

export const CustomGamesApp: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [games, setGames] = useState<CustomGameRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeGame, setActiveGame] = useState<CustomGameRecord | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [sandboxKey, setSandboxKey] = useState<number>(0);
  const [sessionScore, setSessionScore] = useState<number>(0);
  const [unlockedMap, setUnlockedMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function fetchGames() {
      try {
        const res = await fetch("/api/custom-games");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data?.games)) {
            setGames(data.games);
          }
        }
      } catch {
        // Fallback to empty games list
      }
    }
    fetchGames();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return games;
    return games.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.creatorUsername.toLowerCase().includes(q) ||
        g.genre.toLowerCase().includes(q) ||
        (Array.isArray(g.tags) && g.tags.some((tag) => tag.toLowerCase().includes(q))),
    );
  }, [games, searchQuery]);

  const handleOpenPlayModal = async (game: CustomGameRecord) => {
    setActiveGame(game);
    setSessionScore(0);
    setSandboxKey((k) => k + 1);

    try {
      const res = await fetch(`/api/custom-games/${encodeURIComponent(game.id)}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.game) {
          setGames((prev) =>
            prev.map((item) => (item.id === game.id ? data.game : item)),
          );
        }
      }
    } catch {
      // Ignore play counter network errors
    }
  };

  const handleUnlockAchievement = useCallback(
    async (achievementId: string) => {
      if (!activeGame) return;
      const gameId = activeGame.id;
      const currentList = unlockedMap[gameId] || [];
      if (currentList.includes(achievementId)) return;

      const achObj = activeGame.achievements.find((a) => a.id === achievementId);
      toast.success(
        `${t("customGames.achievementUnlocked", undefined, "Achievement Unlocked")}: ${
          achObj ? achObj.title : achievementId
        }`,
      );

      setUnlockedMap((prev) => ({
        ...prev,
        [gameId]: [...(prev[gameId] || []), achievementId],
      }));

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
        await fetch(`/api/custom-games/${encodeURIComponent(gameId)}/achievement`, {
          method: "POST",
          headers,
          body: JSON.stringify({ achievementId }),
        });
      } catch {
        // Ignore network errors
      }
    },
    [activeGame, session?.access_token, t, unlockedMap],
  );

  const handleSubmitScore = useCallback(
    async (score: number) => {
      setSessionScore((prev) => Math.max(prev, score));
      if (!activeGame) return;
      if (score > (activeGame.highScore || 0)) {
        try {
          await fetch(`/api/custom-games/${encodeURIComponent(activeGame.id)}/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score, scoreOnly: true }),
          });
        } catch {
          // Ignore network errors
        }
      }
    },
    [activeGame],
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              {t("apps.customGamesTitle", undefined, "Custom Games")}
            </h2>
            <p className="text-sm text-slate-400">
              {t(
                "apps.customGamesDesc",
                undefined,
                "Play community 2D and 3D games created in Game Studio.",
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                "customGames.searchPlaceholder",
                undefined,
                "Search games, genres, or creators...",
              )}
              className="pl-9 bg-slate-950 border-slate-700"
            />
          </div>

          <Button
            onClick={() => navigate("/apps/game-studio")}
            className="gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            {t("customGames.createInStudio", undefined, "Game Studio")}
          </Button>
        </div>
      </div>

      {/* Minimalist Clean Game Grid */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-xl">
          <Gamepad2 className="w-10 h-10 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-300 font-medium">
            {searchQuery.trim()
              ? t(
                  "customGames.noGamesFound",
                  undefined,
                  "No custom games match your search.",
                )
              : t(
                  "customGames.noGamesYet",
                  undefined,
                  "No custom games published yet. Create one in Game Studio!",
                )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGames.map((game) => (
            <div
              key={game.id}
              onClick={() => handleOpenPlayModal(game)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenPlayModal(game);
                }
              }}
              className="group cursor-pointer bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl overflow-hidden transition-all flex flex-col justify-between shadow-lg"
            >
              <div>
                {/* Cover Preview */}
                <div className="relative h-40 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/50 flex items-center justify-center overflow-hidden border-b border-slate-800">
                  {game.coverUrl ? (
                    <img
                      src={game.coverUrl}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Gamepad2 className="w-14 h-14 text-cyan-400/40 group-hover:scale-110 transition-transform" />
                  )}

                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <Badge className="bg-slate-950/85 text-cyan-300 border-cyan-500/30 uppercase text-[10px]">
                      {game.dimension}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-950/85 text-slate-200 text-[10px]">
                      {game.genre}
                    </Badge>
                  </div>

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="flex items-center gap-1.5 bg-cyan-600 text-white font-semibold px-4 py-2 rounded-full text-sm shadow-lg">
                      <Play className="w-4 h-4 fill-current" />
                      {t("customGames.playNow", undefined, "Play Now")}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-2">
                  <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
                    {game.title}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {game.description}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  {game.creatorUsername}
                </span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    {game.achievements?.length || 0}
                  </span>
                  <span>
                    {game.plays || 0} {t("customGames.plays", undefined, "plays")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instant Popup Play Modal (<dialog closedby="any">) */}
      <LightDismissDialog
        open={Boolean(activeGame)}
        onClose={() => setActiveGame(null)}
        ariaLabelledBy="custom-game-modal-title"
        className="max-w-5xl"
      >
        {activeGame && (
          <div className="flex flex-col h-[84vh]">
            {/* Modal Header */}
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
                <h3
                  id="custom-game-modal-title"
                  className="font-bold text-base text-slate-100"
                >
                  {activeGame.title}
                </h3>
                <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-300">
                  {activeGame.dimension.toUpperCase()}
                </Badge>
                <span className="text-xs text-slate-400">
                  by {activeGame.creatorUsername}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-slate-800 text-amber-300">
                  Score: {Math.max(sessionScore, activeGame.highScore || 0)}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="h-8 px-2.5 border-slate-700"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSandboxKey((k) => k + 1)}
                  className="h-8 gap-1 border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("gameStudio.restart", undefined, "Restart")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveGame(null)}
                  aria-label={t("common.close", undefined, "Close")}
                  className="h-8 w-8 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Sandboxed Game Viewport */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden">
              <GameSandbox
                key={`${activeGame.id}_${sandboxKey}`}
                code={activeGame.code}
                title={activeGame.title}
                muted={muted}
                onUnlockAchievement={handleUnlockAchievement}
                onSubmitScore={handleSubmitScore}
              />
            </div>

            {/* Achievements Bar */}
            {activeGame.achievements && activeGame.achievements.length > 0 && (
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  {t("gameStudio.tabAchievements", undefined, "Achievements")}:
                </span>
                {activeGame.achievements.map((ach) => {
                  const isUnlocked = (unlockedMap[activeGame.id] || []).includes(
                    ach.id,
                  );
                  return (
                    <span
                      key={ach.id}
                      title={ach.description}
                      className={`text-xs px-2.5 py-0.5 rounded-full border shrink-0 ${
                        isUnlocked
                          ? "bg-amber-500/20 border-amber-400/50 text-amber-200 font-semibold"
                          : "bg-slate-900 border-slate-800 text-slate-500"
                      }`}
                    >
                      {isUnlocked ? "🏆 " : "🔒 "}
                      {ach.title}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </LightDismissDialog>
    </div>
  );
};

export default CustomGamesApp;
