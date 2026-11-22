import { describe, it, expect } from "vitest";
import { normalizeBaseUrl } from "./client.js";
import { bannerSnippet } from "./hono.js";

describe("normalizeBaseUrl", () => {
  it("strips all trailing slashes without changing the rest of the URL", () => {
    expect(normalizeBaseUrl("https://example.com///")).toBe("https://example.com");
    expect(normalizeBaseUrl("https://example.com/base//")).toBe("https://example.com/base");
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeBaseUrl("/")).toBe("");
  });
});

describe("bannerSnippet", () => {
  it("escapes every dangerous character in double-quoted attributes", () => {
    const html = bannerSnippet({
      apiKey: `a"b&c<d>e`,
      apiUrl: `https://example.com/?x=1&y=2"`,
    });
    expect(html).not.toContain(`a"b`);
    expect(html).toContain("a&quot;b&amp;c&lt;d&gt;e");
    expect(html).toContain("x=1&amp;y=2&quot;");
  });

  it("uses the normalized base URL for the script src", () => {
    const html = bannerSnippet({ apiKey: "key", apiUrl: "https://example.com///" });
    expect(html).toContain('src="https://example.com/simplecookies.js"');
  });
});
