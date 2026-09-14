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
  isSiteCrawling,
  getSites,
  setBatchCrawlDelayMs,
  setDefaultDomainDelayMs,
  MAX_SITE_INDEX_PAGES,
  resumeInterruptedCrawls,
  isJsOrCookieChallenge,
  setPlaywrightFirefox,
  saveIndex,
  getIndex,
} from "../lib/oxylowCrawler";

describe("Webmaster Router & DNS Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCrawlQueue();
    saveSites([]);
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("<html><head><title>Test Page</title></head><body>Content</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as any;
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
    expect(body.site.queuePosition ?? null).toBeNull();

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

  it("enforces up to 2 domains indexed concurrently with domain prioritization and clear queue positions", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "1",
      email: "admin@oxygenlow.com",
      role: "admin",
    } as any);

    // Ensure crawl stays active while asserting queue positions
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      await new Promise((r) => setTimeout(r, 120));
      return new Response("<html><head><title>Delayed Page</title></head><body>B</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as any;

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
    expect(body1.site.status).toBe("crawling");
    expect(body1.site.queuePosition ?? null).toBeNull();

    // Add second domain while first is crawling: should run concurrently in slot 2
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
    expect(body2.site.status).toBe("crawling");
    expect(body2.site.queuePosition ?? null).toBeNull();

    // Add third domain while two are crawling: goes to waiting queue at position 1
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
    expect(body3.site.queuePosition).toBe(1);

    // Verify GET /admin/sites returns correct statuses and queue positions
    const listRes = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        headers: { Authorization: "Bearer test-admin-token" },
      })
    );
    const listBody = await listRes.json();
    const siteA = listBody.sites.find((s: any) => s.domain === "site-a.com");
    const siteB = listBody.sites.find((s: any) => s.domain === "site-b.com");
    const siteC = listBody.sites.find((s: any) => s.domain === "site-c.com");
    expect(siteA.status).toBe("crawling");
    expect(siteA.queuePosition ?? null).toBeNull();
    expect(siteB.status).toBe("crawling");
    expect(siteB.queuePosition ?? null).toBeNull();
    expect(siteC.queuePosition).toBe(1);

    // Deleting actively crawling site-b aborts it and frees a slot
    const delRes = await webmasterRouter.fetch(
      new Request(`http://localhost/admin/sites/${siteB.id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer test-admin-token" },
      })
    );
    expect(delRes.status).toBe(200);

    // Site-c immediately transitions into active crawling slot
    expect(getQueuePosition(siteC.id)).toBeNull();

    clearCrawlQueue();
  });

  it("prioritizes different domains from queue when a crawl slot opens up", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue({
      id: "1",
      email: "admin@oxygenlow.com",
      role: "admin",
    } as any);

    let finishSiteA: () => void = () => {};
    let finishSiteB: () => void = () => {};
    let finishDiff: () => void = () => {};
    let activeBResolved = false;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (url.includes("/sitemap.xml")) {
        return new Response("", { status: 404 });
      }
      if (url.includes("active-a.com")) {
        await new Promise<void>((r) => {
          finishSiteA = r;
        });
      } else if (url.includes("active-b.com") && !activeBResolved) {
        await new Promise<void>((r) => {
          finishSiteB = r;
        });
      } else if (url.includes("diff-domain.com")) {
        await new Promise<void>((r) => {
          finishDiff = r;
        });
      }
      return new Response("<html><head><title>Page</title></head><body>OK</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as any;

    // Fill the 2 slots with domain active-a.com and active-b.com
    await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-admin-token" },
        body: JSON.stringify({ url: "https://active-a.com" }),
      })
    );
    await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-admin-token" },
        body: JSON.stringify({ url: "https://active-b.com" }),
      })
    );

    // Queue 1: same domain as active-a.com
    const sameDomainRes = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-admin-token" },
        body: JSON.stringify({ url: "https://active-a.com/subpage" }),
      })
    );
    const sameDomainSite = (await sameDomainRes.json()).site;

    // Queue 2: completely different domain diff-domain.com
    const diffDomainRes = await webmasterRouter.fetch(
      new Request("http://localhost/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-admin-token" },
        body: JSON.stringify({ url: "https://diff-domain.com" }),
      })
    );
    const diffDomainSite = (await diffDomainRes.json()).site;

    // Finish site B (active-b.com). active-a.com is STILL actively crawling.
    // The worker should pick diff-domain.com over active-a.com/subpage because its domain differs from active-a.com!
    activeBResolved = true;
    finishSiteB();
    await new Promise((r) => setTimeout(r, 60));

    expect(isSiteCrawling(diffDomainSite.id)).toBe(true);
    expect(getQueuePosition(sameDomainSite.id)).toBe(1);

    clearCrawlQueue();
    finishSiteA();
    finishDiff();
    await new Promise((r) => setTimeout(r, 20));
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

  it("caps total discovered and pending pages at 1000 pages maximum", async () => {
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
        // Sitemap with 1050 pages
        const xml = Array.from({ length: 1050 }, (_, i) => `<url><loc>https://huge-site.com/p-${i + 1}</loc></url>`).join("");
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
      // Total indexed (20) + pendingUrls (980) = 1000 max limit
      expect(site?.pendingUrls?.length).toBe(980);
      expect((site?.pageCount || 0) + (site?.pendingUrls?.length || 0)).toBe(1000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("re-queues sites left pending or crawling after a restart", () => {
    saveSites([
      {
        id: "stuck-crawling",
        userId: "1",
        url: "https://first.example",
        domain: "first.example",
        status: "crawling",
        verified: true,
        verificationToken: "a",
        adminAdded: true,
        pageCount: 20,
        createdAt: "2026-01-01T00:00:00.000Z",
        logs: [],
        pendingUrls: ["https://first.example/page-2"],
      },
      {
        id: "stuck-pending",
        userId: "1",
        url: "https://second.example",
        domain: "second.example",
        status: "pending",
        verified: true,
        verificationToken: "b",
        adminAdded: true,
        pageCount: 0,
        createdAt: "2026-01-02T00:00:00.000Z",
        logs: [],
      },
      {
        id: "stuck-queued",
        userId: "1",
        url: "https://third.example",
        domain: "third.example",
        status: "pending",
        verified: true,
        verificationToken: "c",
        adminAdded: true,
        pageCount: 0,
        createdAt: "2026-01-03T00:00:00.000Z",
        logs: [],
      },
    ]);

    expect(getQueuePosition("stuck-crawling")).toBeNull();
    expect(getQueuePosition("stuck-pending")).toBeNull();
    expect(getQueuePosition("stuck-queued")).toBeNull();

    const resumed = resumeInterruptedCrawls();
    expect(resumed).toBe(3);
    expect(isSiteCrawling("stuck-crawling")).toBe(true);
    expect(getQueuePosition("stuck-crawling")).toBeNull();
    expect(isSiteCrawling("stuck-pending")).toBe(true);
    expect(getQueuePosition("stuck-pending")).toBeNull();
    expect(getQueuePosition("stuck-queued")).toBe(1);
    expect(resumeInterruptedCrawls()).toBe(0);

    clearCrawlQueue();
  });

  describe("JavaScript / Cookie Challenge Detection & Firefox Headless Playwright Rendering", () => {
    it("correctly identifies JavaScript and cookie challenge pages", () => {
      expect(
        isJsOrCookieChallenge("<html><body>Enable JavaScript and cookies to continue</body></html>")
      ).toBe(true);
      expect(
        isJsOrCookieChallenge("<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>")
      ).toBe(true);
      expect(
        isJsOrCookieChallenge("<html><body><noscript>Please enable JavaScript to view this website</noscript></body></html>")
      ).toBe(true);
      expect(
        isJsOrCookieChallenge("<html><body>Cloudflare Turnstile verification required</body></html>", "", 403)
      ).toBe(true);
      expect(
        isJsOrCookieChallenge("<html><head><title>Welcome</title></head><body><h1>Hello World</h1><p>Normal article about baking bread.</p></body></html>")
      ).toBe(false);
    });

    it("defers cookie/JS challenge pages and renders them with Firefox Headless to continue indexing", async () => {
      setDefaultDomainDelayMs(0);
      setBatchCrawlDelayMs(1000);
      saveIndex([]);

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(
          '<html><head><title>Rendered App Page</title></head><body><h1>Welcome to Rendered App</h1><a href="https://spa-site.com/rendered-subpage">Subpage Link</a></body></html>'
        ),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockFirefox = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      setPlaywrightFirefox(mockFirefox);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/robots.txt")) {
          return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }
        if (url === "https://spa-site.com" || url === "https://spa-site.com/") {
          // Returns a challenge page on initial HTTP fetch
          return new Response(
            "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>",
            {
              status: 200,
              headers: { "content-type": "text/html" },
            }
          );
        }
        if (url === "https://spa-site.com/rendered-subpage") {
          // Standard page discovered from headless render
          return new Response(
            "<html><head><title>Rendered Subpage</title></head><body><p>Discovered from rendered page!</p></body></html>",
            {
              status: 200,
              headers: { "content-type": "text/html" },
            }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as any;

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
            body: JSON.stringify({ url: "https://spa-site.com" }),
          })
        );
        expect(res.status).toBe(201);
        const data = await res.json();
        const siteId = data.site.id;

        // Wait for crawl to complete (including headless render and continuing indexing for the new link)
        await new Promise((r) => setTimeout(r, 120));

        // Firefox launch should have been invoked
        expect(mockFirefox.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
        expect(mockPage.goto).toHaveBeenCalledWith(expect.stringContaining("https://spa-site.com"), expect.any(Object));

        const sites = getSites();
        const site = sites.find((s) => s.id === siteId);
        expect(site).toBeDefined();
        // Both the rendered page and the newly discovered subpage were indexed!
        expect(site?.pageCount).toBe(2);

        const index = getIndex();
        const renderedEntry = index.find((p) => p.url.startsWith("https://spa-site.com") && !p.url.includes("subpage"));
        expect(renderedEntry?.title).toBe("Rendered App Page");
        expect(renderedEntry?.headings).toContain("Welcome to Rendered App");

        const subpageEntry = index.find((p) => p.url === "https://spa-site.com/rendered-subpage");
        expect(subpageEntry?.title).toBe("Rendered Subpage");

        // Verify crawl logs reflect deferred queuing and headless rendering
        const logs = site?.logs || [];
        expect(logs.some((l) => l.message.includes("Queued for Firefox Headless rendering"))).toBe(true);
        expect(logs.some((l) => l.message.includes("Indexed via Firefox Headless"))).toBe(true);
      } finally {
        global.fetch = originalFetch;
        clearCrawlQueue();
      }
    });

    it("falls back to JSDOM when Playwright is missing host dependencies (no sudo)", async () => {
      setDefaultDomainDelayMs(0);
      setBatchCrawlDelayMs(1000);
      saveIndex([]);

      const mockFirefox = {
        launch: vi.fn().mockRejectedValue(
          new Error("Host system is missing dependencies to run browsers. Please install them with: sudo npx playwright install-deps")
        ),
      };
      setPlaywrightFirefox(mockFirefox);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/robots.txt")) {
          return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }
        if (url === "https://jsdom-fallback.com" || url === "https://jsdom-fallback.com/") {
          return new Response(
            "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>",
            {
              status: 200,
              headers: { "content-type": "text/html" },
            }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as any;

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
            body: JSON.stringify({ url: "https://jsdom-fallback.com" }),
          })
        );
        expect(res.status).toBe(201);
        const data = await res.json();
        const siteId = data.site.id;

        await new Promise((r) => setTimeout(r, 120));

        const sites = getSites();
        const site = sites.find((s) => s.id === siteId);
        expect(site).toBeDefined();

        const logs = site?.logs || [];
        expect(logs.some((l) => l.message.includes("Falling back to pure Node.js DOM rendering (JSDOM)"))).toBe(true);
      } finally {
        global.fetch = originalFetch;
        clearCrawlQueue();
      }
    });
  });
});
