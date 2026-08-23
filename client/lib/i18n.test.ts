import { describe, it, expect } from "vitest";
import {
  getTranslation,
  createTranslator,
  resolvePath,
  t as globalTranslate,
} from "./i18n";
import { en } from "../locales/en";
import { registerLocale, LOCALES, TranslationSchema } from "../locales";
import { DeepPartial } from "./i18n";

describe("i18n Core Library", () => {
  describe("resolvePath & getTranslation", () => {
    it("should resolve top-level and deeply nested dot paths in dictionary", () => {
      expect(resolvePath(en, "common.loading")).toBe("Loading...");
      expect(resolvePath(en, "nav.apps")).toBe("Apps");
      expect(resolvePath(en, "apps.base64Title")).toBe(
        "Base64 Encoder/Decoder",
      );
      expect(resolvePath(en, "account.profileSettings")).toBe(
        "Profile Settings",
      );
    });

    it("should return undefined for non-existent paths via resolvePath", () => {
      expect(resolvePath(en, "nonexistent.key")).toBeUndefined();
      expect(resolvePath(en, "common.nonexistent")).toBeUndefined();
    });

    it("should get translation using active dictionary", () => {
      expect(getTranslation(en, "common.loading")).toBe("Loading...");
      expect(getTranslation(en, "account.profileSettings")).toBe(
        "Profile Settings",
      );
    });
  });

  describe("createTranslator & interpolation", () => {
    it("should translate keys from the given language dictionary", () => {
      const t = createTranslator(en, en);
      expect(t("common.save")).toBe("Save");
      expect(t("nav.home")).toBe("Home");
    });

    it("should interpolate single {param} and double {{param}} variables", () => {
      const t = createTranslator(en, en);
      expect(t("apps.signInToUse", { name: "Web Defender" })).toBe(
        "Sign in to use Web Defender",
      );
      expect(t("oauthConsent.authorizeApp", { app: "Test App" })).toBe(
        "Authorize Test App",
      );
    });

    it("should fall back to default dictionary when a key is missing in active locale", () => {
      const partialDictionary: DeepPartial<TranslationSchema> = {
        common: {
          save: "Guardar",
        },
      };
      const t = createTranslator(partialDictionary, en);
      // Key that exists in partial dictionary
      expect(t("common.save")).toBe("Guardar");
      // Key missing in partial dictionary - should fall back to English
      expect(t("common.cancel")).toBe("Cancel");
      expect(t("nav.games")).toBe("Games");
    });

    it("should return fallback string or key itself if missing from both dictionaries", () => {
      const t = createTranslator({}, {});
      expect(t("missing.key" as any, undefined, "Custom Fallback")).toBe(
        "Custom Fallback",
      );
      expect(t("missing.key" as any)).toBe("missing.key");
    });
  });

  describe("Adding New Languages", () => {
    it("should seamlessly allow registering a new language and translating with it", () => {
      // Simulate adding Spanish ('es')
      const esLocale: DeepPartial<TranslationSchema> = {
        common: {
          loading: "Cargando...",
          save: "Guardar",
          cancel: "Cancelar",
          back: "Atrás",
        },
        nav: {
          home: "Inicio",
          apps: "Aplicaciones",
          games: "Juegos",
          storage: "Almacenamiento",
          customize: "Personalizar",
        },
        apps: {
          title: "Aplicaciones",
          subtitle: "¡Explora y prueba nuestra colección de herramientas!",
          signInToUse: "Inicia sesión para usar {name}",
        },
      };

      registerLocale("es", esLocale);
      expect(LOCALES["es"]).toBeDefined();

      const tEs = createTranslator(LOCALES["es"], en);
      expect(tEs("common.save")).toBe("Guardar");
      expect(tEs("nav.apps")).toBe("Aplicaciones");
      expect(tEs("apps.signInToUse", { name: "Chatbot" })).toBe(
        "Inicia sesión para usar Chatbot",
      );
      // Fallback to English for untranslated keys
      expect(tEs("account.changePassword")).toBe("Change Password");
    });
  });

  describe("Global translate helper", () => {
    it("should translate directly using default English dictionary", () => {
      expect(globalTranslate("common.submit")).toBe("Submit");
      expect(globalTranslate("nav.support")).toBe("Support");
    });
  });
});
