import { useState } from "react";
import Layout from "@/components/Layout";
import { useTheme } from "@/contexts/ThemeContext";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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
  const { session } = useAuth();
  const { toast } = useToast();

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
                className={cn(
                  "p-4 rounded-lg border-2 transition-all font-medium text-sm",
                  fontOption.value,
                  font === fontOption.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                )}
              >
                {fontOption.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
