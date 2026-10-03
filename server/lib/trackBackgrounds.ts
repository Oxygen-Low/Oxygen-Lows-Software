import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  STORAGE_DIR,
  MAX_USER_QUOTA,
  assertSafeStoragePath,
  getUserTotalSize,
  sanitizePath,
} from "./storage.ts";
import { getTableRows, saveTableRows } from "./dataStore.ts";
import {
  HIDDEN_STORAGE_DIR,
  TRACK_BACKGROUND_FILE_REGEX,
  TRACK_BACKGROUND_MAX_BYTES,
  normalizeTrackKey,
  sanitizeTrackBackgroundMap,
  type TrackBackgroundMap,
} from "../../shared/trackBackgrounds.ts";

const PREFS_TABLE = "user_preferences";
const PREFS_FIELD = "track_backgrounds";

export class TrackBackgroundError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Detects the image type from magic bytes. Only webp/png/jpeg are allowed. */
export function detectImageExtension(
  buffer: Buffer,
): "webp" | "png" | "jpg" | null {
  if (!buffer || buffer.length < 12) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function assertUserId(userId: string | number): string {
  const uid = String(userId ?? "").trim();
  if (!uid || uid.includes("/") || uid.includes("\\") || uid.includes("..")) {
    throw new TrackBackgroundError("Invalid user ID", 400);
  }
  return uid;
}

export function getHiddenDir(userId: string | number): string {
  const uid = assertUserId(userId);
  return assertSafeStoragePath(STORAGE_DIR, "Storage", uid, HIDDEN_STORAGE_DIR);
}

function getHiddenFilePath(userId: string | number, fileName: string): string {
  if (!TRACK_BACKGROUND_FILE_REGEX.test(fileName)) {
    throw new TrackBackgroundError("Invalid background file name", 400);
  }
  return assertSafeStoragePath(getHiddenDir(userId), fileName);
}

function deleteHiddenFile(userId: string | number, fileName?: string | null) {
  if (!fileName) return;
  try {
    const full = getHiddenFilePath(userId, fileName);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    // ignore – file already gone or invalid name
  }
}

export function getTrackBackgrounds(userId: string | number): TrackBackgroundMap {
  const uid = assertUserId(userId);
  const prefs = getTableRows(PREFS_TABLE, uid)[0] || {};
  return sanitizeTrackBackgroundMap(prefs[PREFS_FIELD]);
}

function saveTrackBackgrounds(userId: string | number, map: TrackBackgroundMap) {
  const uid = assertUserId(userId);
  // saveTableRows merges this row into the existing preferences object.
  saveTableRows(PREFS_TABLE, uid, [{ user_id: uid, [PREFS_FIELD]: map }]);
}

/**
 * Stores a new cropped background for a track, replacing (and deleting) any
 * previous copy. Enforces the per-user storage quota.
 */
export function setTrackBackground(
  userId: string | number,
  rawTrackKey: string,
  buffer: Buffer,
  sourcePath?: string | null,
): { key: string; file: string; backgrounds: TrackBackgroundMap } {
  const uid = assertUserId(userId);
  const key = normalizeTrackKey(rawTrackKey, uid);
  if (!key) throw new TrackBackgroundError("Missing track", 400);

  if (!buffer || buffer.length === 0) {
    throw new TrackBackgroundError("No file provided", 400);
  }
  if (buffer.length > TRACK_BACKGROUND_MAX_BYTES) {
    throw new TrackBackgroundError("Background image is too large", 413);
  }
  const ext = detectImageExtension(buffer);
  if (!ext) {
    throw new TrackBackgroundError("Unsupported image format", 400);
  }

  const map = getTrackBackgrounds(uid);
  const previous = map[key];

  let previousSize = 0;
  if (previous) {
    try {
      previousSize = fs.statSync(getHiddenFilePath(uid, previous.file)).size;
    } catch {
      previousSize = 0;
    }
  }

  const currentSize = getUserTotalSize(uid);
  if (currentSize - previousSize + buffer.length > MAX_USER_QUOTA) {
    throw new TrackBackgroundError(
      "Quota exceeded. Maximum 500MB allowed per user.",
      413,
    );
  }

  let cleanSource: string | null = null;
  if (sourcePath) {
    try {
      cleanSource = sanitizePath(String(sourcePath)) || null;
    } catch {
      cleanSource = null;
    }
  }

  const fileName = `songbg-${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const hiddenDir = getHiddenDir(uid);
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.writeFileSync(getHiddenFilePath(uid, fileName), buffer);

  const updated: TrackBackgroundMap = {
    ...map,
    [key]: { file: fileName, source: cleanSource },
  };
  saveTrackBackgrounds(uid, updated);

  if (previous && previous.file !== fileName) {
    deleteHiddenFile(uid, previous.file);
  }

  return { key, file: fileName, backgrounds: updated };
}

/** Removes a track's background (and its hidden copy). */
export function removeTrackBackground(
  userId: string | number,
  rawTrackKey: string,
): TrackBackgroundMap {
  const uid = assertUserId(userId);
  const key = normalizeTrackKey(rawTrackKey, uid);
  const map = getTrackBackgrounds(uid);
  const existing = map[key];
  if (!existing) return map;

  const { [key]: _removed, ...rest } = map;
  saveTrackBackgrounds(uid, rest);
  deleteHiddenFile(uid, existing.file);
  return rest;
}

/**
 * Called after files are removed from the `Storage` bucket. Any background
 * belonging to a deleted audio file is deleted as well.
 *
 * @param removedPaths Sanitized bucket-relative paths, e.g. `"<uid>/song.mp3"`.
 */
export function cleanupTrackBackgroundsForRemovedFiles(
  removedPaths: string[],
): void {
  const byOwner = new Map<string, string[]>();
  for (const p of removedPaths || []) {
    const clean = String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const slash = clean.indexOf("/");
    if (slash <= 0) continue;
    const owner = clean.slice(0, slash);
    const list = byOwner.get(owner) || [];
    list.push(normalizeTrackKey(clean, owner));
    byOwner.set(owner, list);
  }

  for (const [owner, keys] of byOwner) {
    try {
      const map = getTrackBackgrounds(owner);
      let changed = false;
      const toDelete: string[] = [];
      for (const key of keys) {
        const entry = map[key];
        if (entry) {
          toDelete.push(entry.file);
          delete map[key];
          changed = true;
        }
      }
      if (changed) {
        saveTrackBackgrounds(owner, map);
        toDelete.forEach((f) => deleteHiddenFile(owner, f));
      }
    } catch (err) {
      console.warn("[trackBackgrounds] cleanup failed for user", owner, err);
    }
  }
}

/** Reads a hidden background image owned by the given user. */
export function readTrackBackgroundFile(
  userId: string | number,
  fileName: string,
): { data: Buffer; mimeType: string } | null {
  try {
    const full = getHiddenFilePath(userId, fileName);
    if (!fs.existsSync(full)) return null;
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const mimeType =
      ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
    return { data: fs.readFileSync(full), mimeType };
  } catch {
    return null;
  }
}

/** Lists storage used by a user's hidden background copies. */
export function getTrackBackgroundUsage(userId: string | number): {
  totalSize: number;
  items: { key: string; file: string; size: number }[];
} {
  const uid = assertUserId(userId);
  const map = getTrackBackgrounds(uid);
  const fileToKey = new Map<string, string>();
  for (const [key, entry] of Object.entries(map)) fileToKey.set(entry.file, key);

  const items: { key: string; file: string; size: number }[] = [];
  let totalSize = 0;
  const dir = getHiddenDir(uid);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      try {
        const size = fs.statSync(assertSafeStoragePath(dir, f.name)).size;
        totalSize += size;
        items.push({ key: fileToKey.get(f.name) || f.name, file: f.name, size });
      } catch {
        // ignore
      }
    }
  }
  return { totalSize, items };
}
