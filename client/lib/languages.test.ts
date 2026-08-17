import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageOption,
  formatLanguageWithFlag,
  getCountryFlagUrl,
} from "./languages";

describe("languages utility", () => {
  it("defines default language as English", () => {
    expect(DEFAULT_LANGUAGE).toBe("English");
  });

  it("contains English with flag in SUPPORTED_LANGUAGES", () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(17);
    const english = SUPPORTED_LANGUAGES.find((l) => l.name === "English");
    expect(english).toBeDefined();
    expect(english?.flag).toBe("🇬🇧");
    expect(english?.countryCode).toBe("gb");
    expect(english?.code).toBe("en");
  });

  it("contains Korean with South Korea flag and countryCode 'kr'", () => {
    const korean = SUPPORTED_LANGUAGES.find((l) => l.name === "Korean");
    expect(korean).toBeDefined();
    expect(korean?.flag).toBe("🇰🇷");
    expect(korean?.countryCode).toBe("kr");
    expect(korean?.code).toBe("ko");
    expect(korean?.nativeName).toBe("한국어");
  });

  it("contains Japanese with Japan flag and countryCode 'jp'", () => {
    const japanese = SUPPORTED_LANGUAGES.find((l) => l.name === "Japanese");
    expect(japanese).toBeDefined();
    expect(japanese?.flag).toBe("🇯🇵");
    expect(japanese?.countryCode).toBe("jp");
    expect(japanese?.code).toBe("ja");
  });

  it("contains Chinese variants with appropriate country codes", () => {
    const simplified = SUPPORTED_LANGUAGES.find((l) => l.code === "zh-CN");
    const traditional = SUPPORTED_LANGUAGES.find((l) => l.code === "zh-TW");
    expect(simplified).toBeDefined();
    expect(simplified?.flag).toBe("🇨🇳");
    expect(simplified?.countryCode).toBe("cn");
    expect(traditional).toBeDefined();
    expect(traditional?.flag).toBe("🇹🇼");
    expect(traditional?.countryCode).toBe("tw");
  });

  it("contains all other requested languages with valid 2-letter country codes", () => {
    const expected = [
      { code: "ru", countryCode: "ru" },
      { code: "fr", countryCode: "fr" },
      { code: "de", countryCode: "de" },
      { code: "es", countryCode: "es" },
      { code: "ro", countryCode: "ro" },
      { code: "ar", countryCode: "sa" },
      { code: "cs", countryCode: "cz" },
      { code: "zu", countryCode: "za" },
      { code: "da", countryCode: "dk" },
      { code: "la", countryCode: "va" },
      { code: "he", countryCode: "il" },
      { code: "uk", countryCode: "ua" },
    ];
    expected.forEach(({ code, countryCode }) => {
      const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
      expect(lang).toBeDefined();
      expect(lang?.countryCode).toBe(countryCode);
    });
  });

  it("generates correct FlagCDN URLs", () => {
    expect(getCountryFlagUrl("kr")).toBe("https://flagcdn.com/w40/kr.png");
    expect(getCountryFlagUrl("GB", "w80")).toBe("https://flagcdn.com/w80/gb.png");
    expect(getCountryFlagUrl("")).toBe("");
  });

  it("returns corresponding option for code or name", () => {
    expect(getLanguageOption("en").name).toBe("English");
    expect(getLanguageOption("English").code).toBe("en");
    expect(getLanguageOption("EN").flag).toBe("🇬🇧");
    expect(getLanguageOption("english").name).toBe("English");
    expect(getLanguageOption("ko").name).toBe("Korean");
    expect(getLanguageOption("Korean").flag).toBe("🇰🇷");
    expect(getLanguageOption("Romainian").name).toBe("Romanian");
    expect(getLanguageOption("chinese").code).toBe("zh-CN");
  });

  it("falls back to default language for null or invalid inputs", () => {
    expect(getLanguageOption(null).name).toBe("English");
    expect(getLanguageOption(undefined).name).toBe("English");
    expect(getLanguageOption("unknown-lang").name).toBe("English");
  });

  it("formats language with flag", () => {
    expect(formatLanguageWithFlag("English")).toBe("🇬🇧 English");
    expect(formatLanguageWithFlag("en")).toBe("🇬🇧 English");
    expect(formatLanguageWithFlag("Korean")).toBe("🇰🇷 Korean");
    expect(formatLanguageWithFlag("ko")).toBe("🇰🇷 Korean");
    expect(formatLanguageWithFlag(null)).toBe("🇬🇧 English");
  });
});
