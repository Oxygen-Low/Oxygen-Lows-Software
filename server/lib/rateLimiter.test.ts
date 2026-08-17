import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimiter } from './rateLimiter';
import { Context, Next } from 'hono';

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockContext = (headersRecord: Record<string, string>) => {
    const headers = new Map(Object.entries(headersRecord));
    return {
      req: {
        header: (name: string) => headers.get(name) || undefined
      },
      header: vi.fn(),
      json: vi.fn((data, status) => ({ data, status }))
    } as unknown as Context;
  };

  const createMockNext = () => vi.fn() as Next;

  it('allows requests within limit', async () => {
    const middleware = rateLimiter(2, 1000, 'test1');
    const c = createMockContext({ 'cf-connecting-ip': '127.0.0.1' });
    const next1 = createMockNext();
    const next2 = createMockNext();

    await middleware(c, next1);
    expect(next1).toHaveBeenCalled();

    await middleware(c, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('blocks requests over limit', async () => {
    const middleware = rateLimiter(2, 1000, 'test2');
    const c = createMockContext({ 'cf-connecting-ip': '127.0.0.1' });

    await middleware(c, createMockNext());
    await middleware(c, createMockNext());

    const next3 = createMockNext();
    const result = await middleware(c, next3);

    expect(next3).not.toHaveBeenCalled();
    expect(c.header).toHaveBeenCalledWith('Retry-After', '1');
    expect(result).toEqual({
      data: { error: 'Too many requests. Please try again later.' },
      status: 429
    });
  });

  it('resets after windowMs', async () => {
    const middleware = rateLimiter(1, 1000, 'test3');
    const c = createMockContext({ 'cf-connecting-ip': '127.0.0.1' });

    await middleware(c, createMockNext());

    const next2 = createMockNext();
    await middleware(c, next2);
    expect(next2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1001);

    const next3 = createMockNext();
    await middleware(c, next3);
    expect(next3).toHaveBeenCalled();
  });

  it('isolates limits by IP', async () => {
    const middleware = rateLimiter(1, 1000, 'test4');
    const c1 = createMockContext({ 'cf-connecting-ip': '1.1.1.1' });
    const c2 = createMockContext({ 'cf-connecting-ip': '2.2.2.2' });

    const next1 = createMockNext();
    await middleware(c1, next1);
    expect(next1).toHaveBeenCalled();

    const next2 = createMockNext();
    await middleware(c2, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('falls back to x-forwarded-for if cf-connecting-ip is missing', async () => {
    const middleware = rateLimiter(1, 1000, 'test5');
    const c = createMockContext({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' });

    const next1 = createMockNext();
    await middleware(c, next1);
    expect(next1).toHaveBeenCalled();

    const next2 = createMockNext();
    await middleware(c, next2);
    expect(next2).not.toHaveBeenCalled();
  });

  it('falls back to unknown if both headers are missing', async () => {
    const middleware = rateLimiter(1, 1000, 'test6');
    const c = createMockContext({});

    const next1 = createMockNext();
    await middleware(c, next1);
    expect(next1).toHaveBeenCalled();

    const next2 = createMockNext();
    await middleware(c, next2);
    expect(next2).not.toHaveBeenCalled();
  });

  it('cleans up expired entries when cleanup interval is reached', async () => {
    const middleware = rateLimiter(1, 1000, 'test7');
    const c = createMockContext({ 'cf-connecting-ip': '5.5.5.5' });

    await middleware(c, createMockNext());

    // Advance time by cleanup interval + 1 ms to trigger cleanup on next request
    vi.advanceTimersByTime(60001);

    // Call middleware to trigger cleanup
    const next2 = createMockNext();
    await middleware(c, next2);
    expect(next2).toHaveBeenCalled();
  });
});
