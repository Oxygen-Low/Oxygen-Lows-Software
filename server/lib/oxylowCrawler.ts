import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup, resolveTxt } from "node:dns/promises";
import { isPrivateIP, assertPublicHostname } from "./safeAiUrl.ts";

export const DATA_DIR = path.join(process.cwd(), "Data");
export const SITES_FILE = path.join(DATA_DIR, "webmaster_sites.json");
export const INDEX_FILE = path.join(DATA_DIR, "oxylow_index.json");

export const OXYLOW_USER_AGENT =
  "Mozilla/5.0 (compatible; oxylow-search/1.0; +https://oxygenlow.com/bot; support@oxygenlow.com)";
export const OXYLOW_CONTACT_EMAIL = "support@oxygenlow.com";
export let DEFAULT_DOMAIN_DELAY_MS = 1000;
export const MAX_SITE_INDEX_PAGES = 1000;
export const CRAWL_BATCH_SIZE = 20;
export let BATCH_CRAWL_DELAY_MS = 500;
export const MAX_SITE_LOGS = 100;

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
const robotsCache = new Map<
  string,
  {
    rules: { disallow: string[]; allow: string[]; sitemaps: string[]; crawlDelayMs: number };
    crawlDelayMs: number;
    fetchedAt: number;
  }
>();

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(SITES_FILE)) {
    fs.writeFileSync(SITES_FILE, JSON.stringify([], null, 2), "utf8");
  }

  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify([]), "utf8");
  }
}

let cachedSites: WebmasterSite[] | null = null;
let cachedIndex: IndexedPage[] | null = null;
let saveSitesTimeout: NodeJS.Timeout | null = null;
let saveIndexTimeout: NodeJS.Timeout | null = null;
let isWritingSites = false;
let pendingSitesWrite = false;
let isWritingIndex = false;
let pendingIndexWrite = false;
const activeCrawlAbortControllers = new Map<string, AbortController>();
const activeCrawlingSiteIds = new Set<string>();
const activeCrawlingDomains = new Map<string, string>();
export const MAX_CONCURRENT_CRAWLS = 2;

async function safeWriteFileAsync(filePath: string, content: string): Promise<void> {
  const tempFile = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  await fs.promises.writeFile(tempFile, content, "utf8");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.promises.rename(tempFile, filePath);
      return;
    } catch (err: any) {
      if (attempt === 4 || !["EPERM", "ENOENT", "EBUSY", "EACCES"].includes(err?.code)) {
        await fs.promises.writeFile(filePath, content, "utf8");
        try {
          await fs.promises.unlink(tempFile);
        } catch {}
        return;
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

export async function flushSitesToDiskAsync(): Promise<void> {
  if (saveSitesTimeout) {
    clearTimeout(saveSitesTimeout);
    saveSitesTimeout = null;
  }
  if (!cachedSites) return;
  if (isWritingSites) {
    pendingSitesWrite = true;
    return;
  }
  isWritingSites = true;
  ensureDataFiles();
  try {
    const dataToWrite = JSON.stringify(cachedSites, null, 2);
    await safeWriteFileAsync(SITES_FILE, dataToWrite);
  } catch (err) {
    console.error("[Crawler] Failed to flush sites to disk:", err);
  } finally {
    isWritingSites = false;
    if (pendingSitesWrite) {
      pendingSitesWrite = false;
      flushSitesToDiskAsync().catch(() => {});
    }
  }
}

export function flushSitesToDisk(): void {
  flushSitesToDiskAsync().catch(() => {});
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

export async function flushIndexToDiskAsync(): Promise<void> {
  if (saveIndexTimeout) {
    clearTimeout(saveIndexTimeout);
    saveIndexTimeout = null;
  }
  if (!cachedIndex) return;
  if (isWritingIndex) {
    pendingIndexWrite = true;
    return;
  }
  isWritingIndex = true;
  ensureDataFiles();
  try {
    // Compact JSON eliminates massive string allocation overhead and drastically reduces file size
    const dataToWrite = JSON.stringify(cachedIndex);
    await safeWriteFileAsync(INDEX_FILE, dataToWrite);
  } catch (err) {
    console.error("[Crawler] Failed to flush index to disk:", err);
  } finally {
    isWritingIndex = false;
    if (pendingIndexWrite) {
      pendingIndexWrite = false;
      flushIndexToDiskAsync().catch(() => {});
    }
  }
}

export function flushIndexToDisk(): void {
  flushIndexToDiskAsync().catch(() => {});
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

export function saveIndex(index: IndexedPage[], immediate = false): void {
  cachedIndex = index;
  if (immediate) {
    flushIndexToDisk();
  } else {
    if (!saveIndexTimeout) {
      saveIndexTimeout = setTimeout(() => {
        saveIndexTimeout = null;
        flushIndexToDisk();
      }, 500);
    }
  }
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
 * Checks both root hostname and _oxylow-search-challenge.<hostname>.
 */
export async function verifyDomainDns(
  domain: string,
  expectedToken: string
): Promise<{ verified: boolean; message: string; foundRecords?: string[] }> {
  const cleanDomain = domain.split(":")[0].toLowerCase();
  const hostnamesToTry = [cleanDomain, `_oxylow-search-challenge.${cleanDomain}`];
  const allFoundRecords: string[] = [];

  for (const host of hostnamesToTry) {
    try {
      const records = await resolveTxt(host);
      for (const recordChunks of records) {
        const fullTxt = recordChunks.join("");
        allFoundRecords.push(fullTxt);
        if (
          fullTxt === `oxylow-search-verification=${expectedToken}` ||
          fullTxt === expectedToken ||
          fullTxt.includes(`oxylow-search-verification=${expectedToken}`)
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
    message: `Verification TXT record not found. Please add a TXT record with value "oxylow-search-verification=${expectedToken}" to ${cleanDomain} or _oxylow-search-challenge.${cleanDomain}`,
    foundRecords: allFoundRecords,
  };
}

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
  crawlDelayMs: number;
}

/**
 * Checks if a declared User-Agent string from robots.txt matches our target crawler bot.
 */
export function isUserAgentMatch(declaredUa: string, targetUa: string): boolean {
  const dec = declaredUa.trim().toLowerCase();
  const target = targetUa.trim().toLowerCase();
  if (!dec || !target) return false;
  if (dec === "*") return false;

  // Exact match
  if (dec === target) return true;

  // Token match (e.g. oxylow-search from oxylow-search/1.0)
  const decToken = dec.split("/")[0].trim();
  const targetToken = target.split("/")[0].trim();

  if (decToken === targetToken) return true;
  if (targetToken.startsWith(decToken) && decToken.length >= 6) return true;
  if (decToken.startsWith(targetToken)) return true;

  const botSynonyms = ["oxylow-search", "oxylow_search", "oxylow", "oxylowbot", "oxylow-aisearch"];
  if (botSynonyms.includes(decToken) && botSynonyms.includes(targetToken)) {
    return true;
  }

  return false;
}

/**
 * Parses robots.txt content according to RFC 9309 (Robots Exclusion Protocol).
 * Accurately isolates record groups and respects crawler-specific directives without inheriting
 * generic rules when a specific user-agent group is matched.
 */
export function parseRobotsTxt(text: string, targetUserAgent = "oxylow-search"): RobotsRules {
  if (!text || typeof text !== "string") {
    return {
      disallow: [],
      allow: [],
      sitemaps: [],
      crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
    };
  }

  const lines = text.split(/\r?\n/);
  interface RawGroup {
    userAgents: string[];
    disallow: string[];
    allow: string[];
    crawlDelayMs?: number;
  }

  const groups: RawGroup[] = [];
  const globalSitemaps: string[] = [];
  let currentGroup: RawGroup | null = null;
  let inDirectives = false;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) {
      if (currentGroup && inDirectives) {
        groups.push(currentGroup);
        currentGroup = null;
        inDirectives = false;
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === "sitemap") {
      if (val && !globalSitemaps.includes(val)) {
        globalSitemaps.push(val);
      }
      continue;
    }

    if (key === "user-agent") {
      const ua = val.toLowerCase();
      if (inDirectives && currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
        inDirectives = false;
      }

      if (!currentGroup) {
        currentGroup = {
          userAgents: [],
          disallow: [],
          allow: [],
        };
      }
      if (ua && !currentGroup.userAgents.includes(ua)) {
        currentGroup.userAgents.push(ua);
      }
    } else if (key === "disallow") {
      if (!currentGroup) continue;
      inDirectives = true;
      if (val) {
        currentGroup.disallow.push(val);
      }
    } else if (key === "allow") {
      if (!currentGroup) continue;
      inDirectives = true;
      if (val) {
        currentGroup.allow.push(val);
      }
    } else if (key === "crawl-delay") {
      if (!currentGroup) continue;
      inDirectives = true;
      const delaySec = parseFloat(val);
      if (!isNaN(delaySec) && delaySec >= 0) {
        currentGroup.crawlDelayMs = Math.round(delaySec * 1000);
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  // 1. Check for specific matching groups (RFC 9309: specific user-agent group takes precedence)
  const specificGroups = groups.filter((g) =>
    g.userAgents.some((ua) => isUserAgentMatch(ua, targetUserAgent))
  );

  if (specificGroups.length > 0) {
    const specificDisallow: string[] = [];
    const specificAllow: string[] = [];
    let specificCrawlDelay: number | undefined = undefined;

    for (const g of specificGroups) {
      specificDisallow.push(...g.disallow);
      specificAllow.push(...g.allow);
      if (g.crawlDelayMs !== undefined && specificCrawlDelay === undefined) {
        specificCrawlDelay = g.crawlDelayMs;
      }
    }

    return {
      disallow: specificDisallow,
      allow: specificAllow,
      sitemaps: globalSitemaps,
      crawlDelayMs: specificCrawlDelay ?? DEFAULT_DOMAIN_DELAY_MS,
    };
  }

  // 2. Check for wildcard '*' group
  const starGroups = groups.filter((g) => g.userAgents.includes("*"));
  if (starGroups.length > 0) {
    const starDisallow: string[] = [];
    const starAllow: string[] = [];
    let starCrawlDelay: number | undefined = undefined;

    for (const g of starGroups) {
      starDisallow.push(...g.disallow);
      starAllow.push(...g.allow);
      if (g.crawlDelayMs !== undefined && starCrawlDelay === undefined) {
        starCrawlDelay = g.crawlDelayMs;
      }
    }

    return {
      disallow: starDisallow,
      allow: starAllow,
      sitemaps: globalSitemaps,
      crawlDelayMs: starCrawlDelay ?? DEFAULT_DOMAIN_DELAY_MS,
    };
  }

  // 3. Fallback: allow all
  return {
    disallow: [],
    allow: [],
    sitemaps: globalSitemaps,
    crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
  };
}

/**
 * Matches a robots.txt pattern against a path according to RFC 9309 Section 2.2.2.
 * Supports '*' wildcards and '$' end-of-path anchors.
 */
function patternMatchesPath(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const hasEndAnchor = pattern.endsWith("$");
  const cleanPattern = hasEndAnchor ? pattern.slice(0, -1) : pattern;

  const escaped = cleanPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexPattern = `^${escaped.replace(/\*/g, ".*")}${hasEndAnchor ? "$" : ""}`;
  try {
    const reg = new RegExp(regexPattern);
    return reg.test(path);
  } catch {
    return path.startsWith(pattern);
  }
}

/**
 * Checks if a path is allowed by robots.txt rules according to RFC 9309 precedence:
 * - Most specific match (longest rule pattern) wins.
 * - In case of a tie between Allow and Disallow of equal length, Allow wins.
 * - Defaults to allowed if no rules match.
 */
export function isPathAllowed(
  pathStr: string,
  rules: { disallow: string[]; allow: string[] }
): boolean {
  if (!rules) return true;
  const normalizedPath = pathStr.startsWith("/") ? pathStr : `/${pathStr}`;

  let longestMatchLen = -1;
  let longestMatchType: "allow" | "disallow" | null = null;

  for (const disallow of rules.disallow || []) {
    if (!disallow) continue;
    if (patternMatchesPath(disallow, normalizedPath)) {
      const len = disallow.length;
      if (len > longestMatchLen) {
        longestMatchLen = len;
        longestMatchType = "disallow";
      }
    }
  }

  for (const allow of rules.allow || []) {
    if (!allow) continue;
    if (patternMatchesPath(allow, normalizedPath)) {
      const len = allow.length;
      if (len >= longestMatchLen) {
        longestMatchLen = len;
        longestMatchType = "allow";
      }
    }
  }

  if (longestMatchType === "disallow") {
    return false;
  }
  return true;
}

/**
 * Fetches and parses robots.txt for a given domain, caching the result.
 * Strictly adheres to RFC 9309 HTTP response status code rules:
 * - 2xx: Parse robots.txt
 * - 401/403: Full Disallow (Disallow: /)
 * - 404/410: Full Allow (Disallow: [])
 * - 5xx: Full Disallow (Disallow: /) to avoid hammering degraded origin
 */
export async function getRobotsRules(
  origin: string,
  domain: string,
  targetUserAgent = "oxylow-search"
): Promise<RobotsRules> {
  const cacheKey = `${domain.toLowerCase()}#${targetUserAgent.toLowerCase()}`;
  const cached = robotsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 3600000) {
    return {
      disallow: cached.rules.disallow,
      allow: cached.rules.allow,
      sitemaps: cached.rules.sitemaps || [],
      crawlDelayMs: cached.crawlDelayMs,
    };
  }

  const defaultAllowResult: RobotsRules = {
    disallow: [],
    allow: [],
    sitemaps: [],
    crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
  };
  const fullDisallowResult: RobotsRules = {
    disallow: ["/"],
    allow: [],
    sitemaps: [],
    crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
  };

  try {
    await waitForDomainSlot(domain, DEFAULT_DOMAIN_DELAY_MS > 0 ? 500 : 0);
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(robotsUrl, {
      method: "GET",
      headers: {
        "User-Agent": OXYLOW_USER_AGENT,
        From: OXYLOW_CONTACT_EMAIL,
        Accept: "text/plain,*/*",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (res.status === 401 || res.status === 403) {
      robotsCache.set(cacheKey, {
        rules: fullDisallowResult,
        crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
        fetchedAt: Date.now(),
      });
      return fullDisallowResult;
    }

    if (res.status === 404 || res.status === 410) {
      robotsCache.set(cacheKey, {
        rules: defaultAllowResult,
        crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
        fetchedAt: Date.now(),
      });
      return defaultAllowResult;
    }

    if (res.status >= 500 || !res.ok) {
      robotsCache.set(cacheKey, {
        rules: fullDisallowResult,
        crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
        fetchedAt: Date.now(),
      });
      return fullDisallowResult;
    }

    const text = await res.text();
    const rules = parseRobotsTxt(text, targetUserAgent);

    robotsCache.set(cacheKey, {
      rules,
      crawlDelayMs: rules.crawlDelayMs,
      fetchedAt: Date.now(),
    });
    return rules;
  } catch {
    robotsCache.set(cacheKey, {
      rules: defaultAllowResult,
      crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS,
      fetchedAt: Date.now(),
    });
    return defaultAllowResult;
  }
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

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#039;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&bull;": "•",
  "&prime;": "′",
  "&Prime;": "″",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
  "&cent;": "¢",
  "&sect;": "§",
  "&deg;": "°",
  "&plusmn;": "±",
  "&times;": "×",
  "&divide;": "÷",
};

/**
 * Decodes all named and numerical HTML entities into clean Unicode characters.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  let decoded = str;
  for (const [entity, replacement] of Object.entries(HTML_ENTITY_MAP)) {
    decoded = decoded.replaceAll(entity, replacement);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    try {
      const code = parseInt(dec, 10);
      return code ? String.fromCodePoint(code) : "";
    } catch {
      return _;
    }
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return code ? String.fromCodePoint(code) : "";
    } catch {
      return _;
    }
  });
  return decoded;
}

export interface ReaderArticle {
  title: string;
  description: string;
  headings: string[];
  content: string;
  paragraphs: string[];
  readingTimeMinutes: number;
  favicon?: string;
}

/**
 * Extracts structured article content, cleaning out navigation, header, and footer boilerplate.
 */
export function extractReaderArticle(html: string, currentUrl: string): ReaderArticle {
  const pageData = extractPageData(html, currentUrl);
  const safeHtml = html.length > 2 * 1024 * 1024 ? html.slice(0, 2 * 1024 * 1024) : html;

  let cleaned = safeHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<menu\b[^>]*>[\s\S]*?<\/menu>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");

  const articleMatch =
    cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<div\b[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i);
  if (articleMatch && articleMatch[1].length > 200) {
    cleaned = articleMatch[1];
  }

  const paragraphs: string[] = [];
  const paragraphRegex = /<(?:p|h[1-6]|blockquote|li)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|blockquote|li)>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = paragraphRegex.exec(cleaned)) !== null) {
    const rawBlock = pMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
    const text = decodeHtmlEntities(rawBlock);
    if (text.length > 20 && !paragraphs.includes(text)) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length === 0) {
    const fallbackText = decodeHtmlEntities(
      cleaned
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|section|article|h[1-6])>/gi, "\n\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim()
    );
    const splitBlocks = fallbackText.split(/\n\n+/).map((b) => b.trim()).filter((b) => b.length > 20);
    paragraphs.push(...splitBlocks);
  }

  const fullContent = paragraphs.join("\n\n");
  const wordCount = fullContent.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return {
    title: pageData.title,
    description: pageData.description,
    headings: pageData.headings,
    content: fullContent || pageData.bodyPreview,
    paragraphs: paragraphs.length > 0 ? paragraphs : [pageData.bodyPreview],
    readingTimeMinutes,
    favicon: pageData.favicon,
  };
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
    title = decodeHtmlEntities(titleMatch[1].trim());
  }

  let description = "";
  const metaDescMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i) ||
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (metaDescMatch) {
    description = decodeHtmlEntities(metaDescMatch[1].trim());
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
    const cleanHeading = decodeHtmlEntities(hMatch[1].replace(/<[^>]+>/g, "").trim());
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
        .map((k) => decodeHtmlEntities(k.trim().toLowerCase()))
        .filter(Boolean)
    );
  }

  // Clean body text preview with linear-time safe regexes and tag whitespace separation
  const safeHtml = html.length > 2 * 1024 * 1024 ? html.slice(0, 2 * 1024 * 1024) : html;
  const cleanBody = decodeHtmlEntities(
    safeHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<\/(?:p|div|section|article|h[1-6]|li)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

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
 * Crawls a submitted site with the "oxylow-search" bot:
 * - Checks robots.txt (supports User-agent: oxylow-search and Crawl-delay)
 * - Uses sitemap if provided or discovered
 * - Enforces per-domain delay between requests
 * - Identifies with oxylow-search user agent & contact email support@oxygenlow.com
 * - Saves extracted pages into the search index
 * - Batch size: 20 pages per run. If > 20 pages found, re-queues the next batch immediately, up to 1000 pages max.
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
      message: `Crawl prevented: Domain ${site.domain || site.url} is unverified. Add TXT record "oxylow-search-verification=${site.verificationToken || ''}" to verify ownership.`,
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
    if (currentSite.logs && currentSite.logs.length > MAX_SITE_LOGS) {
      currentSite.logs = currentSite.logs.slice(-MAX_SITE_LOGS);
    }
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
      : `Starting crawl with oxylow-search bot (contact: ${OXYLOW_CONTACT_EMAIL})...`,
    "info"
  );

  const siteAbortController = new AbortController();
  activeCrawlAbortControllers.set(site.id, siteAbortController);
  const abortSignal = siteAbortController.signal;

  const crawlQueue: string[] = isContinuation ? [...(site.pendingUrls || [])] : [];
  let pagesCrawled = 0;

  const baseIndex = isContinuation
    ? currentIndex
    : currentIndex.filter((p) => p.siteId !== site.id);
  const newIndexedPages: IndexedPage[] = [];

  try {
    const parsedStartUrl = await validateCrawlUrl(site.url);
    const domain = parsedStartUrl.hostname.toLowerCase();
    activeCrawlingDomains.set(site.id, domain);
    const origin = parsedStartUrl.origin;

    // 1. Fetch robots.txt
    log(`Fetching robots.txt from ${origin}/robots.txt...`, "info");
    const robots = await getRobotsRules(origin, domain);
    log(`Robots.txt parsed. Disallowed paths: ${robots.disallow.length}, Crawl-delay: ${robots.crawlDelayMs}ms`, "info");

    if (!isContinuation) {
      // 2. Discover from Sitemap if available on fresh crawl
      const sitemapTargets = site.sitemapUrl
        ? [site.sitemapUrl]
        : robots.sitemaps && robots.sitemaps.length > 0
        ? robots.sitemaps
        : [`${origin}/sitemap.xml`];

      for (const sitemapTarget of sitemapTargets) {
        try {
          const sitemapUrlObj = new URL(sitemapTarget);
          if (!isPathAllowed(sitemapUrlObj.pathname, robots)) {
            log(`Skipping sitemap at ${sitemapTarget} (disallowed by robots.txt)...`, "warn");
            continue;
          }
          log(`Checking sitemap at ${sitemapTarget}...`, "info");
          const sitemapUrls = await parseSitemap(sitemapTarget, domain, robots.crawlDelayMs);
          if (sitemapUrls.length > 0) {
            log(`Found ${sitemapUrls.length} URLs in sitemap (${sitemapTarget}).`, "info");
            for (const u of sitemapUrls) {
              if (crawlQueue.length >= MAX_SITE_INDEX_PAGES) break;
              if (!crawlQueue.includes(u)) {
                crawlQueue.push(u);
              }
            }
          }
        } catch {}
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
      if (abortSignal.aborted || !activeCrawlingSiteIds.has(site.id)) {
        return { success: false, pagesCrawled, error: "Crawl cancelled" };
      }
      const currentUrl = crawlQueue.shift()!;
      if (crawledUrls.has(currentUrl)) continue;
      crawledUrls.add(currentUrl);

      // Yield to the event loop so other concurrent requests/apps process smoothly
      await new Promise((r) => setImmediate(r));

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
        const fetchSignal = (AbortSignal as any).any
          ? (AbortSignal as any).any([controller.signal, abortSignal])
          : controller.signal;

        const res = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": OXYLOW_USER_AGENT,
            "From": OXYLOW_CONTACT_EMAIL,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: fetchSignal,
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
        const existingIdx = baseIndex.findIndex((p) => p.url === pageItem.url);
        if (existingIdx !== -1) {
          baseIndex[existingIdx] = pageItem;
        } else {
          baseIndex.push(pageItem);
        }
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
        if (abortSignal.aborted || !activeCrawlingSiteIds.has(site.id)) {
          return { success: false, pagesCrawled, error: "Crawl cancelled" };
        }
      }
    }

    if (abortSignal.aborted || !activeCrawlingSiteIds.has(siteId)) {
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
        if (totalIndexed === 0) {
          s.error = "Crawl completed with 0 indexed pages: Disallowed by robots.txt rules for oxylow-search or unreachable.";
          s.logs.push({
            timestamp: new Date().toISOString(),
            message: `Crawl completed: 0 pages indexed (target paths disallowed by robots.txt or unreachable).`,
            level: "warn",
          });
        } else {
          s.logs.push({
            timestamp: new Date().toISOString(),
            message:
              totalIndexed >= MAX_SITE_INDEX_PAGES
                ? `Crawl completed: Reached maximum limit of ${MAX_SITE_INDEX_PAGES} indexed pages.`
                : `Crawl completed: All ${totalIndexed} discovered pages have been indexed.`,
            level: "info",
          });
        }
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
  } finally {
    activeCrawlAbortControllers.delete(site.id);
  }
}

// ============================================================
// Server-side Crawl Queue: Up to 2 domains indexed concurrently
// ============================================================

export interface CrawlQueueItem {
  siteId: string;
  maxPages: number;
}

const serverCrawlQueue: CrawlQueueItem[] = [];
let isCrawlerProcessing = false;

/**
 * Returns the 1-based queue position for a waiting site:
 * - null if currently actively crawling or not in queue
 * - 1, 2, ... if waiting in the FIFO queue
 */
export function getQueuePosition(siteId: string): number | null {
  if (activeCrawlingSiteIds.has(siteId)) {
    return null;
  }
  const queueIndex = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (queueIndex !== -1) {
    return queueIndex + 1;
  }
  return null;
}

/**
 * Checks if a site is currently actively crawling.
 */
export function isSiteCrawling(siteId: string): boolean {
  return activeCrawlingSiteIds.has(siteId);
}

/**
 * Returns all currently actively crawling site IDs.
 */
export function getActiveCrawlingSiteIds(): string[] {
  return Array.from(activeCrawlingSiteIds);
}

/**
 * Re-queues sites left pending/crawling (or with leftover URLs) after a process restart.
 * In-memory queue and batch timers do not survive restart.
 */
export function resumeInterruptedCrawls(): number {
  const sites = getSites();
  const toResume = sites.filter((site) => {
    if (!site.verified && !site.adminAdded) return false;
    if (getQueuePosition(site.id) !== null || activeCrawlingSiteIds.has(site.id)) return false;
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
 * Returns the 1-based queue position if waiting in queue, or null if actively crawling.
 */
export function enqueueCrawl(siteId: string, maxPages = 20): number | null {
  if (activeCrawlingSiteIds.has(siteId)) {
    return null;
  }
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

  return getQueuePosition(siteId);
}

/**
 * Concurrent queue worker ensuring up to 2 domains are crawled concurrently,
 * prioritizing distinct domains so fetch cooldowns can interleave.
 */
async function processNextInQueue(): Promise<void> {
  if (isCrawlerProcessing) return;
  isCrawlerProcessing = true;

  try {
    while (activeCrawlingSiteIds.size < MAX_CONCURRENT_CRAWLS && serverCrawlQueue.length > 0) {
      const runningDomains = new Set(activeCrawlingDomains.values());
      const sites = getSites();

      // Prioritize next queued item with a different domain than currently active crawls
      let chosenIndex = serverCrawlQueue.findIndex((item) => {
        const s = sites.find((site) => site.id === item.siteId);
        const domain = s?.domain?.toLowerCase() || (s?.url ? new URL(s.url).hostname.toLowerCase() : "");
        return domain && !runningDomains.has(domain);
      });

      if (chosenIndex === -1) {
        chosenIndex = 0;
      }

      const [next] = serverCrawlQueue.splice(chosenIndex, 1);
      const site = sites.find((s) => s.id === next.siteId);
      let domain = site?.domain?.toLowerCase() || "";
      if (!domain && site?.url) {
        try {
          domain = new URL(site.url).hostname.toLowerCase();
        } catch {}
      }

      activeCrawlingSiteIds.add(next.siteId);
      if (domain) {
        activeCrawlingDomains.set(next.siteId, domain);
      }

      if (site) {
        site.status = "crawling";
        site.logs.push({
          timestamp: new Date().toISOString(),
          message: "Crawling started by oxylow-search bot from crawl queue.",
          level: "info",
        });
        saveSites(sites);
      }

      // Launch async crawl for this slot
      (async () => {
        try {
          await crawlSite(next.siteId, next.maxPages);
        } catch (err: any) {
          console.error(`Error processing crawl for site ${next.siteId}:`, err);
        } finally {
          activeCrawlingSiteIds.delete(next.siteId);
          activeCrawlingDomains.delete(next.siteId);
          activeCrawlAbortControllers.delete(next.siteId);
          processNextInQueue().catch(console.error);
        }
      })();
    }
  } finally {
    isCrawlerProcessing = false;
    if (activeCrawlingSiteIds.size < MAX_CONCURRENT_CRAWLS && serverCrawlQueue.length > 0) {
      processNextInQueue().catch(console.error);
    }
  }
}

/**
 * Removes a site from the pending crawl queue or cancels it if currently crawling.
 */
export function removeFromCrawlQueue(siteId: string): void {
  const idx = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (idx !== -1) {
    serverCrawlQueue.splice(idx, 1);
  }
  if (activeCrawlingSiteIds.has(siteId)) {
    const controller = activeCrawlAbortControllers.get(siteId);
    if (controller) {
      controller.abort();
      activeCrawlAbortControllers.delete(siteId);
    }
    activeCrawlingSiteIds.delete(siteId);
    activeCrawlingDomains.delete(siteId);
    processNextInQueue().catch(console.error);
  }
}

/**
 * Clears the crawl queue (for test cleanup).
 */
export function clearCrawlQueue(): void {
  for (const controller of activeCrawlAbortControllers.values()) {
    controller.abort();
  }
  activeCrawlAbortControllers.clear();
  activeCrawlingSiteIds.clear();
  activeCrawlingDomains.clear();

  if (saveSitesTimeout) {
    clearTimeout(saveSitesTimeout);
    saveSitesTimeout = null;
  }
  if (saveIndexTimeout) {
    clearTimeout(saveIndexTimeout);
    saveIndexTimeout = null;
  }
  cachedSites = null;
  cachedIndex = null;
  isWritingSites = false;
  pendingSitesWrite = false;
  isWritingIndex = false;
  pendingIndexWrite = false;
  for (const timer of scheduledBatchTimers.values()) {
    clearTimeout(timer);
  }
  scheduledBatchTimers.clear();
  domainLastRequestTime.clear();
  robotsCache.clear();
  serverCrawlQueue.length = 0;
  isCrawlerProcessing = false;
  BATCH_CRAWL_DELAY_MS = 0;
  DEFAULT_DOMAIN_DELAY_MS = 1000;
}

export function getCurrentCrawlingSiteId(): string | null {
  return activeCrawlingSiteIds.values().next().value || null;
}

export function getCrawlQueueLength(): number {
  return activeCrawlingSiteIds.size + serverCrawlQueue.length;
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


function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWordOccurrences(text: string, word: string): number {
  if (!text || !word) return 0;
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function getWordStems(word: string): string[] {
  const clean = word.toLowerCase().trim();
  const stems = [clean];
  if (clean.endsWith("ies") && clean.length > 4) {
    stems.push(clean.slice(0, -3) + "y");
  } else if (clean.endsWith("es") && clean.length > 3) {
    stems.push(clean.slice(0, -2));
    stems.push(clean.slice(0, -1));
  } else if (clean.endsWith("s") && clean.length > 2) {
    stems.push(clean.slice(0, -1));
  } else if (clean.endsWith("ing") && clean.length > 4) {
    stems.push(clean.slice(0, -3));
  } else if (clean.endsWith("ed") && clean.length > 3) {
    stems.push(clean.slice(0, -2));
    stems.push(clean.slice(0, -1));
  }
  return Array.from(new Set(stems));
}

/**
 * Searches the oxylow search index with high accuracy relevance scoring.
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
      title: decodeHtmlEntities(item.title),
      description: decodeHtmlEntities(item.description),
      bodyPreview: decodeHtmlEntities(item.bodyPreview),
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
      const lowerUrl = (item.url || "").toLowerCase();

      // Full phrase matching
      if (lowerTitle === trimmed) {
        score += 350;
      } else if (lowerTitle.startsWith(trimmed)) {
        score += 200;
      } else if (countWordOccurrences(lowerTitle, trimmed) > 0 || lowerTitle.includes(trimmed)) {
        score += 150;
      }

      if (lowerDomain === trimmed || lowerDomain.startsWith(trimmed + ".")) {
        score += 140;
      } else if (lowerDomain.includes(trimmed)) {
        score += 60;
      }

      if (lowerUrl.includes(trimmed)) {
        score += 40;
      }

      if (countWordOccurrences(lowerDesc, trimmed) > 0 || lowerDesc.includes(trimmed)) {
        score += 50;
      }

      // Per-term whole-word and stem relevance scoring
      let matchedTermsCount = 0;

      for (const term of queryTerms) {
        const stems = getWordStems(term);
        let termFoundOnPage = false;

        let titleMatches = 0;
        let headingMatches = 0;
        let keywordMatches = 0;
        let descMatches = 0;
        let bodyMatches = 0;

        for (const stem of stems) {
          titleMatches += countWordOccurrences(lowerTitle, stem);
          headingMatches += countWordOccurrences(lowerHeadings, stem);
          keywordMatches += countWordOccurrences(lowerKeywords, stem);
          descMatches += countWordOccurrences(lowerDesc, stem);
          bodyMatches += countWordOccurrences(lowerBody, stem);
        }

        if (titleMatches > 0) {
          score += Math.min(titleMatches, 3) * 60;
          termFoundOnPage = true;
        }

        if (lowerDomain.includes(term)) {
          score += 40;
          termFoundOnPage = true;
        }

        if (headingMatches > 0) {
          score += Math.min(headingMatches, 3) * 30;
          termFoundOnPage = true;
        }

        if (keywordMatches > 0) {
          score += Math.min(keywordMatches, 3) * 35;
          termFoundOnPage = true;
        }

        if (descMatches > 0) {
          score += Math.min(descMatches, 3) * 20;
          termFoundOnPage = true;
        }

        if (bodyMatches > 0) {
          score += Math.min(bodyMatches, 5) * 4;
          termFoundOnPage = true;
        }

        if (termFoundOnPage) {
          matchedTermsCount++;
        }
      }

      // Multi-term coverage bonus
      if (queryTerms.length > 1 && matchedTermsCount === queryTerms.length) {
        score += 100;
      }

      return {
        url: item.url,
        domain: item.domain,
        title: decodeHtmlEntities(item.title),
        description: decodeHtmlEntities(item.description),
        bodyPreview: decodeHtmlEntities(item.bodyPreview),
        favicon: item.favicon,
        score,
        indexedAt: item.indexedAt,
      };
    })
    .filter((res) => res.score > 0)
    .sort((a, b) => b.score - a.score);

  // Filter so domains can only appear once in search results, retaining highest-scoring page for each domain
  const uniqueScored = deduplicateByDomain(scored);

  const total = uniqueScored.length;
  const start = (page - 1) * pageSize;
  const results = uniqueScored.slice(start, start + pageSize);

  return { results, total };
}

/**
 * Autocomplete suggestions for Omnibox with prefix and relevance prioritization.
 */
export function getOxylowSuggestions(query: string, limit = 6): { title: string; url: string }[] {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const matched: { title: string; url: string; score: number }[] = [];
  const seenDomains = new Set<string>();

  for (const item of index) {
    const lowerTitle = (item.title || "").toLowerCase();
    const lowerUrl = (item.url || "").toLowerCase();
    const lowerDomain = (item.domain || "").toLowerCase();

    let score = 0;
    if (lowerTitle.startsWith(trimmed)) score += 100;
    else if (lowerTitle.includes(trimmed)) score += 50;

    if (lowerDomain.startsWith(trimmed)) score += 80;
    else if (lowerDomain.includes(trimmed)) score += 40;

    if (lowerUrl.includes(trimmed)) score += 20;

    if (score > 0) {
      if (lowerDomain && !seenDomains.has(lowerDomain)) {
        seenDomains.add(lowerDomain);
        matched.push({
          title: decodeHtmlEntities(item.title),
          url: item.url,
          score,
        });
      }
    }
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, limit).map(({ title, url }) => ({ title, url }));
}
