import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { storageRouter } from "./storage.ts";
import { generateToken } from "../lib/auth.ts";
import { initUserFolder, DATA_DIR } from "../lib/dataStore.ts";
import { STORAGE_DIR, serverStorage } from "../lib/storage.ts";
import { setTrackBackground, getTrackBackgrounds } from "../lib/trackBackgrounds.ts";

const app = new Hono();
app.route("/api/storage", storageRouter);

describe("Storage Rename and Move API routes", () => {
  const userId = "rename_test_user_1";
  const otherUserId = "rename_test_user_2";
  const token = generateToken({ id: userId, username: "renameuser", email: "renameuser@example.com" });
  const otherToken = generateToken({ id: otherUserId, username: "otheruser", email: "other@example.com" });
  const userStorageDir = path.join(STORAGE_DIR, "Storage", userId);
  const otherStorageDir = path.join(STORAGE_DIR, "Storage", otherUserId);
  const userDataDir = path.join(DATA_DIR, userId);
  const otherDataDir = path.join(DATA_DIR, otherUserId);

  const sampleWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
    0x00, 0x07, 0x00, 0x00, 0xff, 0x01, 0x58, 0x00,
  ]);

  beforeAll(() => {
    initUserFolder(userId, {
      username: "renameuser",
      email: "renameuser@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
    });
    initUserFolder(otherUserId, {
      username: "otheruser",
      email: "other@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
    });
    fs.mkdirSync(userStorageDir, { recursive: true });
    fs.mkdirSync(otherStorageDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(userStorageDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(otherStorageDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(otherDataDir, { recursive: true, force: true });
    } catch {}
  });

  it("POST /api/storage/rename/Storage renames a file successfully", async () => {
    await serverStorage.upload("Storage", `${userId}/doc.txt`, Buffer.from("test document"));

    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/doc.txt`,
        toPath: `${userId}/doc-renamed.txt`,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.path).toBe(`${userId}/doc-renamed.txt`);

    const oldFile = await serverStorage.download("Storage", `${userId}/doc.txt`);
    expect(oldFile.error).not.toBeNull();

    const newFile = await serverStorage.download("Storage", `${userId}/doc-renamed.txt`);
    expect(newFile.error).toBeNull();
    expect(newFile.data?.toString()).toBe("test document");
  });

  it("POST /api/storage/rename/Storage rejects unauthorized requests", async () => {
    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromPath: `${userId}/doc-renamed.txt`,
        toPath: `${userId}/doc-2.txt`,
      }),
    });

    expect(res.status).toBe(401);
  });

  it("POST /api/storage/rename/Storage prevents modifying other user files", async () => {
    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${otherToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/doc-renamed.txt`,
        toPath: `${otherUserId}/stolen.txt`,
      }),
    });

    expect(res.status).toBe(403);
  });

  it("POST /api/storage/rename/Storage rejects path traversal sequences", async () => {
    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/doc-renamed.txt`,
        toPath: `../hacked.txt`,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("POST /api/storage/rename/Storage returns error when destination exists", async () => {
    await serverStorage.upload("Storage", `${userId}/file1.txt`, Buffer.from("1"));
    await serverStorage.upload("Storage", `${userId}/file2.txt`, Buffer.from("2"));

    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/file1.txt`,
        toPath: `${userId}/file2.txt`,
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Destination file already exists");
  });

  it("POST /api/storage/rename/Storage updates track background mapping for audio tracks", async () => {
    await serverStorage.upload("Storage", `${userId}/song.mp3`, Buffer.from("audio stream"));
    setTrackBackground(userId, "song.mp3", sampleWebp);

    const bgBefore = getTrackBackgrounds(userId);
    expect(bgBefore["song.mp3"]).toBeDefined();

    const res = await app.request("/api/storage/rename/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/song.mp3`,
        toPath: `${userId}/song-new.mp3`,
      }),
    });

    expect(res.status).toBe(200);

    const bgAfter = getTrackBackgrounds(userId);
    expect(bgAfter["song.mp3"]).toBeUndefined();
    expect(bgAfter["song-new.mp3"]).toBeDefined();
    expect(bgAfter["song-new.mp3"].file).toBe(bgBefore["song.mp3"].file);
  });

  it("POST /api/storage/move/Storage moves file between locations", async () => {
    await serverStorage.upload("Storage", `${userId}/initial.txt`, Buffer.from("move data"));

    const res = await app.request("/api/storage/move/Storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: `${userId}/initial.txt`,
        toPath: `${userId}/nested/moved.txt`,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.path).toBe(`${userId}/nested/moved.txt`);

    const movedFile = await serverStorage.download("Storage", `${userId}/nested/moved.txt`);
    expect(movedFile.error).toBeNull();
    expect(movedFile.data?.toString()).toBe("move data");
  });
});
