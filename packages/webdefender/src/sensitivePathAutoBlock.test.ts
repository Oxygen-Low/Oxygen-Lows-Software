import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DefenderClient } from "./webdefender.js";

describe("Sensitive path auto-block", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseConfig = {
    blockModeEnabled: true,
    blockSensitivePaths: true,
    autoBlockSensitivePaths: true,
    sensitivePathThreshold: 3,
    sensitivePathWindowSeconds: 20,
    sensitivePathBanDurationSeconds: 600, // 10 minutes
    blockAdminBannedIps: false,
    adminBannedIps: [],
    blockIps: [],
    blockCountries: [],
    routes: [],
  };

  it("blocks individual sensitive path attempts with sensitive_path eventType", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = { ...baseConfig };

    const res1 = await client.handleRequest({
      ip: "198.51.100.5",
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(res1.blocked).toBe(true);
    expect(res1.eventType).toBe("sensitive_path");
    expect(res1.reason).toContain("Sensitive path probe detected");

    // Regular path should still be allowed since threshold (3) was not reached
    const res2 = await client.handleRequest({
      ip: "198.51.100.5",
      method: "GET",
      path: "/api/users",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(res2.blocked).toBe(false);
    expect(res2.eventType).toBe("allowed");
  });

  it("automatically blocks the IP for 10 minutes after 3 attempts within 20 seconds", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = { ...baseConfig };

    const ip = "198.51.100.10";

    // Attempt 1 at t = 0s
    const r1 = await client.handleRequest({
      ip,
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(r1.blocked).toBe(true);
    expect(r1.eventType).toBe("sensitive_path");

    // Attempt 2 at t = 5s
    vi.advanceTimersByTime(5000);
    const r2 = await client.handleRequest({
      ip,
      method: "GET",
      path: "/.git/config",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(r2.blocked).toBe(true);
    expect(r2.eventType).toBe("sensitive_path");

    // Regular request at t = 10s should still succeed (only 2 attempts so far)
    vi.advanceTimersByTime(5000);
    const rValid = await client.handleRequest({
      ip,
      method: "GET",
      path: "/home",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rValid.blocked).toBe(false);

    // Attempt 3 at t = 12s (within 20s window of attempt 1) -> triggers 10 min ban
    vi.advanceTimersByTime(2000);
    const r3 = await client.handleRequest({
      ip,
      method: "GET",
      path: "/wp-login.php",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(r3.blocked).toBe(true);
    expect(r3.eventType).toBe("sensitive_path");

    // Now, any subsequent request from that IP (even safe routes) must be blocked as ip_block
    vi.advanceTimersByTime(1000);
    const rBlocked = await client.handleRequest({
      ip,
      method: "GET",
      path: "/about-us",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rBlocked.blocked).toBe(true);
    expect(rBlocked.eventType).toBe("ip_block");
    expect(rBlocked.reason).toBe(
      "IP temporarily blocked for 10 minutes: repeated sensitive path attempts",
    );

    // Still blocked at 9 minutes and 50 seconds into the ban
    vi.advanceTimersByTime(9 * 60 * 1000 + 49 * 1000);
    const rStillBlocked = await client.handleRequest({
      ip,
      method: "GET",
      path: "/",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rStillBlocked.blocked).toBe(true);
    expect(rStillBlocked.eventType).toBe("ip_block");

    // After 10 minutes (600s), the ban expires
    vi.advanceTimersByTime(15 * 1000);
    const rUnbanned = await client.handleRequest({
      ip,
      method: "GET",
      path: "/",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rUnbanned.blocked).toBe(false);
    expect(rUnbanned.eventType).toBe("allowed");

    // The counter was reset, so 1 new probe after unban does not immediately ban the IP
    const rNewProbe = await client.handleRequest({
      ip,
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rNewProbe.blocked).toBe(true);
    expect(rNewProbe.eventType).toBe("sensitive_path");

    const rSafeAfter = await client.handleRequest({
      ip,
      method: "GET",
      path: "/",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rSafeAfter.blocked).toBe(false);
  });

  it("does not trigger auto-ban if 3 attempts are spread over more than 20 seconds", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = { ...baseConfig };

    const ip = "198.51.100.20";

    // Attempt 1 at t = 0s
    await client.handleRequest({
      ip,
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });

    // Advance 12s -> t = 12s, Attempt 2
    vi.advanceTimersByTime(12000);
    await client.handleRequest({
      ip,
      method: "GET",
      path: "/.git/config",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });

    // Advance 15s -> t = 27s. Attempt 1 has expired (older than 20s from now)
    vi.advanceTimersByTime(15000);
    await client.handleRequest({
      ip,
      method: "GET",
      path: "/wp-login.php",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });

    // Safe route should NOT be blocked because within any 20s window there were only 2 attempts
    const rSafe = await client.handleRequest({
      ip,
      method: "GET",
      path: "/api/status",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rSafe.blocked).toBe(false);
    expect(rSafe.eventType).toBe("allowed");
  });

  it("does not auto-block when autoBlockSensitivePaths is false", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = {
      ...baseConfig,
      autoBlockSensitivePaths: false,
    };

    const ip = "198.51.100.30";

    for (let i = 0; i < 5; i++) {
      const res = await client.handleRequest({
        ip,
        method: "GET",
        path: "/.env",
        query: {},
        body: "",
        headers: {},
        userAgent: "test",
      });
      expect(res.blocked).toBe(true);
      expect(res.eventType).toBe("sensitive_path");
    }

    // Regular path should still be allowed
    const safe = await client.handleRequest({
      ip,
      method: "GET",
      path: "/dashboard",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(safe.blocked).toBe(false);
  });

  it("respects custom threshold and window configurations", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = {
      ...baseConfig,
      sensitivePathThreshold: 2,
      sensitivePathWindowSeconds: 5,
      sensitivePathBanDurationSeconds: 120, // 2 minutes
    };

    const ip = "198.51.100.40";

    // Attempt 1
    await client.handleRequest({
      ip,
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });

    // Attempt 2 within 5s -> threshold 2 reached
    vi.advanceTimersByTime(2000);
    await client.handleRequest({
      ip,
      method: "GET",
      path: "/.env.local",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });

    // Should be banned for 2 minutes
    const rBlocked = await client.handleRequest({
      ip,
      method: "GET",
      path: "/",
      query: {},
      body: "",
      headers: {},
      userAgent: "test",
    });
    expect(rBlocked.blocked).toBe(true);
    expect(rBlocked.eventType).toBe("ip_block");
    expect(rBlocked.reason).toBe(
      "IP temporarily blocked for 2 minutes: repeated sensitive path attempts",
    );
  });
});
