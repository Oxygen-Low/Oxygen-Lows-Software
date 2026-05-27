import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type Theme = "default" | "red" | "yellow" | "black" | "white";

interface ThemeContextType {
  theme: Theme;
  useGradient: boolean;
  setTheme: (theme: Theme) => Promise<void>;
  setUseGradient: (useGradient: boolean) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const { session } = useAuth();
  const [theme, setThemeState] = useState<Theme>("default");
  const [useGradient, setUseGradientState] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);

  const applyTheme = useCallback((newTheme: Theme, gradient: boolean) => {
    // Remove all theme classes
    document.documentElement.classList.remove(
      "theme-red",
      "theme-yellow",
      "theme-black",
      "theme-white",
      "use-gradient",
      "dark"
    );

    // Add the new theme class if not default
    if (newTheme !== "default") {
      document.documentElement.classList.add(`theme-${newTheme}`);
    }

    // Add dark class for all themes except white
    if (newTheme !== "white") {
      document.documentElement.classList.add("dark");
    }

    if (gradient) {
      document.documentElement.classList.add("use-gradient");
    }
  }, []);

  // Load preferences from Supabase
  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) {
        // Load from localStorage as fallback or for non-auth
        const savedTheme = localStorage.getItem("theme") as Theme | null;
        const savedGradient = localStorage.getItem("useGradient");

        const initialTheme = savedTheme || "default";
        const initialGradient = savedGradient === null ? true : savedGradient === "true";

        setThemeState(initialTheme);
        setUseGradientState(initialGradient);
        applyTheme(initialTheme, initialGradient);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("theme, use_gradient")
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedTheme = (data?.theme as Theme) || "default";
        const loadedGradient = data?.use_gradient ?? true;

        setThemeState(loadedTheme);
        setUseGradientState(loadedGradient);
        applyTheme(loadedTheme, loadedGradient);
      } catch (error) {
        console.error("Failed to load preferences:", error);
        // Fallback to local storage if available
        const savedTheme = (localStorage.getItem("theme") as Theme) || "default";
        const savedGradient = localStorage.getItem("useGradient") !== "false";
        applyTheme(savedTheme, savedGradient);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [session?.user?.id, applyTheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme, useGradient);

    if (session?.user?.id) {
      try {
        await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_theme: newTheme,
          p_use_gradient: useGradient
        });
      } catch (error) {
        console.error("Failed to save theme:", error);
      }
    }
  }, [session?.user?.id, useGradient, applyTheme]);

  const setUseGradient = useCallback(async (newGradient: boolean) => {
    setUseGradientState(newGradient);
    localStorage.setItem("useGradient", String(newGradient));
    applyTheme(theme, newGradient);

    if (session?.user?.id) {
      try {
        await supabase.rpc("upsert_user_preferences", {
          p_user_id: session.user.id,
          p_theme: theme,
          p_use_gradient: newGradient
        });
      } catch (error) {
        console.error("Failed to save gradient preference:", error);
      }
    }
  }, [session?.user?.id, theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, useGradient, setTheme, setUseGradient, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
