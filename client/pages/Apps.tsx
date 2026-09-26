import { useState, useMemo, useEffect, Suspense, lazy } from "react";
import { useLocation, useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
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
  Globe,
  KeyRound,
  Gamepad2,
  ClipboardList,
  Palette,
  Paintbrush,
  ImagePlus,
  Scissors,
  Search,
  X,
  Cpu,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FileCompressorApp = lazy(() =>
  import("@/components/apps/FileCompressor").then((m) => ({
    default: m.FileCompressorApp,
  })),
);
const FileConverterApp = lazy(() =>
  import("@/components/apps/FileConverter").then((m) => ({
    default: m.FileConverterApp,
  })),
);
const FileTrimmerApp = lazy(() =>
  import("@/components/apps/FileTrimmer").then((m) => ({
    default: m.FileTrimmerApp,
  })),
);
const ChatbotApp = lazy(() =>
  import("@/components/apps/Chatbot").then((m) => ({
    default: m.ChatbotApp,
  })),
);
const ImageGeneratorApp = lazy(() =>
  import("@/components/apps/ImageGenerator").then((m) => ({
    default: m.ImageGeneratorApp,
  })),
);
const PublicAssetsApp = lazy(() =>
  import("@/components/apps/PublicAssets").then((m) => ({
    default: m.PublicAssetsApp,
  })),
);
const DataSaveApp = lazy(() =>
  import("@/components/apps/DataSave").then((m) => ({
    default: m.DataSaveApp,
  })),
);
const QRCodeGeneratorApp = lazy(() =>
  import("@/components/apps/QRCodeGenerator").then((m) => ({
    default: m.QRCodeGeneratorApp,
  })),
);
const LLMAgentApp = lazy(() =>
  import("@/components/apps/LLMAgent").then((m) => ({
    default: m.LLMAgentApp,
  })),
);
const VPNApp = lazy(() =>
  import("@/components/apps/VPN").then((m) => ({
    default: m.VPNApp,
  })),
);
const Base64EncoderApp = lazy(() =>
  import("@/components/apps/Base64Encoder").then((m) => ({
    default: m.Base64EncoderApp,
  })),
);
const JsonFormatterApp = lazy(() =>
  import("@/components/apps/JsonFormatter").then((m) => ({
    default: m.JsonFormatterApp,
  })),
);
const DefenderApp = lazy(() =>
  import("@/components/apps/WebDefender").then((m) => ({
    default: m.DefenderApp,
  })),
);
const PasswordManagerApp = lazy(() =>
  import("@/components/apps/PasswordManager").then((m) => ({
    default: m.PasswordManagerApp,
  })),
);
const GameLibraryApp = lazy(() =>
  import("@/components/apps/GameLibrary").then((m) => ({
    default: m.GameLibraryApp,
  })),
);
const SurveysApp = lazy(() =>
  import("@/components/apps/Surveys").then((m) => ({
    default: m.SurveysApp,
  })),
);
const ImageStudioApp = lazy(() =>
  import("@/components/apps/ImageStudio").then((m) => ({
    default: m.ImageStudioApp,
  })),
);
const PixelArtStudioApp = lazy(() =>
  import("@/components/apps/PixelArtStudio").then((m) => ({
    default: m.PixelArtStudioApp,
  })),
);
const ThreeDStudioApp = lazy(() =>
  import("@/components/studio3d/ThreeDStudioApp").then((m) => ({
    default: m.ThreeDStudioApp,
  })),
);
const WebBrowserApp = lazy(() =>
  import("@/components/apps/WebBrowser").then((m) => ({
    default: m.WebBrowserApp,
  })),
);
const WebmasterApp = lazy(() =>
  import("@/components/apps/Webmaster").then((m) => ({
    default: m.WebmasterApp,
  })),
);
const DeveloperAuthApp = lazy(() =>
  import("@/components/apps/DeveloperAuth").then((m) => ({
    default: m.DeveloperAuthApp,
  })),
);
const ChatApp = lazy(() =>
  import("@/components/apps/Chat").then((m) => ({
    default: m.ChatApp,
  })),
);
const ModelsApp = lazy(() =>
  import("@/components/apps/Models").then((m) => ({
    default: m.ModelsApp,
  })),
);

type Category =
  "All" | "Utility" | "LLM/AI" | "Development" | "Social" | "Security";

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
    id: "chat",
    nameKey: "apps.chatTitle",
    defaultName: "Chat",
    descKey: "apps.chatDesc",
    defaultDesc:
      "Connect with friends and communities in encrypted chat spaces with direct P2P voice & video calling.",
    categories: ["All", "Social"],
    availability: "web-and-desktop",
    icon: <MessageSquare className="w-8 h-8 text-cyan-500" />,
    component: ChatApp,
  },
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
    id: "image-generator",
    nameKey: "apps.imageGeneratorTitle",
    defaultName: "AI Image Generator",
    descKey: "apps.imageGeneratorDesc",
    defaultDesc:
      "Generate high-quality visuals using AI Horde SFW community workers.",
    categories: ["All", "LLM/AI", "Utility"],
    availability: "web-and-desktop",
    icon: <ImagePlus className="w-8 h-8 text-cyan-500" />,
    component: ImageGeneratorApp,
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
    id: "file-converter",
    nameKey: "apps.fileConverterTitle",
    defaultName: "File Converter",
    descKey: "apps.fileConverterDesc",
    defaultDesc:
      "Convert Images, Audio, and Video files locally in your browser.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <Box className="w-8 h-8 text-cyan-500" />,
    component: FileConverterApp,
  },
  {
    id: "file-trimmer",
    nameKey: "apps.fileTrimmerTitle",
    defaultName: "File Trimmer",
    descKey: "apps.fileTrimmerDesc",
    defaultDesc: "Trim Audio and Video files locally in your browser.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <Scissors className="w-8 h-8 text-cyan-500" />,
    component: FileTrimmerApp,
  },
  {
    id: "public-assets",
    nameKey: "apps.publicAssetsTitle",
    defaultName: "Public Assets",
    descKey: "apps.publicAssetsDesc",
    defaultDesc:
      "Discover, download, and share assets, characters, and universes with the community.",
    categories: ["All", "Social", "Utility"],
    availability: "web-and-desktop",
    icon: <Users className="w-8 h-8 text-cyan-500" />,
    component: PublicAssetsApp,
    authRequired: true,
  },
  {
    id: "data-save",
    nameKey: "apps.dataSaveTitle",
    defaultName: "Data Save",
    descKey: "apps.dataSaveDesc",
    defaultDesc:
      "Securely store and manage your custom data and text snippets.",
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
    defaultDesc:
      "An autonomous AI coding agent that reads, edits, and builds your projects.",
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
    defaultDesc:
      "Protect your website or API from DDoS, injection attacks, bots, VPNs, and malicious traffic.",
    categories: ["All", "Security", "Development"],
    availability: "web-and-desktop",
    icon: <ShieldCheck className="w-8 h-8 text-cyan-500" />,
    component: DefenderApp,
    authRequired: true,
  },
  {
    id: "developer-auth",
    nameKey: "apps.developerAuthTitle",
    defaultName: "Developer Auth",
    descKey: "apps.developerAuthDesc",
    defaultDesc:
      "Create and manage OAuth 2.0 authentication applications, API keys, scopes, and user permissions for Oxygen Low's Software.",
    categories: ["All", "Development", "Security"],
    availability: "web-and-desktop",
    icon: <KeyRound className="w-8 h-8 text-cyan-500" />,
    component: DeveloperAuthApp,
    authRequired: true,
  },
  {
    id: "password-manager",
    nameKey: "apps.passwordManagerTitle",
    defaultName: "Password Manager",
    descKey: "apps.passwordManagerDesc",
    defaultDesc:
      "Securely store and manage passwords with AES-256 zero-knowledge encryption.",
    categories: ["All", "Security", "Utility"],
    availability: "web-and-desktop",
    icon: <KeyRound className="w-8 h-8 text-cyan-500" />,
    component: PasswordManagerApp,
    authRequired: true,
  },
  {
    id: "game-library",
    nameKey: "apps.gameLibraryTitle",
    defaultName: "Game Library",
    descKey: "apps.gameLibraryDesc",
    defaultDesc:
      "Unified desktop launcher for Steam, Epic, Xbox, EA, GOG, Ubisoft, and custom games.",
    categories: ["All", "Social", "Utility"],
    availability: "desktop-only",
    icon: <Gamepad2 className="w-8 h-8 text-cyan-500" />,
    component: GameLibraryApp,
  },
  {
    id: "surveys",
    nameKey: "apps.surveysTitle",
    defaultName: "Surveys",
    descKey: "apps.surveysDesc",
    defaultDesc:
      "Monthly anonymous hardware, browser, gaming, and community surveys with interactive line charts & statistics.",
    categories: ["All", "Utility", "Social", "Development"],
    availability: "web-and-desktop",
    icon: <ClipboardList className="w-8 h-8 text-cyan-500" />,
    component: SurveysApp,
  },
  {
    id: "image-studio",
    nameKey: "apps.imageStudioTitle",
    defaultName: "Image Studio",
    descKey: "apps.imageStudioDesc",
    defaultDesc:
      "Design custom graphics and compose images using your own uploaded assets, custom fonts, and rich shapes.",
    categories: ["All", "Utility"],
    availability: "web-and-desktop",
    icon: <Palette className="w-8 h-8 text-cyan-500" />,
    component: ImageStudioApp,
    authRequired: true,
  },
  {
    id: "3d-background",
    nameKey: "apps.threeDBackgroundTitle",
    defaultName: "3D Background",
    descKey: "apps.threeDBackgroundDesc",
    defaultDesc: "Design 3D rooms and set them as your live application background",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Box className="w-8 h-8 text-cyan-500" />,
    component: ThreeDStudioApp,
  },
  {
    id: "pixel-art-studio",
    nameKey: "apps.pixelArtStudioTitle",
    defaultName: "Pixel Art Studio",
    descKey: "apps.pixelArtStudioDesc",
    defaultDesc:
      "Create retro pixel art, multi-frame animations, and sprite sheets with custom palettes and layers.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Paintbrush className="w-8 h-8 text-cyan-500" />,
    component: PixelArtStudioApp,
  },
  {
    id: "web-browser",
    nameKey: "apps.webBrowserTitle",
    defaultName: "Web Browser",
    descKey: "apps.webBrowserDesc",
    defaultDesc:
      "Browse the internet with multi-tab navigation, search suggestions, bookmarks, and reader mode.",
    categories: ["All", "Utility", "Social"],
    availability: "web-and-desktop",
    icon: <Globe className="w-8 h-8 text-cyan-500" />,
    component: WebBrowserApp,
  },
  {
    id: "webmaster",
    nameKey: "apps.webmasterTitle",
    defaultName: "Webmaster",
    descKey: "apps.webmasterDesc",
    defaultDesc:
      "Submit websites and sitemaps to be crawled and indexed.",
    categories: ["All", "Utility", "Development"],
    availability: "web-and-desktop",
    icon: <Bot className="w-8 h-8 text-cyan-500" />,
    component: WebmasterApp,
    authRequired: true,
  },
  {
    id: "models",
    nameKey: "apps.modelsTitle",
    defaultName: "Models",
    descKey: "apps.modelsDesc",
    defaultDesc:
      "Configure and manage custom AI models across top providers (OpenAI, Anthropic, Gemini, OpenRouter, Grok, Pollinations) with zero-knowledge encrypted API keys, or connect local & shared models.",
    categories: ["All", "LLM/AI", "Utility"],
    availability: "web-and-desktop",
    icon: <Cpu className="w-8 h-8 text-cyan-500" />,
    component: ModelsApp,
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
  const [searchQuery, setSearchQuery] = useState("");

  const { appId: paramAppId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const activeAppId = useMemo(() => {
    if (paramAppId) return paramAppId;
    if (
      location.pathname === "/apps/3d-background" ||
      location.pathname.startsWith("/apps/3d-background")
    ) {
      return "3d-background";
    }
    if (location.pathname.startsWith("/apps/")) {
      const seg = location.pathname.slice(6).split("/")[0];
      if (seg) return seg;
    }
    return undefined;
  }, [paramAppId, location.pathname]);

  const localizedApps = useMemo(() => {
    return APPS.map((app) => ({
      ...app,
      name: t(app.nameKey as any, undefined, app.defaultName),
      description: t(app.descKey as any, undefined, app.defaultDesc),
    }));
  }, [t]);

  const activeApp = useMemo(
    () => localizedApps.find((a) => a.id === activeAppId) || null,
    [activeAppId, localizedApps],
  );

  usePageTitle(
    activeApp ? activeApp.name : t("titles.apps", undefined, "Apps"),
    {
      description: activeApp
        ? activeApp.description
        : t("apps.subtitle", undefined, "Explore apps and tools."),
    },
  );

  const availableApps = useMemo(
    () =>
      localizedApps.filter((app) => {
        if (!isDesktopMode && !isAndroidMode)
          return app.availability === "web-and-desktop";
        if (
          isAndroidMode &&
          app.availability === "desktop-only" &&
          !app.androidSupported
        )
          return false;
        if (selectedAvailability === "web-and-desktop") return true;
        return app.availability === "desktop-only";
      }),
    [isDesktopMode, isAndroidMode, selectedAvailability, localizedApps],
  );

  const filteredApps = useMemo(() => {
    let list = availableApps;
    if (selectedCategory !== "All") {
      list = list.filter((app) =>
        app.categories.includes(selectedCategory),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q) ||
          app.defaultName.toLowerCase().includes(q) ||
          app.defaultDesc.toLowerCase().includes(q) ||
          app.id.toLowerCase().includes(q) ||
          app.categories.some((cat) => cat.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [selectedCategory, availableApps, searchQuery]);

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

  const handleAppClick = (app: (typeof localizedApps)[0]) => {
    if (app.requiresAdmin && isDesktopMode && (window as any).chrome?.webview) {
      const id = Date.now().toString();
      const listener = (event: any) => {
        try {
          const data =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data;
          if (data.id === id) {
            (window as any).chrome.webview.removeEventListener(
              "message",
              listener,
            );
            if (data.success) {
              navigate(`/apps/${app.id}`);
            } else {
              import("sonner").then((m) =>
                m.toast.error(
                  t(
                    "apps.adminRequired",
                    undefined,
                    "Administrator permissions are required to use this app.",
                  ),
                ),
              );
            }
          }
        } catch {}
      };
      (window as any).chrome.webview.addEventListener("message", listener);
      (window as any).chrome.webview.postMessage(
        JSON.stringify({ command: "require_admin", id }),
      );

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
    const isFullWidthApp =
      activeApp.id === "chatbot" ||
      activeApp.id === "llm-agent" ||
      activeApp.id === "vpn" ||
      activeApp.id === "game-library" ||
      activeApp.id === "image-studio" ||
      activeApp.id === "3d-background";

    return (
      <Layout fullWidth={isFullWidthApp}>
        <div
          className={
            isFullWidthApp
              ? "h-full w-full flex flex-col"
              : "space-y-6 h-full flex flex-col"
          }
        >
          {!isFullWidthApp && (
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 shrink-0">
              <button
                onClick={() => navigate("/apps")}
                aria-label={t(
                  "apps.backToApps",
                  undefined,
                  "Back to apps list",
                )}
                title={t("apps.backToApps", undefined, "Back to apps list")}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none shrink-0"
              >
                <AppWindow className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                {activeApp.name}
              </h1>
            </div>
          )}

          <div className="relative flex-1 w-full h-full min-h-[500px]">
            {!session && activeApp.authRequired && (
              <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-slate-800 p-4 sm:p-6 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 text-cyan-500">
                  {activeApp.icon}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
                  {t(
                    "apps.signInToUse",
                    { name: activeApp.name },
                    `Sign in to use ${activeApp.name}`,
                  )}
                </h3>
                <p className="text-slate-400 mb-6 sm:mb-8 max-w-md text-xs sm:text-sm">
                  {activeApp.description}
                </p>
                <Link
                  to="/auth"
                  className="px-6 py-2.5 sm:px-8 sm:py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors text-sm text-center"
                >
                  {t("apps.signInToContinue", undefined, "Sign In to Continue")}
                </Link>
              </div>
            )}
            <div
              className={cn(
                "h-full w-full",
                !session &&
                  activeApp.authRequired &&
                  "pointer-events-none select-none opacity-20 blur-sm transition-all",
              )}
            >
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
                  </div>
                }
              >
                <AppComponent />
              </Suspense>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
              {t("apps.title", undefined, "Apps")}
            </h1>
            <p className="text-sm sm:text-base text-slate-400">
              {t(
                "apps.subtitle",
                undefined,
                "Explore and try out our collection of awesome tools!",
              )}
            </p>
          </div>

          <div className="relative w-full sm:w-72 md:w-80 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              role="searchbox"
              aria-label={t("apps.searchPlaceholder", undefined, "Search apps...")}
              placeholder={t("apps.searchPlaceholder", undefined, "Search apps...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-9 py-2 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-500 rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("apps.clearSearch", undefined, "Clear search")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {isDesktopMode && (
          <section
            aria-label={t("apps.availability", undefined, "Availability")}
            className="space-y-3"
          >
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
                {isAndroidMode
                  ? t("apps.webAndAndroid", undefined, "Web + Android")
                  : t("apps.webAndDesktop", undefined, "Web + desktop")}
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
                <Link
                  key={app.id}
                  to={`/apps/${app.id}`}
                  onClick={(e) => {
                    if (
                      app.requiresAdmin &&
                      isDesktopMode &&
                      (window as any).chrome?.webview
                    ) {
                      e.preventDefault();
                      handleAppClick(app);
                    }
                  }}
                  className="block text-left no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-xl"
                >
                  <Card className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all overflow-hidden h-full">
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
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-xl space-y-3">
              <p className="text-slate-400">
                {searchQuery.trim()
                  ? t(
                      "apps.noAppsMatchingSearch",
                      { query: searchQuery.trim() },
                      `No apps found matching "${searchQuery.trim()}".`,
                    )
                  : isDesktopMode && selectedAvailability === "desktop-only"
                    ? t(
                        "apps.noDesktopApps",
                        undefined,
                        "No desktop-only apps are available yet.",
                      )
                    : t(
                        "apps.noAppsFound",
                        undefined,
                        "No apps found in this category.",
                      )}
              </p>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-sm transition-colors"
                >
                  {t("apps.clearSearch", undefined, "Clear search")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
