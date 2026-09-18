import { DefenderClient } from "./webdefender.js";
import { DefenderConfig } from "./types.js";

function isPathMatch(path: string, patterns?: (string | RegExp)[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path.startsWith(p);
    if (p instanceof RegExp) return p.test(path);
    return false;
  });
}

export async function createDefender(
  config: DefenderConfig,
  app?: any,
): Promise<any> {
  const client = new DefenderClient(config);
  await client.init(app);

  return async (c: any, next: any) => {
    try {
      const pathname = new URL(c.req.url).pathname;
      if (isPathMatch(pathname, config.excludePaths)) {
        return next();
      }

      const ip =
        c.req.header("x-forwarded-for") ||
        c.req.header("cf-connecting-ip") ||
        "unknown";
      const normalizedIp = ip.split(",")[0].trim();

      const skipBodyScan = isPathMatch(pathname, config.skipBodyScanPaths);
      let bodyStr = "";
      if (!skipBodyScan) {
        try {
          if (["POST", "PUT", "PATCH"].includes(c.req.method.toUpperCase())) {
            const raw = c.req.raw.clone();
            const text = await raw.text();
            bodyStr = text || "";
          }
        } catch (e) {
          // Can't read body, ignore
        }
      }

      // Hono parses query as Record<string, string | string[]>
      const query = c.req.queries() || {};

      const reqInfo = {
        ip: normalizedIp,
        method: c.req.method,
        path: pathname,
        query: query,
        body: bodyStr,
        headers: c.req.header(),
        userAgent: c.req.header("user-agent") || "",
        skipBodyScan,
      };

      const result = await client.handleRequest(reqInfo);

      if (result.blocked) {
        const status = (result.statusCode || 403) as any;
        const headers: Record<string, string> = {};
        if (result.rateLimitInfo) {
          headers["Retry-After"] = String(
            result.rateLimitInfo.retryAfterSeconds,
          );
          headers["RateLimit-Limit"] = String(result.rateLimitInfo.limit);
          headers["RateLimit-Remaining"] = String(
            result.rateLimitInfo.remaining,
          );
          headers["RateLimit-Reset"] = String(result.rateLimitInfo.resetAt);
        }
        return c.json(
          {
            blocked: true,
            reason: result.reason || "Request blocked by Defender",
          },
          status,
          headers,
        );
      }

      await next();
    } catch (error) {
      console.error("[Defender] Hono middleware error:", error);
      await next();
    }
  };
}
