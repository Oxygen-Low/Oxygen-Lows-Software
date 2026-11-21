import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/publicFetch.ts", () => ({ fetchPublicUrl: vi.fn() }));
vi.mock("../lib/oxylowCrawler.ts", async (original) => ({ ...(await original<any>()), validateCrawlUrl: async (url: string) => new URL(url) }));
import { fetchPublicUrl } from "../lib/publicFetch.ts";
import { browserRouter } from "./browser.ts";
import app from "../index.ts";

describe("untrusted proxy documents", () => {
  it.each(["text/html", "image/svg+xml"])("isolates %s even when opened directly", async (contentType) => {
    vi.mocked(fetchPublicUrl).mockImplementation(
      async () =>
        new Response('<script>parent.localStorage.getItem("session")</script>', {
          headers: { "content-type": contentType },
        }),
    );
    const res = await browserRouter.request("/proxy?url=https://example.com/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("sandbox allow-scripts;");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-top-navigation");
    const integrated = await app.request("/api/browser/proxy?url=https://example.com/");
    expect(integrated.status).toBe(200);
    const integratedCsp = integrated.headers.get("content-security-policy")!;
    expect(integratedCsp).toContain("sandbox allow-scripts;");
    // The proxied document must keep the proxy's permissive policy so the
    // remote page's own stylesheets and scripts can load; the app-wide CSP
    // would block them and render the page unstyled.
    expect(integratedCsp).toContain("style-src * 'unsafe-inline'");
    expect(integratedCsp).toContain("script-src * 'unsafe-inline'");
    expect(integratedCsp).not.toContain("fonts.googleapis.com");

    // Regular app routes still receive the strict app-wide policy.
    const appRoute = await app.request("/api/browser/suggestions?q=test");
    expect(appRoute.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});

