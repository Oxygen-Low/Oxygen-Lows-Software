import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup, resolveTxt } from "node:dns/promises";
import { isPrivateIP, assertPublicHostname } from "./safeAiUrl.ts";

export const DATA_DIR = path.join(process.cwd(), "Data");
export const SITES_FILE = path.join(DATA_DIR, "webmaster_sites.json");
export const INDEX_FILE = path.join(DATA_DIR, "oxylow_index.json");

export const OXYLOW_USER_AGENT =
  "Mozilla/5.0 (compatible; oxylow/1.0; +https://oxygenlow.com/bot; support@oxygenlow.com)";
export const OXYLOW_CONTACT_EMAIL = "support@oxygenlow.com";
export let DEFAULT_DOMAIN_DELAY_MS = 1000;
export const MAX_SITE_INDEX_PAGES = 500;
export const CRAWL_BATCH_SIZE = 20;
export let BATCH_CRAWL_DELAY_MS = 0;

export function setDefaultDomainDelayMs(ms: number) {
  DEFAULT_DOMAIN_DELAY_MS = ms;
}

export function setBatchCrawlDelayMs(ms: number) {
  BATCH_CRAWL_DELAY_MS = ms;
}

export interface WebmasterSite {
  id: string;
  userId: string;
  url: string;
  domain: string;
  sitemapUrl?: string;
  status: "unverified" | "pending" | "crawling" | "indexed" | "error";
  verified: boolean;
  verificationToken: string;
  adminAdded?: boolean;
  pageCount: number;
  lastCrawledAt?: string;
  createdAt: string;
  error?: string;
  logs: { timestamp: string; message: string; level?: "info" | "warn" | "error" }[];
  queuePosition?: number | null;
  pendingUrls?: string[];
  nextCrawlScheduledAt?: string | null;
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

let cachedSites: WebmasterSite[] | null = null;
let cachedIndex: IndexedPage[] | null = null;
let saveSitesTimeout: NodeJS.Timeout | null = null;
let activeCrawlAbortController: AbortController | null = null;

export function flushSitesToDisk(): void {
  if (saveSitesTimeout) {
    clearTimeout(saveSitesTimeout);
    saveSitesTimeout = null;
  }
  if (cachedSites) {
    ensureDataFiles();
    fs.writeFileSync(SITES_FILE, JSON.stringify(cachedSites, null, 2), "utf8");
  }
}

export function getSites(): WebmasterSite[] {
  if (cachedSites) {
    return cachedSites;
  }
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(SITES_FILE, "utf8");
    cachedSites = JSON.parse(raw);
    return cachedSites!;
  } catch {
    cachedSites = [];
    return cachedSites;
  }
}

export function saveSites(sites: WebmasterSite[], immediate = true): void {
  cachedSites = sites;
  if (immediate) {
    flushSitesToDisk();
  } else {
    if (!saveSitesTimeout) {
      saveSitesTimeout = setTimeout(() => {
        saveSitesTimeout = null;
        flushSitesToDisk();
      }, 500);
    }
  }
}

export function getIndex(): IndexedPage[] {
  if (cachedIndex) {
    return cachedIndex;
  }
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(INDEX_FILE, "utf8");
    cachedIndex = JSON.parse(raw);
    return cachedIndex!;
  } catch {
    cachedIndex = [];
    return cachedIndex;
  }
}

export function saveIndex(index: IndexedPage[]): void {
  cachedIndex = index;
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
 * Checks DNS TXT records for a domain to verify ownership.
 * Checks both root hostname and _oxylow-challenge.<hostname>.
 */
export async function verifyDomainDns(
  domain: string,
  expectedToken: string
): Promise<{ verified: boolean; message: string; foundRecords?: string[] }> {
  const cleanDomain = domain.split(":")[0].toLowerCase();
  const hostnamesToTry = [cleanDomain, `_oxylow-challenge.${cleanDomain}`];
  const allFoundRecords: string[] = [];

  for (const host of hostnamesToTry) {
    try {
      const records = await resolveTxt(host);
      for (const recordChunks of records) {
        const fullTxt = recordChunks.join("");
        allFoundRecords.push(fullTxt);
        if (
          fullTxt === `oxylow-verification=${expectedToken}` ||
          fullTxt === expectedToken ||
          fullTxt.includes(`oxylow-verification=${expectedToken}`)
        ) {
          return { verified: true, message: `Domain ownership verified on ${host}` };
        }
      }
    } catch {
      // Record not found on this host
    }
  }

  return {
    verified: false,
    message: `Verification TXT record not found. Please add a TXT record with value "oxylow-verification=${expectedToken}" to ${cleanDomain} or _oxylow-challenge.${cleanDomain}`,
    foundRecords: allFoundRecords,
  };
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
    await waitForDomainSlot(domain, DEFAULT_DOMAIN_DELAY_MS > 0 ? 500 : 0);
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
        if (!isNaN(delaySec) && delaySec >= 0) {
          crawlDelayMs = Math.round(delaySec * 1000);
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
    while ((match = locRegex.exec(xml)) !== null && discoveredUrls.length < MAX_SITE_INDEX_PAGES) {
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

// Batch crawl scheduler
const scheduledBatchTimers = new Map<string, NodeJS.Timeout>();

export function cancelScheduledCrawl(siteId: string): void {
  const timer = scheduledBatchTimers.get(siteId);
  if (timer) {
    clearTimeout(timer);
    scheduledBatchTimers.delete(siteId);
  }
}

export function isCrawlScheduled(siteId: string): boolean {
  return scheduledBatchTimers.has(siteId);
}

/**
 * Crawls a submitted site with the "oxylow" bot:
 * - Checks robots.txt (supports User-agent: oxylow and Crawl-delay)
 * - Uses sitemap if provided or discovered
 * - Enforces per-domain delay between requests
 * - Identifies with oxylow user agent & contact email support@oxygenlow.com
 * - Saves extracted pages into the search index
 * - Batch size: 20 pages per run. If > 20 pages found, re-queues the next batch immediately, up to 500 pages max.
 */
export async function crawlSite(
  siteId: string,
  maxPages = CRAWL_BATCH_SIZE
): Promise<{ success: boolean; pagesCrawled: number; error?: string }> {
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return { success: false, pagesCrawled: 0, error: "Site not found" };
  }

  const site = sites[siteIndex];

  if (!site.verified && !site.adminAdded) {
    site.status = "unverified";
    site.error = "DNS verification required before crawling.";
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: `Crawl prevented: Domain ${site.domain || site.url} is unverified. Add TXT record "oxylow-verification=${site.verificationToken || ''}" to verify ownership.`,
      level: "warn",
    });
    saveSites(sites);
    return { success: false, pagesCrawled: 0, error: site.error };
  }

  site.status = "crawling";
  site.error = undefined;

  const isContinuation = Array.isArray(site.pendingUrls) && site.pendingUrls.length > 0;
  const currentIndex = getIndex();
  const existingPages = isContinuation ? currentIndex.filter((p) => p.siteId === site.id) : [];
  const crawledUrls = new Set<string>(existingPages.map((p) => p.url));
  const mutateSite = (fn: (currentSite: WebmasterSite) => void, immediate = false): WebmasterSite | null => {
    const currentSites = getSites();
    const currentSite = currentSites.find((s) => s.id === siteId);
    if (!currentSite) return null;
    fn(currentSite);
    saveSites(currentSites, immediate);
    return currentSite;
  };

  const log = (message: string, level: "info" | "warn" | "error" = "info", immediate = false) => {
    mutateSite((s) => {
      s.logs.push({
        timestamp: new Date().toISOString(),
        message,
        level,
      });
    }, immediate);
  };

  log(
    isContinuation
      ? `Resuming crawl batch for ${site.domain || site.url} (${existingPages.length} pages already indexed, ${site.pendingUrls?.length || 0} queued)...`
      : `Starting crawl with oxylow bot (contact: ${OXYLOW_CONTACT_EMAIL})...`,
    "info"
  );

  activeCrawlAbortController = new AbortController();
  const abortSignal = activeCrawlAbortController.signal;

  const crawlQueue: string[] = isContinuation ? [...(site.pendingUrls || [])] : [];
  let pagesCrawled = 0;

  const baseIndex = isContinuation
    ? currentIndex
    : currentIndex.filter((p) => p.siteId !== site.id);
  const newIndexedPages: IndexedPage[] = [];

  try {
    const parsedStartUrl = await validateCrawlUrl(site.url);
    const domain = parsedStartUrl.hostname.toLowerCase();
    const origin = parsedStartUrl.origin;

    // 1. Fetch robots.txt
    log(`Fetching robots.txt from ${origin}/robots.txt...`, "info");
    const robots = await getRobotsRules(origin, domain);
    log(`Robots.txt parsed. Disallowed paths: ${robots.disallow.length}, Crawl-delay: ${robots.crawlDelayMs}ms`, "info");

    if (!isContinuation) {
      // 2. Discover from Sitemap if available on fresh crawl
      const sitemapTarget = site.sitemapUrl || `${origin}/sitemap.xml`;
      log(`Checking sitemap at ${sitemapTarget}...`, "info");

      const sitemapUrls = await parseSitemap(sitemapTarget, domain, robots.crawlDelayMs);
      if (sitemapUrls.length > 0) {
        log(`Found ${sitemapUrls.length} URLs in sitemap.`, "info");
        for (const u of sitemapUrls) {
          if (crawlQueue.length >= MAX_SITE_INDEX_PAGES) break;
          if (!crawlQueue.includes(u)) {
            crawlQueue.push(u);
          }
        }
      }

      // Always ensure start URL is in queue
      if (!crawlQueue.includes(site.url)) {
        crawlQueue.unshift(site.url);
      }
    }

    while (
      crawlQueue.length > 0 &&
      pagesCrawled < maxPages &&
      existingPages.length + pagesCrawled < MAX_SITE_INDEX_PAGES
    ) {
      if (abortSignal.aborted || currentCrawlingSiteId !== site.id) {
        return { success: false, pagesCrawled, error: "Crawl cancelled" };
      }
      const currentUrl = crawlQueue.shift()!;
      if (crawledUrls.has(currentUrl)) continue;
      crawledUrls.add(currentUrl);

      let parsedCurrent: URL;
      try {
        parsedCurrent = await validateCrawlUrl(currentUrl);
      } catch (err: any) {
        log(`Skipping ${currentUrl}: ${err.message}`, "warn");
        continue;
      }

      // Check robots.txt disallow rules
      if (!isPathAllowed(parsedCurrent.pathname, robots)) {
        log(`Blocked by robots.txt: ${parsedCurrent.pathname}`, "warn");
        continue;
      }

      // Enforce delay between requests to this domain
      log(`Requesting ${currentUrl} (enforcing domain delay)...`, "info");
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
          log(`Skipping non-HTML page ${currentUrl} (${contentType})`, "info");
          continue;
        }

        const html = await res.text();
        const extracted = extractPageData(html, currentUrl);

        const pageItem: IndexedPage = {
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
        };

        newIndexedPages.push(pageItem);
        baseIndex.push(pageItem);
        cachedIndex = baseIndex;

        pagesCrawled++;
        const totalSoFar = existingPages.length + pagesCrawled;
        const pageUpdated = mutateSite((s) => {
          s.pageCount = totalSoFar;
          s.logs.push({
            timestamp: new Date().toISOString(),
            message: `Indexed (${pagesCrawled}/${maxPages}, total: ${totalSoFar}/${MAX_SITE_INDEX_PAGES}): "${extracted.title}"`,
            level: "info",
          });
        }, false);

        if (!pageUpdated) {
          return { success: false, pagesCrawled, error: "Site removed" };
        }

        // Add internal links to queue up to MAX_SITE_INDEX_PAGES
        for (const link of extracted.links) {
          if (crawledUrls.size + crawlQueue.length >= MAX_SITE_INDEX_PAGES) break;
          if (!crawledUrls.has(link) && !crawlQueue.includes(link)) {
            crawlQueue.push(link);
          }
        }
      } catch (reqErr: any) {
        log(`Error fetching ${currentUrl}: ${reqErr.message}`, "error");
      }
    }

    if (abortSignal.aborted || currentCrawlingSiteId !== siteId) {
      return { success: false, pagesCrawled, error: "Crawl cancelled" };
    }

    saveIndex(baseIndex);

    const totalIndexed = existingPages.length + newIndexedPages.length;
    const remainingUrls = crawlQueue.filter((u) => !crawledUrls.has(u));

    const finalUpdated = mutateSite((s) => {
      s.pageCount = totalIndexed;
      s.lastCrawledAt = new Date().toISOString();

      if (remainingUrls.length > 0 && totalIndexed < MAX_SITE_INDEX_PAGES) {
        s.pendingUrls = remainingUrls.slice(0, MAX_SITE_INDEX_PAGES - totalIndexed);
        s.nextCrawlScheduledAt = new Date(Date.now() + BATCH_CRAWL_DELAY_MS).toISOString();
        s.status = totalIndexed > 0 ? "indexed" : "error";
        s.logs.push({
          timestamp: new Date().toISOString(),
          message: `Batch completed: indexed ${pagesCrawled} pages (total: ${totalIndexed}/${MAX_SITE_INDEX_PAGES}). ${s.pendingUrls.length} pages remaining. Re-queuing next batch.`,
          level: "info",
        });

        // Re-queue the next batch (no inter-batch wait)
        cancelScheduledCrawl(s.id);
        const timer = setTimeout(() => {
          scheduledBatchTimers.delete(s.id);
          const latestSites = getSites();
          const target = latestSites.find((item) => item.id === s.id);
          if (target && target.pendingUrls && target.pendingUrls.length > 0) {
            target.nextCrawlScheduledAt = null;
            saveSites(latestSites);
            enqueueCrawl(target.id, maxPages);
          }
        }, BATCH_CRAWL_DELAY_MS);
        scheduledBatchTimers.set(s.id, timer);
      } else {
        s.pendingUrls = [];
        s.nextCrawlScheduledAt = null;
        cancelScheduledCrawl(s.id);
        s.status = totalIndexed > 0 ? "indexed" : "error";
        s.logs.push({
          timestamp: new Date().toISOString(),
          message:
            totalIndexed >= MAX_SITE_INDEX_PAGES
              ? `Crawl completed: Reached maximum limit of ${MAX_SITE_INDEX_PAGES} indexed pages.`
              : `Crawl completed: All ${totalIndexed} discovered pages have been indexed.`,
          level: "info",
        });
      }
    }, true);

    if (!finalUpdated) {
      return { success: false, pagesCrawled, error: "Site removed" };
    }

    return { success: totalIndexed > 0, pagesCrawled };
  } catch (err: any) {
    mutateSite((s) => {
      s.status = s.pageCount > 0 ? "indexed" : "error";
      s.error = err.message || "Crawl failed";
      s.logs.push({
        timestamp: new Date().toISOString(),
        message: `Crawl aborted with error: ${s.error}`,
        level: "error",
      });
    }, true);
    return { success: false, pagesCrawled, error: err.message };
  }
}

// ============================================================
// Server-side Crawl Queue: Exactly 1 domain indexed at a time
// ============================================================

export interface CrawlQueueItem {
  siteId: string;
  maxPages: number;
}

const serverCrawlQueue: CrawlQueueItem[] = [];
let currentCrawlingSiteId: string | null = null;
let isCrawlerProcessing = false;

/**
 * Returns the 1-based queue position for a site:
 * - 1 if currently indexing
 * - 2, 3, ... if waiting in the FIFO queue
 * - null if not currently in queue or indexing
 */
export function getQueuePosition(siteId: string): number | null {
  if (currentCrawlingSiteId === siteId) {
    return 1;
  }
  const queueIndex = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (queueIndex !== -1) {
    return (currentCrawlingSiteId ? 1 : 0) + queueIndex + 1;
  }
  return null;
}

/**
 * Re-queues sites left pending/crawling (or with leftover URLs) after a process restart.
 * In-memory queue and batch timers do not survive restart.
 */
export function resumeInterruptedCrawls(): number {
  const sites = getSites();
  const toResume = sites.filter((site) => {
    if (!site.verified && !site.adminAdded) return false;
    if (getQueuePosition(site.id) !== null) return false;
    const hasPendingUrls = Array.isArray(site.pendingUrls) && site.pendingUrls.length > 0;
    return site.status === "pending" || site.status === "crawling" || hasPendingUrls;
  });

  toResume.sort((a, b) => {
    const rank = (site: WebmasterSite) =>
      site.status === "crawling" ? 0 : site.status === "pending" ? 1 : 2;
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  if (toResume.length === 0) return 0;

  for (const site of toResume) {
    if (site.status === "crawling") {
      site.status = "pending";
    }
    site.nextCrawlScheduledAt = null;
    site.logs.push({
      timestamp: new Date().toISOString(),
      message: "Resuming crawl after server restart.",
      level: "info",
    });
  }
  saveSites(sites);

  for (const site of toResume) {
    enqueueCrawl(site.id, CRAWL_BATCH_SIZE);
  }
  return toResume.length;
}

/**
 * Enqueues a site to be crawled/indexed.
 * Returns the 1-based queue position.
 */
export function enqueueCrawl(siteId: string, maxPages = 20): number {
  const existingPos = getQueuePosition(siteId);
  if (existingPos !== null) {
    return existingPos;
  }

  serverCrawlQueue.push({ siteId, maxPages });

  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (site && site.status !== "crawling") {
    site.status = "pending";
    saveSites(sites);
  }

  processNextInQueue().catch(console.error);

  return getQueuePosition(siteId) || 1;
}

/**
 * Sequential queue worker ensuring only 1 domain is crawled at a time.
 */
async function processNextInQueue(): Promise<void> {
  if (isCrawlerProcessing) return;
  isCrawlerProcessing = true;

  try {
    while (serverCrawlQueue.length > 0) {
      const next = serverCrawlQueue.shift()!;
      currentCrawlingSiteId = next.siteId;

      const sites = getSites();
      const site = sites.find((s) => s.id === next.siteId);
      if (site) {
        site.status = "crawling";
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: "Crawling started by oxylow bot from crawl queue.",
          level: "info",
        });
        saveSites(sites);
      }

      try {
        await crawlSite(next.siteId, next.maxPages);
      } catch (err: any) {
        console.error(`Error processing crawl for site ${next.siteId}:`, err);
      } finally {
        if (currentCrawlingSiteId === next.siteId) {
          currentCrawlingSiteId = null;
        }
      }
    }
  } finally {
    isCrawlerProcessing = false;
    if (serverCrawlQueue.length > 0) {
      processNextInQueue().catch(console.error);
    }
  }
}

/**
 * Removes a site from the pending crawl queue.
 */
export function removeFromCrawlQueue(siteId: string): void {
  const idx = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (idx !== -1) {
    serverCrawlQueue.splice(idx, 1);
  }
}

/**
 * Clears the crawl queue (for test cleanup).
 */
export function clearCrawlQueue(): void {
  if (activeCrawlAbortController) {
    activeCrawlAbortController.abort();
    activeCrawlAbortController = null;
  }
  if (saveSitesTimeout) {
    clearTimeout(saveSitesTimeout);
    saveSitesTimeout = null;
  }
  cachedSites = null;
  cachedIndex = null;
  for (const timer of scheduledBatchTimers.values()) {
    clearTimeout(timer);
  }
  scheduledBatchTimers.clear();
  domainLastRequestTime.clear();
  robotsCache.clear();
  serverCrawlQueue.length = 0;
  currentCrawlingSiteId = null;
  isCrawlerProcessing = false;
  BATCH_CRAWL_DELAY_MS = 0;
  DEFAULT_DOMAIN_DELAY_MS = 1000;
}

export function getCurrentCrawlingSiteId(): string | null {
  return currentCrawlingSiteId;
}

export function getCrawlQueueLength(): number {
  return (currentCrawlingSiteId ? 1 : 0) + serverCrawlQueue.length;
}

/**
 * Attaches queuePosition to a site object.
 */
export function attachQueuePosition<T extends WebmasterSite>(site: T): T {
  return {
    ...site,
    queuePosition: getQueuePosition(site.id),
  };
}

/**
 * Attaches queuePosition to a list of site objects.
 */
export function attachQueuePositions<T extends WebmasterSite>(sites: T[]): T[] {
  return sites.map(attachQueuePosition);
}


/**
 * Searches the oxylow search index.
 */
export function searchOxylowIndex(query: string, page = 1, pageSize = 10): { results: SearchResult[]; total: number } {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();

  const deduplicateByDomain = (items: SearchResult[]): SearchResult[] => {
    const seenDomains = new Set<string>();
    const deduplicated: SearchResult[] = [];
    for (const item of items) {
      const d = (item.domain || "").toLowerCase();
      if (d && !seenDomains.has(d)) {
        seenDomains.add(d);
        deduplicated.push(item);
      }
    }
    return deduplicated;
  };

  if (!trimmed) {
    const rawResults: SearchResult[] = index.map((item) => ({
      url: item.url,
      domain: item.domain,
      title: item.title,
      description: item.description,
      bodyPreview: item.bodyPreview,
      favicon: item.favicon,
      score: 1,
      indexedAt: item.indexedAt,
    }));
    const uniqueResults = deduplicateByDomain(rawResults);
    const start = (page - 1) * pageSize;
    const results = uniqueResults.slice(start, start + pageSize);
    return { results, total: uniqueResults.length };
  }

  const queryTerms = trimmed.split(/\s+/).filter(Boolean);

  const scored: SearchResult[] = index
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

  // Filter so domains can only appear once in search results, retaining the highest-scoring page for each domain
  const uniqueScored = deduplicateByDomain(scored);

  const total = uniqueScored.length;
  const start = (page - 1) * pageSize;
  const results = uniqueScored.slice(start, start + pageSize);

  return { results, total };
}

/**
 * Autocomplete suggestions for Omnibox.
 */
export function getOxylowSuggestions(query: string, limit = 6): { title: string; url: string }[] {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const matched: { title: string; url: string }[] = [];
  const seenDomains = new Set<string>();

  for (const item of index) {
    const lowerTitle = (item.title || "").toLowerCase();
    const lowerUrl = (item.url || "").toLowerCase();
    const lowerDomain = (item.domain || "").toLowerCase();

    if (
      lowerTitle.includes(trimmed) ||
      lowerUrl.includes(trimmed) ||
      lowerDomain.includes(trimmed)
    ) {
      if (lowerDomain && !seenDomains.has(lowerDomain)) {
        seenDomains.add(lowerDomain);
        matched.push({
          title: item.title,
          url: item.url,
        });
        if (matched.length >= limit) break;
      }
    }
  }

  return matched;
}
