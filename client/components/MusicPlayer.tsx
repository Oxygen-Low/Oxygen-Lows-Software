import { Play, Pause, SkipBack, SkipForward, Shuffle } from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { Button } from "@/components/ui/button";

export const MusicPlayer = () => {
  const {
    currentTrack,
    currentPosition,
    isPlaying,
    shuffle,
    audioRef,
    play,
    pause,
    playNext,
    playPrev,
    toggleShuffle,
  } = useMusic();

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    return `${minutes}:${displaySeconds.toString().padStart(2, "0")}`;
  };

  const getDuration = () => {
    if (!audioRef.current) return 0;
    return audioRef.current.duration * 1000;
  };

  const progressPercent =
    getDuration() > 0 ? (currentPosition / getDuration()) * 100 : 0;

  if (!currentTrack) {
    return (
      <div className="p-4 bg-card rounded-lg border border-border">
        <p className="text-muted-foreground text-sm">No track playing</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-lg border border-border space-y-4">
      <audio ref={audioRef} crossOrigin="anonymous" />

      <div>
        <p className="font-medium text-foreground">{currentTrack.name}</p>
        <p className="text-sm text-muted-foreground">{currentTrack.fileName}</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentPosition)}</span>
          <span>{formatTime(getDuration())}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={playPrev}
          className="hover:text-primary"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          onClick={isPlaying ? pause : play}
          className="bg-primary hover:bg-primary/90"
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
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <Button
          size="sm"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={shuffle ? "bg-primary hover:bg-primary/90" : "hover:text-primary"}
        >
          <Shuffle className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
