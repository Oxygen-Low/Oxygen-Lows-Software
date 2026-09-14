import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolveTxt: vi.fn().mockImplementation(async (host: string) => {
      if (host === "verified-example.com" || host === "_oxylow-challenge.verified-example.com") {
        return [["oxylow-verification=abc123secrettoken"]];
      }
      return [];
    }),
  };
});

import { webmasterRouter } from "./webmaster";
import * as authLib from "../lib/auth";
import { verifyDomainDns, saveSites } from "../lib/oxylowCrawler";

describe("Webmaster Router & DNS Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    saveSites([]);
  });

  it("rejects unauthorized access to sites and stats", async () => {
    const req = new Request("http://localhost/sites");
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(401);

    const statsReq = new Request("http://localhost/stats");
    const statsRes = await webmasterRouter.fetch(statsReq);
    expect(statsRes.status).toBe(401);
  });

  it("rejects non-admin access to admin endpoints", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "regular-user-id",
      email: "user@example.com",
      role: "user",
    } as any);

    const req = new Request("http://localhost/admin/sites", {
      headers: { Authorization: "Bearer test-user-token" },
    });
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(403);
  });

  it("allows regular user to submit site in unverified state with verification token", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "regular-user-123",
      email: "user123@example.com",
      role: "user",
    } as any);

    const req = new Request("http://localhost/sites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-token",
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site).toBeDefined();
    expect(body.site.verified).toBe(false);
    expect(body.site.status).toBe("unverified");
    expect(body.site.verificationToken).toBeDefined();
    expect(typeof body.site.verificationToken).toBe("string");
  });

  it("allows admin to add domain directly without verification", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "1",
      email: "admin@oxygenlow.com",
      role: "admin",
    } as any);

    const req = new Request("http://localhost/admin/sites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({ url: "https://example.org" }),
    });
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site.verified).toBe(true);
    expect(body.site.adminAdded).toBe(true);
    expect(body.site.status).toBe("pending");

    // Can fetch admin sites list
    const listReq = new Request("http://localhost/admin/sites", {
      headers: { Authorization: "Bearer test-admin-token" },
    });
    const listRes = await webmasterRouter.fetch(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.sites.some((s: any) => s.url === "https://example.org/")).toBe(true);
  });

  it("verifies domain when valid DNS TXT record is present", async () => {
    const check = await verifyDomainDns("verified-example.com", "abc123secrettoken");
    expect(check.verified).toBe(true);

    const failCheck = await verifyDomainDns("verified-example.com", "wrongtoken");
    expect(failCheck.verified).toBe(false);
  });
});
