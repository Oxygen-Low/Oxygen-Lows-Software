import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const changelogsRouter = new Hono();

// A01: use the shared rate-limiter (handles x-forwarded-for correctly)
const apiLimiter = rateLimiter(2, 60_000, "changelogs");

// Cache for top-level commits list
let listCache: { data: any; expiry: number } | null = null;
const LIST_CACHE_TTL = 60_000; // 1 minute

// Cache for individual commit stats
const commitCache = new Map<string, { stats: any; expiry: number }>();
const COMMIT_CACHE_TTL = 3600_000; // 1 hour

// Periodically clean up expired commit cache entries
setInterval(() => {
  const now = Date.now();
  for (const [sha, entry] of commitCache) {
    if (now > entry.expiry) {
      commitCache.delete(sha);
    }
  }
}, 600_000).unref(); // Clean up every 10 minutes, unref so it doesn't block exit

changelogsRouter.get("/", apiLimiter, async (c) => {
  try {
    const token = process.env.CHANGELOGS_API;
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let data;
    const now = Date.now();
    if (listCache && now < listCache.expiry) {
      data = listCache.data;
    } else {
      const response = await fetch(
        "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits?per_page=10",
        { headers },
      );

      if (!response.ok) {
        // A08: do not leak upstream error bodies to the client
        console.error(
          "GitHub commits fetch failed:",
          response.status,
          await response.text(),
        );
        return c.json(
          { error: "Failed to fetch changelogs" },
          response.status as any,
        );
      }

      data = await response.json();
      listCache = { data, expiry: now + LIST_CACHE_TTL };
    }

    const commitsWithStats = await Promise.all(
      data.map(async (commit: any) => {
        const now = Date.now();
        const cached = commitCache.get(commit.sha);

        if (cached && now < cached.expiry) {
          return { ...commit, stats: cached.stats };
        }

        try {
          const detailRes = await fetch(
            `https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits/${commit.sha}`,
            { headers },
          );
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            commitCache.set(commit.sha, {
              stats: detailData.stats,
              expiry: now + COMMIT_CACHE_TTL,
            });
            return { ...commit, stats: detailData.stats };
          }
        } catch (e) {
          console.error("Failed to fetch stats for commit", commit.sha);
        }
        return commit;
      }),
    );

    return c.json(commitsWithStats);
  } catch (error: any) {
    // A09: log internally, return generic message to client
    console.error("Error fetching changelogs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
