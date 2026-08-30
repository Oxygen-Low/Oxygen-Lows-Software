// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  LanguageProvider,
  useLanguage,
  useTranslation,
} from "./LanguageContext";
import { registerLocale } from "../locales";
import * as React from "react";

let mockProfileLanguage: string | null = null;

vi.mock("@/lib/db", () => {
  const mockClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockImplementation(() =>
            Promise.resolve({
              data: mockProfileLanguage
                ? { language: mockProfileLanguage }
                : null,
              error: mockProfileLanguage ? null : { message: "Not found" },
            }),
          ),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  };

  return {
    db: mockClient,
    supabase: mockClient,
  };
});

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-123" } },
    loading: false,
  }),
}));

function TestConsumer() {
  const { language, setLanguage, languageOption } = useLanguage();
  const { t } = useTranslation();

  return (
    <div>
      <span data-testid="current-language">{language}</span>
      <span data-testid="current-code">{languageOption.code}</span>
      <span data-testid="translated-text">{t("common.save")}</span>
      <span data-testid="nav-apps">{t("nav.apps")}</span>
      <button onClick={() => setLanguage("Spanish")}>Switch to Spanish</button>
      <button onClick={() => setLanguage("English")}>Switch to English</button>
    </div>
  );
}

describe("LanguageContext & Provider", () => {
  beforeEach(() => {
    mockProfileLanguage = null;
    window.localStorage.clear();
    registerLocale("es", {
      common: {
        save: "Guardar",
      },
      nav: {
        apps: "Aplicaciones",
      },
    });
    registerLocale("Spanish", {
      common: {
        save: "Guardar",
      },
      nav: {
        apps: "Aplicaciones",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should initialize with English by default", () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>,
    );

    expect(screen.getByTestId("current-language").textContent).toBe("English");
    expect(screen.getByTestId("current-code").textContent).toBe("en");
    expect(screen.getByTestId("translated-text").textContent).toBe("Save");
    expect(screen.getByTestId("nav-apps").textContent).toBe("Apps");
  });

  it("should switch language and update translations dynamically", async () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>,
    );

    const spanishBtn = screen.getByText("Switch to Spanish");
    fireEvent.click(spanishBtn);

    await waitFor(() => {
      expect(screen.getByTestId("current-language").textContent).toBe(
        "Spanish",
      );
      expect(screen.getByTestId("current-code").textContent).toBe("es");
      expect(screen.getByTestId("translated-text").textContent).toBe("Guardar");
      expect(screen.getByTestId("nav-apps").textContent).toBe("Aplicaciones");
      expect(window.localStorage.getItem("preferred_language")).toBe("Spanish");
    });
  });

  it("should initialize from localStorage if already saved", () => {
    window.localStorage.setItem("preferred_language", "Spanish");

    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>,
    );

    expect(screen.getByTestId("current-language").textContent).toBe("Spanish");
    expect(screen.getByTestId("translated-text").textContent).toBe("Guardar");
  });

  it("should provide safe fallback when used outside LanguageProvider", () => {
    // Render without LanguageProvider wrapper
    render(<TestConsumer />);

    expect(screen.getByTestId("current-language").textContent).toBe("English");
    expect(screen.getByTestId("translated-text").textContent).toBe("Save");
  });
});
