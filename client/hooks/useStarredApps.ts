import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAuthenticatedClient } from "@/lib/db";

/**
 * Per-user list of starred (favourite) app ids.
 *
 * Starred apps are pinned to the top of the apps catalogue so frequently used
 * tools are never buried underneath the rest of the list.
 *
 * Persistence follows the same pattern as theme / language preferences:
 *  - Signed-in users: stored on the account in the `user_preferences` table
 *    (`starred_apps` field), so stars follow the account across devices.
 *  - Anonymous users: stored in localStorage under a guest key.
 *
 * localStorage is also kept as an optimistic / offline mirror for signed-in
 * users so starring feels instant even on a slow connection.
 */
const STORAGE_KEY_PREFIX = "starred_apps";
const GUEST_KEY = `${STORAGE_KEY_PREFIX}:guest`;
// A last-known-good copy guarded against an empty list caused by a wiped
// browser profile or a bad server row. Cleared when the user intentionally
// unstars everything.
const BACKUP_KEY_PREFIX = "starred_apps_backup";

function readStarred(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeStarred(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    const backupKey = key.replace(STORAGE_KEY_PREFIX, BACKUP_KEY_PREFIX);
    localStorage.setItem(backupKey, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode / quota) — the in-memory
    // state still works for the current session.
  }
}

function backupKeyFor(key: string): string {
  return key.replace(STORAGE_KEY_PREFIX, BACKUP_KEY_PREFIX);
}

function normalizeServerValue(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string");
}

export interface UseStarredAppsResult {
  starredApps: string[];
  isStarred: (appId: string) => boolean;
  toggleStar: (appId: string) => void;
}

export function useStarredApps(): UseStarredAppsResult {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}:${userId}` : GUEST_KEY;

  const [starredApps, setStarredApps] = useState<string[]>(() =>
    readStarred(storageKey),
  );

  // A toggle may happen while the account preference is still loading. Track
  // it so the load result cannot clobber the newer local value. The mirror ref
  // keeps a pure state updater (no side effects inside React's updater).
  const toggledDuringLoadRef = useRef(false);
  const currentRef = useRef(starredApps);

  // Load the account preference whenever the active user changes.
  useEffect(() => {
    let isMounted = true;

    const loadStarred = async () => {
      toggledDuringLoadRef.current = false;
      const local = readStarred(storageKey);

      if (!userId) {
        // Anonymous: localStorage is the only source of truth.
        let finalLocal = local;
        if (!finalLocal.length) {
          const backup = readStarred(backupKeyFor(storageKey));
          if (backup.length) {
            finalLocal = backup;
            writeStarred(storageKey, backup);
          }
        }
        if (isMounted) {
          currentRef.current = finalLocal;
          setStarredApps(finalLocal);
        }
        return;
      }

      try {
        const client = getAuthenticatedClient(accessToken);
        const { data, error } = await client
          .from("user_preferences")
          .select("starred_apps")
          .eq("user_id", userId)
          .single();

        // PGRST116 means "no row yet" — keep any existing local stars and let
        // the first toggle create the preference row.
        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const fromServer = normalizeServerValue(data?.starred_apps);
        let loaded = fromServer ?? local;
        if (!loaded.length) {
          // An empty server row or a wiped browser profile should not silently
          // destroy the user's favourites; fall back to the last known list.
          const backup = readStarred(backupKeyFor(storageKey));
          if (backup.length) loaded = backup;
        }
        if (isMounted && !toggledDuringLoadRef.current) {
          currentRef.current = loaded;
          setStarredApps(loaded);
          writeStarred(storageKey, loaded);
        }
      } catch (err) {
        console.error("Failed to load starred apps preference:", err);
        if (isMounted) {
          currentRef.current = local;
          setStarredApps(local);
        }
      }
    };

    loadStarred();
    return () => {
      isMounted = false;
    };
  }, [userId, accessToken, storageKey]);

  const toggleStar = useCallback(
    (appId: string) => {
      toggledDuringLoadRef.current = true;
      const current = currentRef.current;
      const next = current.includes(appId)
        ? current.filter((id) => id !== appId)
        : [...current, appId];
      currentRef.current = next;
      setStarredApps(next);

      // Update the local/optimistic copy immediately.
      writeStarred(storageKey, next);

      // Persist to the account when signed in. The server merges this partial
      // patch into the existing user_preferences row, so theme, language, and
      // other preferences are left untouched.
      if (userId) {
        (async () => {
          try {
            const client = getAuthenticatedClient(accessToken);
            await client
              .from("user_preferences")
              .upsert(
                { user_id: userId, starred_apps: next },
                { onConflict: "user_id" },
              );
          } catch (err) {
            console.error("Failed to save starred apps preference:", err);
          }
        })();
      }
    },
    [storageKey, userId, accessToken],
  );

  const isStarred = useCallback(
    (appId: string) => starredApps.includes(appId),
    [starredApps],
  );

  return { starredApps, isStarred, toggleStar };
}
