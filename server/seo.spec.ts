import { describe, it, expect } from "vitest";
import {
  injectSeoTags,
  getSeoMetadata,
  SEO_ROUTES,
  generateJsonLd,
  type RouteSeoData,
} from "../shared/seo.ts";
import app from "./index.ts";

const AUDITED_URLS = [
  "/",
  "/apps",
  "/apps/chatbot",
  "/apps/file-compressor",
  "/apps/public-characters",
  "/apps/data-save",
  "/apps/qrcode-generator",
  "/apps/llm-agent",
  "/apps/agent-search",
  "/apps/webdefender",
  "/apps/base64-encoder",
  "/apps/json-formatter",
  "/apps/vpn",
  "/games",
  "/games/chess",
  "/games/minesweeper",
  "/games/solitaire",
  "/games/poker",
  "/games/sudoku",
  "/games/wordsearch",
  "/download",
  "/auth",
  "/privacy",
  "/terms",
  "/eula",
  "/dmca",
  "/acceptable-use",
  "/legal",
  "/license",
  "/support",
];

const BASE_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Oxygen Low's Software is a modern suite of web tools, AI utilities, privacy-focused applications, and encrypted cloud storage solutions." />
    <title>Oxygen Low's Software - Modern Apps, Tools & Cloud Storage</title>
    <link rel="canonical" href="https://oxygenlow.com/" />
  </head>
  <body>
    <div id="root">
      <div class="initial-loader">
        <div class="initial-spinner"></div>
      </div>
      <header class="sr-only">
        <h1>Oxygen Low's Software</h1>
      </header>
    </div>
    <script type="module" src="/client/App.tsx"></script>
  </body>
</html>`;

describe("SEO Suite - Resolving Audit Issues Across All Pages", () => {
  it("ensures every audited URL has unique and non-duplicate titles", () => {
    const titles = new Set<string>();

    for (const url of AUDITED_URLS) {
      const meta = getSeoMetadata(url);
      expect(meta.title).toBeTruthy();
      expect(meta.title).toContain("Oxygen Low's Software");
      expect(meta.title.length).toBeGreaterThanOrEqual(20);
      expect(meta.title.length).toBeLessThanOrEqual(70);

      expect(titles.has(meta.title)).toBe(false);
      titles.add(meta.title);
    }
  });

  it("ensures every audited URL has unique and non-duplicate descriptions with optimal length", () => {
    const descriptions = new Set<string>();

    for (const url of AUDITED_URLS) {
      const meta = getSeoMetadata(url);
      expect(meta.description).toBeTruthy();
      expect(meta.description.length).toBeGreaterThanOrEqual(80);
      expect(meta.description.length).toBeLessThanOrEqual(170);

      expect(descriptions.has(meta.description)).toBe(false);
      descriptions.add(meta.description);
    }
  });

  it("ensures every audited URL has unique H1 tags without display:none", () => {
    const h1s = new Set<string>();

    for (const url of AUDITED_URLS) {
      const meta = getSeoMetadata(url);
      expect(meta.h1).toBeTruthy();

      const renderedHtml = injectSeoTags(
        BASE_HTML_TEMPLATE,
        url,
        "https://oxygenlow.com",
      );
      expect(renderedHtml).not.toContain('style="display: none;"');
      expect(renderedHtml).toContain(
        `<h1>${meta.h1.replace(/&/g, "&amp;")}</h1>`,
      );

      expect(h1s.has(meta.h1)).toBe(false);
      h1s.add(meta.h1);
    }
  });

  it("ensures every audited URL receives a distinct self-referencing canonical URL", () => {
    for (const url of AUDITED_URLS) {
      const renderedHtml = injectSeoTags(
        BASE_HTML_TEMPLATE,
        url,
        "https://oxygenlow.com",
      );
      const expectedCanonical = `https://oxygenlow.com${url === "/" ? "" : url}`;

      expect(renderedHtml).toContain(
        `<link rel="canonical" href="${expectedCanonical}" />`,
      );
      expect(renderedHtml).toContain(
        `<meta property="og:url" content="${expectedCanonical}" />`,
      );
    }
  });

  it("injects complete OpenGraph, Twitter Card, and JSON-LD schema into rendered HTML", () => {
    for (const url of AUDITED_URLS) {
      const renderedHtml = injectSeoTags(
        BASE_HTML_TEMPLATE,
        url,
        "https://oxygenlow.com",
      );

      expect(renderedHtml).toMatch(
        /<meta property="og:site_name" content="Oxygen Low(&#039;|')s Software" \/>/,
      );
      expect(renderedHtml).toContain('<meta property="og:type"');
      expect(renderedHtml).toContain(
        '<meta property="og:image" content="https://oxygenlow.com/icons/icon-512x512.png" />',
      );
      expect(renderedHtml).toContain(
        '<meta name="twitter:card" content="summary_large_image" />',
      );
      expect(renderedHtml).toContain(
        '<meta name="twitter:image" content="https://oxygenlow.com/icons/icon-512x512.png" />',
      );
      expect(renderedHtml).toContain('<script type="application/ld+json">');

      // Verify JSON-LD is valid JSON
      const jsonLdMatches = renderedHtml.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
      );
      expect(jsonLdMatches).toBeTruthy();
      for (const match of jsonLdMatches!) {
        const jsonContent = match.replace(/<\/?script[^>]*>/gi, "");
        const parsed = JSON.parse(jsonContent);
        expect(parsed["@context"]).toBe("https://schema.org");
      }
    }
  });

  it("injects internal crawlable links so search engines discover outlinks and avoid orphan pages", () => {
    for (const url of AUDITED_URLS) {
      const renderedHtml = injectSeoTags(
        BASE_HTML_TEMPLATE,
        url,
        "https://oxygenlow.com",
      );

      expect(renderedHtml).toContain(
        '<nav aria-label="Site Navigation" class="sr-only">',
      );
      expect(renderedHtml).toContain('<a href="');
      expect(renderedHtml).toContain("</ul>");
    }
  });

  it("supports dynamic app and game routes seamlessly", () => {
    const base64Html = injectSeoTags(
      BASE_HTML_TEMPLATE,
      "/apps/base64-encoder",
      "https://oxygenlow.com",
    );
    expect(base64Html).toMatch(
      /<title>Base64 Encoder\/Decoder - Oxygen Low(&#039;|')s Software<\/title>/,
    );
    expect(base64Html).toContain(
      '<link rel="canonical" href="https://oxygenlow.com/apps/base64-encoder" />',
    );

    const chessHtml = injectSeoTags(
      BASE_HTML_TEMPLATE,
      "/games/chess",
      "https://oxygenlow.com",
    );
    expect(chessHtml).toMatch(
      /<title>Chess - Games - Oxygen Low(&#039;|')s Software<\/title>/,
    );
    expect(chessHtml).toContain(
      '<link rel="canonical" href="https://oxygenlow.com/games/chess" />',
    );
  });

  it("serves rich route-specific markdown upon Accept: text/markdown request", async () => {
    const res = await app.request("https://oxygenlow.com/privacy", {
      headers: { Accept: "text/markdown" },
    });
    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain("# Privacy Policy - Oxygen Low's Software");
    expect(md).toContain("UK GDPR");
    expect(md).toContain("## Key Topics");
    expect(md).toContain("## Related Links");
  });

  it("ensures every audited URL has exactly one single H1 tag in rendered HTML", () => {
    for (const url of AUDITED_URLS) {
      const renderedHtml = injectSeoTags(
        BASE_HTML_TEMPLATE,
        url,
        "https://oxygenlow.com",
      );
      const h1Matches = renderedHtml.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi);
      expect(h1Matches).toBeTruthy();
      expect(h1Matches!.length).toBe(1);
    }
  });

  it("verifies favicon tags are present in root index.html", async () => {
    const fs = await import("node:fs");
    const indexHtml = fs.readFileSync("index.html", "utf-8");
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/x-icon" href="/favicon.ico" />',
    );
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    );
  });

  it("ensures orphan pages (/apps/base64-encoder, /apps/json-formatter, /apps/vpn) have inbound links in index.html and navigation", async () => {
    const fs = await import("node:fs");
    const indexHtml = fs.readFileSync("index.html", "utf-8");
    expect(indexHtml).toContain('href="/apps/base64-encoder"');
    expect(indexHtml).toContain('href="/apps/json-formatter"');
    expect(indexHtml).toContain('href="/apps/vpn"');
  });

  it("serves comprehensive sitemap.xml with all core routes and lastmod timestamps", async () => {
    const res = await app.request("https://oxygenlow.com/sitemap.xml");
    expect(res.status).toBe(200);
    const xml = await res.text();

    for (const url of AUDITED_URLS) {
      const expectedLoc = `https://oxygenlow.com${url === "/" ? "/" : url}`;
      expect(xml).toContain(`<loc>${expectedLoc}</loc>`);
    }
    expect(xml).toContain("<lastmod>");
  });

  it("enables HTTP response compression middleware", async () => {
    const res = await app.request("https://oxygenlow.com/api/openapi.json", {
      headers: { "Accept-Encoding": "gzip" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
  });
});

describe("generateJsonLd", () => {
  const defaultMetadata: RouteSeoData = {
    path: "/test",
    title: "Test Title",
    description: "Test Description",
    canonicalPath: "/test",
    h1: "Test H1",
  };

  it("returns default Website, Organization, and WebPage schemas", () => {
    const schemas = generateJsonLd(defaultMetadata);
    expect(schemas).toHaveLength(3);

    const websiteSchema = schemas[0];
    expect(websiteSchema["@type"]).toBe("WebSite");
    expect(websiteSchema.url).toBe("https://oxygenlow.com");

    const organizationSchema = schemas[1];
    expect(organizationSchema["@type"]).toBe("Organization");
    expect(organizationSchema.url).toBe("https://oxygenlow.com");

    const webPageSchema = schemas[2];
    expect(webPageSchema["@type"]).toBe("WebPage");
    expect(webPageSchema.name).toBe("Test Title");
    expect(webPageSchema.headline).toBe("Test H1");
    expect(webPageSchema.description).toBe("Test Description");
    expect(webPageSchema.url).toBe("https://oxygenlow.com/test");
  });

  it("formats canonicalUrl correctly when canonicalPath is '/'", () => {
    const rootMetadata = { ...defaultMetadata, canonicalPath: "/" };
    const schemas = generateJsonLd(rootMetadata);
    const webPageSchema = schemas[2];
    expect(webPageSchema.url).toBe("https://oxygenlow.com");
  });

  it("sets WebPage schema @type to 'TechArticle' when metadata.ogType is 'article'", () => {
    const articleMetadata: RouteSeoData = { ...defaultMetadata, ogType: "article" };
    const schemas = generateJsonLd(articleMetadata);
    const webPageSchema = schemas[2];
    expect(webPageSchema["@type"]).toBe("TechArticle");
  });

  it("includes the BreadcrumbList object inside the WebPage schema if metadata.breadcrumbs has items", () => {
    const breadcrumbMetadata: RouteSeoData = {
      ...defaultMetadata,
      breadcrumbs: [
        { name: "Home", url: "/" },
        { name: "Test", url: "/test" },
      ],
    };
    const schemas = generateJsonLd(breadcrumbMetadata);
    const webPageSchema = schemas[2];
    expect(webPageSchema.breadcrumb).toBeDefined();
    expect(webPageSchema.breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(webPageSchema.breadcrumb.itemListElement).toHaveLength(2);
    expect(webPageSchema.breadcrumb.itemListElement[0].name).toBe("Home");
    expect(webPageSchema.breadcrumb.itemListElement[0].item).toBe("https://oxygenlow.com/");
    expect(webPageSchema.breadcrumb.itemListElement[1].name).toBe("Test");
    expect(webPageSchema.breadcrumb.itemListElement[1].item).toBe("https://oxygenlow.com/test");
  });

  it("pushes the SoftwareApplication schema to the returned array when metadata.softwareType is provided", () => {
    const softwareMetadata: RouteSeoData = { ...defaultMetadata, softwareType: "Utility" };
    const schemas = generateJsonLd(softwareMetadata);
    expect(schemas).toHaveLength(4);

    const softwareSchema = schemas[3];
    expect(softwareSchema["@type"]).toBe("SoftwareApplication");
    expect(softwareSchema.applicationCategory).toBe("Utility");
    expect(softwareSchema.name).toBe("Test H1");
  });

  it("uses a custom baseUrl instead of the default", () => {
    const customBaseUrl = "https://custom.test.com";
    const schemas = generateJsonLd(defaultMetadata, customBaseUrl);

    expect(schemas[0].url).toBe(customBaseUrl);
    expect(schemas[1].url).toBe(customBaseUrl);
    expect(schemas[2].url).toBe(`${customBaseUrl}/test`);
  });
});
