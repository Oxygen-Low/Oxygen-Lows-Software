import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AppWindow,
  Wrench,
  MessageSquare,
  Code,
  BrainCircuit,
  Box,
  Users,
  Bot,
  Gamepad2,
  QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCompressorApp } from "@/components/apps/FileCompressor";
import { ChatbotApp } from "@/components/apps/Chatbot";
import { PublicCharactersApp } from "@/components/apps/PublicCharacters";
import { DataSaveApp } from "@/components/apps/DataSave";
import { QRCodeGeneratorApp } from "@/components/apps/QRCodeGenerator";
import { LLMAgentApp } from "@/components/apps/LLMAgent";
import { Server } from "lucide-react";

type Category =
  "All" | "Utility" | "LLM/AI" | "Development" | "Social" | "Games";

type Availability = "web-and-desktop" | "desktop-only";

interface AppMetadata {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  availability: Availability;
  icon: React.ReactNode;
  component: React.ComponentType;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Moved static configurations (`CATEGORIES` and `apps`) outside of the `Apps` component body.
 * This prevents the recreation of these large arrays (and their internal JSX elements) on every render,
 * saving memory allocations and preventing unnecessary recalculations in downstream useMemo hooks.
 */
const CATEGORIES: {
  name: Category;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    name: "All",
    label: "All",
    icon: <Box className="w-5 h-5" />,
    description: "All available applications",
  },
  {
    name: "Utility",
    label: "Utility",
    icon: <Wrench className="w-5 h-5" />,
    description: "Tools and utilities",
  },
  {
    name: "LLM/AI",
    label: "LLM/AI",
    icon: <BrainCircuit className="w-5 h-5" />,
    description: "AI powered applications",
  },
  {
    name: "Development",
    label: "Development",
    icon: <Code className="w-5 h-5" />,
    description: "Developer tools",
  },
  {
    name: "Social",
    label: "Social",
    icon: <MessageSquare className="w-5 h-5" />,
    description: "Connect with others",
  },
  {
    name: "Games",
    label: "Games",
    icon: <Gamepad2 className="w-5 h-5" />,
    description: "Fun and games",
  },
];

const apps: AppMetadata[] = [
  {
    id: "chatbot",
    name: "Chatbot",
    description: "Chat and brainstorm with intelligent AI assistants.",
    categories: ["All", "LLM/AI"],
    availability: "web-and-desktop",
    icon: <Bot className="w-8 h-8 text-cyan-500" />,
    component: ChatbotApp,
  },
  {
    id: "file-compressor",
    name: "File Compressor",
    description: "Easily compress your files to free up storage space.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <Box className="w-8 h-8 text-cyan-500" />,
    component: FileCompressorApp,
  },
  {
    id: "public-characters",
    name: "Public Characters",
    description:
      "Discover, download, and share characters and universes with the community.",
    categories: ["All", "Social"],
    availability: "web-and-desktop",
    icon: <Users className="w-8 h-8 text-cyan-500" />,
    component: PublicCharactersApp,
  },
  {
    id: "data-save",
    name: "Data Save",
    description:
      "Securely store and manage your custom data and text snippets.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Server className="w-8 h-8 text-cyan-500" />,
    component: DataSaveApp,
  },
  {
    id: "qrcode-generator",
    name: "QR Code Generator",
    description: "Convert links or text into custom QR codes.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <QrCode className="w-8 h-8 text-cyan-500" />,
    component: QRCodeGeneratorApp,
  },
  {
    id: "llm-agent",
    name: "LLM Agent",
    description:
      "An autonomous AI coding agent that reads, edits, and builds your projects.",
    categories: ["All", "LLM/AI", "Development"],
    availability: "desktop-only",
    icon: <BrainCircuit className="w-8 h-8 text-cyan-500" />,
    component: LLMAgentApp,
  },
];

export default function Apps() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasDesktopParam = searchParams.get("desktop") === "1";

  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    return hasDesktopParam || sessionStorage.getItem("desktopMode") === "1";
  });

  useEffect(() => {
    if (hasDesktopParam) {
      sessionStorage.setItem("desktopMode", "1");
      setIsDesktopMode(true);
    }
  }, [hasDesktopParam]);

  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [selectedAvailability, setSelectedAvailability] =
    useState<Availability>("web-and-desktop");

  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const activeApp = useMemo(
    () => apps.find((a) => a.id === appId) || null,
    [appId],
  );

  const availableApps = useMemo(
    () =>
      apps.filter((app) => {
        if (!isDesktopMode) return app.availability === "web-and-desktop";
        if (selectedAvailability === "web-and-desktop") return true;
        return app.availability === "desktop-only";
      }),
    [isDesktopMode, selectedAvailability],
  );

  const filteredApps = useMemo(() => {
    if (selectedCategory === "All") return availableApps;
    return availableApps.filter((app) =>
      app.categories.includes(selectedCategory),
    );
  }, [selectedCategory, availableApps]);

  const categoryAppCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      All: availableApps.length,
      Utility: 0,
      "LLM/AI": 0,
      Development: 0,
      Social: 0,
      Games: 0,
    };
    availableApps.forEach((app) => {
      app.categories.forEach((cat) => {
        if (cat !== "All") counts[cat]++;
      });
    });
    return counts;
  }, [availableApps]);

  if (activeApp) {
    const AppComponent = activeApp.component;
    const isFullWidthApp =
      activeApp.id === "chatbot" || activeApp.id === "llm-agent";

    return (
      <Layout fullWidth={isFullWidthApp}>
        <div
          className={
            isFullWidthApp ? "h-full w-full flex flex-col" : "space-y-6"
          }
        >
          {!isFullWidthApp && (
            <div className="flex items-center gap-4 mb-8">
              <button
                onClick={() => navigate("/apps")}
                aria-label="Back to apps list"
                title="Back to apps list"
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
              >
                <AppWindow className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white">
                {activeApp.name}
              </h2>
            </div>
          )}
          <AppComponent />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Apps</h2>
          <p className="text-slate-400">
            Explore and try out our collection of awesome tools!
          </p>
        </div>

        {isDesktopMode && (
          <section aria-label="App availability" className="space-y-3">
            <h3 className="text-xl font-semibold text-white">Availability</h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                aria-pressed={selectedAvailability === "web-and-desktop"}
                onClick={() => setSelectedAvailability("web-and-desktop")}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition",
                  selectedAvailability === "web-and-desktop"
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                )}
              >
                Web + desktop
              </button>
              <button
                type="button"
                aria-pressed={selectedAvailability === "desktop-only"}
                onClick={() => setSelectedAvailability("desktop-only")}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition",
                  selectedAvailability === "desktop-only"
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
                )}
              >
                Desktop only
              </button>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const hasApps = categoryAppCounts[cat.name] > 0;
            return (
              <Card
                key={cat.name}
                aria-label={`${cat.label} (${categoryAppCounts[cat.name]} apps)`}
                className={cn(
                  "cursor-pointer transition-all border-slate-800 bg-slate-900/50 hover:bg-slate-900",
                  selectedCategory === cat.name &&
                    "ring-2 ring-cyan-500 border-transparent",
                  !hasApps &&
                    cat.name !== "All" &&
                    "opacity-50 grayscale-[0.5]",
                )}
                onClick={() => setSelectedCategory(cat.name)}
              >
                <CardHeader className="flex flex-row items-center gap-4 p-4">
                  <div
                    className={cn(
                      "p-2 rounded-lg bg-slate-800 text-slate-300",
                      selectedCategory === cat.name &&
                        "bg-cyan-500/10 text-cyan-400",
                    )}
                  >
                    {cat.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">
                      {cat.label}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      {cat.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">
            {`${selectedCategory} ${isDesktopMode ? `${selectedAvailability === "desktop-only" ? "Desktop only" : "Web + desktop"} ` : ""}Apps`}
          </h3>

          {filteredApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApps.map((app) => (
                <Card
                  key={app.id}
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden"
                  onClick={() => navigate(`/apps/${app.id}`)}
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
                  ? "No desktop-only apps are available yet."
                  : "No apps found in this category."}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
