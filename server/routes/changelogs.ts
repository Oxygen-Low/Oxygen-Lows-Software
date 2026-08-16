import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const changelogsRouter = new Hono();

// A01: use the shared rate-limiter (handles x-forwarded-for correctly)
const apiLimiter = rateLimiter(2, 60_000, "changelogs");

changelogsRouter.get("/", apiLimiter, async (c) => {
  try {
    const token = process.env.CHANGELOGS_API;
    const headers: HeadersInit = {
      "Accept": "application/vnd.github.v3+json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

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

    const data = await response.json();

    const commitsWithStats = await Promise.all(
      data.map(async (commit: any) => {
        try {
          const detailRes = await fetch(
            `https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits/${commit.sha}`,
            { headers },
          );
          if (detailRes.ok) {
            const detailData = await detailRes.json();
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
