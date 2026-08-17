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

interface StoredPlaybackState {
  isPlaying: boolean;
  timestamp: number;
  track: PlaylistTrack | null;
  trackFileName?: string | null;
  position: number;
  signedUrl?: string | null;
  urlExpiry?: number | null;
  playlist?: PlaylistTrack[];
  loop?: boolean;
  shuffle?: boolean;
  shouldResume?: boolean;
}

const getInitialPlaybackState = (): StoredPlaybackState | null => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(AUTO_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredPlaybackState = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    const elapsed = Date.now() - parsed.timestamp;
    const shouldResume =
      Boolean(parsed.isPlaying) &&
      elapsed >= -1000 &&
      elapsed <= AUTO_RESUME_WINDOW_MS;
    return {
      ...parsed,
      shouldResume,
    };
  } catch {
    return null;
  }
};

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { session } = useAuth();

  const initialPlaybackState = useMemo(() => getInitialPlaybackState(), []);

  const [playlist, setPlaylistState] = useState<PlaylistTrack[]>(
    () => initialPlaybackState?.playlist || [],
  );
  const [currentTrack, setCurrentTrackState] = useState<PlaylistTrack | null>(
    () =>
      initialPlaybackState?.track ||
      (initialPlaybackState?.trackFileName
        ? {
            name: initialPlaybackState.trackFileName,
            fileName: initialPlaybackState.trackFileName,
          }
        : null),
  );
  const [currentPosition, setCurrentPositionState] = useState<number>(
    () => initialPlaybackState?.position || 0,
  );
  const [isPlaying, setIsPlayingState] = useState<boolean>(false);
  const [shuffle, setShuffleState] = useState<boolean>(
    () => initialPlaybackState?.shuffle || false,
  );
  const [loop, setLoopState] = useState<boolean>(
    () => initialPlaybackState?.loop || false,
  );
  const [isLoading, setIsLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playlistRef = useRef<PlaylistTrack[]>(playlist);
  const currentTrackRef = useRef<PlaylistTrack | null>(currentTrack);
  const isPlayingRef = useRef(false);
  const shuffleRef = useRef(shuffle);
  const loopRef = useRef(loop);
  const currentPositionRef = useRef(currentPosition);
  const playNextRef = useRef<(() => void) | undefined>(undefined);
  const playTokenRef = useRef(0);
  const currentSignedUrlRef = useRef<string | null>(
    initialPlaybackState?.signedUrl || null,
  );
  const urlExpiryRef = useRef<number | null>(
    initialPlaybackState?.urlExpiry || null,
  );
  const autoResumeAttemptedRef = useRef(false);

  const savePlaybackExitState = useCallback(
    (
      playing: boolean,
      pos?: number,
      track?: PlaylistTrack | null,
      signedUrl?: string | null,
      urlExpiry?: number | null,
      pl?: PlaylistTrack[],
      lp?: boolean,
      shuf?: boolean,
    ) => {
      try {
        const payload: StoredPlaybackState = {
          isPlaying: playing,
          timestamp: Date.now(),
          track: track ?? currentTrackRef.current ?? null,
          trackFileName:
            track?.fileName ?? currentTrackRef.current?.fileName ?? null,
          position:
            pos !== undefined
              ? Math.floor(pos)
              : Math.floor(currentPositionRef.current),
          signedUrl: signedUrl ?? currentSignedUrlRef.current ?? null,
          urlExpiry: urlExpiry ?? urlExpiryRef.current ?? null,
          playlist: pl ?? playlistRef.current,
          loop: lp ?? loopRef.current,
          shuffle: shuf ?? shuffleRef.current,
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

  const triggerAutoResumePlayback = useCallback(
    (audio: HTMLAudioElement, targetPositionMs: number) => {
      const targetPosSec = targetPositionMs / 1000;

      const attemptPlay = async () => {
        try {
          if (targetPosSec > 0) {
            try {
              audio.currentTime = targetPosSec;
            } catch {}
          }
          audio.muted = false;
          await audio.play();
          setIsPlayingState(true);
          isPlayingRef.current = true;
        } catch (err) {
          console.warn("Autoplay unmuted blocked by browser:", err);

          // Start audio playing muted so audio context is active
          try {
            audio.muted = true;
            await audio.play();
            setIsPlayingState(true);
            isPlayingRef.current = true;
          } catch {}

          const gestureEvents = [
            "click",
            "pointerdown",
            "mousedown",
            "keydown",
            "touchstart",
            "wheel",
          ];

          const resumeOnGesture = () => {
            if (audioRef.current) {
              audioRef.current.muted = false;
              audioRef.current
                .play()
                .then(() => {
                  setIsPlayingState(true);
                  isPlayingRef.current = true;
                })
                .catch(() => {});
            }
            gestureEvents.forEach((evt) => {
              window.removeEventListener(evt, resumeOnGesture, true);
              document.removeEventListener(evt, resumeOnGesture, true);
            });
          };

          gestureEvents.forEach((evt) => {
            window.addEventListener(evt, resumeOnGesture, {
              once: true,
              capture: true,
            });
            document.addEventListener(evt, resumeOnGesture, {
              once: true,
              capture: true,
            });
          });
        }
      };

      if (audio.readyState >= 1) {
        attemptPlay();
      } else {
        audio.addEventListener("loadedmetadata", attemptPlay, { once: true });
        setTimeout(attemptPlay, 300);
      }
    },
    [],
  );

  // Initial immediate auto-resume from cached signed URL if available and fresh (<10s since exit)
  useEffect(() => {
    if (autoResumeAttemptedRef.current) return;
    autoResumeAttemptedRef.current = true;

    if (
      initialPlaybackState?.shouldResume &&
      initialPlaybackState?.track &&
      initialPlaybackState?.signedUrl &&
      initialPlaybackState?.urlExpiry &&
      initialPlaybackState.urlExpiry > Date.now()
    ) {
      const audio = audioRef.current;
      if (!audio) return;

      currentSignedUrlRef.current = initialPlaybackState.signedUrl;
      urlExpiryRef.current = initialPlaybackState.urlExpiry;
      audio.src = initialPlaybackState.signedUrl;
      audio.loop = initialPlaybackState.loop || false;

      triggerAutoResumePlayback(audio, initialPlaybackState.position || 0);
    }
  }, [initialPlaybackState, triggerAutoResumePlayback]);

  // Load preferences from database
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

            // If track is already playing from the fast-resume cache, do not restart
            if (
              audioRef.current &&
              audioRef.current.src &&
              isPlayingRef.current &&
              currentTrackRef.current?.fileName === track.fileName
            ) {
              console.log(
                `Track ${track.name} is already playing from initial auto-resume`,
              );
              setIsLoading(false);
              return;
            }

            if (audioRef.current) {
              try {
                const url = await resolvePlaybackUrl(track.fileName);
                if (url) {
                  audioRef.current.src = url;
                  currentSignedUrlRef.current = url;
                  urlExpiryRef.current = Date.now() + 3500 * 1000;

                  const autoResume = checkAutoResume();
                  const initialPosition =
                    autoResume.shouldResume &&
                    autoResume.position !== undefined
                      ? autoResume.position
                      : savedPosition;

                  setCurrentPositionState(initialPosition);
                  currentPositionRef.current = initialPosition;

                  if (autoResume.shouldResume) {
                    triggerAutoResumePlayback(audioRef.current, initialPosition);
                  } else {
                    const targetPos = initialPosition / 1000;
                    if (targetPos > 0) {
                      const setPos = () => {
                        if (audioRef.current) {
                          try {
                            audioRef.current.currentTime = targetPos;
                          } catch {}
                        }
                      };
                      if (audioRef.current.readyState >= 1) {
                        setPos();
                      } else {
                        audioRef.current.addEventListener("loadedmetadata", setPos, {
                          once: true,
                        });
                        setTimeout(setPos, 300);
                      }
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
  }, [session?.user?.id, resolvePlaybackUrl, checkAutoResume, triggerAutoResumePlayback]);

  // Window exit / tab close / visibility change listeners to record state
  useEffect(() => {
    const handleExit = (event?: Event) => {
      // If visibilitychange fired and document is NOT hidden (i.e. became visible), do not overwrite state
      if (
        event?.type === "visibilitychange" &&
        document.visibilityState !== "hidden"
      ) {
        return;
      }
      const isCurrentlyPlaying = isPlayingRef.current;
      const currentPos = audioRef.current
        ? audioRef.current.currentTime * 1000
        : currentPositionRef.current;
      savePlaybackExitState(
        isCurrentlyPlaying,
        currentPos,
        currentTrackRef.current,
        currentSignedUrlRef.current,
        urlExpiryRef.current,
        playlistRef.current,
        loopRef.current,
        shuffleRef.current,
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
          currentTrackRef.current,
          currentSignedUrlRef.current,
          urlExpiryRef.current,
          playlistRef.current,
          loopRef.current,
          shuffleRef.current,
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
      currentTrackRef.current = track;
      setCurrentPositionState(0);
      currentPositionRef.current = 0;

      // Stop all current audio
      audioRef.current.pause();
      audioRef.current.src = "";
      currentSignedUrlRef.current = null;
      urlExpiryRef.current = null;

      const url = await resolvePlaybackUrl(track.fileName);
      if (currentToken !== playTokenRef.current) return;

      if (!url) {
        console.error(`Failed to resolve URL for track: ${track.fileName}`);
        return;
      }
      audioRef.current.src = url;
      currentSignedUrlRef.current = url;
      urlExpiryRef.current = Date.now() + 3500 * 1000;
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      try {
        await audioRef.current.play();
        setIsPlayingState(true);
        isPlayingRef.current = true;
        savePlaybackExitState(
          true,
          0,
          track,
          url,
          Date.now() + 3500 * 1000,
          overridePlaylist || playlistRef.current,
          loopRef.current,
          shuffleRef.current,
        );
      } catch (error) {
        console.error(`Failed to play track ${track.name}:`, error);
        setIsPlayingState(false);
        isPlayingRef.current = false;
        savePlaybackExitState(
          false,
          0,
          track,
          url,
          Date.now() + 3500 * 1000,
          overridePlaylist || playlistRef.current,
          loopRef.current,
          shuffleRef.current,
        );
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
        if (!audioRef.current.src && currentTrack.fileName) {
          const url = await resolvePlaybackUrl(currentTrack.fileName);
          if (url) {
            audioRef.current.src = url;
            currentSignedUrlRef.current = url;
            urlExpiryRef.current = Date.now() + 3500 * 1000;
            audioRef.current.currentTime = currentPositionRef.current / 1000;
          }
        }
        audioRef.current.muted = false;
        await audioRef.current.play();
      }
      setIsPlayingState(true);
      isPlayingRef.current = true;
      savePlaybackExitState(
        true,
        currentPositionRef.current,
        currentTrack,
        currentSignedUrlRef.current,
        urlExpiryRef.current,
        playlistRef.current,
        loopRef.current,
        shuffleRef.current,
      );
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack, resolvePlaybackUrl, savePlaybackExitState]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingState(false);
    isPlayingRef.current = false;
    savePlaybackExitState(
      false,
      currentPositionRef.current,
      currentTrackRef.current,
      currentSignedUrlRef.current,
      urlExpiryRef.current,
      playlistRef.current,
      loopRef.current,
      shuffleRef.current,
    );
    savePreferences();
  }, [savePreferences, savePlaybackExitState]);

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
            savePlaybackExitState(false, 0, nextTrack);
            const url = await resolvePlaybackUrl(nextTrack.fileName);
            if (url && audioRef.current) {
              audioRef.current.src = url;
              currentSignedUrlRef.current = url;
              urlExpiryRef.current = Date.now() + 3500 * 1000;
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
          savePlaybackExitState(false, 0, null);
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
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        crossOrigin="anonymous"
      />
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
