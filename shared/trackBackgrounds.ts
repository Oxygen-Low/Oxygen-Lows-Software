/**
 * Shared helpers for per-song topbar player backgrounds.
 *
 * Each song can have a cropped background image. The cropped copy lives in a
 * hidden folder inside the user's storage directory (so it counts toward the
 * storage quota) and is never shown in storage listings.
 */

/** Name of the hidden folder inside `uploads/Storage/<userId>/`. */
export const HIDDEN_STORAGE_DIR = ".hidden";

/** Maximum accepted size for a cropped background upload. */
export const TRACK_BACKGROUND_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Maximum output width (px) of the cropped background image. */
export const TRACK_BACKGROUND_MAX_WIDTH = 800;

/** Pattern every hidden background filename must match. */
export const TRACK_BACKGROUND_FILE_REGEX =
  /^songbg-[a-z0-9]{6,64}\.(webp|png|jpg)$/;

export interface TrackBackgroundEntry {
  /** Filename of the hidden cropped copy (inside the hidden folder). */
  file: string;
  /** Storage path of the original source image (used for re-cropping). */
  source?: string | null;
}

export type TrackBackgroundMap = Record<string, TrackBackgroundEntry>;

const UUID_SEGMENT_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/**
 * Normalises a track file name / storage path into a stable key that is
 * relative to the user's storage root (e.g. `music/song.mp3`).
 *
 * Mirrors the path resolution used for playback so that every representation
 * of the same audio file maps to the same key.
 */
export function normalizeTrackKey(
  fileName: string | null | undefined,
  userId?: string | number | null,
): string {
  if (!fileName) return "";
  let p = String(fileName);
  let previous: string;
  do {
    previous = p;
    p = p
      .replace(/\\/g, "/")
      .replace(/\.\.\//g, "")
      .replace(/^\/+/, "");
  } while (p !== previous);

  const uid =
    userId !== undefined && userId !== null ? String(userId).trim() : "";
  if (uid && p.startsWith(uid + "/")) {
    p = p.slice(uid.length + 1);
  }
  if (UUID_SEGMENT_REGEX.test(p)) {
    p = p.replace(UUID_SEGMENT_REGEX, "");
  }
  return p;
}

/** Validates/normalises an untrusted map loaded from preferences. */
export function sanitizeTrackBackgroundMap(raw: unknown): TrackBackgroundMap {
  const result: TrackBackgroundMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.file !== "string" ||
      !TRACK_BACKGROUND_FILE_REGEX.test(entry.file)
    ) {
      continue;
    }
    result[key] = {
      file: entry.file,
      source: typeof entry.source === "string" ? entry.source : null,
    };
  }
  return result;
}
