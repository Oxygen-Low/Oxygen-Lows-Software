import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AppWindow,
  Wrench,
  MessageSquare,
  Gamepad2,
  Code,
  BrainCircuit,
  Box,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCompressorApp } from "@/components/apps/FileCompressor";
import { FriendsApp } from "@/components/apps/Friends";

type Category = "All" | "Utility" | "LLM/AI" | "Development" | "Social" | "Games";

interface AppMetadata {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  icon: React.ReactNode;
  component: React.ComponentType;
}

const CATEGORIES: { name: Category; icon: React.ReactNode; description: string }[] = [
  { name: "All", icon: <Box className="w-5 h-5" />, description: "All available applications" },
  { name: "Utility", icon: <Wrench className="w-5 h-5" />, description: "Tools and utilities" },
  { name: "LLM/AI", icon: <BrainCircuit className="w-5 h-5" />, description: "AI powered applications" },
  { name: "Development", icon: <Code className="w-5 h-5" />, description: "Developer tools" },
  { name: "Social", icon: <MessageSquare className="w-5 h-5" />, description: "Connect with others" },
  { name: "Games", icon: <Gamepad2 className="w-5 h-5" />, description: "Fun and games" },
];

export default function Apps() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [activeApp, setActiveApp] = useState<AppMetadata | null>(null);

  const apps: AppMetadata[] = [
    {
      id: "friends",
      name: "Friends",
      description: "Manage your friends, followers, and social connections.",
      categories: ["All", "Social"],
      icon: <Users className="w-8 h-8 text-cyan-500" />,
      component: FriendsApp,
    },
    {
      id: "file-compressor",
      name: "File Compressor",
      description: "Compress images and audio files to save storage space.",
      categories: ["All", "Utility"],
      icon: <Box className="w-8 h-8 text-cyan-500" />,
      component: FileCompressorApp,
    },
  ];

  const filteredApps = useMemo(() => {
    if (selectedCategory === "All") return apps;
    return apps.filter((app) => app.categories.includes(selectedCategory));
  }, [selectedCategory]);

  const categoryAppCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      "All": apps.length,
      "Utility": 0,
      "LLM/AI": 0,
      "Development": 0,
      "Social": 0,
      "Games": 0,
    };
    apps.forEach(app => {
      app.categories.forEach(cat => {
        if (cat !== "All") counts[cat]++;
      });
    });
    return counts;
  }, [apps]);

  if (activeApp) {
    const AppComponent = activeApp.component;
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveApp(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <AppWindow className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-white">{activeApp.name}</h2>
          </div>
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
          <p className="text-slate-400">Discover and use various applications within the platform.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const hasApps = categoryAppCounts[cat.name] > 0;
            return (
              <Card
                key={cat.name}
                className={cn(
                  "cursor-pointer transition-all border-slate-800 bg-slate-900/50 hover:bg-slate-900",
                  selectedCategory === cat.name && "ring-2 ring-cyan-500 border-transparent",
                  !hasApps && cat.name !== "All" && "opacity-50 grayscale-[0.5]"
                )}
                onClick={() => setSelectedCategory(cat.name)}
              >
                <CardHeader className="flex flex-row items-center gap-4 p-4">
                  <div className={cn(
                    "p-2 rounded-lg bg-slate-800 text-slate-300",
                    selectedCategory === cat.name && "bg-cyan-500/10 text-cyan-400"
                  )}>
                    {cat.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">{cat.name}</CardTitle>
                    <CardDescription className="text-xs text-slate-500">{cat.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">
            {selectedCategory} Apps
          </h3>

          {filteredApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredApps.map((app) => (
                <Card
                  key={app.id}
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden"
                  onClick={() => setActiveApp(app)}
                >
                  <CardHeader className="p-6">
                    <div className="mb-4 transition-transform group-hover:scale-110">
                      {app.icon}
                    </div>
                    <CardTitle className="text-xl text-white mb-2">{app.name}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {app.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
              <Box className="w-12 h-12 text-slate-700 mb-4" />
              <p className="text-slate-500 text-lg">No apps available in this category yet.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
