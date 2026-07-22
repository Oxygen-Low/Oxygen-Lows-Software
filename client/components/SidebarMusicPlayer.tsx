import { Play, Pause, SkipBack, SkipForward, Shuffle } from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { Button } from "@/components/ui/button";

export const SidebarMusicPlayer = () => {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    play,
    pause,
    playNext,
    playPrev,
    toggleShuffle,
    playlist,
    playTrack,
  } = useMusic();

  if (!currentTrack) {
    return (
      <div className="p-4 mt-auto border-t border-border">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs text-center">
            No track playing
          </p>
          {playlist.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => playTrack(playlist[0])}
              className="w-full text-xs h-8"
            >
              <Play className="w-3 h-3 mr-1" /> Start
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 mt-auto border-t border-border space-y-3">
      <div className="overflow-hidden">
        <p
          className="font-medium text-xs text-foreground truncate"
          title={currentTrack.name}
        >
          {currentTrack.name}
        </p>
      </div>

      <div className="flex items-center justify-between gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={playPrev}
          className="h-8 w-8 hover:text-primary"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          onClick={isPlaying ? pause : play}
          className="h-8 w-8 bg-primary hover:bg-primary/90"
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
          size="icon"
          variant="ghost"
          onClick={playNext}
          className="h-8 w-8 hover:text-primary"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={`h-8 w-8 ${shuffle ? "bg-primary hover:bg-primary/90" : "hover:text-primary"}`}
          title="Toggle shuffle"
          aria-label="Toggle shuffle"
          aria-pressed={shuffle}
        >
          <Shuffle className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
