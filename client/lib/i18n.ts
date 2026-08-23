import {
  en,
  TranslationSchema,
  DeepPartial,
  getLocaleDictionary,
} from "@/locales";
import { DEFAULT_LANGUAGE } from "./languages";

export type { TranslationSchema, DeepPartial };

// Helper type to get all dot-notation paths from nested object
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationSchema> | (string & {});

/**
 * Traverses an object using a dot notation path like "nav.apps" or "common.save".
 */
export function resolvePath(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolates variables in a template string.
 * Supports {key} and {{key}} format.
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params || Object.keys(params).length === 0) return template;
  return template.replace(/\{{1,2}(\w+)\}{1,2}/g, (match, paramName) => {
    if (paramName in params) {
      return String(params[paramName]);
    }
    return match;
  });
}

/**
 * Resolves a translation string by key and language (or dictionary object).
 *
 * 1. Checks the active language dictionary for the key.
 * 2. If not found, falls back to the default English dictionary (or provided fallback dictionary).
 * 3. If still not found, returns `defaultVal` or the key itself.
 * 4. Applies variable interpolation (e.g. `{name}`).
 */
export function getTranslation(
  languageOrDict:
    | string
    | DeepPartial<TranslationSchema>
    | TranslationSchema
    | undefined
    | null,
  key: TranslationKey,
  params?: Record<string, string | number>,
  defaultVal?: string,
  fallbackDict: DeepPartial<TranslationSchema> | TranslationSchema = en,
): string {
  // If languageOrDict is an object, resolve directly; otherwise lookup via getLocaleDictionary
  const activeDict =
    typeof languageOrDict === "object" && languageOrDict !== null
      ? languageOrDict
      : getLocaleDictionary(languageOrDict);

  let rawString = resolvePath(activeDict, key);

  if (rawString === undefined && fallbackDict) {
    // Fallback to fallback dictionary (default: English)
    rawString = resolvePath(fallbackDict, key);
  }

  if (rawString === undefined) {
    rawString = defaultVal !== undefined ? defaultVal : key;
  }

  return interpolate(rawString, params);
}

/**
 * Factory to create a bound translation function `t` for a given language or dictionary.
 */
export function createTranslator(
  languageOrDict:
    | string
    | DeepPartial<TranslationSchema>
    | TranslationSchema = DEFAULT_LANGUAGE,
  fallbackDict: DeepPartial<TranslationSchema> | TranslationSchema = en,
) {
  return function t(
    key: TranslationKey,
    params?: Record<string, string | number>,
    defaultVal?: string,
  ): string {
    return getTranslation(
      languageOrDict,
      key,
      params,
      defaultVal,
      fallbackDict,
    );
  };
}

export const t = createTranslator(DEFAULT_LANGUAGE);
