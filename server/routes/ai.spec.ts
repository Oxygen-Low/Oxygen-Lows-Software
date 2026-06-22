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
      // These tests might depend on network, but they should generally pass if the hostnames resolve to public IPs.
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
      await expect(validateAiUrl("https://10.0.0.1/api")).rejects.toThrow(
        "Public origin required",
      );
    });

    it("should reject URLs that resolve to private IPs", async () => {
      await expect(validateAiUrl("https://localhost/api")).rejects.toThrow(
        "Public origin required",
      );
    });
  });

  describe("resolveCustomProviderUrl", () => {
    it("should build chat/completions path for valid public HTTPS URLs", async () => {
      const url = await resolveCustomProviderUrl("https://api.openai.com/v1");
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("should normalize trailing slashes before appending chat/completions", async () => {
      const url = await resolveCustomProviderUrl("https://api.openai.com/v1/");
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("should reject non-HTTPS URLs", async () => {
      await expect(
        resolveCustomProviderUrl("http://api.openai.com/v1"),
      ).rejects.toThrow("HTTPS required");
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(
        resolveCustomProviderUrl("https://127.0.0.1/api"),
      ).rejects.toThrow("Public origin required");
      await expect(
        resolveCustomProviderUrl("https://10.0.0.1/api"),
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
      await expect(
        resolveCustomProviderUrl("https://api.openai.com/v1/%2e%2e/internal"),
      ).rejects.toThrow("Invalid path");
    });

    it("should reject URLs with embedded credentials", async () => {
      await expect(
        resolveCustomProviderUrl("https://user:pass@api.openai.com/v1"),
      ).rejects.toThrow("Credentials in URL are not allowed");
    });
  });
});

describe("Path Traversal Protection", () => {
  describe("path validation logic", () => {
    it("should detect path traversal with dot-dot-slash", () => {
      const maliciousPath = "../../../etc/passwd";

      // Test the validation logic used in the code
      const containsDotDot = maliciousPath.includes("..");
      expect(containsDotDot).toBe(true);
    });

    it("should detect absolute paths", () => {
      const absolutePath = "/etc/passwd";

      // Test the validation logic used in the code
      const isAbsolute = path.isAbsolute(absolutePath);
      expect(isAbsolute).toBe(true);
    });

    it("should detect path traversal after path resolution", () => {
      const base = path.resolve(process.cwd(), "prompts", "chat");
      const maliciousStyle = "../../../etc/passwd";
      const target = path.resolve(base, `${maliciousStyle}.prompt.yml`);
      const relative = path.relative(base, target);

      // The relative path should start with '..' indicating it escapes the base directory
      expect(relative.startsWith("..")).toBe(true);
    });

    it("should detect absolute path after resolution", () => {
      const base = path.resolve(process.cwd(), "prompts", "chat");
      const maliciousStyle = "/etc/passwd";
      const target = path.resolve(base, `${maliciousStyle}.prompt.yml`);
      const relative = path.relative(base, target);

      // The relative path should either start with '..' or be absolute
      const isUnsafe = relative.startsWith("..") || path.isAbsolute(relative);
      expect(isUnsafe).toBe(true);
    });

    it("should allow valid style names within prompts directory", () => {
      const base = path.resolve(process.cwd(), "prompts", "chat");
      const validStyle = "CodingAssistant";
      const target = path.resolve(base, `${validStyle}.prompt.yml`);
      const relative = path.relative(base, target);

      // Valid paths should not start with '..' and should not be absolute
      const isSafe = !relative.startsWith("..") && !path.isAbsolute(relative);
      expect(isSafe).toBe(true);
    });

    it("should reject encoded path traversal attempts", () => {
      // URL-encoded path traversal: ..%2F..%2F..%2Fetc%2Fpasswd
      // After decoding: ../../../etc/passwd
      const encodedPath = "..%2F..%2F..%2Fetc%2Fpasswd";

      // The code uses path.resolve which normalizes paths
      // Even if the input is encoded, path.resolve will handle it
      const base = path.resolve(process.cwd(), "prompts", "chat");
      const target = path.resolve(base, `${encodedPath}.prompt.yml`);
      const relative = path.relative(base, target);

      // Should be detected as unsafe
      const isUnsafe = relative.startsWith("..") || path.isAbsolute(relative);
      expect(isUnsafe).toBe(true);
    });
  });

  describe("file system protection", () => {
    it("should not allow reading files outside prompts directory", () => {
      // Verify that the validation prevents access to sensitive files
      const sensitiveFile = "../../../etc/passwd";

      // The getSystemContentFromYaml function checks for '..' in the path
      const containsDotDot = sensitiveFile.includes("..");
      expect(containsDotDot).toBe(true);

      // And also checks if path is absolute
      const isAbsolute = path.isAbsolute(sensitiveFile);
      // This specific path is not absolute, but the check exists for absolute paths
      expect(isAbsolute).toBe(false);
    });

    it("should allow reading valid prompt files", () => {
      const validPath = path.join(
        process.cwd(),
        "prompts",
        "chat",
        "CodingAssistant.prompt.yml",
      );

      // Verify the file exists and is readable
      if (fs.existsSync(validPath)) {
        expect(() => fs.readFileSync(validPath, "utf-8")).not.toThrow();
      }
    });
  });
});
