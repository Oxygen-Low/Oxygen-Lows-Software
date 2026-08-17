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
] as const;

export const DEFAULT_LANGUAGE = "English";

const dynamicLanguages: LanguageOption[] = [];

export function registerLanguageOption(option: LanguageOption) {
  if (!dynamicLanguages.some((l) => l.code === option.code || l.name === option.name)) {
    dynamicLanguages.push(option);
  }
}

/**
 * Find a supported language option by code or name.
 * Falls back to the default language (English) if not found.
 */
export function getLanguageOption(value?: string | null): LanguageOption {
  if (!value) return SUPPORTED_LANGUAGES[0];
  const normalized = value.trim().toLowerCase();
  const all = [...SUPPORTED_LANGUAGES, ...dynamicLanguages];
  const found = all.find(
    (l) =>
      l.name.toLowerCase() === normalized ||
      l.code.toLowerCase() === normalized,
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
