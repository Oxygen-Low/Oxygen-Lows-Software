import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface PlaylistTrack {
  name: string;
  artist?: string;
  fileName: string;
  isReactive?: boolean;
  layers?: Array<{ fileName: string; levels: number[] }>;
}

interface MusicContextType {
  playlist: PlaylistTrack[];
  currentTrack: PlaylistTrack | null;
  currentPosition: number;
  isPlaying: boolean;
  shuffle: boolean;
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
  threatLevel: number;
  setThreatLevel: (level: number) => void;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [threatLevel, setThreatLevel] = useState(1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const reactiveAudiosRef = useRef<HTMLAudioElement[]>([]);
  const playlistRef = useRef<PlaylistTrack[]>([]);
  const currentTrackRef = useRef<PlaylistTrack | null>(null);
  const isPlayingRef = useRef(false);
  const shuffleRef = useRef(false);
  const currentPositionRef = useRef(0);
  const playNextRef = useRef<() => void>();
  const playTokenRef = useRef(0);

  useEffect(() => {
    playlistRef.current = playlist;
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    shuffleRef.current = shuffle;
  }, [playlist, currentTrack, isPlaying, shuffle]);

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

      await supabase.from("user_preferences").upsert(
        {
          user_id: session.user.id,
          music_playlist,
          current_music_track,
          current_music_position,
          shuffle_enabled,
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
            "music_playlist, current_music_track, current_music_position, shuffle_enabled",
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

        setPlaylistState(loadedPlaylist);
        setShuffleState(shuffleEnabled);
        setCurrentPositionState(savedPosition);
        currentPositionRef.current = savedPosition;

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
                  audioRef.current.currentTime = savedPosition / 1000;
                  console.log(
                    `Loaded track ${track.name} with saved position ${savedPosition}ms`,
                  );
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
  }, [session?.user?.id, resolvePlaybackUrl]);

  const handleReactiveTimeUpdate = useCallback(() => {
    if (reactiveAudiosRef.current.length > 0) {
      const pos = reactiveAudiosRef.current[0].currentTime * 1000;
      setCurrentPositionState(pos);
      currentPositionRef.current = pos;
    }
  }, []);

  const applyThreatMuting = useCallback(
    (track: PlaylistTrack, audios: HTMLAudioElement[], level: number) => {
      if (!track.isReactive || !track.layers) return;
      track.layers.forEach((layer, index) => {
        const audio = audios[index];
        if (audio) {
          audio.muted = !layer.levels.includes(level);
        }
      });
    },
    [],
  );

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
      reactiveAudiosRef.current.forEach((a) => {
        a.pause();
        a.src = "";
      });
      reactiveAudiosRef.current = [];

      if (track.isReactive && track.layers) {
        // Resolve all URLs in parallel
        const urls = await Promise.all(
          track.layers.map((l) => resolvePlaybackUrl(l.fileName)),
        );

        if (currentToken !== playTokenRef.current) {
          return;
        }

        const audios: HTMLAudioElement[] = [];
        urls.forEach((url, index) => {
          if (url) {
            const audio = new Audio(url);
            audio.crossOrigin = "anonymous";
            audio.loop = false;
            audios.push(audio);
          } else {
            console.error(
              `Failed to resolve layer ${index} for reactive track`,
            );
            // Add a placeholder audio to maintain index alignment
            const placeholder = new Audio();
            audios.push(placeholder);
          }
        });

        if (audios.every((a) => !a.src)) {
          console.error("All layers failed to resolve.");
          toast.error("Failed to load reactive track layers.");
          return;
        }

        reactiveAudiosRef.current = audios;
        applyThreatMuting(track, audios, threatLevel);

        if (audios.length > 0) {
          const firstValid = audios.find((a) => a.src);
          if (firstValid) {
            firstValid.addEventListener("ended", () => playNextRef.current?.());
            firstValid.addEventListener("timeupdate", handleReactiveTimeUpdate);
          }

          try {
            await Promise.all(
              audios.map((a) => (a.src ? a.play() : Promise.resolve())),
            );
            setIsPlayingState(true);
          } catch (e) {
            console.error("Failed to play reactive layers:", e);
          }
        }
      } else {
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
        } catch (error) {
          console.error(`Failed to play track ${track.name}:`, error);
          setIsPlayingState(false);
        }
      }

      savePreferences({
        currentTrack: track,
        currentPosition: 0,
        playlist: overridePlaylist || playlistRef.current,
      });
    },
    [
      resolvePlaybackUrl,
      savePreferences,
      handleReactiveTimeUpdate,
      applyThreatMuting,
      threatLevel,
    ],
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
      playNextRef.current?.();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Auto-save position periodically
  useEffect(() => {
    if (!isPlaying || !session?.user?.id) return;

    const interval = setInterval(() => {
      savePreferences();
    }, 10000);

    return () => clearInterval(interval);
  }, [isPlaying, session?.user?.id, savePreferences]);

  useEffect(() => {
    if (currentTrack?.isReactive && reactiveAudiosRef.current.length) {
      applyThreatMuting(currentTrack, reactiveAudiosRef.current, threatLevel);
    }
  }, [threatLevel, currentTrack, applyThreatMuting]);

  const play = useCallback(async () => {
    if (!currentTrack) return;
    try {
      if (currentTrack.isReactive) {
        await Promise.all(
          reactiveAudiosRef.current.map((a) =>
            a.src ? a.play() : Promise.resolve(),
          ),
        );
      } else if (audioRef.current) {
        await audioRef.current.play();
      }
      setIsPlayingState(true);
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack]);

  const pause = useCallback(() => {
    if (currentTrack?.isReactive) {
      reactiveAudiosRef.current.forEach((a) => a.pause());
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingState(false);
    savePreferences();
  }, [savePreferences, currentTrack]);

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
    ],
  );

  const toggleShuffle = useCallback(
    async (newShuffleState: boolean) => {
      setShuffleState(newShuffleState);
      savePreferences({ shuffle: newShuffleState });
    },
    [savePreferences],
  );

  return (
    <MusicContext.Provider
      value={{
        playlist,
        currentTrack,
        currentPosition,
        isPlaying,
        shuffle,
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
        threatLevel,
        setThreatLevel,
      }}
    >
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
