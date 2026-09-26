// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebBrowserApp } from "./WebBrowser";

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => {
      const translations: Record<string, string> = {
        "browserApp.newTab": "New Tab",
        "browserApp.back": "Back",
        "browserApp.forward": "Forward",
        "browserApp.reload": "Reload",
        "browserApp.home": "Home",
        "browserApp.searchPlaceholder": "Search or enter URL...",
        "browserApp.homeSearchPlaceholder": "Search websites or enter URL (e.g. oxygenlow.com)...",
        "browserApp.search": "Search",
        "browserApp.readerMode": "Reader Mode",
        "browserApp.liveMode": "Live Web View",
        "browserApp.bookmarks": "Bookmarks",
        "browserApp.history": "History",
        "browserApp.closeTab": "Close Tab",
        "browserApp.quickAccess": "Quick Access",
        "browserApp.savedBookmarks": "Saved Bookmarks",
        "browserApp.browsingHistory": "Browsing History",
        "browserApp.clearHistory": "Clear History",
      };
      return translations[key] || defaultVal || key;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("WebBrowserApp", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the browser home page with Browser title and no oxylow text in heading", () => {
    render(<WebBrowserApp />);
    expect(screen.getByRole("heading", { level: 1, name: "Browser" })).toBeDefined();
    expect(screen.queryByText("oxylow Browser")).toBeNull();
    expect(screen.getByPlaceholderText("Search or enter URL...")).toBeDefined();
    expect(screen.getByText("Quick Access")).toBeDefined();
  });

  it("renders Quick Access with Oxygen Low's Software and without Wikipedia", () => {
    render(<WebBrowserApp />);
    expect(screen.getByText("Oxygen Low's Software")).toBeDefined();
    expect(screen.queryByText("Wikipedia")).toBeNull();
  });

  it("filters out Wikipedia from legacy localStorage bookmarks", () => {
    localStorage.setItem(
      "oxylow_browser_bookmarks",
      JSON.stringify([
        { title: "Oxygen Low's Software", url: "https://oxygenlow.com" },
        { title: "Wikipedia", url: "https://www.wikipedia.org" },
      ])
    );
    render(<WebBrowserApp />);
    expect(screen.getByText("Oxygen Low's Software")).toBeDefined();
    expect(screen.queryByText("Wikipedia")).toBeNull();
  });

  it("allows adding and switching tabs", () => {
    render(<WebBrowserApp />);
    const addTabBtn = screen.getByTitle("New Tab");
    fireEvent.click(addTabBtn);

    const tabs = screen.getAllByText("New Tab");
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  it("configures iframe with hardened sandbox (no allow-same-origin)", () => {
    render(<WebBrowserApp />);
    const input = screen.getByPlaceholderText("Search or enter URL...");
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.submit(input.closest("form")!);

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeDefined();
    if (iframe) {
      const sandbox = iframe.getAttribute("sandbox") || "";
      expect(sandbox).toContain("allow-scripts");
      expect(sandbox).toContain("allow-forms");
      expect(sandbox).not.toContain("allow-same-origin");
    }
  });

  it("allows opening bookmarks and history dialogs", () => {
    render(<WebBrowserApp />);
    const bookmarksBtn = screen.getByTitle("Bookmarks");
    fireEvent.click(bookmarksBtn);
    expect(screen.getByText("Saved Bookmarks")).toBeDefined();

    const historyBtn = screen.getByTitle("History");
    fireEvent.click(historyBtn);
    expect(screen.getByText("Browsing History")).toBeDefined();
  });
});
