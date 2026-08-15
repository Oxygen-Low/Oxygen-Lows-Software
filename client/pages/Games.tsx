import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
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
  Grid3x3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MinesweeperApp } from "@/components/apps/Minesweeper";
import { SolitaireApp } from "@/components/apps/Solitaire";
import { ChessApp } from "@/components/apps/Chess";
import { PokerApp } from "@/components/apps/Poker";
import { SudokuApp } from "@/components/apps/Sudoku";
import { CrosswordApp } from "@/components/apps/Crossword";
import { WordSearchApp } from "@/components/apps/WordSearch";

type Category = "All";

type Availability = "web-and-desktop" | "desktop-only";

interface AppMetadata {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  availability: Availability;
  icon: React.ReactNode;
  component: React.ComponentType;
  authRequired?: boolean;
  requiresAdmin?: boolean;
  androidSupported?: boolean;
}

const apps: AppMetadata[] = [
  {
    id: "chess",
    name: "Chess",
    description: "Play a game of chess against an AI opponent.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Crown className="w-8 h-8 text-cyan-500" />,
    component: ChessApp,
  },
  {
    id: "minesweeper",
    name: "Minesweeper",
    description: "The classic game of Minesweeper. Clear the board without detonating any mines!",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Bomb className="w-8 h-8 text-cyan-500" />,
    component: MinesweeperApp,
  },
  {
    id: "solitaire",
    name: "Solitaire",
    description: "Play the classic Klondike Solitaire card game.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Spade className="w-8 h-8 text-green-500" />,
    component: SolitaireApp,
  },
  {
    id: "poker",
    name: "Texas Hold'em",
    description: "Play Heads-Up Texas Hold'em against an AI opponent.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Gamepad2 className="w-8 h-8 text-yellow-500" />,
    component: PokerApp,
  },
  {
    id: "sudoku",
    name: "Sudoku",
    description: "Challenge your mind with the classic numbers puzzle.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Grid3x3 className="w-8 h-8 text-indigo-400" />,
    component: SudokuApp,
  },
  {
    id: "crossword",
    name: "Crossword",
    description: "Solve a fun mini crossword puzzle.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Grid3x3 className="w-8 h-8 text-cyan-500" />,
    component: CrosswordApp,
  },
  {
    id: "wordsearch",
    name: "Word Search",
    description: "Find hidden words in a grid of letters.",
    categories: ["All"],
    availability: "web-and-desktop",
    icon: <Type className="w-8 h-8 text-indigo-500" />,
    component: WordSearchApp,
  },
];

export default function Games() {
  const { session } = useAuth();
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

  const [selectedAvailability, setSelectedAvailability] =
    useState<Availability>("web-and-desktop");
  
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const activeApp = useMemo(() => apps.find(a => a.id === appId) || null, [appId]);

  const availableApps = useMemo(
    () =>
      apps.filter((app) => {
        if (!isDesktopMode && !isAndroidMode) return app.availability === "web-and-desktop";
        if (isAndroidMode && app.availability === "desktop-only" && !app.androidSupported) return false;
        if (selectedAvailability === "web-and-desktop") return true;
        return app.availability === "desktop-only";
      }),
    [isDesktopMode, isAndroidMode, selectedAvailability],
  );

  const handleAppClick = (app: AppMetadata) => {
    navigate(`/games/${app.id}`);
  };

  if (activeApp) {
    const AppComponent = activeApp.component;
    const isFullWidthApp = false;

    return (
      <Layout fullWidth={isFullWidthApp}>
        <div className={isFullWidthApp ? "h-full w-full flex flex-col" : "space-y-6 h-full flex flex-col"}>
          {!isFullWidthApp && (
            <div className="flex items-center gap-4 mb-8 shrink-0">
              <button
                onClick={() => navigate("/games")}
                aria-label="Back to games list"
                title="Back to games list"
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
              >
                <Gamepad2 className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white">{activeApp.name}</h2>
            </div>
          )}
          
          <div className="relative flex-1 w-full h-full min-h-[500px]">
            {!session && activeApp.authRequired && (
              <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-slate-800 p-6">
                <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-6 text-cyan-500">
                  {activeApp.icon}
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Sign in to play {activeApp.name}</h3>
                <p className="text-slate-400 mb-8 max-w-md text-center">{activeApp.description}</p>
                <button 
                  onClick={() => navigate("/auth")} 
                  className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
                >
                  Sign In to Continue
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
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Games</h2>
          <p className="text-slate-400">
            Enjoy our collection of fun games!
          </p>
        </div>
        
        {isDesktopMode && (
          <section aria-label="Game availability" className="space-y-3">
            <h3 className="text-xl font-semibold text-white">Availability</h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                aria-pressed={selectedAvailability === "web-and-desktop"}
                onClick={() => setSelectedAvailability("web-and-desktop")}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                  "border border-white/10 hover:border-white/20",
                  selectedAvailability === "web-and-desktop"
                    ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-105"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10",
                )}
              >
                {isAndroidMode ? "Web + Android" : "Web + desktop"}
              </button>
              <button
                type="button"
                aria-pressed={selectedAvailability === "desktop-only"}
                onClick={() => setSelectedAvailability("desktop-only")}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                  "border border-white/10 hover:border-white/20 flex items-center gap-2",
                  selectedAvailability === "desktop-only"
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)] scale-105"
                    : "bg-white/5 text-gray-400 hover:text-cyan-400 hover:bg-white/10",
                )}
              >
                {isAndroidMode ? (
                  <>
                    <Smartphone className="w-4 h-4" />
                    Android only
                  </>
                ) : (
                  <>
                    <Monitor className="w-4 h-4" />
                    Desktop only
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">
            Available Games
          </h3>

          {availableApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableApps.map((app) => (
                <Card
                  key={app.id}
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden"
                  onClick={() => handleAppClick(app)}
                >
                  <CardHeader className="p-6">
                    <div className="mb-4 transition-transform group-hover:scale-110">
                      {app.icon}
                    </div>
                    <CardTitle className="text-xl text-white mb-2">
                      {app.name}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {app.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500">
                {isDesktopMode && selectedAvailability === "desktop-only"
                  ? "No desktop-only games are available yet."
                  : "No games found."}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
