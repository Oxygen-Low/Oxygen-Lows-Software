import { describe, it, expect } from "vitest";
import { DefenderClient } from "../../../packages/webdefender/src/webdefender";

describe("DefenderClient Individual IP blocking", () => {
  it("blocks requests originating from blocked individual IPs", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    // Set custom blockIps in appConfig
    (client as any).appConfig.blockIps = ["198.51.100.42", "203.0.113.99", "2001:db8::1"];

    // Test blocked IPv4 #1
    const req1 = await client.handleRequest({
      ip: "198.51.100.42",
      method: "GET",
      path: "/api/data",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req1.blocked).toBe(true);
    expect(req1.eventType).toBe("ip_block");
    expect(req1.reason).toBe("IP blocked: 198.51.100.42");

    // Test blocked IPv4 #2 (with whitespace/case insensitivity)
    const req2 = await client.handleRequest({
      ip: "203.0.113.99",
      method: "POST",
      path: "/login",
      query: {},
      body: "user=admin",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req2.blocked).toBe(true);
    expect(req2.eventType).toBe("ip_block");
    expect(req2.reason).toBe("IP blocked: 203.0.113.99");

    // Test blocked IPv6
    const req3 = await client.handleRequest({
      ip: "2001:db8::1",
      method: "GET",
      path: "/status",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req3.blocked).toBe(true);
    expect(req3.eventType).toBe("ip_block");
    expect(req3.reason).toBe("IP blocked: 2001:db8::1");

    client.destroy();
  });

  it("allows requests from non-blocked IPs", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    (client as any).appConfig.blockIps = ["198.51.100.42"];

    const req = await client.handleRequest({
      ip: "198.51.100.43",
      method: "GET",
      path: "/public",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req.blocked).toBe(false);
    expect(req.eventType).toBe("allowed");

    client.destroy();
  });

  it("handles empty or undefined blockIps list gracefully", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    (client as any).appConfig.blockIps = [];

    const req = await client.handleRequest({
      ip: "1.1.1.1",
      method: "GET",
      path: "/home",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req.blocked).toBe(false);
    expect(req.eventType).toBe("allowed");

    client.destroy();
  });
});
