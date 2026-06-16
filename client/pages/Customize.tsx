import { useState } from "react";
import Layout from "@/components/Layout";
import { useTheme, Theme } from "@/hooks/useTheme";
import { useFont, FontOption } from "@/hooks/useFont";
import { useMusic, PlaylistTrack } from "@/hooks/useMusic";
import { useAuth } from "@/hooks/useAuth";
import { MusicPlayer } from "@/components/MusicPlayer";
import { Trash2, Plus, Play, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { StorageFileSelector } from "@/components/StorageFileSelector";

const THEMES: { label: string; value: Theme }[] = [
  { label: "Default/Oxygen", value: "default" },
  { label: "Red", value: "red" },
  { label: "Yellow", value: "yellow" },
  { label: "Black/Dark", value: "black" },
  { label: "White/Light", value: "white" },
];

const FONTS: { label: string; value: FontOption }[] = [
  { label: "Indie Flower", value: "default" },
  { label: "Poppins", value: "poppins" },
  { label: "Roboto", value: "roboto" },
  { label: "Playfair Display", value: "playfair-display" },
  { label: "Plex Mono", value: "ibm-plex-mono" },
];

export default function Customize() {
    const { theme, setTheme, useGradient, setUseGradient } = useTheme();
  const { font, setFont } = useFont();
  const { session } = useAuth();
  const { toast } = useToast();
  const {
    playlist,
    currentTrack,
    shuffle,
    addTrack,
    removeTrack,
    toggleShuffle,
    playTrack,
  } = useMusic();

  const handleAddTrack = (track: PlaylistTrack) => {
    const alreadyInPlaylist = playlist.some(
      (t) => t.fileName === track.fileName
    );
    if (!alreadyInPlaylist) {
      addTrack(track);
      toast({
        title: "Success",
        description: `Added "${track.name}" to playlist`,
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
          <h2 className="text-xl font-semibold mb-4 text-foreground">Appearance</h2>

          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <div>
              <label className="text-foreground font-medium block">Use gradient</label>
              <p className="text-sm text-muted-foreground">Apply a gradient background based on your theme</p>
            </div>
            <button
              onClick={() => setUseGradient(!useGradient)}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                useGradient
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {useGradient ? "Enabled" : "Disabled"}
            </button>
          </div>

          <h3 className="text-lg font-medium mb-3 text-foreground">Theme Color</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {THEMES.map((themeOption) => (
              <button
                key={themeOption.value}
                onClick={() => setTheme(themeOption.value)}
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
          <h2 className="text-xl font-semibold mb-4 text-foreground">Music Playlist</h2>

          {/* Music Player */}
          <div className="mb-6">
            <MusicPlayer />
          </div>

          {/* Shuffle Toggle */}
          <div className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center justify-between">
            <label className="text-foreground font-medium">Shuffle</label>
            <button
              onClick={() => toggleShuffle(!shuffle)}
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
            <h3 className="text-lg font-semibold text-foreground">Current Playlist</h3>
            {playlist.length === 0 ? (
              <p className="text-muted-foreground">Your playlist is empty. Add tracks below.</p>
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
                      <p className="font-medium text-foreground">
                        {track.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {track.fileName}
                      </p>
                    </div>
                    <button onClick={() => playTrack(track)} className="p-2 hover:bg-primary/20 rounded-lg text-primary transition-colors mr-2"><Play className="w-4 h-4" /></button>
                    <button
                      onClick={() => handleRemoveTrack(track.fileName)}
                      className="p-2 hover:bg-destructive/20 rounded-lg text-destructive transition-colors"
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
            <h3 className="text-lg font-semibold mb-3 text-foreground">Add from Storage</h3>
            <StorageFileSelector
              allowedTypes={["audio"]}
              onSelect={(file) => {
                const track: PlaylistTrack = {
                  id: file.id,
                  fileName: file.name,
                  name: file.name.split('/').pop()?.replace(/\.[^/.]+$/, "") || file.name,
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
