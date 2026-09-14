import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Globe,
  Plus,
  RotateCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Bot,
  Layers,
  ArrowUpRight,
  ListFilter,
  Terminal,
  Copy,
  Check,
  Key,
  Crown,
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
  domain: string;
  sitemapUrl?: string;
  status: "unverified" | "pending" | "crawling" | "indexed" | "error";
  verified: boolean;
  verificationToken: string;
  adminAdded?: boolean;
  pageCount: number;
  lastCrawledAt?: string;
  createdAt: string;
  error?: string;
  logs: SiteLog[];
  queuePosition?: number | null;
  pendingUrls?: string[];
  nextCrawlScheduledAt?: string | null;
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
  const user = session?.user;
  const isAdmin = user?.role === "admin" || String(user?.id) === "1";

  const [activeTab, setActiveTab] = useState<"sites" | "admin">("sites");
  const [sites, setSites] = useState<WebmasterSite[]>([]);
  const [adminSites, setAdminSites] = useState<WebmasterSite[]>([]);
  const [stats, setStats] = useState<WebmasterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);

  // User submission form state
  const [urlInput, setUrlInput] = useState("");
  const [sitemapInput, setSitemapInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Admin submission form state
  const [adminUrlInput, setAdminUrlInput] = useState("");
  const [adminSitemapInput, setAdminSitemapInput] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Verification state
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Selected site modal
  const [selectedSite, setSelectedSite] = useState<WebmasterSite | null>(null);
  const [sitePages, setSitePages] = useState<IndexedPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const adminSitesRef = useRef(adminSites);
  adminSitesRef.current = adminSites;
  const selectedSiteRef = useRef(selectedSite);
  selectedSiteRef.current = selectedSite;
  const isDetailsOpenRef = useRef(isDetailsOpen);
  isDetailsOpenRef.current = isDetailsOpen;
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchSitePages = useCallback(async (siteId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/webmaster/sites/${siteId}/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSitePages(data.pages || []);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const fetchSitesAndStats = useCallback(async (isInitial = false) => {
    if (!token) return;
    if (isInitial) setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [sitesRes, statsRes] = await Promise.all([
        fetch("/api/webmaster/sites", { headers }),
        fetch("/api/webmaster/stats", { headers }),
      ]);

      if (sitesRes.ok) {
        const sitesData = await sitesRes.json();
        const userSites: WebmasterSite[] = sitesData.sites || [];
        setSites(userSites);
        setSelectedSite((prev) => {
          if (!prev) return null;
          const updated = userSites.find((s) => s.id === prev.id);
          return updated || prev;
        });
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch {
      if (isInitial) toast.error("Failed to load webmaster data");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [token]);

  const fetchAdminSites = useCallback(async (isInitial = false) => {
    if (!token || !isAdmin) return;
    if (isInitial) setAdminLoading(true);
    try {
      const res = await fetch("/api/webmaster/admin/sites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const aSites: WebmasterSite[] = data.sites || [];
        setAdminSites(aSites);
        setSelectedSite((prev) => {
          if (!prev) return null;
          const updated = aSites.find((s) => s.id === prev.id);
          return updated || prev;
        });
      }
    } catch {
      if (isInitial) toast.error("Failed to load admin domains");
    } finally {
      if (isInitial) setAdminLoading(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    fetchSitesAndStats(true);
    if (isAdmin) {
      fetchAdminSites(true);
    }
    const interval = setInterval(() => {
      const isModalBusy =
        isDetailsOpenRef.current &&
        selectedSiteRef.current &&
        (selectedSiteRef.current.status === "crawling" ||
          selectedSiteRef.current.status === "pending" ||
          (selectedSiteRef.current.queuePosition !== undefined &&
            selectedSiteRef.current.queuePosition !== null));

      const hasCrawlingUser = sitesRef.current.some(
        (s) =>
          s.status === "crawling" ||
          s.status === "pending" ||
          (s.queuePosition !== undefined && s.queuePosition !== null) ||
          Boolean(s.nextCrawlScheduledAt)
      );
      const hasCrawlingAdmin = adminSitesRef.current.some(
        (s) =>
          s.status === "crawling" ||
          s.status === "pending" ||
          (s.queuePosition !== undefined && s.queuePosition !== null) ||
          Boolean(s.nextCrawlScheduledAt)
      );

      if (hasCrawlingUser || isModalBusy) {
        fetchSitesAndStats(false);
      }
      if (isAdmin && (hasCrawlingUser || hasCrawlingAdmin || isModalBusy)) {
        fetchAdminSites(false);
      }
      if (isDetailsOpenRef.current && selectedSiteRef.current?.status === "crawling") {
        fetchSitePages(selectedSiteRef.current.id);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [fetchSitesAndStats, fetchAdminSites, fetchSitePages, isAdmin]);

  useEffect(() => {
    if (isDetailsOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedSite?.logs?.length, isDetailsOpen]);

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

      toast.info("Website submitted! Please add the DNS TXT record to verify ownership before indexing.");
      setUrlInput("");
      setSitemapInput("");
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit website");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyDns = async (siteId: string) => {
    if (!token) return;
    setVerifyingId(siteId);
    try {
      const res = await fetch(`/api/webmaster/sites/${siteId}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "DNS verification check failed.");
      }
      toast.success(data.message || "Domain verified successfully!");
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "DNS verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleAdminAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!adminUrlInput.trim()) {
      toast.error("Please enter a website URL.");
      return;
    }

    setAdminSubmitting(true);
    try {
      const res = await fetch("/api/webmaster/admin/sites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: adminUrlInput.trim(),
          sitemapUrl: adminSitemapInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add domain");
      }

      toast.success("Domain added without verification and queued for crawling!");
      setAdminUrlInput("");
      setAdminSitemapInput("");
      fetchAdminSites();
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Error adding domain");
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminDeleteSite = async (siteId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to remove this domain and delete its indexed pages?")) {
      return;
    }

    try {
      const res = await fetch(`/api/webmaster/admin/sites/${siteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to remove domain");
      }
      toast.success("Domain removed from search index");
      fetchAdminSites();
      fetchSitesAndStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove domain");
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
      if (isAdmin) fetchAdminSites();
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
      if (isAdmin) fetchAdminSites();
    } catch (err: any) {
      toast.error(err.message || "Error deleting website");
    }
  };

  const handleOpenDetails = async (site: WebmasterSite) => {
    setSelectedSite(site);
    setIsDetailsOpen(true);
    setLoadingPages(true);
    await fetchSitePages(site.id);
    setLoadingPages(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    toast.success("Verification token copied to clipboard");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const isSiteBusy = (site: WebmasterSite) => {
    return site.status === "crawling" || site.status === "pending" || (site.queuePosition !== undefined && site.queuePosition !== null);
  };

  const getStatusBadge = (site: WebmasterSite) => {
    if (!site.verified && !site.adminAdded) {
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 gap-1 font-normal">
          <ShieldAlert className="w-3 h-3" /> Unverified
        </Badge>
      );
    }
    if (site.status === "crawling") {
      return (
        <Badge className="bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 hover:bg-cyan-500/20 gap-1 font-normal">
          <RotateCw className="w-3 h-3 animate-spin" /> Crawling
        </Badge>
      );
    }
    if (
      site.status === "pending" ||
      (site.queuePosition !== undefined && site.queuePosition !== null)
    ) {
      const pos = site.queuePosition || 1;
      return (
        <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 gap-1 font-normal">
          <Clock className="w-3 h-3" /> Queued ({pos})
        </Badge>
      );
    }
    switch (site.status) {
      case "indexed":
        if (site.nextCrawlScheduledAt && site.pendingUrls && site.pendingUrls.length > 0) {
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 gap-1 font-normal">
                <CheckCircle2 className="w-3 h-3" /> Indexed ({site.pageCount})
              </Badge>
              <Badge
                className="bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 gap-1 font-normal"
                title={`Next 20 pages will be queued in 10 minutes (${site.pendingUrls.length} remaining)`}
              >
                <Clock className="w-3 h-3" /> Next 20 in 10m
              </Badge>
            </div>
          );
        }
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 gap-1 font-normal">
            <CheckCircle2 className="w-3 h-3" /> Indexed
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 gap-1 font-normal">
            <AlertCircle className="w-3 h-3" /> Crawl Error
          </Badge>
        );
      default:
        return null;
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
            Verify domain ownership via DNS, submit sitemaps, and index websites for Oxygen Low's Software Web Browser.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {isAdmin && (
            <div className="flex bg-muted p-1 rounded-lg border border-border mr-2">
              <button
                onClick={() => setActiveTab("sites")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "sites"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                My Sites
              </button>
              <button
                onClick={() => setActiveTab("admin")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "admin"
                    ? "bg-card text-cyan-500 font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Admin Panel
              </button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchSitesAndStats();
              if (isAdmin) fetchAdminSites();
            }}
            className="gap-2"
          >
            <RotateCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Submitted Sites</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats?.totalSites ?? sites.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Websites registered in the index
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
            <CardDescription className="text-xs font-semibold uppercase">Verification & Bot</CardDescription>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              DNS TXT Verification Required
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-1">
            <div>User-Agent: <code className="text-cyan-400 font-mono">oxylow/1.0</code></div>
            <div>Contact: <span className="text-foreground">support@oxygenlow.com</span></div>
          </CardContent>
        </Card>
      </div>

      {/* TAB: ADMIN DOMAIN PANEL */}
      {isAdmin && activeTab === "admin" && (
        <div className="space-y-6">
          <Card className="border-cyan-500/30 bg-cyan-950/10 shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-cyan-400">
                <Crown className="w-5 h-5 text-amber-400" />
                Admin Domain Manager: Add Domains Without Verification
              </CardTitle>
              <CardDescription className="text-xs">
                As an administrator, you can add any website or domain directly to the index without DNS verification (e.g. popular platforms, reference sites, search directories).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <form onSubmit={handleAdminAddSite} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Website URL <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                      <Input
                        value={adminUrlInput}
                        onChange={(e) => setAdminUrlInput(e.target.value)}
                        placeholder="https://wikipedia.org"
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
                        value={adminSitemapInput}
                        onChange={(e) => setAdminSitemapInput(e.target.value)}
                        placeholder="https://wikipedia.org/sitemap.xml"
                        className="pl-9 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    Admin added domains are instantly verified and immediately queued for crawling.
                  </p>
                  <Button type="submit" disabled={adminSubmitting} className="gap-2">
                    {adminSubmitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" /> Adding...
                      </>
                    ) : (
                      <>
                        <Crown className="w-4 h-4 text-amber-400" /> Add & Crawl Directly
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Admin Domains Table */}
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-500" />
                Admin-Added Domains ({adminSites.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Global sites added by administrators without DNS verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {adminLoading && adminSites.length === 0 ? (
                <div className="py-12 flex justify-center items-center text-muted-foreground">
                  <RotateCw className="w-6 h-6 animate-spin text-cyan-500" />
                </div>
              ) : adminSites.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Globe className="w-10 h-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium">No admin domains added yet</p>
                  <p className="text-xs">Use the form above to add popular websites directly.</p>
                </div>
              ) : (
                <div className="divide-y divide-border border rounded-lg overflow-hidden">
                  {adminSites.map((site) => (
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
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                            Admin Added
                          </Badge>
                          {getStatusBadge(site)}
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
                          disabled={isSiteBusy(site)}
                          onClick={() => handleRecrawl(site.id)}
                          className="h-8 text-xs gap-1.5"
                          title="Re-crawl site"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isSiteBusy(site) ? "animate-spin" : ""}`} />
                          Re-crawl
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAdminDeleteSite(site.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500"
                          title="Delete domain"
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
        </div>
      )}

      {/* TAB: MY SITES (USER VIEW) */}
      {(!isAdmin || activeTab === "sites") && (
        <div className="space-y-6">
          {/* Submission Card */}
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-500" />
                Submit Website for Indexing
              </CardTitle>
              <CardDescription className="text-xs">
                Provide your website URL and optional sitemap. A DNS TXT verification record must be configured to verify ownership before the oxylow crawler indexes your pages.
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
                    Domain verification required before crawling. Rate limits & robots.txt strictly honored.
                  </p>
                  <Button type="submit" disabled={submitting} className="gap-2">
                    {submitting ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" /> Submitting...
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4" /> Submit Website
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
                Your Websites
              </CardTitle>
              <CardDescription className="text-xs">
                Manage your domains, verify DNS records, and track crawler status.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {loading && sites.length === 0 ? (
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
                  {sites.map((site) => {
                    const isUnverified = !site.verified && !site.adminAdded;
                    return (
                      <div
                        key={site.id}
                        className="p-4 flex flex-col space-y-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                              {getStatusBadge(site)}
                              {site.adminAdded && (
                                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                                  Admin Added
                                </Badge>
                              )}
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
                            {site.error && !isUnverified && (
                              <p className="text-xs text-rose-400 font-mono mt-1">
                                Error: {site.error}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isUnverified && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={verifyingId === site.id}
                                onClick={() => handleVerifyDns(site.id)}
                                className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${verifyingId === site.id ? "animate-spin" : ""}`} />
                                Verify DNS
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDetails(site)}
                              className="h-8 text-xs gap-1.5"
                            >
                              <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                              Details & Logs
                            </Button>
                            {!isUnverified && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSiteBusy(site)}
                                onClick={() => handleRecrawl(site.id)}
                                className="h-8 text-xs gap-1.5"
                                title="Re-crawl site"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${isSiteBusy(site) ? "animate-spin" : ""}`} />
                                Re-crawl
                              </Button>
                            )}
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

                        {/* DNS Verification Instruction Box */}
                        {isUnverified && (
                          <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                                <Key className="w-3.5 h-3.5" />
                                DNS Ownership Verification Required
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Add a TXT record to your DNS provider
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-background/60 p-2.5 rounded border border-border font-mono text-[11px]">
                              <div>
                                <span className="text-muted-foreground block text-[10px] font-sans">Type:</span>
                                <strong>TXT</strong>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] font-sans">Host:</span>
                                <span>@ or _oxylow-challenge</span>
                              </div>
                              <div className="flex items-center justify-between sm:col-span-1">
                                <div className="truncate mr-1">
                                  <span className="text-muted-foreground block text-[10px] font-sans">Value:</span>
                                  <span className="text-cyan-400 truncate block">
                                    oxylow-verification={site.verificationToken}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(`oxylow-verification=${site.verificationToken}`, site.id)}
                                  className="h-6 w-6 p-0 shrink-0"
                                  title="Copy TXT value"
                                >
                                  {copiedToken === site.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                              <span>Once the TXT record propagates (usually 1-5 mins), click "Verify DNS".</span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={verifyingId === site.id}
                                onClick={() => handleVerifyDns(site.id)}
                                className="h-7 text-xs gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              >
                                <RotateCw className={`w-3 h-3 ${verifyingId === site.id ? "animate-spin" : ""}`} />
                                Check DNS
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
                  {getStatusBadge(selectedSite)}
                </div>
              </DialogHeader>

              {/* Indexed Pages Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center justify-between border-b border-border pb-2">
                  <span>Indexed Pages ({loadingPages ? "..." : sitePages.length})</span>
                  {selectedSite.verified && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSiteBusy(selectedSite)}
                      onClick={() => handleRecrawl(selectedSite.id)}
                      className="h-7 text-xs gap-1.5"
                    >
                      <RotateCw className={`w-3 h-3 ${isSiteBusy(selectedSite) ? "animate-spin" : ""}`} /> Re-crawl
                    </Button>
                  )}
                </h3>

                {loadingPages ? (
                  <div className="py-6 flex justify-center text-muted-foreground">
                    <RotateCw className="w-5 h-5 animate-spin text-cyan-500" />
                  </div>
                ) : sitePages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3">
                    {selectedSite.verified
                      ? "No pages have been indexed yet."
                      : "Domain ownership must be verified before pages can be indexed."}
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
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
