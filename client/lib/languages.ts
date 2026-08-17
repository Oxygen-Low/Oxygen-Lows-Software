export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  nativeName?: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    nativeName: "English",
  },
  {
    code: "ko",
    name: "Korean",
    flag: "🇰🇷",
    nativeName: "한국어",
  },
  {
    code: "ja",
    name: "Japanese",
    flag: "🇯🇵",
    nativeName: "日本語",
  },
  {
    code: "zh-CN",
    name: "Chinese (Simplified)",
    flag: "🇨🇳",
    nativeName: "简体中文",
  },
  {
    code: "zh-TW",
    name: "Chinese (Traditional)",
    flag: "🇹🇼",
    nativeName: "繁體中文",
  },
  {
    code: "ru",
    name: "Russian",
    flag: "🇷🇺",
    nativeName: "Русский",
  },
  {
    code: "fr",
    name: "French",
    flag: "🇫🇷",
    nativeName: "Français",
  },
  {
    code: "de",
    name: "German",
    flag: "🇩🇪",
    nativeName: "Deutsch",
  },
  {
    code: "es",
    name: "Spanish",
    flag: "🇪🇸",
    nativeName: "Español",
  },
  {
    code: "ro",
    name: "Romanian",
    flag: "🇷🇴",
    nativeName: "Română",
  },
  {
    code: "ar",
    name: "Arabic",
    flag: "🇸🇦",
    nativeName: "العربية",
  },
  {
    code: "cs",
    name: "Czech",
    flag: "🇨🇿",
    nativeName: "Čeština",
  },
  {
    code: "zu",
    name: "Zulu",
    flag: "🇿🇦",
    nativeName: "isiZulu",
  },
  {
    code: "da",
    name: "Danish",
    flag: "🇩🇰",
    nativeName: "Dansk",
  },
  {
    code: "la",
    name: "Latin",
    flag: "🇻🇦",
    nativeName: "Latina",
  },
  {
    code: "he",
    name: "Hebrew",
    flag: "🇮🇱",
    nativeName: "עברית",
  },
  {
    code: "uk",
    name: "Ukrainian",
    flag: "🇺🇦",
    nativeName: "Українська",
  },
] as const;

export const DEFAULT_LANGUAGE = "English";

const dynamicLanguages: LanguageOption[] = [];

export function registerLanguageOption(option: LanguageOption) {
  if (!dynamicLanguages.some((l) => l.code === option.code || l.name === option.name)) {
    dynamicLanguages.push(option);
  }
}

/**
 * Find a supported language option by code, name, alias, or native name.
 * Falls back to the default language (English) if not found.
 */
export function getLanguageOption(value?: string | null): LanguageOption {
  if (!value) return SUPPORTED_LANGUAGES[0];
  const normalized = value.trim().toLowerCase();
  const all = [...SUPPORTED_LANGUAGES, ...dynamicLanguages];

  // Specific alias mappings
  if (normalized === "romainian") {
    const foundRo = all.find((l) => l.code === "ro");
    if (foundRo) return foundRo;
  }
  if (normalized === "chinese" || normalized === "zh") {
    const foundZh = all.find((l) => l.code === "zh-CN");
    if (foundZh) return foundZh;
  }
  if (normalized === "simplified chinese") {
    const foundZhCn = all.find((l) => l.code === "zh-CN");
    if (foundZhCn) return foundZhCn;
  }
  if (normalized === "traditional chinese") {
    const foundZhTw = all.find((l) => l.code === "zh-TW");
    if (foundZhTw) return foundZhTw;
  }

  const found = all.find(
    (l) =>
      l.name.toLowerCase() === normalized ||
      l.code.toLowerCase() === normalized ||
      l.nativeName?.toLowerCase() === normalized,
  );
  return found || SUPPORTED_LANGUAGES[0];
}

/**
 * Formats a language string with its corresponding flag emoji.
 * e.g., "🇬🇧 English"
 */
export function formatLanguageWithFlag(value?: string | null): string {
  const option = getLanguageOption(value);
  return `${option.flag} ${option.name}`;
}
