import { SimpleCookiesClient } from "./client.js";
import type { SimpleCookiesConfig } from "./types.js";

export interface SimpleCookiesHonoOptions extends SimpleCookiesConfig {}

/**
 * Hono helper for SimpleCookies.
 *
 * Sets `simpleCookies` on the Hono context and adds a convenience header so
 * handlers can serve banner snippets without an extra round-trip.
 * Uses `any` types so no `hono` import is required at build time
 * (mirrors the WebDefender adapter pattern).
 */
export function createSimpleCookies(
  options: SimpleCookiesHonoOptions,
): (c: any, next: any) => Promise<void> {
  const client = new SimpleCookiesClient(options);
  let ready: Promise<any> | null = null;

  return async (c: any, next: any) => {
    try {
      if (!ready) ready = client.fetchConfig().catch((err) => {
        ready = null;
        throw err;
      });
      const payload = await ready;
      c.set("simpleCookies", {
        client,
        project: payload,
        consent: client.getConsent(),
      });
      if (payload?.config) {
        c.header("X-SimpleCookies-Policy", String(payload.config.policyVersion));
      }
    } catch (error) {
      // Fail open: banner still works via CDN/offline defaults.
      c.set("simpleCookies", { client, project: null, consent: client.getConsent() });
      if (options.onError) options.onError(error instanceof Error ? error : new Error("SimpleCookies Hono init failed"));
    }
    await next();
  };
}

export function bannerSnippet(options: { apiKey: string; apiUrl?: string }): string {
  const apiKey = options.apiKey.replace(/"/g, "&quot;");
  const apiUrl = options.apiUrl ? ` data-api-url="${options.apiUrl.replace(/"/g, "&quot;")}"` : "";
  const base = (options.apiUrl || "https://oxygenlow.com").replace(/\/+$/, "");
  return `<script src="${base}/simplecookies.js" data-api-key="${apiKey}"${apiUrl} defer></script>`;
}

/** Escape for HTML snippet values (defense in depth). */
function escapeAttr(s: string): string {
  if (s.length > 2000) throw new Error("Value too long");
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { escapeAttr };
