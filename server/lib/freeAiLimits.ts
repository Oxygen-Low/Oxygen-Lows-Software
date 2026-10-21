import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./dataStore.ts";

export interface FreeModelConfig {
  id: string;
  name: string;
  baseDailyLimit: number;
  outputMultiplier: number;
  tierName: "Best" | "Standard" | "Cheap";
}

export const FREE_MODELS: Record<string, FreeModelConfig> = {
  "deepseek/deepseek-v4.1-flash": {
    id: "deepseek/deepseek-v4.1-flash",
    name: "Best",
    baseDailyLimit: 1_000_000,
    outputMultiplier: 4,
    tierName: "Best",
  },
  "openai/gpt-6-luna": {
    id: "openai/gpt-6-luna",
    name: "Standard",
    baseDailyLimit: 2_000_000,
    outputMultiplier: 5,
    tierName: "Standard",
  },
  "openai/gpt-oss-20b": {
    id: "openai/gpt-oss-20b",
    name: "Cheap",
    baseDailyLimit: 5_000_000,
    outputMultiplier: 6,
    tierName: "Cheap",
  },
};

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
  [key: string]: number; // key: `${dateStr}:${userId}:${modelId}` -> used tokens
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
    // If rename failed (e.g. cross-volume in some environments), fallback to direct write
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
  // Filter out expired records and deduplicate recent accesses within the last 60 seconds
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
 * Calculates the effective daily limit for a model given an IP and optional current user.
 * If multiple users accessed from this IP in the past 7 days, the base daily limit
 * is divided evenly among them (floored).
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
} {
  const config = FREE_MODELS[modelId];
  if (!config) {
    return {
      baseLimit: 0,
      userCountOnIp: 1,
      effectiveLimit: 0,
      outputMultiplier: 1,
    };
  }

  const distinctUsers = getDistinctUsersOnIpInLastWeek(ip, nowTimestamp);
  if (userId !== undefined && userId !== null) {
    const cleanUserId = String(userId);
    if (!distinctUsers.includes(cleanUserId)) {
      distinctUsers.push(cleanUserId);
    }
  }

  const userCountOnIp = Math.max(1, distinctUsers.length);
  const effectiveLimit = Math.floor(config.baseDailyLimit / userCountOnIp);

  return {
    baseLimit: config.baseDailyLimit,
    userCountOnIp,
    effectiveLimit,
    outputMultiplier: config.outputMultiplier,
  };
}

/**
 * Returns the used tokens today (UTC) for a given user and model.
 */
export function getUserDailyUsage(
  userId: string | number,
  modelId: string,
  dateStr: string = getUtcDateString(),
): number {
  const cleanUserId = String(userId);
  const usageMap = readJsonFile<UserDailyUsageRecord>(DAILY_USAGE_FILE, {});
  const key = `${dateStr}:${cleanUserId}:${modelId}`;
  return Number(usageMap[key]) || 0;
}

/**
 * Checks if a user has sufficient token budget remaining today for a free model.
 */
export function checkFreeModelAllowance(
  userId: string | number,
  modelId: string,
  ip: string,
  estimatedPromptTokens: number = 0,
  nowTimestamp: number = Date.now(),
): {
  allowed: boolean;
  usedTokens: number;
  remainingTokens: number;
  effectiveLimit: number;
  baseLimit: number;
  userCountOnIp: number;
  outputMultiplier: number;
} {
  const cleanUserId = String(userId);
  const dateStr = getUtcDateString(new Date(nowTimestamp));
  const { baseLimit, userCountOnIp, effectiveLimit, outputMultiplier } =
    getEffectiveDailyLimit(modelId, ip, cleanUserId, nowTimestamp);

  const usedTokens = getUserDailyUsage(cleanUserId, modelId, dateStr);
  const remainingTokens = Math.max(0, effectiveLimit - usedTokens);
  const allowed = usedTokens + estimatedPromptTokens <= effectiveLimit;

  return {
    allowed,
    usedTokens,
    remainingTokens,
    effectiveLimit,
    baseLimit,
    userCountOnIp,
    outputMultiplier,
  };
}

/**
 * Records token consumption for a user on a free model.
 * Output tokens are multiplied by the model's multiplier.
 */
export function recordFreeModelUsage(
  userId: string | number,
  modelId: string,
  ip: string,
  inputTokens: number,
  outputTokens: number,
  nowTimestamp: number = Date.now(),
): {
  weightedAddedTokens: number;
  newTotalUsed: number;
  effectiveLimit: number;
  remainingTokens: number;
} {
  const cleanUserId = String(userId);
  const dateStr = getUtcDateString(new Date(nowTimestamp));
  const config = FREE_MODELS[modelId];
  const multiplier = config?.outputMultiplier ?? 1;

  const weightedAdded = Math.max(0, Math.round(inputTokens + outputTokens * multiplier));

  // 1. Record IP access
  recordUserIpAccess(cleanUserId, ip, nowTimestamp);

  // 2. Update daily usage
  const usageMap = readJsonFile<UserDailyUsageRecord>(DAILY_USAGE_FILE, {});
  const key = `${dateStr}:${cleanUserId}:${modelId}`;
  const prevUsed = Number(usageMap[key]) || 0;
  const newTotalUsed = prevUsed + weightedAdded;
  usageMap[key] = newTotalUsed;

  // Prune entries older than 30 days to avoid unbounded growth
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
  const remainingTokens = Math.max(0, effectiveLimit - newTotalUsed);

  return {
    weightedAddedTokens: weightedAdded,
    newTotalUsed,
    effectiveLimit,
    remainingTokens,
  };
}

/**
 * Returns current status of all 3 free models for a user and IP.
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

  const models: Record<
    string,
    {
      id: string;
      name: string;
      tierName: string;
      baseDailyLimit: number;
      effectiveLimit: number;
      outputMultiplier: number;
      usedTokens: number;
      remainingTokens: number;
    }
  > = {};

  for (const [id, config] of Object.entries(FREE_MODELS)) {
    const effectiveLimit = Math.floor(config.baseDailyLimit / userCountOnIp);
    const usedTokens = getUserDailyUsage(cleanUserId, id, dateStr);
    const remainingTokens = Math.max(0, effectiveLimit - usedTokens);

    models[id] = {
      id,
      name: config.name,
      tierName: config.tierName,
      baseDailyLimit: config.baseDailyLimit,
      effectiveLimit,
      outputMultiplier: config.outputMultiplier,
      usedTokens,
      remainingTokens,
    };
  }

  return {
    userId: cleanUserId,
    ip: cleanIp,
    date: dateStr,
    userCountOnIp,
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
