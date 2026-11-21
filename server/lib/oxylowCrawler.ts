import { fetchPublicUrl } from "./publicFetch.ts";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup, resolveTxt } from "node:dns/promises";
import { isPrivateIP, assertPublicHostname } from "./safeAiUrl.ts";
import { removeHtmlElementBlocks, stripHtmlTags } from "./htmlText.ts";

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
const MAX_SITEMAP_DEPTH = 5;

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
  /** Normalized body text used for relevance scoring (kept separate from the short display preview). */
  bodyText?: string;
  wordCount?: number;
  lang?: string;
  contentHash?: string;
  favicon?: string;
  indexedAt: string;
}

export interface SearchResult {
  url: string;
  domain: string;
  title: string;
  description: string;
  bodyPreview: string;
  /** A short excerpt around the best matching term, when available. */
  snippet?: string;
  /** Terms (original or stemmed) that appear in the snippet, for safe client-side highlighting. */
  matchedTerms?: string[];
  favicon?: string;
  score: number;
  indexedAt: string;
}

export interface SearchOptions {
  /** Maximum number of results allowed from the same registrable domain. Defaults to 1. */
  perDomainLimit?: number;
  /** When false, snippets are not generated. Defaults to true. */
  includeSnippet?: boolean;
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
// Bumped whenever the index changes so derived search structures can be rebuilt.
let indexRevision = 0;
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
  indexRevision++;
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

    const res = await fetchPublicUrl(robotsUrl, {
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

interface ParseSitemapOptions {
  /** Optional robots.txt check applied to this sitemap and nested sitemaps. */
  isAllowed?: (url: URL) => boolean;
  visited?: Set<string>;
  depth?: number;
  maxPages?: number;
}

/**
 * Parses XML sitemap to discover page URLs.
 * Sitemap index files are followed recursively so nested sitemaps are parsed
 * instead of being queued as if they were HTML pages.
 */
export async function parseSitemap(
  sitemapUrl: string,
  domain: string,
  crawlDelayMs: number,
  options: ParseSitemapOptions = {}
): Promise<string[]> {
  const visited = options.visited ?? new Set<string>();
  const depth = options.depth ?? 0;
  const maxPages = options.maxPages ?? MAX_SITE_INDEX_PAGES;

  if (depth > MAX_SITEMAP_DEPTH || visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  try {
    const sitemapTarget = new URL(sitemapUrl);
    if (options.isAllowed && !options.isAllowed(sitemapTarget)) return [];

    await waitForDomainSlot(domain, crawlDelayMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetchPublicUrl(sitemapUrl, {
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
    const locations: string[] = [];
    const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      const loc = match[1].trim();
      if (loc && !locations.includes(loc)) {
        locations.push(loc);
      }
    }

    // A sitemap index points to other sitemaps, not pages. Follow each child
    // sitemap recursively and collect the page URLs it contains.
    if (/<sitemapindex[\s>]/i.test(xml)) {
      const discoveredUrls = new Set<string>();
      for (const childSitemap of locations) {
        if (discoveredUrls.size >= maxPages) break;
        const childUrls = await parseSitemap(childSitemap, domain, crawlDelayMs, {
          isAllowed: options.isAllowed,
          visited,
          depth: depth + 1,
          maxPages,
        });
        for (const url of childUrls) {
          if (discoveredUrls.size >= maxPages) break;
          discoveredUrls.add(url);
        }
      }
      return [...discoveredUrls];
    }

    return locations.slice(0, maxPages);
  } catch {
    // Ignore sitemap fetch/parse errors
    return [];
  }
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

  let cleaned = removeHtmlElementBlocks(safeHtml, [
    "script",
    "style",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "menu",
    "form",
    "iframe",
  ]);

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
  bodyText: string;
  wordCount: number;
  lang?: string;
  favicon?: string;
  links: string[];
} {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].trim());
  }

  let lang: string | undefined;
  const langMatch = html.match(/<html[^>]*\blang=["']([^"']+)["']/i);
  if (langMatch) {
    lang = langMatch[1].trim().toLowerCase().slice(0, 20) || undefined;
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
    const cleanHeading = decodeHtmlEntities(stripHtmlTags(hMatch[1]).trim());
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
    removeHtmlElementBlocks(safeHtml, [
      "script",
      "style",
      "nav",
      "footer",
      "header",
    ])
      .replace(/<\/(?:p|div|section|article|h[1-6]|li)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  // Keep a longer body for ranking (the index stores it compressed as JSON),
  // while retaining a short preview for display and older consumers.
  const bodyText = cleanBody.slice(0, 8000);
  const bodyPreview = bodyText.slice(0, 300);
  const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;
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
    bodyText,
    wordCount,
    lang,
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
          const sitemapUrls = await parseSitemap(sitemapTarget, domain, robots.crawlDelayMs, {
            isAllowed: (target) => isPathAllowed(target.pathname, robots),
          });
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

        const res = await fetchPublicUrl(currentUrl, {
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
          bodyText: extracted.bodyText,
          wordCount: extracted.wordCount,
          lang: extracted.lang,
          contentHash: crypto.createHash("sha1").update(html).digest("hex"),
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

// Function words add noise to relevance scoring, so they are not used as query terms.
const SEARCH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "had", "has", "have", "he", "her", "here",
  "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my",
  "no", "not", "of", "on", "or", "our", "out", "she", "should", "so", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "to", "too", "up", "us", "very", "was", "we", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your",
  // Common function words in the other supported languages.
  "de", "la", "le", "les", "el", "en", "y", "un", "una", "der", "die", "das",
  "und", "ist", "von", "zu", "den", "des", "du", "et", "est", "une", "los",
  "las", "por", "para", "con", "il", "lo", "gli", "di", "da", "su", "per",
]);

const SEARCH_FIELD_WEIGHTS = {
  title: 3,
  headings: 2.5,
  keywords: 2.5,
  description: 1.5,
  body: 1,
  url: 1.5,
  domain: 2,
};
const BM25_K1 = 1.2;
const BM25_B = 0.75;

function normalizeSearchText(value: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase();
}

function tokenizeSearchText(value: string): string[] {
  const matches = normalizeSearchText(value).match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.filter((token) => token.length <= 64) : [];
}

const STEM_EXCEPTIONS = new Set([
  "news",
  "series",
  "species",
  "analysis",
  "basis",
  "crisis",
  "thesis",
]);

/**
 * Conservative stemming: only handle plurals and possessives. Aggressive
 * suffix stripping (e.g. turning "this" into "thi") causes false positives.
 */
function stemSearchTerm(term: string): string {
  const clean = normalizeSearchText(term);
  if (clean.length <= 2) return clean;
  if (STEM_EXCEPTIONS.has(clean)) return clean;
  if (clean.endsWith("'s")) return clean.slice(0, -2);
  if (clean.endsWith("ies") && clean.length > 4) return clean.slice(0, -1);
  if (clean.endsWith("sses") && clean.length > 5) return clean.slice(0, -2);
  if (/(?:ses|xes|zes|ches|shes)$/.test(clean) && clean.length > 4) return clean.slice(0, -2);
  if (clean.endsWith("s") && !/(?:ss|us|is)$/.test(clean) && clean.length > 3) {
    return clean.slice(0, -1);
  }
  return clean;
}

/**
 * Generates the plural variants that are worth indexing for a token. Keeping
 * both "cities" -> "city" and "movies" -> "movie" avoids choosing one rule
 * that silently breaks a whole class of words.
 */
function stemVariants(term: string): string[] {
  const clean = normalizeSearchText(term);
  const variants = new Set<string>([stemSearchTerm(clean)]);
  if (clean.endsWith("ies") && clean.length > 4) {
    variants.add(clean.slice(0, -3) + "y");
  } else if (clean.endsWith("es") && clean.length > 3) {
    variants.add(clean.slice(0, -2));
  }
  return Array.from(variants).filter(Boolean);
}

function stemSearchTokens(tokens: string[]): string[] {
  return tokens.flatMap(stemVariants);
}

function countSearchTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

interface SearchDoc {
  page: IndexedPage;
  title: Map<string, number>;
  headings: Map<string, number>;
  keywords: Map<string, number>;
  description: Map<string, number>;
  body: Map<string, number>;
  url: Map<string, number>;
  domain: Map<string, number>;
  titleTokens: string[];
  bodyTokens: string[];
  bodyLength: number;
}

interface SearchStats {
  index: IndexedPage[];
  revision: number;
  docs: SearchDoc[];
  documentFrequency: Map<string, number>;
  averageBodyLength: number;
}

let searchStatsCache: SearchStats | null = null;

function buildSearchDoc(page: IndexedPage): SearchDoc {
  const titleTokens = stemSearchTokens(tokenizeSearchText(page.title || ""));
  const headingTokens = stemSearchTokens(tokenizeSearchText((page.headings || []).join(" ")));
  const keywordTokens = stemSearchTokens(tokenizeSearchText((page.keywords || []).join(" ")));
  const descriptionTokens = stemSearchTokens(tokenizeSearchText(page.description || ""));
  const bodyTokens = stemSearchTokens(tokenizeSearchText(page.bodyText || page.bodyPreview || ""));
  const urlTokens = stemSearchTokens(tokenizeSearchText(page.url || ""));
  const domainTokens = stemSearchTokens(tokenizeSearchText(page.domain || ""));

  return {
    page,
    titleTokens,
    bodyTokens,
    bodyLength: bodyTokens.length,
    title: countSearchTokens(titleTokens),
    headings: countSearchTokens(headingTokens),
    keywords: countSearchTokens(keywordTokens),
    description: countSearchTokens(descriptionTokens),
    body: countSearchTokens(bodyTokens),
    url: countSearchTokens(urlTokens),
    domain: countSearchTokens(domainTokens),
  };
}

function getSearchStats(index: IndexedPage[]): SearchStats {
  if (
    searchStatsCache &&
    searchStatsCache.index === index &&
    searchStatsCache.revision === indexRevision
  ) {
    return searchStatsCache;
  }

  const docs = index.map(buildSearchDoc);
  const documentFrequency = new Map<string, number>();
  let totalBodyLength = 0;

  for (const doc of docs) {
    totalBodyLength += doc.bodyLength;
    const seen = new Set<string>();
    for (const field of [
      doc.title,
      doc.headings,
      doc.keywords,
      doc.description,
      doc.body,
      doc.url,
      doc.domain,
    ]) {
      for (const term of field.keys()) seen.add(term);
    }
    for (const term of seen) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  searchStatsCache = {
    index,
    revision: indexRevision,
    docs,
    documentFrequency,
    averageBodyLength: docs.length ? Math.max(1, totalBodyLength / docs.length) : 1,
  };
  return searchStatsCache;
}

interface ParsedSearchQuery {
  cleaned: string;
  terms: string[];
  displayTerms: string[];
  phrase: string | null;
  siteFilter: string | null;
  titleTerms: string[];
  excluded: string[];
}

function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  let working = rawQuery.trim();
  let siteFilter: string | null = null;
  const titleTerms: string[] = [];
  const excluded: string[] = [];
  let phrase: string | null = null;

  const siteMatch = working.match(/\bsite:([^\s]+)/i);
  if (siteMatch) {
    siteFilter = normalizeSearchText(siteMatch[1])
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .replace(/^www\./, "");
    working = working.replace(siteMatch[0], " ");
  }

  working = working.replace(/\bintitle:([^\s]+)/gi, (_match, term: string) => {
    titleTerms.push(normalizeSearchText(term));
    return " ";
  });

  working = working.replace(/(^|\s)-([^\s]+)/g, (_match, prefix: string, term: string) => {
    if (term.length > 0) excluded.push(normalizeSearchText(term));
    return prefix;
  });

  const quoted = working.match(/"([^"]+)"/);
  if (quoted) {
    phrase = normalizeSearchText(quoted[1]).trim() || null;
    working = working.replace(quoted[0], " ");
  }

  const allTokens = tokenizeSearchText(working);
  const meaningful = allTokens.filter((token) => !SEARCH_STOPWORDS.has(token));
  let displayTerms = Array.from(new Set(meaningful.length ? meaningful : allTokens));
  if (displayTerms.length === 0 && phrase) {
    displayTerms = Array.from(new Set(tokenizeSearchText(phrase)));
  }
  const terms = Array.from(new Set(displayTerms.map(stemSearchTerm))).filter(Boolean);

  if (!phrase && displayTerms.length > 1) {
    phrase = displayTerms.join(" ");
  }

  return {
    cleaned: displayTerms.join(" "),
    terms,
    displayTerms,
    phrase,
    siteFilter,
    titleTerms: titleTerms.map(stemSearchTerm).filter(Boolean),
    excluded: excluded.map(stemSearchTerm).filter(Boolean),
  };
}

function countFieldTokens(field: Map<string, number>, term: string): number {
  return field.get(term) || 0;
}

function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function tokenProximityBonus(tokens: string[], terms: string[]): number {
  if (tokens.length === 0 || terms.length < 2) return 0;
  let bonus = 0;
  for (let i = 0; i < terms.length - 1; i++) {
    const first = terms[i];
    const second = terms[i + 1];
    let lastFirst = -1;
    let closest = Infinity;
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index] === first) {
        lastFirst = index;
      } else if (tokens[index] === second && lastFirst >= 0) {
        closest = Math.min(closest, index - lastFirst);
      }
    }
    if (closest <= 8) bonus += 1 / closest;
  }
  return bonus;
}

function scoreSearchDoc(
  doc: SearchDoc,
  parsed: ParsedSearchQuery,
  stats: SearchStats
): number {
  const page = doc.page;
  const normalizedDomain = normalizeSearchText(page.domain || "");

  if (parsed.siteFilter) {
    if (
      normalizedDomain !== parsed.siteFilter &&
      !normalizedDomain.endsWith("." + parsed.siteFilter)
    ) {
      return 0;
    }
  }

  for (const excluded of parsed.excluded) {
    if (
      doc.title.has(excluded) ||
      doc.headings.has(excluded) ||
      doc.keywords.has(excluded) ||
      doc.description.has(excluded) ||
      doc.body.has(excluded) ||
      doc.url.has(excluded) ||
      doc.domain.has(excluded)
    ) {
      return 0;
    }
  }

  for (const titleTerm of parsed.titleTerms) {
    if (!doc.title.has(titleTerm)) return 0;
  }

  if (parsed.terms.length === 0) return 0;

  let score = 0;
  let matchedTerms = 0;
  const documentLength = Math.max(1, doc.bodyLength);
  const lengthNormalization = documentLength / stats.averageBodyLength;

  for (const term of parsed.terms) {
    const tf =
      SEARCH_FIELD_WEIGHTS.title * countFieldTokens(doc.title, term) +
      SEARCH_FIELD_WEIGHTS.headings * countFieldTokens(doc.headings, term) +
      SEARCH_FIELD_WEIGHTS.keywords * countFieldTokens(doc.keywords, term) +
      SEARCH_FIELD_WEIGHTS.description * countFieldTokens(doc.description, term) +
      SEARCH_FIELD_WEIGHTS.body * countFieldTokens(doc.body, term) +
      SEARCH_FIELD_WEIGHTS.url * countFieldTokens(doc.url, term) +
      SEARCH_FIELD_WEIGHTS.domain * countFieldTokens(doc.domain, term);

    if (tf <= 0) continue;

    const df = stats.documentFrequency.get(term) || 1;
    const idf = Math.log(1 + (stats.docs.length - df + 0.5) / (df + 0.5));
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * lengthNormalization);
    score += idf * ((tf * (BM25_K1 + 1)) / denominator);
    matchedTerms++;
  }

  if (matchedTerms === 0) return 0;
  if (parsed.terms.length > 1 && matchedTerms < Math.ceil(parsed.terms.length / 2)) {
    return 0;
  }

  // A partial match should rank below a full match.
  score *= 0.55 + 0.45 * (matchedTerms / parsed.terms.length);

  // Navigational intent: exact domain/title matches win.
  if (parsed.cleaned) {
    const normalizedTitle = normalizeSearchText(page.title || "");
    if (normalizedTitle === parsed.cleaned) score += 120;
    else if (normalizedTitle.startsWith(parsed.cleaned)) score += 35;

    if (
      normalizedDomain === parsed.cleaned ||
      normalizedDomain === `www.${parsed.cleaned}` ||
      normalizedDomain.startsWith(parsed.cleaned + ".")
    ) {
      score += 90;
    }
  }

  // Phrase and proximity bonuses.
  const phraseTokens = parsed.phrase
    ? tokenizeSearchText(parsed.phrase).map(stemSearchTerm)
    : [];
  if (phraseTokens.length > 1) {
    if (containsTokenSequence(doc.titleTokens, phraseTokens)) score += 45;
    if (containsTokenSequence(doc.bodyTokens, phraseTokens)) score += 20;
  }
  if (parsed.terms.length > 1) {
    score += tokenProximityBonus(doc.titleTokens, parsed.terms) * 12;
    score += tokenProximityBonus(doc.bodyTokens, parsed.terms) * 6;
  }

  // Freshness is a gentle tie-breaker; it must not outrank relevance.
  const indexedAt = Date.parse(page.indexedAt);
  if (Number.isFinite(indexedAt)) {
    const ageDays = Math.max(0, (Date.now() - indexedAt) / 86_400_000);
    score *= 1 + 0.06 * Math.exp(-ageDays / 120);
  }

  // Small quality signals.
  if (page.description && page.description !== "No description provided.") score *= 1.01;
  if (page.wordCount && page.wordCount > 80) score *= 1.01;

  return score;
}

function editDistanceWithin(left: string, right: string, maxDistance: number): number {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previous = new Array<number>(right.length + 1);
  let current = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j++) previous[j] = j;

  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    let rowMinimum = current[0];
    for (let j = 1; j <= right.length; j++) {
      const substitution = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitution
      );
      if (current[j] < rowMinimum) rowMinimum = current[j];
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[right.length];
}

function findTypoCorrection(
  parsed: ParsedSearchQuery,
  documentFrequency: Map<string, number>
): { from: string; to: string } | null {
  for (const term of parsed.terms) {
    if ((documentFrequency.get(term) || 0) > 0) continue;
    if (term.length < 4) continue;

    let bestTerm: string | null = null;
    let bestFrequency = 0;
    for (const [candidate, frequency] of documentFrequency) {
      if (frequency <= bestFrequency) continue;
      if (candidate.length < 3 || Math.abs(candidate.length - term.length) > 1) continue;
      if (candidate[0] !== term[0]) continue;
      if (editDistanceWithin(term, candidate, 1) > 1) continue;
      bestTerm = candidate;
      bestFrequency = frequency;
    }
    if (bestTerm) return { from: term, to: bestTerm };
  }
  return null;
}

function buildSearchSnippet(
  page: IndexedPage,
  terms: string[],
  displayTerms: string[]
): { snippet: string; matchedTerms: string[] } {
  const source = decodeHtmlEntities(
    (page.bodyText || page.bodyPreview || page.description || "").replace(/\s+/g, " ").trim()
  );
  if (!source) {
    return {
      snippet: decodeHtmlEntities(page.description || page.bodyPreview || ""),
      matchedTerms: [],
    };
  }

  // Full NFKD normalization can change string length (e.g. accented letters),
  // so only use it for indexing when it preserves offsets; otherwise fall back
  // to a plain lowercase copy.
  const normalizedSource = normalizeSearchText(source);
  const loweredSource = source.toLowerCase();
  const searchableSource =
    normalizedSource.length === loweredSource.length ? normalizedSource : loweredSource;

  let firstMatch = -1;
  for (const term of terms) {
    if (term.length < 2) continue;
    const index = searchableSource.indexOf(term);
    if (index !== -1 && (firstMatch === -1 || index < firstMatch)) firstMatch = index;
  }
  if (firstMatch === -1) firstMatch = 0;

  const radius = 120;
  let start = Math.max(0, firstMatch - radius);
  if (start > 0) {
    const nextSpace = source.indexOf(" ", start);
    if (nextSpace !== -1 && nextSpace < firstMatch) start = nextSpace + 1;
  }

  let end = Math.min(source.length, firstMatch + radius + 80);
  if (end < source.length) {
    const previousSpace = source.lastIndexOf(" ", end);
    if (previousSpace > firstMatch) end = previousSpace;
  }

  let snippet = source.slice(start, end).trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < source.length) snippet += "…";

  const normalizedSnippet = normalizeSearchText(snippet);
  const matchedTerms = new Set<string>();
  for (const term of [...displayTerms, ...terms]) {
    if (term.length < 2) continue;
    if (normalizedSnippet.includes(term)) matchedTerms.add(term);
  }

  return { snippet, matchedTerms: Array.from(matchedTerms).slice(0, 10) };
}

function dedupeByDomain<T>(
  items: T[],
  getDomain: (item: T) => string,
  perDomainLimit: number
): T[] {
  const counts = new Map<string, number>();
  const result: T[] = [];
  for (const item of items) {
    const domain = (getDomain(item) || "").toLowerCase();
    if (!domain) {
      result.push(item);
      continue;
    }
    const count = counts.get(domain) || 0;
    if (count >= perDomainLimit) continue;
    counts.set(domain, count + 1);
    result.push(item);
  }
  return result;
}

/**
 * Searches the oxylow search index with field-aware BM25-style relevance scoring.
 */
export function searchOxylowIndex(
  query: string,
  page = 1,
  pageSize = 10,
  options: SearchOptions = {}
): { results: SearchResult[]; total: number; suggestion?: string } {
  const safePage = Math.max(1, Math.min(1000, Number.isFinite(page) ? Math.floor(page) : 1));
  const safePageSize = Math.max(
    1,
    Math.min(50, Number.isFinite(pageSize) ? Math.floor(pageSize) : 10)
  );
  const perDomainLimit = Math.max(
    1,
    Math.min(10, Math.floor(options.perDomainLimit ?? 1))
  );
  const includeSnippet = options.includeSnippet !== false;
  const index = getIndex();
  const trimmed = query.trim();

  if (!trimmed) {
    const ranked = index
      .map((item, position) => ({ item, position }))
      .sort((a, b) => {
        const aTime = Date.parse(a.item.indexedAt) || 0;
        const bTime = Date.parse(b.item.indexedAt) || 0;
        return bTime - aTime || a.position - b.position;
      })
      .map((entry) => entry.item);

    const deduped = dedupeByDomain(ranked, (item) => item.domain, perDomainLimit);
    const start = (safePage - 1) * safePageSize;
    const pageItems = deduped.slice(start, start + safePageSize);

    return {
      results: pageItems.map((item) => ({
        url: item.url,
        domain: item.domain,
        title: decodeHtmlEntities(item.title),
        description: decodeHtmlEntities(item.description),
        bodyPreview: decodeHtmlEntities(item.bodyPreview),
        snippet: includeSnippet
          ? decodeHtmlEntities(item.description || item.bodyPreview)
          : undefined,
        matchedTerms: [],
        favicon: item.favicon,
        score: 1,
        indexedAt: item.indexedAt,
      })),
      total: deduped.length,
    };
  }

  const stats = getSearchStats(index);
  const parsed = parseSearchQuery(trimmed);
  if (parsed.terms.length === 0) {
    return { results: [], total: 0 };
  }

  let suggestion: string | undefined;
  const correction = findTypoCorrection(parsed, stats.documentFrequency);
  if (correction) {
    parsed.terms = Array.from(
      new Set(parsed.terms.map((term) => (term === correction.from ? correction.to : term)))
    );
    suggestion = parsed.displayTerms
      .map((term) => (stemSearchTerm(term) === correction.from ? correction.to : term))
      .join(" ")
      .trim();
  }

  const scored = stats.docs
    .map((doc) => ({ doc, score: scoreSearchDoc(doc, parsed, stats) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = Date.parse(a.doc.page.indexedAt) || 0;
      const bTime = Date.parse(b.doc.page.indexedAt) || 0;
      return bTime - aTime || a.doc.page.title.localeCompare(b.doc.page.title);
    });

  const deduped = dedupeByDomain(scored, (entry) => entry.doc.page.domain, perDomainLimit);
  const start = (safePage - 1) * safePageSize;
  const pageEntries = deduped.slice(start, start + safePageSize);

  const results: SearchResult[] = pageEntries.map(({ doc, score }) => {
    const item = doc.page;
    const snippetData = includeSnippet
      ? buildSearchSnippet(item, parsed.terms, parsed.displayTerms)
      : { snippet: undefined as string | undefined, matchedTerms: [] as string[] };

    return {
      url: item.url,
      domain: item.domain,
      title: decodeHtmlEntities(item.title),
      description: decodeHtmlEntities(item.description),
      bodyPreview: decodeHtmlEntities(item.bodyPreview),
      snippet: snippetData.snippet,
      matchedTerms: snippetData.matchedTerms,
      favicon: item.favicon,
      score,
      indexedAt: item.indexedAt,
    };
  });

  return {
    results,
    total: deduped.length,
    suggestion:
      suggestion && suggestion !== parsed.displayTerms.join(" ") ? suggestion : undefined,
  };
}

/**
 * Autocomplete suggestions for the Omnibox with prefix, keyword and fuzzy matching.
 */
export function getOxylowSuggestions(query: string, limit = 6): { title: string; url: string }[] {
  const index = getIndex();
  const normalized = normalizeSearchText(query.trim());
  if (!normalized) return [];

  const queryTokens = tokenizeSearchText(normalized);
  const matched: { title: string; url: string; domain: string; score: number }[] = [];

  for (const item of index) {
    const title = normalizeSearchText(item.title || "");
    const domain = normalizeSearchText(item.domain || "");
    const url = normalizeSearchText(item.url || "");
    const headings = normalizeSearchText((item.headings || []).join(" "));
    const keywords = normalizeSearchText((item.keywords || []).join(" "));
    let score = 0;

    if (title === normalized) score += 200;
    else if (title.startsWith(normalized)) score += 120;
    else if (title.includes(normalized)) score += 60;

    if (domain === normalized || domain.startsWith(normalized + ".")) score += 150;
    else if (domain.includes(normalized)) score += 70;

    if (url.includes(normalized)) score += 25;
    if (keywords.includes(normalized)) score += 45;
    if (headings.includes(normalized)) score += 30;

    for (const token of queryTokens) {
      if (token.length < 2) continue;
      const prefixPattern = new RegExp(`(^|[\\s\\-_/])${escapeRegex(token)}`, "i");
      if (prefixPattern.test(title)) score += 25;
      if (prefixPattern.test(keywords)) score += 15;
    }

    if (score > 0) {
      matched.push({
        title: decodeHtmlEntities(item.title),
        url: item.url,
        domain,
        score,
      });
    }
  }

  // If nothing matched exactly, fall back to a single small typo in the title.
  if (matched.length === 0 && normalized.length >= 4) {
    for (const item of index) {
      const titleTokens = tokenizeSearchText(item.title || "");
      for (const token of titleTokens) {
        if (token.length < 4 || token[0] !== normalized[0]) continue;
        if (editDistanceWithin(normalized, token, 1) > 1) continue;
        matched.push({
          title: decodeHtmlEntities(item.title),
          url: item.url,
          domain: normalizeSearchText(item.domain || ""),
          score: 10,
        });
        break;
      }
    }
  }

  matched.sort((a, b) => b.score - a.score);

  const seenDomains = new Set<string>();
  const results: { title: string; url: string }[] = [];
  const safeLimit = Math.max(1, Math.min(10, limit));
  for (const item of matched) {
    if (item.domain && seenDomains.has(item.domain)) continue;
    if (item.domain) seenDomains.add(item.domain);
    results.push({ title: item.title, url: item.url });
    if (results.length >= safeLimit) break;
  }
  return results;
}