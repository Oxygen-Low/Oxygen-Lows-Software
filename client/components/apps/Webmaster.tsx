import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Globe,
  Plus,
  RotateCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Bot,
  Layers,
  ArrowUpRight,
  ListFilter,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";

interface SiteLog {
  timestamp: string;
  message: string;
  level?: "info" | "warn" | "error";
}

interface WebmasterSite {
  id: string;
  userId: string;
  url: string;
  sitemapUrl?: string;
  status: "pending" | "crawling" | "indexed" | "error";
  pageCount: number;
  lastCrawledAt?: string;
  createdAt: string;
  error?: string;
  logs: SiteLog[];
}

interface IndexedPage {
  id: string;
  siteId?: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  bodyPreview: string;
  indexedAt: string;
}

interface WebmasterStats {
  totalSites: number;
  totalPagesIndexed: number;
  globalIndexCount: number;
  botUserAgent: string;
  botContactEmail: string;
}

export function WebmasterApp() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const token = session?.access_token;

  const [sites, setSites] = useState<WebmasterSite[]>([]);
  const [stats, setStats] = useState<WebmasterStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [urlInput, setUrlInput] = useState("");
  const [sitemapInput, setSitemapInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Selected site modal
  const [selectedSite, setSelectedSite] = useState<WebmasterSite | null>(null);
  const [sitePages, setSitePages] = useState<IndexedPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const fetchSitesAndStats = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [sitesRes, statsRes] = await Promise.all([
        fetch("/api/webmaster/sites", { headers }),
        fetch("/api/webmaster/stats", { headers }),
      ]);

      if (sitesRes.ok) {
        const sitesData = await sitesRes.json();
        setSites(sitesData.sites || []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch {
      toast.error("Failed to load webmaster data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSitesAndStats();
    // Auto-refresh when any site is in crawling status
    const interval = setInterval(() => {
      if (sites.some((s) => s.status === "crawling" || s.status === "pending")) {
        fetchSitesAndStats();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchSitesAndStats, sites]);

  const handleSubmitSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("You must be signed in to submit websites.");
      return;
    }
    if (!urlInput.trim()) {
      toast.error("Please enter a website URL.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/webmaster/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: urlInput.trim(),
          sitemapUrl: sitemapInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit website");
      }

      toast.success("Website submitted! oxylow bot will now crawl and index it.");
      setUrlInput("");
      setSitemapInput("");
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit website");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecrawl = async (siteId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/webmaster/sites/${siteId}/crawl`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger re-crawl");
      }
      toast.success("Re-crawl triggered! oxylow bot is indexing the site.");
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Error starting re-crawl");
    }
  };

  const handleDelete = async (siteId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this website and remove all its pages from the search index?")) {
      return;
    }

    try {
      const res = await fetch(`/api/webmaster/sites/${siteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to delete website");
      }
      toast.success("Website removed from webmaster index");
      if (selectedSite?.id === siteId) {
        setIsDetailsOpen(false);
      }
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Error deleting website");
    }
  };

  const handleOpenDetails = async (site: WebmasterSite) => {
    setSelectedSite(site);
    setIsDetailsOpen(true);
    setLoadingPages(true);

    if (token) {
      try {
        const res = await fetch(`/api/webmaster/sites/${site.id}/pages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSitePages(data.pages || []);
        }
      } catch {
        setSitePages([]);
      } finally {
        setLoadingPages(false);
      }
    }
  };

  const getStatusBadge = (status: WebmasterSite["status"]) => {
    switch (status) {
      case "indexed":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 gap-1 font-normal">
            <CheckCircle2 className="w-3 h-3" /> Indexed
          </Badge>
        );
      case "crawling":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 gap-1 font-normal">
            <RotateCw className="w-3 h-3 animate-spin" /> Crawling
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 gap-1 font-normal">
            <Clock className="w-3 h-3" /> Queued
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 gap-1 font-normal">
            <AlertCircle className="w-3 h-3" /> Crawl Error
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto space-y-6 p-4 md:p-6 overflow-y-auto">
      {/* Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Bot className="w-8 h-8 text-cyan-500" />
            Webmaster Console
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Submit your URLs and sitemaps to have them crawled and indexed by the <strong className="text-foreground">oxylow</strong> bot for Oxygen Low's Software Web Browser.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSitesAndStats()}
          className="self-start md:self-auto gap-2"
        >
          <RotateCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Submitted Sites</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats?.totalSites ?? sites.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Websites registered under your account
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Indexed Pages</CardDescription>
            <CardTitle className="text-2xl font-bold text-cyan-500">{stats?.totalPagesIndexed ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Searchable pages in the oxylow index
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Bot Compliance</CardDescription>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Robots.txt & Rate-Limited
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-1">
            <div>User-Agent: <code className="text-cyan-400 font-mono">oxylow/1.0</code></div>
            <div>Contact: <span className="text-foreground">support@oxygenlow.com</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Submission Card */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-cyan-500" />
            Submit Website for Indexing
          </CardTitle>
          <CardDescription className="text-xs">
            Provide your website URL and an optional XML sitemap. oxylow will verify robots.txt, parse your pages, and add them to search.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <form onSubmit={handleSubmitSite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Website URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com"
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Sitemap URL <span className="text-muted-foreground text-[11px]">(Optional)</span>
                </label>
                <div className="relative">
                  <Layers className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    value={sitemapInput}
                    onChange={(e) => setSitemapInput(e.target.value)}
                    placeholder="https://example.com/sitemap.xml"
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                oxylow enforces per-domain request delays and obeys robots.txt directives.
              </p>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" /> Submit & Crawl
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sites List */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-500" />
            Your Submitted Websites
          </CardTitle>
          <CardDescription className="text-xs">
            Monitor crawl status, re-trigger indexing, and inspect discovered pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-12 flex justify-center items-center text-muted-foreground">
              <RotateCw className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Globe className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-medium">No websites submitted yet</p>
              <p className="text-xs">Use the submission form above to add your first website.</p>
            </div>
          ) : (
            <div className="divide-y divide-border border rounded-lg overflow-hidden">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-sm hover:text-cyan-400 flex items-center gap-1.5"
                      >
                        {site.url}
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                      {getStatusBadge(site.status)}
                    </div>
                    {site.sitemapUrl && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Layers className="w-3 h-3 text-cyan-500 shrink-0" />
                        Sitemap: {site.sitemapUrl}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                      <span>Pages indexed: <strong className="text-foreground">{site.pageCount}</strong></span>
                      {site.lastCrawledAt && (
                        <span>Last crawled: {new Date(site.lastCrawledAt).toLocaleString()}</span>
                      )}
                    </div>
                    {site.error && (
                      <p className="text-xs text-rose-400 font-mono mt-1">
                        Error: {site.error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDetails(site)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                      Details & Logs
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={site.status === "crawling"}
                      onClick={() => handleRecrawl(site.id)}
                      className="h-8 text-xs gap-1.5"
                      title="Re-crawl site"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${site.status === "crawling" ? "animate-spin" : ""}`} />
                      Re-crawl
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(site.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500"
                      title="Delete website"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Details & Crawl Logs Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedSite && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 pr-6">
                  <DialogTitle className="text-lg flex items-center gap-2 truncate">
                    <Globe className="w-5 h-5 text-cyan-500 shrink-0" />
                    {selectedSite.url}
                  </DialogTitle>
                  {getStatusBadge(selectedSite.status)}
                </div>
              </DialogHeader>

              {/* Indexed Pages Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center justify-between border-b border-border pb-2">
                  <span>Indexed Pages ({loadingPages ? "..." : sitePages.length})</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedSite.status === "crawling"}
                    onClick={() => handleRecrawl(selectedSite.id)}
                    className="h-7 text-xs gap-1.5"
                  >
                    <RotateCw className="w-3 h-3" /> Re-crawl
                  </Button>
                </h3>

                {loadingPages ? (
                  <div className="py-6 flex justify-center text-muted-foreground">
                    <RotateCw className="w-5 h-5 animate-spin text-cyan-500" />
                  </div>
                ) : sitePages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3">
                    No pages have been indexed yet.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border border rounded-lg">
                    {sitePages.map((p) => (
                      <div key={p.id} className="p-3 text-xs space-y-1">
                        <div className="font-semibold text-foreground truncate">{p.title}</div>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-500 hover:underline truncate block font-mono"
                        >
                          {p.url}
                        </a>
                        <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Crawl Logs Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 border-b border-border pb-2">
                  <Terminal className="w-4 h-4 text-cyan-500" />
                  oxylow Crawler Logs
                </h3>
                <div className="bg-muted/70 font-mono text-[11px] p-3 rounded-lg max-h-56 overflow-y-auto space-y-1.5 border border-border">
                  {selectedSite.logs && selectedSite.logs.length > 0 ? (
                    selectedSite.logs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-muted-foreground shrink-0">
                          [{new Date(log.timestamp).toLocaleTimeString()}]
                        </span>
                        <span
                          className={
                            log.level === "error"
                              ? "text-rose-400"
                              : log.level === "warn"
                              ? "text-amber-400"
                              : "text-foreground/80"
                          }
                        >
                          {log.message}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">No logs recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
