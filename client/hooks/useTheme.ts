import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

export type Theme = "default" | "red" | "yellow" | "black" | "white";

export const useTheme = () => {
  const { session } = useAuth();
  const [theme, setThemeState] = useState<Theme>("default");
  const [isLoading, setIsLoading] = useState(true);

  // Load theme from Supabase
  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const loadTheme = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("theme")
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedTheme = (data?.theme as Theme) || "default";
        setThemeState(loadedTheme);
        applyTheme(loadedTheme);
      } catch (error) {
        console.error("Failed to load theme:", error);
        applyTheme("default");
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, [session?.user?.id]);

  const applyTheme = (newTheme: Theme) => {
    document.documentElement.classList.remove(
      "theme-red",
      "theme-yellow",
      "theme-black",
      "theme-white"
    );
    if (newTheme !== "default") {
      document.documentElement.classList.add(`theme-${newTheme}`);
    }
  };

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      if (!session?.user?.id) return;

      setThemeState(newTheme);
      applyTheme(newTheme);

      try {
        const { error } = await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_theme: newTheme,
        });

        if (error) throw error;
      } catch (error) {
        console.error("Failed to save theme:", error);
        // Revert to previous theme on error
        setThemeState((prev) => prev);
      }
    },
    [session?.user?.id]
  );

  return { theme, setTheme, isLoading };
};
