import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteTrackBackground,
  fetchTrackBackgrounds,
  getTrackBackgroundFileUrl,
  uploadTrackBackground,
} from "@/lib/trackBackgrounds";
import {
  normalizeTrackKey,
  sanitizeTrackBackgroundMap,
  type TrackBackgroundMap,
} from "@shared/trackBackgrounds";
import { toast } from "sonner";

export interface PlaylistTrack {
  id?: string;
  name: string;
  artist?: string;
  fileName: string;
  volume?: number;
}

export interface MusicContextType {
  playlist: PlaylistTrack[];
  currentTrack: PlaylistTrack | null;
  currentPosition: number;
  duration: number;
  isPlaying: boolean;
  shuffle: boolean;
  loop: boolean;
  volume: number;
  playlistSessionVolume: number;
  isMuted: boolean;
  isLoading: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  play: () => Promise<void>;
  pause: () => void;
  playTrack: (
    track: PlaylistTrack,
    playlist?: PlaylistTrack[],
  ) => Promise<void>;
  playNext: () => Promise<void>;
  playPrev: () => Promise<void>;
  seek: (positionMs: number) => void;
  setVolume: (vol: number) => void;
  setPlaylistSessionVolume: (vol: number) => void;
  setTrackVolume: (index: number, volume: number) => void;
  toggleMute: () => void;
  addTrack: (track: PlaylistTrack) => Promise<void>;
  removeTrack: (trackFileName: string) => Promise<void>;
  reorderPlaylist: (newPlaylist: PlaylistTrack[]) => Promise<void>;
  moveTrack: (fromIndex: number, toIndex: number) => Promise<void>;
  clearPlaylist: () => Promise<void>;
  toggleShuffle: (shuffle: boolean) => Promise<void>;
  toggleLoop: (loop: boolean) => Promise<void>;
  /** Per-song topbar backgrounds keyed by normalized track path. */
  trackBackgrounds: TrackBackgroundMap;
  /** Background image URL for the currently playing track (if any). */
  currentBackgroundUrl: string | null;
  getTrackBackgroundUrl: (
    track: PlaylistTrack | null | undefined,
  ) => string | null;
  getTrackBackgroundSource: (
    track: PlaylistTrack | null | undefined,
  ) => string | null;
  setTrackBackground: (
    track: PlaylistTrack,
    image: Blob,
    sourcePath?: string | null,
  ) => Promise<void>;
  removeTrackBackground: (track: PlaylistTrack) => Promise<void>;
  refreshTrackBackgrounds: () => Promise<void>;
}

const AUTO_RESUME_STORAGE_KEY = "oxygen_music_exit_state";
const AUTO_RESUME_WINDOW_MS = 10000; // 10 seconds
const VOLUME_STORAGE_KEY = "oxygen_music_volume";
const MUTED_STORAGE_KEY = "oxygen_music_muted";

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const matchTrack = (
  a?: PlaylistTrack | null,
  b?: PlaylistTrack | null,
): boolean => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.fileName === b.fileName) return true;
  const cleanA = (a.fileName || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const cleanB = (b.fileName || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleanA && cleanB) {
    if (cleanA === cleanB) return true;
    if (cleanA.endsWith("/" + cleanB) || cleanB.endsWith("/" + cleanA)) return true;
  }
  return false;
};

const findTrackIndex = (
  playlist: PlaylistTrack[],
  track: PlaylistTrack | null,
): number => {
  if (!track || !playlist || playlist.length === 0) return -1;
  return playlist.findIndex((t) => matchTrack(t, track));
};

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { session } = useAuth();
  const [playlist, setPlaylistState] = useState<PlaylistTrack[]>([]);
  const [currentTrack, setCurrentTrackState] = useState<PlaylistTrack | null>(
    null,
  );
  const [currentPosition, setCurrentPositionState] = useState(0);
  const [duration, setDurationState] = useState(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [loop, setLoopState] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    try {
      const savedVol = localStorage.getItem(VOLUME_STORAGE_KEY);
      return savedVol !== null ? parseFloat(savedVol) : 1;
    } catch {
      return 1;
    }
  });
  const [isMuted, setIsMutedState] = useState(() => {
    try {
      return localStorage.getItem(MUTED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [playlistSessionVolume, setPlaylistSessionVolumeState] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [trackBackgrounds, setTrackBackgroundsState] =
    useState<TrackBackgroundMap>({});

  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const playlistRef = useRef<PlaylistTrack[]>([]);
  const currentTrackRef = useRef<PlaylistTrack | null>(null);
  const isPlayingRef = useRef(false);
  const shuffleRef = useRef(false);
  const loopRef = useRef(false);
  const currentPositionRef = useRef(0);
  const playNextRef = useRef<(() => void) | undefined>(undefined);
  const playTokenRef = useRef(0);
  const volumeRef = useRef(volume);
  const playlistSessionVolumeRef = useRef(playlistSessionVolume);
  const isMutedRef = useRef(isMuted);

  // Synchronously keep refs updated during render so that any callbacks or event handlers
  // executed before passive effects run have the latest state values.
  playlistRef.current = playlist;
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  shuffleRef.current = shuffle;
  loopRef.current = loop;
  volumeRef.current = volume;
  playlistSessionVolumeRef.current = playlistSessionVolume;
  isMutedRef.current = isMuted;

  useLayoutEffect(() => {
    playlistRef.current = playlist;
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    shuffleRef.current = shuffle;
    loopRef.current = loop;
    volumeRef.current = volume;
    playlistSessionVolumeRef.current = playlistSessionVolume;
    isMutedRef.current = isMuted;
  }, [playlist, currentTrack, isPlaying, shuffle, loop, volume, playlistSessionVolume, isMuted]);

  useEffect(() => {
    playlistRef.current = playlist;
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    shuffleRef.current = shuffle;
    loopRef.current = loop;
    volumeRef.current = volume;
    playlistSessionVolumeRef.current = playlistSessionVolume;
    isMutedRef.current = isMuted;
    if (audioRef.current) {
      audioRef.current.loop = loop;
      const trackVol = currentTrack?.volume ?? 1;
      audioRef.current.volume = isMuted
        ? 0
        : Math.max(0, Math.min(1, volume * playlistSessionVolume * trackVol));
      audioRef.current.muted = isMuted;
    }
  }, [playlist, currentTrack, isPlaying, shuffle, loop, volume, playlistSessionVolume, isMuted]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const resolvePlaybackUrl = useCallback(
    async (fileName: string): Promise<string | null> => {
      if (!fileName) return null;

      // Direct HTTP / Blob URLs
      if (
        fileName.startsWith("http://") ||
        fileName.startsWith("https://") ||
        fileName.startsWith("blob:") ||
        fileName.startsWith("data:")
      ) {
        return fileName;
      }

      if (!session?.user?.id) return null;

      let path = fileName;
      let previous: string;
      do {
        previous = path;
        path = path
          .replace(/\\/g, "/")
          .replace(/\.\.\//g, "")
          .replace(/^\/+/, "");
      } while (path !== previous);

      // Handle public assets bucket
      if (path.startsWith("public-assets/")) {
        const cleanPath = path.replace(/^public-assets\//, "");
        const { data } = storage.from("public-assets").getPublicUrl(cleanPath);
        if (data?.publicUrl) return data.publicUrl;
      }

      const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

      if (path.startsWith(session.user.id + "/")) {
        const afterUser = path.slice(session.user.id.length + 1);
        if (UUID_REGEX.test(afterUser)) {
          path = `${session.user.id}/${afterUser.replace(UUID_REGEX, "")}`;
        }
      } else if (UUID_REGEX.test(path)) {
        const subPath = path.replace(UUID_REGEX, "");
        path = `${session.user.id}/${subPath}`;
      } else {
        path = `${session.user.id}/${path}`;
      }

      // 1. Try to create signed URL from Storage
      try {
        const { data: signedData, error: signedErr } = await storage
          .from("Storage")
          .createSignedUrl(path, 3600);

        if (!signedErr && signedData?.signedUrl) {
          return signedData.signedUrl;
        }
      } catch (err) {
        console.warn("Error creating signed URL for playback, attempting blob download fallback:", err);
      }

      // 2. Fallback: Download file as Blob and create Blob URL
      try {
        const { data: blobData, error: downloadErr } = await storage
          .from("Storage")
          .download(path);

        if (!downloadErr && blobData) {
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          const blobUrl = URL.createObjectURL(blobData);
          blobUrlRef.current = blobUrl;
          return blobUrl;
        }
      } catch (blobErr) {
        console.error("Blob fallback download also failed:", blobErr);
      }

      return null;
    },
    [session?.user?.id],
  );

  const savePreferences = useCallback(
    async (overrides: any = {}) => {
      if (!session?.user?.id) return;

      const music_playlist =
        overrides.playlist !== undefined
          ? overrides.playlist
          : playlistRef.current.length > 0
            ? playlistRef.current
            : playlist;
      const current_music_track =
        overrides.currentTrack !== undefined
          ? overrides.currentTrack?.fileName || null
          : currentTrackRef.current?.fileName || null;
      const current_music_position =
        overrides.currentPosition !== undefined
          ? overrides.currentPosition
          : Math.floor(currentPositionRef.current);
      const shuffle_enabled =
        overrides.shuffle !== undefined
          ? overrides.shuffle
          : shuffleRef.current;
      const loop_enabled =
        overrides.loop !== undefined ? overrides.loop : loopRef.current;

      try {
        await db.from("user_preferences").upsert(
          {
            user_id: session.user.id,
            music_playlist,
            current_music_track,
            current_music_position,
            shuffle_enabled,
            loop_enabled,
          },
          { onConflict: "user_id" },
        );
      } catch (err) {
        console.warn("Failed to persist user preferences:", err);
      }
    },
    [session?.user?.id, playlist],
  );

  // Save the playing state to localStorage whenever we exit/refresh
  const saveExitState = useCallback((playing: boolean) => {
    try {
      const pos = audioRef.current
        ? audioRef.current.currentTime * 1000
        : currentPositionRef.current;
      localStorage.setItem(
        AUTO_RESUME_STORAGE_KEY,
        JSON.stringify({
          isPlaying: playing,
          timestamp: Date.now(),
          position: Math.floor(pos),
          trackFileName: currentTrackRef.current?.fileName ?? null,
        }),
      );
    } catch {
      // ignore
    }
  }, []);

  // Heartbeat: update the stored timestamp every second so it stays fresh.
  // Use audioRef.current.paused as the ground truth to avoid a race where
  // the interval fires after pause() writes isPlaying:false but before React
  // re-renders and clears this interval (which would overwrite the saved state).
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const actuallyPlaying =
        isPlayingRef.current && audioRef.current?.paused === false;
      if (actuallyPlaying) saveExitState(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, saveExitState]);

  // Save on unload/hide. Use the audio element's paused property as the
  // ground truth so that a paused-then-exit flow never saves isPlaying:true.
  useEffect(() => {
    const onExit = (e?: Event) => {
      if (
        e?.type === "visibilitychange" &&
        document.visibilityState !== "hidden"
      )
        return;
      const actuallyPlaying =
        isPlayingRef.current && audioRef.current?.paused === false;
      saveExitState(actuallyPlaying);
    };
    window.addEventListener("beforeunload", onExit);
    window.addEventListener("pagehide", onExit);
    document.addEventListener("visibilitychange", onExit);
    return () => {
      window.removeEventListener("beforeunload", onExit);
      window.removeEventListener("pagehide", onExit);
      document.removeEventListener("visibilitychange", onExit);
    };
  }, [saveExitState]);

  // Check on load if we should auto-resume
  const getAutoResumeState = useCallback((): {
    shouldResume: boolean;
    position: number;
  } => {
    try {
      const raw = localStorage.getItem(AUTO_RESUME_STORAGE_KEY);
      if (!raw) return { shouldResume: false, position: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed?.isPlaying || typeof parsed.timestamp !== "number") {
        return { shouldResume: false, position: 0 };
      }
      const elapsed = Date.now() - parsed.timestamp;
      const shouldResume = elapsed >= 0 && elapsed <= AUTO_RESUME_WINDOW_MS;
      return {
        shouldResume,
        position: typeof parsed.position === "number" ? parsed.position : 0,
      };
    } catch {
      return { shouldResume: false, position: 0 };
    }
  }, []);

  // Load music preferences from DB
  useEffect(() => {
    let isMounted = true;
    const loadMusicPreferences = async () => {
      if (!session?.user?.id) {
        setIsLoading(false);
        return;
      }

      const initToken = playTokenRef.current;

      try {
        const { data, error } = await db
          .from("user_preferences")
          .select(
            "music_playlist, current_music_track, current_music_position, shuffle_enabled, loop_enabled, track_backgrounds",
          )
          .eq("user_id", session.user.id)
          .single();

        if (!isMounted || playTokenRef.current !== initToken) return;

        if (error && error.code !== "PGRST116") throw error;

        setTrackBackgroundsState(
          sanitizeTrackBackgroundMap(data?.track_backgrounds),
        );

        const loadedPlaylist = (data?.music_playlist as PlaylistTrack[]) || [];
        const currentTrackName = data?.current_music_track as string;
        const savedPosition = data?.current_music_position || 0;
        const shuffleEnabled = data?.shuffle_enabled || false;
        const loopEnabled = data?.loop_enabled || false;

        playlistRef.current = loadedPlaylist;
        setPlaylistState(loadedPlaylist);
        setShuffleState(shuffleEnabled);
        setLoopState(loopEnabled);

        if (audioRef.current) {
          audioRef.current.loop = loopEnabled;
          audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
          audioRef.current.muted = isMutedRef.current;
        }

        if (loadedPlaylist.length > 0) {
          // Find matching track, or fallback to first track if not found
          const track =
            loadedPlaylist.find(
              (t) =>
                t.fileName === currentTrackName ||
                t.fileName.endsWith("/" + currentTrackName) ||
                currentTrackName?.endsWith("/" + t.fileName),
            ) || loadedPlaylist[0];

          if (track) {
            setCurrentTrackState(track);
            currentTrackRef.current = track;

            const url = await resolvePlaybackUrl(track.fileName);
            if (!isMounted || playTokenRef.current !== initToken) return;

            if (url && audioRef.current) {
              const trackVol = track.volume ?? 1;
              audioRef.current.volume = isMutedRef.current
                ? 0
                : Math.max(0, Math.min(1, volumeRef.current * playlistSessionVolumeRef.current * trackVol));
              const { shouldResume, position } = getAutoResumeState();
              const seekTo = shouldResume ? position : savedPosition;

              audioRef.current.src = url;

              const doSeekAndPlay = async () => {
                if (!audioRef.current || !isMounted || playTokenRef.current !== initToken) return;
                try {
                  audioRef.current.currentTime = seekTo / 1000;
                } catch {}

                setCurrentPositionState(seekTo);
                currentPositionRef.current = seekTo;

                if (shouldResume) {
                  try {
                    await audioRef.current.play();
                    if (!isMounted || playTokenRef.current !== initToken) return;
                    setIsPlayingState(true);
                    isPlayingRef.current = true;
                  } catch {
                    // Browser blocked autoplay — show a one-click resume toast
                    if (!isMounted || playTokenRef.current !== initToken) return;
                    toast("Music paused", {
                      description: `Click to resume "${track.name}"`,
                      action: {
                        label: "▶ Resume",
                        onClick: async () => {
                          if (!audioRef.current) return;
                          try {
                            await audioRef.current.play();
                            setIsPlayingState(true);
                            isPlayingRef.current = true;
                          } catch {}
                        },
                      },
                      duration: 8000,
                    });
                  }
                }
              };

              doSeekAndPlay();
              audioRef.current.addEventListener(
                "loadedmetadata",
                () => {
                  if (!audioRef.current || playTokenRef.current !== initToken) return;
                  try {
                    audioRef.current.currentTime = seekTo / 1000;
                    if (isFinite(audioRef.current.duration)) {
                      setDurationState(audioRef.current.duration * 1000);
                    }
                  } catch {}
                },
                { once: true },
              );
            }
          }
        } else {
          setCurrentPositionState(savedPosition);
          currentPositionRef.current = savedPosition;
        }
      } catch (error) {
        console.error("Failed to load music preferences:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMusicPreferences();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, resolvePlaybackUrl, getAutoResumeState]);

  const playTrack = useCallback(
    async (track: PlaylistTrack, overridePlaylist?: PlaylistTrack[]) => {
      if (!audioRef.current) {
        console.error("Audio ref is not available");
        return;
      }

      const currentToken = ++playTokenRef.current;
      setCurrentTrackState(track);
      currentTrackRef.current = track;
      setCurrentPositionState(0);
      currentPositionRef.current = 0;
      setDurationState(0);

      audioRef.current.pause();
      audioRef.current.src = "";

      const url = await resolvePlaybackUrl(track.fileName);
      if (currentToken !== playTokenRef.current) return;

      if (!url) {
        console.error(`Failed to resolve URL for track: ${track.fileName}`);
        setIsPlayingState(false);
        isPlayingRef.current = false;
        saveExitState(false);
        return;
      }

      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      const trackVol = track.volume ?? 1;
      audioRef.current.volume = isMuted
        ? 0
        : Math.max(0, Math.min(1, volume * playlistSessionVolume * trackVol));
      try {
        await audioRef.current.play();
        if (currentToken !== playTokenRef.current) return;
        setIsPlayingState(true);
        isPlayingRef.current = true;
        saveExitState(true);
      } catch (error) {
        if (currentToken !== playTokenRef.current) return;
        console.error(`Failed to play track ${track.name}:`, error);
        setIsPlayingState(false);
        isPlayingRef.current = false;
        saveExitState(false);
      }

      if (currentToken === playTokenRef.current) {
        savePreferences({
          currentTrack: track,
          currentPosition: 0,
          playlist:
            overridePlaylist ||
            (playlistRef.current.length > 0 ? playlistRef.current : playlist),
        });
      }
    },
    [playlist, resolvePlaybackUrl, savePreferences, saveExitState, isMuted, volume, playlistSessionVolume],
  );

  const playNext = useCallback(async () => {
    const currentT = currentTrackRef.current;
    const playlistArr =
      playlistRef.current.length > 0 ? playlistRef.current : playlist;
    const isShuffle = shuffleRef.current;

    if (playlistArr.length === 0) return;

    if (!currentT) {
      await playTrack(playlistArr[0]);
      return;
    }

    let nextTrack: PlaylistTrack;

    if (isShuffle && playlistArr.length > 1) {
      // Pick random track excluding current track to avoid immediate repeat
      const otherTracks = playlistArr.filter(
        (t) => !matchTrack(t, currentT),
      );
      const randomIndex = Math.floor(Math.random() * (otherTracks.length || 1));
      nextTrack = otherTracks[randomIndex] || playlistArr[0];
    } else {
      const currentIndex = findTrackIndex(playlistArr, currentT);
      const validIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (validIndex + 1) % playlistArr.length;
      nextTrack = playlistArr[nextIndex];
    }

    await playTrack(nextTrack);
  }, [playlist, playTrack]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Setup audio event listeners for reliable React state synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const pos = audio.currentTime * 1000;
      setCurrentPositionState(pos);
      currentPositionRef.current = pos;
    };

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration)) {
        setDurationState(audio.duration * 1000);
      }
    };

    const handlePlay = () => {
      setIsPlayingState(true);
      isPlayingRef.current = true;
    };

    const handlePause = () => {
      setIsPlayingState(false);
      isPlayingRef.current = false;
    };

    const handleEnded = () => {
      if (loopRef.current) return;
      if (!audio.src || audio.src === window.location.href) return;
      playNextRef.current?.();
    };

    const handleError = async () => {
      const errorToken = playTokenRef.current;
      // Attempt blob fallback if streaming signed URL fails during playback
      const currentT = currentTrackRef.current;
      if (
        currentT &&
        audio.src &&
        audio.src !== window.location.href &&
        !audio.src.startsWith("blob:")
      ) {
        try {
          const { data: blobData } = await storage
            .from("Storage")
            .download(currentT.fileName.replace(/^\/+/, ""));
          if (errorToken !== playTokenRef.current) return;
          if (blobData) {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const blobUrl = URL.createObjectURL(blobData);
            blobUrlRef.current = blobUrl;
            audio.src = blobUrl;
            await audio.play();
            if (errorToken !== playTokenRef.current) return;
            setIsPlayingState(true);
            isPlayingRef.current = true;
            return;
          }
        } catch {
          // ignore
        }
      }
      if (errorToken === playTokenRef.current) {
        setIsPlayingState(false);
        isPlayingRef.current = false;
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  // Auto-save position to DB periodically
  useEffect(() => {
    if (!isPlaying || !session?.user?.id) return;
    const interval = setInterval(() => {
      savePreferences();
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, session?.user?.id, savePreferences]);

  const play = useCallback(async () => {
    const currentT =
      currentTrackRef.current ||
      currentTrack ||
      (playlistRef.current.length > 0 ? playlistRef.current[0] : playlist[0]);
    if (!currentT) return;

    if (!currentTrackRef.current && (playlistRef.current.length > 0 || playlist.length > 0)) {
      const first = playlistRef.current[0] || playlist[0];
      await playTrack(first);
      return;
    }

    const currentToken = playTokenRef.current;

    try {
      if (audioRef.current) {
        if (!audioRef.current.src || audioRef.current.src === window.location.href) {
          const url = await resolvePlaybackUrl(currentT.fileName);
          if (currentToken !== playTokenRef.current) return;
          if (url && audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.currentTime = currentPositionRef.current / 1000;
          }
        }
        if (currentToken !== playTokenRef.current) return;
        await audioRef.current.play();
      }
      setIsPlayingState(true);
      isPlayingRef.current = true;
      saveExitState(true);
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack, playlist, playTrack, resolvePlaybackUrl, saveExitState]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingState(false);
    isPlayingRef.current = false;
    saveExitState(false);
    savePreferences();
  }, [savePreferences, saveExitState]);

  const seek = useCallback(
    (positionMs: number) => {
      const targetSec = Math.max(0, positionMs / 1000);
      if (audioRef.current && isFinite(targetSec)) {
        try {
          audioRef.current.currentTime = targetSec;
        } catch {}
      }
      setCurrentPositionState(positionMs);
      currentPositionRef.current = positionMs;
      savePreferences({ currentPosition: positionMs });
    },
    [savePreferences],
  );

  const setVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setVolumeState(clamped);
      if (audioRef.current) {
        const trackVol = currentTrackRef.current?.volume ?? 1;
        audioRef.current.volume = isMuted
          ? 0
          : Math.max(0, Math.min(1, clamped * playlistSessionVolumeRef.current * trackVol));
      }
      try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
      } catch {}
    },
    [isMuted],
  );

  const setPlaylistSessionVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setPlaylistSessionVolumeState(clamped);
      playlistSessionVolumeRef.current = clamped;
      if (audioRef.current) {
        const trackVol = currentTrackRef.current?.volume ?? 1;
        audioRef.current.volume = isMuted
          ? 0
          : Math.max(0, Math.min(1, volumeRef.current * clamped * trackVol));
      }
    },
    [isMuted],
  );

  const setTrackVolume = useCallback(
    (index: number, newVolume: number) => {
      const clamped = Math.max(0, Math.min(1, newVolume));
      setPlaylistState((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const targetTrack = prev[index];
        const updatedTrack = { ...targetTrack, volume: clamped };
        const updatedPlaylist = [...prev];
        updatedPlaylist[index] = updatedTrack;
        playlistRef.current = updatedPlaylist;

        const isCurrent =
          currentTrackRef.current?.fileName === targetTrack.fileName ||
          currentTrackRef.current?.fileName.endsWith("/" + targetTrack.fileName) ||
          targetTrack.fileName.endsWith("/" + currentTrackRef.current?.fileName);

        if (isCurrent) {
          setCurrentTrackState(updatedTrack);
          currentTrackRef.current = updatedTrack;
          if (audioRef.current) {
            audioRef.current.volume = isMuted
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    volume * playlistSessionVolumeRef.current * clamped,
                  ),
                );
          }
        }

        savePreferences({
          playlist: updatedPlaylist,
          currentTrack: isCurrent ? updatedTrack : currentTrackRef.current,
        });
        return updatedPlaylist;
      });
    },
    [isMuted, volume, savePreferences],
  );

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
        const trackVol = currentTrackRef.current?.volume ?? 1;
        audioRef.current.volume = next
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                volume * playlistSessionVolumeRef.current * trackVol,
              ),
            );
      }
      try {
        localStorage.setItem(MUTED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, [volume]);

  const playPrev = useCallback(async () => {
    const currentT = currentTrackRef.current;
    const playlistArr =
      playlistRef.current.length > 0 ? playlistRef.current : playlist;

    if (playlistArr.length === 0) return;

    if (!currentT) {
      await playTrack(playlistArr[playlistArr.length - 1]);
      return;
    }

    // Standard media player UX: If played for more than 3 seconds, restart current track
    if (currentPositionRef.current > 3000) {
      seek(0);
      if (audioRef.current && !isPlayingRef.current) {
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    const currentIndex = findTrackIndex(playlistArr, currentT);
    const validIndex = currentIndex >= 0 ? currentIndex : 0;
    const prevIndex =
      (validIndex - 1 + playlistArr.length) % playlistArr.length;
    const prevTrack = playlistArr[prevIndex];

    await playTrack(prevTrack);
  }, [playlist, playTrack, seek]);

  const addTrack = useCallback(
    async (track: PlaylistTrack) => {
      if (!session?.user?.id) return;
      setPlaylistState((prev) => {
        const updatedPlaylist = [...prev, track];
        playlistRef.current = updatedPlaylist;
        savePreferences({
          playlist: updatedPlaylist,
          currentTrack: currentTrackRef.current || track,
        });
        return updatedPlaylist;
      });

      if (!currentTrackRef.current) {
        const currentToken = ++playTokenRef.current;
        setCurrentTrackState(track);
        currentTrackRef.current = track;
        const url = await resolvePlaybackUrl(track.fileName);
        if (currentToken !== playTokenRef.current) return;
        if (url && audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.currentTime = 0;
        }
      }
    },
    [session?.user?.id, resolvePlaybackUrl, savePreferences],
  );

  const removeTrack = useCallback(
    async (trackFileName: string) => {
      if (!session?.user?.id) return;

      const currentList =
        playlistRef.current.length > 0 ? playlistRef.current : playlist;
      const updatedPlaylist = currentList.filter(
        (t) =>
          t.fileName !== trackFileName &&
          !t.fileName.endsWith("/" + trackFileName) &&
          !trackFileName.endsWith("/" + t.fileName),
      );
      playlistRef.current = updatedPlaylist;
      setPlaylistState(updatedPlaylist);

      const isCurrent =
        currentTrackRef.current?.fileName === trackFileName ||
        currentTrackRef.current?.fileName.endsWith("/" + trackFileName) ||
        trackFileName.endsWith("/" + currentTrackRef.current?.fileName);

      if (isCurrent) {
        if (updatedPlaylist.length > 0) {
          const nextTrack = updatedPlaylist[0];
          if (isPlayingRef.current) {
            await playTrack(nextTrack, updatedPlaylist);
          } else {
            const currentToken = ++playTokenRef.current;
            setCurrentTrackState(nextTrack);
            currentTrackRef.current = nextTrack;
            setCurrentPositionState(0);
            currentPositionRef.current = 0;
            setDurationState(0);
            setIsPlayingState(false);
            isPlayingRef.current = false;
            saveExitState(false);
            const url = await resolvePlaybackUrl(nextTrack.fileName);
            if (currentToken !== playTokenRef.current) return;
            if (url && audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.currentTime = 0;
            }
            savePreferences({
              playlist: updatedPlaylist,
              currentTrack: nextTrack,
            });
          }
        } else {
          ++playTokenRef.current;
          setCurrentTrackState(null);
          currentTrackRef.current = null;
          setCurrentPositionState(0);
          currentPositionRef.current = 0;
          setDurationState(0);
          setIsPlayingState(false);
          isPlayingRef.current = false;
          saveExitState(false);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }
          savePreferences({
            playlist: [],
            currentTrack: null,
            currentPosition: 0,
          });
        }
      } else {
        savePreferences({ playlist: updatedPlaylist });
      }
    },
    [
      playlist,
      session?.user?.id,
      playTrack,
      resolvePlaybackUrl,
      savePreferences,
      saveExitState,
    ],
  );

  const reorderPlaylist = useCallback(
    async (newPlaylist: PlaylistTrack[]) => {
      playlistRef.current = newPlaylist;
      setPlaylistState(newPlaylist);
      savePreferences({ playlist: newPlaylist });
    },
    [savePreferences],
  );

  const moveTrack = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const currentList =
        playlistRef.current.length > 0 ? playlistRef.current : playlist;
      if (
        fromIndex < 0 ||
        fromIndex >= currentList.length ||
        toIndex < 0 ||
        toIndex >= currentList.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const updated = [...currentList];
      const [movedItem] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedItem);

      playlistRef.current = updated;
      setPlaylistState(updated);
      savePreferences({ playlist: updated });
    },
    [playlist, savePreferences],
  );

  const clearPlaylist = useCallback(async () => {
    ++playTokenRef.current;
    playlistRef.current = [];
    setPlaylistState([]);
    setCurrentTrackState(null);
    currentTrackRef.current = null;
    setCurrentPositionState(0);
    currentPositionRef.current = 0;
    setDurationState(0);
    setIsPlayingState(false);
    isPlayingRef.current = false;
    saveExitState(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    savePreferences({
      playlist: [],
      currentTrack: null,
      currentPosition: 0,
    });
  }, [savePreferences, saveExitState]);

  const toggleShuffle = useCallback(
    async (newShuffleState: boolean) => {
      setShuffleState(newShuffleState);
      savePreferences({ shuffle: newShuffleState });
    },
    [savePreferences],
  );

  const toggleLoop = useCallback(
    async (newLoopState: boolean) => {
      setLoopState(newLoopState);
      loopRef.current = newLoopState;
      if (audioRef.current) {
        audioRef.current.loop = newLoopState;
      }
      savePreferences({ loop: newLoopState });
    },
    [savePreferences],
  );

  const getTrackBackgroundUrl = useCallback(
    (track: PlaylistTrack | null | undefined): string | null => {
      if (!track?.fileName) return null;
      const key = normalizeTrackKey(track.fileName, session?.user?.id);
      const entry = trackBackgrounds[key];
      if (!entry?.file) return null;
      return getTrackBackgroundFileUrl(entry.file);
    },
    [trackBackgrounds, session?.user?.id],
  );

  const getTrackBackgroundSource = useCallback(
    (track: PlaylistTrack | null | undefined): string | null => {
      if (!track?.fileName) return null;
      const key = normalizeTrackKey(track.fileName, session?.user?.id);
      return trackBackgrounds[key]?.source ?? null;
    },
    [trackBackgrounds, session?.user?.id],
  );

  const currentBackgroundUrl = useMemo(() => {
    return getTrackBackgroundUrl(currentTrack);
  }, [getTrackBackgroundUrl, currentTrack]);

  const refreshTrackBackgrounds = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data, error } = await fetchTrackBackgrounds();
    if (!error && data?.backgrounds) {
      setTrackBackgroundsState(sanitizeTrackBackgroundMap(data.backgrounds));
    }
  }, [session?.user?.id]);

  const setTrackBackgroundAction = useCallback(
    async (
      track: PlaylistTrack,
      image: Blob,
      sourcePath?: string | null,
    ) => {
      if (!session?.user?.id || !track?.fileName) return;
      const key = normalizeTrackKey(track.fileName, session.user.id);
      const { data, error } = await uploadTrackBackground(key, image, sourcePath);
      if (error) {
        toast.error(error.message || "Failed to set track background");
        throw error;
      }
      if (data?.backgrounds) {
        setTrackBackgroundsState(sanitizeTrackBackgroundMap(data.backgrounds));
      }
    },
    [session?.user?.id],
  );

  const removeTrackBackgroundAction = useCallback(
    async (track: PlaylistTrack) => {
      if (!session?.user?.id || !track?.fileName) return;
      const key = normalizeTrackKey(track.fileName, session.user.id);
      const { data, error } = await deleteTrackBackground(key);
      if (error) {
        toast.error(error.message || "Failed to remove track background");
        throw error;
      }
      if (data?.backgrounds) {
        setTrackBackgroundsState(sanitizeTrackBackgroundMap(data.backgrounds));
      }
    },
    [session?.user?.id],
  );

  const contextValue = useMemo(
    () => ({
      playlist,
      currentTrack,
      currentPosition,
      duration,
      isPlaying,
      shuffle,
      loop,
      volume,
      playlistSessionVolume,
      isMuted,
      isLoading,
      audioRef,
      play,
      pause,
      playTrack,
      playNext,
      playPrev,
      seek,
      setVolume,
      setPlaylistSessionVolume,
      setTrackVolume,
      toggleMute,
      addTrack,
      removeTrack,
      reorderPlaylist,
      moveTrack,
      clearPlaylist,
      toggleShuffle,
      toggleLoop,
      trackBackgrounds,
      currentBackgroundUrl,
      getTrackBackgroundUrl,
      getTrackBackgroundSource,
      setTrackBackground: setTrackBackgroundAction,
      removeTrackBackground: removeTrackBackgroundAction,
      refreshTrackBackgrounds,
    }),
    [
      playlist,
      currentTrack,
      currentPosition,
      duration,
      isPlaying,
      shuffle,
      loop,
      volume,
      playlistSessionVolume,
      isMuted,
      isLoading,
      play,
      pause,
      playTrack,
      playNext,
      playPrev,
      seek,
      setVolume,
      setPlaylistSessionVolume,
      setTrackVolume,
      toggleMute,
      addTrack,
      removeTrack,
      reorderPlaylist,
      moveTrack,
      clearPlaylist,
      toggleShuffle,
      toggleLoop,
      trackBackgrounds,
      currentBackgroundUrl,
      getTrackBackgroundUrl,
      getTrackBackgroundSource,
      setTrackBackgroundAction,
      removeTrackBackgroundAction,
      refreshTrackBackgrounds,
    ],
  );

  return (
    <MusicContext.Provider value={contextValue}>
      <audio ref={audioRef} crossOrigin="anonymous" />
      {children}
    </MusicContext.Provider>
  );
};

const defaultFallbackMusicContext: MusicContextType = {
  playlist: [],
  currentTrack: null,
  currentPosition: 0,
  duration: 0,
  isPlaying: false,
  shuffle: false,
  loop: false,
  volume: 1,
  playlistSessionVolume: 1,
  isMuted: false,
  isLoading: false,
  audioRef: { current: null },
  play: async () => {},
  pause: () => {},
  playTrack: async () => {},
  playNext: async () => {},
  playPrev: async () => {},
  seek: () => {},
  setVolume: () => {},
  setPlaylistSessionVolume: () => {},
  setTrackVolume: () => {},
  toggleMute: () => {},
  addTrack: async () => {},
  removeTrack: async () => {},
  reorderPlaylist: async () => {},
  moveTrack: async () => {},
  clearPlaylist: async () => {},
  toggleShuffle: async () => {},
  toggleLoop: async () => {},
  trackBackgrounds: {},
  currentBackgroundUrl: null,
  getTrackBackgroundUrl: () => null,
  getTrackBackgroundSource: () => null,
  setTrackBackground: async () => {},
  removeTrackBackground: async () => {},
  refreshTrackBackgrounds: async () => {},
};

export const useMusicContext = () => {
  const context = useContext(MusicContext);
  if (context === undefined) {
    return defaultFallbackMusicContext;
  }
  return context;
};
