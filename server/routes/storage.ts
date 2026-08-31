import { Hono } from "hono";
import fs from "fs";
import path from "path";
import {
  serverStorage,
  getUserTotalSize,
  MAX_USER_QUOTA,
  getMimeType,
  sanitizePath,
  STORAGE_DIR,
} from "../lib/storage.ts";
import { resolveUserFromToken } from "../lib/auth.ts";

export const storageRouter = new Hono();

const authMiddleware = async (c: any, next: any) => {
  let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) {
    token = c.req.query("token");
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("token", token);
  await next();
};

storageRouter.post("/upload/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath =
      c.req.param("*") ||
      c.req.param("path") ||
      c.req.path.split(`/upload/${bucket}/`)[1];

    let filePath: string;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (!filePath.startsWith(user.id + "/") && user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Cannot upload to other user's directory" }, 400);
    }

    const body = await c.req.parseBody();
    const file = body["file"] as any;
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    let buffer: Buffer;
    if (
      typeof file === "object" &&
      file !== null &&
      typeof file.arrayBuffer === "function"
    ) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf-8");
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
      buffer = Buffer.from(file as any);
    } else {
      return c.json({ error: "Invalid file format" }, 400);
    }

    const newFileSize = file.size ?? buffer.length;
    const currentSize = getUserTotalSize(user.id);

    if (currentSize + newFileSize > MAX_USER_QUOTA) {
      return c.json(
        { error: "Quota exceeded. Maximum 1GB allowed per user." },
        400,
      );
    }

    const { data, error } = await serverStorage.upload(
      bucket,
      filePath,
      buffer,
    );

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ error: err.message || "Upload failed" }, 500);
  }
});

storageRouter.post("/upload-chunk/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath =
      c.req.param("*") ||
      c.req.param("path") ||
      c.req.path.split(`/upload-chunk/${bucket}/`)[1];

    let filePath: string;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (!filePath.startsWith(user.id + "/") && user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Cannot upload to other user's directory" }, 400);
    }

    const body = await c.req.parseBody();
    const uploadId = body["uploadId"] as string;
    const chunkIndex = parseInt(body["chunkIndex"] as string, 10);
    const totalChunks = parseInt(body["totalChunks"] as string, 10);
    const totalSize = parseInt(body["totalSize"] as string, 10) || 0;
    const file = body["file"] as any;

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !file) {
      return c.json({ error: "Missing chunk parameters" }, 400);
    }

    // Sanitize uploadId to prevent directory traversal
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeUploadId) {
      return c.json({ error: "Invalid upload ID" }, 400);
    }

    const currentSize = getUserTotalSize(user.id);
    if (currentSize + totalSize > MAX_USER_QUOTA) {
      return c.json(
        { error: "Quota exceeded. Maximum 1GB allowed per user." },
        400,
      );
    }

    let buffer: Buffer;
    if (
      typeof file === "object" &&
      file !== null &&
      typeof file.arrayBuffer === "function"
    ) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf-8");
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
      buffer = Buffer.from(file as any);
    } else {
      return c.json({ error: "Invalid file format" }, 400);
    }

    const tmpDir = path.join(STORAGE_DIR, ".tmp", safeUploadId);
    fs.mkdirSync(tmpDir, { recursive: true });

    const chunkPath = path.join(tmpDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, buffer);

    // If this is the last chunk
    if (chunkIndex === totalChunks - 1) {
      // Check if all chunks from 0 to totalChunks - 1 exist
      const assembledChunks: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = path.join(tmpDir, `chunk_${i}`);
        if (!fs.existsSync(p)) {
          return c.json({
            data: { chunkIndex, status: "pending" },
            error: null,
          });
        }
        assembledChunks.push(fs.readFileSync(p));
      }

      const completeBuffer = Buffer.concat(assembledChunks);
      const { data, error } = await serverStorage.upload(
        bucket,
        filePath,
        completeBuffer,
      );

      // Clean up tmp files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      if (error) {
        return c.json({ error: error.message }, 500);
      }

      return c.json({ data, error: null });
    }

    return c.json({ data: { chunkIndex, status: "uploaded" }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message || "Chunk upload failed" }, 500);
  }
});

storageRouter.post("/list/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const prefixPath = body.path || "";

    const { data, error } = await serverStorage.list(bucket, prefixPath);
    if (error) {
      return c.json({ data: [], error: error.message });
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ data: [], error: err.message });
  }
});

storageRouter.delete("/remove/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const paths: string[] = body.paths || [];
    const user = c.get("user" as any) as any;

    const allowedPaths = paths.filter((p) => {
      try {
        const clean = sanitizePath(p);
        return (
          clean.startsWith(user.id + "/") ||
          user.role === "admin" ||
          String(user.id) === "1"
        );
      } catch {
        return false;
      }
    });

    const { data, error } = await serverStorage.remove(bucket, allowedPaths);
    if (error) {
      return c.json({ data: [], error: error.message }, 500);
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

storageRouter.get("/download/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath =
      c.req.param("*") || c.req.path.split(`/download/${bucket}/`)[1];

    let filePath: string;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    const { data, error } = await serverStorage.download(bucket, filePath);
    if (error || !data) {
      return c.text("Not found", 404);
    }

    const mimeType = getMimeType(filePath);
    const rangeHeader = c.req.header("range");
    const totalSize = data.length;

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (!isNaN(start) && start < totalSize) {
        const chunkEnd = Math.min(end, totalSize - 1);
        const chunk = data.subarray(start, chunkEnd + 1);
        return c.body(chunk as any, 206, {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${chunkEnd}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Content-Disposition": `inline; filename="${encodeURIComponent(filePath.split("/").pop() || "file")}"`,
        });
      }
    }

    return c.body(data as any, 200, {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalSize),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filePath.split("/").pop() || "file")}"`,
    });
  } catch (err: any) {
    return c.text("Error downloading file", 500);
  }
});

storageRouter.get("/public/:bucket/*", async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath =
      c.req.param("*") || c.req.path.split(`/public/${bucket}/`)[1];

    let filePath: string;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    const { data, error } = await serverStorage.download(bucket, filePath);
    if (error || !data) {
      return c.text("Not found", 404);
    }

    const mimeType = getMimeType(filePath);
    const rangeHeader = c.req.header("range");
    const totalSize = data.length;

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (!isNaN(start) && start < totalSize) {
        const chunkEnd = Math.min(end, totalSize - 1);
        const chunk = data.subarray(start, chunkEnd + 1);
        return c.body(chunk as any, 206, {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${chunkEnd}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        });
      }
    }

    return c.body(data as any, 200, {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalSize),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  } catch (err: any) {
    return c.text("Error reading public asset", 500);
  }
});

storageRouter.post("/signed-urls/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const paths = body.paths || [];
    const token = c.get("token" as any);

    const result = paths.map((p: string) => {
      try {
        const clean = sanitizePath(p);
        return {
          error: null,
          signedUrl: serverStorage.createSignedUrl(bucket, clean, token),
        };
      } catch {
        return {
          error: "Invalid path",
          signedUrl: null,
        };
      }
    });

    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
