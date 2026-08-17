import { describe, it, expect } from "vitest";
import { isPrivateIP } from "./safeAiUrl";

describe("isPrivateIP", () => {
  describe("IPv4", () => {
    it("should return true for local 0.x.x.x addresses", () => {
      expect(isPrivateIP("0.0.0.0")).toBe(true);
      expect(isPrivateIP("0.255.255.255")).toBe(true);
    });

    it("should return true for localhost 127.x.x.x addresses", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("127.255.255.255")).toBe(true);
    });

    it("should return true for private 10.x.x.x addresses", () => {
      expect(isPrivateIP("10.0.0.0")).toBe(true);
      expect(isPrivateIP("10.255.255.255")).toBe(true);
    });

    it("should return true for private 172.16.x.x - 172.31.x.x addresses", () => {
      expect(isPrivateIP("172.16.0.0")).toBe(true);
      expect(isPrivateIP("172.31.255.255")).toBe(true);
    });

    it("should return true for private 192.168.x.x addresses", () => {
      expect(isPrivateIP("192.168.0.0")).toBe(true);
      expect(isPrivateIP("192.168.255.255")).toBe(true);
    });

    it("should return true for link-local 169.254.x.x addresses", () => {
      expect(isPrivateIP("169.254.0.0")).toBe(true);
      expect(isPrivateIP("169.254.255.255")).toBe(true);
    });

    it("should return false for public IPv4 addresses", () => {
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("172.15.255.255")).toBe(false);
      expect(isPrivateIP("172.32.0.0")).toBe(false);
      expect(isPrivateIP("192.169.0.0")).toBe(false);
      expect(isPrivateIP("169.255.0.0")).toBe(false);
    });
  });

  describe("IPv6", () => {
    it("should return true for localhost ::1", () => {
      expect(isPrivateIP("::1")).toBe(true);
      expect(isPrivateIP("0:0:0:0:0:0:0:1")).toBe(true);
    });

    it("should return true for IPv4-mapped private addresses", () => {
      expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
    });

    it("should return false for IPv4-mapped public addresses", () => {
      expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
      expect(isPrivateIP("::ffff:1.1.1.1")).toBe(false);
    });

    it("should return true for Unique Local Addresses (fc00::/7)", () => {
      expect(isPrivateIP("fc00::1")).toBe(true);
      expect(isPrivateIP("fd00::1")).toBe(true);
    });

    it("should return true for Link-Local Addresses (fe80::/10)", () => {
      expect(isPrivateIP("fe80::1")).toBe(true);
      expect(isPrivateIP("fe90::1")).toBe(true);
      expect(isPrivateIP("fea0::1")).toBe(true);
      expect(isPrivateIP("feb0::1")).toBe(true);
    });

    it("should return false for public IPv6 addresses", () => {
      expect(isPrivateIP("2001:4860:4860::8888")).toBe(false); // Google Public DNS
      expect(isPrivateIP("2606:4700:4700::1111")).toBe(false); // Cloudflare Public DNS
    });
  });

  describe("Invalid IPs", () => {
    it("should return false for invalid IP strings", () => {
      expect(isPrivateIP("not-an-ip")).toBe(false);
      expect(isPrivateIP("")).toBe(false);
      expect(isPrivateIP("256.256.256.256")).toBe(false);
    });
  });
});
