import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isPrivateIP, assertPublicHostname } from "./safeAiUrl.ts";

export const DATA_DIR = path.join(process.cwd(), "Data");
export const SITES_FILE = path.join(DATA_DIR, "webmaster_sites.json");
export const INDEX_FILE = path.join(DATA_DIR, "oxylow_index.json");

export const OXYLOW_USER_AGENT =
  "Mozilla/5.0 (compatible; oxylow/1.0; +https://oxygenlow.com/bot; support@oxygenlow.com)";
export const OXYLOW_CONTACT_EMAIL = "support@oxygenlow.com";
export const DEFAULT_DOMAIN_DELAY_MS = 1000;

export interface WebmasterSite {
  id: string;
  userId: string;
  url: string;
  sitemapUrl?: string;
  status: "pending" | "crawling" | "indexed" | "error";
  pageCount: number;
  lastCrawledAt?: string;
  createdAt: string;
  error?: string;
  logs: { timestamp: string; message: string; level?: "info" | "warn" | "error" }[];
}

export interface IndexedPage {
  id: string;
  siteId?: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  headings: string[];
  keywords: string[];
  bodyPreview: string;
  favicon?: string;
  indexedAt: string;
}

export interface SearchResult {
  url: string;
  domain: string;
  title: string;
  description: string;
  bodyPreview: string;
  favicon?: string;
  score: number;
  indexedAt: string;
}

// Track per-domain request delays to respect target servers
const domainLastRequestTime = new Map<string, number>();
const domainLocks = new Map<string, Promise<void>>();
const robotsCache = new Map<string, { rules: { disallow: string[]; allow: string[] }; crawlDelayMs: number; fetchedAt: number }>();

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(SITES_FILE)) {
    fs.writeFileSync(SITES_FILE, JSON.stringify([], null, 2), "utf8");
  }

  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

export function getSites(): WebmasterSite[] {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(SITES_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSites(sites: WebmasterSite[]): void {
  ensureDataFiles();
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), "utf8");
}

export function getIndex(): IndexedPage[] {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(INDEX_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveIndex(index: IndexedPage[]): void {
  ensureDataFiles();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}

/**
 * Enforces per-domain delays so that crawler requests to the same domain are throttled.
 */
export async function waitForDomainSlot(domain: string, requiredDelayMs = DEFAULT_DOMAIN_DELAY_MS): Promise<void> {
  while (domainLocks.has(domain)) {
    await domainLocks.get(domain);
  }

  let releaseLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  domainLocks.set(domain, lockPromise);

  try {
    const lastTime = domainLastRequestTime.get(domain) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < requiredDelayMs) {
      const waitTime = requiredDelayMs - elapsed;
      await new Promise((r) => setTimeout(r, waitTime));
    }
    domainLastRequestTime.set(domain, Date.now());
  } finally {
    domainLocks.delete(domain);
    releaseLock();
  }
}

/**
 * Validates a URL against private IPs and disallowed schemes (SSRF protection).
 */
export async function validateCrawlUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URL are not allowed");
  }

  assertPublicHostname(parsed.hostname);

  const addresses = await lookup(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error(`Hostname ${parsed.hostname} resolves to private IP ${address}`);
    }
  }

  return parsed;
}

/**
 * Fetches and parses robots.txt for a given domain, caching the result.
 */
export async function getRobotsRules(
  origin: string,
  domain: string
): Promise<{ disallow: string[]; allow: string[]; crawlDelayMs: number }> {
  const cached = robotsCache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < 3600000) {
    return { disallow: cached.rules.disallow, allow: cached.rules.allow, crawlDelayMs: cached.crawlDelayMs };
  }

  const defaultResult = { disallow: [], allow: [], crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS };
  try {
    await waitForDomainSlot(domain, 500);
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(robotsUrl, {
      method: "GET",
      headers: {
        "User-Agent": OXYLOW_USER_AGENT,
        "From": OXYLOW_CONTACT_EMAIL,
        Accept: "text/plain,*/*",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      robotsCache.set(domain, { rules: defaultResult, crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS, fetchedAt: Date.now() });
      return defaultResult;
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let currentUserAgents: string[] = [];
    const oxylowDisallow: string[] = [];
    const oxylowAllow: string[] = [];
    const starDisallow: string[] = [];
    const starAllow: string[] = [];
    let crawlDelayMs = DEFAULT_DOMAIN_DELAY_MS;

    for (const rawLine of lines) {
      const line = rawLine.split("#")[0].trim();
      if (!line) {
        currentUserAgents = [];
        continue;
      }

      const match = line.match(/^([a-zA-Z-]+)\s*:\s*(.+)$/);
      if (!match) continue;

      const key = match[1].toLowerCase();
      const val = match[2].trim();

      if (key === "user-agent") {
        currentUserAgents.push(val.toLowerCase());
      } else if (key === "disallow") {
        if (currentUserAgents.some((ua) => ua === "oxylow")) {
          if (val) oxylowDisallow.push(val);
        } else if (currentUserAgents.some((ua) => ua === "*")) {
          if (val) starDisallow.push(val);
        }
      } else if (key === "allow") {
        if (currentUserAgents.some((ua) => ua === "oxylow")) {
          if (val) oxylowAllow.push(val);
        } else if (currentUserAgents.some((ua) => ua === "*")) {
          if (val) starAllow.push(val);
        }
      } else if (key === "crawl-delay") {
        const delaySec = parseFloat(val);
        if (!isNaN(delaySec) && delaySec > 0) {
          crawlDelayMs = Math.max(DEFAULT_DOMAIN_DELAY_MS, Math.round(delaySec * 1000));
        }
      }
    }

    const rules = {
      disallow: oxylowDisallow.length > 0 ? oxylowDisallow : starDisallow,
      allow: oxylowAllow.length > 0 ? oxylowAllow : starAllow,
      crawlDelayMs,
    };

    robotsCache.set(domain, { rules, crawlDelayMs, fetchedAt: Date.now() });
    return rules;
  } catch {
    robotsCache.set(domain, { rules: defaultResult, crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS, fetchedAt: Date.now() });
    return defaultResult;
  }
}

/**
 * Checks if a path is allowed by robots.txt rules.
 */
export function isPathAllowed(pathStr: string, rules: { disallow: string[]; allow: string[] }): boolean {
  for (const allow of rules.allow) {
    if (allow && pathStr.startsWith(allow)) return true;
  }
  for (const disallow of rules.disallow) {
    if (disallow && pathStr.startsWith(disallow)) return false;
  }
  return true;
}

/**
 * Parses XML sitemap to discover URLs.
 */
export async function parseSitemap(sitemapUrl: string, domain: string, crawlDelayMs: number): Promise<string[]> {
  const discoveredUrls: string[] = [];
  try {
    await waitForDomainSlot(domain, crawlDelayMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": OXYLOW_USER_AGENT,
        "From": OXYLOW_CONTACT_EMAIL,
        Accept: "application/xml,text/xml,*/*",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return [];

    const xml = await res.text();

    // Look for <loc>https://...</loc> tags
    const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null && discoveredUrls.length < 100) {
      const u = match[1].trim();
      if (!discoveredUrls.includes(u)) {
        discoveredUrls.push(u);
      }
    }
  } catch {
    // Ignore sitemap fetch error
  }
  return discoveredUrls;
}

/**
 * Extracts metadata, clean text content, headings, and internal links from HTML string.
 */
export function extractPageData(
  html: string,
  currentUrl: string
): {
  title: string;
  description: string;
  headings: string[];
  keywords: string[];
  bodyPreview: string;
  favicon?: string;
  links: string[];
} {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let description = "";
  const metaDescMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i) ||
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (metaDescMatch) {
    description = metaDescMatch[1].trim();
  }

  let favicon: string | undefined;
  const iconMatch =
    html.match(/<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut\s+)?icon["']/i);
  if (iconMatch) {
    try {
      favicon = new URL(iconMatch[1], currentUrl).href;
    } catch {
      favicon = undefined;
    }
  } else {
    try {
      const u = new URL(currentUrl);
      favicon = `${u.origin}/favicon.ico`;
    } catch {
      favicon = undefined;
    }
  }

  // Headings
  const headings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
    const cleanHeading = hMatch[1].replace(/<[^>]+>/g, "").trim();
    if (cleanHeading && !headings.includes(cleanHeading)) {
      headings.push(cleanHeading);
    }
  }

  // Keywords
  const keywords: string[] = [];
  const keywordsMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
  if (keywordsMatch) {
    keywords.push(
      ...keywordsMatch[1]
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  // Clean body text preview
  const cleanBody = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const bodyPreview = cleanBody.slice(0, 300);
  if (!description && bodyPreview) {
    description = bodyPreview.slice(0, 160) + "...";
  }

  // Internal Links discovery
  const links: string[] = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let lMatch: RegExpExecArray | null;
  const currentOrigin = new URL(currentUrl).origin;

  while ((lMatch = linkRegex.exec(html)) !== null && links.length < 50) {
    const rawHref = lMatch[1].trim();
    if (
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:")
    ) {
      continue;
    }
    try {
      const resolved = new URL(rawHref, currentUrl);
      if (
        resolved.origin === currentOrigin &&
        (resolved.protocol === "http:" || resolved.protocol === "https:")
      ) {
        // Strip hash
        resolved.hash = "";
        const finalUrl = resolved.href;
        if (!links.includes(finalUrl)) {
          links.push(finalUrl);
        }
      }
    } catch {
      // Ignore invalid URL
    }
  }

  return {
    title: title || currentUrl,
    description: description || "No description provided.",
    headings,
    keywords,
    bodyPreview,
    favicon,
    links,
  };
}

/**
 * Crawls a submitted site with the "oxylow" bot:
 * - Checks robots.txt (supports User-agent: oxylow and Crawl-delay)
 * - Uses sitemap if provided or discovered
 * - Enforces per-domain delay between requests
 * - Identifies with oxylow user agent & contact email support@oxygenlow.com
 * - Saves extracted pages into the search index
 */
export async function crawlSite(
  siteId: string,
  maxPages = 20
): Promise<{ success: boolean; pagesCrawled: number; error?: string }> {
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return { success: false, pagesCrawled: 0, error: "Site not found" };
  }

  const site = sites[siteIndex];
  site.status = "crawling";
  site.error = undefined;
  site.logs.push({
    timestamp: new Date().toISOString(),
    message: `Starting crawl with oxylow bot (contact: ${OXYLOW_CONTACT_EMAIL})...`,
    level: "info",
  });
  saveSites(sites);

  const crawlQueue: string[] = [];
  const crawledUrls = new Set<string>();
  let pagesCrawled = 0;

  try {
    const parsedStartUrl = await validateCrawlUrl(site.url);
    const domain = parsedStartUrl.hostname.toLowerCase();
    const origin = parsedStartUrl.origin;

    // 1. Fetch robots.txt
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Fetching robots.txt from ${origin}/robots.txt...`,
      level: "info",
    });
    const robots = await getRobotsRules(origin, domain);
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Robots.txt parsed. Disallowed paths: ${robots.disallow.length}, Crawl-delay: ${robots.crawlDelayMs}ms`,
      level: "info",
    });

    // 2. Discover from Sitemap if available
    const sitemapTarget = site.sitemapUrl || `${origin}/sitemap.xml`;
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Checking sitemap at ${sitemapTarget}...`,
      level: "info",
    });

    const sitemapUrls = await parseSitemap(sitemapTarget, domain, robots.crawlDelayMs);
    if (sitemapUrls.length > 0) {
      site.logs.push({
        timestamp: new Date().toISOString(),
        message: `Found ${sitemapUrls.length} URLs in sitemap.`,
        level: "info",
      });
      for (const u of sitemapUrls) {
        if (!crawlQueue.includes(u)) {
          crawlQueue.push(u);
        }
      }
    }

    // Always ensure start URL is in queue
    if (!crawlQueue.includes(site.url)) {
      crawlQueue.unshift(site.url);
    }

    const currentIndex = getIndex();
    // Remove existing pages for this site to refresh
    const filteredIndex = currentIndex.filter((p) => p.siteId !== site.id);
    const newIndexedPages: IndexedPage[] = [];

    while (crawlQueue.length > 0 && pagesCrawled < maxPages) {
      const currentUrl = crawlQueue.shift()!;
      if (crawledUrls.has(currentUrl)) continue;
      crawledUrls.add(currentUrl);

      let parsedCurrent: URL;
      try {
        parsedCurrent = await validateCrawlUrl(currentUrl);
      } catch (err: any) {
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: `Skipping ${currentUrl}: ${err.message}`,
          level: "warn",
        });
        continue;
      }

      // Check robots.txt disallow rules
      if (!isPathAllowed(parsedCurrent.pathname, robots)) {
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: `Blocked by robots.txt: ${parsedCurrent.pathname}`,
          level: "warn",
        });
        continue;
      }

      // Enforce delay between requests to this domain
      site.logs.push({
        timestamp: new Date().toISOString(),
        message: `Requesting ${currentUrl} (enforcing domain delay)...`,
        level: "info",
      });
      await waitForDomainSlot(domain, robots.crawlDelayMs);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": OXYLOW_USER_AGENT,
            "From": OXYLOW_CONTACT_EMAIL,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          site.logs.push({
            timestamp: new Date().toISOString(),
            message: `Skipping non-HTML page ${currentUrl} (${contentType})`,
            level: "info",
          });
          continue;
        }

        const html = await res.text();
        const extracted = extractPageData(html, currentUrl);

        newIndexedPages.push({
          id: crypto.randomUUID(),
          siteId: site.id,
          url: currentUrl,
          domain,
          title: extracted.title,
          description: extracted.description,
          headings: extracted.headings,
          keywords: extracted.keywords,
          bodyPreview: extracted.bodyPreview,
          favicon: extracted.favicon,
          indexedAt: new Date().toISOString(),
        });

        pagesCrawled++;
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: `Indexed (${pagesCrawled}/${maxPages}): "${extracted.title}"`,
          level: "info",
        });

        // Add internal links to queue if space remains
        if (crawlQueue.length + pagesCrawled < maxPages * 2) {
          for (const link of extracted.links) {
            if (!crawledUrls.has(link) && !crawlQueue.includes(link)) {
              crawlQueue.push(link);
            }
          }
        }
      } catch (reqErr: any) {
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: `Error fetching ${currentUrl}: ${reqErr.message}`,
          level: "error",
        });
      }
    }

    // Save updated index
    filteredIndex.push(...newIndexedPages);
    saveIndex(filteredIndex);

    // Update site state
    site.status = pagesCrawled > 0 ? "indexed" : "error";
    site.pageCount = newIndexedPages.length;
    site.lastCrawledAt = new Date().toISOString();
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Crawl finished. Successfully indexed ${newIndexedPages.length} pages.`,
      level: "info",
    });
    saveSites(sites);

    return { success: true, pagesCrawled };
  } catch (err: any) {
    site.status = "error";
    site.error = err.message || "Crawl failed";
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Crawl aborted with error: ${site.error}`,
      level: "error",
    });
    saveSites(sites);
    return { success: false, pagesCrawled, error: err.message };
  }
}

/**
 * Searches the oxylow search index.
 */
export function searchOxylowIndex(query: string, page = 1, pageSize = 10): { results: SearchResult[]; total: number } {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    const results: SearchResult[] = index.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
      url: item.url,
      domain: item.domain,
      title: item.title,
      description: item.description,
      bodyPreview: item.bodyPreview,
      favicon: item.favicon,
      score: 1,
      indexedAt: item.indexedAt,
    }));
    return { results, total: index.length };
  }

  const queryTerms = trimmed.split(/\s+/).filter(Boolean);

  const scored = index
    .map((item) => {
      let score = 0;
      const lowerTitle = (item.title || "").toLowerCase();
      const lowerDesc = (item.description || "").toLowerCase();
      const lowerDomain = (item.domain || "").toLowerCase();
      const lowerBody = (item.bodyPreview || "").toLowerCase();
      const lowerHeadings = (item.headings || []).join(" ").toLowerCase();
      const lowerKeywords = (item.keywords || []).join(" ").toLowerCase();

      // Exact full match
      if (lowerTitle.includes(trimmed)) score += 50;
      if (lowerDomain.includes(trimmed)) score += 30;
      if (lowerDesc.includes(trimmed)) score += 20;

      for (const term of queryTerms) {
        if (lowerTitle.includes(term)) score += 15;
        if (lowerDomain.includes(term)) score += 10;
        if (lowerHeadings.includes(term)) score += 8;
        if (lowerKeywords.includes(term)) score += 6;
        if (lowerDesc.includes(term)) score += 5;
        if (lowerBody.includes(term)) score += 2;
      }

      return {
        url: item.url,
        domain: item.domain,
        title: item.title,
        description: item.description,
        bodyPreview: item.bodyPreview,
        favicon: item.favicon,
        score,
        indexedAt: item.indexedAt,
      };
    })
    .filter((res) => res.score > 0)
    .sort((a, b) => b.score - a.score);

  const total = scored.length;
  const start = (page - 1) * pageSize;
  const results = scored.slice(start, start + pageSize);

  return { results, total };
}

/**
 * Autocomplete suggestions for Omnibox.
 */
export function getOxylowSuggestions(query: string, limit = 6): { title: string; url: string }[] {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const matched = index
    .filter(
      (item) =>
        item.title.toLowerCase().includes(trimmed) ||
        item.url.toLowerCase().includes(trimmed) ||
        item.domain.toLowerCase().includes(trimmed)
    )
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      url: item.url,
    }));

  return matched;
}
