import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { adminWebdefenderRouter } from "./adminWebdefender.ts";
import { defenderRouter } from "./webdefender.ts";
import { generateToken } from "../lib/auth.ts";
import { getActiveDefenderBannedIps, publicDefenderBannedIp } from "../lib/defenderBannedIps.ts";
import { initUserFolder } from "../lib/dataStore.ts";

const app = new Hono();
app.route("/api/admin/webdefender", adminWebdefenderRouter);
app.route("/api/admin/banned-ips", adminWebdefenderRouter);
app.route("/api/webdefender", defenderRouter);

app.get("/api/banned-ips", async (c) => {
  const bannedIps = getActiveDefenderBannedIps().map(publicDefenderBannedIp);
  return c.json({ banned_ips: bannedIps, total: bannedIps.length });
});

describe("Banned IPs API and Admin Workflows", () => {
  const adminToken = generateToken({ id: "1", username: "admin", email: "admin@example.com" });
  const regularToken = generateToken({ id: "user_456", username: "regular_user", email: "user@example.com" });
  let createdBanId = "";

  beforeAll(() => {
    initUserFolder("1", {
      username: "admin",
      email: "admin@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "admin",
    });
    initUserFolder("user_456", {
      username: "regular_user",
      email: "user@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
    });
  });

  it("rejects unauthorized requests to admin banned IPs endpoint", async () => {
    const res = await app.request("/api/admin/webdefender/banned-ips", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users from admin banned IPs endpoint", async () => {
    const res = await app.request("/api/admin/webdefender/banned-ips", {
      method: "GET",
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns public list of banned IPs", async () => {
    const res1 = await app.request("/api/banned-ips");
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(Array.isArray(data1.banned_ips)).toBe(true);

    const res2 = await app.request("/api/webdefender/banned-ips");
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(Array.isArray(data2.banned_ips)).toBe(true);
  });

  it("validates IP address and reason when adding a ban", async () => {
    const invalidIpRes = await app.request("/api/admin/webdefender/banned-ips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ip: "not-an-ip", reason: "Malicious scanner" }),
    });
    expect(invalidIpRes.status).toBe(400);

    const missingReasonRes = await app.request("/api/admin/webdefender/banned-ips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ip: "198.51.100.42", reason: "   " }),
    });
    expect(missingReasonRes.status).toBe(400);
  });

  it("creates a new banned IP with admin token and reason", async () => {
    const testIp = "198.51.100.42";
    const testReason = "Repeated automated vulnerability exploitation attempts";

    const res = await app.request("/api/admin/webdefender/banned-ips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ip: testIp, reason: testReason }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.banned_ip).toBeDefined();
    expect(data.banned_ip.ip).toBe(testIp);
    expect(data.banned_ip.reason).toBe(testReason);
    expect(data.banned_ip.active).toBe(true);
    createdBanId = data.banned_ip.id;
  });

  it("lists the newly created ban in admin endpoints", async () => {
    const res = await app.request("/api/admin/webdefender/banned-ips", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const found = data.banned_ips.find((b: any) => b.id === createdBanId);
    expect(found).toBeDefined();
    expect(found.ip).toBe("198.51.100.42");
  });

  it("lists the active ban in the public directory", async () => {
    const res = await app.request("/api/banned-ips");
    expect(res.status).toBe(200);
    const data = await res.json();
    const found = data.banned_ips.find((b: any) => b.ip === "198.51.100.42");
    expect(found).toBeDefined();
    expect(found.reason).toBe("Repeated automated vulnerability exploitation attempts");
    expect(found.created_by).toBeUndefined(); // Sensitive admin info not exposed in public directory
  });

  it("updates an existing ban reason via PATCH", async () => {
    const updatedReason = "Updated reason: Verified botnet probe node";
    const res = await app.request(`/api/admin/webdefender/banned-ips/${createdBanId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ip: "198.51.100.42", reason: updatedReason }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.banned_ip.reason).toBe(updatedReason);
  });

  it("revokes a banned IP via DELETE", async () => {
    const res = await app.request(`/api/admin/webdefender/banned-ips/${createdBanId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.banned_ip.active).toBe(false);

    // After revocation, the public directory should no longer return it
    const publicRes = await app.request("/api/banned-ips");
    const publicData = await publicRes.json();
    const found = publicData.banned_ips.find((b: any) => b.ip === "198.51.100.42");
    expect(found).toBeUndefined();
  });
});

