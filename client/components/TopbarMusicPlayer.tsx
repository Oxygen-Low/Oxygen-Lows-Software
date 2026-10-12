import React, { useCallback, useState, useRef, useEffect } from "react";
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
  RotateCcw,
} from "lucide-react";
import { useMusic } from "@/hooks/useMusic";
import { useTranslation } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MusicPlayer } from "./MusicPlayer";

/**
 * Text component with a fixed container that smoothly slides left and right
 * when text overflows, without changing container width or shifting the layout.
 */
const MarqueeText: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const updateOverflow = () => {
      if (containerRef.current && textRef.current) {
        const diff =
          textRef.current.scrollWidth - containerRef.current.clientWidth;
        if (diff > 4) {
          setOverflowDistance(diff);
        } else {
          setOverflowDistance(0);
        }
      }
    };

    updateOverflow();
    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden relative w-full select-none"
      title={text}
    >
      <span
        ref={textRef}
        style={
          overflowDistance > 0
            ? ({
                "--marquee-shift": `-${overflowDistance + 6}px`,
                animation: `marquee-pingpong 7s ease-in-out infinite alternate`,
              } as React.CSSProperties)
            : undefined
        }
        className={`inline-block whitespace-nowrap ${className || ""}`}
      >
        {text}
      </span>
      <style>{`
        @keyframes marquee-pingpong {
          0%, 18% {
            transform: translateX(0);
          }
          82%, 100% {
            transform: translateX(var(--marquee-shift, 0));
          }
        }
      `}</style>
    </div>
  );
};

export const TopbarMusicPlayer: React.FC = () => {
  const {
    currentTrack,
    currentPosition,
    duration,
    isPlaying,
    shuffle,
    loop,
    volume,
    playlistSessionVolume,
    setPlaylistSessionVolume,
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
    currentBackgroundUrl,
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
      collisionPadding={8}
      className="w-[calc(100vw-1.5rem)] max-w-sm sm:w-80 max-h-[min(36rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-3 bg-popover/95 backdrop-blur-md border border-border shadow-xl rounded-lg z-[70]"
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 pb-2 mb-2 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <ListMusic className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            {t("customize.currentPlaylist", undefined, "Current Playlist")}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium shrink-0">
            {playlist.length} {t("customize.tracksCount", undefined, "tracks")}
          </span>
        </div>
        <Link
          to="/customize"
          onClick={() => setIsPopoverOpen(false)}
          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium shrink-0 ml-2"
        >
          {t("customize.title", undefined, "Customize")}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Session Playlist Volume Control */}
      <div className="mb-3 p-2 bg-muted/40 rounded-md border border-border/40 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              {t(
                "customize.playlistSessionVolume",
                undefined,
                "Session Volume",
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary font-semibold">
              {Math.round(playlistSessionVolume * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPlaylistSessionVolume(1)}
              disabled={playlistSessionVolume === 1}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
              title={t(
                "customize.resetSessionVolume",
                undefined,
                "Reset session volume",
              )}
              aria-label={t(
                "customize.resetSessionVolume",
                undefined,
                "Reset session volume",
              )}
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={playlistSessionVolume}
          onChange={(e) => setPlaylistSessionVolume(parseFloat(e.target.value))}
          aria-label={t(
            "customize.playlistSessionVolume",
            undefined,
            "Session Volume",
          )}
          className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-full"
        />
      </div>

      {currentTrack && (
        <div className="mb-3">
          <MusicPlayer />
        </div>
      )}

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
        <div className="pr-1">
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
                  className={`w-full flex items-center justify-between px-2.5 min-h-11 py-2 rounded-md text-left text-xs transition-colors ${
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
                      {isPlaying
                        ? t("customize.nowPlaying", undefined, "Playing")
                        : "Paused"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
            className="h-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-lg bg-card/60 hover:bg-card/90 border border-border text-xs text-muted-foreground hover:text-foreground transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
            title={t("customize.noTrackPlaying", undefined, "No track playing")}
            aria-label={t("customize.noTrackPlaying", undefined, "No track playing")}
          >
            <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="hidden @[14rem]/music:inline font-medium truncate">
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
      <div className="h-full flex items-center gap-1 px-1.5 py-0.5 sm:py-1 rounded-lg bg-card/60 border border-border shadow-sm backdrop-blur-sm max-w-full">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => playTrack(playlist[0])}
          className="h-9 w-9 shrink-0 @[14rem]/music:w-auto px-0 @[14rem]/music:px-2 text-xs text-primary font-medium hover:bg-primary/10 flex items-center gap-1 rounded-md min-w-0"
          title={t("customize.startPlaylist", undefined, "Start Playlist")}
          aria-label={t("customize.startPlaylist", undefined, "Start Playlist")}
        >
          <Play className="w-3.5 h-3.5 fill-current shrink-0" />
          <span className="hidden @[14rem]/music:inline truncate">
            {t("customize.startPlaylist", undefined, "Start Playlist")}
          </span>
          <span className="hidden @[14rem]/music:inline text-[10px] px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-semibold shrink-0">
            {playlist.length}
          </span>
        </Button>

        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 p-0 rounded-md text-muted-foreground hover:text-primary shrink-0"
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
  const pillStyle: React.CSSProperties = currentBackgroundUrl
    ? {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.75)), url("${currentBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <div
      style={pillStyle}
      className={`h-full w-full max-w-2xl flex items-center justify-center gap-1 px-1.5 py-0.5 sm:py-1 rounded-lg border border-border shadow-sm backdrop-blur-md transition-all min-w-0 ${
        currentBackgroundUrl ? "bg-slate-950/80 text-white" : "bg-card/70"
      }`}
    >
      {/* Reveal details only when the header has room for them. */}
      <div className="hidden @[14rem]/music:flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
        <Music
          className={`w-3.5 h-3.5 shrink-0 ${
            isPlaying ? "text-primary animate-pulse" : "text-muted-foreground"
          }`}
        />
        <MarqueeText
          text={currentTrack?.name || ""}
          className="font-medium text-xs text-foreground"
        />
      </div>

      {/* Full controls remain available in the playlist popover. */}
      <div className="hidden @[36rem]/music:flex items-center gap-1.5 shrink-0">
        <input
          type="range"
          min={0}
          max={totalDuration || 100}
          value={Math.min(currentPosition, totalDuration || 100)}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek track"
          className="w-14 lg:w-20 accent-primary cursor-pointer h-1.5 bg-muted rounded-sm focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--primary) ${progressPercent}%, hsl(var(--muted)) ${progressPercent}%)`,
          }}
        />
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {formatTime(currentPosition)}
        </span>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 h-full">
        <Button
          size="icon"
          variant="ghost"
          onClick={playPrev}
          className="hidden @[36rem]/music:inline-flex h-9 w-9 shrink-0 p-0 rounded-md text-muted-foreground hover:text-primary"
          title="Previous track"
          aria-label="Previous track"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          onClick={isPlaying ? pause : play}
          className="h-9 w-9 shrink-0 p-0 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
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
          className="hidden @[36rem]/music:inline-flex h-9 w-9 shrink-0 p-0 rounded-md text-muted-foreground hover:text-primary"
          title="Next track"
          aria-label="Next track"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          variant={shuffle ? "default" : "ghost"}
          onClick={() => toggleShuffle(!shuffle)}
          className={`hidden @[36rem]/music:inline-flex h-9 w-9 shrink-0 p-0 rounded-md ${
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
          className={`hidden @[36rem]/music:inline-flex h-9 w-9 shrink-0 p-0 rounded-md ${
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

        {/* Topbar Session Volume Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="hidden @[36rem]/music:inline-flex h-9 w-9 shrink-0 p-0 rounded-md text-muted-foreground hover:text-primary"
              title={
                isMuted
                  ? t("customize.unmute", undefined, "Unmute")
                  : t("customize.playlistSessionVolume", undefined, "Session Volume")
              }
              aria-label={
                isMuted
                  ? t("customize.unmute", undefined, "Unmute")
                  : t("customize.playlistSessionVolume", undefined, "Session Volume")
              }
            >
              {isMuted || playlistSessionVolume === 0 || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
              ) : playlistSessionVolume < 0.5 ? (
                <Volume1 className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={8}
            className="w-56 p-3 space-y-3 z-[70]"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {t(
                  "customize.playlistSessionVolume",
                  undefined,
                  "Session Volume",
                )}
              </span>
              <span className="font-mono text-muted-foreground font-semibold">
                {isMuted ? "0%" : `${Math.round(playlistSessionVolume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : playlistSessionVolume}
              onChange={(e) => {
                if (isMuted) toggleMute();
                setPlaylistSessionVolume(parseFloat(e.target.value));
              }}
              aria-label={t(
                "customize.playlistSessionVolume",
                undefined,
                "Session Volume",
              )}
              className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-full"
            />
            <div className="flex items-center gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleMute}
                className="flex-1 text-xs h-7"
              >
                {isMuted ? (
                  <>
                    <Volume2 className="w-3 h-3 mr-1" />
                    {t("customize.unmute", undefined, "Unmute")}
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3 mr-1" />
                    {t("customize.mute", undefined, "Mute")}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isMuted) toggleMute();
                  setPlaylistSessionVolume(1);
                }}
                disabled={!isMuted && playlistSessionVolume === 1}
                className="text-xs h-7 px-2"
                title={t(
                  "customize.resetSessionVolume",
                  undefined,
                  "Reset session volume",
                )}
                aria-label={t(
                  "customize.resetSessionVolume",
                  undefined,
                  "Reset session volume",
                )}
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Playlist Popover */}
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 p-0 rounded-md text-muted-foreground hover:text-primary relative"
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
