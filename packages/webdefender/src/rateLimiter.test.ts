import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should initialize and allow requests within limit', () => {
    const limiter = new RateLimiter();
    const result1 = limiter.check('1.1.1.1', 5, 60);

    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);

    limiter.destroy();
  });

  it('should block requests after limit is exceeded', () => {
    const limiter = new RateLimiter();

    // Consume all 5 tokens
    for (let i = 0; i < 5; i++) {
      limiter.check('1.1.1.1', 5, 60);
    }

    const result = limiter.check('1.1.1.1', 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);

    limiter.destroy();
  });

  it('should maintain state separately for different keys', () => {
    const limiter = new RateLimiter();

    // User 1 consumes 5 tokens
    for (let i = 0; i < 5; i++) {
      limiter.check('user1', 5, 60);
    }

    const resultUser1 = limiter.check('user1', 5, 60);
    expect(resultUser1.allowed).toBe(false);

    // User 2 should still have 5 tokens available
    const resultUser2 = limiter.check('user2', 5, 60);
    expect(resultUser2.allowed).toBe(true);
    expect(resultUser2.remaining).toBe(4);

    limiter.destroy();
  });

  it('should refill tokens after window passes', () => {
    const limiter = new RateLimiter();

    // Consume 1 token
    const r1 = limiter.check('user1', 5, 60); // remaining: 4
    expect(r1.remaining).toBe(4);

    // Advance time by 61 seconds
    vi.advanceTimersByTime(61000);

    // Tokens should be completely refilled on next check
    const r2 = limiter.check('user1', 5, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(4); // Reset to 5, consumed 1 -> 4

    limiter.destroy();
  });

  it('should not refill tokens if window has not passed completely', () => {
    const limiter = new RateLimiter();

    // Consume 2 tokens
    limiter.check('user1', 5, 60);
    limiter.check('user1', 5, 60);

    // Advance time by 30 seconds
    vi.advanceTimersByTime(30000);

    const result = limiter.check('user1', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - 3 consumptions = 2

    limiter.destroy();
  });

  it('should cleanup expired entries after 1 hour', () => {
    const limiter = new RateLimiter();

    limiter.check('user1', 5, 60);

    // We want to test private cleanup method
    // In vitest we can access it using any or ts-ignore
    const buckets = (limiter as any).buckets as Map<string, any>;

    expect(buckets.has('user1')).toBe(true);

    // Advance time by more than 1 hour (3600000 ms) + 1 ms, plus time for interval to run
    // Specifically, cleanup interval is every 60s
    // To reach maxAge of 1hr, we need at least 3600000 ms from last refill.
    vi.advanceTimersByTime(3600000 + 60000);

    expect(buckets.has('user1')).toBe(false);

    limiter.destroy();
  });

  it('should keep active entries during cleanup', () => {
    const limiter = new RateLimiter();

    limiter.check('user1', 5, 60);

    const buckets = (limiter as any).buckets as Map<string, any>;
    expect(buckets.has('user1')).toBe(true);

    // Advance time by 30 minutes
    vi.advanceTimersByTime(1800000);

    expect(buckets.has('user1')).toBe(true);

    // Activity updates lastRefill if window passed?
    // Wait, the logic updates lastRefill ONLY IF window passed.
    // Window is 60s. 30min passed > 60s, so this WILL update lastRefill.
    limiter.check('user1', 5, 60);

    // Advance by another 35 minutes
    vi.advanceTimersByTime(2100000);

    // Total time since start is 65 min, but time since last check is 35 min.
    // 35 min is less than 60 min, so it should NOT be cleaned up.
    expect(buckets.has('user1')).toBe(true);

    limiter.destroy();
  });

  it('should clear resources on destroy', () => {
    const limiter = new RateLimiter();

    limiter.check('user1', 5, 60);

    const buckets = (limiter as any).buckets;
    expect(buckets.size).toBe(1);

    limiter.destroy();

    expect(buckets.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    // Further check that timer is cleared
    // We can advance timers indefinitely and nothing should happen
    vi.advanceTimersByTime(10000000);
  });
});
