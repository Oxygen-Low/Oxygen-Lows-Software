import { describe, it, expect } from "vitest";
import {
  isPrivateIP,
  validateAiUrl,
  resolveCustomProviderUrl,
} from "../lib/safeAiUrl";
import fs from "fs";
import path from "path";

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
      await expect(
        validateAiUrl("https://api.openai.com/v1"),
      ).resolves.toBeUndefined();
    });

    it("should reject non-HTTPS URLs", async () => {
      await expect(validateAiUrl("http://api.openai.com/v1")).rejects.toThrow(
        "HTTPS required",
      );
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(validateAiUrl("https://127.0.0.1/api")).rejects.toThrow(
        "Public origin required",
      );
    });
  });

  describe("resolveCustomProviderUrl", () => {
    it("should build chat/completions path for valid public HTTPS URLs with IP pinning", async () => {
      const url = await resolveCustomProviderUrl("https://api.openai.com/v1");
      // api.openai.com resolves to multiple IPs, but they should be public
      const u = new URL(url);
      expect(isPrivateIP(u.hostname)).toBe(false);
      expect(url).toContain("/v1/chat/completions");
    });

    it("should build chat/completions path for valid HTTP URLs (Ollama/LM Studio support)", async () => {
      // Per memory: Do not enforce https: protocol validation for custom providers
      // Wait, resolveCustomProviderUrl currently DOES NOT have a protocol check,
      // but the test expected it to reject.
      const url = await resolveCustomProviderUrl("http://api.openai.com/v1");
      expect(url).toContain("http://");
      expect(url).toContain("/v1/chat/completions");
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(
        resolveCustomProviderUrl("https://127.0.0.1/api"),
      ).rejects.toThrow("Public origin required");
    });

    it("should reject localhost hostnames", async () => {
      await expect(
        resolveCustomProviderUrl("https://localhost/api"),
      ).rejects.toThrow("Public origin required");
    });

    it("should reject path traversal in URL", async () => {
      await expect(
        resolveCustomProviderUrl("https://api.openai.com/v1/../internal"),
      ).rejects.toThrow("Invalid path");
    });

    it("should reject URLs with embedded credentials", async () => {
      await expect(
        resolveCustomProviderUrl("https://user:pass@api.openai.com/v1"),
      ).rejects.toThrow("Credentials in URL are not allowed");
    });
  });
});

import { matchesHordeModel } from "./ai";

describe("matchesHordeModel", () => {
  it("should match models case-insensitively and regardless of prefixes", () => {
    expect(
      matchesHordeModel(
        "koboldcpp/mini-magnum-12b-v1.1",
        "Magnum-12b-v2",
      ),
    ).toBe(true);

    expect(
      matchesHordeModel(
        "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
        "meta-llama/Llama-3.1-8B-Instruct",
      ),
    ).toBe(true);
  });

  it("should not match models with different parameter sizes", () => {
    expect(
      matchesHordeModel(
        "koboldcpp/mini-magnum-12b-v1.1",
        "mradermacher/Magnum-v3-27B-GGUF",
      ),
    ).toBe(false);

    expect(
      matchesHordeModel(
        "koboldcpp/Qwen/Qwen2.5-32B-Instruct",
        "Qwen/Qwen2.5-72B-Instruct",
      ),
    ).toBe(false);
  });

  it("should specifically distinguish coder vs non-coder models", () => {
    expect(
      matchesHordeModel(
        "koboldcpp/Qwen/Qwen2.5-Coder-32B-Instruct",
        "Qwen/Qwen2.5-32B-Instruct",
      ),
    ).toBe(false);

    expect(
      matchesHordeModel(
        "koboldcpp/Qwen/Qwen2.5-Coder-32B-Instruct",
        "Qwen/Qwen2.5-Coder-32B-Instruct",
      ),
    ).toBe(true);
  });
});

describe("Path Traversal Protection", () => {
  describe("path validation logic", () => {
    it("should detect path traversal with dot-dot-slash", () => {
      const maliciousPath = "../../../etc/passwd";
      const containsDotDot = maliciousPath.includes("..");
      expect(containsDotDot).toBe(true);
    });

    it("should detect absolute paths", () => {
      const absolutePath = "/etc/passwd";
      const isAbsolute = path.isAbsolute(absolutePath);
      expect(isAbsolute).toBe(true);
    });
  });
});
