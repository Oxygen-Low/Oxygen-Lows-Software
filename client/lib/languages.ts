export interface SubLanguage {
  id: string;
  name: string;
  flag: string;
}

export interface Language {
  id: string;
  name: string;
  flag: string;
  subLanguages?: SubLanguage[];
}

export const LANGUAGES: Language[] = [
  {
    id: "English",
    name: "English",
    flag: "🇬🇧",
    subLanguages: [
      { id: "GB", name: "GB/UK", flag: "🇬🇧" },
      { id: "US", name: "US", flag: "🇺🇸" },
      { id: "2008-2011", name: "2008-2011", flag: "😎" },
    ],
  },
  {
    id: "Russian",
    name: "Русский",
    flag: "🇷🇺",
  },
  {
    id: "Japanese",
    name: "日本語",
    flag: "🇯🇵",
  },
  {
    id: "Korean",
    name: "한국어",
    flag: "🇰🇷",
  },
  {
    id: "Chinese",
    name: "中文",
    flag: "🇨🇳",
    subLanguages: [
      { id: "Simplified", name: "简体中文", flag: "🇨🇳" },
      { id: "Traditional", name: "繁體中文", flag: "🇭🇰" },
    ],
  },
  {
    id: "Latin",
    name: "Latina",
    flag: "🇻🇦",
  },
  {
    id: "Ukrainian",
    name: "Українська",
    flag: "🇺🇦",
  },
];

export const getLanguageLabel = (langId: string, subLangId?: string | null) => {
  const lang = LANGUAGES.find((l) => l.id === langId);
  if (!lang) return langId;
  if (subLangId && lang.subLanguages) {
    const sub = lang.subLanguages.find((s) => s.id === subLangId);
    if (sub) return `${lang.name} (${sub.name})`;
  }
  return lang.name;
};

export const getLocaleCode = (langId: string, subLangId?: string | null) => {
  switch (langId) {
    case "English":
      if (subLangId === "US") return "en-US";
      if (subLangId === "2008-2011") return "en-MEME";
      return "en-GB";
    case "Russian":
      return "ru";
    case "Japanese":
      return "ja";
    case "Korean":
      return "ko";
    case "Chinese":
      return subLangId === "Traditional" ? "zh-TW" : "zh-CN";
    case "Latin":
      return "la";
    case "Ukrainian":
      return "uk";
    default:
      return "en-GB";
  }
};
