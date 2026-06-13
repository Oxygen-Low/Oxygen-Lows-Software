import { OauthApp } from "@/components/apps/Oauth";
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
  Users,
  ShieldCheck,
  Bot,
  Monitor
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCompressorApp } from "@/components/apps/FileCompressor";
import { AiScreenshareApp } from "@/components/apps/AiScreenshare";
import { useTranslation } from "react-i18next";

import { ChatbotApp } from "@/components/apps/Chatbot";

type Category = "All" | "Utility" | "LLM/AI" | "Development" | "Social" | "Games";

interface AppMetadata {
  id: string;
  name: string;
  nameKey: string;
  descriptionKey: string;
  categories: Category[];
  icon: React.ReactNode;
  component: React.ComponentType;
}

export default function Apps() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [activeApp, setActiveApp] = useState<AppMetadata | null>(null);

  const CATEGORIES: { name: Category; labelKey: string; icon: React.ReactNode; descriptionKey: string }[] = [
    { name: "All", labelKey: "apps.categories.all", icon: <Box className="w-5 h-5" />, descriptionKey: "apps.categories.allDesc" },
    { name: "Utility", labelKey: "apps.categories.utility", icon: <Wrench className="w-5 h-5" />, descriptionKey: "apps.categories.utilityDesc" },
    { name: "LLM/AI", labelKey: "apps.categories.ai", icon: <BrainCircuit className="w-5 h-5" />, descriptionKey: "apps.categories.aiDesc" },
    { name: "Development", labelKey: "apps.categories.dev", icon: <Code className="w-5 h-5" />, descriptionKey: "apps.categories.devDesc" },
    { name: "Social", labelKey: "apps.categories.social", icon: <MessageSquare className="w-5 h-5" />, descriptionKey: "apps.categories.socialDesc" },
    { name: "Games", labelKey: "apps.categories.games", icon: <Gamepad2 className="w-5 h-5" />, descriptionKey: "apps.categories.gamesDesc" },
  ];

  const apps: AppMetadata[] = [
    {
      id: "chatbot",
      name: "Chatbot",
      nameKey: "apps.chatbot.name",
      descriptionKey: "apps.chatbot.desc",
      categories: ["All", "LLM/AI"],
      icon: <Bot className="w-8 h-8 text-cyan-500" />,
      component: ChatbotApp,
    },
    {
      id: "ai-screenshare",
      name: "AI Screenshare",
      nameKey: "apps.screenshare.name",
      descriptionKey: "apps.screenshare.desc",
      categories: ["All", "LLM/AI"],
      icon: <Monitor className="w-8 h-8 text-cyan-500" />,
      component: AiScreenshareApp,
    },
    {
      id: "file-compressor",
      name: "File Compressor",
      nameKey: "apps.compressor.name",
      descriptionKey: "apps.compressor.desc",
      categories: ["All", "Utility"],
      icon: <Box className="w-8 h-8 text-cyan-500" />,
      component: FileCompressorApp,
    },
    {
      id: "oauth",
      name: "OAuth",
      nameKey: "apps.oauth.name",
      descriptionKey: "apps.oauth.desc",
      categories: ["All", "Development"],
      icon: <ShieldCheck className="w-8 h-8 text-cyan-500" />,
      component: OauthApp,
    },
  ];

  const filteredApps = useMemo(() => {
    if (selectedCategory === "All") return apps;
    return apps.filter((app) => app.categories.includes(selectedCategory));
  }, [selectedCategory, apps]);

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
            <h2 className="text-2xl font-bold text-white">{t(activeApp.nameKey)}</h2>
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
          <h2 className="text-3xl font-bold text-white mb-2">{t('nav.apps')}</h2>
          <p className="text-slate-400">{t('apps.description')}</p>
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
                    <CardTitle className="text-lg text-white">{t(cat.labelKey)}</CardTitle>
                    <CardDescription className="text-xs text-slate-500">{t(cat.descriptionKey)}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">
            {t('apps.activeCategory', { category: t(`apps.categories.${selectedCategory.toLowerCase().replace('/', '')}`) })}
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
                    <CardTitle className="text-xl text-white mb-2">{t(app.nameKey)}</CardTitle>
                    <CardDescription className="text-slate-400">
                      {t(app.descriptionKey)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
              <Box className="w-12 h-12 text-slate-700 mb-4" />
              <p className="text-slate-500 text-lg">{t('common.noItems')}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
