import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./dataStore.ts";
import {
  calculatePointsCost,
  getModelPricing,
  type ModelPricing,
} from "./pollinationsPricing.ts";

export interface FreeModelConfig {
  id: string;
  name: string;
  tierName: "Best" | "Standard" | "Cheap";
  // Backward compatibility
  baseDailyLimit?: number;
  outputMultiplier?: number;
}

export const FREE_MODELS: Record<string, FreeModelConfig> = {
  "deepseek/deepseek-v4.1-flash": {
    id: "deepseek/deepseek-v4.1-flash",
    name: "Best",
    tierName: "Best",
    baseDailyLimit: 25,
    outputMultiplier: 1,
  },
  "openai/gpt-6-luna": {
    id: "openai/gpt-6-luna",
    name: "Standard",
    tierName: "Standard",
    baseDailyLimit: 25,
    outputMultiplier: 1,
  },
  "openai/gpt-oss-20b": {
    id: "openai/gpt-oss-20b",
    name: "Cheap",
    tierName: "Cheap",
    baseDailyLimit: 25,
    outputMultiplier: 1,
  },
};

/** Default daily points budget ($0.25 USD = 25 points = 25 cents = 0.25 Pollen) */
export const DEFAULT_BASE_DAILY_POINTS = 25;

export const FREE_AI_DIR = path.join(DATA_DIR, "free_ai");
const IP_ACCESS_FILE = path.join(FREE_AI_DIR, "ip_access.json");
const DAILY_USAGE_FILE = path.join(FREE_AI_DIR, "daily_usage.json");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface IpAccessRecord {
  userId: string;
  ip: string;
  timestamp: number;
}

export interface UserDailyUsageRecord {
  [key: string]: number; // key: `${dateStr}:${userId}:points` -> used points
}

function ensureDirExists() {
  if (!fs.existsSync(FREE_AI_DIR)) {
    try {
      fs.mkdirSync(FREE_AI_DIR, { recursive: true });
    } catch {}
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, "utf-8");
    if (!content.trim()) return fallback;
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, data: any): void {
  ensureDirExists();
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (writeErr) {
      console.error(`Failed to write JSON file ${filePath}:`, writeErr);
    }
  }
}

/**
 * Returns current UTC date formatted as YYYY-MM-DD.
 */
export function getUtcDateString(now: Date = new Date()): string {
  return now.toISOString().split("T")[0];
}

/**
 * Normalizes IP address strings (stripping IPv6 mapping e.g. ::ffff:127.0.0.1).
 */
export function normalizeIp(ip: string): string {
  if (!ip) return "127.0.0.1";
  let clean = ip.trim();
  if (clean.startsWith("::ffff:")) {
    clean = clean.slice(7);
  }
  return clean || "127.0.0.1";
}

/**
 * Records an IP access for a user and cleans up entries older than 7 days.
 */
export function recordUserIpAccess(
  userId: string | number,
  ip: string,
  nowTimestamp: number = Date.now(),
): void {
  const cleanUserId = String(userId);
  const cleanIp = normalizeIp(ip);
  const cutoff = nowTimestamp - SEVEN_DAYS_MS;

  const records = readJsonFile<IpAccessRecord[]>(IP_ACCESS_FILE, []);
  const validRecords = records.filter(
    (r) =>
      r &&
      r.timestamp >= cutoff &&
      !(r.userId === cleanUserId && r.ip === cleanIp && Math.abs(r.timestamp - nowTimestamp) < 60_000),
  );

  validRecords.push({
    userId: cleanUserId,
    ip: cleanIp,
    timestamp: nowTimestamp,
  });

  writeJsonAtomic(IP_ACCESS_FILE, validRecords);
}

/**
 * Returns the list of distinct user IDs who accessed the service from the given IP
 * within the last 7 rolling days.
 */
export function getDistinctUsersOnIpInLastWeek(
  ip: string,
  nowTimestamp: number = Date.now(),
): string[] {
  const cleanIp = normalizeIp(ip);
  const cutoff = nowTimestamp - SEVEN_DAYS_MS;
  const records = readJsonFile<IpAccessRecord[]>(IP_ACCESS_FILE, []);

  const userIds = new Set<string>();
  for (const r of records) {
    if (r && r.ip === cleanIp && r.timestamp >= cutoff) {
      userIds.add(String(r.userId));
    }
  }

  return Array.from(userIds);
}

/**
 * Calculates the effective daily Points limit for an IP and optional current user.
 * If multiple users accessed from this IP in the past 7 days, the base daily points limit (25)
 * is divided evenly among them (floored to 1 decimal place, minimum 1 point).
 */
export function getEffectiveDailyLimit(
  modelId: string,
  ip: string,
  userId?: string | number,
  nowTimestamp: number = Date.now(),
): {
  baseLimit: number;
  userCountOnIp: number;
  effectiveLimit: number;
  outputMultiplier: number;
  baseDailyPoints: number;
  effectiveLimitPoints: number;
} {
  const distinctUsers = getDistinctUsersOnIpInLastWeek(ip, nowTimestamp);
  if (userId !== undefined && userId !== null) {
    const cleanUserId = String(userId);
    if (!distinctUsers.includes(cleanUserId)) {
      distinctUsers.push(cleanUserId);
    }
  }

  const userCountOnIp = Math.max(1, distinctUsers.length);
  // Divide 25 points evenly, rounded to 1 decimal place, min 1 pt
  const effectivePoints =
    userCountOnIp === 1
      ? DEFAULT_BASE_DAILY_POINTS
      : Math.max(1, Math.floor((DEFAULT_BASE_DAILY_POINTS / userCountOnIp) * 10) / 10);

  return {
    baseLimit: DEFAULT_BASE_DAILY_POINTS,
    userCountOnIp,
    effectiveLimit: effectivePoints,
    outputMultiplier: 1,
    baseDailyPoints: DEFAULT_BASE_DAILY_POINTS,
    effectiveLimitPoints: effectivePoints,
  };
}

/**
 * Returns used points today (UTC) for a given user.
 */
export function getUserDailyPointsUsage(
  userId: string | number,
  dateStr: string = getUtcDateString(),
): number {
  const cleanUserId = String(userId);
  const usageMap = readJsonFile<UserDailyUsageRecord>(DAILY_USAGE_FILE, {});
  const key = `${dateStr}:${cleanUserId}:points`;
  return Number(usageMap[key]) || 0;
}

/**
 * Backward compatibility alias for getUserDailyPointsUsage.
 */
export function getUserDailyUsage(
  userId: string | number,
  _modelId?: string,
  dateStr: string = getUtcDateString(),
): number {
  return getUserDailyPointsUsage(userId, dateStr);
}

/**
 * Checks if a user has sufficient points allowance remaining today.
 */
export function checkFreeModelAllowance(
  userId: string | number,
  modelId: string,
  ip: string,
  estimatedPromptTokens: number = 0,
  nowTimestamp: number = Date.now(),
): {
  allowed: boolean;
  usedPoints: number;
  remainingPoints: number;
  effectiveLimit: number;
  baseLimit: number;
  userCountOnIp: number;
  // Backwards compatibility fields
  usedTokens: number;
  remainingTokens: number;
  outputMultiplier: number;
} {
  const cleanUserId = String(userId);
  const dateStr = getUtcDateString(new Date(nowTimestamp));
  const { baseLimit, userCountOnIp, effectiveLimit } = getEffectiveDailyLimit(
    modelId,
    ip,
    cleanUserId,
    nowTimestamp,
  );

  const estimatedPromptCost = calculatePointsCost(modelId, estimatedPromptTokens, 0);
  const usedPoints = getUserDailyPointsUsage(cleanUserId, dateStr);
  const remainingPoints = Math.max(0, Math.round((effectiveLimit - usedPoints) * 1000) / 1000);
  const allowed = usedPoints + estimatedPromptCost <= effectiveLimit;

  return {
    allowed,
    usedPoints,
    remainingPoints,
    effectiveLimit,
    baseLimit,
    userCountOnIp,
    usedTokens: usedPoints,
    remainingTokens: remainingPoints,
    outputMultiplier: 1,
  };
}

/**
 * Records points consumption for a user on a free model based on actual token counts.
 */
export function recordFreeModelUsage(
  userId: string | number,
  modelId: string,
  ip: string,
  inputTokens: number,
  outputTokens: number,
  nowTimestamp: number = Date.now(),
): {
  addedPoints: number;
  newTotalUsed: number;
  effectiveLimit: number;
  remainingPoints: number;
  // Backwards compatibility
  weightedAddedTokens: number;
  remainingTokens: number;
} {
  const cleanUserId = String(userId);
  const dateStr = getUtcDateString(new Date(nowTimestamp));
  const addedPoints = calculatePointsCost(modelId, inputTokens, outputTokens);

  // 1. Record IP access
  recordUserIpAccess(cleanUserId, ip, nowTimestamp);

  // 2. Update daily usage
  const usageMap = readJsonFile<UserDailyUsageRecord>(DAILY_USAGE_FILE, {});
  const key = `${dateStr}:${cleanUserId}:points`;
  const prevUsed = Number(usageMap[key]) || 0;
  const newTotalUsed = Math.round((prevUsed + addedPoints) * 1_000_000) / 1_000_000;
  usageMap[key] = newTotalUsed;

  // Prune entries older than 30 days
  const pruneCutoffDate = new Date(nowTimestamp - 30 * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];
  for (const k of Object.keys(usageMap)) {
    const entryDate = k.split(":")[0];
    if (entryDate < pruneCutoffDate) {
      delete usageMap[k];
    }
  }

  writeJsonAtomic(DAILY_USAGE_FILE, usageMap);

  const { effectiveLimit } = getEffectiveDailyLimit(
    modelId,
    ip,
    cleanUserId,
    nowTimestamp,
  );
  const remainingPoints = Math.max(0, Math.round((effectiveLimit - newTotalUsed) * 1000) / 1000);

  return {
    addedPoints,
    newTotalUsed,
    effectiveLimit,
    remainingPoints,
    weightedAddedTokens: addedPoints,
    remainingTokens: remainingPoints,
  };
}

/**
 * Returns current status of points usage and model rates for a user and IP.
 */
export function getAllFreeModelsUsage(
  userId: string | number,
  ip: string,
  nowTimestamp: number = Date.now(),
) {
  const cleanUserId = String(userId);
  const cleanIp = normalizeIp(ip);
  const dateStr = getUtcDateString(new Date(nowTimestamp));
  const distinctUsers = getDistinctUsersOnIpInLastWeek(cleanIp, nowTimestamp);
  if (!distinctUsers.includes(cleanUserId)) {
    distinctUsers.push(cleanUserId);
  }
  const userCountOnIp = Math.max(1, distinctUsers.length);

  const effectiveLimit =
    userCountOnIp === 1
      ? DEFAULT_BASE_DAILY_POINTS
      : Math.max(1, Math.floor((DEFAULT_BASE_DAILY_POINTS / userCountOnIp) * 10) / 10);

  const usedPoints = getUserDailyPointsUsage(cleanUserId, dateStr);
  const remainingPoints = Math.max(0, Math.round((effectiveLimit - usedPoints) * 1000) / 1000);

  const models: Record<
    string,
    {
      id: string;
      name: string;
      tierName: string;
      rateDisplay: string;
      promptPointsPer1k: number;
      completionPointsPer1k: number;
      baseDailyLimit: number;
      effectiveLimit: number;
      outputMultiplier: number;
      usedTokens: number;
      remainingTokens: number;
    }
  > = {};

  for (const [id, config] of Object.entries(FREE_MODELS)) {
    const pricing = getModelPricing(id);

    models[id] = {
      id,
      name: config.name,
      tierName: config.tierName,
      rateDisplay: pricing.rateDisplay,
      promptPointsPer1k: pricing.promptPointsPer1k,
      completionPointsPer1k: pricing.completionPointsPer1k,
      baseDailyLimit: effectiveLimit,
      effectiveLimit,
      outputMultiplier: 1,
      usedTokens: usedPoints,
      remainingTokens: remainingPoints,
    };
  }

  return {
    userId: cleanUserId,
    ip: cleanIp,
    date: dateStr,
    userCountOnIp,
    baseDailyPoints: DEFAULT_BASE_DAILY_POINTS,
    effectiveLimitPoints: effectiveLimit,
    usedPoints,
    remainingPoints,
    baseDailyLimit: DEFAULT_BASE_DAILY_POINTS,
    effectiveLimit,
    models,
  };
}

/**
 * Wraps an upstream SSE ReadableStream to monitor token usage and execute a callback
 * when the stream completes or closes.
 */
export function createFreeAiTrackingStream(
  upstreamStream: ReadableStream<Uint8Array>,
  onComplete: (inputTokens: number, outputTokens: number) => void,
  fallbackInputTokens: number,
): ReadableStream<Uint8Array> {
  let promptTokens = Math.max(1, fallbackInputTokens);
  let completionTokens = 0;
  let hasExactUsage = false;
  let generatedChars = 0;
  let textBuffer = "";
  let isDone = false;

  const decoder = new TextDecoder();

  const finalize = () => {
    if (isDone) return;
    isDone = true;
    const finalOutputTokens = hasExactUsage
      ? completionTokens
      : Math.max(1, Math.ceil(generatedChars / 4));
    try {
      onComplete(promptTokens, finalOutputTokens);
    } catch (e) {
      console.error("Error in free AI stream completion callback:", e);
    }
  };

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      try {
        textBuffer += decoder.decode(chunk, { stream: true });
        const lines = textBuffer.split("\n");
        textBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.usage) {
              if (typeof parsed.usage.prompt_tokens === "number") {
                promptTokens = parsed.usage.prompt_tokens;
              }
              if (typeof parsed.usage.completion_tokens === "number") {
                completionTokens = parsed.usage.completion_tokens;
                hasExactUsage = true;
              }
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              generatedChars += delta.length;
            }
          } catch {}
        }
      } catch {}
    },
    flush() {
      finalize();
    },
  });

  return upstreamStream.pipeThrough(transformStream);
}

/**
 * Helper for testing: resets the storage files.
 */
export function _resetFreeAiLimitsForTesting(): void {
  try {
    if (fs.existsSync(IP_ACCESS_FILE)) fs.unlinkSync(IP_ACCESS_FILE);
    if (fs.existsSync(DAILY_USAGE_FILE)) fs.unlinkSync(DAILY_USAGE_FILE);
  } catch {}
}
