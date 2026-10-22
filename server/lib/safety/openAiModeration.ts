import {
  executeZeroToleranceLockdown,
  type EnforcementParams,
  type EnforcementResult,
} from "./enforcement.ts";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

export const SELF_HARM_HELP_URL = "https://findahelpline.com/";
export const POLLINATIONS_MODERATION_MODEL = "qwen/qwen3guard-gen-8b";

export interface OpenAiModerationResult {
  allowed: boolean;
  category?: string;
  isSelfHarm?: boolean;
  isCsamMinorViolation?: boolean;
  isServiceUnavailable?: boolean;
  redirectUrl?: string;
  reason?: string;
  details?: Record<string, any>;
  bypassed?: boolean;
  apiError?: string;
}

export interface ModerationClientResponse {
  error: string;
  code:
    | "CHILD_SAFETY_POLICY_VIOLATION"
    | "SELF_HARM_DETECTED"
    | "CONTENT_POLICY_VIOLATION"
    | "MODERATION_SERVICE_UNAVAILABLE"
    | string;
  category?: string;
  redirectUrl?: string;
}

export interface Qwen3GuardParseResult {
  safety: "Safe" | "Controversial" | "Unsafe" | "Unknown";
  categories: string[];
  rawText: string;
}

/**
 * Parses Qwen3Guard structured model output.
 * Standard format:
 * Safety: [Safe | Controversial | Unsafe]
 * Categories: [Category_Name | None]
 */
export function parseQwen3GuardOutput(content: string): Qwen3GuardParseResult {
  if (!content || typeof content !== "string") {
    return { safety: "Unknown", categories: [], rawText: "" };
  }

  const trimmed = content.trim();

  // Match Safety: Safe | Controversial | Unsafe
  const safetyMatch = trimmed.match(/Safety:\s*(Safe|Controversial|Unsafe)/i);
  let safety: "Safe" | "Controversial" | "Unsafe" | "Unknown" = "Unknown";
  if (safetyMatch) {
    const rawVal = safetyMatch[1].toLowerCase();
    if (rawVal === "safe") safety = "Safe";
    else if (rawVal === "controversial") safety = "Controversial";
    else if (rawVal === "unsafe") safety = "Unsafe";
  } else {
    if (/^safe\b/i.test(trimmed)) safety = "Safe";
    else if (/^unsafe\b/i.test(trimmed)) safety = "Unsafe";
    else if (/^controversial\b/i.test(trimmed)) safety = "Controversial";
  }

  // Match Categories: ...
  const categoriesMatch = trimmed.match(/Categories:\s*([^\n\r]+)/i);
  let categories: string[] = [];
  if (categoriesMatch) {
    const rawCat = categoriesMatch[1].trim();
    if (rawCat && rawCat.toLowerCase() !== "none") {
      categories = rawCat
        .split(/[,;\/]+/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
  }

  return { safety, categories, rawText: trimmed };
}

/**
 * Evaluates parsed Qwen3Guard verdict:
 * Standard mode: Blocks "Unsafe" verdicts only; allows "Controversial" and "Safe".
 * Maps self-harm to crisis resources and child/minor safety to zero-tolerance lockdown.
 */
export function evaluateQwen3GuardVerdict(
  verdict: Qwen3GuardParseResult,
  details?: Record<string, any>,
): OpenAiModerationResult {
  if (verdict.safety === "Safe" || verdict.safety === "Controversial") {
    return { allowed: true, category: verdict.categories[0], details };
  }

  if (verdict.safety === "Unsafe") {
    // 1. Check for child safety / exploitation
    const isCsamMinor = verdict.categories.some((cat) =>
      /minor|child|csam|pedophil|exploitation/i.test(cat),
    );
    if (isCsamMinor) {
      return {
        allowed: false,
        category: "sexual/minors",
        isCsamMinorViolation: true,
        reason: "Matched prohibited child exploitation or minor safety policy",
        details,
      };
    }

    // 2. Check for self-harm / suicide
    const isSelfHarm = verdict.categories.some((cat) =>
      /suicide|self-harm|self harm/i.test(cat),
    );
    if (isSelfHarm) {
      const selfHarmCat =
        verdict.categories.find((cat) => /suicide|self-harm|self harm/i.test(cat)) ||
        "Suicide & Self-Harm";
      return {
        allowed: false,
        category: selfHarmCat,
        isSelfHarm: true,
        redirectUrl: SELF_HARM_HELP_URL,
        reason: "Content flagged under self-harm policy. Crisis support resources provided.",
        details,
      };
    }

    // 3. Other blocked categories
    const primaryCategory = verdict.categories[0] || "Violent";
    return {
      allowed: false,
      category: primaryCategory,
      reason: `Content violates safety policy: ${verdict.categories.join(", ") || primaryCategory}`,
      details,
    };
  }

  // Unknown or unparseable output -> Fail closed
  return {
    allowed: false,
    isServiceUnavailable: true,
    reason: "Unable to verify content safety with moderation service.",
    details,
  };
}

/**
 * Legacy category map evaluation (retained for backward compatibility and unit tests).
 */
export function evaluateModerationCategories(
  categories: Record<string, boolean>,
  details?: Record<string, any>,
): OpenAiModerationResult {
  if (!categories) {
    return { allowed: true };
  }

  if (categories["sexual/minors"]) {
    return {
      allowed: false,
      category: "sexual/minors",
      isCsamMinorViolation: true,
      reason: "Matched prohibited child exploitation or minor safety policy (sexual/minors)",
      details,
    };
  }

  const selfHarmCategories = [
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
    "Suicide & Self-Harm",
  ];
  for (const cat of selfHarmCategories) {
    if (categories[cat]) {
      return {
        allowed: false,
        category: cat,
        isSelfHarm: true,
        redirectUrl: SELF_HARM_HELP_URL,
        reason: "Content flagged under self-harm policy. Crisis support resources provided.",
        details,
      };
    }
  }

  const blockedCategories = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit",
    "illicit/violent",
    "sexual",
    "violence/graphic",
    "Violent",
    "Non-violent Illegal Acts",
    "Sexual Content or Sexual Acts",
    "PII",
    "Unethical Acts",
    "Copyright Violation",
  ];

  for (const cat of blockedCategories) {
    if (categories[cat]) {
      return {
        allowed: false,
        category: cat,
        reason: `Content violates safety policy: ${cat}`,
        details,
      };
    }
  }

  return { allowed: true, details };
}

/**
 * Direct violent threat heuristics as an immediate baseline guard.
 * Ensures severe threats of harm or hunting someone down are flagged as harassment/threatening
 * even if cloud moderation is temporarily offline or unconfigured.
 */
const DIRECT_THREAT_PATTERNS = [
  /\b(hunt|track|stalk)\s+(you|u)\s+down\b/i,
  /\b(going\s+to|gonna|will)\s+(kill|murder|slaughter|harm|shoot|stab)\s+(you|u)\b/i,
  /\bi('ll|\s+will)\s+(kill|murder|harm|end)\s+(you|u)\b/i,
];

/**
 * Returns the effective Pollinations API key from environment variables or optional override.
 * Checks POLLINATIONS_API_KEY, and case-insensitive matches in process.env.
 * If not found, attempts to locate and load a .env file from common deployment paths.
 */
export function getPollinationsApiKey(overrideKey?: string): string {
  if (overrideKey && typeof overrideKey === "string" && overrideKey.trim().length > 0) {
    return overrideKey.trim().replace(/^['"]|['"]$/g, "");
  }

  const extractFromEnv = (): string => {
    const direct = process.env.POLLINATIONS_API_KEY;
    if (direct && typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim().replace(/^['"]|['"]$/g, "");
    }

    for (const [key, val] of Object.entries(process.env)) {
      if (
        typeof val === "string" &&
        val.trim().length > 0 &&
        /^pollinations[_-]?(api[_-]?)?key$/i.test(key)
      ) {
        return val.trim().replace(/^['"]|['"]$/g, "");
      }
    }
    return "";
  };

  const keyFromEnv = extractFromEnv();
  if (keyFromEnv) {
    return keyFromEnv;
  }

  try {
    const possibleEnvPaths = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../.env"),
    ];

    for (const envPath of possibleEnvPaths) {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false });
        const found = extractFromEnv();
        if (found) return found;
      }
    }
  } catch {
    // Non-fatal, continue with empty key
  }

  return "";
}

/**
 * Returns true if a moderation API key is detected.
 */
export function isModerationConfigured(overrideKey?: string): boolean {
  return getPollinationsApiKey(overrideKey).length > 0;
}

// Backward-compatibility aliases
export const getOpenAiApiKey = getPollinationsApiKey;
export const isOpenAiConfigured = isModerationConfigured;

/**
 * Calls Pollinations API with qwen/qwen3guard-gen-8b.
 * Fail-closed design: if the API call fails or times out, returns { allowed: false, isServiceUnavailable: true }.
 * If key is not configured in local environment, fails open with warning for local dev/testing.
 */
export async function checkPollinationsModeration(
  text: string,
  overrideApiKey?: string,
): Promise<OpenAiModerationResult> {
  const apiKey = getPollinationsApiKey(overrideApiKey);
  if (!apiKey) {
    console.warn(
      "[Pollinations Moderation] POLLINATIONS_API_KEY is not configured; bypassing cloud moderation for local unconfigured environment.",
    );
    return { allowed: true, bypassed: true, reason: "POLLINATIONS_API_KEY is not configured" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: POLLINATIONS_MODERATION_MODEL,
        messages: [{ role: "user", content: text }],
        stream: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText =
        typeof (res as any).text === "function"
          ? await (res as any).text().catch(() => "")
          : "";
      const errorMsg = errText ? `HTTP ${res.status}: ${errText}` : `HTTP ${res.status}`;
      console.warn(`[Pollinations Moderation] API returned ${errorMsg}; failing closed.`);
      return {
        allowed: false,
        isServiceUnavailable: true,
        apiError: errorMsg,
        reason: "Moderation service is temporarily unavailable. Please try again shortly.",
      };
    }

    const data: any = await res.json();
    const messageContent = data?.choices?.[0]?.message?.content;
    if (!messageContent || typeof messageContent !== "string") {
      console.warn("[Pollinations Moderation] Empty or invalid response payload; failing closed.");
      return {
        allowed: false,
        isServiceUnavailable: true,
        apiError: "Empty response from moderation model",
        reason: "Moderation service returned an invalid response.",
        details: data,
      };
    }

    const verdict = parseQwen3GuardOutput(messageContent);
    return evaluateQwen3GuardVerdict(verdict, data);
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    const errorMsg = isAbort ? "Request timed out after 10s" : err?.message || String(err);
    console.warn("[Pollinations Moderation] Request failed; failing closed:", errorMsg);
    return {
      allowed: false,
      isServiceUnavailable: true,
      apiError: errorMsg,
      reason: "Moderation service is temporarily unavailable. Please try again shortly.",
    };
  }
}

// Backward-compatibility alias
export const checkOpenAiModeration = async (
  input: string | Array<{ type: string; text?: string; [key: string]: any }>,
  overrideApiKey?: string,
): Promise<OpenAiModerationResult> => {
  if (typeof input === "string") {
    return checkPollinationsModeration(input, overrideApiKey);
  }
  const text = input
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n");
  if (!text) {
    return { allowed: true };
  }
  return checkPollinationsModeration(text, overrideApiKey);
};

/**
 * Moderate text string using Pollinations qwen/qwen3guard-gen-8b.
 */
export async function moderateText(
  text: string,
  overrideApiKey?: string,
): Promise<OpenAiModerationResult> {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { allowed: true };
  }

  // Fast baseline check for direct violent threats
  for (const pattern of DIRECT_THREAT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        category: "harassment/threatening",
        reason: "Matched prohibited threat of violence or physical harm",
      };
    }
  }

  return checkPollinationsModeration(text, overrideApiKey);
}

/**
 * Moderate image buffer.
 * Per policy, cloud image moderation is disabled in favor of local CSAM Guard.
 */
export async function moderateImage(
  _buffer?: Buffer,
  _mimeType: string = "image/png",
  _overrideApiKey?: string,
): Promise<OpenAiModerationResult> {
  return { allowed: true };
}

/**
 * Convenience helper to handle moderation result across routes.
 * If sexual/minors is detected, triggers executeZeroToleranceLockdown.
 * If service is unavailable, returns MODERATION_SERVICE_UNAVAILABLE.
 * Returns null if allowed, or an object ready to send back to client via c.json(response, 400 or 503).
 */
export async function handleModerationEnforcement(
  result: OpenAiModerationResult,
  enforcementContext: Omit<EnforcementParams, "severity" | "reason">,
): Promise<{ clientResponse: ModerationClientResponse; isLockdown: boolean } | null> {
  if (result.allowed) {
    return null;
  }

  // 1. Service unavailable (Fail-closed)
  if (result.isServiceUnavailable) {
    console.warn(
      `[Safety Enforcement] Moderation service unavailable on ${enforcementContext.surface}: ${result.apiError || result.reason}`,
    );
    return {
      clientResponse: {
        error: "Safety moderation service is temporarily unavailable. Please try again shortly.",
        code: "MODERATION_SERVICE_UNAVAILABLE",
      },
      isLockdown: false,
    };
  }

  // 2. sexual/minors escalation -> Execute Zero Tolerance Lockdown
  if (result.isCsamMinorViolation) {
    const lockdown = await executeZeroToleranceLockdown({
      ...enforcementContext,
      severity: 3,
      reason: result.reason || "Prohibited minor safety violation detected by Moderation",
      details: result.details,
    });
    return {
      clientResponse: lockdown.clientResponse,
      isLockdown: true,
    };
  }

  // 3. self-harm redirect
  if (result.isSelfHarm) {
    console.warn(
      `[Safety Enforcement] Self-harm content blocked on ${enforcementContext.surface}. Redirecting user to helpline.`,
    );
    return {
      clientResponse: {
        error:
          "Content blocked by safety policy. If you or someone you know is struggling, support is available.",
        code: "SELF_HARM_DETECTED",
        category: result.category,
        redirectUrl: result.redirectUrl || SELF_HARM_HELP_URL,
      },
      isLockdown: false,
    };
  }

  // 4. General blocked category
  console.warn(
    `[Safety Enforcement] Blocked ${result.category} on ${enforcementContext.surface}.`,
  );
  return {
    clientResponse: {
      error: `Content blocked due to safety policy violation: ${result.category || "General Safety"}.`,
      code: "CONTENT_POLICY_VIOLATION",
      category: result.category,
    },
    isLockdown: false,
  };
}
