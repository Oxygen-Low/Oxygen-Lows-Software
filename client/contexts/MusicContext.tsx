import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface PlaylistTrack {
  name: string;
  artist?: string;
  fileName: string;
}

interface MusicContextType {
  playlist: PlaylistTrack[];
  currentTrack: PlaylistTrack | null;
  currentPosition: number;
  isPlaying: boolean;
  shuffle: boolean;
  loop: boolean;
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
  addTrack: (track: PlaylistTrack) => Promise<void>;
  removeTrack: (trackFileName: string) => Promise<void>;
  toggleShuffle: (shuffle: boolean) => Promise<void>;
  toggleLoop: (loop: boolean) => Promise<void>;
}

const AUTO_RESUME_STORAGE_KEY = "oxygen_music_exit_state";
const AUTO_RESUME_WINDOW_MS = 10000; // 10 seconds

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { session } = useAuth();
  const [playlist, setPlaylistState] = useState<PlaylistTrack[]>([]);
  const [currentTrack, setCurrentTrackState] = useState<PlaylistTrack | null>(
    null,
  );
  const [currentPosition, setCurrentPositionState] = useState(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [loop, setLoopState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playlistRef = useRef<PlaylistTrack[]>([]);
  const currentTrackRef = useRef<PlaylistTrack | null>(null);
  const isPlayingRef = useRef(false);
  const shuffleRef = useRef(false);
  const loopRef = useRef(false);
  const currentPositionRef = useRef(0);
  const playNextRef = useRef<(() => void) | undefined>(undefined);
  const playTokenRef = useRef(0);

  useEffect(() => {
    playlistRef.current = playlist;
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    shuffleRef.current = shuffle;
    loopRef.current = loop;
    if (audioRef.current) {
      audioRef.current.loop = loop;
    }
  }, [playlist, currentTrack, isPlaying, shuffle, loop]);

  const resolvePlaybackUrl = useCallback(
    async (fileName: string) => {
      if (!session?.user?.id) return null;
      let path = fileName.startsWith(session.user.id + "/")
        ? fileName
        : `${session.user.id}/${fileName}`;
      let previous: string;
      do {
        previous = path;
        path = path.replace(/\.\.\//g, "");
      } while (path !== previous);
      const { data } = await storage
        .from("Storage")
        .createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    },
    [session?.user?.id],
  );

  const savePreferences = useCallback(
    async (overrides: any = {}) => {
      if (!session?.user?.id) return;

      const music_playlist =
        overrides.playlist !== undefined
          ? overrides.playlist
          : playlistRef.current;
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

      await supabase.from("user_preferences").upsert(
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
    },
    [session?.user?.id],
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

  // Heartbeat: update the stored timestamp every second so it stays fresh
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (isPlayingRef.current) saveExitState(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, saveExitState]);

  // Save on unload/hide
  useEffect(() => {
    const onExit = (e?: Event) => {
      if (e?.type === "visibilitychange" && document.visibilityState !== "hidden") return;
      saveExitState(isPlayingRef.current);
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
    const loadMusicPreferences = async () => {
      if (!session?.user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select(
            "music_playlist, current_music_track, current_music_position, shuffle_enabled, loop_enabled",
          )
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") throw error;

        const loadedPlaylist = (data?.music_playlist as PlaylistTrack[]) || [];
        const currentTrackName = data?.current_music_track as string;
        const savedPosition = data?.current_music_position || 0;
        const shuffleEnabled = data?.shuffle_enabled || false;
        const loopEnabled = data?.loop_enabled || false;

        setPlaylistState(loadedPlaylist);
        setShuffleState(shuffleEnabled);
        setLoopState(loopEnabled);

        if (audioRef.current) {
          audioRef.current.loop = loopEnabled;
        }

        if (currentTrackName && loadedPlaylist.length > 0) {
          const track = loadedPlaylist.find(
            (t) => t.fileName === currentTrackName,
          );
          if (track) {
            setCurrentTrackState(track);
            currentTrackRef.current = track;

            const url = await resolvePlaybackUrl(track.fileName);
            if (url && audioRef.current) {
              const { shouldResume, position } = getAutoResumeState();
              const seekTo = shouldResume ? position : savedPosition;

              audioRef.current.src = url;

              // Wait for the audio to be ready before seeking
              const doSeekAndPlay = async () => {
                if (!audioRef.current) return;
                try {
                  audioRef.current.currentTime = seekTo / 1000;
                } catch {}

                setCurrentPositionState(seekTo);
                currentPositionRef.current = seekTo;

                if (shouldResume) {
                  try {
                    await audioRef.current.play();
                    setIsPlayingState(true);
                    isPlayingRef.current = true;
                  } catch {
                    // Browser blocked autoplay — show a one-click resume toast
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

              // Attempt immediately — if seek fails before metadata it's fine,
              // play() will still work and the browser will seek as it loads.
              doSeekAndPlay();
              // Also register loadedmetadata in case the above is called before
              // the audio element has duration info yet (sets currentTime again).
              audioRef.current.addEventListener(
                "loadedmetadata",
                () => {
                  if (!audioRef.current) return;
                  try {
                    audioRef.current.currentTime = seekTo / 1000;
                  } catch {}
                },
                { once: true },
              );

              console.log(
                `Loaded track "${track.name}" at ${seekTo}ms (autoResume: ${shouldResume})`,
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
        setIsLoading(false);
      }
    };

    loadMusicPreferences();
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

      audioRef.current.pause();
      audioRef.current.src = "";

      const url = await resolvePlaybackUrl(track.fileName);
      if (currentToken !== playTokenRef.current) return;

      if (!url) {
        console.error(`Failed to resolve URL for track: ${track.fileName}`);
        return;
      }

      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      try {
        await audioRef.current.play();
        setIsPlayingState(true);
        isPlayingRef.current = true;
        saveExitState(true);
      } catch (error) {
        console.error(`Failed to play track ${track.name}:`, error);
        setIsPlayingState(false);
        isPlayingRef.current = false;
        saveExitState(false);
      }

      savePreferences({
        currentTrack: track,
        currentPosition: 0,
        playlist: overridePlaylist || playlistRef.current,
      });
    },
    [resolvePlaybackUrl, savePreferences, saveExitState],
  );

  const playNext = useCallback(async () => {
    const currentT = currentTrackRef.current;
    const playlistArr = playlistRef.current;
    const isShuffle = shuffleRef.current;

    if (!currentT || playlistArr.length === 0) return;

    let nextTrack: PlaylistTrack;

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * playlistArr.length);
      nextTrack = playlistArr[randomIndex];
    } else {
      const currentIndex = playlistArr.findIndex(
        (t) => t.fileName === currentT.fileName,
      );
      const nextIndex = (currentIndex + 1) % playlistArr.length;
      nextTrack = playlistArr[nextIndex];
    }

    await playTrack(nextTrack);
  }, [playTrack]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Setup audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const pos = audio.currentTime * 1000;
      setCurrentPositionState(pos);
      currentPositionRef.current = pos;
    };

    const handleEnded = () => {
      if (!loopRef.current) {
        playNextRef.current?.();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
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
    if (!currentTrack) return;
    try {
      if (audioRef.current) {
        if (!audioRef.current.src && currentTrack.fileName) {
          const url = await resolvePlaybackUrl(currentTrack.fileName);
          if (url) {
            audioRef.current.src = url;
            audioRef.current.currentTime = currentPositionRef.current / 1000;
          }
        }
        await audioRef.current.play();
      }
      setIsPlayingState(true);
      isPlayingRef.current = true;
      saveExitState(true);
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack, resolvePlaybackUrl, saveExitState]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingState(false);
    isPlayingRef.current = false;
    saveExitState(false);
    savePreferences();
  }, [savePreferences, saveExitState]);

  const playPrev = useCallback(async () => {
    const currentT = currentTrackRef.current;
    const playlistArr = playlistRef.current;

    if (!currentT || playlistArr.length === 0) return;

    const currentIndex = playlistArr.findIndex(
      (t) => t.fileName === currentT.fileName,
    );
    const prevIndex =
      (currentIndex - 1 + playlistArr.length) % playlistArr.length;
    const prevTrack = playlistArr[prevIndex];

    await playTrack(prevTrack);
  }, [playTrack]);

  const addTrack = useCallback(
    async (track: PlaylistTrack) => {
      if (!session?.user?.id) return;
      const updatedPlaylist = [...playlist, track];
      setPlaylistState(updatedPlaylist);
      savePreferences({ playlist: updatedPlaylist });
    },
    [session?.user?.id, playlist, savePreferences],
  );

  const removeTrack = useCallback(
    async (trackFileName: string) => {
      if (!session?.user?.id) return;

      const updatedPlaylist = playlist.filter(
        (t) => t.fileName !== trackFileName,
      );
      setPlaylistState(updatedPlaylist);

      let nextTrack = currentTrack;
      const wasPlaying = isPlaying;

      if (currentTrack?.fileName === trackFileName) {
        if (updatedPlaylist.length > 0) {
          nextTrack = updatedPlaylist[0];
          if (wasPlaying) {
            await playTrack(nextTrack, updatedPlaylist);
          } else {
            setCurrentTrackState(nextTrack);
            currentTrackRef.current = nextTrack;
            setCurrentPositionState(0);
            currentPositionRef.current = 0;
            setIsPlayingState(false);
            isPlayingRef.current = false;
            saveExitState(false);
            const url = await resolvePlaybackUrl(nextTrack.fileName);
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
          nextTrack = null;
          setCurrentTrackState(null);
          currentTrackRef.current = null;
          setIsPlayingState(false);
          isPlayingRef.current = false;
          saveExitState(false);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }
          savePreferences({
            playlist: updatedPlaylist,
            currentTrack: nextTrack,
          });
        }
      } else {
        savePreferences({ playlist: updatedPlaylist });
      }
    },
    [
      session?.user?.id,
      playlist,
      currentTrack,
      isPlaying,
      playTrack,
      resolvePlaybackUrl,
      savePreferences,
      saveExitState,
    ],
  );

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

  const contextValue = useMemo(
    () => ({
      playlist,
      currentTrack,
      currentPosition,
      isPlaying,
      shuffle,
      loop,
      isLoading,
      audioRef,
      play,
      pause,
      playTrack,
      playNext,
      playPrev,
      addTrack,
      removeTrack,
      toggleShuffle,
      toggleLoop,
    }),
    [
      playlist,
      currentTrack,
      currentPosition,
      isPlaying,
      shuffle,
      loop,
      isLoading,
      play,
      pause,
      playTrack,
      playNext,
      playPrev,
      addTrack,
      removeTrack,
      toggleShuffle,
      toggleLoop,
    ],
  );

  return (
    <MusicContext.Provider value={contextValue}>
      <audio ref={audioRef} crossOrigin="anonymous" />
      {children}
    </MusicContext.Provider>
  );
};

export const useMusicContext = () => {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error("useMusicContext must be used within a MusicProvider");
  }
  return context;
};
