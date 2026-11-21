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
        "browserApp.searching": "Searching the index...",
        "browserApp.searchResultsFor": "Search results for",
        "browserApp.resultsCount": "About {count} results",
        "browserApp.didYouMean": "Did you mean",
        "browserApp.retry": "Retry",
        "browserApp.loadMore": "Load more results",
        "browserApp.openInNewTab": "Open in new tab",
        "browserApp.indexedPagesFound": "Found {count} indexed pages",
        "browserApp.noResultsFound": "No indexed pages found for this query.",
        "browserApp.noResultsTip": "Try another keyword, or enter a direct website address.",
        "browserApp.directNavigate": "Navigate directly to",
        "browserApp.webSearchExternal": "Search external web for",
        "browserApp.failedReader": "Unable to extract reader view for this page",
        "browserApp.failedSearch": "Failed to fetch search results",
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
    vi.unstubAllGlobals();
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

  it("renders search results with snippets and loads more pages", async () => {
    const jsonResponse = (data: unknown, ok = true, status = 200) =>
      ({ ok, status, json: async () => data } as unknown as Response);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/suggestions")) {
          return jsonResponse({ suggestions: [] });
        }
        if (url.includes("/search")) {
          const page = new URL(url, "http://localhost").searchParams.get("page");
          if (page === "2") {
            return jsonResponse({
              results: [
                {
                  url: "https://example.com/two",
                  domain: "example.com",
                  title: "Second Result",
                  description: "",
                  bodyPreview: "",
                  snippet: "A second page of results.",
                  matchedTerms: ["results"],
                  score: 1,
                  indexedAt: new Date().toISOString(),
                },
              ],
              total: 2,
              page: 2,
              pageSize: 10,
            });
          }
          return jsonResponse({
            results: [
              {
                url: "https://example.com/one",
                domain: "example.com",
                title: "Security Guide",
                description: "",
                bodyPreview: "",
                snippet: "A practical security guide for web applications.",
                matchedTerms: ["security"],
                score: 2,
                indexedAt: new Date().toISOString(),
              },
            ],
            total: 2,
            page: 1,
            pageSize: 10,
          });
        }
        return jsonResponse({});
      })
    );

    render(<WebBrowserApp />);
    const input = screen.getByPlaceholderText("Search or enter URL...");
    fireEvent.change(input, { target: { value: "security" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByText(
        (_content, element) =>
          element?.tagName === "H3" && element.textContent === "Security Guide"
      )
    ).toBeDefined();
    expect(screen.getByText("security")).toBeDefined();
    expect(screen.getByText(/About 2 results/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /load more results/i }));
    expect(await screen.findByText("Second Result")).toBeDefined();
    expect(screen.queryByRole("button", { name: /load more results/i })).toBeNull();
  });

  it("shows a retry state when the search request fails", async () => {
    const jsonResponse = (data: unknown, ok = false, status = 500) =>
      ({ ok, status, json: async () => data } as unknown as Response);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/suggestions")) return jsonResponse({ suggestions: [] }, true, 200);
        return jsonResponse({ error: "failed" });
      })
    );

    render(<WebBrowserApp />);
    const input = screen.getByPlaceholderText("Search or enter URL...");
    fireEvent.change(input, { target: { value: "security" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("button", { name: /retry/i })).toBeDefined();
    expect(screen.getByText(/Failed to fetch search results/)).toBeDefined();
  });
});
