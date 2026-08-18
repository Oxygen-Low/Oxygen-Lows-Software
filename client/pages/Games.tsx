import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Gamepad2,
  Bomb,
  Spade,
  Crown,
  Monitor,
  Smartphone,
  Type,
  Grid3x3,
  Users,
  User,
  Sparkles,
  Puzzle,
  Boxes,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MinesweeperApp } from "@/components/apps/Minesweeper";
import { SolitaireApp } from "@/components/apps/Solitaire";
import { ChessApp } from "@/components/apps/Chess";
import { PokerApp } from "@/components/apps/Poker";
import { SudokuApp } from "@/components/apps/Sudoku";
import { WordSearchApp } from "@/components/apps/WordSearch";
import { TicTacToeApp } from "@/components/apps/TicTacToe";

export type GameMode = "Multiplayer" | "Singleplayer";
export type GameGenre = "Puzzle" | "Strategy" | "Card" | "Board" | "Casual";

export type Availability = "web-and-desktop" | "desktop-only";

export interface GameMetadata {
  id: string;
  nameKey: string;
  defaultName: string;
  descKey: string;
  defaultDesc: string;
  modes: GameMode[];
  genres: GameGenre[];
  availability: Availability;
  icon: React.ReactNode;
  component: React.ComponentType;
  authRequired?: boolean;
  requiresAdmin?: boolean;
  androidSupported?: boolean;
}

export interface ModeDefinition {
  id: GameMode | "All";
  labelKey: string;
  defaultLabel: string;
  icon: React.ReactNode;
}

export interface GenreDefinition {
  id: GameGenre | "All";
  labelKey: string;
  defaultLabel: string;
  icon: React.ReactNode;
}

export const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    id: "All",
    labelKey: "games.allModes",
    defaultLabel: "All Modes",
    icon: <Gamepad2 className="w-4 h-4" />,
  },
  {
    id: "Multiplayer",
    labelKey: "games.multiplayer",
    defaultLabel: "Multiplayer",
    icon: <Users className="w-4 h-4" />,
  },
  {
    id: "Singleplayer",
    labelKey: "games.singleplayer",
    defaultLabel: "Singleplayer",
    icon: <User className="w-4 h-4" />,
  },
];

export const GENRE_DEFINITIONS: GenreDefinition[] = [
  {
    id: "All",
    labelKey: "games.allGenres",
    defaultLabel: "All Genres",
    icon: <Boxes className="w-4 h-4" />,
  },
  {
    id: "Puzzle",
    labelKey: "games.puzzle",
    defaultLabel: "Puzzle",
    icon: <Puzzle className="w-4 h-4" />,
  },
  {
    id: "Strategy",
    labelKey: "games.strategy",
    defaultLabel: "Strategy",
    icon: <Crown className="w-4 h-4" />,
  },
  {
    id: "Card",
    labelKey: "games.card",
    defaultLabel: "Card",
    icon: <Spade className="w-4 h-4" />,
  },
  {
    id: "Board",
    labelKey: "games.board",
    defaultLabel: "Board",
    icon: <Grid3x3 className="w-4 h-4" />,
  },
  {
    id: "Casual",
    labelKey: "games.casual",
    defaultLabel: "Casual",
    icon: <Sparkles className="w-4 h-4" />,
  },
];

export const GAMES: GameMetadata[] = [
  {
    id: "chess",
    nameKey: "games.chessTitle",
    defaultName: "Chess",
    descKey: "games.chessDesc",
    defaultDesc: "Play a game of chess against an AI opponent.",
    modes: ["Singleplayer", "Multiplayer"],
    genres: ["Strategy", "Board"],
    availability: "web-and-desktop",
    icon: <Crown className="w-8 h-8 text-cyan-500" />,
    component: ChessApp,
  },
  {
    id: "minesweeper",
    nameKey: "games.minesweeperTitle",
    defaultName: "Minesweeper",
    descKey: "games.minesweeperDesc",
    defaultDesc: "The classic game of Minesweeper. Clear the board without detonating any mines!",
    modes: ["Singleplayer"],
    genres: ["Puzzle", "Strategy"],
    availability: "web-and-desktop",
    icon: <Bomb className="w-8 h-8 text-cyan-500" />,
    component: MinesweeperApp,
  },
  {
    id: "solitaire",
    nameKey: "games.solitaireTitle",
    defaultName: "Solitaire",
    descKey: "games.solitaireDesc",
    defaultDesc: "Play the classic Klondike Solitaire card game.",
    modes: ["Singleplayer"],
    genres: ["Card", "Casual"],
    availability: "web-and-desktop",
    icon: <Spade className="w-8 h-8 text-green-500" />,
    component: SolitaireApp,
  },
  {
    id: "poker",
    nameKey: "games.pokerTitle",
    defaultName: "Texas Hold'em",
    descKey: "games.pokerDesc",
    defaultDesc: "Play Heads-Up Texas Hold'em against an AI opponent.",
    modes: ["Singleplayer", "Multiplayer"],
    genres: ["Card", "Strategy"],
    availability: "web-and-desktop",
    icon: <Gamepad2 className="w-8 h-8 text-yellow-500" />,
    component: PokerApp,
  },
  {
    id: "sudoku",
    nameKey: "games.sudokuTitle",
    defaultName: "Sudoku",
    descKey: "games.sudokuDesc",
    defaultDesc: "Challenge your mind with the classic numbers puzzle.",
    modes: ["Singleplayer"],
    genres: ["Puzzle", "Strategy"],
    availability: "web-and-desktop",
    icon: <Grid3x3 className="w-8 h-8 text-indigo-400" />,
    component: SudokuApp,
  },
  {
    id: "wordsearch",
    nameKey: "games.wordSearchTitle",
    defaultName: "Word Search",
    descKey: "games.wordSearchDesc",
    defaultDesc: "Find hidden words in a grid of letters.",
    modes: ["Singleplayer"],
    genres: ["Puzzle", "Casual"],
    availability: "web-and-desktop",
    icon: <Type className="w-8 h-8 text-indigo-500" />,
    component: WordSearchApp,
  },
  {
    id: "tictactoe",
    nameKey: "games.tictactoeTitle",
    defaultName: "Tic Tac Toe",
    descKey: "games.tictactoeDesc",
    defaultDesc: "The classic game of Tic Tac Toe.",
    modes: ["Singleplayer", "Multiplayer"],
    genres: ["Casual", "Board"],
    availability: "web-and-desktop",
    icon: <Grid3x3 className="w-8 h-8 text-blue-500" />,
    component: TicTacToeApp,
  },
];

export default function Games() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasDesktopParam = searchParams.get("desktop") === "1";
  const hasAndroidParam = searchParams.get("android") === "1";

  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    return hasDesktopParam || sessionStorage.getItem("desktopMode") === "1";
  });
  
  const [isAndroidMode, setIsAndroidMode] = useState(() => {
    return hasAndroidParam || sessionStorage.getItem("androidMode") === "1";
  });

  useEffect(() => {
    if (hasDesktopParam) {
      sessionStorage.setItem("desktopMode", "1");
      setIsDesktopMode(true);
    }
    if (hasAndroidParam) {
      sessionStorage.setItem("androidMode", "1");
      setIsAndroidMode(true);
    }
  }, [hasDesktopParam, hasAndroidParam]);

  const [selectedMode, setSelectedMode] = useState<GameMode | "All">("All");
  const [selectedGenre, setSelectedGenre] = useState<GameGenre | "All">("All");
  const [selectedAvailability, setSelectedAvailability] =
    useState<Availability>("web-and-desktop");
  
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const localizedGames = useMemo(() => {
    return GAMES.map((game) => ({
      ...game,
      name: t(game.nameKey as any, undefined, game.defaultName),
      description: t(game.descKey as any, undefined, game.defaultDesc),
    }));
  }, [t]);

  const activeApp = useMemo(() => localizedGames.find((a) => a.id === appId) || null, [appId, localizedGames]);

  const availableApps = useMemo(
    () =>
      localizedGames.filter((app) => {
        if (!isDesktopMode && !isAndroidMode) return app.availability === "web-and-desktop";
        if (isAndroidMode && app.availability === "desktop-only" && !app.androidSupported) return false;
        if (selectedAvailability === "web-and-desktop") return true;
        return app.availability === "desktop-only";
      }),
    [isDesktopMode, isAndroidMode, selectedAvailability, localizedGames],
  );

  const filteredGames = useMemo(() => {
    return availableApps.filter((app) => {
      const matchesMode = selectedMode === "All" || app.modes.includes(selectedMode);
      const matchesGenre = selectedGenre === "All" || app.genres.includes(selectedGenre);
      return matchesMode && matchesGenre;
    });
  }, [selectedMode, selectedGenre, availableApps]);

  const modeCounts = useMemo(() => {
    const counts: Record<GameMode | "All", number> = {
      All: availableApps.length,
      Multiplayer: 0,
      Singleplayer: 0,
    };
    availableApps.forEach((app) => {
      app.modes.forEach((mode) => {
        counts[mode]++;
      });
    });
    return counts;
  }, [availableApps]);

  const genreCounts = useMemo(() => {
    const counts: Record<GameGenre | "All", number> = {
      All: availableApps.length,
      Puzzle: 0,
      Strategy: 0,
      Card: 0,
      Board: 0,
      Casual: 0,
    };
    availableApps.forEach((app) => {
      app.genres.forEach((genre) => {
        counts[genre]++;
      });
    });
    return counts;
  }, [availableApps]);

  const handleAppClick = (app: typeof localizedGames[0]) => {
    navigate(`/games/${app.id}`);
  };

  const handleClearFilters = () => {
    setSelectedMode("All");
    setSelectedGenre("All");
  };

  if (activeApp) {
    const AppComponent = activeApp.component;
    const isFullWidthApp = false;

    return (
      <Layout fullWidth={isFullWidthApp}>
        <div className={isFullWidthApp ? "h-full w-full flex flex-col" : "space-y-6 h-full flex flex-col"}>
          {!isFullWidthApp && (
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 shrink-0">
              <button
                onClick={() => navigate("/games")}
                aria-label={t("games.backToGames", undefined, "Back to games list")}
                title={t("games.backToGames", undefined, "Back to games list")}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none shrink-0"
              >
                <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{activeApp.name}</h2>
            </div>
          )}
          
          <div className="relative flex-1 w-full h-full min-h-[500px]">
            {!session && activeApp.authRequired && (
              <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-slate-800 p-4 sm:p-6 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 text-cyan-500">
                  {activeApp.icon}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
                  {t("apps.signInToUse", { name: activeApp.name }, `Sign in to play ${activeApp.name}`)}
                </h3>
                <p className="text-slate-400 mb-6 sm:mb-8 max-w-md text-xs sm:text-sm">{activeApp.description}</p>
                <button 
                  onClick={() => navigate("/auth")} 
                  className="px-6 py-2.5 sm:px-8 sm:py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  {t("apps.signInToContinue", undefined, "Sign In to Continue")}
                </button>
              </div>
            )}
            <div className={cn("h-full w-full", !session && activeApp.authRequired && "pointer-events-none select-none opacity-20 blur-sm transition-all")}>
              <AppComponent />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
            {t("games.title", undefined, "Games")}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {t("games.subtitle", undefined, "Play interactive and retro games built right into the browser!")}
          </p>
        </div>
        
        {isDesktopMode && (
          <section aria-label={t("apps.availability", undefined, "Availability")} className="space-y-3">
            <h3 className="text-lg sm:text-xl font-semibold text-white">
              {t("apps.availability", undefined, "Availability")}
            </h3>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                type="button"
                aria-pressed={selectedAvailability === "web-and-desktop"}
                onClick={() => setSelectedAvailability("web-and-desktop")}
                className={cn(
                  "px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300",
                  "border border-white/10 hover:border-white/20",
                  selectedAvailability === "web-and-desktop"
                    ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-105"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10",
                )}
              >
                {isAndroidMode ? t("apps.webAndAndroid", undefined, "Web + Android") : t("apps.webAndDesktop", undefined, "Web + desktop")}
              </button>
              <button
                type="button"
                aria-pressed={selectedAvailability === "desktop-only"}
                onClick={() => setSelectedAvailability("desktop-only")}
                className={cn(
                  "px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300",
                  "border border-white/10 hover:border-white/20 flex items-center gap-2",
                  selectedAvailability === "desktop-only"
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)] scale-105"
                    : "bg-white/5 text-gray-400 hover:text-cyan-400 hover:bg-white/10",
                )}
              >
                {isAndroidMode ? (
                  <>
                    <Smartphone className="w-4 h-4" />
                    {t("apps.androidOnly", undefined, "Android only")}
                  </>
                ) : (
                  <>
                    <Monitor className="w-4 h-4" />
                    {t("apps.desktopOnly", undefined, "Desktop only")}
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        {/* Category Row 1: Player Modes */}
        <section aria-label={t("games.playerModes", undefined, "Player Modes")} className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wider">
              {t("games.playerModes", undefined, "Player Modes")}
            </h3>
            {(selectedMode !== "All" || selectedGenre !== "All") && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {t("games.clearFilters", undefined, "Clear Filters")}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-2.5">
            {MODE_DEFINITIONS.map((def) => {
              const count = modeCounts[def.id];
              const isSelected = selectedMode === def.id;
              const label = t(def.labelKey as any, undefined, def.defaultLabel);
              return (
                <button
                  key={def.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${label} (${count} games)`}
                  onClick={() => setSelectedMode(def.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-2 border",
                    isSelected
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700",
                    count === 0 && def.id !== "All" && "opacity-40 pointer-events-none",
                  )}
                >
                  {def.icon}
                  <span>{label}</span>
                  <span
                    className={cn(
                      "text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-semibold",
                      isSelected ? "bg-cyan-500/30 text-cyan-200" : "bg-slate-800 text-slate-400",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Category Row 2: Game Genres */}
        <section aria-label={t("games.genres", undefined, "Genres")} className="space-y-2.5">
          <h3 className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t("games.genres", undefined, "Genres")}
          </h3>
          <div className="flex flex-wrap gap-2 sm:gap-2.5">
            {GENRE_DEFINITIONS.map((def) => {
              const count = genreCounts[def.id];
              const isSelected = selectedGenre === def.id;
              const label = t(def.labelKey as any, undefined, def.defaultLabel);
              return (
                <button
                  key={def.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${label} (${count} games)`}
                  onClick={() => setSelectedGenre(def.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-2 border",
                    isSelected
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700",
                    count === 0 && def.id !== "All" && "opacity-40 pointer-events-none",
                  )}
                >
                  {def.icon}
                  <span>{label}</span>
                  <span
                    className={cn(
                      "text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-semibold",
                      isSelected ? "bg-cyan-500/30 text-cyan-200" : "bg-slate-800 text-slate-400",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg sm:text-xl font-semibold text-white">
              {selectedMode === "All" && selectedGenre === "All"
                ? t("games.allGames", undefined, "All Games")
                : `${selectedMode !== "All" ? selectedMode : ""} ${selectedGenre !== "All" ? selectedGenre : ""} ${t("games.title", undefined, "Games")}`.trim()}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400">
              {filteredGames.length} {filteredGames.length === 1 ? "game" : "games"}
            </span>
          </div>

          {filteredGames.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredGames.map((app) => (
                <Card
                  key={app.id}
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden flex flex-col justify-between"
                  onClick={() => handleAppClick(app)}
                >
                  <CardHeader className="p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
                      <div className="transition-transform group-hover:scale-110 shrink-0">
                        {app.icon}
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {app.modes.map((mode) => (
                          <span
                            key={mode}
                            className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700/60"
                          >
                            {t(`games.${mode.toLowerCase()}` as any, undefined, mode)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <CardTitle className="text-lg sm:text-xl text-white mb-1.5 sm:mb-2">
                      {app.name}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-slate-400 flex-1">
                      {app.description}
                    </CardDescription>
                    <div className="flex flex-wrap gap-1.5 pt-3 mt-auto">
                      {app.genres.map((genre) => (
                        <span
                          key={genre}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-cyan-950/40 text-cyan-400/90 border border-cyan-800/30"
                        >
                          {t(`games.${genre.toLowerCase()}` as any, undefined, genre)}
                        </span>
                      ))}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-xl p-6">
              <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium mb-1">
                {isDesktopMode && selectedAvailability === "desktop-only"
                  ? t("games.noDesktopGames", undefined, "No desktop-only games are available yet.")
                  : t("games.noFilteredGames", undefined, "No games found matching the selected filters.")}
              </p>
              {(selectedMode !== "All" || selectedGenre !== "All") && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="mt-4 px-4 py-2 text-xs sm:text-sm rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors"
                >
                  {t("games.clearFilters", undefined, "Clear Filters")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
