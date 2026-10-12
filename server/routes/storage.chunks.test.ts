import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { storageRouter } from "./storage.ts";
import { STORAGE_DIR, serverStorage } from "../lib/storage.ts";

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async () => ({
    id: "chunk_upload_test_user",
    role: "user",
  })),
}));

const userId = "chunk_upload_test_user";
const filePath = `${userId}/assembled.txt`;
const destination = path.join(STORAGE_DIR, "Storage", filePath);
const temporaryDirectory = path.join(STORAGE_DIR, ".tmp", userId);
const chunks = ["first-", "second-", "third-", "fourth"];
const totalSize = Buffer.byteLength(chunks.join(""));

function uploadChunk(
  chunkIndex: number,
  parts = chunks,
  declaredSize = totalSize,
) {
  const body = new FormData();
  body.append("uploadId", "chunk-order-regression");
  body.append("chunkIndex", String(chunkIndex));
  body.append("totalChunks", String(parts.length));
  body.append("totalSize", String(declaredSize));
  body.append("file", new Blob([parts[chunkIndex]]), "chunk");
  return storageRouter.request(`/upload-chunk/Storage/${filePath}`, {
    method: "POST",
    headers: { Authorization: "Bearer fixture" },
    body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(path.join(STORAGE_DIR, "Storage", userId), {
    recursive: true,
    force: true,
  });
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("chunked storage uploads", () => {
  it.each([
    { order: [0, 1, 2, 3], name: "in order" },
    { order: [3, 0, 1, 2], name: "highest index first" },
    { order: [3, 2, 1, 0], name: "in reverse order" },
  ])("assembles chunks $name", async ({ order }) => {
    const upload = vi.spyOn(serverStorage, "upload");
    for (const [position, chunkIndex] of order.entries()) {
      const response = await uploadChunk(chunkIndex);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.error).toBeNull();
      if (position < order.length - 1) {
        expect(result.data).toEqual({ chunkIndex, status: "pending" });
        expect(fs.existsSync(destination)).toBe(false);
        expect(upload).not.toHaveBeenCalled();
      } else {
        expect(result.data.path).toBe(filePath);
      }
    }

    expect(upload).toHaveBeenCalledExactlyOnceWith(
      "Storage",
      filePath,
      Buffer.from(chunks.join("")),
    );
    expect(fs.readFileSync(destination, "utf8")).toBe(chunks.join(""));
    expect(fs.readdirSync(temporaryDirectory)).toEqual([]);
  });

  it("assembles concurrent chunks once in index order", async () => {
    const upload = vi.spyOn(serverStorage, "upload");
    const responses = await Promise.all(
      [3, 1, 0, 2].map((i) => uploadChunk(i)),
    );
    const results = await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200);
        return response.json();
      }),
    );

    expect(
      results.filter((result) => result.data.path === filePath),
    ).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(destination, "utf8")).toBe(chunks.join(""));
    expect(fs.readdirSync(temporaryDirectory)).toEqual([]);
  });

  it("assembles a single chunk immediately", async () => {
    const response = await uploadChunk(0, ["single"], 6);
    expect(response.status).toBe(200);
    expect((await response.json()).data.path).toBe(filePath);
    expect(fs.readFileSync(destination, "utf8")).toBe("single");
    expect(fs.readdirSync(temporaryDirectory)).toEqual([]);
  });

  it("rejects an incorrect assembled size when a lower index arrives last", async () => {
    const upload = vi.spyOn(serverStorage, "upload");
    await uploadChunk(1, ["first", "last"], 10);
    const response = await uploadChunk(0, ["first", "last"], 10);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(temporaryDirectory)).toEqual([]);
  });
});
