import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { normalizeScanUrl, scanSite } from "./simplecookiesScanner.ts";

describe("normalizeScanUrl (SSRF guard)", () => {
  it("rejects private / localhost targets", () => {
    expect(() => normalizeScanUrl("http://localhost/admin")).toThrow();
    expect(() => normalizeScanUrl("http://127.0.0.1/")).toThrow();
    expect(() => normalizeScanUrl("http://192.168.1.1/")).toThrow();
    expect(() => normalizeScanUrl("https://user:pass@example.com/")).toThrow();
  });

  it("accepts public https targets", () => {
    expect(normalizeScanUrl("example.com")).toBe("https://example.com/");
    expect(normalizeScanUrl("https://example.com/path")).toBe("https://example.com/path");
  });
});

describe("scanSite deep JS scan", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("merges cookies found inside a downloaded JS bundle", async () => {
    const html = `<html><head><script src="/assets/app.js"></script></head><body>hi</body></html>`;
    const bundle = `document.cookie="analytics_id=1; Path=/";const x="_fbp";`;

    globalThis.fetch = (async (input: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/assets/app.js")) {
        return new Response(bundle, {
          status: 200,
          headers: { "content-type": "application/javascript" },
        });
      }
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as any;

    const result = await scanSite("https://scan-target.example/");
    const names = result.declaration.map((c) => c.name);
    expect(names).toContain("analytics_id");
    expect(names).toContain("_fbp");
    expect(result.notes.some((n) => n.includes("Deep scan"))).toBe(true);
  });

  it("still succeeds when bundle downloads fail", async () => {
    const html = `<html><head><script src="/assets/app.js"></script></head></html>`;
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/assets/app.js")) {
        return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
      }
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }) as any;

    const result = await scanSite("https://scan-target.example/");
    expect(result).toBeDefined();
    expect(Array.isArray(result.declaration)).toBe(true);
    expect(result.notes.some((n) => n.includes("could not be downloaded"))).toBe(true);
  });
});
