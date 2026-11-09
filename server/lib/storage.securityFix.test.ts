import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { serverStorage, STORAGE_DIR } from "./storage.ts";

describe("Storage download fallback (IDOR regression)", () => {
  const testBucket = "secfix-bucket";
  const testDir = path.join(STORAGE_DIR, testBucket);

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("does not read another user's file by prefixing the victim path", async () => {
    await serverStorage.upload(testBucket, "victim1/secret.txt", Buffer.from("top-secret"));
    const res = await serverStorage.download(testBucket, "attacker9/victim1/secret.txt");
    expect(res.error).not.toBeNull();
    expect(res.data).toBeNull();
  });

  it("still resolves owner-preserving uuid fallback", async () => {
    await serverStorage.upload(testBucket, "1/testsong.mp3", Buffer.from("audio-data"));
    const res = await serverStorage.download(
      testBucket,
      "1/3cb76293-8c6c-49b9-b431-1ff5fce471ee/testsong.mp3",
    );
    expect(res.error).toBeNull();
    expect(res.data?.toString()).toBe("audio-data");
  });
});
