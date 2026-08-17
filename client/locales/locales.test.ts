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
  it as itLocale,
  pt,
  pl,
  tr,
  vi,
  id,
  hi,
  ar,
  zu,
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
    { code: "ko", name: "Korean", flag: "🇰🇷", countryCode: "kr", dict: ko },
    { code: "ja", name: "Japanese", flag: "🇯🇵", countryCode: "jp", dict: ja },
    { code: "zh-CN", name: "Chinese (Simplified)", flag: "🇨🇳", countryCode: "cn", dict: zhCN },
    { code: "zh-TW", name: "Chinese (Traditional)", flag: "🇹🇼", countryCode: "tw", dict: zhTW },
    { code: "ru", name: "Russian", flag: "🇷🇺", countryCode: "ru", dict: ru },
    { code: "fr", name: "French", flag: "🇫🇷", countryCode: "fr", dict: fr },
    { code: "de", name: "German", flag: "🇩🇪", countryCode: "de", dict: de },
    { code: "es", name: "Spanish", flag: "🇪🇸", countryCode: "es", dict: es },
    { code: "it", name: "Italian", flag: "🇮🇹", countryCode: "it", dict: itLocale },
    { code: "pt", name: "Portuguese", flag: "🇵🇹", countryCode: "pt", dict: pt },
    { code: "pl", name: "Polish", flag: "🇵🇱", countryCode: "pl", dict: pl },
    { code: "tr", name: "Turkish", flag: "🇹🇷", countryCode: "tr", dict: tr },
    { code: "vi", name: "Vietnamese", flag: "🇻🇳", countryCode: "vn", dict: vi },
    { code: "id", name: "Indonesian", flag: "🇮🇩", countryCode: "id", dict: id },
    { code: "hi", name: "Hindi", flag: "🇮🇳", countryCode: "in", dict: hi },
    { code: "ar", name: "Arabic", flag: "🇸🇦", countryCode: "sa", dict: ar },
    { code: "zu", name: "Zulu", flag: "🇿🇦", countryCode: "za", dict: zu },
    { code: "la", name: "Latin", flag: "🇻🇦", countryCode: "va", dict: la },
    { code: "he", name: "Hebrew", flag: "🇮🇱", countryCode: "il", dict: he },
    { code: "uk", name: "Ukrainian", flag: "🇺🇦", countryCode: "ua", dict: uk },
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
    expect(getLanguageOption("zh-TW").name).toBe("Chinese (Traditional)");
    expect(getLanguageOption("Latin").code).toBe("la");
    expect(getLanguageOption("Hebrew").code).toBe("he");
    expect(getLanguageOption("Zulu").code).toBe("zu");
    expect(getLanguageOption("Ukrainian").code).toBe("uk");
    expect(getLanguageOption("French").code).toBe("fr");
    expect(getLanguageOption("German").code).toBe("de");
    expect(getLanguageOption("Spanish").code).toBe("es");
    expect(getLanguageOption("Arabic").code).toBe("ar");
    expect(getLanguageOption("Polish").code).toBe("pl");
    expect(getLanguageOption("Vietnamese").code).toBe("vi");
    expect(getLanguageOption("Turkish").code).toBe("tr");
    expect(getLanguageOption("Italian").code).toBe("it");
    expect(getLanguageOption("Indonesian").code).toBe("id");
    expect(getLanguageOption("Hindi").code).toBe("hi");
    expect(getLanguageOption("Portuguese").code).toBe("pt");
  });

  it("should format all languages with their flags correctly", () => {
    expect(formatLanguageWithFlag("Korean")).toBe("🇰🇷 Korean");
    expect(formatLanguageWithFlag("Japanese")).toBe("🇯🇵 Japanese");
    expect(formatLanguageWithFlag("Russian")).toBe("🇷🇺 Russian");
    expect(formatLanguageWithFlag("French")).toBe("🇫🇷 French");
    expect(formatLanguageWithFlag("German")).toBe("🇩🇪 German");
    expect(formatLanguageWithFlag("Spanish")).toBe("🇪🇸 Spanish");
    expect(formatLanguageWithFlag("Arabic")).toBe("🇸🇦 Arabic");
    expect(formatLanguageWithFlag("Zulu")).toBe("🇿🇦 Zulu");
    expect(formatLanguageWithFlag("Latin")).toBe("🇻🇦 Latin");
    expect(formatLanguageWithFlag("Hebrew")).toBe("🇮🇱 Hebrew");
    expect(formatLanguageWithFlag("Ukrainian")).toBe("🇺🇦 Ukrainian");
    expect(formatLanguageWithFlag("Polish")).toBe("🇵🇱 Polish");
    expect(formatLanguageWithFlag("Vietnamese")).toBe("🇻🇳 Vietnamese");
    expect(formatLanguageWithFlag("Turkish")).toBe("🇹🇷 Turkish");
    expect(formatLanguageWithFlag("Italian")).toBe("🇮🇹 Italian");
    expect(formatLanguageWithFlag("Indonesian")).toBe("🇮🇩 Indonesian");
    expect(formatLanguageWithFlag("Hindi")).toBe("🇮🇳 Hindi");
    expect(formatLanguageWithFlag("Portuguese")).toBe("🇵🇹 Portuguese");
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
