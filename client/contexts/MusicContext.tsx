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

  const savePlaybackExitState = useCallback(
    (playing: boolean, pos?: number, trackFileName?: string) => {
      try {
        const payload = {
          isPlaying: playing,
          timestamp: Date.now(),
          trackFileName:
            trackFileName ?? currentTrackRef.current?.fileName ?? null,
          position:
            pos !== undefined
              ? Math.floor(pos)
              : Math.floor(currentPositionRef.current),
        };
        localStorage.setItem(
          AUTO_RESUME_STORAGE_KEY,
          JSON.stringify(payload),
        );
      } catch {
        // Ignore localStorage quota / access errors
      }
    },
    [],
  );

  const checkAutoResume = useCallback((): {
    shouldResume: boolean;
    position?: number;
  } => {
    try {
      const raw = localStorage.getItem(AUTO_RESUME_STORAGE_KEY);
      if (!raw) return { shouldResume: false };
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        !parsed.isPlaying ||
        typeof parsed.timestamp !== "number"
      ) {
        return { shouldResume: false };
      }
      const elapsed = Date.now() - parsed.timestamp;
      if (elapsed >= -1000 && elapsed <= AUTO_RESUME_WINDOW_MS) {
        return {
          shouldResume: true,
          position:
            typeof parsed.position === "number" ? parsed.position : undefined,
        };
      }
      return { shouldResume: false };
    } catch {
      return { shouldResume: false };
    }
  }, []);

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
      // If fileName already starts with user id prefix, don't add it again
      let path = fileName.startsWith(session.user.id + "/")
        ? fileName
        : `${session.user.id}/${fileName}`;
      path = path.replace(/\.\.\//g, "");
      const { data } = await supabase.storage
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

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedPlaylist = (data?.music_playlist as PlaylistTrack[]) || [];
        const currentTrackName = data?.current_music_track as string;
        const savedPosition = data?.current_music_position || 0;
        const shuffleEnabled = data?.shuffle_enabled || false;
        const loopEnabled = data?.loop_enabled || false;

        setPlaylistState(loadedPlaylist);
        setShuffleState(shuffleEnabled);
        setLoopState(loopEnabled);
        setCurrentPositionState(savedPosition);
        currentPositionRef.current = savedPosition;

        if (audioRef.current) {
          audioRef.current.loop = loopEnabled;
        }

        if (currentTrackName && loadedPlaylist.length > 0) {
          const track = loadedPlaylist.find(
            (t) => t.fileName === currentTrackName,
          );
          if (track) {
            setCurrentTrackState(track);
            if (audioRef.current) {
              try {
                const url = await resolvePlaybackUrl(track.fileName);
                if (url) {
                  audioRef.current.src = url;

                  const autoResume = checkAutoResume();
                  const initialPosition =
                    autoResume.shouldResume &&
                    autoResume.position !== undefined
                      ? autoResume.position
                      : savedPosition;

                  audioRef.current.currentTime = initialPosition / 1000;
                  setCurrentPositionState(initialPosition);
                  currentPositionRef.current = initialPosition;

                  console.log(
                    `Loaded track ${track.name} with position ${initialPosition}ms (autoResume: ${autoResume.shouldResume})`,
                  );

                  if (autoResume.shouldResume) {
                    try {
                      await audioRef.current.play();
                      setIsPlayingState(true);
                      isPlayingRef.current = true;
                    } catch (playErr) {
                      console.warn(
                        "Auto-resume playback was prevented by browser:",
                        playErr,
                      );
                      const resumeOnInteraction = () => {
                        if (audioRef.current && currentTrackRef.current) {
                          audioRef.current
                            .play()
                            .then(() => {
                              setIsPlayingState(true);
                              isPlayingRef.current = true;
                            })
                            .catch(() => {});
                        }
                      };
                      window.addEventListener("click", resumeOnInteraction, {
                        once: true,
                      });
                      window.addEventListener("keydown", resumeOnInteraction, {
                        once: true,
                      });
                    }
                  }
                } else {
                  console.warn(
                    `Could not resolve URL for saved track: ${track.fileName}`,
                  );
                }
              } catch (error) {
                console.error(`Failed to load saved track:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load music preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMusicPreferences();
  }, [session?.user?.id, resolvePlaybackUrl, checkAutoResume]);

  // Window exit / tab close / visibility change listeners to record state
  useEffect(() => {
    const handleExit = () => {
      const isCurrentlyPlaying = isPlayingRef.current;
      const currentPos = audioRef.current
        ? audioRef.current.currentTime * 1000
        : currentPositionRef.current;
      savePlaybackExitState(
        isCurrentlyPlaying,
        currentPos,
        currentTrackRef.current?.fileName,
      );
    };

    window.addEventListener("beforeunload", handleExit);
    window.addEventListener("pagehide", handleExit);
    document.addEventListener("visibilitychange", handleExit);

    return () => {
      window.removeEventListener("beforeunload", handleExit);
      window.removeEventListener("pagehide", handleExit);
      document.removeEventListener("visibilitychange", handleExit);
    };
  }, [savePlaybackExitState]);

  // Heartbeat to keep exit timestamp fresh while playing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        savePlaybackExitState(
          true,
          audioRef.current
            ? audioRef.current.currentTime * 1000
            : currentPositionRef.current,
          currentTrackRef.current?.fileName,
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, savePlaybackExitState]);

  const playTrack = useCallback(
    async (track: PlaylistTrack, overridePlaylist?: PlaylistTrack[]) => {
      if (!audioRef.current) {
        console.error("Audio ref is not available");
        return;
      }

      const currentToken = ++playTokenRef.current;

      console.log(`Playing track: ${track.name} (${track.fileName})`);
      setCurrentTrackState(track);
      setCurrentPositionState(0);
      currentPositionRef.current = 0;

      // Stop all current audio
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
        savePlaybackExitState(true, 0, track.fileName);
      } catch (error) {
        console.error(`Failed to play track ${track.name}:`, error);
        setIsPlayingState(false);
        isPlayingRef.current = false;
        savePlaybackExitState(false, 0, track.fileName);
      }

      savePreferences({
        currentTrack: track,
        currentPosition: 0,
        playlist: overridePlaylist || playlistRef.current,
      });
    },
    [resolvePlaybackUrl, savePreferences, savePlaybackExitState],
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

  // Sync playNextRef with playNext
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Setup audio element and event listeners
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

  // Auto-save position periodically to Supabase
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
        await audioRef.current.play();
      }
      setIsPlayingState(true);
      isPlayingRef.current = true;
      savePlaybackExitState(
        true,
        currentPositionRef.current,
        currentTrack.fileName,
      );
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack, savePlaybackExitState]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingState(false);
    isPlayingRef.current = false;
    savePlaybackExitState(
      false,
      currentPositionRef.current,
      currentTrack?.fileName,
    );
    savePreferences();
  }, [savePreferences, currentTrack, savePlaybackExitState]);

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
            setCurrentPositionState(0);
            currentPositionRef.current = 0;
            setIsPlayingState(false);
            isPlayingRef.current = false;
            savePlaybackExitState(false, 0, nextTrack.fileName);
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
          setIsPlayingState(false);
          isPlayingRef.current = false;
          savePlaybackExitState(false, 0, undefined);
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
      savePlaybackExitState,
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
