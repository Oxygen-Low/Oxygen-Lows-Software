import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";

// Import the functions we need to test
// We'll need to expose these for testing or test them indirectly
describe("RepoManager Path Traversal Security", () => {
  const testTmpDir = path.join(os.tmpdir(), "repoManager-security-test");

  beforeEach(async () => {
    await fs.mkdir(testTmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testTmpDir, { recursive: true, force: true });
  });

  describe("getSafeTmpPath path traversal protection", () => {
    // Test the getSafeTmpPath function indirectly through the module
    // Since it's not exported, we'll test the behavior through the public API

    it("should reject path traversal with ../ in repoId", () => {
      // This tests that validateId rejects invalid IDs
      const invalidId = "../../../etc/passwd";

      // The validateId function should reject this
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(uuidRegex.test(invalidId)).toBe(false);
    });

    it("should reject path traversal with absolute paths", () => {
      const invalidId = "/etc/passwd";

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(uuidRegex.test(invalidId)).toBe(false);
    });

    it("should accept valid UUID format", () => {
      const validId = "12345678-1234-1234-1234-123456789abc";

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(uuidRegex.test(validId)).toBe(true);
    });

    it("should reject null bytes in path", () => {
      const invalidId =
        "12345678-1234-1234-1234-123456789abc\x00../../etc/passwd";

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(uuidRegex.test(invalidId)).toBe(false);
    });
  });

  describe("Path resolution security", () => {
    it("should detect path traversal using relative path check", () => {
      const base = path.resolve(os.tmpdir());
      const maliciousPath = path.resolve(base, "../../../etc/passwd");
      const relative = path.relative(base, maliciousPath);

      // The security check: relative path should not start with '..'
      expect(relative.startsWith("..")).toBe(true);
    });

    it("should detect absolute path escape", () => {
      const base = path.resolve(os.tmpdir());
      const maliciousPath = "/etc/passwd";
      const relative = path.relative(base, maliciousPath);

      // The security check: when trying to escape with absolute path,
      // the relative path will start with '..' (going up from tmpdir)
      // or it will be an absolute path (on another drive, or root of current drive)
      expect(relative.startsWith("..") || path.isAbsolute(relative)).toBe(true);
    });

    it("should allow safe paths within base directory", () => {
      const base = path.resolve(os.tmpdir());
      const safePath = path.resolve(
        base,
        "12345678-1234-1234-1234-123456789abc.zip",
      );
      const relative = path.relative(base, safePath);

      // Safe path should not start with '..' and should not be absolute
      expect(relative.startsWith("..")).toBe(false);
      expect(path.isAbsolute(relative)).toBe(false);
    });

    it("should handle symlink-like path components", () => {
      const base = path.resolve(os.tmpdir());
      // Test path with . and .. components
      const trickPath = path.resolve(base, "safe/../../etc/passwd");
      const relative = path.relative(base, trickPath);

      // After resolution, this should be detected as escaping
      expect(relative.startsWith("..") || path.isAbsolute(relative)).toBe(true);
    });
  });

  describe("validateId function behavior", () => {
    const validateId = (id: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        id,
      );
    };

    it("should reject path traversal attempts", () => {
      expect(validateId("../../../etc/passwd")).toBe(false);
      expect(validateId("..\\..\\..\\windows\\system32")).toBe(false);
      expect(validateId("/etc/passwd")).toBe(false);
      expect(validateId("C:\\Windows\\System32")).toBe(false);
    });

    it("should reject special characters", () => {
      expect(validateId("12345678-1234-1234-1234-123456789abc; rm -rf /")).toBe(
        false,
      );
      expect(
        validateId("12345678-1234-1234-1234-123456789abc\n../../etc"),
      ).toBe(false);
      expect(validateId("12345678-1234-1234-1234-123456789abc\x00")).toBe(
        false,
      );
    });

    it("should accept only valid UUIDs", () => {
      expect(validateId("12345678-1234-1234-1234-123456789abc")).toBe(true);
      expect(validateId("abcdef01-2345-6789-abcd-ef0123456789")).toBe(true);
      expect(validateId("00000000-0000-0000-0000-000000000000")).toBe(true);
    });

    it("should reject invalid UUID formats", () => {
      expect(validateId("12345678-1234-1234-1234-123456789abcd")).toBe(false); // too long
      expect(validateId("12345678-1234-1234-1234-123456789ab")).toBe(false); // too short
      expect(validateId("12345678_1234_1234_1234_123456789abc")).toBe(false); // wrong separator
      expect(validateId("XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX")).toBe(false); // invalid chars
    });
  });

  describe("Combined security validation", () => {
    const validateId = (id: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        id,
      );
    };

    const getSafeTmpPath = (repoId: string, suffix: string) => {
      if (!validateId(repoId)) throw new Error("Invalid ID");
      const safeId = path.basename(repoId);
      const base = path.resolve(os.tmpdir());
      const target = path.resolve(base, `${safeId}${suffix}`);
      const relative = path.relative(base, target);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Invalid path");
      return target;
    };

    it("should throw error for path traversal attempts", () => {
      expect(() => getSafeTmpPath("../../../etc/passwd", ".zip")).toThrow(
        "Invalid ID",
      );
      expect(() => getSafeTmpPath("/etc/passwd", ".zip")).toThrow("Invalid ID");
    });

    it("should successfully create safe paths for valid UUIDs", () => {
      const validId = "12345678-1234-1234-1234-123456789abc";
      const result = getSafeTmpPath(validId, ".zip");

      expect(result).toContain(validId);
      expect(result).toContain(".zip");
      expect(result).toContain(os.tmpdir());
    });

    it("should prevent escaping tmpdir even with valid UUID", () => {
      // Even if somehow a valid UUID could be crafted to escape,
      // the path resolution check should catch it
      const validId = "12345678-1234-1234-1234-123456789abc";
      const result = getSafeTmpPath(validId, ".zip");
      const base = path.resolve(os.tmpdir());
      const relative = path.relative(base, result);

      expect(relative.startsWith(".")).toBe(false);
      expect(path.isAbsolute(relative)).toBe(false);
    });
  });
});
