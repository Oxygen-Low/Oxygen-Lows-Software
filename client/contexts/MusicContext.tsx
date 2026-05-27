import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export interface PlaylistTrack {
  id: string;
  fileName: string;
  name: string;
}

interface MusicContextType {
  playlist: PlaylistTrack[];
  currentTrack: PlaylistTrack | null;
  currentPosition: number;
  isPlaying: boolean;
  shuffle: boolean;
  isLoading: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  play: () => Promise<void>;
  pause: () => void;
  playTrack: (track: PlaylistTrack) => Promise<void>;
  playNext: () => Promise<void>;
  playPrev: () => Promise<void>;
  addTrack: (track: PlaylistTrack) => Promise<void>;
  removeTrack: (trackFileName: string) => Promise<void>;
  toggleShuffle: (newShuffleState: boolean) => Promise<void>;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [playlist, setPlaylistState] = useState<PlaylistTrack[]>([]);
  const [currentTrack, setCurrentTrackState] = useState<PlaylistTrack | null>(
    null
  );
  const [currentPosition, setCurrentPositionState] = useState(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const savePreferences = useCallback(async (overrides?: Partial<{
    playlist: PlaylistTrack[],
    currentTrack: PlaylistTrack | null,
    currentPosition: number,
    shuffle: boolean
  }>) => {
    if (!session?.user?.id) return;

    const p_playlist = overrides?.playlist ?? playlist;
    const p_track = overrides?.hasOwnProperty('currentTrack') ? overrides.currentTrack : currentTrack;
    const p_pos = overrides?.currentPosition ?? currentPosition;
    const p_shuffle = overrides?.shuffle ?? shuffle;

    try {
      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session.user.id,
        p_music_playlist: p_playlist,
        p_current_music_track: p_track?.fileName || null,
        p_current_music_position: Math.floor(p_pos),
        p_shuffle_enabled: p_shuffle,
      });
    } catch (error) {
      console.error("Failed to save music preferences:", error);
    }
  }, [session?.user?.id, playlist, currentTrack, currentPosition, shuffle]);

  // Load music preferences from Supabase
  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const loadMusicPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select(
            "music_playlist, current_music_track, current_music_position, shuffle_enabled"
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

        if (currentTrackName && loadedPlaylist.length > 0) {
          const track = loadedPlaylist.find(
            (t) => t.fileName === currentTrackName
          );
          if (track) {
            setCurrentTrackState(track);
            // Don't auto-play on load, just set the source
            if (audioRef.current) {
               const url = supabase.storage
                .from("Storage")
                .getPublicUrl(track.fileName).data.publicUrl;
               audioRef.current.src = url;
               audioRef.current.currentTime = savedPosition / 1000;
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
  }, [session?.user?.id]);

  // Setup audio element and event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentPositionState(audio.currentTime * 1000);
    };

    const handleEnded = () => {
      playNext();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [playlist, currentTrack, shuffle]); // Re-bind if these change so playNext has fresh refs if needed, although useCallback handles it

  // Auto-save position periodically
  useEffect(() => {
    if (!isPlaying || !session?.user?.id) return;

    const interval = setInterval(() => {
      savePreferences();
    }, 10000);

    return () => clearInterval(interval);
  }, [isPlaying, session?.user?.id, savePreferences]);

  const play = useCallback(async () => {
    if (!audioRef.current || !currentTrack) return;
    try {
      await audioRef.current.play();
      setIsPlayingState(true);
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [currentTrack]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlayingState(false);
    savePreferences();
  }, [savePreferences]);

  const playTrack = useCallback(
    async (track: PlaylistTrack) => {
      if (!audioRef.current) return;

      setCurrentTrackState(track);
      setCurrentPositionState(0);

      const url = supabase.storage
        .from("Storage")
        .getPublicUrl(track.fileName).data.publicUrl;

      audioRef.current.src = url;
      audioRef.current.currentTime = 0;

      try {
        await audioRef.current.play();
        setIsPlayingState(true);
        savePreferences({ currentTrack: track, currentPosition: 0 });
      } catch (error) {
        console.error("Failed to play track:", error);
      }
    },
    [savePreferences]
  );

  const playNext = useCallback(async () => {
    if (!currentTrack || playlist.length === 0) return;

    let nextTrack: PlaylistTrack;

    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * playlist.length);
      nextTrack = playlist[randomIndex];
    } else {
      const currentIndex = playlist.findIndex(
        (t) => t.fileName === currentTrack.fileName
      );
      const nextIndex = (currentIndex + 1) % playlist.length;
      nextTrack = playlist[nextIndex];
    }

    await playTrack(nextTrack);
  }, [currentTrack, playlist, shuffle, playTrack]);

  const playPrev = useCallback(async () => {
    if (!currentTrack || playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (t) => t.fileName === currentTrack.fileName
    );
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    const prevTrack = playlist[prevIndex];

    await playTrack(prevTrack);
  }, [currentTrack, playlist, playTrack]);

  const addTrack = useCallback(
    async (track: PlaylistTrack) => {
      if (!session?.user?.id) return;

      const updatedPlaylist = [...playlist, track];
      setPlaylistState(updatedPlaylist);
      savePreferences({ playlist: updatedPlaylist });
    },
    [session?.user?.id, playlist, savePreferences]
  );

  const removeTrack = useCallback(
    async (trackFileName: string) => {
      if (!session?.user?.id) return;

      const updatedPlaylist = playlist.filter(
        (t) => t.fileName !== trackFileName
      );
      setPlaylistState(updatedPlaylist);

      let nextTrack = currentTrack;
      let nextIsPlaying = isPlaying;

      // If removed track is currently playing, play next
      if (currentTrack?.fileName === trackFileName) {
        if (updatedPlaylist.length > 0) {
          nextTrack = updatedPlaylist[0];
          await playTrack(nextTrack);
        } else {
          nextTrack = null;
          setCurrentTrackState(null);
          setIsPlayingState(false);
          nextIsPlaying = false;
          if (audioRef.current) audioRef.current.src = "";
        }
      }

      savePreferences({ playlist: updatedPlaylist, currentTrack: nextTrack });
    },
    [session?.user?.id, playlist, currentTrack, isPlaying, playTrack, savePreferences]
  );

  const toggleShuffle = useCallback(
    async (newShuffleState: boolean) => {
      setShuffleState(newShuffleState);
      savePreferences({ shuffle: newShuffleState });
    },
    [savePreferences]
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
