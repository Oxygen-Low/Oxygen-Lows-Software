import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { Button } from "@/components/ui/button";

export const SidebarMusicPlayer = () => {
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
    toggleMute,
    toggleShuffle,
    toggleLoop,
    playlist,
    playTrack,
  } = useMusic();

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
      <div className="p-3 mt-auto border-t border-border bg-card/40">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs text-center">
            No track playing
          </p>
          {playlist.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => playTrack(playlist[0])}
              className="w-full text-xs h-8 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            >
              <Play className="w-3 h-3 mr-1" /> Start Playlist
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 mt-auto border-t border-border bg-card/40 space-y-2">
      <div className="flex items-center justify-between gap-1 overflow-hidden">
        <p
          className="font-medium text-xs text-foreground truncate flex-1"
          title={currentTrack.name}
        >
          {currentTrack.name}
        </p>
        <button
          onClick={toggleMute}
          className="text-muted-foreground hover:text-primary p-1 rounded transition-colors shrink-0"
          title={isMuted ? "Unmute" : "Mute"}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-primary" />
          )}
        </button>
      </div>

      {/* Mini Scrubber */}
      <div className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={totalDuration || 100}
          value={Math.min(currentPosition, totalDuration || 100)}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek track"
          className="w-full accent-primary cursor-pointer h-1 bg-muted rounded-full focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--primary) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={playPrev}
          className="h-7 w-7 hover:text-primary"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          onClick={isPlaying ? pause : play}
          className="h-7 w-7 bg-primary hover:bg-primary/90"
          title={isPlaying ? "Pause track" : "Play track"}
          aria-label={isPlaying ? "Pause track" : "Play track"}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={playNext}
          className="h-7 w-7 hover:text-primary"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={`h-7 w-7 ${shuffle ? "bg-primary hover:bg-primary/90" : "hover:text-primary"}`}
          title="Toggle shuffle"
          aria-label="Toggle shuffle"
          aria-pressed={shuffle}
        >
          <Shuffle className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          variant={loop ? "default" : "ghost"}
          onClick={() => toggleLoop(!loop)}
          className={`h-7 w-7 ${loop ? "bg-primary hover:bg-primary/90" : "hover:text-primary"}`}
          title="Toggle loop"
          aria-label="Toggle loop"
          aria-pressed={loop}
        >
          <Repeat className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
