import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VpnDetector, ipToNumber, parseCidr } from "./vpn.js";

describe("VpnDetector IP & CIDR helpers", () => {
  it("converts valid IPv4 strings to 32-bit unsigned integers", () => {
    expect(ipToNumber("0.0.0.0")).toBe(0);
    expect(ipToNumber("127.0.0.1")).toBe(2130706433);
    expect(ipToNumber("255.255.255.255")).toBe(4294967295);
    expect(ipToNumber("192.168.1.1")).toBe(3232235777);
  });

  it("returns null for invalid IP strings", () => {
    expect(ipToNumber("")).toBeNull();
    expect(ipToNumber("invalid")).toBeNull();
    expect(ipToNumber("256.0.0.1")).toBeNull();
    expect(ipToNumber("1.2.3")).toBeNull();
    expect(ipToNumber("1.2.3.4.5")).toBeNull();
  });

  it("parses CIDR notations correctly", () => {
    const cidr24 = parseCidr("192.168.1.0/24");
    expect(cidr24).not.toBeNull();
    expect(cidr24?.mask).toBe(4294967040); // 255.255.255.0
    expect(cidr24?.network).toBe(3232235776); // 192.168.1.0

    const cidr32 = parseCidr("10.0.0.1/32");
    expect(cidr32).not.toBeNull();
    expect(cidr32?.mask).toBe(4294967295);

    const invalid = parseCidr("10.0.0.1/35");
    expect(invalid).toBeNull();
  });
});

describe("VpnDetector detection", () => {
  let detector: VpnDetector;

  beforeEach(() => {
    detector = new VpnDetector();
  });

  afterEach(() => {
    detector.destroy();
  });

  it("matches known seed VPNBook and NordVPN IPs", () => {
    // VPNBook seed IP
    expect(detector.isVpn("198.7.58.196")).toBe(true);
    expect(detector.isVpn("178.238.224.78")).toBe(true);
    // NordVPN CIDR match: 185.128.24.0/22
    expect(detector.isVpn("185.128.24.10")).toBe(true);
    expect(detector.isVpn("185.128.27.254")).toBe(true);
    // Surfshark CIDR match: 156.146.32.0/20
    expect(detector.isVpn("156.146.35.1")).toBe(true);
    // Normal non-VPN IP
    expect(detector.isVpn("8.8.8.8")).toBe(false);
    expect(detector.isVpn("1.1.1.1")).toBe(false);
  });

  it("allows dynamically adding VPN IPs and CIDRs", () => {
    expect(detector.isVpn("100.64.0.1")).toBe(false);
    detector.addVpnIp("100.64.0.1");
    expect(detector.isVpn("100.64.0.1")).toBe(true);

    expect(detector.isVpn("10.10.5.15")).toBe(false);
    detector.addVpnCidr("10.10.0.0/16");
    expect(detector.isVpn("10.10.5.15")).toBe(true);
  });

  it("handles empty, undefined, or port-appended IP strings gracefully", () => {
    expect(detector.isVpn("")).toBe(false);
    expect(detector.isVpn("   ")).toBe(false);
    expect(detector.isVpn("198.7.58.196:443")).toBe(true);
  });

  it("handles feed refresh errors gracefully without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(detector.refresh()).resolves.toBeUndefined();
    // Seed IPs should still be preserved
    expect(detector.isVpn("198.7.58.196")).toBe(true);

    global.fetch = originalFetch;
  });
});
