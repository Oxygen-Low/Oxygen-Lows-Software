import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { defenderRouter, torDetector, vpnDetector, threatActorDetector } from "./webdefender.ts";
import { insertTable, initUserFolder } from "../lib/dataStore.ts";
import { DEFENDER_BANS_OWNER_ID } from "../lib/defenderBannedIps.ts";

const app = new Hono();
app.route("/api/webdefender", defenderRouter);

describe("Web Defender Known Threats API", () => {
  beforeAll(() => {
    initUserFolder(DEFENDER_BANS_OWNER_ID, {
      username: "system",
      email: "system@example.com",
      role: "admin",
    });
  });

  describe("Input Validation", () => {
    it("returns 400 when ip parameter is missing in GET", async () => {
      const res = await app.request("/api/webdefender/known-threats");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("IP address is required");
    });

    it("returns 400 when ip parameter is empty string or spaces in GET", async () => {
      const res = await app.request("/api/webdefender/known-threats?ip=   ");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("IP address is required");
    });

    it("returns 400 when ip is not a valid IP format in GET", async () => {
      const res = await app.request("/api/webdefender/known-threats?ip=not-an-ip");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid IP address format");
    });

    it("returns 400 when ip octets are out of range", async () => {
      const res = await app.request("/api/webdefender/known-threats?ip=999.999.999.999");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid IP address format");
    });

    it("returns 400 when ip parameter is missing in POST", async () => {
      const res = await app.request("/api/webdefender/known-threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("IP address is required");
    });

    it("returns 400 when body is invalid JSON in POST", async () => {
      const res = await app.request("/api/webdefender/known-threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("IP address is required");
    });

    it("returns 400 when ip in POST has invalid format", async () => {
      const res = await app.request("/api/webdefender/known-threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: "bad.ip" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid IP address format");
    });
  });

  describe("Threat Detection", () => {
    it("returns false flags for a clean, unknown IP", async () => {
      const res = await app.request("/api/webdefender/known-threats?ip=8.8.8.8");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        ip: "8.8.8.8",
        is_known_threat: false,
        is_tor: false,
        is_vpn: false,
        details: {
          banned: false,
          banned_reason: null,
          threat_actor: false,
          threat_category: null,
        },
      });
    });

    it("supports valid IPv6 addresses", async () => {
      const res = await app.request("/api/webdefender/known-threats?ip=2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ip).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      expect(data.is_known_threat).toBe(false);
    });

    it("identifies platform administrator banned IPs as known threats", async () => {
      const bannedIp = "192.0.2.100";
      insertTable(
        "defender_banned_ips",
        {
          id: "ban_test_100",
          ip: bannedIp,
          reason: "Active credential stuffing node",
          active: true,
          created_by: "system",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        DEFENDER_BANS_OWNER_ID,
      );

      const res = await app.request("/api/webdefender/known-threats?ip=" + bannedIp);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_known_threat).toBe(true);
      expect(data.details.banned).toBe(true);
      expect(data.details.banned_reason).toBe("Active credential stuffing node");
    });

    it("identifies known threat actors as known threats", async () => {
      const threatIp = "192.0.2.200";
      threatActorDetector.addThreatIp("bruteforce", threatIp);

      const res = await app.request("/api/webdefender/known-threats?ip=" + threatIp);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_known_threat).toBe(true);
      expect(data.details.threat_actor).toBe(true);
      expect(data.details.threat_category).toBe("bruteforce");
    });

    it("identifies TOR exit nodes", async () => {
      const torIp = "198.51.100.50";
      torDetector.addExitNode(torIp);

      const res = await app.request("/api/webdefender/known-threats?ip=" + torIp);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_tor).toBe(true);
    });

    it("identifies known VPN networks", async () => {
      const vpnIp = "198.7.58.196";
      const res = await app.request("/api/webdefender/known-threats?ip=" + vpnIp);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_vpn).toBe(true);
    });

    it("evaluates POST requests with JSON payload identically to GET", async () => {
      const postIp = "192.0.2.100";
      const res = await app.request("/api/webdefender/known-threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: postIp }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ip).toBe(postIp);
      expect(data.is_known_threat).toBe(true);
      expect(data.details.banned).toBe(true);
    });
  });
  describe("Rate Limiting", () => {
    it("enforces rate limit of 5000 requests per minute", async () => {
      const testIpHeader = { "x-forwarded-for": "203.0.113.99" };
      // Rapidly make 5000 requests
      for (let i = 0; i < 5000; i++) {
        const res = await app.request("/api/webdefender/known-threats?ip=8.8.8.8", {
          headers: testIpHeader,
        });
        if (i === 0) {
          expect(res.status).toBe(200);
        }
      }

      // 5001st request should be rate limited (429)
      const blockedRes = await app.request("/api/webdefender/known-threats?ip=8.8.8.8", {
        headers: testIpHeader,
      });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
      const body = await blockedRes.json();
      expect(body.error).toContain("Too many requests");
    });
  });
});
