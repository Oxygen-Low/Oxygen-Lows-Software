import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enGB from "./locales/en-GB/translation.json";
import enUS from "./locales/en-US/translation.json";
import enMEME from "./locales/en-MEME/translation.json";
import ru from "./locales/ru/translation.json";
import ja from "./locales/ja/translation.json";
import ko from "./locales/ko/translation.json";
import zhCN from "./locales/zh-CN/translation.json";
import zhTW from "./locales/zh-TW/translation.json";
import la from "./locales/la/translation.json";
import uk from "./locales/uk/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "en-GB": { translation: enGB },
      "en-US": { translation: enUS },
      "en-MEME": { translation: enMEME },
      ru: { translation: ru },
      ja: { translation: ja },
      ko: { translation: ko },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      la: { translation: la },
      uk: { translation: uk },
    },
    fallbackLng: "en-GB",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
