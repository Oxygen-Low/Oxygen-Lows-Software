import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { db, getAuthenticatedClient } from "@/lib/db";
import { storage } from "@/lib/storage";
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

export interface ThemeContextType {
  theme: Theme;
  font: string;
  useGradient: boolean;
  lastModelId: string | null;
  lastProvider: string | null;
  chatbotDefaultModel: string | null;
  chatbotDefaultProvider: string | null;
  researchAgentDefaultModel: string | null;
  researchAgentDefaultProvider: string | null;
  researchSummarizerDefaultModel: string | null;
  researchSummarizerDefaultProvider: string | null;
  setTheme: (theme: Theme) => Promise<void>;
  setFont: (font: string) => Promise<void>;
  setUseGradient: (useGradient: boolean) => Promise<void>;
  setModelPreference: (modelId: string, provider: string) => Promise<void>;
  setChatbotDefault: (modelId: string, provider: string) => Promise<void>;
  setResearchAgentDefault: (modelId: string, provider: string) => Promise<void>;
  setResearchSummarizerDefault: (
    modelId: string,
    provider: string,
  ) => Promise<void>;
  isLoading: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
);

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
  const [font, setFontState] = useState<string>("font-zilla");
  const [useGradient, setUseGradientState] = useState<boolean>(true);
  const [lastModelId, setLastModelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("last_model_id") || null;
    } catch {
      return null;
    }
  });
  const [lastProvider, setLastProvider] = useState<string | null>(() => {
    try {
      return localStorage.getItem("last_provider") || null;
    } catch {
      return null;
    }
  });
  const [chatbotDefaultModel, setChatbotDefaultModelState] = useState<
    string | null
  >(() => {
    try {
      return (
        localStorage.getItem("chatbot_default_model") ||
        localStorage.getItem("last_model_id") ||
        null
      );
    } catch {
      return null;
    }
  });
  const [chatbotDefaultProvider, setChatbotDefaultProviderState] = useState<
    string | null
  >(() => {
    try {
      return (
        localStorage.getItem("chatbot_default_provider") ||
        localStorage.getItem("last_provider") ||
        null
      );
    } catch {
      return null;
    }
  });
  const [researchAgentDefaultModel, setResearchAgentDefaultModelState] =
    useState<string | null>(() => {
      try {
        return localStorage.getItem("research_agent_default_model") || null;
      } catch {
        return null;
      }
    });
  const [researchAgentDefaultProvider, setResearchAgentDefaultProviderState] =
    useState<string | null>(() => {
      try {
        return localStorage.getItem("research_agent_default_provider") || null;
      } catch {
        return null;
      }
    });
  const [
    researchSummarizerDefaultModel,
    setResearchSummarizerDefaultModelState,
  ] = useState<string | null>(() => {
    try {
      return localStorage.getItem("research_summarizer_default_model") || null;
    } catch {
      return null;
    }
  });
  const [
    researchSummarizerDefaultProvider,
    setResearchSummarizerDefaultProviderState,
  ] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem("research_summarizer_default_provider") || null
      );
    } catch {
      return null;
    }
  });
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
          let path = fileName;
          let previous: string;
          do {
            previous = path;
            path = path
              .replace(/\\/g, "/")
              .replace(/\.\.\//g, "")
              .replace(/^\/+/, "");
          } while (path !== previous);

          const UUID_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

          if (path.startsWith(sessionUserId + "/")) {
            const afterUser = path.slice(sessionUserId.length + 1);
            if (UUID_REGEX.test(afterUser)) {
              path = `${sessionUserId}/${afterUser.replace(UUID_REGEX, "")}`;
            }
          } else if (UUID_REGEX.test(path)) {
            const subPath = path.replace(UUID_REGEX, "");
            path = `${sessionUserId}/${subPath}`;
          } else {
            path = `${sessionUserId}/${path}`;
          }

          if (path.includes('..')) {
            throw new Error('Invalid path');
          }

          const { data } = await storage
            .from("Storage")
            .createSignedUrl(path, 3600);

          if (data?.signedUrl) {
            const style = document.createElement("style");
            style.id = "custom-font-style";
            style.textContent = `
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
          document.documentElement.classList.add("font-zilla");
        }
      } else {
        // Validate and add the new font class
        const validatedFont = VALID_FONTS.includes(newFont)
          ? newFont
          : "font-zilla";
        document.documentElement.classList.add(validatedFont);
      }
    },
    [],
  );

  // Load preferences from Supabase
  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) {
        // Use defaults for non-auth with localStorage fallback
        const initialTheme = "default";
        const initialFont = "font-zilla";
        const initialGradient = true;

        setThemeState(initialTheme);
        setFontState(initialFont);
        setUseGradientState(initialGradient);

        try {
          const lModel = localStorage.getItem("last_model_id") || null;
          const lProv = localStorage.getItem("last_provider") || null;
          const cModel =
            localStorage.getItem("chatbot_default_model") || lModel;
          const cProv =
            localStorage.getItem("chatbot_default_provider") || lProv;
          const rModel =
            localStorage.getItem("research_agent_default_model") || null;
          const rProv =
            localStorage.getItem("research_agent_default_provider") || null;
          const sModel =
            localStorage.getItem("research_summarizer_default_model") || null;
          const sProv =
            localStorage.getItem("research_summarizer_default_provider") ||
            null;

          setLastModelId(lModel);
          setLastProvider(lProv);
          setChatbotDefaultModelState(cModel);
          setChatbotDefaultProviderState(cProv);
          setResearchAgentDefaultModelState(rModel);
          setResearchAgentDefaultProviderState(rProv);
          setResearchSummarizerDefaultModelState(sModel);
          setResearchSummarizerDefaultProviderState(sProv);
        } catch {}

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
          .select(
            "theme, font, use_gradient, last_model_id, last_provider, chatbot_default_model, chatbot_default_provider, research_agent_default_model, research_agent_default_provider, research_summarizer_default_model, research_summarizer_default_provider",
          )
          .eq("user_id", session.user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        const loadedTheme = (data?.theme as Theme) || "default";
        const loadedFont = data?.font || "font-zilla";
        const loadedGradient = data?.use_gradient ?? true;
        const loadedModelId =
          data?.last_model_id || data?.chatbot_default_model || null;
        const loadedProvider =
          data?.last_provider || data?.chatbot_default_provider || null;
        const loadedChatbotModel = data?.chatbot_default_model || loadedModelId;
        const loadedChatbotProvider =
          data?.chatbot_default_provider || loadedProvider;
        const loadedResearchAgentModel =
          data?.research_agent_default_model || null;
        const loadedResearchAgentProvider =
          data?.research_agent_default_provider || null;
        const loadedResearchSummarizerModel =
          data?.research_summarizer_default_model || null;
        const loadedResearchSummarizerProvider =
          data?.research_summarizer_default_provider || null;

        setThemeState(loadedTheme);
        setFontState(loadedFont);
        setUseGradientState(loadedGradient);
        setLastModelId(loadedModelId);
        setLastProvider(loadedProvider);
        setChatbotDefaultModelState(loadedChatbotModel);
        setChatbotDefaultProviderState(loadedChatbotProvider);
        setResearchAgentDefaultModelState(loadedResearchAgentModel);
        setResearchAgentDefaultProviderState(loadedResearchAgentProvider);
        setResearchSummarizerDefaultModelState(loadedResearchSummarizerModel);
        setResearchSummarizerDefaultProviderState(
          loadedResearchSummarizerProvider,
        );

        // Mirror to localStorage
        try {
          if (loadedModelId)
            localStorage.setItem("last_model_id", loadedModelId);
          if (loadedProvider)
            localStorage.setItem("last_provider", loadedProvider);
          if (loadedChatbotModel)
            localStorage.setItem("chatbot_default_model", loadedChatbotModel);
          if (loadedChatbotProvider)
            localStorage.setItem(
              "chatbot_default_provider",
              loadedChatbotProvider,
            );
          if (loadedResearchAgentModel)
            localStorage.setItem(
              "research_agent_default_model",
              loadedResearchAgentModel,
            );
          if (loadedResearchAgentProvider)
            localStorage.setItem(
              "research_agent_default_provider",
              loadedResearchAgentProvider,
            );
          if (loadedResearchSummarizerModel)
            localStorage.setItem(
              "research_summarizer_default_model",
              loadedResearchSummarizerModel,
            );
          if (loadedResearchSummarizerProvider)
            localStorage.setItem(
              "research_summarizer_default_provider",
              loadedResearchSummarizerProvider,
            );
        } catch {}

        applyTheme(loadedTheme, loadedGradient);
        applyFont(loadedFont, session.user.id);
      } catch (error) {
        console.error("Failed to load preferences:", error);
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
      let validatedFont = "font-zilla";
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
      setChatbotDefaultModelState(modelId);
      setChatbotDefaultProviderState(provider);

      try {
        localStorage.setItem("last_model_id", modelId);
        localStorage.setItem("last_provider", provider);
        localStorage.setItem("chatbot_default_model", modelId);
        localStorage.setItem("chatbot_default_provider", provider);
      } catch {}

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_last_model_id: modelId,
            p_last_provider: provider,
            p_chatbot_default_model: modelId,
            p_chatbot_default_provider: provider,
          });
        } catch (error) {
          console.error("Failed to save model preference:", error);
        }
      }
    },
    [session?.user?.id, session?.access_token],
  );

  const setChatbotDefault = useCallback(
    async (modelId: string, provider: string) => {
      setChatbotDefaultModelState(modelId);
      setChatbotDefaultProviderState(provider);
      setLastModelId(modelId);
      setLastProvider(provider);

      try {
        localStorage.setItem("chatbot_default_model", modelId);
        localStorage.setItem("chatbot_default_provider", provider);
        localStorage.setItem("last_model_id", modelId);
        localStorage.setItem("last_provider", provider);
      } catch {}

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_chatbot_default_model: modelId,
            p_chatbot_default_provider: provider,
            p_last_model_id: modelId,
            p_last_provider: provider,
          });
        } catch (error) {
          console.error("Failed to save chatbot default model:", error);
        }
      }
    },
    [session?.user?.id, session?.access_token],
  );

  const setResearchAgentDefault = useCallback(
    async (modelId: string, provider: string) => {
      setResearchAgentDefaultModelState(modelId);
      setResearchAgentDefaultProviderState(provider);

      try {
        localStorage.setItem("research_agent_default_model", modelId);
        localStorage.setItem("research_agent_default_provider", provider);
      } catch {}

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_research_agent_default_model: modelId,
            p_research_agent_default_provider: provider,
          });
        } catch (error) {
          console.error("Failed to save research agent default model:", error);
        }
      }
    },
    [session?.user?.id, session?.access_token],
  );

  const setResearchSummarizerDefault = useCallback(
    async (modelId: string, provider: string) => {
      setResearchSummarizerDefaultModelState(modelId);
      setResearchSummarizerDefaultProviderState(provider);

      try {
        localStorage.setItem("research_summarizer_default_model", modelId);
        localStorage.setItem("research_summarizer_default_provider", provider);
      } catch {}

      if (session?.user?.id) {
        try {
          const client = getAuthenticatedClient(session.access_token);
          await client.rpc("upsert_user_preferences", {
            p_user_id: session.user.id,
            p_research_summarizer_default_model: modelId,
            p_research_summarizer_default_provider: provider,
          });
        } catch (error) {
          console.error(
            "Failed to save research summarizer default model:",
            error,
          );
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
      chatbotDefaultModel,
      chatbotDefaultProvider,
      researchAgentDefaultModel,
      researchAgentDefaultProvider,
      researchSummarizerDefaultModel,
      researchSummarizerDefaultProvider,
      setTheme,
      setFont,
      setUseGradient,
      setModelPreference,
      setChatbotDefault,
      setResearchAgentDefault,
      setResearchSummarizerDefault,
      isLoading,
    }),
    [
      theme,
      font,
      useGradient,
      lastModelId,
      lastProvider,
      chatbotDefaultModel,
      chatbotDefaultProvider,
      researchAgentDefaultModel,
      researchAgentDefaultProvider,
      researchSummarizerDefaultModel,
      researchSummarizerDefaultProvider,
      setTheme,
      setFont,
      setUseGradient,
      setModelPreference,
      setChatbotDefault,
      setResearchAgentDefault,
      setResearchSummarizerDefault,
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
