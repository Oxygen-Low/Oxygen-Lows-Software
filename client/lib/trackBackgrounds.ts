import { getLocalSession } from "./localSession";
import { handleSafetyModeration } from "./safetyModeration";
import type { TrackBackgroundMap } from "@shared/trackBackgrounds";

export interface TrackBackgroundUsage {
  totalSize: number;
  items: { key: string; file: string; size: number }[];
}

function getAuthToken(): string | undefined {
  try {
    return getLocalSession()?.access_token;
  } catch {
    return undefined;
  }
}

async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const token = getAuthToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok || json?.error) {
      if (json) handleSafetyModeration(json);
      return {
        data: null,
        error: new Error(json?.error || `Request failed (${res.status})`),
      };
    }
    return { data: (json?.data ?? null) as T, error: null };
  } catch (e: any) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function fetchTrackBackgrounds() {
  return request<{ backgrounds: TrackBackgroundMap; usage: TrackBackgroundUsage }>(
    "/api/storage/track-backgrounds",
  );
}

export function uploadTrackBackground(
  trackKey: string,
  image: Blob,
  sourcePath?: string | null,
) {
  const form = new FormData();
  form.append("trackKey", trackKey);
  if (sourcePath) form.append("sourcePath", sourcePath);
  const ext = image.type === "image/png" ? "png" : image.type === "image/jpeg" ? "jpg" : "webp";
  form.append("file", image, `background.${ext}`);
  return request<{ key: string; file: string; backgrounds: TrackBackgroundMap }>(
    "/api/storage/track-backgrounds",
    { method: "POST", body: form },
  );
}

export function deleteTrackBackground(trackKey: string) {
  return request<{ backgrounds: TrackBackgroundMap }>(
    "/api/storage/track-backgrounds",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackKey }),
    },
  );
}

/** URL usable directly in `<img src>` / CSS `background-image`. */
export function getTrackBackgroundFileUrl(
  fileName: string,
  token?: string | null,
): string {
  const authToken = token ?? getAuthToken();
  const query = authToken ? `?token=${encodeURIComponent(authToken)}` : "";
  return `/api/storage/track-backgrounds/file/${encodeURIComponent(fileName)}${query}`;
}
