import { fetchPublicUrl } from "./publicFetch.ts";
import { assertPublicHostname } from "./safeAiUrl.ts";
import {
  scanHtml,
  declarationFromScan,
  type ScanResult,
} from "../../packages/simplecookies/src/scanner.ts";
import type { CookieDeclarationEntry } from "../../packages/simplecookies/src/types.ts";

const MAX_SCAN_BYTES = 2 * 1024 * 1024; // 2 MB html cap

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

  // Set-Cookie headers from the initial fetch (may be empty for public sites).
  let setCookieNames: string[] = [];
  try {
    const { extractSetCookieNames } = await import(
      "../../packages/simplecookies/src/scanner.ts"
    );
    setCookieNames = extractSetCookieNames(response.headers as unknown as Headers);
  } catch {
    setCookieNames = [];
  }

  const scan: ScanResult = scanHtml(html, url, setCookieNames);
  return {
    url: scan.url,
    scannedAt: scan.scannedAt,
    declaration: declarationFromScan(scan),
    trackers: scan.trackers,
    scripts: scan.scripts,
    notes: scan.notes,
  };
}
