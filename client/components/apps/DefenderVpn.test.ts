import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VpnDetector } from "../../../packages/webdefender/src/vpn";
import { DefenderClient } from "../../../packages/webdefender/src/webdefender";

describe("VpnDetector in client context", () => {
  let detector: VpnDetector;

  beforeEach(() => {
    detector = new VpnDetector();
  });

  afterEach(() => {
    detector.destroy();
  });

  it("identifies known VPNBook server IPs", () => {
    expect(detector.isVpn("198.7.58.196")).toBe(true);
    expect(detector.isVpn("178.238.224.78")).toBe(true);
    expect(detector.isVpn("94.23.238.163")).toBe(true);
  });

  it("identifies known NordVPN and Surfshark CIDR ranges", () => {
    // NordVPN range 185.128.24.0/22
    expect(detector.isVpn("185.128.24.1")).toBe(true);
    expect(detector.isVpn("185.128.25.50")).toBe(true);
    // Surfshark range 156.146.32.0/20
    expect(detector.isVpn("156.146.33.10")).toBe(true);
  });

  it("returns false for regular residential/public IPs", () => {
    expect(detector.isVpn("8.8.8.8")).toBe(false);
    expect(detector.isVpn("140.82.112.4")).toBe(false);
  });
});

describe("DefenderClient VPN blocking", () => {
  it("blocks requests originating from known VPN IPs when blockVpn is enabled", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    // 1. VPNBook IP
    const req1 = await client.handleRequest({
      ip: "198.7.58.196",
      method: "GET",
      path: "/secure-resource",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req1.blocked).toBe(true);
    expect(req1.eventType).toBe("vpn");
    expect(req1.reason).toContain("VPN connection detected");

    // 2. NordVPN IP
    const req2 = await client.handleRequest({
      ip: "185.128.24.42",
      method: "POST",
      path: "/api/submit",
      query: {},
      body: "data=test",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req2.blocked).toBe(true);
    expect(req2.eventType).toBe("vpn");
    expect(req2.reason).toContain("VPN connection detected");

    client.destroy();
  });

  it("allows requests from known VPN IPs when blockVpn is disabled", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    // Disable blockVpn in appConfig
    (client as any).appConfig.blockVpn = false;

    const req = await client.handleRequest({
      ip: "198.7.58.196",
      method: "GET",
      path: "/unrestricted",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req.blocked).toBe(false);
    expect(req.eventType).toBe("allowed");

    client.destroy();
  });

  it("allows dynamically added custom VPN IPs to be blocked", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    const detector = (client as any).vpnDetector as VpnDetector;
    detector.addVpnIp("203.0.113.99");

    const req = await client.handleRequest({
      ip: "203.0.113.99",
      method: "GET",
      path: "/api/check",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req.blocked).toBe(true);
    expect(req.eventType).toBe("vpn");

    client.destroy();
  });
});
