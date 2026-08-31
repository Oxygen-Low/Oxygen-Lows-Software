import fs from "fs";
import path from "path";

export const STORAGE_DIR = path.join(process.cwd(), "uploads");
export const MAX_USER_QUOTA = 500 * 1024 * 1024; // 500 MB

const MIME_MAP: Record<string, string> = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  webm: "audio/webm",
  opus: "audio/opus",
  wma: "audio/x-ms-wma",
  // Video
  mp4: "video/mp4",
  ogv: "video/ogg",
  mov: "video/quicktime",
  // Documents & Data
  json: "application/json",
  txt: "text/plain",
  csv: "text/csv",
  pdf: "application/pdf",
  md: "text/markdown",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "text/typescript",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return MIME_MAP[ext] || "application/octet-stream";
}

export function sanitizePath(rawPath: string): string {
  if (!rawPath) return "";
  let clean = decodeURIComponent(rawPath);
  clean = clean.replace(/\\/g, "/");
  clean = clean.replace(/^\/+/, "");
  // Disallow directory traversal
  if (clean.includes("..") || clean.startsWith("/") || clean.includes("\0")) {
    throw new Error("Invalid path");
  }
  return clean;
}

export function getFolderSize(folderPath: string): number {
  let size = 0;
  if (!fs.existsSync(folderPath)) return 0;
  try {
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      if (file.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += fs.statSync(filePath).size;
      }
    }
  } catch {
    return 0;
  }
  return size;
}

export function getUserTotalSize(userId: string): number {
  if (!userId) return 0;
  const sizeStorage = getFolderSize(path.join(STORAGE_DIR, "Storage", userId));
  const sizePublic = getFolderSize(
    path.join(STORAGE_DIR, "public-assets", userId),
  );
  return sizeStorage + sizePublic;
}

export interface StorageListItem {
  id: string | null;
  name: string;
  metadata: {
    size: number;
    mimetype: string;
  };
  created_at: string;
  updated_at: string;
}

export const serverStorage = {
  upload: async (
    bucket: string,
    rawFilePath: string,
    data: Buffer | Blob | Uint8Array | ArrayBuffer,
  ): Promise<{ data: { path: string } | null; error: Error | null }> => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const filePath = sanitizePath(rawFilePath);
      const targetDir = path.join(
        STORAGE_DIR,
        cleanBucket,
        path.dirname(filePath),
      );
      fs.mkdirSync(targetDir, { recursive: true });

      const fullPath = path.join(STORAGE_DIR, cleanBucket, filePath);
      let buffer: Buffer;

      if (data instanceof Buffer) {
        buffer = data;
      } else if (typeof Blob !== "undefined" && data instanceof Blob) {
        const arrayBuf = await data.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (data instanceof Uint8Array) {
        buffer = Buffer.from(data);
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data);
      } else {
        buffer = Buffer.from(data as any);
      }

      fs.writeFileSync(fullPath, buffer);
      return { data: { path: filePath }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  download: async (
    bucket: string,
    rawFilePath: string,
  ): Promise<{ data: Buffer | null; error: Error | null }> => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const filePath = sanitizePath(rawFilePath);
      let fullPath = path.join(STORAGE_DIR, cleanBucket, filePath);

      if (!fs.existsSync(fullPath)) {
        // Fallback: check if filePath contains a duplicated/nested user directory
        // e.g. "1/3cb76293-8c6c-49b9-b431-1ff5fce471ee/testsong.mp3"
        const parts = filePath.split("/");
        if (parts.length > 2) {
          // Try removing middle UUID/segment: "1/uuid/file.mp3" -> "1/file.mp3"
          const withoutMiddle = [parts[0], ...parts.slice(2)].join("/");
          const tryPath1 = path.join(STORAGE_DIR, cleanBucket, withoutMiddle);
          if (fs.existsSync(tryPath1)) {
            const buffer = fs.readFileSync(tryPath1);
            return { data: buffer, error: null };
          }
          // Try removing first part: "1/uuid/file.mp3" -> "uuid/file.mp3"
          const withoutFirst = parts.slice(1).join("/");
          const tryPath2 = path.join(STORAGE_DIR, cleanBucket, withoutFirst);
          if (fs.existsSync(tryPath2)) {
            const buffer = fs.readFileSync(tryPath2);
            return { data: buffer, error: null };
          }
        }
        return { data: null, error: new Error("File not found") };
      }
      const buffer = fs.readFileSync(fullPath);
      return { data: buffer, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  list: async (
    bucket: string,
    rawPrefixPath: string = "",
  ): Promise<{ data: StorageListItem[]; error: Error | null }> => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const prefixPath = rawPrefixPath ? sanitizePath(rawPrefixPath) : "";
      const targetDir = path.join(STORAGE_DIR, cleanBucket, prefixPath);

      if (!fs.existsSync(targetDir)) {
        return { data: [], error: null };
      }

      const files = fs.readdirSync(targetDir, { withFileTypes: true });
      const result: StorageListItem[] = files.map((f) => {
        const fullPath = path.join(targetDir, f.name);
        const stats = fs.statSync(fullPath);
        return {
          id: f.isDirectory()
            ? null
            : prefixPath
              ? `${prefixPath}/${f.name}`
              : f.name,
          name: f.name,
          metadata: {
            size: stats.size,
            mimetype: getMimeType(f.name),
          },
          created_at: stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString(),
        };
      });

      return { data: result, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  remove: async (
    bucket: string,
    rawPaths: string[],
  ): Promise<{ data: string[]; error: Error | null }> => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const removed: string[] = [];

      for (const raw of rawPaths) {
        try {
          const p = sanitizePath(raw);
          const fullPath = path.join(STORAGE_DIR, cleanBucket, p);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            removed.push(p);
          }
        } catch {
          // ignore invalid path errors in batch removal
        }
      }

      return { data: removed, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  getPublicUrl: (bucket: string, rawFilePath: string): string => {
    const cleanBucket = sanitizePath(bucket);
    const filePath = sanitizePath(rawFilePath);
    return `/api/storage/public/${cleanBucket}/${filePath}`;
  },

  createSignedUrl: (
    bucket: string,
    rawFilePath: string,
    token?: string,
  ): string => {
    const cleanBucket = sanitizePath(bucket);
    const filePath = sanitizePath(rawFilePath);
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
    return `/api/storage/download/${cleanBucket}/${filePath}${tokenQuery}`;
  },
};

export const storageService = serverStorage;
