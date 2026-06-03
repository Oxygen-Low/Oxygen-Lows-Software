import { describe, it, expect } from "vitest";
import { isPrivateIP, validateAiUrl } from "./ai";

describe("SSRF Validation", () => {
  describe("isPrivateIP", () => {
    it("should identify private IPv4 addresses", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("172.31.255.255")).toBe(true);
      expect(isPrivateIP("192.168.1.1")).toBe(true);
      expect(isPrivateIP("169.254.169.254")).toBe(true);
    });

    it("should identify public IPv4 addresses", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("93.184.216.34")).toBe(false);
    });

    it("should identify private IPv6 addresses", () => {
      expect(isPrivateIP("::1")).toBe(true);
      expect(isPrivateIP("fc00::1")).toBe(true);
      expect(isPrivateIP("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
      expect(isPrivateIP("fe80::1")).toBe(true);
      // IPv4-mapped IPv6 addresses
      expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
    });

    it("should identify public IPv6 addresses", () => {
      expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("validateAiUrl", () => {
    it("should allow valid public HTTPS URLs", async () => {
      // These tests might depend on network, but they should generally pass if the hostnames resolve to public IPs.
      await expect(validateAiUrl("https://api.openai.com/v1")).resolves.toBeUndefined();
    });

    it("should reject non-HTTPS URLs", async () => {
      await expect(validateAiUrl("http://api.openai.com/v1")).rejects.toThrow("HTTPS required");
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(validateAiUrl("https://127.0.0.1/api")).rejects.toThrow("Public origin required");
      await expect(validateAiUrl("https://10.0.0.1/api")).rejects.toThrow("Public origin required");
    });

    it("should reject URLs that resolve to private IPs", async () => {
       await expect(validateAiUrl("https://localhost/api")).rejects.toThrow("Public origin required");
    });
  });
});
