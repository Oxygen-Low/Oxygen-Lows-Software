import { DefenderClient, IncomingRequest } from "./webdefender.js";

function isPathMatch(path: string, patterns?: (string | RegExp)[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path.startsWith(p);
    if (p instanceof RegExp) return p.test(path);
    return false;
  });
}

export function createExpressMiddleware(client: DefenderClient) {
  const config = client.getConfig();

  return async (req: any, res: any, next: any) => {
    try {
      const path = req.path || req.url || "/";
      if (isPathMatch(path, config.excludePaths)) {
        return next();
      }

      const ip =
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        req.ip ||
        "unknown";
      const normalizedIp = Array.isArray(ip)
        ? ip[0]
        : typeof ip === "string"
          ? ip.split(",")[0].trim()
          : String(ip);

      const skipBodyScan = isPathMatch(path, config.skipBodyScanPaths);
      let bodyStr = "";
      if (!skipBodyScan && req.body) {
        if (typeof req.body === "string") {
          bodyStr = req.body;
        } else if (Buffer.isBuffer(req.body)) {
          bodyStr = req.body.toString();
        } else if (typeof req.body === "object") {
          try {
            bodyStr = JSON.stringify(req.body);
          } catch (e) {}
        }
      }

      const defenderReq: IncomingRequest = {
        ip: normalizedIp,
        method: req.method || "GET",
        path,
        query: req.query || {},
        body: bodyStr,
        headers: req.headers || {},
        userAgent: req.headers["user-agent"] || "",
        skipBodyScan,
      };

      const result = await client.handleRequest(defenderReq);

      if (result.blocked) {
        return res.status(403).json({
          blocked: true,
          reason: result.reason || "Request blocked by Defender",
        });
      }

      next();
    } catch (error) {
      // Fail open on error
      console.error("[Defender] Express middleware error:", error);
      next();
    }
  };
}
