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

  it("displays Queued ([position]) badge instead of Crawling for queued/indexing sites", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/webmaster/sites")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sites: [
                {
                  id: "site-1",
                  userId: "test-user-id",
                  url: "https://first-site.org",
                  domain: "first-site.org",
                  status: "crawling",
                  verified: true,
                  verificationToken: "token-1",
                  pageCount: 0,
                  createdAt: new Date().toISOString(),
                  logs: [],
                  queuePosition: 1,
                },
                {
                  id: "site-2",
                  userId: "test-user-id",
                  url: "https://second-site.org",
                  domain: "second-site.org",
                  status: "pending",
                  verified: true,
                  verificationToken: "token-2",
                  pageCount: 0,
                  createdAt: new Date().toISOString(),
                  logs: [],
                  queuePosition: 2,
                },
              ],
            }),
        });
      }
      if (url.includes("/api/webmaster/stats")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totalSites: 2,
              totalPagesIndexed: 0,
              globalIndexCount: 0,
              botUserAgent: "oxylow/1.0",
              botContactEmail: "support@oxygenlow.com",
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<WebmasterApp />);
    expect(await screen.findByText("Queued (1)")).toBeDefined();
    expect(await screen.findByText("Queued (2)")).toBeDefined();
    expect(screen.queryByText("Crawling")).toBeNull();
  });
});
