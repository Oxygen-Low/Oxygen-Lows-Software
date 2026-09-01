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
    {
      code: "zh-CN",
      name: "Chinese",
      flag: "🇨🇳",
      countryCode: "cn",
      dict: zhCN,
    },
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

      const oauthTranslate = t("oauthConsent.authorizeApp", {
        app: "MyTestApp",
      });
      expect(oauthTranslate).toContain("MyTestApp");

      // Test title keys
      expect(t("titles.apps")).toBeTruthy();
      expect(t("titles.games")).toBeTruthy();
      expect(t("titles.storage")).toBeTruthy();
      expect(t("titles.security")).toBeTruthy();
      expect(t("titles.account")).toBeTruthy();
      expect(t("titles.privacy")).toBeTruthy();
      expect(t("titles.terms")).toBeTruthy();

      // Test account models customization keys
      expect(t("account.models")).toBeTruthy();
      expect(t("account.modelsSubtitle")).toBeTruthy();
      expect(t("account.addModel")).toBeTruthy();
      expect(t("account.featureDefaults")).toBeTruthy();
      expect(t("account.chatbotDefaultTitle")).toBeTruthy();
      expect(t("account.researchAgentDefaultTitle")).toBeTruthy();
      expect(t("account.researchSummarizerDefaultTitle")).toBeTruthy();
      expect(t("account.registeredModels")).toBeTruthy();
      expect(t("account.localModelsGroup")).toBeTruthy();
      expect(t("account.cloudModelsGroup")).toBeTruthy();

      // Test AI generation keys in characters
      expect(t("characters.aiGenerate.button")).toBeTruthy();
      expect(t("characters.aiGenerate.includeStats")).toBeTruthy();
      expect(t("characters.aiGenerate.generateForUniverse")).toBeTruthy();
      expect(t("characters.aiGenerate.titleCharacter")).toBeTruthy();
      expect(t("characters.aiGenerate.titleUniverse")).toBeTruthy();
      expect(t("characters.aiGenerate.subtitle")).toBeTruthy();
      expect(t("characters.aiGenerate.promptLabel")).toBeTruthy();
      expect(t("characters.aiGenerate.stepGenerating")).toBeTruthy();

      // Test Character stats keys
      expect(t("characters.statsTitle")).toBeTruthy();
      expect(t("characters.enableStats")).toBeTruthy();
      expect(t("characters.statsHelp")).toBeTruthy();
      expect(t("characters.statStr")).toBeTruthy();
      expect(t("characters.statDex")).toBeTruthy();
      expect(t("characters.statCon")).toBeTruthy();
      expect(t("characters.statInt")).toBeTruthy();
      expect(t("characters.statWis")).toBeTruthy();
      expect(t("characters.statCha")).toBeTruthy();

      // Test Game Library keys
      expect(t("apps.gameLibraryTitle")).toBeTruthy();
      expect(t("apps.gameLibraryDesc")).toBeTruthy();
      expect(t("titles.gameLibrary")).toBeTruthy();
      expect(t("gameLibrary.title")).toBeTruthy();
      expect(t("gameLibrary.subtitle")).toBeTruthy();
      expect(t("gameLibrary.platformSteam")).toBe("Steam");
      expect(t("gameLibrary.platformEpic")).toBe("Epic Games");
      expect(t("gameLibrary.play")).toBeTruthy();
      expect(t("gameLibrary.addCustomGame")).toBeTruthy();
      expect(t("gameLibrary.desktopRequiredTitle")).toBeTruthy();
      expect(t("gameLibrary.desktopRequiredMessage")).toContain(
        "Oxygen Low's Software",
      );

      // Test Support & Admin ticket keys
      expect(t("support.deleteTicket")).toBeTruthy();
      expect(t("support.deleteTicketConfirm")).toBeTruthy();
      expect(t("support.ticketDeleted")).toBeTruthy();
      expect(t("supportTicket.deleteTicket")).toBeTruthy();
      expect(t("supportTicket.deleteTicketConfirm")).toBeTruthy();
      expect(t("admin.hideClosed")).toBeTruthy();
      expect(t("admin.showClosed")).toBeTruthy();
      expect(t("admin.filterAll")).toBeTruthy();
      expect(t("admin.filterOpen")).toBeTruthy();
      expect(t("admin.filterClosed")).toBeTruthy();
      expect(t("admin.closedAutoDeleteNotice")).toBeTruthy();
      expect(t("admin.markAsOpen")).toBeTruthy();
      expect(t("admin.markAsClosed")).toBeTruthy();
      expect(t("admin.ticketMarkedOpen")).toBeTruthy();
      expect(t("admin.ticketMarkedClosed")).toBeTruthy();
    });
  });
});
