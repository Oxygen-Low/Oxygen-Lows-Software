import { describe, it, expect } from "vitest";
import {
  LOCALES,
  en,
  ko,
  ja,
  zhCN,
  ru,
  es,
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
    { code: "ko", name: "Korean", flag: "🇰🇷", countryCode: "kr", dict: ko },
    { code: "ja", name: "Japanese", flag: "🇯🇵", countryCode: "jp", dict: ja },
    { code: "zh-CN", name: "Chinese", flag: "🇨🇳", countryCode: "cn", dict: zhCN },
    { code: "es", name: "Spanish", flag: "🇪🇸", countryCode: "es", dict: es },
    { code: "ru", name: "Russian", flag: "🇷🇺", countryCode: "ru", dict: ru },
  ];

  it("should have all requested languages present in SUPPORTED_LANGUAGES", () => {
    allLocales.forEach(({ code, name, flag, countryCode }) => {
      const option = SUPPORTED_LANGUAGES.find((l) => l.code === code);
      expect(option).toBeDefined();
      expect(option?.name).toBe(name);
      expect(option?.flag).toBe(flag);
      expect(option?.countryCode).toBe(countryCode);
    });
  });

  it("should find language options by name, code, and aliases", () => {
    expect(getLanguageOption("Korean").code).toBe("ko");
    expect(getLanguageOption("ko").flag).toBe("🇰🇷");
    expect(getLanguageOption("Japanese").code).toBe("ja");
    expect(getLanguageOption("Chinese").code).toBe("zh-CN");
    expect(getLanguageOption("zh-CN").name).toBe("Chinese");
    expect(getLanguageOption("Spanish").code).toBe("es");
    expect(getLanguageOption("Russian").code).toBe("ru");
  });

  it("should format all languages with their flags correctly", () => {
    expect(formatLanguageWithFlag("Korean")).toBe("🇰🇷 Korean");
    expect(formatLanguageWithFlag("Japanese")).toBe("🇯🇵 Japanese");
    expect(formatLanguageWithFlag("Chinese")).toBe("🇨🇳 Chinese");
    expect(formatLanguageWithFlag("Spanish")).toBe("🇪🇸 Spanish");
    expect(formatLanguageWithFlag("Russian")).toBe("🇷🇺 Russian");
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
    allLocales.forEach(({ dict }) => {
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
