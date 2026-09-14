import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    lookup: vi.fn().mockImplementation(async (host: string, options?: any) => {
      if (options?.all) {
        return [{ address: "93.184.216.34", family: 4 }];
      }
      return { address: "93.184.216.34", family: 4 };
    }),
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
import {
  verifyDomainDns,
  saveSites,
  clearCrawlQueue,
  getQueuePosition,
  getSites,
  setBatchCrawlDelayMs,
  setDefaultDomainDelayMs,
  MAX_SITE_INDEX_PAGES,
} from "../lib/oxylowCrawler";

describe("Webmaster Router & DNS Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCrawlQueue();
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

  it("requires verification even if an admin adds a domain via regular /sites endpoint", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "1",
      email: "admin@oxygenlow.com",
      role: "admin",
    } as any);

    const req = new Request("http://localhost/sites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-admin-token",
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site.verified).toBe(false);
    expect(body.site.status).toBe("unverified");
    expect(body.site.adminAdded).toBe(false);
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
    expect(["pending", "crawling"]).toContain(body.site.status);
    expect(body.site.queuePosition).toBe(1);

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

  it("enforces 1 domain indexed at a time with clear queue positions", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "1",
      email: "admin@oxygenlow.com",
      role: "admin",
    } as any);

    // Add first domain
    const res1 = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-admin-token",
        },
        body: JSON.stringify({ url: "https://site-a.com" }),
      })
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.site.queuePosition).toBe(1);

    // Add second domain while first is in queue / indexing
    const res2 = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-admin-token",
        },
        body: JSON.stringify({ url: "https://site-b.com" }),
      })
    );
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.site.queuePosition).toBe(2);

    // Add third domain
    const res3 = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-admin-token",
        },
        body: JSON.stringify({ url: "https://site-c.com" }),
      })
    );
    expect(res3.status).toBe(201);
    const body3 = await res3.json();
    expect(body3.site.queuePosition).toBe(3);

    // Verify GET /admin/sites returns correct queue positions
    const listRes = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        headers: { Authorization: "Bearer test-admin-token" },
      })
    );
    const listBody = await listRes.json();
    const siteA = listBody.sites.find((s: any) => s.domain === "site-a.com");
    const siteB = listBody.sites.find((s: any) => s.domain === "site-b.com");
    const siteC = listBody.sites.find((s: any) => s.domain === "site-c.com");
    expect(siteA.queuePosition).toBe(1);
    expect(siteB.queuePosition).toBe(2);
    expect(siteC.queuePosition).toBe(3);

    // Deleting site-b removes it from the queue
    const delRes = await webmasterRouter.fetch(
      new Request(`http://localhost/admin/sites/${siteB.id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer test-admin-token" },
      })
    );
    expect(delRes.status).toBe(200);

    // Position of site-c moves up to 2
    expect(getQueuePosition(siteC.id)).toBe(2);
  });

  it("indexes 20 pages, schedules next batch after delay, re-queues and indexes remaining pages", async () => {
    setBatchCrawlDelayMs(120);
    setDefaultDomainDelayMs(0);

    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (url.includes("/sitemap.xml")) {
        // Sitemap containing 35 pages
        const xml = Array.from({ length: 35 }, (_, i) => `<url><loc>https://multi-page.com/page-${i + 1}</loc></url>`).join("");
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xml}</urlset>`, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response(`<html><head><title>Title for ${url}</title></head><body><h1>Content</h1></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    global.fetch = mockFetch as any;

    try {
      vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
        id: "1",
        email: "admin@oxygenlow.com",
        role: "admin",
      } as any);

      // Add site via admin
      const res = await webmasterRouter.fetch(
        new Request("http://localhost/admin/sites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-admin-token",
          },
          body: JSON.stringify({ url: "https://multi-page.com" }),
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      const siteId = data.site.id;

      // Wait for batch 1 (up to 20 pages) to finish (delay is 120ms, so batch 2 won't fire yet)
      await new Promise((r) => setTimeout(r, 40));

      const sitesAfterBatch1 = getSites();
      const siteAfter1 = sitesAfterBatch1.find((s) => s.id === siteId);
      expect(siteAfter1).toBeDefined();
      expect(siteAfter1?.pageCount).toBe(20);
      expect(siteAfter1?.pendingUrls?.length).toBe(16);
      expect(siteAfter1?.nextCrawlScheduledAt).toBeDefined();

      // Wait for the scheduled timer (120ms) to fire and batch 2 to complete the remaining pages
      await new Promise((r) => setTimeout(r, 160));

      const sitesAfterBatch2 = getSites();
      const siteAfter2 = sitesAfterBatch2.find((s) => s.id === siteId);
      expect(siteAfter2?.pageCount).toBe(36);
      expect(siteAfter2?.pendingUrls?.length).toBe(0);
      expect(siteAfter2?.nextCrawlScheduledAt).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("caps total discovered and pending pages at 500 pages maximum", async () => {
    setBatchCrawlDelayMs(10000); // long delay so batch 2 doesn't trigger
    setDefaultDomainDelayMs(0);

    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (url.includes("/sitemap.xml")) {
        // Sitemap with 550 pages
        const xml = Array.from({ length: 550 }, (_, i) => `<url><loc>https://huge-site.com/p-${i + 1}</loc></url>`).join("");
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xml}</urlset>`, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response(`<html><head><title>P</title></head><body>B</body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    global.fetch = mockFetch as any;

    try {
      vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
        id: "1",
        email: "admin@oxygenlow.com",
        role: "admin",
      } as any);

      const res = await webmasterRouter.fetch(
        new Request("http://localhost/admin/sites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-admin-token",
          },
          body: JSON.stringify({ url: "https://huge-site.com" }),
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      const siteId = data.site.id;

      // Wait for batch 1 to complete (20 pages)
      await new Promise((r) => setTimeout(r, 60));

      const sites = getSites();
      const site = sites.find((s) => s.id === siteId);
      expect(site).toBeDefined();
      expect(site?.pageCount).toBe(20);
      // Total indexed (20) + pendingUrls (480) = 500 max limit
      expect(site?.pendingUrls?.length).toBe(480);
      expect((site?.pageCount || 0) + (site?.pendingUrls?.length || 0)).toBe(500);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
