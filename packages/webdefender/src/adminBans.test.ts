import { describe, expect, it } from "vitest";
import { DefenderClient } from "./webdefender";

const request = {
  ip: "2001:DB8::99",
  method: "GET",
  path: "/",
  query: {},
  body: "",
  headers: {},
  userAgent: "test",
};

describe("administrator banned IPs", () => {
  it("blocks an enabled administrator ban and reports its reason", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = {
      blockAdminBannedIps: true,
      adminBannedIps: [{ ip: "2001:db8::99", reason: "Credential stuffing", bannedAt: "2026-01-01" }],
      blockIps: [], blockCountries: [], routes: [], blockModeEnabled: true,
    };
    const result = await client.handleRequest(request);
    expect(result).toMatchObject({ blocked: true, eventType: "ip_block" });
    expect(result.reason).toContain("Credential stuffing");
  });

  it("does not enforce administrator bans when the app opts out", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = {
      blockAdminBannedIps: false,
      adminBannedIps: [{ ip: "2001:db8::99", reason: "Credential stuffing", bannedAt: "2026-01-01" }],
      blockIps: [], blockCountries: [], routes: [], blockModeEnabled: true,
    };
    const result = await client.handleRequest(request);
    expect(result.blocked).toBe(false);
  });
});
