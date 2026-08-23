import { en } from "./en";
import { ko } from "./ko";
import { ja } from "./ja";
import { zhCN } from "./zh-CN";
import { es } from "./es";
import { ru } from "./ru";

export { en, ko, ja, zhCN, es, ru };

export type StringLeaves<T> = {
  [K in keyof T]: T[K] extends object ? StringLeaves<T[K]> : string;
};

export type TranslationSchema = StringLeaves<typeof en>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Registry of all available locale dictionaries.
 */
export const LOCALES: Record<
  string,
  DeepPartial<TranslationSchema> | TranslationSchema
> = {
  // English
  en,
  English: en,
  english: en,

  // Korean (South Korea 🇰🇷)
  ko,
  Korean: ko,
  korean: ko,
  한국어: ko,

  // Japanese (Japan 🇯🇵)
  ja,
  Japanese: ja,
  japanese: ja,
  日本語: ja,

  // Chinese (China 🇨🇳)
  zh: zhCN,
  "zh-CN": zhCN,
  "zh-cn": zhCN,
  chinese: zhCN,
  Chinese: zhCN,
  "Chinese (Simplified)": zhCN,
  "Simplified Chinese": zhCN,
  简体中文: zhCN,
  中文: zhCN,

  // Spanish (Spain 🇪🇸)
  es,
  Spanish: es,
  spanish: es,
  Español: es,

  // Russian (Russia 🇷🇺)
  ru,
  Russian: ru,
  russian: ru,
  Русский: ru,
};

export const DEFAULT_LOCALE = "English";

const localeCache = new Map<
  string,
  DeepPartial<TranslationSchema> | TranslationSchema
>();
for (const [key, dictionary] of Object.entries(LOCALES)) {
  localeCache.set(key.toLowerCase(), dictionary);
}

import { registerLanguageOption } from "@/lib/languages";

/**
 * Dynamically registers a new locale dictionary.
 */
export function registerLocale(
  identifier: string,
  dictionary: DeepPartial<TranslationSchema> | TranslationSchema,
) {
  LOCALES[identifier] = dictionary;
  localeCache.set(identifier.toLowerCase(), dictionary);
}

/**
 * Get the translation dictionary for the given language code/name or object,
 * falling back to English if not found.
 */
export function getLocaleDictionary(
  language?: string | DeepPartial<TranslationSchema> | TranslationSchema | null,
): DeepPartial<TranslationSchema> | TranslationSchema {
  if (!language) return en;
  if (typeof language === "object") return language;
  if (typeof language !== "string") return en;

  const normalized = language.trim().toLowerCase();
  const found = localeCache.get(normalized);
  return found ? found : en;
}
