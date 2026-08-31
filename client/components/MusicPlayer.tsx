import React, { useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  Volume1,
  VolumeX,
  Music,
} from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { Button } from "@/components/ui/button";

export const MusicPlayer = () => {
  const {
    currentTrack,
    currentPosition,
    duration,
    isPlaying,
    shuffle,
    loop,
    volume,
    isMuted,
    audioRef,
    play,
    pause,
    playNext,
    playPrev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleLoop,
    playlist,
    playTrack,
  } = useMusic();

  const formatTime = useCallback((milliseconds: number) => {
    if (!milliseconds || isNaN(milliseconds) || !isFinite(milliseconds)) {
      return "0:00";
    }
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const displaySeconds = totalSeconds % 60;
    return `${minutes}:${displaySeconds.toString().padStart(2, "0")}`;
  }, []);

  const totalDuration =
    duration > 0
      ? duration
      : audioRef.current && isFinite(audioRef.current.duration)
        ? audioRef.current.duration * 1000
        : 0;

  const progressPercent =
    totalDuration > 0
      ? Math.min(100, (currentPosition / totalDuration) * 100)
      : 0;

  if (!currentTrack) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">No track playing</p>
        </div>
        {playlist.length > 0 && (
          <Button
            size="sm"
            onClick={() => playTrack(playlist[0])}
            className="bg-primary hover:bg-primary/90"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Playlist
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-lg border border-border space-y-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-4">
          <p className="font-medium text-foreground truncate">{currentTrack.name}</p>
          <p className="text-sm text-muted-foreground truncate">{currentTrack.fileName}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleMute}
            className="h-8 w-8 hover:text-primary"
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-muted-foreground" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-4 h-4 text-primary" />
            ) : (
              <Volume2 className="w-4 h-4 text-primary" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              if (isMuted) toggleMute();
              setVolume(parseFloat(e.target.value));
            }}
            aria-label="Volume"
            className="w-16 sm:w-20 accent-primary cursor-pointer h-1.5 bg-muted rounded-full"
          />
        </div>
      </div>

      {/* Progress bar and Scrubber */}
      <div className="space-y-1.5">
        <div className="relative flex items-center group">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            value={Math.min(currentPosition, totalDuration || 100)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label="Seek track position"
            className="w-full accent-primary cursor-pointer h-2 bg-muted rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
            style={{
              background: `linear-gradient(to right, var(--primary) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentPosition)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={playPrev}
          className="hover:text-primary"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          onClick={isPlaying ? pause : play}
          className="bg-primary hover:bg-primary/90 min-w-[40px]"
          title={isPlaying ? "Pause track" : "Play track"}
          aria-label={isPlaying ? "Pause track" : "Play track"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={playNext}
          className="hover:text-primary"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={
            shuffle ? "bg-primary hover:bg-primary/90" : "hover:text-primary"
          }
          title="Toggle shuffle"
          aria-label="Toggle shuffle"
          aria-pressed={shuffle}
        >
          <Shuffle className="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          variant={loop ? "default" : "ghost"}
          onClick={() => toggleLoop(!loop)}
          className={
            loop ? "bg-primary hover:bg-primary/90" : "hover:text-primary"
          }
          title="Toggle loop"
          aria-label="Toggle loop"
          aria-pressed={loop}
        >
          <Repeat className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

