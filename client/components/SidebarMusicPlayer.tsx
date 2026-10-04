import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
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
  ListMusic,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { useTranslation } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const SidebarMusicPlayer: React.FC = () => {
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

  const { t } = useTranslation();
  const [showPlaylist, setShowPlaylist] = useState(false);

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
      <div className="p-3 mt-auto border-t border-border/60 bg-card/60 backdrop-blur-sm space-y-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-muted-foreground" />
              <p className="text-muted-foreground text-xs font-medium">
                {t("customize.noTrackPlaying", undefined, "No track playing")}
              </p>
            </div>
            {playlist.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                {playlist.length} {t("customize.tracksCount", undefined, "tracks")}
              </span>
            )}
          </div>

          {playlist.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => playTrack(playlist[0])}
              className="w-full text-xs h-8 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 flex items-center justify-center gap-1.5 font-medium"
              title={t("customize.startPlaylist", undefined, "Start Playlist")}
              aria-label={t("customize.startPlaylist", undefined, "Start Playlist")}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{t("customize.startPlaylist", undefined, "Start Playlist")}</span>
            </Button>
          ) : (
            <Link
              to="/storage"
              className="w-full text-center text-xs text-primary hover:underline py-1"
            >
              {t("customize.addFromStorage", undefined, "Add from Storage")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 mt-auto border-t border-border/60 bg-card/60 backdrop-blur-sm space-y-2.5">
      {/* Track info & Mute / Playlist toggle */}
      <div className="flex items-center justify-between gap-1.5 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Music
            className={`w-3.5 h-3.5 shrink-0 ${
              isPlaying ? "text-primary animate-pulse" : "text-muted-foreground"
            }`}
          />
          <p
            className="font-medium text-xs text-foreground truncate flex-1"
            title={currentTrack.name}
          >
            {currentTrack.name}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowPlaylist((prev) => !prev)}
            className={`p-1 rounded text-xs transition-colors flex items-center gap-0.5 ${
              showPlaylist
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={t("customize.currentPlaylist", undefined, "Current Playlist")}
            aria-label={t("customize.currentPlaylist", undefined, "Current Playlist")}
          >
            <ListMusic className="w-3.5 h-3.5" />
            {showPlaylist ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="text-muted-foreground hover:text-primary p-1 rounded transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Mini Scrubber with Time Display */}
      <div className="space-y-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            value={Math.min(currentPosition, totalDuration || 100)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label="Seek track"
            className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-full focus:outline-none"
            style={{
              background: `linear-gradient(to right, var(--primary) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono tabular-nums px-0.5">
          <span>{formatTime(currentPosition)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={playPrev}
          className="h-7 w-7 text-muted-foreground hover:text-primary rounded-md"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          onClick={isPlaying ? pause : play}
          className="h-8 w-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm rounded-md"
          title={isPlaying ? "Pause track" : "Play track"}
          aria-label={isPlaying ? "Pause track" : "Play track"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={playNext}
          className="h-7 w-7 text-muted-foreground hover:text-primary rounded-md"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={`h-7 w-7 rounded-md ${
            shuffle
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "text-muted-foreground hover:text-primary"
          }`}
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
          className={`h-7 w-7 rounded-md ${
            loop
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "text-muted-foreground hover:text-primary"
          }`}
          title="Toggle loop"
          aria-label="Toggle loop"
          aria-pressed={loop}
        >
          <Repeat className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Expandable Playlist for mobile users in sidebar */}
      {showPlaylist && (
        <div className="pt-2 border-t border-border/40 space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground px-1">
            <span>{t("customize.currentPlaylist", undefined, "Current Playlist")} ({playlist.length})</span>
            <Link
              to="/customize"
              className="text-primary hover:underline flex items-center gap-1"
            >
              {t("customize.title", undefined, "Customize")}
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <ScrollArea className="max-h-40 overflow-y-auto pr-1">
            <div className="space-y-1">
              {playlist.map((track, idx) => {
                const isCurrent = currentTrack?.fileName === track.fileName;
                return (
                  <button
                    key={`sidebar-${track.fileName}-${idx}`}
                    type="button"
                    onClick={() => playTrack(track)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                      isCurrent
                        ? "bg-primary/15 text-primary font-semibold border border-primary/30"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <Music className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{track.name}</span>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] text-primary/80 font-medium shrink-0">
                        {isPlaying ? "▶" : "❚❚"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
