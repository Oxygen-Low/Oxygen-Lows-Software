import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageOption,
  formatLanguageWithFlag,
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
    expect(english?.code).toBe("en");
  });

  it("contains Korean with South Korea flag", () => {
    const korean = SUPPORTED_LANGUAGES.find((l) => l.name === "Korean");
    expect(korean).toBeDefined();
    expect(korean?.flag).toBe("🇰🇷");
    expect(korean?.code).toBe("ko");
    expect(korean?.nativeName).toBe("한국어");
  });

  it("contains Japanese with Japan flag", () => {
    const japanese = SUPPORTED_LANGUAGES.find((l) => l.name === "Japanese");
    expect(japanese).toBeDefined();
    expect(japanese?.flag).toBe("🇯🇵");
    expect(japanese?.code).toBe("ja");
  });

  it("contains Chinese variants", () => {
    const simplified = SUPPORTED_LANGUAGES.find((l) => l.code === "zh-CN");
    const traditional = SUPPORTED_LANGUAGES.find((l) => l.code === "zh-TW");
    expect(simplified).toBeDefined();
    expect(simplified?.flag).toBe("🇨🇳");
    expect(traditional).toBeDefined();
    expect(traditional?.flag).toBe("🇹🇼");
  });

  it("contains Russian, French, German, Spanish, Romanian, Arabic, Czech, Zulu, Danish, Latin, Hebrew, Ukrainian", () => {
    const codes = ["ru", "fr", "de", "es", "ro", "ar", "cs", "zu", "da", "la", "he", "uk"];
    codes.forEach((code) => {
      const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
      expect(lang).toBeDefined();
    });
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
