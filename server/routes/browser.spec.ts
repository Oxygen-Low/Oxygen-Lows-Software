import { describe, it, expect } from "vitest";
import { browserRouter } from "./browser";
import {
  isPathAllowed,
  extractPageData,
  searchOxylowIndex,
  getOxylowSuggestions,
  saveIndex,
  waitForDomainSlot,
  OXYLOW_USER_AGENT,
  OXYLOW_CONTACT_EMAIL,
} from "../lib/oxylowCrawler";

describe("Browser Router & oxylow-search crawler", () => {
  it("has compliant user agent and support contact email", () => {
    expect(OXYLOW_USER_AGENT).toContain("oxylow-search/1.0");
    expect(OXYLOW_USER_AGENT).toContain("support@oxygenlow.com");
    expect(OXYLOW_CONTACT_EMAIL).toBe("support@oxygenlow.com");
  });

  it("rejects missing url for proxy", async () => {
    const req = new Request("http://localhost/proxy");
    const res = await browserRouter.fetch(req);
    expect(res.status).toBe(400);
  });

  it("rejects private/internal IP for proxy", async () => {
    const req = new Request("http://localhost/proxy?url=http://127.0.0.1:8080");
    const res = await browserRouter.fetch(req);
    expect(res.status).toBe(502);
  });

  it("rejects non-http/https protocol for proxy", async () => {
    const req = new Request("http://localhost/proxy?url=file:///etc/passwd");
    const res = await browserRouter.fetch(req);
    expect(res.status).toBe(502);
  });

  it("returns search results and suggestions", async () => {
    const req = new Request("http://localhost/search?q=oxygen");
    const res = await browserRouter.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
    expect(Array.isArray(body.results)).toBe(true);

    const sugReq = new Request("http://localhost/suggestions?q=oxy");
    const sugRes = await browserRouter.fetch(sugReq);
    expect(sugRes.status).toBe(200);
    const sugBody = await sugRes.json();
    expect(sugBody).toHaveProperty("suggestions");
  });

  it("extracts page metadata accurately", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="A comprehensive test description.">
          <meta name="keywords" content="test, vitest, crawler, bot">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Main Heading</h1>
          <h2>Subheading</h2>
          <p>Here is some sample readable text content on the page.</p>
          <a href="/about">About Us</a>
          <a href="https://example.com/contact">Contact Us</a>
        </body>
      </html>
    `;

    const extracted = extractPageData(sampleHtml, "https://example.com/home");
    expect(extracted.title).toBe("Test Page Title");
    expect(extracted.description).toBe("A comprehensive test description.");
    expect(extracted.keywords).toContain("vitest");
    expect(extracted.headings).toContain("Main Heading");
    expect(extracted.headings).toContain("Subheading");
    expect(extracted.favicon).toBe("https://example.com/favicon.ico");
    expect(extracted.links).toContain("https://example.com/about");
    expect(extracted.links).toContain("https://example.com/contact");
  });

  it("evaluates robots.txt allow and disallow paths correctly", () => {
    const rules = {
      disallow: ["/admin", "/private/", "/api/"],
      allow: ["/api/public"],
    };

    expect(isPathAllowed("/", rules)).toBe(true);
    expect(isPathAllowed("/blog/post-1", rules)).toBe(true);
    expect(isPathAllowed("/admin", rules)).toBe(false);
    expect(isPathAllowed("/admin/users", rules)).toBe(false);
    expect(isPathAllowed("/private/secret", rules)).toBe(false);
    expect(isPathAllowed("/api/internal", rules)).toBe(false);
    expect(isPathAllowed("/api/public", rules)).toBe(true);
  });

  it("enforces delay between requests to the same domain", async () => {
    const testDomain = "test-domain-delay.com";
    const start = Date.now();

    await waitForDomainSlot(testDomain, 50);
    await waitForDomainSlot(testDomain, 50);

    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(45);
  });

  it("ensures domains can only appear once in search results", () => {
    saveIndex([
      {
        id: "p1",
        url: "https://example.com/page1",
        domain: "example.com",
        title: "Developer Guide",
        description: "Official developer guide documentation",
        headings: ["Docs"],
        keywords: ["guide"],
        bodyPreview: "Learn how to develop",
        indexedAt: new Date().toISOString(),
      },
      {
        id: "p2",
        url: "https://example.com/page2",
        domain: "example.com",
        title: "Developer Overview",
        description: "Overview page",
        headings: ["Overview"],
        keywords: ["overview"],
        bodyPreview: "Short overview",
        indexedAt: new Date().toISOString(),
      },
      {
        id: "p3",
        url: "https://another-domain.org/developer",
        domain: "another-domain.org",
        title: "Developer Portal",
        description: "Another site developer portal",
        headings: ["Portal"],
        keywords: ["developer"],
        bodyPreview: "Developer tools and portal",
        indexedAt: new Date().toISOString(),
      },
    ]);

    const { results, total } = searchOxylowIndex("developer");
    expect(total).toBe(2);
    expect(results).toHaveLength(2);
    const domains = results.map((r) => r.domain);
    expect(new Set(domains)).toEqual(new Set(["example.com", "another-domain.org"]));
    expect(results.filter((r) => r.domain === "example.com")).toHaveLength(1);
    expect(results.filter((r) => r.domain === "another-domain.org")).toHaveLength(1);
  });
});
