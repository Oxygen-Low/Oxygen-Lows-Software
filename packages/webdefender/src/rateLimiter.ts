export class RateLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.buckets = new Map();
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  check(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Calculate token refill
    const timePassed = now - bucket.lastRefill;
    if (timePassed >= windowMs) {
      bucket.tokens = maxRequests;
      bucket.lastRefill = now;
    }

    // Try to consume a token
    let allowed = false;
    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      allowed = true;
    }

    return {
      allowed,
      remaining: bucket.tokens,
      resetAt: bucket.lastRefill + windowMs,
    };
  }

  private cleanup() {
    const now = Date.now();
    // Assume longest window is 1 hour for cleanup purposes
    const maxAge = 3600000;

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}
