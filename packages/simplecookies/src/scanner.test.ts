import { describe, it, expect } from "vitest";
import {
  scanHtml,
  scanJsText,
  extractScriptSrcs,
  extractDocumentCookieNames,
  extractInlineScripts,
  declarationFromScan,
} from "./scanner.js";
import { normalizeSelection } from "./types.js";

describe("scanner", () => {
  it("detects Google Analytics from script src", () => {
    const html = `<html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-123"></script></head></html>`;
    const result = scanHtml(html, "https://example.com");
    expect(result.trackers).toContain("Google Analytics");
    expect(result.cookies.some((c) => c.name === "_ga")).toBe(true);
    expect(result.cookies.every((c) => ["statistics", "necessary", "preferences", "marketing", "custom"].includes(c.category))).toBe(true);
  });

  it("detects inline gtag marker", () => {
    const result = scanHtml(`<script>gtag('config','G-1')</script>`, "https://example.com");
    expect(result.trackers).toContain("Google Analytics");
  });

  it("extracts Set-Cookie names into first-party cookies", () => {
    const result = scanHtml("", "https://example.com", ["session_id", "_ga"]);
    expect(result.cookies).toHaveLength(2);
    const ga = result.cookies.find((c) => c.name === "_ga");
    expect(ga?.category).toBe("statistics");
    const sess = result.cookies.find((c) => c.name === "session_id");
    expect(sess?.category).toBe("necessary");
  });

  it("declarationFromScan strips scan-only fields", () => {
    const scan = scanHtml(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`, "https://example.com");
    const decl = declarationFromScan(scan);
    expect(decl[0]).not.toHaveProperty("source");
  });

  it("extractScriptSrcs caps results", () => {
    const many = Array.from({ length: 600 }, (_, i) => `<script src="https://cdn.example.com/${i}.js"></script>`).join("");
    expect(extractScriptSrcs(many).length).toBeLessThanOrEqual(500);
  });

  it("extractScriptSrcs preserves case (asset paths are case-sensitive)", () => {
    const html = `<script src="/assets/index-Pzp70iSc.js"></script>`;
    expect(extractScriptSrcs(html)).toEqual(["/assets/index-Pzp70iSc.js"]);
  });

  it("detects document.cookie writes in inline scripts", () => {
    const html = `<html><head><script>document.cookie="session_id=abc; Path=/";document.cookie="_ga=GA1.1.123; path=/";</script></head></html>`;
    const result = scanHtml(html, "https://example.com");
    const names = result.cookies.map((c) => c.name);
    expect(names).toContain("session_id");
    expect(names).toContain("_ga");
    expect(result.cookies.find((c) => c.name === "_ga")?.provider).toBe("Google Analytics");
    expect(result.cookies.find((c) => c.name === "session_id")?.category).toBe("necessary");
  });

  it("extractDocumentCookieNames finds js-cookie and cookieStore writes", () => {
    const js = `Cookies.set("theme", "dark"); cookieStore.set("consent_state", "1"); setCookie("csrf_token", "x");`;
    expect(extractDocumentCookieNames(js).sort()).toEqual(["consent_state", "csrf_token", "theme"]);
  });

  it("extractInlineScripts skips tags with src", () => {
    const html = `<script src="/a.js"></script><script>const x=1;</script>`;
    expect(extractInlineScripts(html)).toEqual(["const x=1;"]);
  });

  it("scanJsText finds tracker hosts and known cookie literals inside bundles", () => {
    const bundle = `import{...}from"./chunk.js";const id="_fbp";fetch("https://www.googletagmanager.com/gtag/js?id=G-1");document.cookie="marketing_consent=1";`;
    const found = scanJsText(bundle, "bundle");
    expect(found.trackers).toContain("Google Analytics");
    const names = found.cookies.map((c) => c.name);
    expect(names).toContain("_fbp");
    expect(names).toContain("marketing_consent");
  });
});

describe("consent normalization", () => {
  it("forces necessary true", () => {
    expect(normalizeSelection({ necessary: false, marketing: true } as any)).toEqual({
      necessary: true,
      preferences: false,
      statistics: false,
      marketing: true,
      custom: false,
    });
  });
});
