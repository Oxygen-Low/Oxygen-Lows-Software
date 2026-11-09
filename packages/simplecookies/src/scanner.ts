import type {
  CookieCategory,
  CookieDeclarationEntry,
  ScanResult,
  ScanResultCookie,
} from "./types.js";

export type { ScanResult } from "./types.js";

export interface KnownTracker {
  /** Substrings matched against script srcs / html (lowercased). */
  match: string[];
  provider: string;
  category: Exclude<CookieCategory, "necessary"> | "necessary";
  cookies: Array<{ name: string; purpose: string; expiry: string }>;
}

/**
 * Static tracker database. Patterns are trusted literals (never user input).
 * Used to infer JS-set cookies from third-party scripts without executing them.
 */
export const KNOWN_TRACKERS: KnownTracker[] = [
  {
    match: ["googletagmanager.com", "google-analytics.com", "gtag/js", "analytics.js"],
    provider: "Google Analytics",
    category: "statistics",
    cookies: [
      { name: "_ga", purpose: "Track unique visitors (GA4)", expiry: "2 years" },
      { name: "_gid", purpose: "Track unique visitors", expiry: "24 hours" },
      { name: "_gat", purpose: "Throttle requests to Google Analytics", expiry: "1 minute" },
      { name: "_ga_*", purpose: "Persist session state (GA4)", expiry: "2 years" },
    ],
  },
  {
    match: ["googlesyndication.com", "doubleclick.net", "adservice.google"],
    provider: "Google Ads",
    category: "marketing",
    cookies: [
      { name: "_gac_*", purpose: "Store campaign info for Google Ads", expiry: "90 days" },
      { name: "IDE", purpose: "Google Ads measurement", expiry: "13 months" },
    ],
  },
  {
    match: ["connect.facebook.net", "facebook.com/tr"],
    provider: "Meta Pixel",
    category: "marketing",
    cookies: [{ name: "_fbp", purpose: "Meta Pixel visitor ID", expiry: "3 months" }],
  },
  {
    match: ["static.hotjar.com", "script.hotjar.com"],
    provider: "Hotjar",
    category: "statistics",
    cookies: [
      { name: "_hjSession", purpose: "Hotjar session", expiry: "30 minutes" },
      { name: "_hjAbsoluteSessionInProgress", purpose: "Hotjar session flag", expiry: "30 minutes" },
    ],
  },
  {
    match: ["js.intercomcdn.com", "intercom.io"],
    provider: "Intercom",
    category: "preferences",
    cookies: [{ name: "intercom-id-*-*", purpose: "Intercom visitor ID", expiry: "9 months" }],
  },
  {
    match: ["js.stripe.com"],
    provider: "Stripe",
    category: "necessary",
    cookies: [{ name: "__stripe_mid", purpose: "Stripe fraud prevention", expiry: "1 year" }],
  },
  {
    match: ["bat.bing.com", "clarity.microsoft.com"],
    provider: "Microsoft Clarity",
    category: "statistics",
    cookies: [{ name: "_clck", purpose: "Clarity click tracking", expiry: "1 year" }],
  },
  {
    match: ["analytics.tiktok.com", "business-api.tiktok.com"],
    provider: "TikTok Pixel",
    category: "marketing",
    cookies: [{ name: "_ttp", purpose: "TikTok Pixel visitor ID", expiry: "13 months" }],
  },
  {
    match: ["snap.licdn.com", "linkedin-insight"],
    provider: "LinkedIn Insight",
    category: "marketing",
    cookies: [{ name: "li_sugr", purpose: "LinkedIn Insight user routing", expiry: "30 days" }],
  },
  {
    match: ["fonts.googleapis.com", "fonts.gstatic.com"],
    provider: "Google Fonts",
    category: "necessary",
    cookies: [],
  },
  {
    match: ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "ajax.googleapis.com"],
    provider: "CDN",
    category: "necessary",
    cookies: [],
  },
];

const MAX_HTML_CHARS = 2_000_000;
const MAX_JS_CHARS = 5_000_000;

export function extractScriptSrcs(html: string): string[] {
  const srcs: string[] = [];
  const slice = html.slice(0, MAX_HTML_CHARS);
  // Case-insensitive match but preserve original case (asset paths are case-sensitive).
  const re = /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null && srcs.length < 500) {
    srcs.push(m[1].trim());
  }
  return srcs;
}

export function extractInlineScripts(html: string): string[] {
  const bodies: string[] = [];
  const slice = html.slice(0, MAX_JS_CHARS);
  // Static pattern (never built from user input). Skip tags that have src=.
  const re = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null && bodies.length < 200) {
    const body = m[1].trim();
    if (body) bodies.push(body);
  }
  return bodies;
}

/**
 * Cookie names written via `document.cookie="name=..."`, `cookieStore.set("name")`,
 * `Cookies.set("name")` and `setCookie("name")` in JS text.
 */
export function extractDocumentCookieNames(jsText: string): string[] {
  const names = new Set<string>();
  const slice = jsText.slice(0, MAX_JS_CHARS);
  const patterns: RegExp[] = [
    /document\.cookie\s*=\s*["'`]([A-Za-z0-9_\-\.\[\]]+)=/g,
    /cookieStore\s*\.\s*set\(\s*["']([A-Za-z0-9_\-\.\[\]]+)["']/g,
    /\bCookies\s*\.\s*set\(\s*["']([A-Za-z0-9_\-\.\[\]]+)["']/g,
    /\bsetCookie\s*\(\s*["']([A-Za-z0-9_\-\.\[\]]+)["']/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null && names.size < 300) {
      const name = m[1].trim();
      if (name && name.length <= 120) names.add(name);
    }
  }
  return [...names];
}

/** Tracker whose cookie entry matches `name` (exact or wildcard prefix). */
export function trackerForCookieName(
  name: string,
): { tracker: KnownTracker; entry: KnownTracker["cookies"][number] } | null {
  const lower = name.toLowerCase();
  for (const tracker of KNOWN_TRACKERS) {
    for (const entry of tracker.cookies) {
      const expected = entry.name.toLowerCase();
      if (expected.includes("*")) {
        if (lower.startsWith(expected.replace("*", ""))) return { tracker, entry };
      } else if (lower === expected) {
        return { tracker, entry };
      }
    }
  }
  return null;
}

function inferCategory(name: string): CookieCategory {
  const lower = name.toLowerCase();
  if (
    lower.startsWith("_ga") ||
    lower.startsWith("_gid") ||
    lower.startsWith("_gat") ||
    lower.startsWith("_hj") ||
    lower.startsWith("_clck") ||
    lower.startsWith("_ym") ||
    lower.startsWith("_mk_") ||
    lower.startsWith("_fbp") ||
    lower.startsWith("_ttp") ||
    lower.startsWith("_gac") ||
    lower.startsWith("li_") ||
    lower === "ide" ||
    lower.startsWith("_pk_") ||
    lower.startsWith("_uetvid")
  ) {
    return "statistics";
  }
  if (
    lower.startsWith("fr") && name === "fr" ||
    lower.startsWith("_fb") ||
    lower.startsWith("cto") ||
    lower.startsWith("tt_") ||
    lower.startsWith("td_")
  ) {
    return "marketing";
  }
  return "necessary";
}

function inferPurpose(name: string): string {
  const lower = name.toLowerCase();
  if (
    /session|auth|token|csrf|xsrf|jwt|sid|login|_session/i.test(name) ||
    lower.endsWith("_session") ||
    lower === "phpsessid" ||
    lower.startsWith("jsessionid")
  ) {
    return "Authentication / session (auto-detected from JS)";
  }
  if (/^(theme|lang|locale|preferred|settings|consent|cookie_consent|simplecookies)/i.test(name)) {
    return "Preferences (auto-detected from JS)";
  }
  if (
    lower.startsWith("_ga") ||
    lower.startsWith("_gid") ||
    lower.startsWith("_gat") ||
    lower.startsWith("_hj") ||
    lower.startsWith("_clck") ||
    lower.startsWith("_ym") ||
    lower.startsWith("_pk_")
  ) {
    return "Analytics / statistics (auto-detected from JS)";
  }
  return "First-party cookie (auto-detected from JS)";
}

function firstPartyCookie(name: string, source: string): ScanResultCookie {
  const known = trackerForCookieName(name);
  if (known) {
    return {
      name,
      provider: known.tracker.provider,
      purpose: known.entry.purpose,
      expiry: known.entry.expiry,
      category: known.tracker.category,
      source,
    };
  }
  return {
    name,
    provider: "First-party (JS)",
    purpose: inferPurpose(name),
    expiry: "Session",
    category: inferCategory(name),
    source,
  };
}

/**
 * Scan a blob of JS/HTML text for tracker hosts, inline markers,
 * known cookie literals, and `document.cookie` writes.
 */
export function scanJsText(
  text: string,
  source: string = "js",
): { cookies: ScanResultCookie[]; trackers: string[] } {
  const cookies: ScanResultCookie[] = [];
  const trackers: string[] = [];
  const slice = text.slice(0, MAX_JS_CHARS);
  const lower = slice.toLowerCase();

  for (const tracker of KNOWN_TRACKERS) {
    if (tracker.match.some((p) => lower.includes(p.toLowerCase()))) {
      if (!trackers.includes(tracker.provider)) trackers.push(tracker.provider);
      for (const entry of tracker.cookies) {
        cookies.push({
          name: entry.name,
          provider: tracker.provider,
          purpose: entry.purpose,
          expiry: entry.expiry,
          category: tracker.category,
          source: "tracker",
        });
      }
    }
  }

  const inlineMarkers: Array<[string, string]> = [
    ["gtag(", "Google Analytics"],
    ["fbq(", "Meta Pixel"],
    ["hj(", "Hotjar"],
  ];
  for (const [marker, provider] of inlineMarkers) {
    if (lower.includes(marker) && !trackers.includes(provider)) {
      trackers.push(provider);
      const tracker = KNOWN_TRACKERS.find((x) => x.provider === provider);
      if (tracker) {
        for (const entry of tracker.cookies) {
          cookies.push({
            name: entry.name,
            provider: tracker.provider,
            purpose: entry.purpose,
            expiry: entry.expiry,
            category: tracker.category,
            source: "tracker",
          });
        }
      }
    }
  }

  for (const name of extractDocumentCookieNames(slice)) {
    cookies.push(firstPartyCookie(name, source));
  }

  // Known cookie names appearing as quoted literals (handles bundled code).
  for (const tracker of KNOWN_TRACKERS) {
    for (const entry of tracker.cookies) {
      if (entry.name.includes("*")) {
        const prefix = entry.name.split("*")[0];
        if (lower.includes(`${prefix}`)) {
          // Only add the wildcard entry when a quoted prefix literal exists.
          if (lower.includes(`"${prefix}`) || lower.includes(`'${prefix}`)) {
            cookies.push({
              name: entry.name,
              provider: tracker.provider,
              purpose: entry.purpose,
              expiry: entry.expiry,
              category: tracker.category,
              source: "js",
            });
          }
        }
      } else {
        const quoted = entry.name.toLowerCase();
        if (lower.includes(`"${quoted}"`) || lower.includes(`'${quoted}'`)) {
          cookies.push({
            name: entry.name,
            provider: tracker.provider,
            purpose: entry.purpose,
            expiry: entry.expiry,
            category: tracker.category,
            source: "js",
          });
        }
      }
    }
  }

  // Dedupe by name|provider (keep first).
  const seen = new Set<string>();
  return {
    cookies: cookies.filter((c) => {
      const key = `${c.name}|${c.provider}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    trackers,
  };
}

export function extractSetCookieNames(headers: Headers | Record<string, string>): string[] {
  const names = new Set<string>();
  const raw: string[] = [];
  if (typeof (headers as Headers).getSetCookie === "function") {
    raw.push(...(headers as Headers).getSetCookie());
  } else if (headers && typeof (headers as Headers).get === "function") {
    const v = (headers as Headers).get("set-cookie");
    if (v) raw.push(v);
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, string>)) {
      if (k.toLowerCase() === "set-cookie") raw.push(String(v));
    }
  }
  for (const line of raw) {
    for (const part of line.split(/,(?=\s*[a-zA-Z0-9_-]+=)/)) {
      const name = part.split("=")[0]?.trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

export function scanHtml(html: string, baseUrl: string, setCookieNames: string[] = []): ScanResult {
  const srcs = extractScriptSrcs(html);
  const cookies: ScanResultCookie[] = [];
  const trackers: string[] = [];
  const notes: string[] = [];

  const seen = new Set<string>();
  const addCookie = (c: ScanResultCookie) => {
    const key = `${c.name}|${c.provider}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cookies.push(c);
  };
  const addTrackers = (found: string[]) => {
    for (const t of found) {
      if (!trackers.includes(t)) trackers.push(t);
    }
  };
  const mergeJs = (found: { cookies: ScanResultCookie[]; trackers: string[] }) => {
    addTrackers(found.trackers);
    for (const c of found.cookies) addCookie(c);
  };

  // Whole HTML (covers script src URLs + inline snippets + writes).
  mergeJs(scanJsText(html, "html"));
  // Inline script bodies explicitly (defense in depth; dedupe handles overlap).
  for (const body of extractInlineScripts(html)) {
    mergeJs(scanJsText(body, "inline"));
  }

  // Server-set cookies from Set-Cookie headers.
  for (const name of setCookieNames) {
    if (!name || name.length > 120) continue;
    // First-party session-ish names are necessary by default; analytics ids are statistics.
    const isAnalytics = /^_g[ac]|^_hj|^_fbp|^_clck|^_ttp/i.test(name);
    addCookie({
      name,
      provider: "First-party",
      purpose: isAnalytics ? "Visitor tracking (auto-detected)" : "Session / preferences (auto-detected)",
      expiry: "Session",
      category: isAnalytics ? "statistics" : "necessary",
      source: "set-cookie",
    });
  }

  notes.push(
    "Static scan: cookies are detected from HTML, inline scripts, and downloaded JS bundles where available.",
    "JavaScript-set cookies are inferred without executing scripts and may differ from runtime.",
    "Review the declaration and edit it in the dashboard before publishing."
  );

  return {
    url: baseUrl,
    scannedAt: new Date().toISOString(),
    cookies,
    trackers,
    scripts: srcs.slice(0, 100),
    notes,
  };
}

export function declarationFromScan(scan: ScanResult): CookieDeclarationEntry[] {
  return scan.cookies.map(({ source: _source, ...rest }) => rest);
}

/** Escape a literal for use in a RegExp (defense in depth for future patterns). */
export function escapeRegExp(s: string): string {
  if (s.length > 500) throw new Error("Pattern too long");
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
