import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./dataStore.ts";

export const SURVEYS_DIR = path.join(DATA_DIR, "surveys");

export type SurveyRecurrence = "monthly" | "permanent";
export type SurveyCategory = "Hardware" | "Development" | "Fun" | "General";
export type QuestionType = "single_choice" | "multiple_choice" | "rating" | "text" | "number";
export type ResponseVariant = "verified" | "unverified";

export interface SurveyQuestion {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey?: string;
  defaultDescription?: string;
  type: QuestionType;
  required?: boolean;
  options?: { value: string; labelKey?: string; defaultLabel: string }[];
  min?: number;
  max?: number;
  unit?: string;
  placeholder?: string;
}

export interface SurveyDefinition {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
  category: SurveyCategory;
  recurrence: SurveyRecurrence;
  isPredefined: boolean;
  isActive: boolean;
  isHardwareSurvey?: boolean;
  questions: SurveyQuestion[];
  created_at: string;
  updated_at: string;
}

export interface AnonymousSurveyResponse {
  id: string;
  survey_id: string;
  month_key: string;
  variant: ResponseVariant;
  answers: Record<string, any>;
  created_at: string;
}

export interface UserSurveySubmission {
  id: string;
  user_id: string;
  survey_id: string;
  month_key: string;
  created_at: string;
}

export function ensureSurveysDir() {
  if (!fs.existsSync(SURVEYS_DIR)) {
    fs.mkdirSync(SURVEYS_DIR, { recursive: true });
  }
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getDaysRemainingInCurrentMonth(date: Date = new Date()): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentDay = date.getUTCDate();
  return Math.max(0, lastDay - currentDay);
}

const DEFINITIONS_FILE = path.join(SURVEYS_DIR, "definitions.json");
const RESPONSES_FILE = path.join(SURVEYS_DIR, "responses.json");
const SUBMISSIONS_FILE = path.join(SURVEYS_DIR, "submissions.json");

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return fallback;
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: any): void {
  ensureSurveysDir();
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

export const PREDEFINED_SURVEYS: SurveyDefinition[] = [
  {
    id: "monthly-hardware-survey",
    titleKey: "surveys.hardwareTitle",
    defaultTitle: "Hardware Survey",
    descriptionKey: "surveys.hardwareDesc",
    defaultDescription:
      "Monthly automated and community hardware survey to gather insights on gaming & developer configurations across Desktop, Web, and Mobile.",
    category: "Hardware",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    isHardwareSurvey: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "os",
        titleKey: "surveys.hardware.os",
        defaultTitle: "Operating System",
        type: "single_choice",
        required: true,
        options: [
          { value: "Windows 11", defaultLabel: "Windows 11" },
          { value: "Windows 10", defaultLabel: "Windows 10" },
          { value: "macOS", defaultLabel: "macOS" },
          { value: "Linux", defaultLabel: "Linux" },
          { value: "Android", defaultLabel: "Android" },
          { value: "iOS", defaultLabel: "iOS" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "form_factor",
        titleKey: "surveys.hardware.formFactor",
        defaultTitle: "Device Form Factor",
        type: "single_choice",
        required: true,
        options: [
          { value: "Desktop PC", defaultLabel: "Desktop PC" },
          { value: "Laptop", defaultLabel: "Laptop" },
          { value: "Mobile Phone", defaultLabel: "Mobile Phone" },
          { value: "Tablet", defaultLabel: "Tablet" },
          { value: "Handheld / Console", defaultLabel: "Handheld / Console" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "cpu_manufacturer",
        titleKey: "surveys.hardware.cpuManufacturer",
        defaultTitle: "CPU Manufacturer",
        type: "single_choice",
        required: true,
        options: [
          { value: "AMD", defaultLabel: "AMD" },
          { value: "Intel", defaultLabel: "Intel" },
          { value: "Apple", defaultLabel: "Apple (Apple Silicon)" },
          { value: "Qualcomm", defaultLabel: "Qualcomm" },
          { value: "MediaTek", defaultLabel: "MediaTek" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "cpu_name",
        titleKey: "surveys.hardware.cpuName",
        defaultTitle: "CPU Model",
        type: "text",
        required: true,
        placeholder: "e.g., AMD Ryzen 7 7800X3D / Intel Core i7-14700K / Apple M3 Pro",
      },
      {
        id: "cpu_cores",
        titleKey: "surveys.hardware.cpuCores",
        defaultTitle: "CPU Physical/Logical Cores",
        type: "single_choice",
        required: true,
        options: [
          { value: "2", defaultLabel: "2 Cores" },
          { value: "4", defaultLabel: "4 Cores" },
          { value: "6", defaultLabel: "6 Cores" },
          { value: "8", defaultLabel: "8 Cores" },
          { value: "10", defaultLabel: "10 Cores" },
          { value: "12", defaultLabel: "12 Cores" },
          { value: "14", defaultLabel: "14 Cores" },
          { value: "16", defaultLabel: "16 Cores" },
          { value: "20+", defaultLabel: "20+ Cores" },
        ],
      },
      {
        id: "gpu_manufacturer",
        titleKey: "surveys.hardware.gpuManufacturer",
        defaultTitle: "GPU Manufacturer",
        type: "single_choice",
        required: true,
        options: [
          { value: "NVIDIA", defaultLabel: "NVIDIA" },
          { value: "AMD", defaultLabel: "AMD" },
          { value: "Intel", defaultLabel: "Intel" },
          { value: "Apple", defaultLabel: "Apple" },
          { value: "Qualcomm / Adreno", defaultLabel: "Qualcomm (Adreno)" },
          { value: "ARM / Mali", defaultLabel: "ARM (Mali)" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "gpu_name",
        titleKey: "surveys.hardware.gpuName",
        defaultTitle: "GPU Model",
        type: "text",
        required: true,
        placeholder: "e.g., NVIDIA GeForce RTX 4080 / AMD Radeon RX 7800 XT / Apple M3 GPU",
      },
      {
        id: "ram_amount_gb",
        titleKey: "surveys.hardware.ramAmount",
        defaultTitle: "System RAM (Memory)",
        type: "single_choice",
        required: true,
        options: [
          { value: "4 GB or less", defaultLabel: "4 GB or less" },
          { value: "6 GB", defaultLabel: "6 GB" },
          { value: "8 GB", defaultLabel: "8 GB" },
          { value: "12 GB", defaultLabel: "12 GB" },
          { value: "16 GB", defaultLabel: "16 GB" },
          { value: "24 GB", defaultLabel: "24 GB" },
          { value: "32 GB", defaultLabel: "32 GB" },
          { value: "48 GB", defaultLabel: "48 GB" },
          { value: "64 GB", defaultLabel: "64 GB" },
          { value: "128 GB+", defaultLabel: "128 GB+" },
        ],
      },
      {
        id: "storage_total_gb",
        titleKey: "surveys.hardware.storageTotal",
        defaultTitle: "Total Primary Storage Capacity",
        type: "single_choice",
        required: true,
        options: [
          { value: "128 GB or less", defaultLabel: "128 GB or less" },
          { value: "256 GB", defaultLabel: "256 GB" },
          { value: "512 GB", defaultLabel: "512 GB" },
          { value: "1 TB (1000 GB)", defaultLabel: "1 TB (1000 GB)" },
          { value: "2 TB (2000 GB)", defaultLabel: "2 TB (2000 GB)" },
          { value: "4 TB (4000 GB)", defaultLabel: "4 TB (4000 GB)" },
          { value: "8 TB+", defaultLabel: "8 TB+" },
        ],
      },
      {
        id: "storage_free_gb",
        titleKey: "surveys.hardware.storageFree",
        defaultTitle: "Free Primary Storage Space",
        type: "single_choice",
        required: true,
        options: [
          { value: "Less than 20 GB", defaultLabel: "Less than 20 GB" },
          { value: "20 - 50 GB", defaultLabel: "20 - 50 GB" },
          { value: "50 - 100 GB", defaultLabel: "50 - 100 GB" },
          { value: "100 - 250 GB", defaultLabel: "100 - 250 GB" },
          { value: "250 - 500 GB", defaultLabel: "250 - 500 GB" },
          { value: "500 GB - 1 TB", defaultLabel: "500 GB - 1 TB" },
          { value: "1 TB+", defaultLabel: "1 TB+" },
        ],
      },
      {
        id: "storage_type",
        titleKey: "surveys.hardware.storageType",
        defaultTitle: "Primary Drive Type",
        type: "single_choice",
        required: true,
        options: [
          { value: "NVMe SSD (M.2 / PCIe)", defaultLabel: "NVMe SSD (M.2 / PCIe)" },
          { value: "SATA SSD", defaultLabel: "SATA SSD" },
          { value: "Mechanical HDD", defaultLabel: "Mechanical HDD" },
          { value: "eMMC / UFS Flash (Mobile)", defaultLabel: "eMMC / UFS Flash (Mobile)" },
          { value: "Hybrid / Fusion Drive", defaultLabel: "Hybrid / Fusion Drive" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "motherboard",
        titleKey: "surveys.hardware.motherboard",
        defaultTitle: "Motherboard / Baseboard",
        type: "text",
        required: false,
        placeholder: "e.g., ASUS ROG STRIX B650-A / MSI MAG B650 / Apple Logic Board",
      },
    ],
  },
  {
    id: "monthly-browser-survey",
    titleKey: "surveys.browserTitle",
    defaultTitle: "Browser Survey",
    descriptionKey: "surveys.browserDesc",
    defaultDescription:
      "Simple monthly survey to discover the main web browser you use across the community.",
    category: "Fun",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "main_browser",
        titleKey: "surveys.browser.mainBrowser",
        defaultTitle: "Main Browser You Use",
        type: "single_choice",
        required: true,
        options: [
          { value: "Chrome", defaultLabel: "Google Chrome" },
          { value: "Firefox", defaultLabel: "Mozilla Firefox" },
          { value: "Edge", defaultLabel: "Microsoft Edge" },
          { value: "Safari", defaultLabel: "Apple Safari" },
          { value: "Brave", defaultLabel: "Brave Browser" },
          { value: "Opera", defaultLabel: "Opera / Opera GX" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
      {
        id: "other_browser_name",
        titleKey: "surveys.browser.otherName",
        defaultTitle: "If 'Other', specify your browser",
        type: "text",
        required: false,
        placeholder: "e.g., Vivaldi, Arc, Floorp, Waterfox, LibreWolf",
      },
      {
        id: "secondary_browser",
        titleKey: "surveys.browser.secondaryBrowser",
        defaultTitle: "Secondary / Backup Browser",
        type: "single_choice",
        required: false,
        options: [
          { value: "None", defaultLabel: "None (Only one browser)" },
          { value: "Chrome", defaultLabel: "Google Chrome" },
          { value: "Firefox", defaultLabel: "Mozilla Firefox" },
          { value: "Edge", defaultLabel: "Microsoft Edge" },
          { value: "Safari", defaultLabel: "Apple Safari" },
          { value: "Brave", defaultLabel: "Brave Browser" },
          { value: "Opera", defaultLabel: "Opera / Opera GX" },
          { value: "Other", defaultLabel: "Other" },
        ],
      },
    ],
  },
  {
    id: "monthly-gaming-survey",
    titleKey: "surveys.gamingTitle",
    defaultTitle: "Gaming Survey",
    descriptionKey: "surveys.gamingDesc",
    defaultDescription:
      "A fun monthly gaming poll tracking favorite platforms, preferred genres, and input methods.",
    category: "Fun",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "gaming_platform",
        titleKey: "surveys.gaming.platform",
        defaultTitle: "Main Gaming Platform",
        type: "single_choice",
        required: true,
        options: [
          { value: "PC", defaultLabel: "PC (Windows / Linux / Mac)" },
          { value: "Console", defaultLabel: "Console (PlayStation / Xbox / Switch)" },
          { value: "Mobile", defaultLabel: "Mobile (Android / iOS)" },
        ],
      },
      {
        id: "favourite_genre",
        titleKey: "surveys.gaming.genre",
        defaultTitle: "Favourite Game Genre",
        type: "single_choice",
        required: true,
        options: [
          { value: "FPS", defaultLabel: "FPS (First-Person Shooter)" },
          { value: "RPG", defaultLabel: "RPG (Role-Playing Game)" },
          { value: "Strategy", defaultLabel: "Strategy / RTS / 4X" },
          { value: "Simulation", defaultLabel: "Simulation / City Builder" },
          { value: "Racing", defaultLabel: "Racing / Driving" },
          { value: "Sports", defaultLabel: "Sports" },
          { value: "Horror", defaultLabel: "Horror / Survival" },
          { value: "Sandbox", defaultLabel: "Sandbox / Open World" },
        ],
      },
      {
        id: "input_device",
        titleKey: "surveys.gaming.inputDevice",
        defaultTitle: "Preferred Control Input",
        type: "single_choice",
        required: true,
        options: [
          { value: "Controller", defaultLabel: "Controller / Gamepad" },
          { value: "Keyboard + Mouse", defaultLabel: "Keyboard + Mouse" },
          { value: "Touch / Other", defaultLabel: "Touchscreen / Motion / Other" },
        ],
      },
      {
        id: "weekly_hours",
        titleKey: "surveys.gaming.weeklyHours",
        defaultTitle: "Average Gaming Time Per Week",
        type: "single_choice",
        required: true,
        options: [
          { value: "0 - 5 hours", defaultLabel: "0 - 5 hours (Casual)" },
          { value: "6 - 15 hours", defaultLabel: "6 - 15 hours (Moderate)" },
          { value: "16 - 30 hours", defaultLabel: "16 - 30 hours (Enthusiast)" },
          { value: "30+ hours", defaultLabel: "30+ hours (Hardcore)" },
        ],
      },
    ],
  },
];

/**
 * Hard monthly purge: deletes responses and submissions from previous months for monthly surveys.
 */
export function purgeExpiredMonthlySurveys(): { purgedResponses: number; purgedSubmissions: number } {
  ensureSurveysDir();
  const currentMonthKey = getCurrentMonthKey();

  const allDefinitions = getAllSurveys();
  const monthlySurveyIds = new Set(
    allDefinitions.filter((s) => s.recurrence === "monthly").map((s) => s.id),
  );

  const responses = readJson<AnonymousSurveyResponse[]>(RESPONSES_FILE, []);
  const submissions = readJson<UserSurveySubmission[]>(SUBMISSIONS_FILE, []);

  const freshResponses = responses.filter((r) => {
    if (!monthlySurveyIds.has(r.survey_id)) return true;
    return r.month_key === currentMonthKey;
  });

  const freshSubmissions = submissions.filter((s) => {
    if (!monthlySurveyIds.has(s.survey_id)) return true;
    return s.month_key === currentMonthKey;
  });

  const purgedResponses = responses.length - freshResponses.length;
  const purgedSubmissions = submissions.length - freshSubmissions.length;

  if (purgedResponses > 0) {
    writeJson(RESPONSES_FILE, freshResponses);
  }
  if (purgedSubmissions > 0) {
    writeJson(SUBMISSIONS_FILE, freshSubmissions);
  }

  return { purgedResponses, purgedSubmissions };
}

/**
 * Returns all surveys (combining predefined with custom created ones).
 */
export function getAllSurveys(): SurveyDefinition[] {
  ensureSurveysDir();
  const customSurveys = readJson<SurveyDefinition[]>(DEFINITIONS_FILE, []);
  const map = new Map<string, SurveyDefinition>();

  for (const predefined of PREDEFINED_SURVEYS) {
    map.set(predefined.id, predefined);
  }

  for (const custom of customSurveys) {
    map.set(custom.id, custom);
  }

  return Array.from(map.values());
}

export function getSurveyById(id: string): SurveyDefinition | null {
  const surveys = getAllSurveys();
  return surveys.find((s) => s.id === id) || null;
}

export function saveCustomSurvey(survey: SurveyDefinition): SurveyDefinition {
  ensureSurveysDir();
  const customSurveys = readJson<SurveyDefinition[]>(DEFINITIONS_FILE, []);
  const index = customSurveys.findIndex((s) => s.id === survey.id);

  if (index >= 0) {
    customSurveys[index] = { ...survey, updated_at: new Date().toISOString() };
  } else {
    customSurveys.push({
      ...survey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  writeJson(DEFINITIONS_FILE, customSurveys);
  return survey;
}

export function deleteCustomSurvey(id: string): boolean {
  ensureSurveysDir();
  const customSurveys = readJson<SurveyDefinition[]>(DEFINITIONS_FILE, []);
  const filtered = customSurveys.filter((s) => s.id !== id);

  if (filtered.length !== customSurveys.length) {
    writeJson(DEFINITIONS_FILE, filtered);
    // Also delete associated responses and submissions
    const responses = readJson<AnonymousSurveyResponse[]>(RESPONSES_FILE, []);
    writeJson(
      RESPONSES_FILE,
      responses.filter((r) => r.survey_id !== id),
    );

    const submissions = readJson<UserSurveySubmission[]>(SUBMISSIONS_FILE, []);
    writeJson(
      SUBMISSIONS_FILE,
      submissions.filter((s) => s.survey_id !== id),
    );
    return true;
  }
  return false;
}

/**
 * Checks if a user has already submitted a survey for the current cycle.
 */
export function hasUserSubmittedSurvey(userId: string, surveyId: string): boolean {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();

  const survey = getSurveyById(surveyId);
  if (!survey) return false;

  const currentMonthKey = getCurrentMonthKey();
  const submissions = readJson<UserSurveySubmission[]>(SUBMISSIONS_FILE, []);

  return submissions.some((s) => {
    if (s.user_id !== String(userId) || s.survey_id !== surveyId) return false;
    if (survey.recurrence === "monthly") {
      return s.month_key === currentMonthKey;
    }
    return true;
  });
}

/**
 * Records an anonymous survey response and marks the user submission log.
 */
export function submitSurveyAnswers(params: {
  userId: string;
  surveyId: string;
  variant: ResponseVariant;
  answers: Record<string, any>;
}): { success: boolean; error?: string } {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();

  const survey = getSurveyById(params.surveyId);
  if (!survey) {
    return { success: false, error: "Survey not found" };
  }
  if (!survey.isActive) {
    return { success: false, error: "This survey is currently closed" };
  }

  if (hasUserSubmittedSurvey(params.userId, params.surveyId)) {
    return {
      success: false,
      error:
        survey.recurrence === "monthly"
          ? "You have already submitted this survey for the current month."
          : "You have already submitted this survey.",
    };
  }

  const currentMonthKey = getCurrentMonthKey();
  const now = new Date().toISOString();

  // 1. Save completely anonymous response (NO userId or user identifier)
  const anonymousResponse: AnonymousSurveyResponse = {
    id: crypto.randomUUID(),
    survey_id: params.surveyId,
    month_key: currentMonthKey,
    variant: params.variant,
    answers: params.answers,
    created_at: now,
  };

  const responses = readJson<AnonymousSurveyResponse[]>(RESPONSES_FILE, []);
  responses.push(anonymousResponse);
  writeJson(RESPONSES_FILE, responses);

  // 2. Save user submission tracker (NO answers data)
  const userSubmission: UserSurveySubmission = {
    id: crypto.randomUUID(),
    user_id: String(params.userId),
    survey_id: params.surveyId,
    month_key: currentMonthKey,
    created_at: now,
  };

  const submissions = readJson<UserSurveySubmission[]>(SUBMISSIONS_FILE, []);
  submissions.push(userSubmission);
  writeJson(SUBMISSIONS_FILE, submissions);

  return { success: true };
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
  lineChartSeries: {
    label: string;
    value: number;
    count: number;
  }[];
  topAnswers?: { value: string; count: number; percentage: number }[];
  averageRating?: number;
}

export interface SurveyAggregatedResults {
  surveyId: string;
  title: string;
  monthKey: string;
  totalSubmissions: number;
  verifiedCount: number;
  unverifiedCount: number;
  variantFilter: "all" | "verified" | "unverified";
  questions: QuestionAggregatedResult[];
}

/**
 * Calculates aggregate statistics and line chart points for a survey.
 */
export function calculateSurveyResults(
  surveyId: string,
  variantFilter: "all" | "verified" | "unverified" = "all",
): SurveyAggregatedResults | null {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();

  const survey = getSurveyById(surveyId);
  if (!survey) return null;

  const currentMonthKey = getCurrentMonthKey();
  const allResponses = readJson<AnonymousSurveyResponse[]>(RESPONSES_FILE, []);

  // Filter responses by survey and current month (if monthly)
  const surveyResponses = allResponses.filter((r) => {
    if (r.survey_id !== surveyId) return false;
    if (survey.recurrence === "monthly") {
      return r.month_key === currentMonthKey;
    }
    return true;
  });

  const totalSubmissions = surveyResponses.length;
  const verifiedCount = surveyResponses.filter((r) => r.variant === "verified").length;
  const unverifiedCount = surveyResponses.filter((r) => r.variant === "unverified").length;

  const filteredResponses = surveyResponses.filter((r) => {
    if (variantFilter === "verified") return r.variant === "verified";
    if (variantFilter === "unverified") return r.variant === "unverified";
    return true;
  });

  const questionResults: QuestionAggregatedResult[] = survey.questions.map((q) => {
    const rawValues: any[] = [];
    for (const resp of filteredResponses) {
      const val = resp.answers[q.id];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        rawValues.push(val);
      }
    }

    const questionTotal = rawValues.length;

    if (q.type === "single_choice" || q.type === "multiple_choice") {
      const counts: Record<string, number> = {};
      const predefinedOptions = q.options?.map((o) => o.value) || [];

      for (const opt of predefinedOptions) {
        counts[opt] = 0;
      }

      for (const val of rawValues) {
        if (Array.isArray(val)) {
          for (const subVal of val) {
            counts[subVal] = (counts[subVal] || 0) + 1;
          }
        } else {
          counts[val] = (counts[val] || 0) + 1;
        }
      }

      const optionsDistribution = Object.entries(counts).map(([name, count]) => {
        const percentage =
          questionTotal > 0 ? Number(((count / questionTotal) * 100).toFixed(1)) : 0;
        return { name, count, percentage };
      });

      const sortedByCount = [...optionsDistribution].sort((a, b) => b.count - a.count);

      const lineChartSeries = optionsDistribution.map((opt) => ({
        label: opt.name,
        value: opt.percentage,
        count: opt.count,
      }));

      return {
        questionId: q.id,
        questionTitle: q.defaultTitle,
        totalResponses: questionTotal,
        optionsDistribution: sortedByCount,
        lineChartSeries,
      };
    }

    if (q.type === "rating") {
      const counts: Record<number, number> = {};
      const min = q.min ?? 1;
      const max = q.max ?? 5;
      for (let i = min; i <= max; i++) counts[i] = 0;

      let sum = 0;
      for (const val of rawValues) {
        const num = Number(val);
        if (!isNaN(num)) {
          counts[num] = (counts[num] || 0) + 1;
          sum += num;
        }
      }

      const optionsDistribution = Object.entries(counts).map(([name, count]) => ({
        name: `Rating ${name}`,
        count,
        percentage: questionTotal > 0 ? Number(((count / questionTotal) * 100).toFixed(1)) : 0,
      }));

      const lineChartSeries = Object.entries(counts).map(([score, count]) => ({
        label: `Rating ${score}`,
        value: questionTotal > 0 ? Number(((count / questionTotal) * 100).toFixed(1)) : 0,
        count,
      }));

      return {
        questionId: q.id,
        questionTitle: q.defaultTitle,
        totalResponses: questionTotal,
        optionsDistribution,
        lineChartSeries,
        averageRating: questionTotal > 0 ? Number((sum / questionTotal).toFixed(2)) : 0,
      };
    }

    // Text / general responses -> Aggregate top models or occurrences
    const counts: Record<string, number> = {};
    for (const val of rawValues) {
      const clean = String(val).trim();
      if (clean) {
        counts[clean] = (counts[clean] || 0) + 1;
      }
    }

    const topAnswers = Object.entries(counts)
      .map(([value, count]) => ({
        value,
        count,
        percentage: questionTotal > 0 ? Number(((count / questionTotal) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const lineChartSeries = topAnswers.slice(0, 10).map((t) => ({
      label: t.value.length > 20 ? `${t.value.slice(0, 17)}...` : t.value,
      value: t.percentage,
      count: t.count,
    }));

    return {
      questionId: q.id,
      questionTitle: q.defaultTitle,
      totalResponses: questionTotal,
      optionsDistribution: topAnswers.map((t) => ({
        name: t.value,
        count: t.count,
        percentage: t.percentage,
      })),
      lineChartSeries,
      topAnswers,
    };
  });

  return {
    surveyId,
    title: survey.defaultTitle,
    monthKey: currentMonthKey,
    totalSubmissions,
    verifiedCount,
    unverifiedCount,
    variantFilter,
    questions: questionResults,
  };
}
