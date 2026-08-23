import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  serverStorage,
  sanitizePath,
  getMimeType,
  getFolderSize,
  getUserTotalSize,
  STORAGE_DIR,
} from "./storage.ts";

describe("Server Storage Library", () => {
  const testBucket = "test-bucket";
  const testDir = path.join(STORAGE_DIR, testBucket);

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("sanitizePath", () => {
    it("cleans leading slashes and backslashes", () => {
      expect(sanitizePath("/folder/file.txt")).toBe("folder/file.txt");
      expect(sanitizePath("\\folder\\file.txt")).toBe("folder/file.txt");
    });

    it("throws on path traversal sequences", () => {
      expect(() => sanitizePath("../secret.txt")).toThrow("Invalid path");
      expect(() => sanitizePath("folder/../../secret.txt")).toThrow(
        "Invalid path",
      );
      expect(() => sanitizePath("folder/..\0/file.txt")).toThrow(
        "Invalid path",
      );
    });
  });

  describe("getMimeType", () => {
    it("returns correct MIME types for common media and files", () => {
      expect(getMimeType("photo.png")).toBe("image/png");
      expect(getMimeType("photo.jpg")).toBe("image/jpeg");
      expect(getMimeType("song.mp3")).toBe("audio/mpeg");
      expect(getMimeType("data.json")).toBe("application/json");
      expect(getMimeType("document.pdf")).toBe("application/pdf");
      expect(getMimeType("archive.zip")).toBe("application/zip");
      expect(getMimeType("unknown.xyz123")).toBe("application/octet-stream");
    });
  });

  describe("File operations (upload, download, list, remove)", () => {
    it("uploads and downloads files successfully", async () => {
      const content = Buffer.from("Hello custom storage!");
      const uploadRes = await serverStorage.upload(
        testBucket,
        "test-user/hello.txt",
        content,
      );
      expect(uploadRes.error).toBeNull();
      expect(uploadRes.data?.path).toBe("test-user/hello.txt");

      const downloadRes = await serverStorage.download(
        testBucket,
        "test-user/hello.txt",
      );
      expect(downloadRes.error).toBeNull();
      expect(downloadRes.data?.toString()).toBe("Hello custom storage!");
    });

    it("lists files in directory with metadata", async () => {
      await serverStorage.upload(testBucket, "u1/a.txt", Buffer.from("aaa"));
      await serverStorage.upload(testBucket, "u1/b.png", Buffer.from("bbbb"));

      const listRes = await serverStorage.list(testBucket, "u1");
      expect(listRes.error).toBeNull();
      expect(listRes.data).toHaveLength(2);

      const names = listRes.data.map((f) => f.name);
      expect(names).toContain("a.txt");
      expect(names).toContain("b.png");

      const pngItem = listRes.data.find((f) => f.name === "b.png");
      expect(pngItem?.metadata.mimetype).toBe("image/png");
      expect(pngItem?.metadata.size).toBe(4);
    });

    it("removes specified files", async () => {
      await serverStorage.upload(testBucket, "u1/file1.txt", Buffer.from("1"));
      await serverStorage.upload(testBucket, "u1/file2.txt", Buffer.from("2"));

      const removeRes = await serverStorage.remove(testBucket, [
        "u1/file1.txt",
      ]);
      expect(removeRes.error).toBeNull();
      expect(removeRes.data).toContain("u1/file1.txt");

      const downloadRes = await serverStorage.download(
        testBucket,
        "u1/file1.txt",
      );
      expect(downloadRes.error).not.toBeNull();

      const download2 = await serverStorage.download(
        testBucket,
        "u1/file2.txt",
      );
      expect(download2.data?.toString()).toBe("2");
    });

    it("generates correct public and signed URLs", () => {
      const pubUrl = serverStorage.getPublicUrl("public-assets", "banner.png");
      expect(pubUrl).toBe("/api/storage/public/public-assets/banner.png");

      const signedUrl = serverStorage.createSignedUrl(
        "Storage",
        "u1/secret.png",
        "my-jwt-token",
      );
      expect(signedUrl).toBe(
        "/api/storage/download/Storage/u1/secret.png?token=my-jwt-token",
      );
    });
  });

  describe("Directory and user quota size calculations", () => {
    it("calculates folder sizes accurately", async () => {
      const folderPath = path.join(testDir, "size-test");
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(path.join(folderPath, "f1.bin"), Buffer.alloc(100));
      fs.writeFileSync(path.join(folderPath, "f2.bin"), Buffer.alloc(250));

      const size = getFolderSize(folderPath);
      expect(size).toBe(350);
    });
  });
});
