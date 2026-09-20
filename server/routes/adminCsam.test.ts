import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { adminCsamRouter } from "./adminCsam.ts";
import { generateToken } from "../lib/auth.ts";
import { initUserFolder } from "../lib/dataStore.ts";
import { createNcmecIncidentReport } from "../lib/safety/ncmecReporter.ts";

const app = new Hono();
app.route("/api/admin/safety", adminCsamRouter);

describe("Admin CSAM Safety & NCMEC Dossier API", () => {
  const adminToken = generateToken({ id: "1", username: "admin", email: "admin@example.com" });
  const regularToken = generateToken({ id: "user_789", username: "regular", email: "user@example.com" });
  let testIncidentId = "";

  beforeAll(async () => {
    initUserFolder("1", {
      username: "admin",
      email: "admin@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "admin",
    });

    initUserFolder("user_789", {
      username: "regular",
      email: "user@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
    });

    // Create a mock quarantined incident
    const report = await createNcmecIncidentReport({
      user: { id: "user_789", username: "regular", email: "user@example.com", role: "user" },
      ip: "192.0.2.100",
      userAgent: "TestAgent/1.0",
      surface: "image_gen_prompt",
      promptText: "violating prompt content",
      severity: 3,
      reason: "Test CSAM violation",
    });
    testIncidentId = report.reportId;
  });

  it("rejects unauthorized access without token", async () => {
    const res = await app.request("/api/admin/safety/incidents");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users with 403 Forbidden", async () => {
    const res = await app.request("/api/admin/safety/incidents", {
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("allows admins to list incidents and hides raw media content", async () => {
    const res = await app.request("/api/admin/safety/incidents", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.incidents)).toBe(true);
    const found = data.incidents.find((i: any) => i.reportId === testIncidentId);
    expect(found).toBeDefined();
    expect(found.incidentType).toContain("Child Sexual Exploitation");
    expect(found.networkTelemetry.ip).toBe("192.0.2.100");
  });

  it("retrieves full incident dossier by ID", async () => {
    const res = await app.request(`/api/admin/safety/incidents/${testIncidentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.incident).toBeDefined();
    expect(data.incident.reportId).toBe(testIncidentId);
    expect(data.incident.suspectUser.id).toBe("user_789");
  });

  it("exports formatted NCMEC CyberTipline dossier payload", async () => {
    const res = await app.request(`/api/admin/safety/incidents/${testIncidentId}/export-ncmec`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reportingPlatform).toBe("Oxygen Low's Software");
    expect(data.submissionUrl).toBe("https://report.cybertip.org/");
    expect(data.reportData.incidentId).toBe(testIncidentId);
    expect(data.reportData.technicalData.ipAddress).toBe("192.0.2.100");
    expect(data.reportData.technicalData.reportedPrompt).toBe("violating prompt content");
  });
});
