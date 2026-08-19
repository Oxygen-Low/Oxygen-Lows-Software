import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import https from 'https';
import { OutboundMonitor } from './outbound';
import { OutboundConnection } from './types';

describe('OutboundMonitor', () => {
  let monitor: OutboundMonitor;
  let reported: OutboundConnection[];
  let reporter: (conn: OutboundConnection) => void;
  const ignoreHost = 'internal.example.com';

  const realHttpRequest = http.request;
  const realHttpGet = http.get;
  const realHttpsRequest = https.request;
  const realHttpsGet = https.get;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    reported = [];
    reporter = (conn: OutboundConnection) => {
      reported.push(conn);
    };
  });

  afterEach(() => {
    if (monitor) {
      monitor.uninstall();
    }
    http.request = realHttpRequest;
    http.get = realHttpGet;
    https.request = realHttpsRequest;
    https.get = realHttpsGet;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  describe('Lifecycle & Idempotency', () => {
    it('should patch http, https, and fetch on install and restore them on uninstall', () => {
      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();

      expect(http.request).not.toBe(realHttpRequest);
      expect(http.get).not.toBe(realHttpGet);
      expect(https.request).not.toBe(realHttpsRequest);
      expect(https.get).not.toBe(realHttpsGet);
      expect(globalThis.fetch).not.toBe(realFetch);

      monitor.uninstall();

      expect(http.request).toBe(realHttpRequest);
      expect(http.get).toBe(realHttpGet);
      expect(https.request).toBe(realHttpsRequest);
      expect(https.get).toBe(realHttpsGet);
      expect(globalThis.fetch).toBe(realFetch);
    });

    it('should be idempotent on multiple install calls', () => {
      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();
      const patchedRequest = http.request;

      monitor.install();
      expect(http.request).toBe(patchedRequest);

      monitor.uninstall();
      expect(http.request).toBe(realHttpRequest);
    });

    it('should safely handle uninstall when not installed or when called repeatedly', () => {
      monitor = new OutboundMonitor(reporter, ignoreHost);
      expect(() => monitor.uninstall()).not.toThrow();

      monitor.install();
      expect(() => monitor.uninstall()).not.toThrow();
      expect(() => monitor.uninstall()).not.toThrow();
      expect(http.request).toBe(realHttpRequest);
    });

    it('should handle environments where globalThis.fetch is undefined', () => {
      const originalFetch = globalThis.fetch;
      // @ts-ignore
      delete globalThis.fetch;

      try {
        monitor = new OutboundMonitor(reporter, ignoreHost);
        expect(() => monitor.install()).not.toThrow();
        expect(globalThis.fetch).toBeUndefined();
        expect(() => monitor.uninstall()).not.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('HTTP Interception', () => {
    let mockOriginalHttpRequest: any;
    let mockOriginalHttpGet: any;

    beforeEach(() => {
      mockOriginalHttpRequest = vi.fn().mockReturnValue({ end: vi.fn() });
      mockOriginalHttpGet = vi.fn().mockReturnValue({ end: vi.fn() });
      http.request = mockOriginalHttpRequest;
      http.get = mockOriginalHttpGet;

      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();
    });

    it('should report http.request with string URL (default and custom port)', () => {
      http.request('http://api.example.com/data');
      expect(reported).toEqual([
        { host: 'api.example.com', port: 80, protocol: 'http:' },
      ]);

      http.request('http://custom.example.com:8080/data');
      expect(reported[1]).toEqual({
        host: 'custom.example.com',
        port: 8080,
        protocol: 'http:',
      });
      expect(mockOriginalHttpRequest).toHaveBeenCalledTimes(2);
    });

    it('should report http.request with URL object', () => {
      http.request(new URL('http://url-obj.example.com:3000/path'));
      expect(reported).toEqual([
        { host: 'url-obj.example.com', port: 3000, protocol: 'http:' },
      ]);
    });

    it('should report http.request with options object (hostname, host, port, and default)', () => {
      http.request({ hostname: 'options-host.example.com', port: 9000 } as any);
      expect(reported[0]).toEqual({
        host: 'options-host.example.com',
        port: 9000,
        protocol: 'http:',
      });

      http.request({ host: 'fallback-host.example.com' } as any);
      expect(reported[1]).toEqual({
        host: 'fallback-host.example.com',
        port: 80,
        protocol: 'http:',
      });

      http.request({ path: '/relative' } as any);
      expect(reported[2]).toEqual({
        host: 'localhost',
        port: 80,
        protocol: 'http:',
      });
    });

    it('should report http.get and invoke original method with all arguments and context', () => {
      const cb = vi.fn();
      http.get('http://get.example.com:8000/info', cb);

      expect(reported).toEqual([
        { host: 'get.example.com', port: 8000, protocol: 'http:' },
      ]);
      expect(mockOriginalHttpGet).toHaveBeenCalledWith(
        'http://get.example.com:8000/info',
        cb
      );
    });

    it('should pass through multiple arguments and preserve this context', () => {
      const customContext = { name: 'custom-http-context' };
      const options = { path: '/test' };
      const cb = vi.fn();

      http.request.call(customContext, 'http://api.example.com', options as any, cb);

      expect(mockOriginalHttpRequest).toHaveBeenCalledWith(
        'http://api.example.com',
        options,
        cb
      );
    });
  });

  describe('HTTPS Interception', () => {
    let mockOriginalHttpsRequest: any;
    let mockOriginalHttpsGet: any;

    beforeEach(() => {
      mockOriginalHttpsRequest = vi.fn().mockReturnValue({ end: vi.fn() });
      mockOriginalHttpsGet = vi.fn().mockReturnValue({ end: vi.fn() });
      https.request = mockOriginalHttpsRequest;
      https.get = mockOriginalHttpsGet;

      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();
    });

    it('should report https.request with string URL (default and custom port)', () => {
      https.request('https://secure.example.com/api');
      expect(reported).toEqual([
        { host: 'secure.example.com', port: 443, protocol: 'https:' },
      ]);

      https.request('https://secure.example.com:8443/api');
      expect(reported[1]).toEqual({
        host: 'secure.example.com',
        port: 8443,
        protocol: 'https:',
      });
    });

    it('should report https.request with URL object and options object', () => {
      https.request(new URL('https://secure-url.example.com:9443/v1'));
      expect(reported[0]).toEqual({
        host: 'secure-url.example.com',
        port: 9443,
        protocol: 'https:',
      });

      https.request({ hostname: 'secure-opts.example.com', port: 443 } as any);
      expect(reported[1]).toEqual({
        host: 'secure-opts.example.com',
        port: 443,
        protocol: 'https:',
      });
    });

    it('should report https.get and invoke original method', () => {
      https.get('https://secure-get.example.com/v1');
      expect(reported).toEqual([
        { host: 'secure-get.example.com', port: 443, protocol: 'https:' },
      ]);
      expect(mockOriginalHttpsGet).toHaveBeenCalled();
    });
  });

  describe('Fetch Interception', () => {
    let mockOriginalFetch: any;

    beforeEach(() => {
      mockOriginalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok'),
      });
      globalThis.fetch = mockOriginalFetch;

      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();
    });

    it('should report fetch calls with string URL (http and https)', async () => {
      const res1 = await fetch('https://api.github.com/users');
      expect(await res1.text()).toBe('ok');
      expect(reported[0]).toEqual({
        host: 'api.github.com',
        port: 443,
        protocol: 'https:',
      });

      await fetch('http://api.insecure.com:8080/data');
      expect(reported[1]).toEqual({
        host: 'api.insecure.com',
        port: 8080,
        protocol: 'http:',
      });
    });

    it('should report fetch calls with URL objects', async () => {
      await fetch(new URL('https://fetch-url.example.com:3000/path'));
      expect(reported[0]).toEqual({
        host: 'fetch-url.example.com',
        port: 3000,
        protocol: 'https:',
      });

      await fetch(new URL('http://fetch-http-url.example.com/path'));
      expect(reported[1]).toEqual({
        host: 'fetch-http-url.example.com',
        port: 80,
        protocol: 'http:',
      });
    });

    it('should report fetch calls with Request objects or objects with url property', async () => {
      const req = new Request('https://req.example.com:9443/v1');
      await fetch(req);
      expect(reported[0]).toEqual({
        host: 'req.example.com',
        port: 9443,
        protocol: 'https:',
      });

      await fetch({ url: 'https://obj.example.com:7000/test' } as any);
      expect(reported[1]).toEqual({
        host: 'obj.example.com',
        port: 7000,
        protocol: 'https:',
      });
    });

    it('should ignore objects without url property in fetch', async () => {
      const customObj = {
        toString: () => 'https://tostring-url.example.com:8888/search',
      };
      await fetch(customObj as any);
      expect(reported).toHaveLength(0);
    });

    it('should forward init options and return original fetch response', async () => {
      const initOptions = { method: 'POST', body: JSON.stringify({ key: 'value' }) };
      await fetch('https://post.example.com', initOptions);

      expect(mockOriginalFetch).toHaveBeenCalledWith(
        'https://post.example.com',
        initOptions
      );
    });

    it('should propagate fetch errors from original fetch', async () => {
      mockOriginalFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(fetch('https://failing.example.com')).rejects.toThrow(
        'Network failure'
      );
      expect(reported).toEqual([
        { host: 'failing.example.com', port: 443, protocol: 'https:' },
      ]);
    });
  });

  describe('ignoreHost Filtering', () => {
    it('should not report connections when destination matches ignoreHost', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;
      http.request = vi.fn().mockReturnValue({ end: vi.fn() });
      https.request = vi.fn().mockReturnValue({ end: vi.fn() });

      monitor = new OutboundMonitor(reporter, 'ignore-me.example.com');
      monitor.install();

      http.request('http://ignore-me.example.com/api');
      https.request('https://ignore-me.example.com/api');
      await fetch('https://ignore-me.example.com/api');

      expect(reported).toHaveLength(0);

      // Other host should still be reported
      await fetch('https://allow-me.example.com/api');
      expect(reported).toEqual([
        { host: 'allow-me.example.com', port: 443, protocol: 'https:' },
      ]);
    });
  });

  describe('Robustness and Error Handling', () => {
    it('should handle malformed or unparseable URLs without crashing', async () => {
      const mockHttpRequest = vi.fn().mockReturnValue({ end: vi.fn() });
      http.request = mockHttpRequest;

      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      monitor = new OutboundMonitor(reporter, ignoreHost);
      monitor.install();

      // Passing invalid URL string to http.request
      expect(() => http.request('invalid-url-with-no-protocol')).not.toThrow();
      expect(mockHttpRequest).toHaveBeenCalled();

      // Passing invalid string to fetch
      await expect(fetch('not a valid url' as any)).resolves.toBeDefined();
      expect(mockFetch).toHaveBeenCalled();

      // Passing null or undefined
      expect(() => http.request(null as any)).not.toThrow();
      expect(mockHttpRequest).toHaveBeenCalledTimes(2);

      // Reporter should not have captured unparseable invalid URLs
      expect(reported).toHaveLength(0);
    });

    it('should not crash or prevent request if reporter throws an exception', async () => {
      const errorReporter = vi.fn().mockImplementation(() => {
        throw new Error('Reporter failure');
      });

      const mockHttpRequest = vi.fn().mockReturnValue({ end: vi.fn() });
      http.request = mockHttpRequest;

      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = mockFetch;

      monitor = new OutboundMonitor(errorReporter, ignoreHost);
      monitor.install();

      expect(() => http.request('http://api.example.com/data')).not.toThrow();
      expect(mockHttpRequest).toHaveBeenCalled();

      await expect(fetch('https://api.example.com/data')).resolves.toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
