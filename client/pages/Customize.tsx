import { useState } from "react";
import Layout from "@/components/Layout";
import { useTheme } from "@/contexts/ThemeContext";
import { useMusicContext } from "@/contexts/MusicContext";
import { MusicPlayer } from "@/components/MusicPlayer";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { Button } from "@/components/ui/button";
import { Zap, Music, Trash2, Play, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface PlaylistTrack {
  id: string;
  name: string;
  fileName: string;
}

const THEMES = [
  { label: "Default", value: "default" },
  { label: "Red", value: "red" },
  { label: "Yellow", value: "yellow" },
  { label: "Black/Dark", value: "black" },
  { label: "White/Light", value: "white" },
];

const FONTS = [
  { label: "Indie Flower (Default)", value: "font-indie" },
  { label: "Zilla Slab", value: "font-zilla" },
  { label: "VT323", value: "font-vt323" },
  { label: "Cabin Sketch", value: "font-cabin" },
  { label: "Londrina Sketch", value: "font-londrina" },
];

export default function Customize() {
  const {
    theme,
    setTheme,
    font,
    setFont,
    useGradient,
    setUseGradient,
    backgroundImagePath,
    setBackgroundImage,
  } = useTheme();
  const {
    playlist,
    currentTrack,
    addTrack,
    removeTrack,
    playTrack,
    shuffle,
    toggleShuffle,
  } = useMusicContext();
  const { session } = useAuth();
  const { toast } = useToast();

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
        title: "Success",
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
      title: "Success",
      description: "Track removed from playlist",
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-foreground">Customize</h1>

        {/* Theme Section */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Appearance
          </h2>

          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <div>
              <label className="text-foreground font-medium block">
                Use gradient
              </label>
              <p className="text-sm text-muted-foreground">
                Apply a gradient background based on your theme
              </p>
            </div>
            <button
              onClick={() => setUseGradient(!useGradient)}
              aria-pressed={useGradient}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                useGradient
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {useGradient ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div className="mb-6 p-4 bg-card rounded-lg border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-foreground font-medium block">
                  Background Image
                </label>
                <p className="text-sm text-muted-foreground">
                  Pick an image from storage to use as your background
                </p>
              </div>
              {backgroundImagePath && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBackgroundImage(null)}
                >
                  Remove Image
                </Button>
              )}
            </div>

            <StorageFileSelector
              allowedTypes={["image"]}
              onSelect={(file) => setBackgroundImage(file.name)}
              trigger={
                <Button className="w-full h-24 border-dashed border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex flex-col gap-2">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span>
                    {backgroundImagePath
                      ? "Change Background Image"
                      : "Select Background Image"}
                  </span>
                  {backgroundImagePath && (
                    <span className="text-xs truncate max-w-full px-4">
                      {backgroundImagePath}
                    </span>
                  )}
                </Button>
              }
            />
          </div>

          <h3 className="text-lg font-medium mb-3 text-foreground">
            Theme Color
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {THEMES.map((themeOption) => (
              <button
                key={themeOption.value}
                onClick={() => setTheme(themeOption.value as any)}
                aria-pressed={theme === themeOption.value}
                className={`p-4 rounded-lg border-2 transition-all font-medium text-sm ${
                  theme === themeOption.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
              >
                {themeOption.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Section */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Font</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {FONTS.map((fontOption) => (
              <button
                key={fontOption.value}
                onClick={() => setFont(fontOption.value)}
                aria-pressed={font === fontOption.value}
                className={`p-4 rounded-lg border-2 transition-all font-medium text-sm ${
                  font === fontOption.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
              >
                {fontOption.label}
              </button>
            ))}
          </div>
        </div>

        {/* Music Playlist Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Music Playlist
          </h2>

          {/* Music Player */}
          <div className="mb-6">
            <MusicPlayer />
          </div>

          {/* Shuffle Toggle */}
          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <label className="text-foreground font-medium">Shuffle</label>
            <button
              onClick={() => toggleShuffle(!shuffle)}
              aria-pressed={shuffle}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                shuffle
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {shuffle ? "On" : "Off"}
            </button>
          </div>

          {/* Playlist */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Current Playlist
            </h3>
            {playlist.length === 0 ? (
              <p className="text-muted-foreground">
                Your playlist is empty. Add tracks below.
              </p>
            ) : (
              <div className="space-y-2">
                {playlist.map((track) => (
                  <div
                    key={track.fileName}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      currentTrack?.fileName === track.fileName
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border hover:bg-muted"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-primary" />
                        <p className="font-medium text-foreground">
                          {track.name}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {track.fileName}
                      </p>
                    </div>
                    <button
                      onClick={() => playTrack(track)}
                      aria-label={`Play ${track.name}`}
                      title={`Play ${track.name}`}
                      className="p-2 hover:bg-primary/20 rounded-lg text-primary transition-colors mr-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemoveTrack(track.fileName)}
                      aria-label={`Remove ${track.name}`}
                      title={`Remove ${track.name}`}
                      className="p-2 hover:bg-destructive/20 rounded-lg text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Audio Files */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-foreground">
              Add from Storage
            </h3>
            <StorageFileSelector
              allowedExtensions={[".mp3", ".wav", ".ogg"]}
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
                  <span>Select Audio from Storage</span>
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
