import { describe, it, expect } from "vitest";
import { browserRouter } from "./browser";
import {
  isPathAllowed,
  parseRobotsTxt,
  isUserAgentMatch,
  getRobotsRules,
  extractPageData,
  extractReaderArticle,
  decodeHtmlEntities,
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

  it("decodes HTML entities accurately", () => {
    expect(decodeHtmlEntities("Oxygen Low&#039;s Software &amp; Tools")).toBe(
      "Oxygen Low's Software & Tools"
    );
    expect(decodeHtmlEntities("&quot;Hello&quot; &lt;World&gt; &copy; 2026")).toBe(
      '"Hello" <World> © 2026'
    );
    expect(decodeHtmlEntities("Special&#x20;Chars&#x21;")).toBe("Special Chars!");
  });

  it("extracts page metadata with decoded HTML entities accurately", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Oxygen Low&#039;s &amp; Co</title>
          <meta name="description" content="A comprehensive &quot;test&quot; description &amp; guide.">
          <meta name="keywords" content="test, vitest, crawler, bot">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Main &amp; Heading</h1>
          <h2>Subheading &mdash; Part 1</h2>
          <p>Here is some sample readable text content on the page.</p>
          <a href="/about">About Us</a>
          <a href="https://example.com/contact">Contact Us</a>
        </body>
      </html>
    `;

    const extracted = extractPageData(sampleHtml, "https://example.com/home");
    expect(extracted.title).toBe("Oxygen Low's & Co");
    expect(extracted.description).toBe('A comprehensive "test" description & guide.');
    expect(extracted.keywords).toContain("vitest");
    expect(extracted.headings).toContain("Main & Heading");
    expect(extracted.headings).toContain("Subheading — Part 1");
    expect(extracted.favicon).toBe("https://example.com/favicon.ico");
    expect(extracted.links).toContain("https://example.com/about");
    expect(extracted.links).toContain("https://example.com/contact");
  });

  it("extracts structured reader article without boilerplate", () => {
    const articleHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Clean Article Title</title></head>
        <body>
          <header><nav><a href="/">Home</a><a href="/menu">Menu</a></nav></header>
          <article>
            <h1>Understanding Web Security</h1>
            <p>Web security is essential for all applications running in modern browsers.</p>
            <p>Content Security Policies help prevent cross-site scripting and unauthorized data exfiltration.</p>
          </article>
          <footer><p>&copy; 2026 All Rights Reserved</p></footer>
        </body>
      </html>
    `;

    const article = extractReaderArticle(articleHtml, "https://example.com/article");
    expect(article.title).toBe("Clean Article Title");
    expect(article.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(article.content).toContain("Understanding Web Security");
    expect(article.content).toContain("Content Security Policies help prevent");
    expect(article.content).not.toContain("Menu");
    expect(article.readingTimeMinutes).toBeGreaterThanOrEqual(1);
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

  it("strictly honors User-agent: oxylow-search with Disallow: / even when User-agent: * has Allow: /", () => {
    const robotsTxt = `
      User-agent: *
      Allow: /
      Disallow: /admin

      User-agent: oxylow-search
      Disallow: /
    `;

    const parsed = parseRobotsTxt(robotsTxt, "oxylow-search");
    expect(parsed.disallow).toEqual(["/"]);
    expect(parsed.allow).toEqual([]);

    expect(isPathAllowed("/", parsed)).toBe(false);
    expect(isPathAllowed("/about", parsed)).toBe(false);
    expect(isPathAllowed("/index.html", parsed)).toBe(false);
  });

  it("isolates specific user-agent group and prevents leaking * rules into specific bot rules", () => {
    const robotsTxt = `
      User-agent: *
      Disallow: /all-secret
      Allow: /all-public
      Crawl-delay: 5

      User-agent: oxylow-search
      Disallow: /oxylow-secret
      Allow: /oxylow-secret/allowed
      Crawl-delay: 2
    `;

    const parsedOxylow = parseRobotsTxt(robotsTxt, "oxylow-search");
    expect(parsedOxylow.disallow).toEqual(["/oxylow-secret"]);
    expect(parsedOxylow.allow).toEqual(["/oxylow-secret/allowed"]);
    expect(parsedOxylow.crawlDelayMs).toBe(2000);

    expect(isPathAllowed("/all-secret", parsedOxylow)).toBe(true); // Specific group didn't disallow /all-secret
    expect(isPathAllowed("/oxylow-secret", parsedOxylow)).toBe(false);
    expect(isPathAllowed("/oxylow-secret/allowed", parsedOxylow)).toBe(true);
    expect(isPathAllowed("/oxylow-secret/blocked", parsedOxylow)).toBe(false);

    // Generic bot fallback
    const parsedGeneric = parseRobotsTxt(robotsTxt, "some-other-bot");
    expect(parsedGeneric.disallow).toEqual(["/all-secret"]);
    expect(parsedGeneric.allow).toEqual(["/all-public"]);
    expect(parsedGeneric.crawlDelayMs).toBe(5000);
  });

  it("correctly separates user-agent groups even without blank lines between them", () => {
    const robotsTxt = `User-agent: Googlebot
Disallow: /google-blocked
User-agent: oxylow-search
Disallow: /
User-agent: *
Disallow: /fallback-blocked`;

    const parsedOxylow = parseRobotsTxt(robotsTxt, "oxylow-search");
    expect(parsedOxylow.disallow).toEqual(["/"]);
    expect(parsedOxylow.allow).toEqual([]);
    expect(isPathAllowed("/", parsedOxylow)).toBe(false);

    const parsedGoogle = parseRobotsTxt(robotsTxt, "googlebot");
    expect(parsedGoogle.disallow).toEqual(["/google-blocked"]);
    expect(isPathAllowed("/", parsedGoogle)).toBe(true);
    expect(isPathAllowed("/google-blocked", parsedGoogle)).toBe(false);

    const parsedStar = parseRobotsTxt(robotsTxt, "unknown-bot");
    expect(parsedStar.disallow).toEqual(["/fallback-blocked"]);
    expect(isPathAllowed("/", parsedStar)).toBe(true);
    expect(isPathAllowed("/fallback-blocked", parsedStar)).toBe(false);
  });

  it("matches wildcards and end-of-path anchors accurately", () => {
    const rules = {
      disallow: ["/*.php$", "/private/*", "/temp*"],
      allow: ["/private/public.php$", "/temp/safe"],
    };

    expect(isPathAllowed("/index.php", rules)).toBe(false);
    expect(isPathAllowed("/index.php?query=1", rules)).toBe(true); // $ anchors to end of URL
    expect(isPathAllowed("/index.php/extra", rules)).toBe(true);
    expect(isPathAllowed("/private/secret", rules)).toBe(false);
    expect(isPathAllowed("/private/public.php", rules)).toBe(true);
    expect(isPathAllowed("/temp-cache/file", rules)).toBe(false);
    expect(isPathAllowed("/temp/safe/file", rules)).toBe(true);
  });

  it("resolves rule specificity (longest match wins and equal-length Allow wins)", () => {
    // Disallow /admin (len 6) vs Allow /admin/public (len 13)
    const rules = {
      disallow: ["/admin", "/equal/path"],
      allow: ["/admin/public", "/equal/path"],
    };

    expect(isPathAllowed("/admin/internal", rules)).toBe(false);
    expect(isPathAllowed("/admin/public", rules)).toBe(true);
    expect(isPathAllowed("/admin/public/profile", rules)).toBe(true);
    // Equal length test: /equal/path (both len 11) -> Allow wins
    expect(isPathAllowed("/equal/path", rules)).toBe(true);
  });

  it("matches user agent variants case-insensitively and with version tokens", () => {
    expect(isUserAgentMatch("oxylow-search", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("Oxylow-Search", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("oxylow-search/1.0", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("oxylow", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("oxylowbot", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("oxylow-aisearch", "oxylow-search")).toBe(true);
    expect(isUserAgentMatch("googlebot", "oxylow-search")).toBe(false);
    expect(isUserAgentMatch("*", "oxylow-search")).toBe(false);
  });

  it("enforces delay between requests to the same domain", async () => {
    const testDomain = "test-domain-delay.com";
    const start = Date.now();

    await waitForDomainSlot(testDomain, 50);
    await waitForDomainSlot(testDomain, 50);

    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(45);
  });

  it("ranks relevant pages accurately (e.g. images search ranks image tools top over passing mentions)", () => {
    saveIndex([
      {
        id: "p-cursor",
        url: "https://cursor.com",
        domain: "cursor.com",
        title: "Cursor - The AI Code Editor",
        description: "Build software faster with intelligent AI pair programmer.",
        headings: ["Features", "Pricing"],
        keywords: ["ai", "editor", "code"],
        bodyPreview: "Imagine building software faster with an intelligent code editor that handles images and assets.",
        indexedAt: new Date().toISOString(),
      },
      {
        id: "p-image-gen",
        url: "https://images.oxygenlow.com",
        domain: "images.oxygenlow.com",
        title: "Free AI Images & Image Generator",
        description: "Generate high quality AI images, photos, and digital art with multiple styles.",
        headings: ["AI Images Studio", "Generate Images"],
        keywords: ["images", "image generator", "photos", "art"],
        bodyPreview: "Create stunning custom images with our free AI image generator.",
        indexedAt: new Date().toISOString(),
      },
      {
        id: "p-kaspersky",
        url: "https://kaspersky.com/blog/video-threats",
        domain: "kaspersky.com",
        title: "Cybersecurity Threats in Enterprise Networks",
        description: "Comprehensive guide to ransomware, malware, and cyber defense.",
        headings: ["Network Defense", "Threat Intel"],
        keywords: ["security", "antivirus", "malware"],
        bodyPreview: "Security warnings regarding video conferencing application vulnerabilities and patching schedules.",
        indexedAt: new Date().toISOString(),
      },
      {
        id: "p-video-trimmer",
        url: "https://video.oxygenlow.com/trimmer",
        domain: "video.oxygenlow.com",
        title: "Video Editor & Video Trimmer Tool",
        description: "Trim, convert, and edit video files directly in your browser without uploading.",
        headings: ["Browser Video Trimmer", "Fast Video Tools"],
        keywords: ["video", "video trimmer", "video converter", "editor"],
        bodyPreview: "Edit, cut, and trim video clips locally in your browser with high speed.",
        indexedAt: new Date().toISOString(),
      },
    ]);

    // Test 1: Searching for "images" should rank image generator highest, not cursor.com
    const imageResults = searchOxylowIndex("images");
    expect(imageResults.results.length).toBeGreaterThan(0);
    expect(imageResults.results[0].domain).toBe("images.oxygenlow.com");

    // Test 2: Searching for "video" should rank video trimmer tool highest, not kaspersky
    const videoResults = searchOxylowIndex("video");
    expect(videoResults.results.length).toBeGreaterThan(0);
    expect(videoResults.results[0].domain).toBe("video.oxygenlow.com");
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
