import { DefenderClient, IncomingRequest, RequestResult } from "./webdefender.js";
import { DefenderConfig } from "./types.js";

export interface CloudflareDefenderConfig extends Omit<DefenderConfig, "apiKey"> {
  apiKey?: string;
  customBlockResponse?: (
    result: RequestResult,
    request: Request,
    env?: any,
    ctx?: any,
  ) => Response | Promise<Response>;
}

export type CloudflareDefenderConfigResolver =
  | CloudflareDefenderConfig
  | ((env: any) => CloudflareDefenderConfig);

export interface CloudflareWorkerHandler {
  fetch: (request: Request, env: any, ctx: any) => Response | Promise<Response>;
  [key: string]: any;
}

export interface CloudflareDefenderInstance {
  client: DefenderClient;
  protect: (
    request: Request,
    env?: any,
    ctx?: any,
  ) => Promise<Response | null>;
  wrap: <T extends CloudflareWorkerHandler>(worker: T) => T;
  flush: () => Promise<void>;
}

function isPathMatch(path: string, patterns?: (string | RegExp)[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path.startsWith(p);
    if (p instanceof RegExp) return p.test(path);
    return false;
  });
}

function resolveConfig(
  configInput?: CloudflareDefenderConfigResolver,
  env?: any,
): CloudflareDefenderConfig {
  let resolved: CloudflareDefenderConfig = {};
  if (typeof configInput === "function") {
    resolved = configInput(env) || {};
  } else if (configInput) {
    resolved = { ...configInput };
  }

  if (!resolved.apiKey) {
    resolved.apiKey =
      env?.DEFENDER_API_KEY ||
      env?.WEBDEFENDER_API_KEY ||
      (typeof process !== "undefined"
        ? process.env?.DEFENDER_API_KEY || process.env?.WEBDEFENDER_API_KEY
        : undefined) ||
      "";
  }

  if (!resolved.apiUrl && (env?.DEFENDER_API_URL || env?.WEBDEFENDER_API_URL)) {
    resolved.apiUrl = env?.DEFENDER_API_URL || env?.WEBDEFENDER_API_URL;
  }

  return resolved;
}

export function createCloudflareDefender(
  configInput?: CloudflareDefenderConfigResolver,
): CloudflareDefenderInstance {
  let client: DefenderClient | null = null;
  let initPromise: Promise<void> | null = null;
  let resolvedConfig: CloudflareDefenderConfig | null = null;

  function getClient(env?: any): {
    client: DefenderClient;
    config: CloudflareDefenderConfig;
  } {
    if (!client) {
      resolvedConfig = resolveConfig(configInput, env);
      client = new DefenderClient({
        ...resolvedConfig,
        apiKey: resolvedConfig.apiKey || "",
        edgeMode: true,
        deferRefresh: true,
      });
    }
    return { client, config: resolvedConfig || {} };
  }

  const protect = async (
    request: Request,
    env?: any,
    ctx?: any,
  ): Promise<Response | null> => {
    try {
      const { client: defenderClient, config } = getClient(env);
      const url = new URL(request.url);

      // Path exclusion check
      if (isPathMatch(url.pathname, config.excludePaths)) {
        return null;
      }

      // Initialize client lazily inside the request execution context
      if (!initPromise) {
        initPromise = defenderClient.init().catch((err) => {
          console.error("[Defender] Cloudflare Worker init error:", err);
        });
      }
      if (ctx?.waitUntil) {
        ctx.waitUntil(initPromise);
      }

      // Prioritize Cloudflare connecting IP
      const rawIp =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const normalizedIp = rawIp.split(",")[0].trim();

      // Read request body safely if needed
      const skipBodyScan = isPathMatch(url.pathname, config.skipBodyScanPaths);
      let bodyStr = "";
      if (
        !skipBodyScan &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        try {
          bodyStr = await request.clone().text();
        } catch (_) {}
      }

      // Parse query params
      const query: Record<string, string | string[]> = {};
      url.searchParams.forEach((val, key) => {
        if (query[key]) {
          if (Array.isArray(query[key])) {
            (query[key] as string[]).push(val);
          } else {
            query[key] = [query[key] as string, val];
          }
        } else {
          query[key] = val;
        }
      });

      // Headers map
      const headers: Record<string, string> = {};
      request.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });

      // If Cloudflare request.cf country is available, expose via cf-ipcountry header
      const cfCountry = (request as any).cf?.country;
      if (cfCountry && !headers["cf-ipcountry"]) {
        headers["cf-ipcountry"] = cfCountry;
      }

      const reqInfo: IncomingRequest = {
        ip: normalizedIp,
        method: request.method,
        path: url.pathname,
        query,
        body: bodyStr,
        headers,
        userAgent: request.headers.get("user-agent") || "",
        skipBodyScan,
      };

      const result = await defenderClient.handleRequest(reqInfo);

      // Register non-blocking telemetry via ctx.waitUntil
      if (ctx?.waitUntil) {
        if (result.logPromise) {
          ctx.waitUntil(result.logPromise);
        }
        if (defenderClient.hasPendingLogs()) {
          ctx.waitUntil(defenderClient.flushBatchAsync());
        }
      }

      if (result.isDecoy) {
        const responseHeaders: Record<string, string> = {};
        if (result.decoyContentType) {
          responseHeaders["Content-Type"] = result.decoyContentType;
        }
        return new Response(result.decoyContent ?? "", {
          status: result.statusCode || 200,
          headers: responseHeaders,
        });
      }

      if (result.blocked) {
        if (config.customBlockResponse) {
          return await config.customBlockResponse(result, request, env, ctx);
        }

        const status = result.statusCode || 403;
        const responseHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (result.rateLimitInfo) {
          responseHeaders["Retry-After"] = String(
            result.rateLimitInfo.retryAfterSeconds,
          );
          responseHeaders["RateLimit-Limit"] = String(
            result.rateLimitInfo.limit,
          );
          responseHeaders["RateLimit-Remaining"] = String(
            result.rateLimitInfo.remaining,
          );
          responseHeaders["RateLimit-Reset"] = String(
            result.rateLimitInfo.resetAt,
          );
        }

        return new Response(
          JSON.stringify({
            blocked: true,
            reason: result.reason || "Request blocked by Defender",
          }),
          {
            status,
            headers: responseHeaders,
          },
        );
      }

      return null;
    } catch (error) {
      console.error("[Defender] Cloudflare Worker protection error:", error);
      return null; // Fail open
    }
  };

  const wrap = <T extends CloudflareWorkerHandler>(worker: T): T => {
    return {
      ...worker,
      async fetch(request: Request, env: any, ctx: any) {
        const blockedResponse = await protect(request, env, ctx);
        if (blockedResponse) {
          return blockedResponse;
        }
        return worker.fetch(request, env, ctx);
      },
    };
  };

  const flush = async () => {
    if (client) {
      await client.flushBatchAsync();
    }
  };

  return {
    get client() {
      return getClient().client;
    },
    protect,
    wrap,
    flush,
  };
}

export function withDefender<T extends CloudflareWorkerHandler>(
  worker: T,
  configInput?: CloudflareDefenderConfigResolver,
): T {
  const defender = createCloudflareDefender(configInput);
  return defender.wrap(worker);
}
