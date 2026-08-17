import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageOption,
  LanguageOption,
} from "@/lib/languages";
import { getTranslation, TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export interface LanguageContextType {
  language: string;
  languageCode: string;
  currentOption: LanguageOption;
  languageOption: LanguageOption;
  supportedLanguages: readonly LanguageOption[];
  setLanguage: (newLanguage: string) => Promise<void>;
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>,
    defaultVal?: string,
  ) => string;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const { session } = useAuth();
  const [language, setLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem("preferred_language") || DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const currentOption = useMemo(() => getLanguageOption(language), [language]);

  // Sync document <html lang="..."> attribute
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = currentOption.code || "en";
    }
  }, [currentOption]);

  // Load language preference from user profile on auth change
  useEffect(() => {
    let isMounted = true;

    const loadUserLanguage = async () => {
      if (!session?.user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("language")
          .eq("user_id", session.user.id)
          .single();

        if (!error && data?.language && isMounted) {
          const opt = getLanguageOption(data.language);
          setLanguageState(opt.name);
          try {
            localStorage.setItem("preferred_language", opt.name);
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load user language preference:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadUserLanguage();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  const setLanguage = useCallback(
    async (newLang: string) => {
      const option = getLanguageOption(newLang);
      setLanguageState(option.name);

      try {
        localStorage.setItem("preferred_language", option.name);
      } catch {
        // Ignore localStorage errors
      }

      if (session?.user?.id) {
        try {
          await supabase.from("profiles").upsert({
            user_id: session.user.id,
            language: option.name,
          });
        } catch (err) {
          console.error("Failed to persist language preference:", err);
        }
      }
    },
    [session?.user?.id],
  );

  const t = useCallback(
    (
      key: TranslationKey,
      params?: Record<string, string | number>,
      defaultVal?: string,
    ) => {
      return getTranslation(language, key, params, defaultVal);
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language: currentOption.name,
      languageCode: currentOption.code,
      currentOption,
      languageOption: currentOption,
      supportedLanguages: SUPPORTED_LANGUAGES,
      setLanguage,
      t,
      isLoading,
    }),
    [currentOption, setLanguage, t, isLoading],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return fallback context if used outside provider (e.g. in standalone tests)
    const currentOption = getLanguageOption(DEFAULT_LANGUAGE);
    return {
      language: currentOption.name,
      languageCode: currentOption.code,
      currentOption,
      languageOption: currentOption,
      supportedLanguages: SUPPORTED_LANGUAGES,
      setLanguage: async () => {},
      t: (key: TranslationKey, params?: any, defaultVal?: string) =>
        getTranslation(DEFAULT_LANGUAGE, key, params, defaultVal),
      isLoading: false,
    };
  }
  return context;
}

export function useTranslation() {
  const { t, language, languageCode, currentOption, languageOption, setLanguage } = useLanguage();
  return { t, language, languageCode, currentOption, languageOption, setLanguage };
}
