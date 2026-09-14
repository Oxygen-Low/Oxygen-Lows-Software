// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebmasterApp } from "./Webmaster";
import * as authHook from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");
vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => defaultVal || key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("WebmasterApp", () => {
  beforeEach(() => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: { user: { id: "test-user-id" }, access_token: "test-token" },
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    // Mock fetch for stats and sites
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webmaster/sites")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sites: [] }),
        });
      }
      if (url.includes("/api/webmaster/stats")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totalSites: 0,
              totalPagesIndexed: 5,
              globalIndexCount: 5,
              botUserAgent: "oxylow/1.0",
              botContactEmail: "support@oxygenlow.com",
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the webmaster console with bot compliance information", async () => {
    render(<WebmasterApp />);
    expect(screen.getByText("Webmaster Console")).toBeDefined();
    expect(screen.getByText(/support@oxygenlow.com/i)).toBeDefined();
    expect(screen.getByPlaceholderText("https://example.com")).toBeDefined();
  });
});
