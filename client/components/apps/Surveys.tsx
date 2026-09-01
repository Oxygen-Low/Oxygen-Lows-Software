import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ClipboardList,
  CheckCircle2,
  Lock,
  Cpu,
  Monitor,
  Gamepad2,
  Globe,
  Sparkles,
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  RotateCcw,
  BarChart2,
  TrendingUp,
  RefreshCw,
  Sliders,
  HelpCircle,
} from "lucide-react";

export interface SurveySummary {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
  category: "Hardware" | "Development" | "Fun" | "General";
  recurrence: "monthly" | "permanent";
  isPredefined: boolean;
  isActive: boolean;
  isHardwareSurvey: boolean;
  questionsCount: number;
  hasSubmitted: boolean;
  currentMonthKey: string;
  daysRemaining: number;
}

export interface QuestionOption {
  value: string;
  labelKey?: string;
  defaultLabel: string;
}

export interface SurveyQuestion {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey?: string;
  defaultDescription?: string;
  type: "single_choice" | "multiple_choice" | "rating" | "text" | "number";
  required?: boolean;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface SurveyDetail {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
  category: string;
  recurrence: "monthly" | "permanent";
  isPredefined: boolean;
  isActive: boolean;
  isHardwareSurvey?: boolean;
  questions: SurveyQuestion[];
}

export interface MonthlyTimelinePoint {
  monthKey: string;
  monthLabel: string;
  totalResponses: number;
  [optionName: string]: number | string;
}

export interface QuestionAggregatedResult {
  questionId: string;
  questionTitle: string;
  totalResponses: number;
  optionsDistribution: {
    name: string;
    count: number;
    percentage: number;
  }[];
  monthlyTimeline: MonthlyTimelinePoint[];
  seriesKeys: string[];
  lineChartSeries: {
    label: string;
    value: number;
    count: number;
  }[];
  topAnswers?: { value: string; count: number; percentage: number }[];
  averageRating?: number;
}

export const LINE_COLORS = [
  "#38bdf8", // Sky blue
  "#818cf8", // Indigo
  "#34d399", // Emerald
  "#fbbf24", // Amber
  "#f43f5e", // Rose
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#fb923c", // Orange
  "#60a5fa", // Blue
  "#a3e635", // Lime
  "#e879f9", // Fuchsia
  "#2dd4bf", // Cyan-teal
  "#facc15", // Yellow
];

export interface SurveyAggregatedResults {
  surveyId: string;
  title: string;
  monthKey: string;
  isHardwareSurvey?: boolean;
  totalSubmissions: number;
  verifiedCount: number;
  unverifiedCount: number;
  variantFilter: "all" | "verified" | "unverified";
  questions: QuestionAggregatedResult[];
}

export function SurveysApp() {
  const { session } = useAuth();
  const { t } = useTranslation();

  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Active view: "list" | "taking" | "results"
  const [activeView, setActiveView] = useState<"list" | "taking" | "results">("list");
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [activeSurvey, setActiveSurvey] = useState<SurveyDetail | null>(null);

  // Survey Form Answers
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isAutoDetected, setIsAutoDetected] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);

  // Results View State
  const [resultsData, setResultsData] = useState<SurveyAggregatedResults | null>(null);
  const [resultsFilter, setResultsFilter] = useState<"all" | "verified" | "unverified">("all");
  const [loadingResults, setLoadingResults] = useState(false);
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  // Fetch all surveys
  const fetchSurveys = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/surveys", { headers });
      const data = await res.json();
      if (data.surveys) {
        setSurveys(data.surveys);
      }
    } catch (err: any) {
      toast.error(t("surveys.loadFailed", undefined, "Failed to load surveys."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [session?.access_token]);

  // Hardware Detection Logic (Browser WebGL + Navigator + Desktop App Bridge)
  const detectHardware = async () => {
    const detected: Record<string, any> = {
      os: "Windows 11",
      form_factor: "Desktop PC",
      cpu_manufacturer: "AMD",
      cpu_name: "AMD Processor",
      cpu_cores: "8",
      gpu_manufacturer: "NVIDIA",
      gpu_name: "NVIDIA GeForce RTX",
      ram_amount_gb: "16 GB",
      storage_total_gb: "1 TB (1000 GB)",
      storage_free_gb: "250 - 500 GB",
      storage_type: "NVMe SSD (M.2 / PCIe)",
      motherboard: "System Motherboard",
    };

    if (typeof window !== "undefined") {
      const ua = navigator.userAgent;

      // OS Detection
      if (/Windows/i.test(ua)) {
        detected.os = ua.includes("Windows NT 10.0") ? "Windows 11" : "Windows 10";
      } else if (/Macintosh|Mac OS X/i.test(ua)) {
        detected.os = "macOS";
      } else if (/Android/i.test(ua)) {
        detected.os = "Android";
        detected.form_factor = "Mobile Phone";
        detected.storage_type = "eMMC / UFS Flash (Mobile)";
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        detected.os = "iOS";
        detected.form_factor = /iPad/i.test(ua) ? "Tablet" : "Mobile Phone";
        detected.cpu_manufacturer = "Apple";
        detected.gpu_manufacturer = "Apple";
      } else if (/Linux/i.test(ua)) {
        detected.os = "Linux";
      }

      // Form factor heuristic
      if (/Mobi|Android|iPhone/i.test(ua)) {
        detected.form_factor = /Tablet|iPad/i.test(ua) ? "Tablet" : "Mobile Phone";
      }

      // CPU Cores & Memory
      const cores = navigator.hardwareConcurrency;
      if (cores) {
        if (cores >= 20) detected.cpu_cores = "20+";
        else if (cores >= 16) detected.cpu_cores = "16";
        else if (cores >= 14) detected.cpu_cores = "14";
        else if (cores >= 12) detected.cpu_cores = "12";
        else if (cores >= 10) detected.cpu_cores = "10";
        else if (cores >= 8) detected.cpu_cores = "8";
        else if (cores >= 6) detected.cpu_cores = "6";
        else if (cores >= 4) detected.cpu_cores = "4";
        else detected.cpu_cores = "2";
      }

      const mem = (navigator as any).deviceMemory;
      if (mem) {
        if (mem >= 32) detected.ram_amount_gb = "32 GB";
        else if (mem >= 24) detected.ram_amount_gb = "24 GB";
        else if (mem >= 16) detected.ram_amount_gb = "16 GB";
        else if (mem >= 12) detected.ram_amount_gb = "12 GB";
        else if (mem >= 8) detected.ram_amount_gb = "8 GB";
        else if (mem >= 6) detected.ram_amount_gb = "6 GB";
        else detected.ram_amount_gb = "4 GB or less";
      }

      // WebGL GPU Detection
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
          const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
            const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";

            if (renderer) {
              detected.gpu_name = renderer;
              if (/NVIDIA|GeForce|RTX|GTX/i.test(renderer) || /NVIDIA/i.test(vendor)) {
                detected.gpu_manufacturer = "NVIDIA";
              } else if (/AMD|Radeon/i.test(renderer) || /AMD/i.test(vendor)) {
                detected.gpu_manufacturer = "AMD";
              } else if (/Intel|Iris|Arc|UHD/i.test(renderer) || /Intel/i.test(vendor)) {
                detected.gpu_manufacturer = "Intel";
              } else if (/Apple/i.test(renderer) || /Apple/i.test(vendor)) {
                detected.gpu_manufacturer = "Apple";
                detected.cpu_manufacturer = "Apple";
                detected.cpu_name = "Apple Silicon";
              } else if (/Adreno|Qualcomm/i.test(renderer)) {
                detected.gpu_manufacturer = "Qualcomm / Adreno";
                detected.cpu_manufacturer = "Qualcomm";
              } else if (/Mali|ARM/i.test(renderer)) {
                detected.gpu_manufacturer = "ARM / Mali";
                detected.cpu_manufacturer = "MediaTek";
              }
            }
          }
        }
      } catch {}

      // Storage Estimate
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota) {
            const quotaGB = estimate.quota / (1024 * 1024 * 1024);
            if (quotaGB >= 1500) detected.storage_total_gb = "2 TB (2000 GB)";
            else if (quotaGB >= 800) detected.storage_total_gb = "1 TB (1000 GB)";
            else if (quotaGB >= 400) detected.storage_total_gb = "512 GB";
            else if (quotaGB >= 200) detected.storage_total_gb = "256 GB";
          }
        } catch {}
      }

      // Check Desktop App Native Bridge
      if ((window as any).chrome?.webview?.postMessage) {
        try {
          const res = await new Promise<any>((resolve) => {
            const reqId = `hw_${Date.now()}`;
            const handler = (evt: any) => {
              try {
                const msg = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
                if (msg.id === reqId && msg.success && msg.data) {
                  window.removeEventListener("message", handler);
                  resolve(msg.data);
                }
              } catch {}
            };
            window.addEventListener("message", handler);
            (window as any).chrome.webview.postMessage(
              JSON.stringify({ command: "get_hardware_info", id: reqId }),
            );
            setTimeout(() => {
              window.removeEventListener("message", handler);
              resolve(null);
            }, 1500);
          });

          if (res) {
            if (res.cpuName) detected.cpu_name = res.cpuName;
            if (res.cpuManufacturer) detected.cpu_manufacturer = res.cpuManufacturer;
            if (res.gpuName) detected.gpu_name = res.gpuName;
            if (res.gpuManufacturer) detected.gpu_manufacturer = res.gpuManufacturer;
            if (res.motherboard) detected.motherboard = res.motherboard;
            if (res.cpuCores) detected.cpu_cores = res.cpuCores;
          }
        } catch {}
      }
    }

    return detected;
  };

  // Start taking a survey
  const handleStartSurvey = async (surveySummary: SurveySummary) => {
    setActiveSurveyId(surveySummary.id);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/surveys/${surveySummary.id}`, { headers });
      const data = await res.json();
      if (data.survey) {
        setActiveSurvey(data.survey);
        setAnswers({});

        if (data.survey.isHardwareSurvey) {
          const autoData = await detectHardware();
          setAnswers(autoData);
          setIsAutoDetected(true);
        } else {
          setIsAutoDetected(true);
        }

        setActiveView("taking");
      }
    } catch (err: any) {
      toast.error(t("surveys.failedOpen", undefined, "Failed to open survey."));
    } finally {
      setLoading(false);
    }
  };

  // View results for a survey
  const handleViewResults = async (surveyId: string, filter: "all" | "verified" | "unverified" = "all") => {
    setActiveSurveyId(surveyId);
    setResultsFilter(filter);
    setLoadingResults(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/surveys/${surveyId}/results?variant=${filter}`, { headers });
      const data = await res.json();
      if (res.ok && data.results) {
        setResultsData(data.results);
        setActiveView("results");
      } else {
        toast.error(data.error || t("surveys.lockedMessage", undefined, "You must complete the survey to view results."));
      }
    } catch (err: any) {
      toast.error(t("surveys.resultsError", undefined, "Failed to fetch survey results."));
    } finally {
      setLoadingResults(false);
    }
  };

  // Submit survey form
  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) {
      toast.error(t("surveys.loginRequired", undefined, "Please sign in to submit surveys."));
      return;
    }
    if (!activeSurveyId || !activeSurvey) return;

    // Validate required questions
    for (const q of activeSurvey.questions) {
      if (q.required) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          (typeof val === "string" && val.trim() === "") ||
          (Array.isArray(val) && val.length === 0)
        ) {
          toast.error(
            t("surveys.fieldRequired", { field: q.defaultTitle }, `Please answer: ${q.defaultTitle}`),
          );
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const variant = isAutoDetected ? "verified" : "unverified";
      const res = await fetch(`/api/surveys/${activeSurveyId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          variant,
          answers,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          t(
            "surveys.submittedSuccess",
            undefined,
            "Your anonymous answers have been submitted! Results unlocked.",
          ),
        );
        await fetchSurveys();
        await handleViewResults(activeSurveyId, "all");
      } else {
        toast.error(data.error || t("surveys.submitFailed", undefined, "Submission failed."));
      }
    } catch (err: any) {
      toast.error(t("surveys.networkError", undefined, "Network error submitting survey."));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSurveys = useMemo(() => {
    if (selectedCategory === "All") return surveys;
    return surveys.filter((s) => s.category === selectedCategory);
  }, [surveys, selectedCategory]);

  return (
    <div className="w-full max-w-6xl mx-auto py-4 px-2 sm:px-4 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-cyan-900/30 to-purple-900/40 border border-cyan-500/20 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/20 border border-cyan-400/40 rounded-xl text-cyan-400 shadow-inner">
                <ClipboardList className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  {t("surveys.title", undefined, "Community Surveys")}
                </h1>
                <p className="text-slate-300 text-sm mt-0.5">
                  {t(
                    "surveys.subtitle",
                    undefined,
                    "Participate in monthly hardware & gaming benchmarks. See live aggregate statistics after answering!",
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Cycle Indicator */}
          {surveys.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-2.5 text-right flex items-center gap-3 shadow-md">
              <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t("surveys.monthlyCycle", undefined, "Monthly Reset")}
                </div>
                <div className="text-sm font-bold text-amber-300">
                  {surveys[0]?.daysRemaining !== undefined
                    ? t(
                        "surveys.daysRemaining",
                        { days: surveys[0].daysRemaining },
                        `${surveys[0].daysRemaining} days left in cycle`,
                      )
                    : t("surveys.cycleActive", undefined, "Cycle Active")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. SURVEYS LIST VIEW */}
      {/* ========================================================================= */}
      {activeView === "list" && (
        <div className="space-y-6">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              className="w-full sm:w-auto"
            >
              <TabsList className="bg-slate-900/70 border border-slate-800 p-1">
                <TabsTrigger value="All">{t("common.all", undefined, "All Surveys")}</TabsTrigger>
                <TabsTrigger value="Hardware">{t("surveys.categoryHardware", undefined, "Hardware")}</TabsTrigger>
                <TabsTrigger value="Fun">{t("surveys.categoryFun", undefined, "Fun & Gaming")}</TabsTrigger>
                <TabsTrigger value="Development">{t("surveys.categoryDevelopment", undefined, "Development")}</TabsTrigger>
                <TabsTrigger value="General">{t("surveys.categoryGeneral", undefined, "General")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchSurveys}
              disabled={loading}
              className="border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("common.refresh", undefined, "Refresh")}
            </Button>
          </div>

          {/* Survey Cards Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 text-sm">{t("common.loading", undefined, "Loading surveys...")}</span>
            </div>
          ) : filteredSurveys.length === 0 ? (
            <Card className="bg-slate-900/40 border-slate-800 text-center py-16">
              <CardContent className="space-y-3">
                <ClipboardList className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-300">
                  {t("surveys.noSurveys", undefined, "No surveys available in this category.")}
                </h3>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSurveys.map((survey) => {
                let icon = <ClipboardList className="w-6 h-6 text-cyan-400" />;
                if (survey.isHardwareSurvey) icon = <Cpu className="w-6 h-6 text-amber-400" />;
                else if (survey.id.includes("browser")) icon = <Globe className="w-6 h-6 text-blue-400" />;
                else if (survey.id.includes("gaming")) icon = <Gamepad2 className="w-6 h-6 text-emerald-400" />;

                return (
                  <Card
                    key={survey.id}
                    className={`flex flex-col justify-between transition-all duration-200 border bg-slate-900/60 backdrop-blur hover:border-cyan-500/50 hover:shadow-lg ${
                      survey.hasSubmitted ? "border-emerald-500/30" : "border-slate-800"
                    }`}
                  >
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                          {icon}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <Badge
                            variant="secondary"
                            className="bg-slate-800 text-slate-300 text-xs border border-slate-700"
                          >
                            {survey.recurrence === "monthly"
                              ? t("surveys.monthlyBadge", undefined, "Monthly")
                              : t("surveys.permanentBadge", undefined, "Standard")}
                          </Badge>
                          {survey.hasSubmitted && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {t("surveys.completedBadge", undefined, "Completed")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div>
                        <CardTitle className="text-lg font-bold text-white tracking-wide">
                          {t(survey.titleKey, undefined, survey.defaultTitle)}
                        </CardTitle>
                        <CardDescription className="text-slate-400 text-xs mt-1.5 line-clamp-3">
                          {t(survey.descriptionKey, undefined, survey.defaultDescription)}
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardFooter className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                      <div className="w-full flex items-center justify-between text-xs text-slate-400 pb-1">
                        <span>
                          {t(
                            "surveys.questionsCount",
                            { count: survey.questionsCount },
                            `${survey.questionsCount} Questions`,
                          )}
                        </span>
                        <span>
                          {survey.recurrence === "monthly"
                            ? t("surveys.resetsMonthly", undefined, "Resets Monthly")
                            : t("surveys.oneTime", undefined, "One-time")}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 w-full">
                        {survey.hasSubmitted ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                              disabled
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                              {t("surveys.answered", undefined, "Answered")}
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                              onClick={() => handleViewResults(survey.id, "all")}
                            >
                              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                              {t("surveys.viewResults", undefined, "Results")}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full col-span-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold shadow-md"
                              onClick={() => handleStartSurvey(survey)}
                            >
                              <ClipboardList className="w-4 h-4 mr-2" />
                              {t("surveys.takeSurvey", undefined, "Take Survey")}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TAKING SURVEY VIEW */}
      {/* ========================================================================= */}
      {activeView === "taking" && activeSurvey && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView("list")}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("common.back", undefined, "Back to Surveys")}
            </Button>
            <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
              {activeSurvey.category}
            </Badge>
          </div>

          <Card className="bg-slate-900/80 border-slate-800 shadow-xl backdrop-blur">
            <CardHeader className="space-y-2 border-b border-slate-800/80 pb-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-2xl font-extrabold text-white">
                    {t(activeSurvey.titleKey, undefined, activeSurvey.defaultTitle)}
                  </CardTitle>
                  <CardDescription className="text-slate-300 mt-1">
                    {t(activeSurvey.descriptionKey, undefined, activeSurvey.defaultDescription)}
                  </CardDescription>
                </div>

                {/* Verification Variant Toggle for Hardware Survey */}
                {activeSurvey.isHardwareSurvey && (
                  <div className="bg-slate-950/80 border border-slate-700/60 rounded-xl p-3 flex items-center gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        {isAutoDetected ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                        )}
                        {isAutoDetected
                          ? t("surveys.verifiedMode", undefined, "Verified Mode (Auto-detected)")
                          : t("surveys.unverifiedMode", undefined, "Unverified Mode (Manual Edit)")}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {isAutoDetected
                          ? t("surveys.autoDetectedHint", undefined, "Specs automatically inspected from your device.")
                          : t("surveys.manualEditHint", undefined, "You have manually edited or entered specs.")}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!isAutoDetected) {
                          const autoData = await detectHardware();
                          setAnswers(autoData);
                          setIsAutoDetected(true);
                          toast.info(t("surveys.hardwareRescanned", undefined, "Re-scanned device hardware."));
                        } else {
                          setIsAutoDetected(false);
                        }
                      }}
                      className="border-slate-700 text-xs text-slate-300"
                    >
                      {isAutoDetected
                        ? t("surveys.editManually", undefined, "Edit Manually")
                        : t("surveys.autoDetect", undefined, "Re-Scan")}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            <form onSubmit={handleSubmitSurvey}>
              <CardContent className="space-y-6 pt-6">
                {activeSurvey.questions.map((question, qIdx) => {
                  const currentValue = answers[question.id];

                  return (
                    <div
                      key={question.id}
                      className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Label className="text-base font-semibold text-slate-100 flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                            Q{qIdx + 1}
                          </span>
                          {t(question.titleKey, undefined, question.defaultTitle)}
                          {question.required && <span className="text-rose-400">*</span>}
                        </Label>
                      </div>

                      {question.descriptionKey && (
                        <p className="text-xs text-slate-400">
                          {t(question.descriptionKey, undefined, question.defaultDescription)}
                        </p>
                      )}

                      {/* Single Choice Radio / Select */}
                      {question.type === "single_choice" && question.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                          {question.options.map((option) => {
                            const isSelected = currentValue === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  setAnswers((prev) => ({ ...prev, [question.id]: option.value }));
                                  if (activeSurvey.isHardwareSurvey && !isAutoDetected) {
                                    // keep unverified if manual
                                  }
                                }}
                                className={`flex items-center justify-between p-3 rounded-lg border text-sm text-left transition-all ${
                                  isSelected
                                    ? "bg-cyan-950/50 border-cyan-500 text-cyan-200 font-semibold shadow-inner"
                                    : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700"
                                }`}
                              >
                                <span>{t(option.labelKey || "", undefined, option.defaultLabel)}</span>
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    isSelected
                                      ? "border-cyan-400 bg-cyan-500"
                                      : "border-slate-600 bg-slate-950"
                                  }`}
                                >
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Text Input */}
                      {question.type === "text" && (
                        <Input
                          value={currentValue || ""}
                          placeholder={question.placeholder || t("common.searchPlaceholder", undefined, "Type your answer...")}
                          onChange={(e) => {
                            setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }));
                            if (activeSurvey.isHardwareSurvey) {
                              setIsAutoDetected(false);
                            }
                          }}
                          className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-cyan-500"
                        />
                      )}

                      {/* Number Input */}
                      {question.type === "number" && (
                        <Input
                          type="number"
                          value={currentValue ?? ""}
                          placeholder={question.placeholder || "0"}
                          onChange={(e) => {
                            setAnswers((prev) => ({ ...prev, [question.id]: Number(e.target.value) }));
                          }}
                          className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 max-w-xs focus-visible:ring-cyan-500"
                        />
                      )}

                      {/* Rating Scale (1 to 5 or 1 to 10) */}
                      {question.type === "rating" && (
                        <div className="flex items-center gap-2 pt-2">
                          {Array.from(
                            { length: (question.max ?? 5) - (question.min ?? 1) + 1 },
                            (_, i) => (question.min ?? 1) + i,
                          ).map((num) => {
                            const isSelected = currentValue === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: num }))}
                                className={`w-10 h-10 rounded-lg font-bold text-sm transition-all border ${
                                  isSelected
                                    ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md scale-105"
                                    : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-800/80 pt-6">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {t(
                      "surveys.anonymityGuarantee",
                      undefined,
                      "Submissions are strictly decoupled from your account identity. Only participation lock is logged.",
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveView("list")}
                    className="border-slate-700 text-slate-300"
                  >
                    {t("common.cancel", undefined, "Cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 shadow-md"
                  >
                    {submitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t("common.submitting", undefined, "Submitting...")}
                      </div>
                    ) : (
                      t("surveys.submitAnswers", undefined, "Submit Anonymous Answers")
                    )}
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SURVEY RESULTS VIEW */}
      {/* ========================================================================= */}
      {activeView === "results" && resultsData && (
        <div className="space-y-6">
          {/* Top Bar Navigation */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView("list")}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("common.back", undefined, "Back to Surveys")}
            </Button>

            <div className="flex items-center gap-3">
              {/* Chart Style Switcher */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-1 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChartType("line")}
                  className={`h-7 px-2.5 text-xs ${
                    chartType === "line"
                      ? "bg-cyan-600 text-white font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1" />
                  {t("surveys.chartLine", undefined, "Line Charts")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChartType("bar")}
                  className={`h-7 px-2.5 text-xs ${
                    chartType === "bar"
                      ? "bg-cyan-600 text-white font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5 mr-1" />
                  {t("surveys.chartBar", undefined, "Bar Charts")}
                </Button>
              </div>

              {/* Verified vs Unverified Filter Tabs (Hardware Survey Only) */}
              {(resultsData.isHardwareSurvey || resultsData.surveyId === "monthly-hardware-survey") && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-1 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewResults(resultsData.surveyId, "all")}
                    className={`h-7 px-2.5 text-xs ${
                      resultsFilter === "all"
                        ? "bg-slate-700 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {t("common.all", undefined, "All")} ({resultsData.totalSubmissions})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewResults(resultsData.surveyId, "verified")}
                    className={`h-7 px-2.5 text-xs ${
                      resultsFilter === "verified"
                        ? "bg-emerald-600 text-white font-bold"
                        : "text-emerald-400 hover:text-emerald-300"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    {t("surveys.verified", undefined, "Verified")} ({resultsData.verifiedCount})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewResults(resultsData.surveyId, "unverified")}
                    className={`h-7 px-2.5 text-xs ${
                      resultsFilter === "unverified"
                        ? "bg-amber-600 text-white font-bold"
                        : "text-amber-400 hover:text-amber-300"
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                    {t("surveys.unverified", undefined, "Unverified")} ({resultsData.unverifiedCount})
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Survey Summary Banner */}
          <Card className="bg-slate-900/80 border-slate-800 shadow-xl backdrop-blur p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white">{resultsData.title} Results</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {t("surveys.monthCycleLabel", { month: resultsData.monthKey }, `Results for cycle: ${resultsData.monthKey}`)}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2 text-center">
                  <div className="text-xs text-slate-400 font-semibold uppercase">{t("surveys.totalResponses", undefined, "Total Responses")}</div>
                  <div className="text-xl font-extrabold text-cyan-400">{resultsData.totalSubmissions}</div>
                </div>
                {(resultsData.isHardwareSurvey || resultsData.surveyId === "monthly-hardware-survey") && (
                  <>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2 text-center">
                      <div className="text-xs text-emerald-400 font-semibold uppercase">{t("surveys.verifiedCount", undefined, "Verified")}</div>
                      <div className="text-xl font-extrabold text-emerald-400">{resultsData.verifiedCount}</div>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2 text-center">
                      <div className="text-xs text-amber-400 font-semibold uppercase">{t("surveys.unverifiedCount", undefined, "Unverified")}</div>
                      <div className="text-xl font-extrabold text-amber-400">{resultsData.unverifiedCount}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Results Breakdown per Question */}
          <div className="space-y-6">
            {resultsData.questions.map((qResult, idx) => (
              <Card key={qResult.questionId} className="bg-slate-900/80 border-slate-800 shadow-lg">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                        Q{idx + 1}
                      </span>
                      {qResult.questionTitle}
                    </CardTitle>
                    <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                      {t("surveys.totalVotes", { count: qResult.totalResponses }, `${qResult.totalResponses} votes`)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                  {/* Chart Visualization (12-Month Multi-Line or Current Month Bar) */}
                  {(qResult.monthlyTimeline?.length > 0 || qResult.optionsDistribution?.length > 0) && (
                    <div className="h-80 w-full bg-slate-950/50 p-4 rounded-xl border border-slate-800/70">
                      <div className="text-xs text-slate-400 font-medium mb-2 flex items-center justify-between">
                        <span>
                          {chartType === "line"
                            ? t("surveys.past12MonthsTrend", undefined, "12-Month Trend (% Share by Option)")
                            : t("surveys.currentMonthDistribution", undefined, "Current Month Distribution (% of Votes)")}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {qResult.seriesKeys?.length || 0} {t("surveys.optionsTracked", undefined, "options tracked")}
                        </span>
                      </div>

                      <ResponsiveContainer width="100%" height="90%">
                        {chartType === "line" && qResult.monthlyTimeline?.length > 0 ? (
                          <LineChart
                            data={qResult.monthlyTimeline}
                            margin={{ top: 10, right: 25, left: -15, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                            <XAxis
                              dataKey="monthLabel"
                              stroke="#94a3b8"
                              fontSize={11}
                              tick={{ fill: "#94a3b8" }}
                            />
                            <YAxis
                              stroke="#94a3b8"
                              fontSize={11}
                              unit="%"
                              domain={[0, 100]}
                              tick={{ fill: "#94a3b8" }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                borderColor: "#334155",
                                color: "#fff",
                                borderRadius: "0.5rem",
                                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.6)",
                              }}
                              formatter={(value: any, name: string) => [
                                `${value}%`,
                                name,
                              ]}
                            />
                            <Legend
                              wrapperStyle={{
                                paddingTop: "8px",
                                fontSize: "11px",
                                color: "#cbd5e1",
                              }}
                            />
                            {(qResult.seriesKeys || []).map((key, keyIdx) => {
                              const strokeColor = LINE_COLORS[keyIdx % LINE_COLORS.length];
                              return (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={key}
                                  name={key}
                                  stroke={strokeColor}
                                  strokeWidth={2.5}
                                  dot={{ r: 3, fill: strokeColor, strokeWidth: 1, stroke: "#0f172a" }}
                                  activeDot={{ r: 6 }}
                                />
                              );
                            })}
                          </LineChart>
                        ) : (
                          <BarChart
                            data={qResult.optionsDistribution}
                            margin={{ top: 10, right: 20, left: -15, bottom: 25 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                            <XAxis
                              dataKey="name"
                              stroke="#94a3b8"
                              fontSize={11}
                              angle={-20}
                              textAnchor="end"
                              interval={0}
                              tick={{ fill: "#94a3b8" }}
                            />
                            <YAxis stroke="#94a3b8" fontSize={11} unit="%" tick={{ fill: "#94a3b8" }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                borderColor: "#334155",
                                color: "#fff",
                                borderRadius: "0.5rem",
                              }}
                              formatter={(value: any, name: any, props: any) => [
                                `${value}% (${props.payload.count} votes)`,
                                "Share",
                              ]}
                            />
                            <Bar dataKey="percentage" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Percentage Distribution Progress Bars */}
                  <div className="space-y-3 pt-2">
                    {qResult.optionsDistribution.map((opt) => (
                      <div key={opt.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                          <span className="truncate pr-2">{opt.name}</span>
                          <span className="text-cyan-400 font-mono shrink-0">
                            {opt.percentage}% ({opt.count})
                          </span>
                        </div>
                        <Progress value={opt.percentage} className="h-2 bg-slate-950 border border-slate-800" />
                      </div>
                    ))}
                  </div>

                  {/* Average Rating if rating type */}
                  {qResult.averageRating !== undefined && (
                    <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between">
                      <span className="text-sm font-semibold text-cyan-200">
                        {t("surveys.averageRating", undefined, "Average Score")}
                      </span>
                      <span className="text-lg font-bold text-cyan-400 font-mono">
                        {qResult.averageRating} / 5.0
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default SurveysApp;
