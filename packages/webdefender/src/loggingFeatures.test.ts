import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefenderClient } from "./webdefender.js";

describe("WebDefender Logging Optimizations", () => {
  let fetchMock: any;

  const getEventCalls = () =>
    fetchMock.mock.calls.filter(
      (call: any) =>
        typeof call[0] === "string" && call[0].includes("/api/webdefender/event"),
    );

  function createTestClient(configOptions: any = {}) {
    const client = new DefenderClient({
      apiKey: "test-api-key",
      apiUrl: "http://localhost:3000",
      realtime: false,
      ...configOptions,
    });
    (client as any).appConfig = (client as any).normalizeConfig({
      id: "test-app",
      block_mode_enabled: true,
      config: {
        block_sql_injection: true,
        ...(configOptions.serverConfig || {}),
      },
    });
    return client;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("Batch Logging", () => {
    it("should buffer events and flush after the specified interval", async () => {
      const client = createTestClient({
        batchLogging: true,
        batchLoggingIntervalSeconds: 20,
      });

      await client.handleRequest({
        ip: "1.1.1.1",
        method: "GET",
        path: "/page1",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });

      await client.handleRequest({
        ip: "2.2.2.2",
        method: "GET",
        path: "/page2",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });

      // Initially, no fetch calls for events should have been made
      expect(getEventCalls()).toHaveLength(0);

      // Advance time by 19 seconds (not yet expired)
      vi.advanceTimersByTime(19000);
      expect(getEventCalls()).toHaveLength(0);

      // Advance time past 20 seconds
      vi.advanceTimersByTime(2000);
      const calls = getEventCalls();
      expect(calls).toHaveLength(1);

      const [url, options] = calls[0];
      expect(url).toBe("http://localhost:3000/api/webdefender/event");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].path).toBe("/page1");
      expect(body[1].path).toBe("/page2");

      client.destroy();
    });

    it("should flush early if buffer reaches 500 events before timer expires", async () => {
      const client = createTestClient({
        batchLogging: true,
        batchLoggingIntervalSeconds: 60,
      });

      for (let i = 0; i < 499; i++) {
        await client.handleRequest({
          ip: `10.0.0.${i % 250}`,
          method: "GET",
          path: `/item/${i}`,
          query: {},
          body: "",
          headers: {},
          userAgent: "browser",
        });
      }

      expect(getEventCalls()).toHaveLength(0);

      // 500th event triggers early flush
      await client.handleRequest({
        ip: "10.0.0.1",
        method: "GET",
        path: "/item/500",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });

      const calls = getEventCalls();
      expect(calls).toHaveLength(1);
      const [, options] = calls[0];
      const body = JSON.parse(options.body);
      expect(body).toHaveLength(500);

      client.destroy();
    });

    it("should flush remaining buffered events on client.destroy()", async () => {
      const client = createTestClient({
        batchLogging: true,
        batchLoggingIntervalSeconds: 30,
      });

      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/shutdown-test",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });

      expect(getEventCalls()).toHaveLength(0);

      // Destroy client
      client.destroy();

      const calls = getEventCalls();
      expect(calls).toHaveLength(1);
      const [, options] = calls[0];
      const body = JSON.parse(options.body);
      expect(body).toHaveLength(1);
      expect(body[0].path).toBe("/shutdown-test");
    });
  });

  describe("Only Logging Threats Mode", () => {
    it("should discard clean/allowed requests and only log threats", async () => {
      const client = createTestClient({
        batchLogging: false,
        onlyLogThreats: true,
      });

      // Clean request
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/home",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });

      expect(getEventCalls()).toHaveLength(0);

      // Malicious SQLi request
      await client.handleRequest({
        ip: "5.6.7.8",
        method: "POST",
        path: "/login",
        query: { user: "admin' OR 1=1--" },
        body: "",
        headers: {},
        userAgent: "browser",
      });

      const calls = getEventCalls();
      expect(calls).toHaveLength(1);
      const [, options] = calls[0];
      const payload = JSON.parse(options.body);
      expect(payload.eventType).toBe("sql_injection");
      expect(payload.ip).toBe("5.6.7.8");

      client.destroy();
    });
  });

  describe("Only Log Unique IPs Mode", () => {
    it("should suppress repeat clean requests from the same IP within cooldown", async () => {
      const client = createTestClient({
        batchLogging: false,
        logUniqueIpsOnly: true,
        uniqueIpCooldownSeconds: 300, // 5 minutes
      });

      // 1st clean request from IP 1.2.3.4 -> should be logged
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/page1",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });
      expect(getEventCalls()).toHaveLength(1);

      // 2nd clean request from IP 1.2.3.4 (1 minute later) -> suppressed
      vi.advanceTimersByTime(60000);
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/page2",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });
      expect(getEventCalls()).toHaveLength(1);

      // Clean request from a different IP 5.6.7.8 -> should be logged
      await client.handleRequest({
        ip: "5.6.7.8",
        method: "GET",
        path: "/page1",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });
      expect(getEventCalls()).toHaveLength(2);

      // Advance time past cooldown (5 minutes total since first request)
      vi.advanceTimersByTime(250000);
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/page3",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });
      expect(getEventCalls()).toHaveLength(3);

      client.destroy();
    });

    it("should always immediately log newly detected threats from an IP even if within clean cooldown", async () => {
      const client = createTestClient({
        batchLogging: false,
        logUniqueIpsOnly: true,
        uniqueIpCooldownSeconds: 300,
      });

      // IP sends clean request
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "GET",
        path: "/home",
        query: {},
        body: "",
        headers: {},
        userAgent: "browser",
      });
      expect(getEventCalls()).toHaveLength(1);

      // 10 seconds later, same IP sends an SQL injection attack
      vi.advanceTimersByTime(10000);
      await client.handleRequest({
        ip: "1.2.3.4",
        method: "POST",
        path: "/login",
        query: { id: "1' UNION SELECT * FROM users--" },
        body: "",
        headers: {},
        userAgent: "browser",
      });

      // The threat must bypass cooldown and be logged!
      const calls = getEventCalls();
      expect(calls).toHaveLength(2);
      const [, options] = calls[1];
      const payload = JSON.parse(options.body);
      expect(payload.eventType).toBe("sql_injection");
      expect(payload.ip).toBe("1.2.3.4");

      client.destroy();
    });
  });
});
