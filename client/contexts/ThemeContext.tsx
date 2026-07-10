import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type Theme = "default" | "red" | "yellow" | "black" | "white";

interface ThemeContextType {
  theme: Theme;
  font: string;
  useGradient: boolean;
  lastModelId: string | null;
  lastProvider: string | null;
  setTheme: (theme: Theme) => Promise<void>;
  setFont: (font: string) => Promise<void>;
  setUseGradient: (useGradient: boolean) => Promise<void>;
  setModelPreference: (modelId: string, provider: string) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const { session } = useAuth();
  const [theme, setThemeState] = useState<Theme>("default");
  const [font, setFontState] = useState<string>("font-indie");
  const [useGradient, setUseGradientState] = useState<boolean>(true);
  const [lastModelId, setLastModelId] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyTheme = useCallback((newTheme: Theme, gradient: boolean) => {
    // Remove all theme classes
    document.documentElement.classList.remove(
      "theme-red",
      "theme-yellow",
      "theme-black",
      "theme-white",
      "use-gradient",
      "dark",
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

  const applyFont = useCallback((newFont: string) => {
    // Remove all font classes
    document.documentElement.classList.remove(
      "font-indie",
      "font-zilla",
      "font-vt323",
      "font-cabin",
      "font-londrina",
    );

    // Add the new font class
    document.documentElement.classList.add(newFont);
  }, []);

  // Load preferences from Supabase
  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) {
        // Use defaults for non-auth
        const initialTheme = "default";
        const initialFont = "font-indie";
        const initialGradient = true;

        setThemeState(initialTheme);
        setFontState(initialFont);
        setUseGradientState(initialGradient);
        setLastModelId(null);
        setLastProvider(null);
        applyTheme(initialTheme, initialGradient);
        applyFont(initialFont);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("theme, font, use_gradient, last_model_id, last_provider")
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedTheme = (data?.theme as Theme) || "default";
        const loadedFont = data?.font || "font-indie";
        const loadedGradient = data?.use_gradient ?? true;
        const loadedModelId = data?.last_model_id || null;
        const loadedProvider = data?.last_provider || null;

        setThemeState(loadedTheme);
        setFontState(loadedFont);
        setUseGradientState(loadedGradient);
        setLastModelId(loadedModelId);
        setLastProvider(loadedProvider);
        applyTheme(loadedTheme, loadedGradient);
        applyFont(loadedFont);
      } catch (error) {
        console.error("Failed to load preferences:", error);
        // Keep defaults on error
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [session?.user?.id, applyTheme, applyFont]);

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme, useGradient);

      if (session?.user?.id) {
        try {
          await supabase.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_theme: newTheme,
            p_font: font,
            p_use_gradient: useGradient,
            p_last_model_id: lastModelId,
            p_last_provider: lastProvider,
          });
        } catch (error) {
          console.error("Failed to save theme:", error);
        }
      }
    },
    [
      session?.user?.id,
      font,
      useGradient,
      applyTheme,
      lastModelId,
      lastProvider,
    ],
  );

  const setFont = useCallback(
    async (newFont: string) => {
      setFontState(newFont);
      applyFont(newFont);

      if (session?.user?.id) {
        try {
          await supabase.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_theme: theme,
            p_font: newFont,
            p_use_gradient: useGradient,
            p_last_model_id: lastModelId,
            p_last_provider: lastProvider,
          });
        } catch (error) {
          console.error("Failed to save font:", error);
        }
      }
    },
    [
      session?.user?.id,
      theme,
      useGradient,
      applyFont,
      lastModelId,
      lastProvider,
    ],
  );

  const setUseGradient = useCallback(
    async (newGradient: boolean) => {
      setUseGradientState(newGradient);
      applyTheme(theme, newGradient);

      if (session?.user?.id) {
        try {
          await supabase.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_theme: theme,
            p_font: font,
            p_use_gradient: newGradient,
            p_last_model_id: lastModelId,
            p_last_provider: lastProvider,
          });
        } catch (error) {
          console.error("Failed to save gradient preference:", error);
        }
      }
    },
    [session?.user?.id, theme, font, applyTheme, lastModelId, lastProvider],
  );

  const setModelPreference = useCallback(
    async (modelId: string, provider: string) => {
      setLastModelId(modelId);
      setLastProvider(provider);

      if (session?.user?.id) {
        try {
          await supabase.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_theme: theme,
            p_font: font,
            p_use_gradient: useGradient,
            p_last_model_id: modelId,
            p_last_provider: provider,
          });
        } catch (error) {
          console.error("Failed to save model preference:", error);
        }
      }
    },
    [session?.user?.id, theme, font, useGradient],
  );

  const contextValue = useMemo(
    () => ({
      theme,
      font,
      useGradient,
      lastModelId,
      lastProvider,
      setTheme,
      setFont,
      setUseGradient,
      setModelPreference,
      isLoading,
    }),
    [
      theme,
      font,
      useGradient,
      lastModelId,
      lastProvider,
      setTheme,
      setFont,
      setUseGradient,
      setModelPreference,
      isLoading,
    ],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
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
