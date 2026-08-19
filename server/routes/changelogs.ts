import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const changelogsRouter = new Hono();

// A01: use the shared rate-limiter (handles x-forwarded-for correctly)
const apiLimiter = rateLimiter(2, 60_000, "changelogs");

export interface ChangelogCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

export function parseAtomFeed(xml: string): ChangelogCommit[] {
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  return entries.map((entryXml) => {
    // Extract SHA
    const idMatch = entryXml.match(
      /<id[^>]*>[\s\S]*?Commit\/([a-f0-9]{7,40})[\s\S]*?<\/id>/i,
    );
    const linkMatch = entryXml.match(
      /<link[^>]*href=["']([^"']*\/commit\/([a-f0-9]{7,40}))["']/i,
    );
    const sha = idMatch?.[1] || linkMatch?.[2] || "";

    // Extract HTML link
    const html_url =
      linkMatch?.[1] ||
      (sha
        ? `https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/${sha}`
        : "");

    // Extract author name
    const authorMatch = entryXml.match(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
    );
    const authorName = authorMatch
      ? decodeHtmlEntities(authorMatch[1].trim())
      : "Unknown";

    // Extract date
    const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/i);
    const date = updatedMatch
      ? updatedMatch[1].trim()
      : new Date().toISOString();

    // Extract commit message from <content> (which has <pre>...</pre>) or fallback to <title>
    let message = "";
    const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    if (contentMatch) {
      const rawContent = decodeHtmlEntities(contentMatch[1]);
      const preMatch = rawContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (preMatch) {
        message = decodeHtmlEntities(preMatch[1]).trim();
      } else {
        message = rawContent.replace(/<[^>]*>/g, "").trim();
      }
    }

    if (!message) {
      const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        message = decodeHtmlEntities(titleMatch[1]).trim();
      }
    }

    return {
      sha,
      html_url,
      commit: {
        message,
        author: {
          name: authorName,
          date,
        },
      },
    };
  });
}

// Cache for changelogs commits list
let listCache: { data: ChangelogCommit[]; expiry: number } | null = null;
const LIST_CACHE_TTL = 60_000; // 1 minute

export const ATOM_FEED_URL =
  "https://github.com/Oxygen-Low/Oxygen-Lows-Software/commits.atom";

export function clearChangelogsCache() {
  listCache = null;
}

changelogsRouter.get("/", apiLimiter, async (c) => {
  try {
    const now = Date.now();
    if (listCache && now < listCache.expiry) {
      return c.json(listCache.data);
    }

    const response = await fetch(ATOM_FEED_URL, {
      headers: {
        Accept:
          "application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
        "User-Agent": "Oxygen-Lows-Software",
      },
    });

    if (!response.ok) {
      // A08: do not leak upstream error bodies to the client
      console.error(
        "GitHub Atom commits feed fetch failed:",
        response.status,
        await response.text(),
      );
      return c.json(
        { error: "Failed to fetch changelogs" },
        response.status as any,
      );
    }

    const xml = await response.text();
    const commits = parseAtomFeed(xml);

    listCache = { data: commits, expiry: now + LIST_CACHE_TTL };

    return c.json(commits);
  } catch (error: any) {
    // A09: log internally, return generic message to client
    console.error("Error fetching changelogs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
