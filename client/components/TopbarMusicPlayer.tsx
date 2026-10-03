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
  ExternalLink,
} from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { useTranslation } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export const TopbarMusicPlayer: React.FC = () => {
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
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

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

  // Playlist drawer / popover component
  const PlaylistPopoverContent = (
    <PopoverContent
      align="center"
      sideOffset={8}
      className="w-80 p-3 bg-popover/95 backdrop-blur-md border border-border shadow-xl rounded-lg z-[70]"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {t("customize.currentPlaylist", undefined, "Current Playlist")}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
            {playlist.length} {t("customize.tracksCount", undefined, "tracks")}
          </span>
        </div>
        <Link
          to="/customize"
          onClick={() => setIsPopoverOpen(false)}
          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
        >
          {t("customize.title", undefined, "Customize")}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {playlist.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <p>{t("customize.noTracks", undefined, "No tracks added yet.")}</p>
          <Link
            to="/storage"
            onClick={() => setIsPopoverOpen(false)}
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            {t("customize.addFromStorage", undefined, "Add from Storage")}
          </Link>
        </div>
      ) : (
        <ScrollArea className="max-h-60 overflow-y-auto pr-1">
          <div className="space-y-1">
            {playlist.map((track, idx) => {
              const isCurrent = currentTrack?.fileName === track.fileName;
              return (
                <button
                  key={`${track.fileName}-${idx}`}
                  type="button"
                  onClick={() => {
                    playTrack(track);
                    setIsPopoverOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                    isCurrent
                      ? "bg-primary/15 text-primary font-semibold border border-primary/30"
                      : "hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {isCurrent && isPlaying ? (
                      <div className="w-3.5 h-3.5 flex items-center justify-center text-primary shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      </div>
                    ) : (
                      <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{track.name}</span>
                  </div>
                  {isCurrent && (
                    <span className="text-[10px] text-primary/80 font-medium shrink-0">
                      {isPlaying ? t("customize.nowPlaying", undefined, "Playing") : "Paused"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </PopoverContent>
  );

  // If no track is playing and playlist is empty
  if (!currentTrack && playlist.length === 0) {
    return (
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 hover:bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            title={t("customize.noTrackPlaying", undefined, "No track playing")}
            aria-label={t("customize.noTrackPlaying", undefined, "No track playing")}
          >
            <Music className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">
              {t("customize.noTrackPlaying", undefined, "No track playing")}
            </span>
          </button>
        </PopoverTrigger>
        {PlaylistPopoverContent}
      </Popover>
    );
  }

  // If no track is currently active, but playlist has tracks
  if (!currentTrack && playlist.length > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/60 border border-border shadow-sm backdrop-blur-sm">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => playTrack(playlist[0])}
          className="h-7 px-2.5 text-xs text-primary font-medium hover:bg-primary/10 flex items-center gap-1.5 rounded-md"
          title={t("customize.startPlaylist", undefined, "Start Playlist")}
          aria-label={t("customize.startPlaylist", undefined, "Start Playlist")}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{t("customize.startPlaylist", undefined, "Start Playlist")}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-primary/20 text-primary font-semibold">
            {playlist.length}
          </span>
        </Button>

        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
              title={t("customize.currentPlaylist", undefined, "Current Playlist")}
              aria-label={t("customize.currentPlaylist", undefined, "Current Playlist")}
            >
              <ListMusic className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          {PlaylistPopoverContent}
        </Popover>
      </div>
    );
  }

  // Active track state
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-lg bg-card/70 border border-border shadow-sm backdrop-blur-md max-w-full">
      {/* Track Info */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-[90px] xs:max-w-[130px] sm:max-w-[170px] md:max-w-[200px]">
        <Music
          className={`w-3.5 h-3.5 shrink-0 ${
            isPlaying ? "text-primary animate-pulse" : "text-muted-foreground"
          }`}
        />
        <span
          className="font-medium text-xs text-foreground truncate select-none cursor-default"
          title={currentTrack?.name}
        >
          {currentTrack?.name}
        </span>
      </div>

      {/* Scrubber (hidden on small screens, visible on md+) */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <input
          type="range"
          min={0}
          max={totalDuration || 100}
          value={Math.min(currentPosition, totalDuration || 100)}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek track"
          className="w-16 lg:w-24 accent-primary cursor-pointer h-1.5 bg-muted rounded-sm focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--primary) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
          }}
        />
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {formatTime(currentPosition)}
        </span>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={playPrev}
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          onClick={isPlaying ? pause : play}
          className="h-7 w-7 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          title={isPlaying ? "Pause track" : "Play track"}
          aria-label={isPlaying ? "Pause track" : "Play track"}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={playNext}
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={`hidden sm:inline-flex h-7 w-7 rounded-md ${
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
          className={`hidden sm:inline-flex h-7 w-7 rounded-md ${
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

        <Button
          size="icon"
          variant="ghost"
          onClick={toggleMute}
          className="hidden sm:inline-flex h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
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
        </Button>

        {/* Playlist Popover */}
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary relative"
              title={t("customize.currentPlaylist", undefined, "Current Playlist")}
              aria-label={t("customize.currentPlaylist", undefined, "Current Playlist")}
            >
              <ListMusic className="w-3.5 h-3.5" />
              {playlist.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-md bg-primary text-[9px] font-bold text-primary-foreground shadow-sm">
                  {playlist.length > 9 ? "9+" : playlist.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          {PlaylistPopoverContent}
        </Popover>
      </div>
    </div>
  );
};

export default TopbarMusicPlayer;
