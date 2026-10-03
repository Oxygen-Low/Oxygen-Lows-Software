import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  normalizeTrackKey,
  sanitizeTrackBackgroundMap,
  HIDDEN_STORAGE_DIR,
} from "../../shared/trackBackgrounds.ts";
import {
  detectImageExtension,
  setTrackBackground,
  removeTrackBackground,
  getTrackBackgrounds,
  cleanupTrackBackgroundsForRemovedFiles,
  readTrackBackgroundFile,
  getTrackBackgroundUsage,
  getHiddenDir,
  TrackBackgroundError,
} from "./trackBackgrounds.ts";
import {
  serverStorage,
  STORAGE_DIR,
  isHiddenStoragePath,
} from "./storage.ts";
import { DATA_DIR } from "./dataStore.ts";

describe("trackBackgrounds module", () => {
  const testUserId = "test-user-trackbg";
  const userStorageDir = path.join(STORAGE_DIR, "Storage", testUserId);
  const userDataDir = path.join(DATA_DIR, testUserId);

  // Minimal valid 1x1 WebP buffer (with RIFF header)
  const sampleWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
    0x00, 0x07, 0x00, 0x00, 0xff, 0x01, 0x58, 0x00,
  ]);

  // Minimal PNG header buffer
  const samplePng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);

  beforeEach(() => {
    fs.mkdirSync(userStorageDir, { recursive: true });
    fs.mkdirSync(userDataDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(userStorageDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  });

  describe("normalizeTrackKey", () => {
    it("normalizes path by stripping leading slashes, user ID prefix, and UUID segments", () => {
      expect(normalizeTrackKey("music/song.mp3", testUserId)).toBe("music/song.mp3");
      expect(normalizeTrackKey(`${testUserId}/music/song.mp3`, testUserId)).toBe("music/song.mp3");
      expect(normalizeTrackKey(`${testUserId}/12345678-1234-1234-1234-123456789abc/song.mp3`, testUserId)).toBe("song.mp3");
      expect(normalizeTrackKey("/song.mp3", testUserId)).toBe("song.mp3");
      expect(normalizeTrackKey("C:\\music\\song.mp3", testUserId)).toBe("C:/music/song.mp3");
    });
  });

  describe("detectImageExtension", () => {
    it("detects WebP, PNG, and JPEG magic bytes", () => {
      expect(detectImageExtension(sampleWebp)).toBe("webp");
      expect(detectImageExtension(samplePng)).toBe("png");
      expect(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]))).toBe("jpg");
      expect(detectImageExtension(Buffer.from("invalid-image-data-here-123"))).toBeNull();
    });
  });

  describe("setTrackBackground and removeTrackBackground", () => {
    it("creates hidden cropped copy and stores entry in user preferences", () => {
      const result = setTrackBackground(
        testUserId,
        "songs/summer.mp3",
        sampleWebp,
        "images/wallpaper.png"
      );

      expect(result.key).toBe("songs/summer.mp3");
      expect(result.file).toMatch(/^songbg-[a-f0-9]+\.webp$/);
      expect(result.backgrounds["songs/summer.mp3"]).toEqual({
        file: result.file,
        source: "images/wallpaper.png",
      });

      // Verify file exists in .hidden folder
      const hiddenDir = getHiddenDir(testUserId);
      expect(fs.existsSync(path.join(hiddenDir, result.file))).toBe(true);

      // Verify readTrackBackgroundFile
      const readResult = readTrackBackgroundFile(testUserId, result.file);
      expect(readResult).not.toBeNull();
      expect(readResult?.mimeType).toBe("image/webp");
      expect(readResult?.data.length).toBe(sampleWebp.length);
    });

    it("replaces old hidden copy when updating track background", () => {
      const first = setTrackBackground(testUserId, "song.mp3", sampleWebp);
      const hiddenDir = getHiddenDir(testUserId);
      expect(fs.existsSync(path.join(hiddenDir, first.file))).toBe(true);

      const second = setTrackBackground(testUserId, "song.mp3", samplePng);
      expect(second.file).not.toBe(first.file);
      expect(fs.existsSync(path.join(hiddenDir, second.file))).toBe(true);
      // Old file should be deleted
      expect(fs.existsSync(path.join(hiddenDir, first.file))).toBe(false);
    });

    it("removes track background and deletes hidden copy", () => {
      const bg = setTrackBackground(testUserId, "song.mp3", sampleWebp);
      const hiddenDir = getHiddenDir(testUserId);
      expect(fs.existsSync(path.join(hiddenDir, bg.file))).toBe(true);

      const after = removeTrackBackground(testUserId, "song.mp3");
      expect(after["song.mp3"]).toBeUndefined();
      expect(fs.existsSync(path.join(hiddenDir, bg.file))).toBe(false);
    });
  });

  describe("cleanupTrackBackgroundsForRemovedFiles", () => {
    it("deletes the background copy when the sound file is deleted from storage", () => {
      const bg1 = setTrackBackground(testUserId, "album/song1.mp3", sampleWebp);
      const bg2 = setTrackBackground(testUserId, "album/song2.mp3", samplePng);
      const hiddenDir = getHiddenDir(testUserId);

      expect(fs.existsSync(path.join(hiddenDir, bg1.file))).toBe(true);
      expect(fs.existsSync(path.join(hiddenDir, bg2.file))).toBe(true);

      // Simulate deletion of song1 from storage
      cleanupTrackBackgroundsForRemovedFiles([`${testUserId}/album/song1.mp3`]);

      const updated = getTrackBackgrounds(testUserId);
      expect(updated["album/song1.mp3"]).toBeUndefined();
      expect(updated["album/song2.mp3"]).toBeDefined();

      // bg1 file deleted, bg2 file retained
      expect(fs.existsSync(path.join(hiddenDir, bg1.file))).toBe(false);
      expect(fs.existsSync(path.join(hiddenDir, bg2.file))).toBe(true);
    });
  });

  describe("storage listing and hidden path guards", () => {
    it("excludes .hidden directory from serverStorage.list", async () => {
      setTrackBackground(testUserId, "song.mp3", sampleWebp);

      // Also create a normal file in user storage
      fs.writeFileSync(path.join(userStorageDir, "regular.txt"), "hello");

      const { data } = await serverStorage.list("Storage", testUserId);
      expect(data).toBeDefined();
      const names = data?.map((d) => d.name) || [];
      expect(names).toContain("regular.txt");
      expect(names).not.toContain(HIDDEN_STORAGE_DIR);
      expect(names.some((n) => n.startsWith(".hidden"))).toBe(false);
    });

    it("correctly identifies hidden storage paths with isHiddenStoragePath", () => {
      expect(isHiddenStoragePath(`${testUserId}/.hidden/songbg-123.webp`)).toBe(true);
      expect(isHiddenStoragePath(`.hidden/test.png`)).toBe(true);
      expect(isHiddenStoragePath(`${testUserId}/regular-file.mp3`)).toBe(false);
      expect(isHiddenStoragePath(`${testUserId}/images/photo.png`)).toBe(false);
    });

    it("measures track background storage usage", () => {
      setTrackBackground(testUserId, "song.mp3", sampleWebp);
      const usage = getTrackBackgroundUsage(testUserId);
      expect(usage.totalSize).toBe(sampleWebp.length);
      expect(usage.items).toHaveLength(1);
      expect(usage.items[0].size).toBe(sampleWebp.length);
    });
  });
});
