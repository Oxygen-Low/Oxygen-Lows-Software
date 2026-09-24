import { Hono } from "hono";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getSites,
  saveSites,
  getIndex,
  saveIndex,
  crawlSite,
  enqueueCrawl,
  getQueuePosition,
  isSiteCrawling,
  removeFromCrawlQueue,
  cancelScheduledCrawl,
  attachQueuePosition,
  attachQueuePositions,
  getCrawlQueueLength,
  validateCrawlUrl,
  verifyDomainDns,
  WebmasterSite,
  OXYLOW_USER_AGENT,
  OXYLOW_CONTACT_EMAIL,
} from "../lib/oxylowCrawler.ts";

export const webmasterRouter = new Hono();

async function getAuthUser(c: any) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}

function checkIsAdmin(user: any): boolean {
  return user?.role === "admin" || String(user?.id) === "1";
}

// Get all sites for the authenticated user (or all if admin)
webmasterRouter.get("/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const allSites = getSites();
  const userSites = checkIsAdmin(user)
    ? allSites
    : allSites.filter((s) => s.userId === user.id);

  return c.json({ sites: attachQueuePositions(userSites) });
});

// Overall stats
webmasterRouter.get("/stats", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const sites = getSites();
  const index = getIndex();
  const isAdminUser = checkIsAdmin(user);
  const userSites = isAdminUser ? sites : sites.filter((s) => s.userId === user.id);
  const userSiteIds = new Set(userSites.map((s) => s.id));
  const userPagesCount = isAdminUser
    ? index.length
    : index.filter((p) => p.siteId && userSiteIds.has(p.siteId)).length;

  return c.json({
    totalSites: userSites.length,
    totalPagesIndexed: userPagesCount,
    globalIndexCount: index.length,
    queuedSitesCount: getCrawlQueueLength(),
    botUserAgent: OXYLOW_USER_AGENT,
    botContactEmail: OXYLOW_CONTACT_EMAIL,
  });
});

// Submit a new site for crawling (requires DNS verification for regular users)
webmasterRouter.post("/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.url || typeof body.url !== "string") {
    return c.json({ error: "Missing or invalid URL" }, 400);
  }

  let formattedUrl = body.url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  let domain: string;
  try {
    const parsed = await validateCrawlUrl(formattedUrl);
    formattedUrl = parsed.href;
    domain = parsed.hostname.toLowerCase();
  } catch (err: any) {
    return c.json({ error: `Invalid URL: ${err.message}` }, 400);
  }

  let formattedSitemap = body.sitemapUrl?.trim();
  if (formattedSitemap) {
    if (!/^https?:\/\//i.test(formattedSitemap)) {
      formattedSitemap = `https://${formattedSitemap}`;
    }
    try {
      await validateCrawlUrl(formattedSitemap);
    } catch (err: any) {
      return c.json({ error: `Invalid sitemap URL: ${err.message}` }, 400);
    }
  }

  const sites = getSites();
  // Check if site already submitted by this user
  const existing = sites.find(
    (s) => s.userId === user.id && s.url.toLowerCase() === formattedUrl.toLowerCase()
  );
  if (existing) {
    return c.json({ error: "This URL has already been submitted." }, 409);
  }

  const verificationToken = crypto.randomBytes(16).toString("hex");

  const newSite: WebmasterSite = {
    id: crypto.randomUUID(),
    userId: user.id,
    url: formattedUrl,
    domain,
    sitemapUrl: formattedSitemap || undefined,
    status: "unverified",
    verified: false,
    verificationToken,
    adminAdded: false,
    pageCount: 0,
    createdAt: new Date().toISOString(),
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: `Submitted. DNS verification required: Add TXT record "oxylow-search-verification=${verificationToken}" to ${domain} or _oxylow-search-challenge.${domain}`,
        level: "info",
      },
    ],
  };

  sites.unshift(newSite);
  saveSites(sites);

  return c.json({ site: attachQueuePosition(newSite) }, 201);
});

// Verify DNS TXT record for a site
webmasterRouter.post("/sites/:id/verify", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }

  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (site.verified) {
    return c.json({ message: "Domain is already verified.", verified: true, site });
  }

  const result = await verifyDomainDns(site.domain, site.verificationToken);
  if (result.verified) {
    site.verified = true;
    site.status = "pending";
    site.error = undefined;
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: result.message,
      level: "info",
    });
    saveSites(sites);

    // Queue crawl now that domain is verified
    enqueueCrawl(site.id, 20);

    return c.json({
      message: "Domain verified successfully! oxylow-search bot queued for crawling.",
      verified: true,
      site: attachQueuePosition(site),
    });
  } else {
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Verification attempt failed: ${result.message}`,
      level: "warn",
    });
    saveSites(sites);

    return c.json(
      {
        error: result.message,
        verified: false,
        foundRecords: result.foundRecords,
        site: attachQueuePosition(site),
      },
      400
    );
  }
});

// Trigger a re-crawl of a site
webmasterRouter.post("/sites/:id/crawl", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }

  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!site.verified && !site.adminAdded) {
    return c.json({ error: "Domain must be verified via DNS record before crawling." }, 400);
  }

  if (isSiteCrawling(site.id) || site.status === "crawling") {
    return c.json({ error: "Site is currently being crawled." }, 409);
  }

  const queuePos = getQueuePosition(site.id);
  if (queuePos !== null) {
    return c.json(
      { error: `Site is already queued for crawling (position ${queuePos}).` },
      409
    );
  }

  cancelScheduledCrawl(site.id);
  site.pendingUrls = undefined;
  site.nextCrawlScheduledAt = null;
  site.logs = [
    {
      timestamp: new Date().toISOString(),
      message: `Re-crawl initiated by ${user.username || user.email || user.id}. Previous logs cleared.`,
      level: "info",
    },
  ];
  saveSites(sites);

  enqueueCrawl(site.id, 20);
  const updatedSite = getSites().find((s) => s.id === site.id) || site;

  return c.json({ message: "Crawl queued", site: attachQueuePosition(updatedSite) });
});

// Delete a site and its indexed pages
webmasterRouter.delete("/sites/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const siteId = c.req.param("id");
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return c.json({ error: "Site not found" }, 404);
  }

  const site = sites[siteIndex];
  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  cancelScheduledCrawl(siteId);
  removeFromCrawlQueue(siteId);
  sites.splice(siteIndex, 1);
  saveSites(sites);

  // Remove pages from index
  const index = getIndex();
  const filtered = index.filter((p) => p.siteId !== siteId);
  saveIndex(filtered);

  return c.json({ success: true, message: "Site and associated indexed pages deleted." });
});

// Get indexed pages for a specific site
webmasterRouter.get("/sites/:id/pages", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }

  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const safePage = isNaN(page) || page < 1 ? 1 : page;
  const safeLimit = isNaN(limit) || limit < 1 ? 50 : Math.min(limit, 200);

  const index = getIndex();
  const allSitePages = index.filter((p) => p.siteId === siteId);
  const total = allSitePages.length;
  const start = (safePage - 1) * safeLimit;
  const pages = allSitePages.slice(start, start + safeLimit);

  return c.json({
    site: attachQueuePosition(site),
    pages,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  });
});

// ==========================================
// ADMIN ENDPOINTS (No verification required)
// ==========================================

// Get all admin-added domains
webmasterRouter.get("/admin/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const allSites = getSites();
  const adminSites = allSites.filter((s) => s.adminAdded);

  return c.json({ sites: attachQueuePositions(adminSites) });
});

// Add domain directly without verification (for popular sites, etc.)
webmasterRouter.post("/admin/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.url || typeof body.url !== "string") {
    return c.json({ error: "Missing or invalid URL" }, 400);
  }

  let formattedUrl = body.url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  let domain: string;
  try {
    const parsed = await validateCrawlUrl(formattedUrl);
    formattedUrl = parsed.href;
    domain = parsed.hostname.toLowerCase();
  } catch (err: any) {
    return c.json({ error: `Invalid URL: ${err.message}` }, 400);
  }

  let formattedSitemap = body.sitemapUrl?.trim();
  if (formattedSitemap) {
    if (!/^https?:\/\//i.test(formattedSitemap)) {
      formattedSitemap = `https://${formattedSitemap}`;
    }
    try {
      await validateCrawlUrl(formattedSitemap);
    } catch (err: any) {
      return c.json({ error: `Invalid sitemap URL: ${err.message}` }, 400);
    }
  }

  const sites = getSites();
  const existing = sites.find(
    (s) => s.url.toLowerCase() === formattedUrl.toLowerCase()
  );
  if (existing) {
    // If existing was unverified, admin can upgrade it to verified
    if (!existing.verified) {
      existing.verified = true;
      existing.adminAdded = true;
      existing.status = "pending";
      existing.logs.push({
        timestamp: new Date().toISOString(),
        message: `Verified and upgraded by admin ${user.username || user.email || user.id}`,
        level: "info",
      });
      saveSites(sites);
      enqueueCrawl(existing.id, 20);
      const updated = getSites().find((s) => s.id === existing.id) || existing;
      return c.json({ site: attachQueuePosition(updated), message: "Existing domain upgraded to admin verified." });
    }
    return c.json({ error: "This URL has already been added." }, 409);
  }

  const newSite: WebmasterSite = {
    id: crypto.randomUUID(),
    userId: user.id,
    url: formattedUrl,
    domain,
    sitemapUrl: formattedSitemap || undefined,
    status: "pending",
    verified: true,
    verificationToken: crypto.randomBytes(16).toString("hex"),
    adminAdded: true,
    pageCount: 0,
    createdAt: new Date().toISOString(),
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: `Added directly by administrator ${user.username || user.email || user.id} (no verification required)`,
        level: "info",
      },
    ],
  };

  sites.unshift(newSite);
  saveSites(sites);

  // Trigger crawl via queue
  enqueueCrawl(newSite.id, 20);
  const updated = getSites().find((s) => s.id === newSite.id) || newSite;

  return c.json({ site: attachQueuePosition(updated) }, 201);
});

// Remove admin-added domain
webmasterRouter.delete("/admin/sites/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const siteId = c.req.param("id");
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return c.json({ error: "Site not found" }, 404);
  }

  cancelScheduledCrawl(siteId);
  removeFromCrawlQueue(siteId);
  sites.splice(siteIndex, 1);
  saveSites(sites);

  // Remove pages from search index
  const index = getIndex();
  const filtered = index.filter((p) => p.siteId !== siteId);
  saveIndex(filtered);

  return c.json({ success: true, message: "Domain removed from search index by admin." });
});

