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
  Bookmark,
  BookmarkCheck,
  History,
  ExternalLink,
  BookOpen,
  Clock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface BookmarkItem {
  title: string;
  url: string;
  favicon?: string;
}

interface HistoryItem {
  title: string;
  url: string;
  timestamp: string;
}

interface SearchResultItem {
  url: string;
  domain: string;
  title: string;
  description: string;
  bodyPreview: string;
  favicon?: string;
  score: number;
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

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { title: "Oxygen Low's Software", url: "https://oxygenlow.com" },
];

export function WebBrowserApp() {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<Tab[]>([DEFAULT_HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>("initial-tab");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [suggestions, setSuggestions] = useState<{ title: string; url: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState<boolean>(false);

  // Local storage for Bookmarks and History
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => {
    try {
      const saved = localStorage.getItem("oxylow_browser_bookmarks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(
            (b: BookmarkItem) =>
              !b.url?.toLowerCase().includes("wikipedia.org") &&
              !b.title?.toLowerCase().includes("wikipedia")
          );
          if (parsed.length > 0 && filtered.length === 0) {
            return DEFAULT_BOOKMARKS;
          }
          return filtered;
        }
      }
      return DEFAULT_BOOKMARKS;
    } catch {
      return DEFAULT_BOOKMARKS;
    }
  });

  const [historyList, setHistoryList] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("oxylow_browser_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const omniboxInputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

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

  // Persist bookmarks & history
  useEffect(() => {
    try {
      localStorage.setItem("oxylow_browser_bookmarks", JSON.stringify(bookmarks));
    } catch {}
  }, [bookmarks]);

  useEffect(() => {
    try {
      localStorage.setItem("oxylow_browser_history", JSON.stringify(historyList));
    } catch {}
  }, [historyList]);

  // Listen to navigation events from proxied iframe (works cleanly across sandboxed origins)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "OXYLOW_BROWSER_NAVIGATE" && e.data.url) {
        navigateTo(e.data.url);
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

  const updateActiveTab = (updater: (tab: Tab) => Tab) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTabId ? updater(tab) : tab))
    );
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
    if (initialUrl) {
      recordHistory(initialUrl, initialUrl);
    }
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

  const recordHistory = (url: string, title: string) => {
    if (!url) return;
    setHistoryList((prev) => [
      { title: title || url, url, timestamp: new Date().toISOString() },
      ...prev.slice(0, 99),
    ]);
  };

  const navigateTo = (targetUrl: string) => {
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    let finalUrl = targetUrl.trim();
    if (!finalUrl) return;

    // Check if input is search query or direct URL
    const isSearchQuery =
      !finalUrl.includes(".") ||
      finalUrl.includes(" ") ||
      (!finalUrl.startsWith("http://") &&
        !finalUrl.startsWith("https://") &&
        !finalUrl.includes("/") &&
        !finalUrl.includes(":"));

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

    recordHistory(finalUrl, pageTitle);

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

  const performSearch = async (query: string) => {
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    if (!query.trim()) return;

    setIsSearching(true);
    updateActiveTab((tab) => ({
      ...tab,
      title: `${t("browserApp.search") || "Search"}: ${query}`,
      searchQuery: query,
      mode: "search",
      isLoading: true,
    }));

    try {
      const res = await fetch(`/api/browser/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        setSearchResults([]);
      }
    } catch {
      toast.error(t("browserApp.failedSearch") || "Failed to fetch search results");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      updateActiveTab((tab) => ({ ...tab, isLoading: false }));
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

  const isCurrentBookmarked = bookmarks.some((b) => b.url === activeTab.url);

  const toggleBookmark = () => {
    if (!activeTab.url) return;
    if (isCurrentBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.url !== activeTab.url));
      toast.info(t("browserApp.removedFromBookmarks") || "Removed from bookmarks");
    } else {
      setBookmarks((prev) => [
        ...prev,
        { title: activeTab.title || activeTab.url, url: activeTab.url },
      ]);
      toast.success(t("browserApp.addedToBookmarks") || "Added to bookmarks");
    }
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
              onKeyDown={handleKeyDown}
              placeholder={t("browserApp.searchPlaceholder") || "Search or enter URL..."}
              className="pl-9 pr-8 h-9 text-sm bg-muted/40 hover:bg-muted/70 focus:bg-background transition-colors w-full rounded-full"
            />
            {activeTab.url && (
              <button
                type="button"
                onClick={toggleBookmark}
                className="absolute right-3 text-muted-foreground hover:text-cyan-500 transition-colors"
                aria-label={isCurrentBookmarked ? (t("browserApp.bookmarked") || "Bookmarked") : (t("browserApp.bookmarkThisPage") || "Bookmark this page")}
                title={isCurrentBookmarked ? (t("browserApp.bookmarked") || "Bookmarked") : (t("browserApp.bookmarkThisPage") || "Bookmark this page")}
              >
                {isCurrentBookmarked ? (
                  <BookmarkCheck className="w-4 h-4 text-cyan-500 fill-cyan-500" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}
          </form>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="p-1 text-[11px] font-semibold text-muted-foreground px-3 py-1 bg-muted/30">
                {t("browserApp.search") || "Search"}
              </div>
              {suggestions.map((sug, i) => (
                <div
                  key={i}
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
          {activeTab.url && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(activeTab.url, "_blank")}
              className="h-8 w-8 p-0"
              aria-label={t("browserApp.openNewWindow") || "Open in new window"}
              title={t("browserApp.openNewWindow") || "Open in new window"}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsBookmarksOpen(true)}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.bookmarks") || "Bookmarks"}
            title={t("browserApp.bookmarks") || "Bookmarks"}
          >
            <Bookmark className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsHistoryOpen(true)}
            className="h-8 w-8 p-0"
            aria-label={t("browserApp.history") || "History"}
            title={t("browserApp.history") || "History"}
          >
            <History className="w-4 h-4" />
          </Button>
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
                <p className="text-muted-foreground text-sm mt-1">
                  Powered by the autonomous web crawler & search index
                </p>
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

              {/* Popular Sites Shortcuts */}
              <div className="w-full pt-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("browserApp.quickAccess") || "Quick Access"}
                </div>
                {bookmarks.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                    {bookmarks.map((b, i) => (
                      <div
                        key={i}
                        onClick={() => navigateTo(b.url)}
                        className="p-3 rounded-xl border border-border bg-card hover:bg-muted/60 cursor-pointer transition-all hover:border-cyan-500/40 group shadow-sm"
                      >
                        <div className="flex items-center gap-2 font-medium text-sm text-foreground group-hover:text-cyan-500 transition-colors">
                          <Globe className="w-4 h-4 text-cyan-500 shrink-0" />
                          <span className="truncate">{b.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1 font-mono">
                          {b.url}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t("browserApp.noBookmarks") || "No bookmarks saved yet. Click the bookmark icon in the address bar to bookmark pages!"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE: SEARCH RESULTS */}
        {activeTab.mode === "search" && (
          <div className="h-full overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-500" />
                  {t("browserApp.searchResultsFor") || "Search results for"} "{activeTab.searchQuery}"
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(t("browserApp.indexedPagesFound") || "Found {count} indexed pages").replace(
                    "{count}",
                    searchResults.length.toString()
                  )}
                </p>
              </div>
            </div>

            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-3">
                <RotateCw className="w-6 h-6 animate-spin text-cyan-500" />
                <p className="text-sm">{t("browserApp.searching") || "Searching the index..."}</p>
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
                      {t("browserApp.directNavigate") || "Navigate directly to"} "{activeTab.searchQuery}"
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {searchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => navigateTo(res.url)}
                    className="p-4 rounded-xl border border-border bg-card hover:border-cyan-500/50 hover:bg-muted/40 cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="text-xs text-cyan-500 truncate flex items-center gap-1.5 mb-1 font-mono">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      {res.domain}
                    </div>
                    <h3 className="text-base font-semibold group-hover:text-cyan-400 group-hover:underline transition-colors">
                      {res.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {res.description || res.bodyPreview}
                    </p>
                  </div>
                ))}
              </div>
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

      {/* Bookmarks Modal */}
      <Dialog open={isBookmarksOpen} onOpenChange={setIsBookmarksOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-cyan-500" />
              {t("browserApp.savedBookmarks") || "Saved Bookmarks"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
            {bookmarks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {t("browserApp.noBookmarks") || "No bookmarks saved yet."}
              </p>
            ) : (
              bookmarks.map((b, i) => (
                <div
                  key={i}
                  onClick={() => {
                    navigateTo(b.url);
                    setIsBookmarksOpen(false);
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-muted/60 cursor-pointer group"
                >
                  <div className="truncate flex-1 mr-2">
                    <div className="text-sm font-medium truncate group-hover:text-cyan-500">
                      {b.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate font-mono">{b.url}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete bookmark"
                    title="Delete bookmark"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBookmarks((prev) => prev.filter((item) => item.url !== b.url));
                    }}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-500" />
              {t("browserApp.browsingHistory") || "Browsing History"}
            </DialogTitle>
            {historyList.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setHistoryList([]);
                  toast.info(t("browserApp.historyCleared") || "Browsing history cleared");
                }}
                className="h-7 text-xs"
              >
                {t("browserApp.clearHistory") || "Clear History"}
              </Button>
            )}
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
            {historyList.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {t("browserApp.noHistory") || "Browsing history is empty."}
              </p>
            ) : (
              historyList.map((h, i) => (
                <div
                  key={i}
                  onClick={() => {
                    navigateTo(h.url);
                    setIsHistoryOpen(false);
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-muted/60 cursor-pointer group"
                >
                  <div className="truncate flex-1 mr-2">
                    <div className="text-sm font-medium truncate group-hover:text-cyan-500">
                      {h.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate font-mono">{h.url}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
