import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  changelogsRouter,
  decodeHtmlEntities,
  parseAtomFeed,
  clearChangelogsCache,
  ATOM_FEED_URL,
} from "./changelogs.ts";

describe("Changelogs Route & Atom Parser", () => {
  beforeEach(() => {
    clearChangelogsCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("decodeHtmlEntities", () => {
    it("should decode named HTML entities", () => {
      expect(decodeHtmlEntities("&amp;&lt;&gt;&quot;&#39;&apos;")).toBe(
        `&<>"''`,
      );
    });

    it("should decode numeric decimal and hex entities", () => {
      expect(decodeHtmlEntities("&#65;&#66;&#x43;")).toBe("ABC");
    });

    it("should return unchanged string if no entities exist", () => {
      expect(decodeHtmlEntities("Hello World 123!")).toBe("Hello World 123!");
    });
  });

  describe("parseAtomFeed", () => {
    it("should parse an Atom XML feed with entries", () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Grit::Commit/abc1234567890abcdef1234567890abcdef12345</id>
    <link type="text/html" rel="alternate" href="https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/abc1234567890abcdef1234567890abcdef12345"/>
    <title>Feat: Add new cool feature</title>
    <updated>2026-08-19T12:00:00Z</updated>
    <author>
      <name>Oxygen-Low</name>
    </author>
    <content type="html">
      &lt;pre style=&#39;white-space:pre-wrap;width:81ex&#39;&gt;Feat: Add new cool feature

- Added submodule
- Fixed edge cases&lt;/pre&gt;
    </content>
  </entry>
</feed>`;

      const result = parseAtomFeed(sampleXml);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: "abc1234567890abcdef1234567890abcdef12345",
        html_url:
          "https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/abc1234567890abcdef1234567890abcdef12345",
        commit: {
          message:
            "Feat: Add new cool feature\n\n- Added submodule\n- Fixed edge cases",
          author: {
            name: "Oxygen-Low",
            date: "2026-08-19T12:00:00Z",
          },
        },
      });
    });

    it("should fallback to title when content is not provided", () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Grit::Commit/1234567</id>
    <link type="text/html" rel="alternate" href="https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/1234567"/>
    <title>Simple commit title</title>
    <updated>2026-08-19T10:00:00Z</updated>
    <author>
      <name>Developer</name>
    </author>
  </entry>
</feed>`;

      const result = parseAtomFeed(sampleXml);
      expect(result).toHaveLength(1);
      expect(result[0].commit.message).toBe("Simple commit title");
      expect(result[0].commit.author.name).toBe("Developer");
    });

    it("should return empty array for empty XML or feeds with no entries", () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
      const result = parseAtomFeed(sampleXml);
      expect(result).toEqual([]);
    });
  });

  describe("GET /api/changelogs Endpoint", () => {
    let ipCounter = 1;
    const makeRequest = (app: Hono) =>
      app.request("/api/changelogs", {
        headers: { "x-forwarded-for": `192.168.1.${ipCounter++}` },
      });

    it("should fetch, parse and return changelogs from Atom feed", async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Grit::Commit/11223344556677889900aabbccddeeff00112233</id>
    <link type="text/html" rel="alternate" href="https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/11223344556677889900aabbccddeeff00112233"/>
    <title>Fix bug</title>
    <updated>2026-08-19T14:00:00Z</updated>
    <author>
      <name>Author Name</name>
    </author>
    <content type="html">
      &lt;pre&gt;Fix bug&lt;/pre&gt;
    </content>
  </entry>
</feed>`;

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(mockXml, {
          status: 200,
          headers: { "Content-Type": "application/atom+xml" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const app = new Hono();
      app.route("/api/changelogs", changelogsRouter);

      const res = await makeRequest(app);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].sha).toBe("11223344556677889900aabbccddeeff00112233");
      expect(fetchMock).toHaveBeenCalledWith(
        ATOM_FEED_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "Oxygen-Lows-Software",
          }),
        }),
      );
    });

    it("should use cache on subsequent requests within TTL", async () => {
      const mockXml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:github.com,2008:Grit::Commit/9999999</id><updated>2026-08-19T00:00:00Z</updated><author><name>Dev</name></author><title>Cached</title></entry></feed>`;
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(mockXml, { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const app = new Hono();
      app.route("/api/changelogs", changelogsRouter);

      const ip = `192.168.2.${ipCounter++}`;
      const res1 = await app.request("/api/changelogs", {
        headers: { "x-forwarded-for": ip },
      });
      expect(res1.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const res2 = await app.request("/api/changelogs", {
        headers: { "x-forwarded-for": ip },
      });
      expect(res2.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Served from cache
    });

    it("should handle upstream error from GitHub gracefully", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response("Internal Server Error", { status: 502 }),
        );
      vi.stubGlobal("fetch", fetchMock);

      const app = new Hono();
      app.route("/api/changelogs", changelogsRouter);

      const res = await makeRequest(app);
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data).toEqual({ error: "Failed to fetch changelogs" });
    });

    it("should handle network failure gracefully with 500", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new Error("Network disconnect"));
      vi.stubGlobal("fetch", fetchMock);

      const app = new Hono();
      app.route("/api/changelogs", changelogsRouter);

      const res = await makeRequest(app);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });
});
