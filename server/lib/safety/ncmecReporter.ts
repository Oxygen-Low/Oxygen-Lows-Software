import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../dataStore.ts";
import { createNotification } from "../notifications.ts";

export const QUARANTINE_DIR = path.join(DATA_DIR, "quarantine");
export const CSAM_INCIDENTS_DIR = path.join(QUARANTINE_DIR, "csam_incidents");

export interface NcmecIncidentReport {
  reportId: string;
  createdAt: string;
  platform: {
    name: string;
    reportingEntity: string;
  };
  incidentType: string;
  suspectUser: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  networkTelemetry: {
    ip: string;
    userAgent: string;
    timestamp: string;
  };
  incidentDetails: {
    surface: "image_gen_prompt" | "image_gen_output" | "storage_upload" | "chat" | string;
    promptText?: string;
    fileHash?: string;
    fileName?: string;
    mimeType?: string;
    severity: number;
    reason?: string;
    details?: Record<string, any>;
  };
  status: "quarantined" | "submitted_to_ncmec" | "pending_manual_review";
  submissionResponse?: any;
}

function ensureQuarantineDirs() {
  if (!fs.existsSync(QUARANTINE_DIR)) {
    fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  }
  if (!fs.existsSync(CSAM_INCIDENTS_DIR)) {
    fs.mkdirSync(CSAM_INCIDENTS_DIR, { recursive: true });
  }
}

/**
 * Compiles and persists an incident dossier conforming to NCMEC reporting standards.
 */
export async function createNcmecIncidentReport(params: {
  user?: any;
  ip: string;
  userAgent?: string;
  surface: "image_gen_prompt" | "image_gen_output" | "storage_upload" | "chat" | string;
  promptText?: string;
  fileHash?: string;
  fileName?: string;
  mimeType?: string;
  severity: number;
  reason?: string;
  details?: Record<string, any>;
}): Promise<NcmecIncidentReport> {
  ensureQuarantineDirs();

  const reportId = `ncmec_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const report: NcmecIncidentReport = {
    reportId,
    createdAt: now,
    platform: {
      name: "Oxygen Low's Software",
      reportingEntity: "Automated CSAM Defense Pipeline",
    },
    incidentType: "Child Sexual Exploitation and Abuse Material Violation",
    suspectUser: {
      id: String(params.user?.id || "anonymous"),
      username: params.user?.username || "unknown",
      email: params.user?.email || "unknown",
      role: params.user?.role || "user",
    },
    networkTelemetry: {
      ip: params.ip || "unknown",
      userAgent: params.userAgent || "unknown",
      timestamp: now,
    },
    incidentDetails: {
      surface: params.surface,
      promptText: params.promptText,
      fileHash: params.fileHash,
      fileName: params.fileName,
      mimeType: params.mimeType,
      severity: params.severity,
      reason: params.reason,
      details: params.details,
    },
    status: "quarantined",
  };

  // Attempt automated dispatch if NCMEC ESP credentials exist
  const espUser = process.env.NCMEC_ESP_USERNAME;
  const espPass = process.env.NCMEC_ESP_PASSWORD;

  if (espUser && espPass) {
    try {
      const endpoint =
        process.env.NCMEC_API_ENDPOINT ||
        "https://report.cybertip.org/ispws/entry";

      const authHeader = `Basic ${Buffer.from(`${espUser}:${espPass}`).toString("base64")}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "User-Agent": "OxygenLowsSoftware-CSAM-Reporter/1.0",
        },
        body: JSON.stringify(report),
      });

      if (res.ok) {
        report.status = "submitted_to_ncmec";
        report.submissionResponse = await res.json().catch(() => ({ ok: true }));
      } else {
        report.status = "pending_manual_review";
        report.submissionResponse = { status: res.status, statusText: res.statusText };
      }
    } catch (err: any) {
      console.error("NCMEC CyberTipline automated dispatch error:", err);
      report.status = "pending_manual_review";
      report.submissionResponse = { error: err.message };
    }
  }

  // Save the report dossier in the secure admin quarantine vault
  const filePath = path.join(CSAM_INCIDENTS_DIR, `${reportId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");

  // Send High-Priority Administrative Alert
  try {
    createNotification({
      title: "[URGENT] CSAM Violation Quarantined",
      message: `High-confidence violation intercepted on ${params.surface} by user ${params.user?.username || params.user?.id || "anonymous"} (IP: ${params.ip}). Account suspended & IP banned. Dossier: ${reportId}.`,
      type: "alert",
      target_type: "all",
      created_by: "__system__",
      created_by_username: "WebDefender Safety",
    });
  } catch (err) {
    console.error("Failed to post admin security alert notification:", err);
  }

  return report;
}

/**
 * Lists all quarantined incident dossiers (Admin only).
 */
export function getAllQuarantinedIncidents(): NcmecIncidentReport[] {
  ensureQuarantineDirs();
  try {
    const files = fs.readdirSync(CSAM_INCIDENTS_DIR);
    const reports: NcmecIncidentReport[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const fullPath = path.join(CSAM_INCIDENTS_DIR, file);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          reports.push(JSON.parse(content));
        } catch {
          // Ignore corrupt files
        }
      }
    }

    return reports.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch (err) {
    console.error("Error reading quarantine incidents:", err);
    return [];
  }
}

/**
 * Retrieves a single quarantined incident dossier by reportId.
 */
export function getQuarantinedIncidentById(reportId: string): NcmecIncidentReport | null {
  ensureQuarantineDirs();
  const safeId = path.basename(reportId);
  const filePath = path.join(CSAM_INCIDENTS_DIR, `${safeId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
