export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  countryCode: string;
  nativeName?: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    countryCode: "gb",
    nativeName: "English",
  },
  {
    code: "ko",
    name: "Korean",
    flag: "🇰🇷",
    countryCode: "kr",
    nativeName: "한국어",
  },
  {
    code: "ja",
    name: "Japanese",
    flag: "🇯🇵",
    countryCode: "jp",
    nativeName: "日本語",
  },
  {
    code: "zh-CN",
    name: "Chinese (Simplified)",
    flag: "🇨🇳",
    countryCode: "cn",
    nativeName: "简体中文",
  },
  {
    code: "zh-TW",
    name: "Chinese (Traditional)",
    flag: "🇹🇼",
    countryCode: "tw",
    nativeName: "繁體中文",
  },
  {
    code: "ru",
    name: "Russian",
    flag: "🇷🇺",
    countryCode: "ru",
    nativeName: "Русский",
  },
  {
    code: "fr",
    name: "French",
    flag: "🇫🇷",
    countryCode: "fr",
    nativeName: "Français",
  },
  {
    code: "de",
    name: "German",
    flag: "🇩🇪",
    countryCode: "de",
    nativeName: "Deutsch",
  },
  {
    code: "es",
    name: "Spanish",
    flag: "🇪🇸",
    countryCode: "es",
    nativeName: "Español",
  },
  {
    code: "it",
    name: "Italian",
    flag: "🇮🇹",
    countryCode: "it",
    nativeName: "Italiano",
  },
  {
    code: "pt",
    name: "Portuguese",
    flag: "🇵🇹",
    countryCode: "pt",
    nativeName: "Português",
  },
  {
    code: "nl",
    name: "Dutch",
    flag: "🇳🇱",
    countryCode: "nl",
    nativeName: "Nederlands",
  },
  {
    code: "pl",
    name: "Polish",
    flag: "🇵🇱",
    countryCode: "pl",
    nativeName: "Polski",
  },
  {
    code: "tr",
    name: "Turkish",
    flag: "🇹🇷",
    countryCode: "tr",
    nativeName: "Türkçe",
  },
  {
    code: "vi",
    name: "Vietnamese",
    flag: "🇻🇳",
    countryCode: "vn",
    nativeName: "Tiếng Việt",
  },
  {
    code: "id",
    name: "Indonesian",
    flag: "🇮🇩",
    countryCode: "id",
    nativeName: "Bahasa Indonesia",
  },
  {
    code: "hi",
    name: "Hindi",
    flag: "🇮🇳",
    countryCode: "in",
    nativeName: "हिन्दी",
  },
  {
    code: "bn",
    name: "Bengali",
    flag: "🇧🇩",
    countryCode: "bd",
    nativeName: "বাংলা",
  },
  {
    code: "ro",
    name: "Romanian",
    flag: "🇷🇴",
    countryCode: "ro",
    nativeName: "Română",
  },
  {
    code: "ar",
    name: "Arabic",
    flag: "🇸🇦",
    countryCode: "sa",
    nativeName: "العربية",
  },
  {
    code: "cs",
    name: "Czech",
    flag: "🇨🇿",
    countryCode: "cz",
    nativeName: "Čeština",
  },
  {
    code: "zu",
    name: "Zulu",
    flag: "🇿🇦",
    countryCode: "za",
    nativeName: "isiZulu",
  },
  {
    code: "da",
    name: "Danish",
    flag: "🇩🇰",
    countryCode: "dk",
    nativeName: "Dansk",
  },
  {
    code: "la",
    name: "Latin",
    flag: "🇻🇦",
    countryCode: "va",
    nativeName: "Latina",
  },
  {
    code: "he",
    name: "Hebrew",
    flag: "🇮🇱",
    countryCode: "il",
    nativeName: "עברית",
  },
  {
    code: "uk",
    name: "Ukrainian",
    flag: "🇺🇦",
    countryCode: "ua",
    nativeName: "Українська",
  },
  {
    code: "ur",
    name: "Urdu",
    flag: "🇵🇰",
    countryCode: "pk",
    nativeName: "اردو",
  },
  {
    code: "fa",
    name: "Persian",
    flag: "🇮🇷",
    countryCode: "ir",
    nativeName: "فارسی",
  },
  {
    code: "pa",
    name: "Punjabi",
    flag: "🇮🇳",
    countryCode: "in",
    nativeName: "ਪੰਜਾਬੀ",
  },
] as const;

export const DEFAULT_LANGUAGE = "English";

const dynamicLanguages: LanguageOption[] = [];
let languageMapCache: Map<string, LanguageOption> | null = null;

export function registerLanguageOption(option: LanguageOption) {
  if (!dynamicLanguages.some((l) => l.code === option.code || l.name === option.name)) {
    dynamicLanguages.push(option);
    languageMapCache = null;
  }
}

/**
 * Returns FlagCDN flag image URL for a given 2-letter country code.
 */
export function getCountryFlagUrl(countryCode?: string | null, width: "w20" | "w40" | "w80" = "w40"): string {
  if (!countryCode || countryCode.length !== 2) return "";
  return `https://flagcdn.com/${width}/${countryCode.toLowerCase()}.png`;
}

/**
 * Find a supported language option by code, name, alias, or native name.
 * Falls back to the default language (English) if not found.
 */
export function getLanguageOption(value?: string | null): LanguageOption {
  if (!value) return SUPPORTED_LANGUAGES[0];
  const normalized = value.trim().toLowerCase();

  if (!languageMapCache) {
    languageMapCache = new Map<string, LanguageOption>();
    const all = [...SUPPORTED_LANGUAGES, ...dynamicLanguages];

    for (const l of all) {
      const name = l.name.toLowerCase();
      const code = l.code.toLowerCase();

      if (!languageMapCache.has(name)) languageMapCache.set(name, l);
      if (!languageMapCache.has(code)) languageMapCache.set(code, l);
      if (l.nativeName) {
        const nativeName = l.nativeName.toLowerCase();
        if (!languageMapCache.has(nativeName)) languageMapCache.set(nativeName, l);
      }
    }

    // Specific alias mappings
    const foundRo = languageMapCache.get("ro");
    if (foundRo) languageMapCache.set("romainian", foundRo);

    const foundZh = languageMapCache.get("zh-cn");
    if (foundZh) {
      languageMapCache.set("chinese", foundZh);
      languageMapCache.set("zh", foundZh);
      languageMapCache.set("simplified chinese", foundZh);
    }

    const foundZhTw = languageMapCache.get("zh-tw");
    if (foundZhTw) {
      languageMapCache.set("traditional chinese", foundZhTw);
    }
  }

  return languageMapCache.get(normalized) || SUPPORTED_LANGUAGES[0];
}

/**
 * Formats a language string with its corresponding flag emoji.
 * e.g., "🇬🇧 English"
 */
export function formatLanguageWithFlag(value?: string | null): string {
  const option = getLanguageOption(value);
  return `${option.flag} ${option.name}`;
}
