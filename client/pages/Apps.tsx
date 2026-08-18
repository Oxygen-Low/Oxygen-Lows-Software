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
  AppWindow,
  Wrench,
  MessageSquare,
  Code,
  Sparkles,
  Box,
  Users,
  Bot,
  QrCode,
  Server,
  Shield,
  Monitor,
  Smartphone,
  Braces,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCompressorApp } from "@/components/apps/FileCompressor";
import { ChatbotApp } from "@/components/apps/Chatbot";
import { PublicCharactersApp } from "@/components/apps/PublicCharacters";
import { DataSaveApp } from "@/components/apps/DataSave";
import { QRCodeGeneratorApp } from "@/components/apps/QRCodeGenerator";
import { LLMAgentApp } from "@/components/apps/LLMAgent";
import { VPNApp } from "@/components/apps/VPN";
import { Base64EncoderApp } from "@/components/apps/Base64Encoder";
import { JsonFormatterApp } from "@/components/apps/JsonFormatter";
import { DefenderApp } from "@/components/apps/WebDefender";

type Category =
  | "All"
  | "Utility"
  | "LLM/AI"
  | "Development"
  | "Social"
  | "Security";

type Availability = "web-and-desktop" | "desktop-only";

interface AppMetadata {
  id: string;
  nameKey: string;
  defaultName: string;
  descKey: string;
  defaultDesc: string;
  categories: Category[];
  availability: Availability;
  icon: React.ReactNode;
  component: React.ComponentType;
  authRequired?: boolean;
  requiresAdmin?: boolean;
  androidSupported?: boolean;
}

const CATEGORY_DEFINITIONS: {
  name: Category;
  labelKey: string;
  defaultLabel: string;
  icon: React.ReactNode;
  descKey: string;
  defaultDesc: string;
}[] = [
  {
    name: "All",
    labelKey: "apps.categoryAll",
    defaultLabel: "All",
    icon: <Box className="w-5 h-5" />,
    descKey: "apps.categoryAllDesc",
    defaultDesc: "All available applications",
  },
  {
    name: "Utility",
    labelKey: "apps.categoryUtility",
    defaultLabel: "Utility",
    icon: <Wrench className="w-5 h-5" />,
    descKey: "apps.categoryUtilityDesc",
    defaultDesc: "Tools and utilities",
  },
  {
    name: "LLM/AI",
    labelKey: "apps.categoryAI",
    defaultLabel: "LLM/AI",
    icon: <Sparkles className="w-5 h-5" />,
    descKey: "apps.categoryAIDesc",
    defaultDesc: "AI powered applications",
  },
  {
    name: "Development",
    labelKey: "apps.categoryDevelopment",
    defaultLabel: "Development",
    icon: <Code className="w-5 h-5" />,
    descKey: "apps.categoryDevelopmentDesc",
    defaultDesc: "Developer tools",
  },
  {
    name: "Social",
    labelKey: "apps.categorySocial",
    defaultLabel: "Social",
    icon: <MessageSquare className="w-5 h-5" />,
    descKey: "apps.categorySocialDesc",
    defaultDesc: "Connect with others",
  },
  {
    name: "Security",
    labelKey: "apps.categorySecurity",
    defaultLabel: "Security",
    icon: <Shield className="w-5 h-5" />,
    descKey: "apps.categorySecurityDesc",
    defaultDesc: "Protection for software and devices.",
  },
];

const APPS: AppMetadata[] = [
  {
    id: "base64-encoder",
    nameKey: "apps.base64Title",
    defaultName: "Base64 Encoder/Decoder",
    descKey: "apps.base64Desc",
    defaultDesc: "Easily encode or decode text and data using Base64.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Code className="w-8 h-8 text-cyan-500" />,
    component: Base64EncoderApp,
  },
  {
    id: "json-formatter",
    nameKey: "apps.jsonFormatterTitle",
    defaultName: "JSON Formatter",
    descKey: "apps.jsonFormatterDesc",
    defaultDesc: "Format, beautify, and validate JSON strings.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Braces className="w-8 h-8 text-cyan-500" />,
    component: JsonFormatterApp,
  },
  {
    id: "chatbot",
    nameKey: "apps.chatbotTitle",
    defaultName: "Chatbot",
    descKey: "apps.chatbotDesc",
    defaultDesc: "Chat and brainstorm with intelligent AI assistants.",
    categories: ["All", "LLM/AI"],
    availability: "web-and-desktop",
    icon: <Bot className="w-8 h-8 text-cyan-500" />,
    component: ChatbotApp,
  },
  {
    id: "file-compressor",
    nameKey: "apps.fileCompressorTitle",
    defaultName: "File Compressor",
    descKey: "apps.fileCompressorDesc",
    defaultDesc: "Easily compress your files to free up storage space.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <Box className="w-8 h-8 text-cyan-500" />,
    component: FileCompressorApp,
  },
  {
    id: "public-characters",
    nameKey: "apps.publicCharactersTitle",
    defaultName: "Public Characters",
    descKey: "apps.publicCharactersDesc",
    defaultDesc: "Discover, download, and share characters and universes with the community.",
    categories: ["All", "Social"],
    availability: "web-and-desktop",
    icon: <Users className="w-8 h-8 text-cyan-500" />,
    component: PublicCharactersApp,
    authRequired: true,
  },
  {
    id: "data-save",
    nameKey: "apps.dataSaveTitle",
    defaultName: "Data Save",
    descKey: "apps.dataSaveDesc",
    defaultDesc: "Securely store and manage your custom data and text snippets.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Server className="w-8 h-8 text-cyan-500" />,
    component: DataSaveApp,
    authRequired: true,
  },
  {
    id: "qrcode-generator",
    nameKey: "apps.qrcodeGeneratorTitle",
    defaultName: "QR Code Generator",
    descKey: "apps.qrcodeGeneratorDesc",
    defaultDesc: "Convert links or text into custom QR codes.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <QrCode className="w-8 h-8 text-cyan-500" />,
    component: QRCodeGeneratorApp,
  },
  {
    id: "llm-agent",
    nameKey: "apps.llmAgentTitle",
    defaultName: "LLM Agent",
    descKey: "apps.llmAgentDesc",
    defaultDesc: "An autonomous AI coding agent that reads, edits, and builds your projects.",
    categories: ["All", "LLM/AI", "Development"],
    availability: "desktop-only",
    icon: <Sparkles className="w-8 h-8 text-cyan-500" />,
    component: LLMAgentApp,
    authRequired: true,
  },
  {
    id: "vpn",
    nameKey: "apps.vpnTitle",
    defaultName: "VPN",
    descKey: "apps.vpnDesc",
    defaultDesc: "Manage your VPN configurations.",
    categories: ["All", "Utility"],
    availability: "desktop-only",
    icon: <Shield className="w-8 h-8 text-cyan-500" />,
    component: VPNApp,
    requiresAdmin: true,
    androidSupported: true,
  },
  {
    id: "webdefender",
    nameKey: "apps.webDefenderTitle",
    defaultName: "Web Defender",
    descKey: "apps.webDefenderDesc",
    defaultDesc: "Protect your website or API from DDoS, injection attacks, bots, VPNs, and malicious traffic.",
    categories: ["All", "Security", "Development"],
    availability: "web-and-desktop",
    icon: <ShieldCheck className="w-8 h-8 text-cyan-500" />,
    component: DefenderApp,
    authRequired: true,
  },
];

export default function Apps() {
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

  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [selectedAvailability, setSelectedAvailability] =
    useState<Availability>("web-and-desktop");
  
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const localizedApps = useMemo(() => {
    return APPS.map((app) => ({
      ...app,
      name: t(app.nameKey as any, undefined, app.defaultName),
      description: t(app.descKey as any, undefined, app.defaultDesc),
    }));
  }, [t]);

  const activeApp = useMemo(
    () => localizedApps.find((a) => a.id === appId) || null,
    [appId, localizedApps],
  );

  const availableApps = useMemo(
    () =>
      localizedApps.filter((app) => {
        if (!isDesktopMode && !isAndroidMode) return app.availability === "web-and-desktop";
        if (isAndroidMode && app.availability === "desktop-only" && !app.androidSupported) return false;
        if (selectedAvailability === "web-and-desktop") return true;
        return app.availability === "desktop-only";
      }),
    [isDesktopMode, isAndroidMode, selectedAvailability, localizedApps],
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
      Security: 0,
    };
    availableApps.forEach((app) => {
      app.categories.forEach((cat) => {
        if (cat !== "All") counts[cat]++;
      });
    });
    return counts;
  }, [availableApps]);

  const localizedCategories = useMemo(
    () =>
      CATEGORY_DEFINITIONS.map((cat) => ({
        ...cat,
        label: t(cat.labelKey as any, undefined, cat.defaultLabel),
        description: t(cat.descKey as any, undefined, cat.defaultDesc),
      })),
    [t],
  );

  const handleAppClick = (app: typeof localizedApps[0]) => {
    if (app.requiresAdmin && isDesktopMode && (window as any).chrome?.webview) {
      const id = Date.now().toString();
      const listener = (event: any) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data.id === id) {
            (window as any).chrome.webview.removeEventListener("message", listener);
            if (data.success) {
              navigate(`/apps/${app.id}`);
            } else {
              import("sonner").then((m) => m.toast.error(t("apps.adminRequired", undefined, "Administrator permissions are required to use this app.")));
            }
          }
        } catch {}
      };
      (window as any).chrome.webview.addEventListener("message", listener);
      (window as any).chrome.webview.postMessage(JSON.stringify({ command: "require_admin", id }));
      
      // Fallback timeout in case no response
      setTimeout(() => {
        (window as any).chrome.webview.removeEventListener("message", listener);
      }, 5000);
    } else {
      navigate(`/apps/${app.id}`);
    }
  };

  if (activeApp) {
    const AppComponent = activeApp.component;
    const isFullWidthApp = activeApp.id === "chatbot" || activeApp.id === "llm-agent" || activeApp.id === "vpn";

    return (
      <Layout fullWidth={isFullWidthApp}>
        <div className={isFullWidthApp ? "h-full w-full flex flex-col" : "space-y-6 h-full flex flex-col"}>
          {!isFullWidthApp && (
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 shrink-0">
              <button
                onClick={() => navigate("/apps")}
                aria-label={t("apps.backToApps", undefined, "Back to apps list")}
                title={t("apps.backToApps", undefined, "Back to apps list")}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none shrink-0"
              >
                <AppWindow className="w-5 h-5 sm:w-6 sm:h-6" />
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
                  {t("apps.signInToUse", { name: activeApp.name }, `Sign in to use ${activeApp.name}`)}
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
            {t("apps.title", undefined, "Apps")}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {t("apps.subtitle", undefined, "Explore and try out our collection of awesome tools!")}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {localizedCategories.map((cat) => {
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
                <CardHeader className="flex flex-row items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
                  <div
                    className={cn(
                      "p-2 rounded-lg bg-slate-800 text-slate-300 shrink-0",
                      selectedCategory === cat.name &&
                        "bg-cyan-500/10 text-cyan-400",
                    )}
                  >
                    {cat.icon}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg text-white truncate">
                      {cat.label}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 line-clamp-1">
                      {cat.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg sm:text-xl font-semibold text-white">
            {`${selectedCategory} ${isDesktopMode ? `${selectedAvailability === "desktop-only" ? t("apps.desktopOnly", undefined, "Desktop only") : t("apps.webAndDesktop", undefined, "Web + desktop")} ` : ""}${t("apps.title", undefined, "Apps")}`}
          </h3>

          {filteredApps.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredApps.map((app) => (
                <Card
                  key={app.id}
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden"
                  onClick={() => handleAppClick(app)}
                >
                  <CardHeader className="p-4 sm:p-6">
                    <div className="mb-3 sm:mb-4 transition-transform group-hover:scale-110">
                      {app.icon}
                    </div>
                    <CardTitle className="text-lg sm:text-xl text-white mb-1.5 sm:mb-2">
                      {app.name}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-slate-400">
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
                  ? t("apps.noDesktopApps", undefined, "No desktop-only apps are available yet.")
                  : t("apps.noAppsFound", undefined, "No apps found in this category.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
