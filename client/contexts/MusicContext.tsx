import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export interface PlaylistTrack {
  id: string;
  fileName: string;
  name: string;
  playbackUrl?: string;
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
  playTrack: (track: PlaylistTrack, overridePlaylist?: PlaylistTrack[]) => Promise<void>;
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
  const currentPositionRef = useRef<number>(0);
  const playlistRef = useRef<PlaylistTrack[]>([]);
  const currentTrackRef = useRef<PlaylistTrack | null>(null);
  const shuffleRef = useRef<boolean>(false);

  // Sync refs with state to keep callbacks stable
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  const resolvePlaybackUrl = useCallback(async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .createSignedUrl(fileName, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.warn("Failed to create signed URL, falling back to blob:", error);
      try {
        const { data: blob, error: downloadError } = await supabase.storage
          .from("Storage")
          .download(fileName);

        if (downloadError) throw downloadError;
        if (blob) return URL.createObjectURL(blob);
      } catch (blobError) {
        console.error("Failed to resolve playback URL:", blobError);
      }
    }
    return null;
  }, []);

  const savePreferences = useCallback(async (overrides?: Partial<{
    playlist: PlaylistTrack[],
    currentTrack: PlaylistTrack | null,
    currentPosition: number,
    shuffle: boolean
  }>) => {
    if (!session?.user?.id) return;

    const p_playlist = overrides?.playlist ?? playlistRef.current;
    const p_track = overrides?.hasOwnProperty('currentTrack') ? overrides.currentTrack : currentTrackRef.current;
    const p_pos = overrides?.currentPosition ?? currentPositionRef.current;
    const p_shuffle = overrides?.shuffle ?? shuffleRef.current;

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
  }, [session?.user?.id]); // Stable: only depends on session.user.id

  // Load music preferences from Supabase and handle cleanup on sign-out
  useEffect(() => {
    if (!session?.user?.id) {
      // Cleanup on sign-out as requested in feedback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      setPlaylistState([]);
      setCurrentTrackState(null);
      setCurrentPositionState(0);
      currentPositionRef.current = 0;
      setIsPlayingState(false);
      setIsLoading(false);
      return;
    }

    const loadMusicPreferences = async () => {
      setIsLoading(true);
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
        currentPositionRef.current = savedPosition;

        if (currentTrackName && loadedPlaylist.length > 0) {
          const track = loadedPlaylist.find(
            (t) => t.fileName === currentTrackName
          );
          if (track) {
            setCurrentTrackState(track);
            if (audioRef.current) {
              const url = await resolvePlaybackUrl(track.fileName);
              if (url) {
                audioRef.current.src = url;
                audioRef.current.currentTime = savedPosition / 1000;
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
      playNext();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []); // Re-bind not needed as refs are used for playNext

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
    async (track: PlaylistTrack, overridePlaylist?: PlaylistTrack[]) => {
      if (!audioRef.current) return;

      setCurrentTrackState(track);
      setCurrentPositionState(0);
      currentPositionRef.current = 0;

      const url = await resolvePlaybackUrl(track.fileName);
      if (!url) return;

      audioRef.current.src = url;
      audioRef.current.currentTime = 0;

      try {
        await audioRef.current.play();
        setIsPlayingState(true);
        // Using overridePlaylist to avoid race condition with state updates
        savePreferences({
          currentTrack: track,
          currentPosition: 0,
          playlist: overridePlaylist || playlistRef.current
        });
      } catch (error) {
        console.error("Failed to play track:", error);
      }
    },
    [resolvePlaybackUrl, savePreferences]
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
        (t) => t.fileName === currentT.fileName
      );
      const nextIndex = (currentIndex + 1) % playlistArr.length;
      nextTrack = playlistArr[nextIndex];
    }

    await playTrack(nextTrack);
  }, [playTrack]);

  const playPrev = useCallback(async () => {
    const currentT = currentTrackRef.current;
    const playlistArr = playlistRef.current;

    if (!currentT || playlistArr.length === 0) return;

    const currentIndex = playlistArr.findIndex(
      (t) => t.fileName === currentT.fileName
    );
    const prevIndex = (currentIndex - 1 + playlistArr.length) % playlistArr.length;
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
      const wasPlaying = isPlaying;

      // Logic updated to prevent race conditions and ensure correct state as per PR feedback
      if (currentTrack?.fileName === trackFileName) {
        if (updatedPlaylist.length > 0) {
          nextTrack = updatedPlaylist[0];
          // Update current track and audio source inline
          setCurrentTrackState(nextTrack);
          setCurrentPositionState(0);
          currentPositionRef.current = 0;

          const url = await resolvePlaybackUrl(nextTrack.fileName);
          if (url && audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.currentTime = 0;
            // Only start playback if previous isPlaying flag was true
            if (wasPlaying) {
              try {
                // Call playTrack to handle playback and avoid repeated logic
                await playTrack(nextTrack, updatedPlaylist);
              } catch (err) {
                console.error("Failed to resume playback after remove:", err);
                setIsPlayingState(false);
              }
            } else {
              setIsPlayingState(false);
            }
          }
        } else {
          nextTrack = null;
          setCurrentTrackState(null);
          setIsPlayingState(false);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }
        }
      }

      // Perform a single savePreferences call with the updatedPlaylist and nextTrack
      savePreferences({ playlist: updatedPlaylist, currentTrack: nextTrack });
    },
    [session?.user?.id, playlist, currentTrack, isPlaying, resolvePlaybackUrl, savePreferences, playTrack]
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
