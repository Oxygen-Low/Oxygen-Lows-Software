import { Hono } from "hono";

export const changelogsRouter = new Hono();

const rateLimitMap = new Map<string, number[]>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 1000;

changelogsRouter.get("/", async (c) => {
  try {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const now = Date.now();
    
    let timestamps = rateLimitMap.get(ip) || [];
    timestamps = timestamps.filter(time => now - time < WINDOW_MS);
    
    if (timestamps.length >= MAX_REQUESTS) {
      return c.json({ error: "Rate limit exceeded. Maximum 5 requests per minute." }, 429 as any);
    }
    
    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);

    const token = process.env.CHANGELOGS_API;
    const headers: HeadersInit = {
      "Accept": "application/vnd.github.v3+json",
    };
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Fetch last 10 commits list
    const response = await fetch("https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits?per_page=10", { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: "Failed to fetch commits from GitHub", details: errorText }, response.status as any);
    }
    
    const data = await response.json();
    
    // Fetch detailed stats for each commit to get insertions and deletions
    const commitsWithStats = await Promise.all(
      data.map(async (commit: any) => {
        try {
          const detailRes = await fetch(`https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits/${commit.sha}`, { headers });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            return { ...commit, stats: detailData.stats };
          }
        } catch (e) {
          console.error("Failed to fetch stats for commit", commit.sha);
        }
        return commit;
      })
    );

    return c.json(commitsWithStats);
  } catch (error: any) {
    console.error("Error fetching changelogs:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});
