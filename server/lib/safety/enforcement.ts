import type { Context } from "hono";
import { addDefenderBannedIp } from "../defenderBannedIps.ts";
import { suspendUser } from "../dataStore.ts";
import { createNcmecIncidentReport, type NcmecIncidentReport } from "./ncmecReporter.ts";

export interface EnforcementParams {
  ip: string;
  userAgent?: string;
  user?: any;
  surface: "image_gen_prompt" | "image_gen_output" | "storage_upload" | "chat" | string;
  promptText?: string;
  fileHash?: string;
  fileName?: string;
  mimeType?: string;
  severity: number;
  reason: string;
  details?: Record<string, any>;
}

export interface EnforcementResult {
  blocked: boolean;
  incidentId: string;
  ipBanned: boolean;
  userSuspended: boolean;
  report: NcmecIncidentReport;
  clientResponse: {
    error: string;
    code: string;
  };
}

/**
 * Extracts client IP from standard proxy headers or Hono context.
 */
export function extractClientIp(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xForwardedFor = c.req.header("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",");
    if (parts.length > 0 && parts[0].trim()) {
      return parts[0].trim();
    }
  }

  const xRealIp = c.req.header("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "127.0.0.1";
}

/**
 * Executes a Zero-Tolerance Automated Lockdown for high-confidence child safety violations:
 * 1. Blocks content instantly.
 * 2. Adds client IP to WebDefender active banned list.
 * 3. Suspends user account and invalidates auth tokens.
 * 4. Compiles standard NCMEC-compliant incident report and alerts admins.
 */
export async function executeZeroToleranceLockdown(
  params: EnforcementParams,
): Promise<EnforcementResult> {
  const reasonText = params.reason || "Automated CSAM / Child Safety Policy Violation";
  let ipBanned = false;
  let userSuspended = false;

  // 1. IP Ban in WebDefender
  if (params.ip) {
    try {
      addDefenderBannedIp(
        params.ip,
        `Automated Zero-Tolerance Ban: ${reasonText}`,
        "__system_safety__",
      );
      ipBanned = true;
    } catch (err) {
      console.error("Failed to add IP to WebDefender ban list:", err);
    }
  }

  // 2. User Account Suspension & Token Invalidation
  if (params.user && params.user.id) {
    try {
      suspendUser(params.user.id, `Automated Lockdown: ${reasonText}`);
      userSuspended = true;
    } catch (err) {
      console.error("Failed to suspend user account:", err);
    }
  }

  // 3. Compile NCMEC Incident Report & Alert Admin
  const report = await createNcmecIncidentReport({
    user: params.user,
    ip: params.ip,
    userAgent: params.userAgent,
    surface: params.surface,
    promptText: params.promptText,
    fileHash: params.fileHash,
    fileName: params.fileName,
    mimeType: params.mimeType,
    severity: params.severity,
    reason: reasonText,
    details: params.details,
  });

  return {
    blocked: true,
    incidentId: report.reportId,
    ipBanned,
    userSuspended,
    report,
    clientResponse: {
      error:
        "Content blocked due to Child Safety & Protection Policy violation. This incident has been quarantined and recorded.",
      code: "CHILD_SAFETY_POLICY_VIOLATION",
    },
  };
}
