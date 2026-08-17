import { en } from "./en";
import { ko } from "./ko";
import { ja } from "./ja";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import { ru } from "./ru";
import { fr } from "./fr";
import { de } from "./de";
import { es } from "./es";
import { it } from "./it";
import { pt } from "./pt";
import { nl } from "./nl";
import { pl } from "./pl";
import { tr } from "./tr";
import { vi } from "./vi";
import { id } from "./id";
import { hi } from "./hi";
import { bn } from "./bn";
import { ro } from "./ro";
import { ar } from "./ar";
import { cs } from "./cs";
import { zu } from "./zu";
import { da } from "./da";
import { la } from "./la";
import { he } from "./he";
import { uk } from "./uk";
import { pa } from "./pa";
import { ur } from "./ur";
import { fa } from "./fa";

export {
  en,
  ko,
  ja,
  zhCN,
  zhTW,
  ru,
  fr,
  de,
  es,
  it,
  pt,
  nl,
  pl,
  tr,
  vi,
  id,
  hi,
  bn,
  ro,
  ar,
  cs,
  zu,
  da,
  la,
  he,
  uk,
  pa,
  ur,
  fa,
};

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
export const LOCALES: Record<string, DeepPartial<TranslationSchema> | TranslationSchema> = {
  // English
  en,
  English: en,
  english: en,

  // Korean (South Korea 🇰🇷)
  ko,
  Korean: ko,
  korean: ko,
  "한국어": ko,

  // Japanese (Japan 🇯🇵)
  ja,
  Japanese: ja,
  japanese: ja,
  "日本語": ja,

  // Chinese (Simplified - China 🇨🇳)
  zh: zhCN,
  "zh-CN": zhCN,
  "zh-cn": zhCN,
  chinese: zhCN,
  Chinese: zhCN,
  "Chinese (Simplified)": zhCN,
  "Simplified Chinese": zhCN,
  "简体中文": zhCN,

  // Chinese (Traditional - Taiwan 🇹🇼)
  "zh-TW": zhTW,
  "zh-tw": zhTW,
  "Chinese (Traditional)": zhTW,
  "Traditional Chinese": zhTW,
  "繁體中文": zhTW,

  // Russian (Russia 🇷🇺)
  ru,
  Russian: ru,
  russian: ru,
  "Русский": ru,

  // French (France 🇫🇷)
  fr,
  French: fr,
  french: fr,
  "Français": fr,

  // German (Germany 🇩🇪)
  de,
  German: de,
  german: de,
  Deutsch: de,

  // Spanish (Spain 🇪🇸)
  es,
  Spanish: es,
  spanish: es,
  "Español": es,

  // Italian (Italy 🇮🇹)
  it,
  Italian: it,
  italian: it,
  Italiano: it,

  // Portuguese (Portugal / Brazil 🇵🇹)
  pt,
  Portuguese: pt,
  portuguese: pt,
  "Português": pt,

  // Dutch (Netherlands 🇳🇱)
  nl,
  Dutch: nl,
  dutch: nl,
  Nederlands: nl,

  // Polish (Poland 🇵🇱)
  pl,
  Polish: pl,
  polish: pl,
  Polski: pl,

  // Turkish (Turkey 🇹🇷)
  tr,
  Turkish: tr,
  turkish: tr,
  "Türkçe": tr,

  // Vietnamese (Vietnam 🇻🇳)
  vi,
  Vietnamese: vi,
  vietnamese: vi,
  "Tiếng Việt": vi,

  // Indonesian (Indonesia 🇮🇩)
  id,
  Indonesian: id,
  indonesian: id,
  "Bahasa Indonesia": id,

  // Hindi (India 🇮🇳)
  hi,
  Hindi: hi,
  hindi: hi,
  "हिन्दी": hi,

  // Bengali (Bangladesh 🇧🇩)
  bn,
  Bengali: bn,
  bengali: bn,
  "বাংলা": bn,

  // Romanian / Romainian (Romania 🇷🇴)
  ro,
  Romanian: ro,
  romanian: ro,
  Romainian: ro,
  romainian: ro,
  "Română": ro,

  // Arabic (Saudi Arabia 🇸🇦)
  ar,
  Arabic: ar,
  arabic: ar,
  "العربية": ar,

  // Czech (Czechia 🇨🇿)
  cs,
  Czech: cs,
  czech: cs,
  "Čeština": cs,

  // Zulu (South Africa 🇿🇦)
  zu,
  Zulu: zu,
  zulu: zu,
  isiZulu: zu,

  // Danish (Denmark 🇩🇰)
  da,
  Danish: da,
  danish: da,
  Dansk: da,

  // Latin (Vatican City 🇻🇦)
  la,
  Latin: la,
  latin: la,
  Latina: la,

  // Hebrew (Israel 🇮🇱)
  he,
  Hebrew: he,
  hebrew: he,
  "עברית": he,

  // Ukrainian (Ukraine 🇺🇦)
  uk,
  Ukrainian: uk,
  ukrainian: uk,
  "Українська": uk,

  // Punjabi (India 🇮🇳)
  pa,
  Punjabi: pa,
  punjabi: pa,
  "ਪੰਜਾਬੀ": pa,

  // Urdu (Pakistan 🇵🇰)
  ur,
  Urdu: ur,
  urdu: ur,
  "اردو": ur,

  // Persian (Iran 🇮🇷)
  fa,
  Persian: fa,
  persian: fa,
  "فارسی": fa,
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
