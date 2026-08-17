import { describe, it, expect } from "vitest";
import {
  LOCALES,
  en,
  ko,
  ja,
  zhCN,
  zhTW,
  ru,
  fr,
  de,
  es,
  ro,
  ar,
  cs,
  zu,
  da,
  la,
  he,
  uk,
  getLocaleDictionary,
} from "./index";
import {
  SUPPORTED_LANGUAGES,
  getLanguageOption,
  formatLanguageWithFlag,
} from "@/lib/languages";
import { createTranslator } from "@/lib/i18n";

describe("All Locales Verification", () => {
  const allLocales = [
    { code: "ko", name: "Korean", flag: "🇰🇷", dict: ko },
    { code: "ja", name: "Japanese", flag: "🇯🇵", dict: ja },
    { code: "zh-CN", name: "Chinese (Simplified)", flag: "🇨🇳", dict: zhCN },
    { code: "zh-TW", name: "Chinese (Traditional)", flag: "🇹🇼", dict: zhTW },
    { code: "ru", name: "Russian", flag: "🇷🇺", dict: ru },
    { code: "fr", name: "French", flag: "🇫🇷", dict: fr },
    { code: "de", name: "German", flag: "🇩🇪", dict: de },
    { code: "es", name: "Spanish", flag: "🇪🇸", dict: es },
    { code: "ro", name: "Romanian", flag: "🇷🇴", dict: ro },
    { code: "ar", name: "Arabic", flag: "🇸🇦", dict: ar },
    { code: "cs", name: "Czech", flag: "🇨🇿", dict: cs },
    { code: "zu", name: "Zulu", flag: "🇿🇦", dict: zu },
    { code: "da", name: "Danish", flag: "🇩🇰", dict: da },
    { code: "la", name: "Latin", flag: "🇻🇦", dict: la },
    { code: "he", name: "Hebrew", flag: "🇮🇱", dict: he },
    { code: "uk", name: "Ukrainian", flag: "🇺🇦", dict: uk },
  ];

  it("should have all requested languages present in SUPPORTED_LANGUAGES", () => {
    allLocales.forEach(({ code, name, flag }) => {
      const option = SUPPORTED_LANGUAGES.find((l) => l.code === code);
      expect(option).toBeDefined();
      expect(option?.name).toBe(name);
      expect(option?.flag).toBe(flag);
    });
  });

  it("should find language options by name, code, and aliases", () => {
    expect(getLanguageOption("Korean").code).toBe("ko");
    expect(getLanguageOption("ko").flag).toBe("🇰🇷");
    expect(getLanguageOption("Japanese").code).toBe("ja");
    expect(getLanguageOption("Romainian").code).toBe("ro");
    expect(getLanguageOption("Romanian").code).toBe("ro");
    expect(getLanguageOption("Chinese").code).toBe("zh-CN");
    expect(getLanguageOption("zh-TW").name).toBe("Chinese (Traditional)");
    expect(getLanguageOption("Latin").code).toBe("la");
    expect(getLanguageOption("Hebrew").code).toBe("he");
    expect(getLanguageOption("Zulu").code).toBe("zu");
    expect(getLanguageOption("Ukrainian").code).toBe("uk");
    expect(getLanguageOption("Czech").code).toBe("cs");
    expect(getLanguageOption("Danish").code).toBe("da");
    expect(getLanguageOption("French").code).toBe("fr");
    expect(getLanguageOption("German").code).toBe("de");
    expect(getLanguageOption("Spanish").code).toBe("es");
    expect(getLanguageOption("Arabic").code).toBe("ar");
  });

  it("should format all languages with their flags correctly", () => {
    expect(formatLanguageWithFlag("Korean")).toBe("🇰🇷 Korean");
    expect(formatLanguageWithFlag("Japanese")).toBe("🇯🇵 Japanese");
    expect(formatLanguageWithFlag("Russian")).toBe("🇷🇺 Russian");
    expect(formatLanguageWithFlag("French")).toBe("🇫🇷 French");
    expect(formatLanguageWithFlag("German")).toBe("🇩🇪 German");
    expect(formatLanguageWithFlag("Spanish")).toBe("🇪🇸 Spanish");
    expect(formatLanguageWithFlag("Romanian")).toBe("🇷🇴 Romanian");
    expect(formatLanguageWithFlag("Arabic")).toBe("🇸🇦 Arabic");
    expect(formatLanguageWithFlag("Czech")).toBe("🇨🇿 Czech");
    expect(formatLanguageWithFlag("Zulu")).toBe("🇿🇦 Zulu");
    expect(formatLanguageWithFlag("Danish")).toBe("🇩🇰 Danish");
    expect(formatLanguageWithFlag("Latin")).toBe("🇻🇦 Latin");
    expect(formatLanguageWithFlag("Hebrew")).toBe("🇮🇱 Hebrew");
    expect(formatLanguageWithFlag("Ukrainian")).toBe("🇺🇦 Ukrainian");
  });

  it("should have all dictionaries mapped in LOCALES registry", () => {
    allLocales.forEach(({ code, name, dict }) => {
      expect(LOCALES[code]).toBe(dict);
      expect(LOCALES[name]).toBe(dict);
      expect(getLocaleDictionary(code)).toBe(dict);
      expect(getLocaleDictionary(name)).toBe(dict);
    });
  });

  it("should correctly translate common keys and interpolate placeholders across all locales", () => {
    allLocales.forEach(({ name, dict }) => {
      const t = createTranslator(dict, en);
      expect(t("common.save")).toBeTruthy();
      expect(t("nav.home")).toBeTruthy();
      expect(t("apps.title")).toBeTruthy();

      // Test interpolation of variables
      const appTranslate = t("apps.signInToUse", { name: "Web Defender" });
      expect(appTranslate).toContain("Web Defender");

      const oauthTranslate = t("oauthConsent.authorizeApp", { app: "MyTestApp" });
      expect(oauthTranslate).toContain("MyTestApp");
    });
  });
});
