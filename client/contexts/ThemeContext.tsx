import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { supabase, getAuthenticatedClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type Theme = "default" | "red" | "yellow" | "black" | "white";

const VALID_FONTS = [
  "font-indie",
  "font-zilla",
  "font-vt323",
  "font-cabin",
  "font-londrina",
];

interface ThemeContextType {
  theme: Theme;
  font: string;
  useGradient: boolean;
  backgroundImagePath: string | null;
  backgroundImageUrl: string | null;
  lastModelId: string | null;
  lastProvider: string | null;
  setTheme: (theme: Theme) => Promise<void>;
  setFont: (font: string) => Promise<void>;
  setUseGradient: (useGradient: boolean) => Promise<void>;
  setBackgroundImage: (path: string | null) => Promise<void>;
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
  const [backgroundImagePath, setBackgroundImagePathState] = useState<
    string | null
  >(null);
  const [backgroundImageUrl, setBackgroundImageUrlState] = useState<
    string | null
  >(null);
  const [lastModelId, setLastModelId] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyTheme = useCallback(
    (newTheme: Theme, gradient: boolean, hasImage: boolean) => {
      // Remove all theme classes
      document.documentElement.classList.remove(
        "theme-red",
        "theme-yellow",
        "theme-black",
        "theme-white",
        "use-gradient",
        "use-background-image",
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

      if (gradient && !hasImage) {
        document.documentElement.classList.add("use-gradient");
      }

      if (hasImage) {
        document.documentElement.classList.add("use-background-image");
      }
    },
    [],
  );

  const applyFont = useCallback((newFont: string) => {
    // Remove all font classes
    document.documentElement.classList.remove(...VALID_FONTS);

    // Validate and add the new font class
    const validatedFont = VALID_FONTS.includes(newFont)
      ? newFont
      : "font-indie";
    document.documentElement.classList.add(validatedFont);
  }, []);

  const getSignedUrl = useCallback(async (path: string) => {
    try {
      const safePath = path.replace(/\.\.\//g, "");
      const { data, error } = await supabase.storage
        .from("Storage")
        .createSignedUrl(safePath, 60 * 60 * 24); // 24 hours
      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error("Failed to get signed URL for background image:", error);
      return null;
    }
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
        setBackgroundImagePathState(null);
        setBackgroundImageUrlState(null);
        setLastModelId(null);
        setLastProvider(null);
        applyTheme(initialTheme, initialGradient, false);
        applyFont(initialFont);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const client = getAuthenticatedClient(session.access_token);
        const { data, error } = await client
          .from("user_preferences")
          .select(
            "theme, font, use_gradient, last_model_id, last_provider, background_image_path",
          )
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedTheme = (data?.theme as Theme) || "default";
        const loadedFont =
          data?.font && VALID_FONTS.includes(data.font)
            ? data.font
            : "font-indie";
        const loadedGradient = data?.use_gradient ?? true;
        const loadedModelId = data?.last_model_id || null;
        const loadedProvider = data?.last_provider || null;
        const loadedImagePath = data?.background_image_path || null;

        let loadedImageUrl = null;
        if (loadedImagePath) {
          loadedImageUrl = await getSignedUrl(loadedImagePath);
        }

        setThemeState(loadedTheme);
        setFontState(loadedFont);
        setUseGradientState(loadedGradient);
        setBackgroundImagePathState(loadedImagePath);
        setBackgroundImageUrlState(loadedImageUrl);
        setLastModelId(loadedModelId);
        setLastProvider(loadedProvider);
        applyTheme(loadedTheme, loadedGradient, !!loadedImagePath);
        applyFont(loadedFont);
      } catch (error) {
        console.error("Failed to load preferences:", error);
        // Keep defaults on error
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [
    session?.user?.id,
    session?.access_token,
    applyTheme,
    applyFont,
    getSignedUrl,
  ]);

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme, useGradient, !!backgroundImagePath);

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_theme: newTheme,
          });
        } catch (error) {
          console.error("Failed to save theme:", error);
        }
      }
    },
    [
      session?.user?.id,
      session?.access_token,
      useGradient,
      backgroundImagePath,
      applyTheme,
    ],
  );

  const setFont = useCallback(
    async (newFont: string) => {
      const validatedFont = VALID_FONTS.includes(newFont)
        ? newFont
        : "font-indie";
      setFontState(validatedFont);
      applyFont(validatedFont);

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_font: validatedFont,
          });
        } catch (error) {
          console.error("Failed to save font:", error);
        }
      }
    },
    [session?.user?.id, session?.access_token, applyFont],
  );

  const setUseGradient = useCallback(
    async (newGradient: boolean) => {
      setUseGradientState(newGradient);
      applyTheme(theme, newGradient, !!backgroundImagePath);

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_use_gradient: newGradient,
          });
        } catch (error) {
          console.error("Failed to save gradient preference:", error);
        }
      }
    },
    [
      session?.user?.id,
      session?.access_token,
      theme,
      backgroundImagePath,
      applyTheme,
    ],
  );

  const setBackgroundImage = useCallback(
    async (path: string | null) => {
      setBackgroundImagePathState(path);

      let url = null;
      if (path) {
        url = await getSignedUrl(path);
      }
      setBackgroundImageUrlState(url);

      // Automatically disable gradient if setting an image
      const newGradient = path ? false : useGradient;
      if (path) {
        setUseGradientState(false);
      }

      applyTheme(theme, newGradient, !!path);

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_background_image_path: path,
            p_use_gradient: newGradient,
          });
        } catch (error) {
          console.error("Failed to save background image preference:", error);
        }
      }
    },
    [
      session?.user?.id,
      session?.access_token,
      theme,
      useGradient,
      getSignedUrl,
      applyTheme,
    ],
  );

  const setModelPreference = useCallback(
    async (modelId: string, provider: string) => {
      setLastModelId(modelId);
      setLastProvider(provider);

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_last_model_id: modelId,
            p_last_provider: provider,
          });
        } catch (error) {
          console.error("Failed to save model preference:", error);
        }
      }
    },
    [session?.user?.id, session?.access_token],
  );

  const contextValue = useMemo(
    () => ({
      theme,
      font,
      useGradient,
      backgroundImagePath,
      backgroundImageUrl,
      lastModelId,
      lastProvider,
      setTheme,
      setFont,
      setUseGradient,
      setBackgroundImage,
      setModelPreference,
      isLoading,
    }),
    [
      theme,
      font,
      useGradient,
      backgroundImagePath,
      backgroundImageUrl,
      lastModelId,
      lastProvider,
      setTheme,
      setFont,
      setUseGradient,
      setBackgroundImage,
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
