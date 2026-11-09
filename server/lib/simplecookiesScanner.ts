import { fetchPublicUrl } from "./publicFetch.ts";
import { assertPublicHostname } from "./safeAiUrl.ts";
import {
  scanHtml,
  scanJsText,
  declarationFromScan,
  extractScriptSrcs,
  extractSetCookieNames,
  type ScanResult,
} from "../../packages/simplecookies/src/scanner.ts";
import type { CookieDeclarationEntry } from "../../packages/simplecookies/src/types.ts";

const MAX_SCAN_BYTES = 2 * 1024 * 1024; // 2 MB html cap
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024; // 5 MB per JS file (Vite bundles are ~1–3 MB)
const MAX_BUNDLES = 4;
const MAX_TOTAL_BUNDLE_BYTES = 12 * 1024 * 1024;

// Hosts whose cookies are already covered by the static tracker DB.
const SKIP_BUNDLE_HOSTS = [
  "googletagmanager.com",
  "google-analytics.com",
  "googlesyndication.com",
  "doubleclick.net",
  "connect.facebook.net",
  "static.hotjar.com",
  "script.hotjar.com",
  "js.intercomcdn.com",
  "bat.bing.com",
  "clarity.microsoft.com",
  "analytics.tiktok.com",
  "snap.licdn.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "ajax.googleapis.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

/**
 * Validate + normalize a user-supplied scan target.
 * SSRF-safe: http(s) only, no credentials, public hostname required.
 */
export function normalizeScanUrl(raw: string): string {
  if (!raw || typeof raw !== "string") throw new Error("URL is required");
  const trimmed = raw.trim().slice(0, 2048);
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("HTTP(S) required");
  if (url.username || url.password) throw new Error("Credentials in URL are not allowed");
  assertPublicHostname(url.hostname);
  return url.href;
}

export interface ServerScanResult {
  url: string;
  scannedAt: string;
  declaration: CookieDeclarationEntry[];
  trackers: string[];
  scripts: string[];
  notes: string[];
}

export async function scanSite(rawUrl: string): Promise<ServerScanResult> {
  const url = normalizeScanUrl(rawUrl);
  let response: Response;
  try {
    response = await fetchPublicUrl(url, { headers: { Accept: "text/html,*/*" } }, MAX_SCAN_BYTES);
  } catch (err) {
    // fetchPublicUrl already enforces public-origin + redirect + timeout + size cap.
    throw new Error("Could not fetch the site for scanning");
  }
  if (!response.ok) throw new Error(`Site returned ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    throw new Error("URL did not return HTML");
  }

  const html = await response.text();

  const setCookieNames = extractSetCookieNames(
    response.headers as unknown as Headers,
  );

  const scan: ScanResult = scanHtml(html, url, setCookieNames);

  // Deep scan: download first-party JS bundles and look for cookie writes
  // and tracker literals inside them (most SPAs set cookies only there).
  const cookies = [...scan.cookies];
  const trackers = [...scan.trackers];
  const notes = [...scan.notes];
  let scannedBundles = 0;
  let totalBundleBytes = 0;

  const bundleUrls = resolveBundleUrls(extractScriptSrcs(html), url).slice(0, MAX_BUNDLES);

  const bundleResults = await Promise.allSettled(
    bundleUrls.map(async (bundleUrl) => {
      const r = await fetchPublicUrl(
        bundleUrl,
        { headers: { Accept: "text/javascript,application/javascript,*/*" } },
        MAX_BUNDLE_BYTES,
      );
      if (!r.ok) throw new Error(`Bundle ${r.status}`);
      const text = await r.text();
      return { bundleUrl, text };
    }),
  );

  for (const result of bundleResults) {
    if (result.status !== "fulfilled") continue; // per-file failure must not fail the scan
    const { text } = result.value;
    scannedBundles += 1;
    totalBundleBytes += text.length;
    if (totalBundleBytes > MAX_TOTAL_BUNDLE_BYTES) break;
    const found = scanJsText(text, "bundle");
    for (const t of found.trackers) {
      if (!trackers.includes(t)) trackers.push(t);
    }
    const seen = new Set<string>(
      cookies.map((c) => `${c.name}|${c.provider}`.toLowerCase()),
    );
    for (const c of found.cookies) {
      const key = `${c.name}|${c.provider}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        cookies.push(c);
      }
    }
  }

  if (scannedBundles > 0) {
    notes.push(
      `Deep scan: parsed ${scannedBundles} script file(s) for cookie writes and tracker literals.`,
    );
  } else if (bundleUrls.length > 0) {
    notes.push(
      "Deep scan: script files were found but could not be downloaded (size or access). Static HTML results still apply.",
    );
  }

  return {
    url: scan.url,
    scannedAt: new Date().toISOString(),
    declaration: declarationFromScan({
      url: scan.url,
      scannedAt: scan.scannedAt,
      cookies,
      trackers,
      scripts: scan.scripts,
      notes: scan.notes,
    }),
    trackers,
    scripts: scan.scripts,
    notes,
  };
}

function resolveBundleUrls(srcs: string[], pageUrl: string): string[] {
  const page = new URL(pageUrl);
  const resolved = new Map<string, string>();
  for (const src of srcs) {
    let absolute: URL;
    try {
      absolute = new URL(src, page);
    } catch {
      continue; // malformed src — skip
    }
    if (!["http:", "https:"].includes(absolute.protocol)) continue;
    if (absolute.username || absolute.password) continue;
    try {
      assertPublicHostname(absolute.hostname); // SSRF guard; fetchPublicUrl re-checks per redirect
    } catch {
      continue;
    }
    const host = absolute.hostname.toLowerCase();
    if (SKIP_BUNDLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    if (resolved.size >= MAX_BUNDLES + 8) break;
    resolved.set(absolute.href, absolute.href);
  }
  // Same-origin bundles first (SPA entry files), then cross-origin.
  const all = [...resolved.values()];
  const sameOrigin = all.filter((u) => {
    try {
      return new URL(u).hostname.toLowerCase() === page.hostname.toLowerCase();
    } catch {
      return false;
    }
  });
  const crossOrigin = all.filter((u) => !sameOrigin.includes(u));
  return [...sameOrigin, ...crossOrigin].slice(0, MAX_BUNDLES);
}
