import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

export type FontOption =
  | "default"
  | "poppins"
  | "roboto"
  | "playfair-display"
  | "ibm-plex-mono";

const fontMapping: Record<FontOption, string> = {
  default: "'Indie Flower', ui-sans-serif, system-ui, sans-serif",
  poppins: "'Poppins', sans-serif",
  roboto: "'Roboto', sans-serif",
  "playfair-display": "'Playfair Display', serif",
  "ibm-plex-mono": "'IBM Plex Mono', monospace",
};

export const useFont = () => {
  const { session } = useAuth();
  const [font, setFontState] = useState<FontOption>("default");
  const [isLoading, setIsLoading] = useState(true);

  // Load font from Supabase
  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const loadFont = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("font")
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedFont = (data?.font as FontOption) || "default";
        setFontState(loadedFont);
        applyFont(loadedFont);
      } catch (error) {
        console.error("Failed to load font:", error);
        applyFont("default");
      } finally {
        setIsLoading(false);
      }
    };

    loadFont();
  }, [session?.user?.id]);

  const applyFont = (newFont: FontOption) => {
    const fontFamily = fontMapping[newFont];
    document.documentElement.style.setProperty("--font-sans", fontFamily);
  };

  const setFont = useCallback(
    async (newFont: FontOption) => {
      if (!session?.user?.id) return;

      setFontState(newFont);
      applyFont(newFont);

      try {
        const { error } = await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_font: newFont,
        });

        if (error) throw error;
      } catch (error) {
        console.error("Failed to save font:", error);
        setFontState((prev) => prev);
      }
    },
    [session?.user?.id]
  );

  return { font, setFont, isLoading };
};
