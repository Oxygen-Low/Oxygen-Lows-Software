import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import https from "https";
import { DefenderClient } from "./webdefender.js";

describe("Web Defender monitor_outbound option", () => {
  const realHttpRequest = http.request;
  const realHttpGet = http.get;
  const realHttpsRequest = https.request;
  const realHttpsGet = https.get;
  const realFetch = globalThis.fetch;

  let client: DefenderClient | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (client) {
      client.destroy();
      client = null;
    }
    http.request = realHttpRequest;
    http.get = realHttpGet;
    https.request = realHttpsRequest;
    https.get = realHttpsGet;
    globalThis.fetch = realFetch;
  });

  it("should not install OutboundMonitor when monitor_outbound is false in verify response", async () => {
    const mockConfigResponse = {
      id: "app-123",
      block_mode_enabled: true,
      config: {
        monitor_outbound: false,
        block_sql_injection: true,
      },
      routes: [],
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webdefender/verify")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        });
      }
      return Promise.resolve({
        ok: true,
        body: null,
      });
    });
    globalThis.fetch = fetchMock;

    client = new DefenderClient({
      apiKey: "def_testkey",
      apiUrl: "https://example.com",
      realtime: false,
      syncIntervalMs: 0,
    });

    await client.init();

    // Outbound monitor should NOT have patched http or fetch
    expect(http.request).toBe(realHttpRequest);
    expect(http.get).toBe(realHttpGet);
    expect(https.request).toBe(realHttpsRequest);
    expect(https.get).toBe(realHttpsGet);

    // But inbound threat scanning is still active and blocks malicious activity
    const maliciousReq = {
      ip: "192.168.1.50",
      method: "GET",
      path: "/users",
      query: { id: "admin' UNION SELECT 1, 2, 3--" },
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0",
    };

    const result = await client.handleRequest(maliciousReq);
    expect(result.blocked).toBe(true);
    expect(result.eventType).toBe("sql_injection");
  });

  it("should install OutboundMonitor by default when monitor_outbound is omitted", async () => {
    const mockConfigResponse = {
      id: "app-123",
      block_mode_enabled: true,
      config: {
        block_sql_injection: true,
      },
      routes: [],
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webdefender/verify")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        });
      }
      return Promise.resolve({
        ok: true,
        body: null,
      });
    });
    globalThis.fetch = fetchMock;

    client = new DefenderClient({
      apiKey: "def_testkey",
      apiUrl: "https://example.com",
      realtime: false,
      syncIntervalMs: 0,
    });

    await client.init();

    // Outbound monitor should have patched http.request
    expect(http.request).not.toBe(realHttpRequest);
  });

  it("should dynamically uninstall OutboundMonitor when refreshConfig changes monitor_outbound to false", async () => {
    let currentOutboundConfig = true;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webdefender/verify")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "app-123",
              block_mode_enabled: true,
              config: {
                monitor_outbound: currentOutboundConfig,
              },
              routes: [],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        body: null,
      });
    });
    globalThis.fetch = fetchMock;

    client = new DefenderClient({
      apiKey: "def_testkey",
      apiUrl: "https://example.com",
      realtime: false,
      syncIntervalMs: 0,
    });

    await client.init();
    expect(http.request).not.toBe(realHttpRequest);

    // Disable outbound monitoring dynamically
    currentOutboundConfig = false;
    await client.refreshConfig();

    // Hooks should now be uninstalled
    expect(http.request).toBe(realHttpRequest);
    expect(http.get).toBe(realHttpGet);
    expect(https.request).toBe(realHttpsRequest);
    expect(https.get).toBe(realHttpsGet);

    // Re-enable dynamically
    currentOutboundConfig = true;
    await client.refreshConfig();

    expect(http.request).not.toBe(realHttpRequest);
  });
});
