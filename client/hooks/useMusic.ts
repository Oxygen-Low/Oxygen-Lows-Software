import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

export interface PlaylistTrack {
  id: string;
  fileName: string;
  name: string;
}

export const useMusic = () => {
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
  }, []);

  // Auto-save position periodically
  useEffect(() => {
    if (!isPlaying || !session?.user?.id) return;

    saveTimeoutRef.current = setInterval(() => {
      savePreferences();
    }, 10000);

    return () => {
      if (saveTimeoutRef.current) clearInterval(saveTimeoutRef.current);
    };
  }, [isPlaying, session?.user?.id, currentTrack, currentPosition, shuffle]);

  const savePreferences = useCallback(async () => {
    if (!session?.user?.id || !currentTrack) return;

    try {
      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session.user.id,
        p_music_playlist: playlist,
        p_current_music_track: currentTrack.fileName,
        p_current_music_position: Math.floor(currentPosition),
        p_shuffle_enabled: shuffle,
      });
    } catch (error) {
      console.error("Failed to save music preferences:", error);
    }
  }, [session?.user?.id, playlist, currentTrack, currentPosition, shuffle]);

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
      } catch (error) {
        console.error("Failed to play track:", error);
      }
    },
    []
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

      try {
        await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_music_playlist: updatedPlaylist,
        });
      } catch (error) {
        console.error("Failed to add track:", error);
        setPlaylistState(playlist);
      }
    },
    [session?.user?.id, playlist]
  );

  const removeTrack = useCallback(
    async (trackFileName: string) => {
      if (!session?.user?.id) return;

      const updatedPlaylist = playlist.filter(
        (t) => t.fileName !== trackFileName
      );
      setPlaylistState(updatedPlaylist);

      // If removed track is currently playing, play next
      if (currentTrack?.fileName === trackFileName) {
        if (updatedPlaylist.length > 0) {
          await playTrack(updatedPlaylist[0]);
        } else {
          setCurrentTrackState(null);
          setIsPlayingState(false);
        }
      }

      try {
        await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_music_playlist: updatedPlaylist,
        });
      } catch (error) {
        console.error("Failed to remove track:", error);
        setPlaylistState(playlist);
      }
    },
    [session?.user?.id, playlist, currentTrack, playTrack]
  );

  const toggleShuffle = useCallback(
    async (newShuffleState: boolean) => {
      setShuffleState(newShuffleState);

      if (!session?.user?.id) return;

      try {
        await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_shuffle_enabled: newShuffleState,
        });
      } catch (error) {
        console.error("Failed to toggle shuffle:", error);
        setShuffleState((prev) => !prev);
      }
    },
    [session?.user?.id]
  );

  return {
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
  };
};
