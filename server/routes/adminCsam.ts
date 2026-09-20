import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getAllQuarantinedIncidents,
  getQuarantinedIncidentById,
  type NcmecIncidentReport,
} from "../lib/safety/ncmecReporter.ts";

export const adminCsamRouter = new Hono();

// Admin Authentication Middleware
adminCsamRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user" as any, user);
  await next();
});

/**
 * GET /api/admin/safety/incidents
 * Lists quarantined child safety / CSAM incident dossiers.
 * Note: Raw media binaries are NEVER served or rendered here.
 */
adminCsamRouter.get("/incidents", (c) => {
  const incidents = getAllQuarantinedIncidents();
  // Sanitize to guarantee no raw base64 or media payloads are returned to UI
  const sanitized = incidents.map((inc) => ({
    reportId: inc.reportId,
    createdAt: inc.createdAt,
    incidentType: inc.incidentType,
    status: inc.status,
    suspectUser: inc.suspectUser,
    networkTelemetry: inc.networkTelemetry,
    incidentDetails: {
      surface: inc.incidentDetails.surface,
      fileHash: inc.incidentDetails.fileHash,
      fileName: inc.incidentDetails.fileName,
      mimeType: inc.incidentDetails.mimeType,
      severity: inc.incidentDetails.severity,
      reason: inc.incidentDetails.reason,
      promptSnippet: inc.incidentDetails.promptText
        ? inc.incidentDetails.promptText.slice(0, 100)
        : undefined,
    },
  }));

  return c.json({ incidents: sanitized, total: sanitized.length });
});

/**
 * GET /api/admin/safety/incidents/:id
 * Retrieve a specific incident dossier.
 */
adminCsamRouter.get("/incidents/:id", (c) => {
  const id = c.req.param("id");
  const incident = getQuarantinedIncidentById(id);
  if (!incident) {
    return c.json({ error: "Incident dossier not found" }, 404);
  }
  return c.json({ incident });
});

/**
 * GET /api/admin/safety/incidents/:id/export-ncmec
 * Exports an incident dossier formatted for NCMEC CyberTipline reporting.
 */
adminCsamRouter.get("/incidents/:id/export-ncmec", (c) => {
  const id = c.req.param("id");
  const incident = getQuarantinedIncidentById(id);
  if (!incident) {
    return c.json({ error: "Incident dossier not found" }, 404);
  }

  const exportPayload = {
    reportingPlatform: "Oxygen Low's Software",
    submissionUrl: "https://report.cybertip.org/",
    espReportGuide: "Use the NCMEC CyberTipline or ESP API with the following data points:",
    reportData: {
      incidentId: incident.reportId,
      incidentTimestampUtc: incident.createdAt,
      reportedPerson: {
        userId: incident.suspectUser.id,
        screenName: incident.suspectUser.username,
        email: incident.suspectUser.email,
      },
      technicalData: {
        ipAddress: incident.networkTelemetry.ip,
        userAgent: incident.networkTelemetry.userAgent,
        incidentSurface: incident.incidentDetails.surface,
        perceptualOrSha256Hash: incident.incidentDetails.fileHash,
        violationSummary: incident.incidentDetails.reason,
        reportedPrompt: incident.incidentDetails.promptText,
      },
    },
  };

  return c.json(exportPayload);
});
