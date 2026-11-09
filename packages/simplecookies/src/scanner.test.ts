import { describe, it, expect } from "vitest";
import { scanHtml, extractScriptSrcs, declarationFromScan } from "./scanner.js";
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
