import { SimpleCookiesClient } from "./client.js";
import { bannerSnippet } from "./hono.js";
import type { SimpleCookiesConfig } from "./types.js";

/**
 * Next.js helper for SimpleCookies (App Router / Pages).
 * Mirrors the WebDefender `next` adapter shape without importing `next`.
 */

export function createNextSimpleCookies(options: SimpleCookiesConfig) {
  const client = new SimpleCookiesClient(options);
  let ready: Promise<any> | null = null;

  const init = (): Promise<any> => {
    if (!ready) {
      ready = client.fetchConfig().catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  };

  // Middleware-style helper: attach policy header for CDN/edge decisions.
  const middleware =
    (async (request: any, NextResponse: any) => {
      try {
        const payload = await init();
        const response = NextResponse.next();
        response.headers.set("X-SimpleCookies-Policy", String(payload?.config?.policyVersion ?? 1));
        return response;
      } catch (error) {
        if (options.onError) options.onError(error instanceof Error ? error : new Error("SimpleCookies Next init failed"));
        return NextResponse.next();
      }
    }) as any;

  // Server-component helper: fetch props for <SimpleCookiesProvider>.
  const getServerProps = async () => {
    try {
      const payload = await init();
      return { project: payload, consent: client.getConsent() };
    } catch {
      return { project: null as any, consent: client.getConsent() };
    }
  };

  const snippet = bannerSnippet({ apiKey: options.apiKey, apiUrl: options.apiUrl });

  return { client, middleware, getServerProps, snippet };
}

export function createNextMiddleware(options: SimpleCookiesConfig) {
  return createNextSimpleCookies(options).middleware;
}

export function getSimpleCookiesSnippet(options: { apiKey: string; apiUrl?: string }): string {
  return bannerSnippet(options);
}
