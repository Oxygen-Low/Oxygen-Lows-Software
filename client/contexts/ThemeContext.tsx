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

// Allow custom string which can be "custom:<primaryHex>-<backgroundHex>"
export type Theme = "default" | "red" | "yellow" | "black" | "white" | string;

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

export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  let r = 0,
    g = 0,
    b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function adjustLightness(
  hsl: { h: number; s: number; l: number },
  amount: number,
) {
  return `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(0, Math.min(100, hsl.l + amount))}%)`;
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
      "use-background-image",
      "dark",
      "theme-custom",
    );

    // Clean up previous custom styles
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--primary-foreground");
    document.documentElement.style.removeProperty("--ring");
    document.documentElement.style.removeProperty("--background");
    document.documentElement.style.removeProperty("--foreground");
    document.documentElement.style.removeProperty("--theme-gradient");

    if (newTheme.startsWith("custom:")) {
      document.documentElement.classList.add("theme-custom");
      document.documentElement.classList.add("dark");

      const colorsStr = newTheme.replace("custom:", "");
      const [primaryHex, bgHex] = colorsStr.split("-");

      if (primaryHex) {
        const hsl = hexToHSL(primaryHex);
        const hslString = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
        document.documentElement.style.setProperty("--primary", hslString);
        document.documentElement.style.setProperty("--ring", hslString);
        // Set foreground for primary
        document.documentElement.style.setProperty(
          "--primary-foreground",
          hsl.l > 50 ? "0 0% 0%" : "0 0% 100%",
        );
      }

      if (bgHex) {
        const bgHsl = hexToHSL(bgHex);
        const bgHslString = `${bgHsl.h} ${bgHsl.s}% ${bgHsl.l}%`;
        document.documentElement.style.setProperty("--background", bgHslString);
        // Calculate a gradient if enabled
        if (gradient) {
          const darkerBg = adjustLightness(bgHsl, -10);
          const normalBg = `hsl(${bgHsl.h}, ${bgHsl.s}%, ${bgHsl.l}%)`;
          document.documentElement.style.setProperty(
            "--theme-gradient",
            `linear-gradient(135deg, ${darkerBg} 0%, ${normalBg} 50%, ${darkerBg} 100%)`,
          );
        }
      }
    } else {
      // Add the new theme class if not default
      if (newTheme !== "default") {
        document.documentElement.classList.add(`theme-${newTheme}`);
      }

      // Add dark class for all themes except white
      if (newTheme !== "white") {
        document.documentElement.classList.add("dark");
      }
    }

    if (gradient) {
      document.documentElement.classList.add("use-gradient");
    }
  }, []);

  const applyFont = useCallback(
    async (newFont: string, sessionUserId?: string) => {
      // Remove all standard font classes
      document.documentElement.classList.remove(...VALID_FONTS, "font-custom");

      // Remove old custom font style if exists
      const existingStyle = document.getElementById("custom-font-style");
      if (existingStyle) {
        existingStyle.remove();
      }
      document.documentElement.style.removeProperty("--font-family");

      if (newFont.startsWith("font-custom:") && sessionUserId) {
        const fileName = newFont.replace("font-custom:", "");
        try {
          let path = fileName.startsWith(sessionUserId + "/")
            ? fileName
            : `${sessionUserId}/${fileName}`;
          path = path.replace(/\.\.\//g, "");
          const { data } = await supabase.storage
            .from("Storage")
            .createSignedUrl(path, 3600);

          if (data?.signedUrl) {
            const style = document.createElement("style");
            style.id = "custom-font-style";
            style.innerHTML = `
            @font-face {
              font-family: 'CustomUserFont';
              src: url('${data.signedUrl}');
            }
          `;
            document.head.appendChild(style);
            document.documentElement.style.setProperty(
              "--font-family",
              "'CustomUserFont'",
            );
            document.documentElement.classList.add("font-custom");
          }
        } catch (error) {
          console.error("Failed to load custom font", error);
          document.documentElement.classList.add("font-indie");
        }
      } else {
        // Validate and add the new font class
        const validatedFont = VALID_FONTS.includes(newFont)
          ? newFont
          : "font-indie";
        document.documentElement.classList.add(validatedFont);
      }
    },
    [],
  );

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
        const client = getAuthenticatedClient(session.access_token);
        const { data, error } = await client
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
        applyFont(loadedFont, session.user.id);
      } catch (error) {
        console.error("Failed to load preferences:", error);
        // Keep defaults on error
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [session?.user?.id, session?.access_token, applyTheme, applyFont]);

  const setTheme = useCallback(
    async (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme, useGradient);

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
    [session?.user?.id, session?.access_token, useGradient, applyTheme],
  );

  const setFont = useCallback(
    async (newFont: string) => {
      let validatedFont = "font-indie";
      if (newFont.startsWith("font-custom:")) {
        validatedFont = newFont;
      } else if (VALID_FONTS.includes(newFont)) {
        validatedFont = newFont;
      }
      setFontState(validatedFont);
      applyFont(validatedFont, session?.user?.id);

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
      applyTheme(theme, newGradient);

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
    [session?.user?.id, session?.access_token, theme, applyTheme],
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
