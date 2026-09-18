import { describe, it, expect } from "vitest";
import { DefenderClient } from "./webdefender.js";
import { matchesIpOrCidr, parseCidr, isIpInCidr, ipToNumber } from "./vpn.js";
import { createExpressMiddleware } from "./middleware.js";

describe("CIDR and IP Matching", () => {
  it("should parse CIDR blocks correctly", () => {
    const cidr = parseCidr("192.168.1.0/24");
    expect(cidr).not.toBeNull();
    const ipNum = ipToNumber("192.168.1.45");
    expect(ipNum).not.toBeNull();
    expect(isIpInCidr(ipNum!, cidr!)).toBe(true);

    const outsideNum = ipToNumber("192.168.2.1");
    expect(isIpInCidr(outsideNum!, cidr!)).toBe(false);
  });

  it("should match exact IPs and CIDR subnets using matchesIpOrCidr", () => {
    const patterns = ["10.0.0.1", "192.168.1.0/24", "172.16.0.0/12"];

    expect(matchesIpOrCidr("10.0.0.1", patterns)).toBe(true);
    expect(matchesIpOrCidr("10.0.0.2", patterns)).toBe(false);
    expect(matchesIpOrCidr("192.168.1.50", patterns)).toBe(true);
    expect(matchesIpOrCidr("192.168.2.50", patterns)).toBe(false);
    expect(matchesIpOrCidr("172.16.5.1", patterns)).toBe(true);
    expect(matchesIpOrCidr("172.31.255.254", patterns)).toBe(true);
    expect(matchesIpOrCidr("172.32.0.1", patterns)).toBe(false);
  });
});

describe("WebDefender 1.9.0 End-to-End Protections", () => {
  it("should bypass all inspections for allowlisted IPs and CIDRs", async () => {
    const client = new DefenderClient({
      apiKey: "",
      offlineMode: true,
      allowlistIps: ["10.50.0.0/16", "203.0.113.195"],
    });
    await client.init();

    // Even with aggressive XSS payload and blocked user-agent, allowlisted IP is permitted
    const resAllowlisted = await client.handleRequest({
      ip: "10.50.12.34",
      method: "POST",
      path: "/api/submit",
      query: {},
      body: "<script>alert(document.cookie)</script>",
      headers: { "user-agent": "GPTBot" },
      userAgent: "GPTBot",
    });

    expect(resAllowlisted.blocked).toBe(false);
    expect(resAllowlisted.eventType).toBe("allowed");

    const resAllowlistedExact = await client.handleRequest({
      ip: "203.0.113.195",
      method: "POST",
      path: "/api/submit",
      query: {},
      body: "<script>alert(document.cookie)</script>",
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resAllowlistedExact.blocked).toBe(false);
    expect(resAllowlistedExact.eventType).toBe("allowed");

    // Non-allowlisted IP with XSS is blocked
    const resBlocked = await client.handleRequest({
      ip: "198.51.100.22",
      method: "POST",
      path: "/api/submit",
      query: {},
      body: "<script>alert(document.cookie)</script>",
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resBlocked.blocked).toBe(true);
    expect(resBlocked.eventType).toBe("xss");
    expect(resBlocked.statusCode).toBe(403);
  });

  it("should block CIDR subnets specified in blockIps", async () => {
    const client = new DefenderClient({
      apiKey: "",
      offlineMode: true,
    });
    await client.init();

    // Set blockIps containing a subnet
    (client as any).appConfig.blockIps = ["198.51.100.0/24"];

    const resInSubnet = await client.handleRequest({
      ip: "198.51.100.42",
      method: "GET",
      path: "/test",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resInSubnet.blocked).toBe(true);
    expect(resInSubnet.eventType).toBe("ip_block");
    expect(resInSubnet.statusCode).toBe(403);

    const resOutsideSubnet = await client.handleRequest({
      ip: "198.51.101.42",
      method: "GET",
      path: "/test",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resOutsideSubnet.blocked).toBe(false);
  });

  it("should detect NoSQL injection and Prototype Pollution", async () => {
    const client = new DefenderClient({
      apiKey: "",
      offlineMode: true,
    });
    await client.init();

    const resNoSql = await client.handleRequest({
      ip: "192.0.2.1",
      method: "POST",
      path: "/login",
      query: {},
      body: '{"username": "admin", "password": {"$ne": null}}',
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resNoSql.blocked).toBe(true);
    expect(resNoSql.eventType).toBe("nosql_injection");
    expect(resNoSql.statusCode).toBe(403);

    const resProto = await client.handleRequest({
      ip: "192.0.2.1",
      method: "POST",
      path: "/update-profile",
      query: {},
      body: '{"__proto__": {"isAdmin": true}}',
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(resProto.blocked).toBe(true);
    expect(resProto.eventType).toBe("prototype_pollution");
    expect(resProto.statusCode).toBe(403);
  });

  it("should return HTTP 429 and RateLimit headers on DDoS and route rate limit violations", async () => {
    const client = new DefenderClient({
      apiKey: "",
      offlineMode: true,
    });
    await client.init();

    // Set DDoS threshold to 2 RPM
    (client as any).appConfig.ddosProtection = true;
    (client as any).appConfig.ddosThresholdRpm = 2;

    const req = {
      ip: "203.0.113.88",
      method: "GET",
      path: "/data",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0",
    };

    const req1 = await client.handleRequest(req);
    expect(req1.blocked).toBe(false);

    const req2 = await client.handleRequest(req);
    expect(req2.blocked).toBe(false);

    // Third request violates 2 RPM
    const req3 = await client.handleRequest(req);
    expect(req3.blocked).toBe(true);
    expect(req3.eventType).toBe("ddos");
    expect(req3.statusCode).toBe(429);
    expect(req3.rateLimitInfo).toBeDefined();
    expect(req3.rateLimitInfo!.limit).toBe(2);
    expect(req3.rateLimitInfo!.remaining).toBe(0);
    expect(req3.rateLimitInfo!.retryAfterSeconds).toBeGreaterThan(0);

    // Verify Express middleware attaches RateLimit headers and status 429
    const middleware = createExpressMiddleware(client);
    const headersSent: Record<string, string> = {};
    let statusSent = 0;
    let jsonSent: any = null;

    const mockRes: any = {
      setHeader: (k: string, v: string) => {
        headersSent[k] = v;
      },
      status: (s: number) => {
        statusSent = s;
        return {
          json: (j: any) => {
            jsonSent = j;
          },
        };
      },
    };

    await middleware(
      {
        ip: "203.0.113.88",
        method: "GET",
        path: "/data",
        headers: {},
      },
      mockRes,
      () => {},
    );

    expect(statusSent).toBe(429);
    expect(headersSent["RateLimit-Limit"]).toBe("2");
    expect(headersSent["RateLimit-Remaining"]).toBe("0");
    expect(headersSent["Retry-After"]).toBeDefined();
    expect(jsonSent.blocked).toBe(true);
  });
});
