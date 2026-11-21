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
        "browserApp.closeTab": "Close Tab",
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
  });

  it("does not show the web crawler tagline", () => {
    render(<WebBrowserApp />);
    expect(screen.queryByText(/Powered by the autonomous web crawler/i)).toBeNull();
  });

  it("does not show browsing history or bookmarks controls", () => {
    render(<WebBrowserApp />);
    expect(screen.queryByTitle("History")).toBeNull();
    expect(screen.queryByTitle("Bookmarks")).toBeNull();
    expect(screen.queryByText("Quick Access")).toBeNull();
    expect(screen.queryByText("Browsing History")).toBeNull();
    expect(screen.queryByText("Saved Bookmarks")).toBeNull();
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
});
