import { useState, useEffect, useRef } from "react";
import {
  Globe,
  Search,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  ExternalLink,
  BookOpen,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";

interface Tab {
  id: string;
  title: string;
  url: string;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
  mode: "home" | "browser" | "search" | "reader";
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  searchTotal?: number;
  searchPage?: number;
  searchSuggestion?: string;
  searchError?: string;
  readerData?: {
    title: string;
    description: string;
    headings: string[];
    content: string;
    paragraphs: string[];
    readingTimeMinutes: number;
    favicon?: string;
  };
}

interface SearchResultItem {
  url: string;
  domain: string;
  title: string;
  description: string;
  bodyPreview: string;
  snippet?: string;
  matchedTerms?: string[];
  favicon?: string;
  score: number;
  indexedAt?: string;
}

const SEARCH_PAGE_SIZE = 10;

function looksLikeNavigationTarget(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true;
  if (/^localhost(?::\d+)?(\/|$)/i.test(value)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(?::\d+)?(\/|$)/.test(value)) return true;
  return /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d+)?(\/.*)?$/u.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, terms }: { text: string; terms?: string[] }) {
  if (!text) return null;
  const cleaned = Array.from(
    new Set((terms || []).map((term) => term.trim()).filter((term) => term.length >= 2))
  );
  if (cleaned.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${cleaned.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  const termSet = new Set(cleaned.map((term) => term.toLowerCase()));

  return (
    <>
      {parts.map((part, index) =>
        termSet.has(part.toLowerCase()) ? (
          <mark key={index} className="bg-cyan-500/25 text-foreground rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function ResultFavicon({ src, domain }: { src?: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-500 shrink-0">
        <Globe className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-6 h-6 rounded-md object-contain bg-muted/50 shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
      title={domain}
    />
  );
}

function formatIndexedDate(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString();
}

function formatResultPath(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

const DEFAULT_HOME_TAB: Tab = {
  id: "initial-tab",
  title: "New Tab",
  url: "",
  history: [""],
  historyIndex: 0,
  isLoading: false,
  mode: "home",
};

export function WebBrowserApp() {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<Tab[]>([DEFAULT_HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>("initial-tab");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [suggestions, setSuggestions] = useState<{ title: string; url: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const omniboxInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const searchResults = activeTab?.searchResults || [];
  const searchTotal = activeTab?.searchTotal ?? searchResults.length;

  useEffect(() => {
    if (activeTab) {
      if (activeTab.mode === "browser" || activeTab.mode === "reader") {
        setInputUrl(activeTab.url);
      } else if (activeTab.mode === "search") {
        setInputUrl(activeTab.searchQuery || "");
      } else {
        setInputUrl("");
      }
    }
  }, [activeTabId, activeTab?.url, activeTab?.mode, activeTab?.searchQuery]);

  // Listen to navigation events from proxied iframe (works cleanly across sandboxed origins)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || e.origin !== "null") return;
      if (e.data?.type === "OXYLOW_BROWSER_NAVIGATE" && typeof e.data.url === "string") {
        try {
          const target = new URL(e.data.url);
          if (target.protocol === "https:" || target.protocol === "http:") navigateTo(target.href);
        } catch { /* Ignore malformed messages from remote pages. */ }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeTabId, tabs]);

  // Fetch search suggestions while typing in omnibox
  useEffect(() => {
    const query = inputUrl.trim();
    setSelectedSuggestionIndex(-1);
    if (!query || query.startsWith("http://") || query.startsWith("https://")) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/browser/suggestions?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {}
    }, 150);

    return () => clearTimeout(timer);
  }, [inputUrl]);

  const updateTabById = (tabId: string, updater: (tab: Tab) => Tab) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  };

  const updateActiveTab = (updater: (tab: Tab) => Tab) => {
    updateTabById(activeTabId, updater);
  };

  const addTab = (initialUrl = "") => {
    const newId = `tab-${Date.now()}`;
    const newTab: Tab = {
      id: newId,
      title: initialUrl ? (t("browserApp.newTab") || "New Tab") : (t("browserApp.newTab") || "New Tab"),
      url: initialUrl,
      history: initialUrl ? [initialUrl] : [""],
      historyIndex: 0,
      isLoading: !!initialUrl,
      mode: initialUrl ? "browser" : "home",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (idToClose: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (tabs.length === 1) {
      // Reset single tab to home
      setTabs([
        {
          id: `tab-${Date.now()}`,
          title: t("browserApp.newTab") || "New Tab",
          url: "",
          history: [""],
          historyIndex: 0,
          isLoading: false,
          mode: "home",
        },
      ]);
      return;
    }

    const index = tabs.findIndex((t) => t.id === idToClose);
    const newTabs = tabs.filter((t) => t.id !== idToClose);
    setTabs(newTabs);

    if (activeTabId === idToClose) {
      const nextActive = newTabs[Math.max(0, index - 1)];
      setActiveTabId(nextActive.id);
    }
  };

  const navigateTo = (targetUrl: string) => {
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    let finalUrl = targetUrl.trim();
    if (!finalUrl) return;

    // Treat explicit search operators, quoted phrases and non-navigational text
    // as search queries; only real URL shapes are navigated to directly.
    const isSearchQuery =
      finalUrl.includes(" ") ||
      /\b(?:site|intitle):/i.test(finalUrl) ||
      /^-/.test(finalUrl) ||
      !looksLikeNavigationTarget(finalUrl);

    if (isSearchQuery) {
      performSearch(finalUrl);
      return;
    }

    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    let pageTitle = finalUrl;
    try {
      pageTitle = new URL(finalUrl).hostname;
    } catch {}

    updateActiveTab((tab) => {
      const newHistory = tab.history.slice(0, tab.historyIndex + 1);
      newHistory.push(finalUrl);
      return {
        ...tab,
        url: finalUrl,
        title: pageTitle,
        isLoading: true,
        mode: "browser",
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  };

  const performSearch = async (query: string, page = 1, append = false) => {
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    const trimmed = query.trim();
    if (!trimmed) return;

    // Capture the tab id so a response never overwrites a different tab when
    // the user switches tabs while the request is in flight.
    const tabId = activeTabId;
    updateTabById(tabId, (tab) => ({
      ...tab,
      title: `${t("browserApp.search") || "Search"}: ${trimmed}`,
      searchQuery: trimmed,
      mode: "search",
      isLoading: true,
      searchError: undefined,
      ...(append ? {} : { searchSuggestion: undefined }),
    }));

    try {
      const res = await fetch(
        `/api/browser/search?q=${encodeURIComponent(trimmed)}&page=${page}&pageSize=${SEARCH_PAGE_SIZE}`
      );
      if (!res.ok) {
        throw new Error(`Search failed with status ${res.status}`);
      }

      const data = await res.json();
      const incoming: SearchResultItem[] = Array.isArray(data.results) ? data.results : [];
      updateTabById(tabId, (tab) => ({
        ...tab,
        isLoading: false,
        searchError: undefined,
        searchResults: append ? [...(tab.searchResults || []), ...incoming] : incoming,
        searchTotal: typeof data.total === "number" ? data.total : incoming.length,
        searchPage: page,
        searchSuggestion: data.suggestion || undefined,
      }));
    } catch {
      toast.error(t("browserApp.failedSearch") || "Failed to fetch search results");
      updateTabById(tabId, (tab) => ({
        ...tab,
        isLoading: false,
        searchError: t("browserApp.failedSearch") || "Failed to fetch search results",
        ...(append ? {} : { searchResults: [] }),
      }));
    }
  };

  const toggleReaderMode = async () => {
    if (activeTab.mode === "reader") {
      updateActiveTab((tab) => ({ ...tab, mode: "browser" }));
      return;
    }

    if (!activeTab.url) return;

    updateActiveTab((tab) => ({ ...tab, isLoading: true }));
    try {
      const res = await fetch(`/api/browser/reader?url=${encodeURIComponent(activeTab.url)}`);
      if (res.ok) {
        const data = await res.json();
        updateActiveTab((tab) => ({
          ...tab,
          mode: "reader",
          isLoading: false,
          readerData: data,
        }));
      } else {
        toast.error(t("browserApp.failedReader") || "Unable to extract reader view for this page");
        updateActiveTab((tab) => ({ ...tab, isLoading: false }));
      }
    } catch {
      toast.error(t("browserApp.failedReader") || "Error loading reader mode");
      updateActiveTab((tab) => ({ ...tab, isLoading: false }));
    }
  };

  const goBack = () => {
    if (activeTab.historyIndex > 0) {
      const newIndex = activeTab.historyIndex - 1;
      const targetUrl = activeTab.history[newIndex];
      updateActiveTab((tab) => ({
        ...tab,
        historyIndex: newIndex,
        url: targetUrl,
        mode: targetUrl ? "browser" : "home",
        title: targetUrl ? targetUrl : (t("browserApp.newTab") || "New Tab"),
      }));
    }
  };

  const goForward = () => {
    if (activeTab.historyIndex < activeTab.history.length - 1) {
      const newIndex = activeTab.historyIndex + 1;
      const targetUrl = activeTab.history[newIndex];
      updateActiveTab((tab) => ({
        ...tab,
        historyIndex: newIndex,
        url: targetUrl,
        mode: targetUrl ? "browser" : "home",
        title: targetUrl ? targetUrl : (t("browserApp.newTab") || "New Tab"),
      }));
    }
  };

  const refreshTab = () => {
    if (activeTab.mode === "browser" && iframeRef.current) {
      iframeRef.current.src = `/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}&_t=${Date.now()}`;
    } else if (activeTab.mode === "search" && activeTab.searchQuery) {
      performSearch(activeTab.searchQuery);
    }
  };

  const goHome = () => {
    updateActiveTab((tab) => ({
      ...tab,
      url: "",
      title: t("browserApp.newTab") || "New Tab",
      mode: "home",
      isLoading: false,
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    } else if (e.key === "Enter" && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      navigateTo(suggestions[selectedSuggestionIndex].url);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] w-full rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      {/* Tab Strip */}
      <div className="flex items-center gap-1 bg-muted/60 px-2 pt-2 border-b border-border overflow-x-auto select-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-2 max-w-[200px] min-w-[120px] px-3 py-1.5 text-xs rounded-t-lg cursor-pointer transition-all border-t border-x ${
                isActive
                  ? "bg-card text-foreground font-medium border-border shadow-sm -mb-px"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/80 border-transparent"
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0 text-cyan-500" />
              <span className="truncate flex-1">{tab.title || t("browserApp.newTab") || "New Tab"}</span>
              <button
                type="button"
                aria-label={t("browserApp.closeTab") || "Close Tab"}
                title={t("browserApp.closeTab") || "Close Tab"}
                onClick={(e) => closeTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:bg-background/80 rounded p-0.5 transition-opacity"
              >
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => addTab()}
          className="h-7 w-7 p-0 rounded-full hover:bg-background/80 shrink-0 ml-1"
          aria-label={t("browserApp.newTab") || "New Tab"}
          title={t("browserApp.newTab") || "New Tab"}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Navigation Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-card border-b border-border z-10">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={goBack}
            disabled={activeTab.historyIndex <= 0}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.back") || "Back"}
            title={t("browserApp.back") || "Back"}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={goForward}
            disabled={activeTab.historyIndex >= activeTab.history.length - 1}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.forward") || "Forward"}
            title={t("browserApp.forward") || "Forward"}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshTab}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.reload") || "Reload"}
            title={t("browserApp.reload") || "Reload"}
          >
            <RotateCw className={`w-4 h-4 ${activeTab.isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={goHome}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.home") || "Home"}
            title={t("browserApp.home") || "Home"}
          >
            <Home className="w-4 h-4" />
          </Button>
        </div>

        {/* Omnibox */}
        <div className="relative flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                navigateTo(suggestions[selectedSuggestionIndex].url);
              } else {
                navigateTo(inputUrl);
              }
            }}
            className="relative flex items-center"
          >
            <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={omniboxInputRef}
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="browser-suggestions"
              aria-activedescendant={
                selectedSuggestionIndex >= 0
                  ? `browser-suggestion-${selectedSuggestionIndex}`
                  : undefined
              }
              placeholder={t("browserApp.searchPlaceholder") || "Search or enter URL..."}
              className="pl-9 pr-8 h-9 text-sm bg-muted/40 hover:bg-muted/70 focus:bg-background transition-colors w-full rounded-full"
            />
          </form>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              id="browser-suggestions"
              role="listbox"
              aria-label={t("browserApp.search") || "Search"}
              className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden"
            >
              <div className="p-1 text-[11px] font-semibold text-muted-foreground px-3 py-1 bg-muted/30">
                {t("browserApp.search") || "Search"}
              </div>
              {suggestions.map((sug, i) => (
                <div
                  key={`${sug.url}-${i}`}
                  id={`browser-suggestion-${i}`}
                  role="option"
                  aria-selected={i === selectedSuggestionIndex}
                  onMouseDown={() => navigateTo(sug.url)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                    i === selectedSuggestionIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{sug.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px] ml-2 font-mono">
                    {sug.url}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {(activeTab.mode === "browser" || activeTab.mode === "reader") && (
            <Button
              size="sm"
              variant={activeTab.mode === "reader" ? "secondary" : "ghost"}
              onClick={toggleReaderMode}
              className="h-8 px-2.5 text-xs flex items-center gap-1.5"
              aria-label={activeTab.mode === "reader" ? (t("browserApp.liveMode") || "Live Web View") : (t("browserApp.readerMode") || "Reader Mode")}
              title={activeTab.mode === "reader" ? (t("browserApp.liveMode") || "Live Web View") : (t("browserApp.readerMode") || "Reader Mode")}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">
                {activeTab.mode === "reader" ? (t("browserApp.liveMode") || "Live") : (t("browserApp.readerMode") || "Reader")}
              </span>
            </Button>
          )}
          {activeTab.mode !== "search" && activeTab.url && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(activeTab.url, "_blank", "noopener,noreferrer")}
              className="h-8 w-8 p-0"
              aria-label={t("browserApp.openNewWindow") || "Open in new window"}
              title={t("browserApp.openNewWindow") || "Open in new window"}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative overflow-hidden bg-background">
        {/* MODE: HOME / START PAGE */}
        {activeTab.mode === "home" && (
          <div className="h-full overflow-y-auto p-6 md:p-12 flex flex-col items-center">
            <div className="w-full max-w-2xl flex flex-col items-center text-center space-y-6 my-auto">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 shadow-sm">
                <Globe className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Browser</h1>
              </div>

              {/* Central Search Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inputUrl) navigateTo(inputUrl);
                }}
                className="w-full flex items-center relative"
              >
                <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
                <Input
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder={t("browserApp.homeSearchPlaceholder") || "Search websites or enter URL (e.g. oxygenlow.com)..."}
                  className="pl-12 pr-28 h-12 text-base rounded-full shadow-md bg-card hover:border-cyan-500 focus:border-cyan-500 transition-all"
                />
                <Button
                  type="submit"
                  className="absolute right-2 h-8 px-4 rounded-full text-xs"
                >
                  {t("browserApp.search") || "Search"}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* MODE: SEARCH RESULTS */}
        {activeTab.mode === "search" && (
          <div className="h-full overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-500 shrink-0" />
                  <span className="truncate">
                    {`${t("browserApp.searchResultsFor") || "Search results for"} "${activeTab.searchQuery}"`}
                  </span>
                </h2>
                {!activeTab.isLoading && !activeTab.searchError && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(t("browserApp.resultsCount") || "About {count} results").replace(
                      "{count}",
                      searchTotal.toLocaleString()
                    )}
                  </p>
                )}
              </div>
              {activeTab.searchQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs gap-1.5"
                  disabled={activeTab.isLoading}
                  onClick={() => performSearch(activeTab.searchQuery!, 1, false)}
                >
                  <RotateCw className={`w-3.5 h-3.5 ${activeTab.isLoading ? "animate-spin" : ""}`} />
                  {t("browserApp.reload") || "Reload"}
                </Button>
              )}
            </div>

            {activeTab.searchSuggestion && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{t("browserApp.didYouMean") || "Did you mean"}</span>
                <button
                  type="button"
                  onClick={() => performSearch(activeTab.searchSuggestion!, 1, false)}
                  className="text-cyan-500 hover:underline font-medium"
                >
                  {activeTab.searchSuggestion}
                </button>
                <span>?</span>
              </div>
            )}

            {activeTab.isLoading && searchResults.length === 0 ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-border bg-card animate-pulse space-y-2"
                  >
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-4 w-2/3 bg-muted rounded" />
                    <div className="h-3 w-full bg-muted rounded" />
                  </div>
                ))}
                <p className="text-center text-sm text-muted-foreground">
                  {t("browserApp.searching") || "Searching the index..."}
                </p>
              </div>
            ) : activeTab.searchError && searchResults.length === 0 ? (
              <div className="text-center py-12 space-y-4 max-w-md mx-auto">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="text-muted-foreground font-medium">{activeTab.searchError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => performSearch(activeTab.searchQuery || "", 1, false)}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {t("browserApp.retry") || "Retry"}
                </Button>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 space-y-4 max-w-md mx-auto">
                <p className="text-muted-foreground font-medium">
                  {t("browserApp.noResultsFound") || "No indexed pages found for this query."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("browserApp.noResultsTip") || "Try another keyword, or enter a direct website address."}
                </p>
                {activeTab.searchQuery && (
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigateTo(activeTab.searchQuery!)}
                      className="text-xs gap-1.5 w-full sm:w-auto"
                    >
                      <Globe className="w-3.5 h-3.5 text-cyan-500" />
                      {`${t("browserApp.directNavigate") || "Navigate directly to"} "${activeTab.searchQuery}"`}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        window.open(
                          `https://duckduckgo.com/?q=${encodeURIComponent(activeTab.searchQuery!)}`,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      className="text-xs gap-1.5 w-full sm:w-auto"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
                      {`${t("browserApp.webSearchExternal") || "Search external web for"} "${activeTab.searchQuery}"`}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {searchResults.map((res, index) => {
                    const path = formatResultPath(res.url);
                    const indexed = formatIndexedDate(res.indexedAt);
                    return (
                      <div
                        key={`${res.url}-${index}`}
                        onClick={() => navigateTo(res.url)}
                        className="group relative p-4 pr-12 rounded-xl border border-border bg-card hover:border-cyan-500/50 hover:bg-muted/40 cursor-pointer transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-1 min-w-0">
                          <ResultFavicon src={res.favicon} domain={res.domain} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-cyan-500 truncate font-mono">
                              {res.domain}
                              {path && (
                                <span className="text-muted-foreground/80">{path}</span>
                              )}
                            </div>
                          </div>
                          {indexed && (
                            <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                              {indexed}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold group-hover:text-cyan-400 group-hover:underline transition-colors">
                          <HighlightedText text={res.title} terms={res.matchedTerms} />
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                          <HighlightedText
                            text={res.snippet || res.description || res.bodyPreview}
                            terms={res.matchedTerms}
                          />
                        </p>
                        <button
                          type="button"
                          aria-label={t("browserApp.openInNewTab") || "Open in new tab"}
                          title={t("browserApp.openInNewTab") || "Open in new tab"}
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(res.url, "_blank", "noopener,noreferrer");
                          }}
                          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-foreground transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {searchResults.length < searchTotal && (
                  <div className="flex justify-center pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      disabled={activeTab.isLoading}
                      onClick={() =>
                        performSearch(
                          activeTab.searchQuery || "",
                          (activeTab.searchPage || 1) + 1,
                          true
                        )
                      }
                    >
                      {activeTab.isLoading ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {activeTab.isLoading
                        ? t("browserApp.searching") || "Searching the index..."
                        : t("browserApp.loadMore") || "Load more results"}
                    </Button>
                  </div>
                )}

                {activeTab.searchError && searchResults.length > 0 && (
                  <p className="text-center text-xs text-rose-500">{activeTab.searchError}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* MODE: STRUCTURED READER VIEW */}
        {activeTab.mode === "reader" && activeTab.readerData && (
          <div className="h-full overflow-y-auto p-6 md:p-12 max-w-3xl mx-auto space-y-6 leading-relaxed">
            <div className="border-b border-border pb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-500 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  {t("browserApp.readerMode") || "Reader Mode"}
                </span>
                {activeTab.readerData.readingTimeMinutes > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {activeTab.readerData.readingTimeMinutes} {t("browserApp.readingTime") || "min read"}
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {activeTab.readerData.title}
              </h1>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {activeTab.url}
              </p>
            </div>

            {activeTab.readerData.description && (
              <div className="p-4 rounded-xl bg-muted/40 border-l-4 border-cyan-500 text-sm italic leading-relaxed">
                {activeTab.readerData.description}
              </div>
            )}

            <div className="space-y-4 text-sm md:text-base text-foreground/90 leading-relaxed font-sans">
              {Array.isArray(activeTab.readerData.paragraphs) && activeTab.readerData.paragraphs.length > 0 ? (
                activeTab.readerData.paragraphs.map((p, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {p}
                  </p>
                ))
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">
                  {activeTab.readerData.content}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE: PROXIED BROWSER VIEW (Hardened Sandbox: No allow-same-origin for maximum security) */}
        {activeTab.mode === "browser" && (
          <iframe
            ref={iframeRef}
            src={`/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}`}
            title={activeTab.title}
            className="w-full h-full border-none bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-presentation"
            onLoad={() => {
              updateActiveTab((tab) => ({ ...tab, isLoading: false }));
            }}
          />
        )}
      </div>
    </div>
  );
}
