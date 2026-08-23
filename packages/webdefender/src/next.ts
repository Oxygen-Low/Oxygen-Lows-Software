import { DefenderClient } from "./webdefender.js";
import { DefenderConfig } from "./types.js";

export function createNextDefender(config: DefenderConfig) {
  const client = new DefenderClient(config);
  // Fire-and-forget init
  client.init().catch(console.error);

  return async (request: any, NextResponse: any) => {
    try {
      const ip =
        request.headers.get("x-forwarded-for") || request.ip || "unknown";
      const normalizedIp = ip.split(",")[0].trim();

      let bodyStr = "";
      if (request.method !== "GET" && request.method !== "HEAD") {
        try {
          bodyStr = await request.clone().text();
        } catch (e) {}
      }

      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const headersObj: Record<string, string> = {};
      request.headers.forEach((val: string, key: string) => {
        headersObj[key] = val;
      });

      const reqInfo = {
        ip: normalizedIp,
        method: request.method,
        path: url.pathname,
        query: queryParams,
        body: bodyStr,
        headers: headersObj,
        userAgent: request.headers.get("user-agent") || "",
      };

      const result = await client.handleRequest(reqInfo);

      if (result.blocked) {
        return NextResponse.json(
          {
            blocked: true,
            reason: result.reason || "Request blocked by Defender",
          },
          { status: 403 },
        );
      }

      return NextResponse.next();
    } catch (error) {
      console.error("[Defender] Next.js middleware error:", error);
      return NextResponse.next();
    }
  };
}
