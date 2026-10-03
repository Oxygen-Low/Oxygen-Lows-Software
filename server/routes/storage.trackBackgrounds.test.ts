import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { storageRouter } from "./storage.ts";
import { generateToken } from "../lib/auth.ts";
import { initUserFolder, DATA_DIR } from "../lib/dataStore.ts";
import { STORAGE_DIR } from "../lib/storage.ts";

const app = new Hono();
app.route("/api/storage", storageRouter);

describe("Track Backgrounds storage routes", () => {
  const userId = "tb_test_user_42";
  const token = generateToken({ id: userId, username: "tbuser", email: "tbuser@example.com" });
  const userStorageDir = path.join(STORAGE_DIR, "Storage", userId);
  const userDataDir = path.join(DATA_DIR, userId);

  // Minimal valid 1x1 WebP buffer
  const sampleWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
    0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
    0x00, 0x07, 0x00, 0x00, 0xff, 0x01, 0x58, 0x00,
  ]);

  beforeAll(() => {
    initUserFolder(userId, {
      username: "tbuser",
      email: "tbuser@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
    });
    fs.mkdirSync(userStorageDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(userStorageDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  });

  it("POST /api/storage/track-backgrounds saves a cropped image and returns file name", async () => {
    const formData = new FormData();
    formData.append("trackKey", "audio/lofi.mp3");
    formData.append("sourcePath", "images/sunset.png");
    formData.append("file", new Blob([sampleWebp], { type: "image/webp" }), "bg.webp");

    const res = await app.request("/api/storage/track-backgrounds", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.key).toBe("audio/lofi.mp3");
    expect(json.data.file).toMatch(/^songbg-[a-f0-9]+\.webp$/);
    expect(json.data.backgrounds["audio/lofi.mp3"]).toBeDefined();
  });

  it("GET /api/storage/track-backgrounds returns saved backgrounds and storage usage", async () => {
    const res = await app.request("/api/storage/track-backgrounds", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.backgrounds["audio/lofi.mp3"]).toBeDefined();
    expect(json.data.usage.totalSize).toBeGreaterThan(0);
  });

  it("GET /api/storage/track-backgrounds/file/:name serves the hidden background image", async () => {
    const listRes = await app.request("/api/storage/track-backgrounds", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = await listRes.json();
    const fileName = listJson.data.backgrounds["audio/lofi.mp3"].file;

    const fileRes = await app.request(`/api/storage/track-backgrounds/file/${fileName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("content-type")).toBe("image/webp");
    const arrayBuffer = await fileRes.arrayBuffer();
    expect(arrayBuffer.byteLength).toBe(sampleWebp.length);
  });

  it("DELETE /api/storage/track-backgrounds removes the track background", async () => {
    const res = await app.request("/api/storage/track-backgrounds", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackKey: "audio/lofi.mp3" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.backgrounds["audio/lofi.mp3"]).toBeUndefined();
  });

  it("blocks accessing .hidden files through the generic storage endpoints", async () => {
    // Attempt download through generic download endpoint
    const dlRes = await app.request(`/api/storage/download/Storage/${userId}/.hidden/songbg-hack.webp`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.status).toBe(400);

    // Attempt upload to .hidden through generic upload endpoint
    const form = new FormData();
    form.append("file", new Blob([sampleWebp], { type: "image/webp" }), "hack.webp");
    const upRes = await app.request(`/api/storage/upload/Storage/${userId}/.hidden/hack.webp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(upRes.status).toBe(400);
  });
});
