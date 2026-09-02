import { Hono } from "hono";
import { storageRouter } from "./server/routes/storage.ts";
import fs from "fs";
import path from "path";
import os from "os";
import { vi } from "vitest";

// Mock auth so we can pass authMiddleware
vi.mock("./server/lib/auth.ts", () => ({
  resolveUserFromToken: async () => ({ id: 1, role: "admin" })
}));

async function benchmark() {
  const app = new Hono();
  app.route("/", storageRouter);

  const numRequests = 50;
  const chunkBuffer = Buffer.alloc(1024 * 1024); // 1MB chunk

  console.log(`Starting benchmark for ${numRequests} requests...`);
  const start = Date.now();

  const promises = [];
  for (let i = 0; i < numRequests; i++) {
    const formData = new FormData();
    formData.append("uploadId", `bench_${Date.now()}`);
    formData.append("chunkIndex", "0");
    formData.append("totalChunks", "10");
    formData.append("totalSize", "10485760");

    const file = new File([chunkBuffer], "chunk.bin", { type: "application/octet-stream" });
    formData.append("file", file);

    const req = new Request("http://localhost/upload-chunk/test-bucket/test-file.bin", {
      method: "POST",
      headers: {
        "Authorization": "Bearer test-token"
      },
      body: formData
    });

    promises.push(app.fetch(req));
  }

  await Promise.all(promises);
  const end = Date.now();
  console.log(`Benchmark completed in ${end - start}ms`);
}

benchmark().catch(console.error);
