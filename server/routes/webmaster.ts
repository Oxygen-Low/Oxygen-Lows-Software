import { Hono } from "hono";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getSites,
  saveSites,
  getIndex,
  saveIndex,
  crawlSite,
  validateCrawlUrl,
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

  return c.json({ sites: userSites });
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
    botUserAgent: OXYLOW_USER_AGENT,
    botContactEmail: OXYLOW_CONTACT_EMAIL,
  });
});

// Submit a new site for crawling
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

  try {
    const parsed = await validateCrawlUrl(formattedUrl);
    formattedUrl = parsed.href;
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

  const newSite: WebmasterSite = {
    id: crypto.randomUUID(),
    userId: user.id,
    url: formattedUrl,
    sitemapUrl: formattedSitemap || undefined,
    status: "pending",
    pageCount: 0,
    createdAt: new Date().toISOString(),
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: `Submitted by user ${user.username || user.email || user.id}`,
        level: "info",
      },
    ],
  };

  sites.unshift(newSite);
  saveSites(sites);

  // Trigger crawling in background
  setTimeout(() => {
    crawlSite(newSite.id, 20).catch(console.error);
  }, 100);

  return c.json({ site: newSite }, 201);
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

  if (site.status === "crawling") {
    return c.json({ error: "Site is already currently being crawled." }, 409);
  }

  // Trigger crawl in background
  setTimeout(() => {
    crawlSite(site.id, 20).catch(console.error);
  }, 100);

  site.status = "crawling";
  saveSites(sites);

  return c.json({ message: "Crawl started", site });
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

  const index = getIndex();
  const pages = index.filter((p) => p.siteId === siteId);

  return c.json({ site, pages });
});
