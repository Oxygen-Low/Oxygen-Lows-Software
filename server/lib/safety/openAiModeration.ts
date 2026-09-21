import {
  executeZeroToleranceLockdown,
  type EnforcementParams,
  type EnforcementResult,
} from "./enforcement.ts";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

export const SELF_HARM_HELP_URL = "https://findahelpline.com/";

export interface OpenAiModerationResult {
  allowed: boolean;
  category?: string;
  isSelfHarm?: boolean;
  isCsamMinorViolation?: boolean;
  redirectUrl?: string;
  reason?: string;
  details?: Record<string, any>;
  bypassed?: boolean;
  apiError?: string;
}

export interface ModerationClientResponse {
  error: string;
  code: "CHILD_SAFETY_POLICY_VIOLATION" | "SELF_HARM_DETECTED" | "CONTENT_POLICY_VIOLATION" | string;
  category?: string;
  redirectUrl?: string;
}

/**
 * Moderation categories policy mapping:
 * harassment: Blocked
 * harassment/threatening: Blocked
 * hate: Blocked
 * hate/threatening: Blocked
 * illicit: Blocked
 * illicit/violent: Blocked
 * self-harm: Blocked + redirect to help website
 * self-harm/intent: Blocked + redirect to help website
 * self-harm/instructions: Blocked + redirect to help website
 * sexual: Blocked
 * sexual/minors: Blocked + do everything CSAM detection does
 * violence: Allowed
 * violence/graphic: Blocked
 */
export function evaluateModerationCategories(
  categories: Record<string, boolean>,
  details?: Record<string, any>,
): OpenAiModerationResult {
  if (!categories) {
    return { allowed: true };
  }

  // 1. sexual/minors: Blocked + escalate to CSAM lockdown
  if (categories["sexual/minors"]) {
    return {
      allowed: false,
      category: "sexual/minors",
      isCsamMinorViolation: true,
      reason: "Matched prohibited child exploitation or minor safety policy (sexual/minors)",
      details,
    };
  }

  // 2. self-harm categories: Blocked + redirect to help website
  const selfHarmCategories = ["self-harm", "self-harm/intent", "self-harm/instructions"];
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

  // 3. Other blocked categories
  const blockedCategories = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit",
    "illicit/violent",
    "sexual",
    "violence/graphic",
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

  // General "violence" is explicitly allowed if "violence/graphic" is false
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
 * Returns the effective OpenAI API key from environment variables or optional override.
 * Checks OPENAI_MODERATION_API_KEY, OPENAI_API_KEY, and case-insensitive matches in process.env.
 * If not found, attempts to locate and load a .env file from common deployment paths.
 */
export function getOpenAiApiKey(overrideKey?: string): string {
  if (overrideKey && typeof overrideKey === "string" && overrideKey.trim().length > 0) {
    return overrideKey.trim().replace(/^['"]|['"]$/g, "");
  }

  // Helper to extract candidate key from current process.env
  const extractFromEnv = (): string => {
    const direct = process.env.OPENAI_MODERATION_API_KEY || process.env.OPENAI_API_KEY;
    if (direct && typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim().replace(/^['"]|['"]$/g, "");
    }

    for (const [key, val] of Object.entries(process.env)) {
      if (
        typeof val === "string" &&
        val.trim().length > 0 &&
        (/^openai[_-]?(moderation[_-]?)?api[_-]?key$/i.test(key) || /^openai[_-]?key$/i.test(key))
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

  // Fallback: try loading .env if not yet loaded in process.env (e.g. Plesk / PM2 custom cwd)
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
 * Returns true if an OpenAI API key is detected.
 */
export function isOpenAiConfigured(overrideKey?: string): boolean {
  return getOpenAiApiKey(overrideKey).length > 0;
}

/**
 * Calls OpenAI Moderation API with omni-moderation-latest.
 * Fail-open design: if key is absent or API call fails, logs a warning and returns { allowed: true }.
 */
export async function checkOpenAiModeration(
  input: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
  overrideApiKey?: string,
): Promise<OpenAiModerationResult> {
  const apiKey = getOpenAiApiKey(overrideApiKey);
  if (!apiKey) {
    console.warn(
      "[OpenAI Moderation] OPENAI_API_KEY is not configured; failing open (allowing request).",
    );
    return { allowed: true, bypassed: true, reason: "OPENAI_API_KEY is not configured" };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input,
      }),
    });

    if (!res.ok) {
      const errText =
        typeof (res as any).text === "function"
          ? await (res as any).text().catch(() => "")
          : "";
      const errorMsg = errText ? `HTTP ${res.status}: ${errText}` : `HTTP ${res.status}`;
      console.warn(
        `[OpenAI Moderation] API returned ${errorMsg}; failing open with warning.`,
      );
      return {
        allowed: true,
        bypassed: true,
        apiError: `OpenAI API returned ${errorMsg}`,
      };
    }

    const data: any = await res.json();
    const results = data.results;
    if (!Array.isArray(results) || results.length === 0) {
      return { allowed: true, details: data };
    }

    // Combine flagged results across all inputs if multiple items
    for (const result of results) {
      const evaluation = evaluateModerationCategories(result.categories || {}, data);
      if (!evaluation.allowed) {
        return evaluation;
      }
    }

    return { allowed: true, details: data };
  } catch (err: any) {
    console.warn("[OpenAI Moderation] Request failed; failing open with warning:", err);
    return {
      allowed: true,
      bypassed: true,
      apiError: err?.message || String(err),
    };
  }
}

/**
 * Moderate text string using OpenAI Moderation API.
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

  return checkOpenAiModeration(text, overrideApiKey);
}

/**
 * Moderate image buffer using OpenAI Moderation API via base64 data URI.
 */
export async function moderateImage(
  buffer: Buffer,
  mimeType: string = "image/png",
  overrideApiKey?: string,
): Promise<OpenAiModerationResult> {
  if (!buffer || buffer.length === 0) {
    return { allowed: true };
  }

  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return checkOpenAiModeration(
    [
      {
        type: "image_url",
        image_url: {
          url: dataUrl,
        },
      },
    ],
    overrideApiKey,
  );
}

/**
 * Convenience helper to handle moderation result across routes.
 * If sexual/minors is detected, triggers executeZeroToleranceLockdown.
 * Returns null if allowed, or an object ready to send back to client via c.json(response, 400).
 */
export async function handleModerationEnforcement(
  result: OpenAiModerationResult,
  enforcementContext: Omit<EnforcementParams, "severity" | "reason">,
): Promise<{ clientResponse: ModerationClientResponse; isLockdown: boolean } | null> {
  if (result.allowed) {
    return null;
  }

  // 1. sexual/minors escalation -> Execute Zero Tolerance Lockdown
  if (result.isCsamMinorViolation) {
    const lockdown = await executeZeroToleranceLockdown({
      ...enforcementContext,
      severity: 3,
      reason: result.reason || "Prohibited minor safety violation detected by OpenAI Moderation",
      details: result.details,
    });
    return {
      clientResponse: lockdown.clientResponse,
      isLockdown: true,
    };
  }

  // 2. self-harm redirect
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

  // 3. General blocked category
  console.warn(
    `[Safety Enforcement] Blocked ${result.category} on ${enforcementContext.surface}.`,
  );
  return {
    clientResponse: {
      error: `Content blocked due to safety policy violation: ${result.category}.`,
      code: "CONTENT_POLICY_VIOLATION",
      category: result.category,
    },
    isLockdown: false,
  };
}
