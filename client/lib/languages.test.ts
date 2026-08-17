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
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(1);
    const english = SUPPORTED_LANGUAGES.find((l) => l.name === "English");
    expect(english).toBeDefined();
    expect(english?.flag).toBe("🇬🇧");
    expect(english?.code).toBe("en");
  });

  it("returns corresponding option for code or name", () => {
    expect(getLanguageOption("en").name).toBe("English");
    expect(getLanguageOption("English").code).toBe("en");
    expect(getLanguageOption("EN").flag).toBe("🇬🇧");
    expect(getLanguageOption("english").name).toBe("English");
  });

  it("falls back to default language for null or invalid inputs", () => {
    expect(getLanguageOption(null).name).toBe("English");
    expect(getLanguageOption(undefined).name).toBe("English");
    expect(getLanguageOption("unknown-lang").name).toBe("English");
  });

  it("formats language with flag", () => {
    expect(formatLanguageWithFlag("English")).toBe("🇬🇧 English");
    expect(formatLanguageWithFlag("en")).toBe("🇬🇧 English");
    expect(formatLanguageWithFlag(null)).toBe("🇬🇧 English");
  });
});
