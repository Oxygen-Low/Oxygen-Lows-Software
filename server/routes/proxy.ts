import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { validateAiUrl, isPrivateIP } from "../lib/safeAiUrl.ts";

export const proxyRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ALLOWED_DOMAINS = new Set([
  "api.github.com",
  "raw.githubusercontent.com",
  "registry.npmjs.org",
]);

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
]);

const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

proxyRouter.post("/fetch", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const bodyJson = await c.req.json().catch(() => null);
    if (!bodyJson || typeof bodyJson !== "object") {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }

    const { url, options } = bodyJson;
    if (!url || typeof url !== "string") {
      return c.json({ error: "Missing url" }, 400);
    }

    // Prevent path traversal
    if (url.includes("/../") || /\/%2e%2e\//i.test(url)) {
      return c.json({ error: "Invalid path" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid url" }, 400);
    }

    if (parsedUrl.protocol !== "https:") {
      return c.json({ error: "Only HTTPS URLs are allowed" }, 400);
    }

    if (parsedUrl.username || parsedUrl.password) {
      return c.json({ error: "Credentials in URL are not allowed" }, 400);
    }

    if (parsedUrl.port && parsedUrl.port !== "443") {
      return c.json({ error: "Invalid port" }, 400);
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || isPrivateIP(hostname)) {
      return c.json({ error: "Internal or private IPs not allowed" }, 400);
    }

    if (!ALLOWED_DOMAINS.has(hostname)) {
      return c.json({ error: "Domain not allowed" }, 403);
    }

    try {
      await validateAiUrl(url);
    } catch (e: any) {
      return c.json({ error: e.message || "Invalid or unsafe URL" }, 400);
    }

    const method =
      typeof options?.method === "string"
        ? options.method.toUpperCase()
        : "GET";

    if (!ALLOWED_METHODS.has(method)) {
      return c.json({ error: "HTTP method not allowed" }, 400);
    }

    let sanitizedHeaders: Record<string, string> | undefined = undefined;
    if (
      options?.headers &&
      typeof options.headers === "object" &&
      !Array.isArray(options.headers)
    ) {
      sanitizedHeaders = {};
      for (const [k, v] of Object.entries(options.headers)) {
        if (typeof k === "string" && typeof v === "string") {
          const lowerKey = k.toLowerCase();
          if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
            sanitizedHeaders[k] = v;
          }
        }
      }
    }

    const reqBody = ["GET", "HEAD"].includes(method)
      ? undefined
      : options?.body
        ? typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body)
        : undefined;

    // redirect: "error" prevents following any HTTP redirects (3xx) for SSRF protection
    const response = await fetch(url, {
      method,
      headers: sanitizedHeaders,
      body: reqBody,
      signal: c.req.raw.signal,
      redirect: "error",
    });

    const text = await response.text();
    c.status(response.status as any);
    return c.text(text);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return c.json({ error: "Request aborted" }, 499 as any);
      }
      console.error("Proxy fetch error:", error);
      return c.json({ error: error.message }, 500);
    }
    console.error("Proxy fetch error:", error);
    return c.json({ error: "Unknown error" }, 500);
  }
});
