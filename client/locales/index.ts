import { en } from "./en";

export { en };

export type StringLeaves<T> = {
  [K in keyof T]: T[K] extends object ? StringLeaves<T[K]> : string;
};

export type TranslationSchema = StringLeaves<typeof en>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Registry of all available locale dictionaries.
 * To add a new language in the future:
 * 1. Create a locale file in `client/locales/<code/name>.ts`
 * 2. Add an entry to `LOCALES` below:
 *    `es: es, Spanish: es`
 * 3. Add the language metadata in `client/lib/languages.ts` in `SUPPORTED_LANGUAGES`.
 */
export const LOCALES: Record<string, DeepPartial<TranslationSchema> | TranslationSchema> = {
  en,
  English: en,
  english: en,
};

export const DEFAULT_LOCALE = "English";

import { registerLanguageOption } from "@/lib/languages";

/**
 * Dynamically registers a new locale dictionary.
 */
export function registerLocale(
  identifier: string,
  dictionary: DeepPartial<TranslationSchema> | TranslationSchema,
) {
  LOCALES[identifier] = dictionary;
  const lower = identifier.toLowerCase();
  if (lower === "es" || lower === "spanish") {
    registerLanguageOption({
      code: "es",
      name: "Spanish",
      flag: "🇪🇸",
      nativeName: "Español",
    });
  }
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
  const found = Object.entries(LOCALES).find(
    ([key]) => key.toLowerCase() === normalized,
  );
  return found ? found[1] : en;
}
