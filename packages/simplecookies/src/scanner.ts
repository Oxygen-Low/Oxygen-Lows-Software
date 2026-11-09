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

export function extractScriptSrcs(html: string): string[] {
  const srcs: string[] = [];
  const lower = html.slice(0, MAX_HTML_CHARS).toLowerCase();
  // Static pattern — never built from user input.
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null && srcs.length < 500) {
    srcs.push(m[1].trim());
  }
  return srcs;
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

function cookieForTracker(t: KnownTracker, c: KnownTracker["cookies"][number]): ScanResultCookie {
  return {
    name: c.name,
    provider: t.provider,
    purpose: c.purpose,
    expiry: c.expiry,
    category: t.category,
    source: "tracker",
  };
}

export function scanHtml(html: string, baseUrl: string, setCookieNames: string[] = []): ScanResult {
  const srcs = extractScriptSrcs(html);
  const lowerHtml = html.slice(0, MAX_HTML_CHARS).toLowerCase();
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

  for (const src of srcs) {
    const lowerSrc = src.toLowerCase();
    for (const t of KNOWN_TRACKERS) {
      if (t.match.some((p) => lowerSrc.includes(p.toLowerCase()))) {
        if (!trackers.includes(t.provider)) trackers.push(t.provider);
        for (const c of t.cookies) addCookie(cookieForTracker(t, c));
      }
    }
  }

  // Inline markers (gtag config, fbq, hotjar snippets) without src.
  const inlineMarkers: Array<[string, string]> = [
    ["gtag(", "Google Analytics"],
    ["ga(", "Google Analytics"],
    ["fbq(", "Meta Pixel"],
    ["hj(", "Hotjar"],
  ];
  for (const [marker, provider] of inlineMarkers) {
    if (lowerHtml.includes(marker) && !trackers.includes(provider)) {
      trackers.push(provider);
      const t = KNOWN_TRACKERS.find((x) => x.provider === provider);
      if (t) for (const c of t.cookies) addCookie(cookieForTracker(t, c));
    }
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
    "Static scan: JavaScript-set cookies are inferred from third-party scripts and may differ from runtime.",
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
