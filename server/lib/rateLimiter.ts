import { Context, Next } from "hono";

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Suitable for Cloudflare Workers where each isolate has its own memory.
 * State resets on cold starts, which is acceptable for basic abuse prevention.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory growth
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) {
      buckets.delete(key);
    }
  }
}

/**
 * Creates a rate limiting middleware.
 *
 * @param maxRequests - Maximum number of requests allowed within the window
 * @param windowMs   - Time window in milliseconds
 * @param prefix     - Namespace prefix to isolate different limiters
 */
export function rateLimiter(
  maxRequests: number,
  windowMs: number,
  prefix = "global",
) {
  return async (c: Context, next: Next) => {
    cleanup();

    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const key = `${prefix}:${clientIp}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    await next();
  };
}
