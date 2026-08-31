import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useTheme } from "@/contexts/ThemeContext";
import { useMusicContext } from "@/contexts/MusicContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { MusicPlayer } from "@/components/MusicPlayer";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { Button } from "@/components/ui/button";
import { Music, Trash2, Play, Pause, Type, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlaylistTrack {
  id?: string;
  name: string;
  fileName: string;
}

const THEMES = [
  {
    label: "Default",
    value: "default",
    bg: "hsl(218, 21%, 7%)",
    fg: "hsl(186, 100%, 50%)",
    text: "hsl(210, 40%, 98%)",
  },
  {
    label: "Red",
    value: "red",
    bg: "hsl(0, 0%, 7%)",
    fg: "hsl(0, 84%, 60%)",
    text: "hsl(0, 0%, 98%)",
  },
  {
    label: "Yellow",
    value: "yellow",
    bg: "hsl(45, 100%, 6%)",
    fg: "hsl(45, 100%, 50%)",
    text: "hsl(45, 100%, 98%)",
  },
  {
    label: "Black/Dark",
    value: "black",
    bg: "hsl(0, 0%, 0%)",
    fg: "hsl(0, 0%, 100%)",
    text: "hsl(0, 0%, 100%)",
  },
  {
    label: "White/Light",
    value: "white",
    bg: "hsl(0, 0%, 100%)",
    fg: "hsl(0, 0%, 0%)",
    text: "hsl(0, 0%, 0%)",
  },
];

const FONTS = [
  {
    label: "Zilla Slab (Default)",
    value: "font-zilla",
    family: "'Zilla Slab'",
  },
  {
    label: "Indie Flower",
    value: "font-indie",
    family: "'Indie Flower'",
  },
  { label: "VT323", value: "font-vt323", family: "'VT323'" },
  { label: "Cabin Sketch", value: "font-cabin", family: "'Cabin Sketch'" },
  {
    label: "Londrina Sketch",
    value: "font-londrina",
    family: "'Londrina Sketch'",
  },
];

export default function Customize() {
  const { theme, setTheme, font, setFont, useGradient, setUseGradient } =
    useTheme();
  const { t } = useTranslation();
  usePageTitle(t("titles.customize", undefined, "Customize"), {
    description: t(
      "customize.subtitle",
      undefined,
      "Personalize themes, appearance, fonts, and background music.",
    ),
  });

  const {
    playlist,
    currentTrack,
    isPlaying,
    play,
    pause,
    addTrack,
    removeTrack,
    moveTrack,
    clearPlaylist,
    playTrack,
    shuffle,
    toggleShuffle,
    loop,
    toggleLoop,
  } = useMusicContext();

  const { toast } = useToast();

  const [customPrimaryColor, setCustomPrimaryColor] = useState(() => {
    if (theme && theme.startsWith("custom:")) {
      const parts = theme.replace("custom:", "").split("-");
      return parts[0] || "#00ffff";
    }
    return "#00ffff";
  });

  const [customBgColor, setCustomBgColor] = useState(() => {
    if (theme && theme.startsWith("custom:")) {
      const parts = theme.replace("custom:", "").split("-");
      return parts[1] || "#0f172a";
    }
    return "#0f172a";
  });

  // Keep state in sync if theme changes externally
  useEffect(() => {
    if (theme && theme.startsWith("custom:")) {
      const parts = theme.replace("custom:", "").split("-");
      if (parts[0]) setCustomPrimaryColor(parts[0]);
      if (parts[1]) setCustomBgColor(parts[1]);
    }
  }, [theme]);

  const handleAddTrack = async (track: any) => {
    let finalTrack: PlaylistTrack = {
      id: track.id,
      fileName: track.name,
      name:
        track.name
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || track.name,
    };

    const alreadyInPlaylist = playlist.some(
      (t) => t.fileName === finalTrack.fileName,
    );
    if (!alreadyInPlaylist) {
      addTrack(finalTrack);
      toast({
        title: t("common.success", undefined, "Success"),
        description: `Added "${finalTrack.name}" to playlist`,
      });
    } else {
      toast({
        title: "Info",
        description: "Track already in playlist",
      });
    }
  };

  const handleRemoveTrack = (trackFileName: string) => {
    removeTrack(trackFileName);
    toast({
      title: t("common.success", undefined, "Success"),
      description: "Track removed from playlist",
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">
          {t("customize.title", undefined, "Customize")}
        </h1>

        {/* Theme Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 text-foreground">
            {t("customize.themesTitle", undefined, "Appearance")}
          </h2>

          <div className="mb-6 p-3.5 sm:p-4 bg-card rounded-lg border border-border flex items-center justify-between gap-3">
            <div>
              <label className="text-foreground font-medium block text-sm sm:text-base">
                {t("customize.gradientTitle", undefined, "Use gradient")}
              </label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t(
                  "customize.gradientDesc",
                  undefined,
                  "Apply a dynamic gradient across backgrounds and headers",
                )}
              </p>
            </div>
            <button
              onClick={() => setUseGradient(!useGradient)}
              aria-pressed={useGradient}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg border-2 transition-all font-medium text-xs sm:text-sm shrink-0 ${
                useGradient
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {useGradient
                ? t("common.yes", undefined, "On")
                : t("common.no", undefined, "Off")}
            </button>
          </div>

          <h3 className="text-base sm:text-lg font-medium mb-3 text-foreground">
            {t("customize.themesTitle", undefined, "Preset Themes")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {THEMES.map((themeOption) => (
              <button
                key={themeOption.value}
                onClick={() => setTheme(themeOption.value as any)}
                aria-pressed={theme === themeOption.value}
                className={`p-3 sm:p-4 rounded-lg border-2 transition-all font-medium text-xs sm:text-sm ${
                  theme === themeOption.value
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "hover:opacity-80"
                }`}
                style={{
                  backgroundColor: themeOption.bg,
                  color: themeOption.text,
                  borderColor: themeOption.fg,
                }}
              >
                {themeOption.label}
              </button>
            ))}
          </div>

          <h3 className="text-base sm:text-lg font-medium mb-3 mt-6 sm:mt-8 text-foreground">
            Custom Theme
          </h3>
          <div className="p-3.5 sm:p-4 bg-card rounded-lg border border-border space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="text-foreground font-medium block text-sm sm:text-base">
                  Primary Accent Color
                </label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Used for buttons, highlights, and icons
                </p>
              </div>
              <input
                type="color"
                value={customPrimaryColor}
                onChange={(e) => {
                  setCustomPrimaryColor(e.target.value);
                  setTheme(`custom:${e.target.value}-${customBgColor}`);
                }}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="text-foreground font-medium block text-sm sm:text-base">
                  Background Color
                </label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Main background color of the app. A gradient is generated if
                  enabled.
                </p>
              </div>
              <input
                type="color"
                value={customBgColor}
                onChange={(e) => {
                  setCustomBgColor(e.target.value);
                  setTheme(`custom:${customPrimaryColor}-${e.target.value}`);
                }}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
              />
            </div>
          </div>
        </div>

        {/* Font Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 text-foreground">
            {t("customize.fontsTitle", undefined, "Font")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {FONTS.map((fontOption) => (
              <button
                key={fontOption.value}
                onClick={() => setFont(fontOption.value)}
                aria-pressed={font === fontOption.value}
                className={`p-3 sm:p-4 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                  font === fontOption.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
                style={{ fontFamily: fontOption.family }}
              >
                {fontOption.label}
              </button>
            ))}
          </div>

          <h3 className="text-lg font-medium mb-3 mt-8 text-foreground">
            Custom Font
          </h3>
          <StorageFileSelector
            allowedExtensions={[".ttf", ".woff", ".woff2", ".otf"]}
            onSelect={(file) => {
              setFont(`font-custom:${file.name}`);
              toast({
                title: t("common.success", undefined, "Success"),
                description: `Custom font loaded: ${file.name}`,
              });
            }}
            trigger={
              <Button className="w-full h-16 border-dashed border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center gap-2">
                <Type className="w-5 h-5 opacity-50" />
                <span>Select Font from Storage</span>
              </Button>
            }
          />
          {font && font.startsWith("font-custom:") && (
            <p className="text-sm text-primary mt-2 text-center">
              Currently using custom font: {font.replace("font-custom:", "")}
            </p>
          )}
        </div>

        {/* Music Playlist Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            {t("customize.musicSectionTitle", undefined, "Music Playlist")}
          </h2>

          {/* Music Player */}
          <div className="mb-6">
            <MusicPlayer />
          </div>

          {/* Shuffle Toggle */}
          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <label className="text-foreground font-medium">
              {t("customize.shuffle", undefined, "Shuffle")}
            </label>
            <button
              onClick={() => toggleShuffle(!shuffle)}
              aria-pressed={shuffle}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                shuffle
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {shuffle
                ? t("common.yes", undefined, "On")
                : t("common.no", undefined, "Off")}
            </button>
          </div>

          {/* Loop Toggle */}
          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <div>
              <label className="text-foreground font-medium block">
                {t("customize.loop", undefined, "Loop")}
              </label>
              <p className="text-sm text-muted-foreground">
                Keep looping the current song
              </p>
            </div>
            <button
              onClick={() => toggleLoop(!loop)}
              aria-pressed={loop}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                loop
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {loop
                ? t("common.yes", undefined, "On")
                : t("common.no", undefined, "Off")}
            </button>
          </div>

          {/* Playlist */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("customize.currentPlaylist", undefined, "Current Playlist")}
                </h3>
                {playlist.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                    {playlist.length} {t("customize.tracksCount", undefined, "tracks")}
                  </span>
                )}
              </div>
              {playlist.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "customize.clearPlaylistConfirm",
                          undefined,
                          "Are you sure you want to clear your entire playlist?",
                        ),
                      )
                    ) {
                      clearPlaylist();
                      toast({
                        title: t("common.success", undefined, "Success"),
                        description: t(
                          "customize.clearPlaylistSuccess",
                          undefined,
                          "Playlist cleared",
                        ),
                      });
                    }
                  }}
                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  {t("customize.clearPlaylist", undefined, "Clear Playlist")}
                </Button>
              )}
            </div>

            {playlist.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t(
                  "customize.noTracks",
                  undefined,
                  "Your playlist is empty right now. Add some of your favorite tracks below to get started!",
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {playlist.map((track, index) => {
                  const isThisTrack =
                    currentTrack?.fileName === track.fileName ||
                    currentTrack?.fileName.endsWith("/" + track.fileName) ||
                    track.fileName.endsWith("/" + currentTrack?.fileName);
                  const isThisPlaying = isThisTrack && isPlaying;

                  return (
                    <div
                      key={track.fileName + index}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                        isThisTrack
                          ? "bg-primary/10 border-primary"
                          : "bg-card border-border hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                        <span className="text-xs font-mono text-muted-foreground w-4 text-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="shrink-0">
                          <Music className={`w-4 h-4 ${isThisTrack ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-foreground truncate">
                              {track.name}
                            </p>
                            {isThisPlaying && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold uppercase tracking-wider shrink-0">
                                {t("customize.nowPlaying", undefined, "Now Playing")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.fileName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reorder Buttons */}
                        <button
                          disabled={index === 0}
                          onClick={() => moveTrack(index, index - 1)}
                          title={t("customize.moveUp", undefined, "Move Up")}
                          aria-label={t("customize.moveUp", undefined, "Move Up")}
                          className="p-1.5 hover:bg-muted-foreground/10 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          disabled={index === playlist.length - 1}
                          onClick={() => moveTrack(index, index + 1)}
                          title={t("customize.moveDown", undefined, "Move Down")}
                          aria-label={t("customize.moveDown", undefined, "Move Down")}
                          className="p-1.5 hover:bg-muted-foreground/10 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        {/* Play/Pause Button */}
                        <button
                          onClick={() => {
                            if (isThisTrack) {
                              if (isPlaying) {
                                pause();
                              } else {
                                play();
                              }
                            } else {
                              playTrack(track);
                            }
                          }}
                          aria-label={isThisPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
                          title={isThisPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
                          className="p-1.5 hover:bg-primary/20 rounded-lg text-primary transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                          {isThisPlaying ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>

                        {/* Remove Track Button */}
                        <button
                          onClick={() => handleRemoveTrack(track.fileName)}
                          aria-label={`Remove ${track.name}`}
                          title={t("customize.removeTrack", undefined, `Remove ${track.name}`)}
                          className="p-1.5 hover:bg-destructive/20 rounded-lg text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available Audio Files */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-foreground">
              {t("customize.addFromStorage", undefined, "Add from Storage")}
            </h3>
            <StorageFileSelector
              allowedExtensions={[
                ".mp3",
                ".wav",
                ".ogg",
                ".m4a",
                ".aac",
                ".flac",
                ".opus",
                ".webm",
                ".wma",
              ]}
              allowedTypes={["audio"]}
              onSelect={(file) => {
                const track = {
                  id: file.id,
                  name: file.name,
                };
                handleAddTrack(track);
              }}
              trigger={
                <Button className="w-full h-24 border-dashed border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex flex-col gap-2">
                  <Music className="w-8 h-8 opacity-50" />
                  <span>{t("customize.selectAudioFromStorage", undefined, "Select Audio from Storage")}</span>
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
