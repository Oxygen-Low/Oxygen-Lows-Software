import { Hono } from "hono";
import fs from "fs";
import path from "path";
import {
  serverStorage,
  getUserTotalSize,
  MAX_USER_QUOTA,
  getMimeType,
  sanitizePath,
  assertSafeStoragePath,
  STORAGE_DIR,
  isHiddenStoragePath,
} from "../lib/storage.ts";
import {
  TrackBackgroundError,
  cleanupTrackBackgroundsForRemovedFiles,
  renameTrackBackgroundForMovedFile,
  detectImageExtension,
  getTrackBackgroundUsage,
  getTrackBackgrounds,
  readTrackBackgroundFile,
  removeTrackBackground,
  setTrackBackground,
} from "../lib/trackBackgrounds.ts";
import { TRACK_BACKGROUND_MAX_BYTES } from "../../shared/trackBackgrounds.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import { scanImage } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateImage,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";

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
    if (isHiddenStoragePath(filePath)) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (
      !filePath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
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
        { error: "Quota exceeded. Maximum 500MB allowed per user." },
        400,
      );
    }

    // Safety Inspection for Uploaded Media
    const mime = getMimeType(filePath);
    if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filePath)) {
      const scanResult = await scanImage(buffer, mime);
      if (!scanResult.safe && scanResult.severity >= 2) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const lockdown = await executeZeroToleranceLockdown({
          ip,
          user,
          userAgent,
          surface: "storage_upload",
          fileName: filePath,
          fileHash: scanResult.details?.hash,
          mimeType: mime,
          severity: scanResult.severity,
          reason: scanResult.reason || "Uploaded image flagged by child safety scanner",
        });
        return c.json(lockdown.clientResponse, 400);
      }

      // Post-CSAM OpenAI Image Moderation
      const openAiImgResult = await moderateImage(buffer, mime);
      if (!openAiImgResult.allowed) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const enforcement = await handleModerationEnforcement(openAiImgResult, {
          ip,
          user,
          userAgent,
          surface: "storage_upload",
          fileName: filePath,
          fileHash: scanResult.details?.hash,
          mimeType: mime,
        });
        if (enforcement) {
          return c.json(enforcement.clientResponse, 400);
        }
      }
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
    if (isHiddenStoragePath(filePath)) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (
      !filePath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
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
        { error: "Quota exceeded. Maximum 500MB allowed per user." },
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

    const tmpBase = assertSafeStoragePath(STORAGE_DIR, ".tmp");
    const tmpDir = assertSafeStoragePath(tmpBase, safeUploadId);
    fs.mkdirSync(tmpDir, { recursive: true });

    const chunkPath = assertSafeStoragePath(tmpDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, buffer);

    // If this is the last chunk
    if (chunkIndex === totalChunks - 1) {
      // Check if all chunks from 0 to totalChunks - 1 exist
      const readPromises: Promise<Buffer>[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = assertSafeStoragePath(tmpDir, `chunk_${i}`);
        if (!fs.existsSync(p)) {
          return c.json({
            data: { chunkIndex, status: "pending" },
            error: null,
          });
        }
        readPromises.push(fs.promises.readFile(p));
      }

      const assembledChunks = await Promise.all(readPromises);
      const completeBuffer = Buffer.concat(assembledChunks);

      // Safety Inspection for Uploaded Media
      const mime = getMimeType(filePath);
      if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filePath)) {
        const scanResult = await scanImage(completeBuffer, mime);
        if (!scanResult.safe && scanResult.severity >= 2) {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          const ip = extractClientIp(c);
          const userAgent = c.req.header("user-agent");
          const lockdown = await executeZeroToleranceLockdown({
            ip,
            user,
            userAgent,
            surface: "storage_chunked_upload",
            fileName: filePath,
            fileHash: scanResult.details?.hash,
            mimeType: mime,
            severity: scanResult.severity,
            reason: scanResult.reason || "Uploaded chunked image flagged by child safety scanner",
          });
          return c.json(lockdown.clientResponse, 400);
        }

        // Post-CSAM OpenAI Image Moderation
        const openAiChunkScan = await moderateImage(completeBuffer, mime);
        if (!openAiChunkScan.allowed) {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          const ip = extractClientIp(c);
          const userAgent = c.req.header("user-agent");
          const enforcement = await handleModerationEnforcement(openAiChunkScan, {
            ip,
            user,
            userAgent,
            surface: "storage_chunked_upload",
            fileName: filePath,
            fileHash: scanResult.details?.hash,
            mimeType: mime,
          });
          if (enforcement) {
            return c.json(enforcement.clientResponse, 400);
          }
        }
      }

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
        if (isHiddenStoragePath(clean)) return false;
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

    // Deleting an audio file also deletes its song background (if any).
    if (bucket === "Storage" && data && data.length > 0) {
      cleanupTrackBackgroundsForRemovedFiles(data);
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

storageRouter.post("/rename/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const fromPathRaw = body.fromPath || body.oldPath;
    const toPathRaw = body.toPath || body.newPath || body.newName;

    if (!fromPathRaw || !toPathRaw) {
      return c.json({ error: "Missing fromPath or toPath" }, 400);
    }

    let cleanFromPath: string;
    let cleanToPath: string;
    try {
      cleanFromPath = sanitizePath(fromPathRaw);
      cleanToPath = sanitizePath(toPathRaw);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    if (!cleanToPath.includes("/") && cleanFromPath.includes("/")) {
      const dir = cleanFromPath.substring(0, cleanFromPath.lastIndexOf("/"));
      cleanToPath = `${dir}/${cleanToPath}`;
    }

    if (isHiddenStoragePath(cleanFromPath) || isHiddenStoragePath(cleanToPath)) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (
      !cleanFromPath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
      return c.json({ error: "Cannot modify other user's files" }, 403);
    }

    if (
      !cleanToPath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
      return c.json({ error: "Cannot move file to other user's directory" }, 403);
    }

    const { data, error } = await serverStorage.rename(
      bucket,
      cleanFromPath,
      cleanToPath,
    );

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    if (bucket === "Storage") {
      renameTrackBackgroundForMovedFile(cleanFromPath, cleanToPath);
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to rename file" }, 500);
  }
});

storageRouter.post("/move/:bucket", authMiddleware, async (c) => {
  try {
    const fromBucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const fromPathRaw = body.fromPath || body.oldPath;
    const toPathRaw = body.toPath || body.newPath;
    const toBucket = body.toBucket || fromBucket;

    if (!fromPathRaw || !toPathRaw) {
      return c.json({ error: "Missing fromPath or toPath" }, 400);
    }

    let cleanFromPath: string;
    let cleanToPath: string;
    let cleanToBucket: string;
    try {
      cleanFromPath = sanitizePath(fromPathRaw);
      cleanToPath = sanitizePath(toPathRaw);
      cleanToBucket = sanitizePath(toBucket);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }

    if (!cleanToPath.includes("/") && cleanFromPath.includes("/")) {
      const dir = cleanFromPath.substring(0, cleanFromPath.lastIndexOf("/"));
      cleanToPath = `${dir}/${cleanToPath}`;
    }

    if (isHiddenStoragePath(cleanFromPath) || isHiddenStoragePath(cleanToPath)) {
      return c.json({ error: "Invalid path" }, 400);
    }

    const user = c.get("user" as any) as any;

    if (
      !cleanFromPath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
      return c.json({ error: "Cannot modify other user's files" }, 403);
    }

    if (
      !cleanToPath.startsWith(user.id + "/") &&
      user.role !== "admin" &&
      String(user.id) !== "1"
    ) {
      return c.json({ error: "Cannot move file to other user's directory" }, 403);
    }

    const { data, error } = await serverStorage.move(
      fromBucket,
      cleanFromPath,
      cleanToBucket,
      cleanToPath,
    );

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    if (fromBucket === "Storage" && toBucket === "Storage") {
      renameTrackBackgroundForMovedFile(cleanFromPath, cleanToPath);
    }

    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to move file" }, 500);
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
    if (isHiddenStoragePath(filePath)) {
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
    if (isHiddenStoragePath(filePath)) {
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
        if (isHiddenStoragePath(clean)) throw new Error("Invalid path");
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

// ---------------------------------------------------------------------------
// Per-song topbar player backgrounds
// Cropped copies live in uploads/Storage/<userId>/.hidden/ — they count toward
// the user's quota but are hidden from listings and generic storage routes.
// ---------------------------------------------------------------------------

function trackBackgroundErrorResponse(c: any, err: any, fallback: string) {
  if (err instanceof TrackBackgroundError) {
    return c.json({ error: err.message }, err.status as any);
  }
  return c.json({ error: err?.message || fallback }, 500);
}

storageRouter.get("/track-backgrounds", authMiddleware, async (c) => {
  try {
    const user = c.get("user" as any) as any;
    const backgrounds = getTrackBackgrounds(user.id);
    const usage = getTrackBackgroundUsage(user.id);
    return c.json({ data: { backgrounds, usage }, error: null });
  } catch (err: any) {
    return trackBackgroundErrorResponse(c, err, "Failed to load backgrounds");
  }
});

storageRouter.post("/track-backgrounds", authMiddleware, async (c) => {
  try {
    const user = c.get("user" as any) as any;
    const body = await c.req.parseBody();
    const trackKey = typeof body["trackKey"] === "string" ? body["trackKey"] : "";
    const sourcePath =
      typeof body["sourcePath"] === "string" ? body["sourcePath"] : null;
    const file = body["file"] as any;

    if (!trackKey) {
      return c.json({ error: "Missing track" }, 400);
    }
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
      return c.json({ error: "No file provided" }, 400);
    }
    if ((file.size ?? 0) > TRACK_BACKGROUND_MAX_BYTES) {
      return c.json({ error: "Background image is too large" }, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = detectImageExtension(buffer);
    if (!ext) {
      return c.json({ error: "Unsupported image format" }, 400);
    }
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";

    // Safety inspection (same pipeline as regular image uploads)
    const scanResult = await scanImage(buffer, mime);
    if (!scanResult.safe && scanResult.severity >= 2) {
      const lockdown = await executeZeroToleranceLockdown({
        ip: extractClientIp(c),
        user,
        userAgent: c.req.header("user-agent"),
        surface: "track_background_upload",
        fileName: `track-background:${trackKey}`,
        fileHash: scanResult.details?.hash,
        mimeType: mime,
        severity: scanResult.severity,
        reason:
          scanResult.reason || "Track background flagged by child safety scanner",
      });
      return c.json(lockdown.clientResponse, 400);
    }
    const openAiImgResult = await moderateImage(buffer, mime);
    if (!openAiImgResult.allowed) {
      const enforcement = await handleModerationEnforcement(openAiImgResult, {
        ip: extractClientIp(c),
        user,
        userAgent: c.req.header("user-agent"),
        surface: "track_background_upload",
        fileName: `track-background:${trackKey}`,
        fileHash: scanResult.details?.hash,
        mimeType: mime,
      });
      if (enforcement) {
        return c.json(enforcement.clientResponse, 400);
      }
    }

    const result = setTrackBackground(user.id, trackKey, buffer, sourcePath);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return trackBackgroundErrorResponse(c, err, "Failed to save background");
  }
});

storageRouter.delete("/track-backgrounds", authMiddleware, async (c) => {
  try {
    const user = c.get("user" as any) as any;
    const body = await c.req.json().catch(() => ({}));
    const trackKey = typeof body.trackKey === "string" ? body.trackKey : "";
    if (!trackKey) {
      return c.json({ error: "Missing track" }, 400);
    }
    const backgrounds = removeTrackBackground(user.id, trackKey);
    return c.json({ data: { backgrounds }, error: null });
  } catch (err: any) {
    return trackBackgroundErrorResponse(c, err, "Failed to remove background");
  }
});

storageRouter.get(
  "/track-backgrounds/file/:name",
  authMiddleware,
  async (c) => {
    const user = c.get("user" as any) as any;
    const name = c.req.param("name");
    const result = readTrackBackgroundFile(user.id, name);
    if (!result) {
      return c.text("Not found", 404);
    }
    return c.body(result.data as any, 200, {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.data.length),
      // File names are unique per upload, so they can be cached forever.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  },
);
