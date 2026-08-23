import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefenderClient } from "./webdefender";

describe("DefenderClient Realtime Sync", () => {
  let client: DefenderClient;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (client) {
      client.destroy();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("initializes and connects to config-stream when apiKey is present and realtime is enabled", async () => {
    const streamPayload = `event: config\ndata: ${JSON.stringify({
      id: "app-realtime-1",
      block_mode_enabled: true,
      config: {
        block_sql_injection: true,
        block_tor: true,
        block_countries: ["RU"],
        block_ips: ["1.2.3.4"],
      },
      routes: [],
    })}\n\n`;

    let readCalled = false;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (!readCalled) {
          readCalled = true;
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(streamPayload),
          });
        }
        return new Promise(() => {}); // keep open
      }),
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webdefender/verify")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "app-realtime-1",
              block_mode_enabled: false,
              config: {},
              routes: [],
            }),
        });
      }
      if (url.includes("/api/webdefender/config-stream")) {
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        });
      }
      return Promise.resolve({ ok: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    client = new DefenderClient({
      apiKey: "test-api-key",
      apiUrl: "https://oxygenlow.com",
      realtime: true,
    });

    await client.init();

    // Verify both verify and config-stream endpoints were called
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/webdefender/verify"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/webdefender/config-stream"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          Accept: "text/event-stream",
        }),
      }),
    );

    // Allow SSE reader microtasks to resolve
    await vi.advanceTimersByTimeAsync(10);

    // Now test handleRequest with the updated real-time config (IP 1.2.3.4 should be blocked)
    const result = await client.handleRequest({
      ip: "1.2.3.4",
      method: "GET",
      path: "/api/test",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla",
    });

    expect(result.blocked).toBe(true);
    expect(result.eventType).toBe("ip_block");
  });

  it("does not connect to config-stream when realtime is set to false", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webdefender/verify")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "app-realtime-2",
              block_mode_enabled: true,
              config: {},
              routes: [],
            }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    client = new DefenderClient({
      apiKey: "test-api-key",
      apiUrl: "https://oxygenlow.com",
      realtime: false,
    });

    await client.init();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/webdefender/verify"),
      expect.any(Object),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/webdefender/config-stream"),
      expect.any(Object),
    );
  });
});
