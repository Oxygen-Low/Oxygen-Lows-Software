import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  serverStorage,
  sanitizePath,
  assertSafeStoragePath,
  STORAGE_DIR,
} from "./storage.ts";
import {
  DATA_DIR,
  assertSafeDataPath,
} from "./dataStore.ts";
import {
  getUserPasskeys,
  saveUserPasskey,
} from "./passkeys.ts";
import {
  getHostConfig,
  getPinnedModels,
  saveHostConfig,
  savePinnedModels,
} from "../routes/models.ts";
import {
  getQuarantinedIncidentById,
} from "./safety/ncmecReporter.ts";

describe("File Inclusion & Path Traversal Security Suite", () => {
  const canaryFile = path.resolve(process.cwd(), "file_inclusion_canary.tmp");

  beforeEach(() => {
    try {
      if (fs.existsSync(canaryFile)) fs.unlinkSync(canaryFile);
    } catch {}
    fs.writeFileSync(canaryFile, "TOP_SECRET_CANARY_DATA", "utf-8");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(canaryFile)) fs.unlinkSync(canaryFile);
    } catch {}
  });

  describe("assertSafeStoragePath & serverStorage", () => {
    const traversalEscapePaths = [
      "../../file_inclusion_canary.tmp",
      "..\\..\\file_inclusion_canary.tmp",
      "folder/../../../file_inclusion_canary.tmp",
      "folder/..\\../file_inclusion_canary.tmp",
      "C:\\Windows\\System32\\cmd.exe",
    ];

    it("assertSafeStoragePath should reject traversal attempts outside base directory", () => {
      for (const p of traversalEscapePaths) {
        expect(() => assertSafeStoragePath(STORAGE_DIR, p)).toThrow(
          "Invalid path: path traversal detected",
        );
      }
    });

    it("serverStorage.download should reject traversal payloads and never read external canary", async () => {
      for (const p of traversalEscapePaths) {
        const res = await serverStorage.download("Storage", p);
        expect(res.data).toBeNull();
        expect(res.error).toBeDefined();
      }
      // Canary should still exist unmodified
      expect(fs.readFileSync(canaryFile, "utf-8")).toBe("TOP_SECRET_CANARY_DATA");
    });

    it("serverStorage.upload should reject traversal escape payloads", async () => {
      for (const p of traversalEscapePaths) {
        const res = await serverStorage.upload("Storage", p, Buffer.from("attack"));
        expect(res.data).toBeNull();
        expect(res.error).toBeDefined();
      }
    });

    it("serverStorage.list should reject traversal escape payloads", async () => {
      for (const p of traversalEscapePaths) {
        const res = await serverStorage.list("Storage", p);
        expect(res.data).toEqual([]);
      }
    });
  });

  describe("assertSafeDataPath & dataStore", () => {
    const maliciousPaths = [
      "../../file_inclusion_canary.tmp",
      "..\\..\\file_inclusion_canary.tmp",
      "users/../../../file_inclusion_canary.tmp",
      "C:\\boot.ini",
      "/etc/shadow",
    ];

    it("assertSafeDataPath should reject path traversal outside DATA_DIR", () => {
      for (const p of maliciousPaths) {
        expect(() => assertSafeDataPath(p)).toThrow("Path traversal attempt detected");
      }
    });

    it("assertSafeDataPath should accept valid subpaths inside DATA_DIR", () => {
      const valid = path.join(DATA_DIR, "1", "user.json");
      expect(assertSafeDataPath(valid)).toBe(path.resolve(valid));
    });
  });

  describe("Passkeys path traversal protection", () => {
    const maliciousUserIds = [
      "../../etc",
      "..\\..\\Windows",
      "../file_inclusion_canary",
      "user/../../canary",
    ];

    it("getUserPasskeys should return empty array and not throw on path traversal userIds", () => {
      for (const uid of maliciousUserIds) {
        const passkeys = getUserPasskeys(uid);
        expect(passkeys).toEqual([]);
      }
    });
  });

  describe("Models host config and pinned models protection", () => {
    const maliciousUserIds = [
      "../../etc",
      "..\\..\\Windows",
      "../file_inclusion_canary",
    ];

    it("getHostConfig should return default config without accessing outside files", () => {
      for (const uid of maliciousUserIds) {
        const config = getHostConfig(uid);
        expect(config.enabled).toBe(false);
        expect(config.models).toEqual([]);
      }
    });

    it("getPinnedModels should return empty array without accessing outside files", () => {
      for (const uid of maliciousUserIds) {
        const pinned = getPinnedModels(uid);
        expect(pinned).toEqual([]);
      }
    });
  });

  describe("NCMEC Reporter quarantine protection", () => {
    const maliciousReportIds = [
      "../../file_inclusion_canary",
      "..\\..\\Windows\\System32\\cmd",
      "../../../etc/passwd",
    ];

    it("getQuarantinedIncidentById should return null for traversal reportIds", () => {
      for (const id of maliciousReportIds) {
        const report = getQuarantinedIncidentById(id);
        expect(report).toBeNull();
      }
    });
  });
});
