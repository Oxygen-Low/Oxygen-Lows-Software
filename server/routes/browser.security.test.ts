import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/publicFetch.ts", () => ({ fetchPublicUrl: vi.fn() }));
vi.mock("../lib/oxylowCrawler.ts", async (original) => ({ ...(await original<any>()), validateCrawlUrl: async (url: string) => new URL(url) }));
import { fetchPublicUrl } from "../lib/publicFetch.ts";
import { browserRouter } from "./browser.ts";
import app from "../index.ts";

describe("untrusted proxy documents", () => {
  it.each(["text/html", "image/svg+xml"])("isolates %s even when opened directly", async (contentType) => {
    vi.mocked(fetchPublicUrl).mockResolvedValue(new Response('<script>parent.localStorage.getItem("session")</script>', { headers: { "content-type": contentType } }));
    const res = await browserRouter.request("/proxy?url=https://example.com/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("sandbox allow-scripts;");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-top-navigation");
    const integrated = await app.request("/api/browser/proxy?url=https://example.com/");
    expect(integrated.headers.get("content-security-policy")).toContain("sandbox allow-scripts;");
  });
});
