import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Cookie,
  Copy,
  ArrowLeft,
  AlertTriangle,
  Plus,
  Activity,
  Trash2,
  Check,
  X,
  RefreshCw,
  ScanSearch,
  Eye,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  domain: string | null;
  api_key_prefix: string;
  first_request_at: string | null;
  created_at: string;
  updated_at?: string;
  config?: Record<string, any>;
  declaration?: CookieEntry[];
};

type CookieEntry = {
  name: string;
  provider: string;
  purpose: string;
  expiry: string;
  category: string;
};

type Consent = {
  id: string;
  consent_id: string;
  necessary: boolean;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
  custom: boolean;
  policy_version: number;
  language: string;
  country_code: string | null;
  created_at: string;
};

const POSITION_OPTIONS = ["bottom", "top", "left", "right", "center"] as const;
const CATEGORY_KEYS = [
  "necessary",
  "preferences",
  "statistics",
  "marketing",
  "custom",
] as const;

export function SimpleCookiesApp() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
      if (!res.ok) throw new Error(await res.text());
      return res;
    },
    [session],
  );

  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await authFetch("/api/simplecookies/projects");
      setProjects((await res.json()) || []);
    } catch (err) {
      console.error("[SimpleCookies] Failed to load projects:", err);
      toast.error(t("simpleCookies.loadFailed", undefined, "Failed to load projects."));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, t]);

  useEffect(() => {
    if (session) loadProjects();
  }, [session, loadProjects]);

  const handleCreate = async () => {
    try {
      const res = await authFetch("/api/simplecookies/projects", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), domain: newDomain.trim() || null }),
      });
      const data = await res.json();
      setNewKey(data.apiKey);
      loadProjects();
      toast.success(t("simpleCookies.created", undefined, "Project created."));
    } catch {
      toast.error(t("simpleCookies.createFailed", undefined, "Failed to create project."));
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await authFetch(`/api/simplecookies/projects/${toDelete.id}`, { method: "DELETE" });
      toast.success(t("simpleCookies.deleted", undefined, "Project deleted."));
      setToDelete(null);
      setDeleteText("");
      loadProjects();
    } catch {
      toast.error(t("simpleCookies.deleteFailed", undefined, "Failed to delete project."));
    } finally {
      setIsDeleting(false);
    }
  };

  if (selectedId) {
    return (
      <ProjectDashboard
        projectId={selectedId}
        onBack={() => {
          setSelectedId(null);
          loadProjects();
        }}
        authFetch={authFetch}
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center">
          <Cookie className="w-10 h-10 text-cyan-500" />
        </div>
        <h2 className="text-4xl font-bold text-white tracking-tight">
          {t("simpleCookies.title", undefined, "SimpleCookies")}
        </h2>
        <p className="text-lg text-slate-400 max-w-xl">
          {t(
            "simpleCookies.subtitle",
            undefined,
            "Free cookie consent manager. No limits — banners, scanner, and consent receipts for every site.",
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Activity className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={p.id}
            >
              <Card
                className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-cyan-500/50 transition-all"
                onClick={() => setSelectedId(p.id)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <CardTitle className="text-xl text-white line-clamp-1">
                      {p.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="default"
                        className={cn(
                          p.first_request_at
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-slate-500/10 text-slate-400",
                        )}
                      >
                        {p.first_request_at
                          ? t("simpleCookies.connected", undefined, "Connected")
                          : t("simpleCookies.notConnected", undefined, "Not connected")}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.name}`}
                        className="h-7 w-7 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete(p);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {p.domain || "—"} · Key: {p.api_key_prefix}••••••••
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-slate-500">
                    {t("simpleCookies.createdOn", undefined, "Created")}{" "}
                    {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          <Dialog
            open={isCreateOpen}
            onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) {
                setNewName("");
                setNewDomain("");
                setNewKey(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Card className="cursor-pointer border-dashed border-2 border-slate-800 bg-transparent hover:border-cyan-500/50 hover:bg-slate-900/30 transition-all flex flex-col items-center justify-center min-h-[200px]">
                <Plus className="w-10 h-10 text-slate-500 mb-2" />
                <span className="text-slate-400 font-medium">
                  {t("simpleCookies.createProject", undefined, "Create Project")}
                </span>
              </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
              <DialogHeader>
                <DialogTitle>
                  {t("simpleCookies.createTitle", undefined, "Create Project")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "simpleCookies.createDesc",
                    undefined,
                    "Each project is one website with its own API key and banner.",
                  )}
                </DialogDescription>
              </DialogHeader>
              {!newKey ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="sc-name">
                      {t("simpleCookies.nameLabel", undefined, "Project name")}
                    </Label>
                    <Input
                      id="sc-name"
                      placeholder="e.g., My Shop"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-slate-900 border-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sc-domain">
                      {t("simpleCookies.domainLabel", undefined, "Domain (optional)")}
                    </Label>
                    <Input
                      id="sc-domain"
                      placeholder="example.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="bg-slate-900 border-slate-800"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      {t("common.cancel", undefined, "Cancel")}
                    </Button>
                    <Button onClick={handleCreate} disabled={!newName.trim()}>
                      {t("simpleCookies.createButton", undefined, "Create")}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <Alert
                    variant="destructive"
                    className="bg-rose-500/10 border-rose-500/50 text-rose-400"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{t("simpleCookies.saveKeyTitle", undefined, "Save your key")}</AlertTitle>
                    <AlertDescription>
                      {t(
                        "simpleCookies.saveKeyDesc",
                        undefined,
                        "This key is only shown once. Copy it now.",
                      )}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Input
                      value={newKey}
                      readOnly
                      className="bg-slate-900 font-mono text-sm border-slate-800"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(newKey);
                        toast.success(t("simpleCookies.copied", undefined, "Copied"));
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => setIsCreateOpen(false)}>
                      {t("simpleCookies.done", undefined, "Done")}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={!!toDelete}
            onOpenChange={(open) => {
              if (!open) {
                setToDelete(null);
                setDeleteText("");
              }
            }}
          >
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
              <DialogHeader>
                <DialogTitle>{t("simpleCookies.deleteTitle", undefined, "Delete Project")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "simpleCookies.deleteDesc",
                    undefined,
                    "This permanently deletes the project, its config, declaration, and consent log.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>
                    {t("simpleCookies.typeToConfirm", undefined, "Type")}{" "}
                    <strong className="text-white">{toDelete?.name}</strong>
                    {" "}
                    {t("simpleCookies.toConfirm", undefined, "to confirm")}
                  </Label>
                  <Input
                    value={deleteText}
                    onChange={(e) => setDeleteText(e.target.value)}
                    className="bg-slate-900 border-slate-800"
                    placeholder={toDelete?.name}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setToDelete(null);
                      setDeleteText("");
                    }}
                  >
                    {t("common.cancel", undefined, "Cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleteText !== toDelete?.name || isDeleting}
                  >
                    {isDeleting
                      ? t("simpleCookies.deleting", undefined, "Deleting...")
                      : t("simpleCookies.deleteButton", undefined, "Delete")}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="mt-12">
        <h3 className="text-xl font-semibold text-white mb-6">
          {t("simpleCookies.installTitle", undefined, "Installation")}
        </h3>
        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
          <div className="p-4 bg-slate-950 border-b border-slate-800 font-mono text-sm text-slate-300">
            npm install @oxygenlow/simplecookies
          </div>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-slate-400">
              {t(
                "simpleCookies.installDesc",
                undefined,
                "Add the banner script to <head> or use the React / Hono / Next.js adapters. Pick a project above and paste its key.",
              )}
            </p>
            <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
              {`<script src="https://oxygenlow.com/simplecookies.js"\n        data-api-key="sk_YOUR_KEY" defer></script>`}
            </pre>
            <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
              {`import { SimpleCookiesProvider, SimpleCookiesBanner }\n  from "@oxygenlow/simplecookies/react";\n\n<SimpleCookiesProvider config={{ apiKey: "sk_YOUR_KEY" }}>\n  <SimpleCookiesBanner />\n</SimpleCookiesProvider>`}
            </pre>
            <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
              {`<!-- Gate a tracker until consent -->\n<script src="https://www.googletagmanager.com/gtag/js?id=G-XXX"\n        data-simplecookies-category="statistics"></script>`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectDashboard({
  projectId,
  onBack,
  authFetch,
}: {
  projectId: string;
  onBack: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [stats, setStats] = useState<{ total: number; acceptance_rate: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [declaration, setDeclaration] = useState<CookieEntry[]>([]);
  const [scanUrl, setScanUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [projRes, consRes, statsRes] = await Promise.all([
        authFetch(`/api/simplecookies/projects/${projectId}`),
        authFetch(`/api/simplecookies/projects/${projectId}/consents?limit=200`).catch(() => ({
          json: async () => ({ consents: [] }),
        })),
        authFetch(`/api/simplecookies/projects/${projectId}/stats`).catch(() => ({
          json: async () => null,
        })),
      ]);
      const data = await projRes.json();
      setProject(data);
      setDraft(data.config || {});
      setDeclaration(data.declaration || []);
      const cons = await consRes.json();
      setConsents(cons.consents || []);
      setStats(await statsRes.json());
    } catch {
      toast.error(t("simpleCookies.loadFailed", undefined, "Failed to load project."));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, projectId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/simplecookies/projects/${projectId}/config`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setDraft(await res.json());
      toast.success(t("simpleCookies.saved", undefined, "Saved."));
    } catch {
      toast.error(t("simpleCookies.saveFailed", undefined, "Failed to save."));
    } finally {
      setIsSaving(false);
    }
  };

  const saveDeclaration = async () => {
    setIsSaving(true);
    try {
      await authFetch(`/api/simplecookies/projects/${projectId}/declaration`, {
        method: "PUT",
        body: JSON.stringify({ cookies: declaration }),
      });
      toast.success(t("simpleCookies.saved", undefined, "Saved."));
    } catch {
      toast.error(t("simpleCookies.saveFailed", undefined, "Failed to save."));
    } finally {
      setIsSaving(false);
    }
  };

  const runScan = async () => {
    if (!scanUrl.trim()) {
      toast.error(t("simpleCookies.scanUrlRequired", undefined, "Enter a URL to scan."));
      return;
    }
    setIsScanning(true);
    try {
      const res = await authFetch(`/api/simplecookies/projects/${projectId}/scan`, {
        method: "POST",
        body: JSON.stringify({ url: scanUrl.trim() }),
      });
      const data = await res.json();
      setDeclaration(data.declaration || []);
      toast.success(
        t("simpleCookies.scanDone", { count: String((data.declaration || []).length) }, "Scan done: {count} cookies found."),
      );
    } catch {
      toast.error(t("simpleCookies.scanFailed", undefined, "Scan failed. Use a public URL."));
    } finally {
      setIsScanning(false);
    }
  };

  const rotateKey = async () => {
    try {
      const res = await authFetch(`/api/simplecookies/projects/${projectId}/rotate-key`, {
        method: "POST",
      });
      const data = await res.json();
      setRotatedKey(data.apiKey);
      toast.success(t("simpleCookies.keyRotated", undefined, "Key rotated. Copy it now."));
    } catch {
      toast.error(t("simpleCookies.saveFailed", undefined, "Failed to rotate key."));
    }
  };

  const set = (key: string, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  const overviewCards = useMemo(() => {
    const fully = consents.filter((c) => c.preferences && c.statistics && c.marketing && c.custom).length;
    return [
      { label: t("simpleCookies.totalConsents", undefined, "Total consents"), value: stats?.total ?? consents.length },
      { label: t("simpleCookies.acceptanceRate", undefined, "Acceptance rate"), value: `${stats?.acceptance_rate ?? (consents.length ? Math.round((fully / consents.length) * 1000) / 10 : 0)}%` },
      { label: t("simpleCookies.cookiesDeclared", undefined, "Cookies declared"), value: declaration.length },
      { label: t("simpleCookies.policyVersion", undefined, "Policy version"), value: draft.policy_version ?? 1 },
    ];
  }, [consents, stats, declaration, draft, t]);

  // Heartbeat: consent activity per hour over the last 24h (like WebDefender's traffic chart).
  const consentChartData = useMemo(() => {
    const buckets = new Map<string, { name: string; accepted: number; rejected: number }>();
    const now = Date.now();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now - i * 3600000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      if (!buckets.has(key)) buckets.set(key, { name: `${d.getHours()}:00`, accepted: 0, rejected: 0 });
    }
    for (const c of consents) {
      const end = new Date(c.created_at).getTime();
      if (Number.isNaN(end) || now - end > 24 * 3600000) continue;
      const d = new Date(end);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const fullyAccepted = c.preferences && c.statistics && c.marketing && c.custom;
      if (fullyAccepted) bucket.accepted++;
      else bucket.rejected++;
    }
    return [...buckets.values()];
  }, [consents]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of consents) {
      for (const key of CATEGORY_KEYS) {
        if ((c as any)[key]) counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [consents]);

  const handleDeleteProject = async () => {
    if (!project) return;
    setIsDeleting(true);
    try {
      await authFetch(`/api/simplecookies/projects/${projectId}`, { method: "DELETE" });
      toast.success(t("simpleCookies.deleted", undefined, "Project deleted."));
      onBack();
    } catch {
      toast.error(t("simpleCookies.deleteFailed", undefined, "Failed to delete project."));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Activity className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!project) return <div className="p-6 text-slate-400">Project not found</div>;

  return (
    <div className="h-full flex flex-col p-3 sm:p-6 max-w-[1600px] mx-auto w-full space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl sm:text-2xl font-bold text-white">{project.name}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t("common.refresh", undefined, "Refresh")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteText("");
              setIsDeleteOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t("simpleCookies.deleteButton", undefined, "Delete")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
        {overviewCards.map((c) => (
          <Card key={c.label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <p className="text-sm font-medium text-slate-400">{c.label}</p>
              <p className="text-3xl font-bold text-white mt-1">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto max-w-full pb-1 -mx-1 px-1">
          <TabsList className="bg-slate-900 border border-slate-800 shrink-0 w-max">
            <TabsTrigger value="overview">{t("simpleCookies.tabOverview", undefined, "Overview")}</TabsTrigger>
            <TabsTrigger value="banner">{t("simpleCookies.tabBanner", undefined, "Banner")}</TabsTrigger>
            <TabsTrigger value="declaration">{t("simpleCookies.tabDeclaration", undefined, "Cookies")}</TabsTrigger>
            <TabsTrigger value="consents">{t("simpleCookies.tabConsents", undefined, "Consents")}</TabsTrigger>
            <TabsTrigger value="settings">{t("simpleCookies.tabSettings", undefined, "Settings")}</TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-1.5" />
              {t("simpleCookies.tabPreview", undefined, "Preview")}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto mt-6">
          <TabsContent value="overview" className="m-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader>
                    <CardTitle>{t("simpleCookies.consentActivity", undefined, "Consent Activity (24h)")}</CardTitle>
                    <CardDescription>
                      {t("simpleCookies.consentActivityDesc", undefined, "Accepted (all categories) vs partial / rejected consents per hour.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {consents.length === 0 ? (
                      <div className="text-center text-slate-500 py-8">
                        {t("simpleCookies.noConsents", undefined, "No consents logged yet.")}
                      </div>
                    ) : (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={consentChartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="scColorAccepted" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="scColorRejected" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                              itemStyle={{ color: "#e2e8f0" }}
                            />
                            <Area type="monotone" dataKey="accepted" name={t("simpleCookies.accepted", undefined, "Accepted")} stroke="#10b981" fillOpacity={1} fill="url(#scColorAccepted)" />
                            <Area type="monotone" dataKey="rejected" name={t("simpleCookies.rejected", undefined, "Rejected / partial")} stroke="#f43f5e" fillOpacity={1} fill="url(#scColorRejected)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg">{t("simpleCookies.categoryBreakdown", undefined, "Category breakdown")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryCounts.length === 0 ? (
                      <div className="text-center text-slate-500 py-8">
                        {t("simpleCookies.noConsents", undefined, "No consents logged yet.")}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {categoryCounts.map(([category, count]) => {
                          const max = categoryCounts[0][1] || 1;
                          const pct = Math.round((count / max) * 100);
                          return (
                            <div key={category}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="capitalize text-slate-300">{category}</span>
                                <span className="font-mono text-slate-300">{count}</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-800">
                                <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>{t("simpleCookies.installation", undefined, "Installation")}</CardTitle>
                <CardDescription>
                  {t("simpleCookies.pasteSnippet", undefined, "Paste this snippet into <head> of your site.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly value={rotatedKey ? `data-api-key="${rotatedKey}"` : `Key: ${project.api_key_prefix}•••• (rotate to view)`} className="bg-slate-950 font-mono text-sm border-slate-800" />
                  <Button variant="outline" size="icon" onClick={() => { if (rotatedKey) { navigator.clipboard.writeText(rotatedKey); toast.success(t("simpleCookies.copied", undefined, "Copied")); } }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
                  {`<script src="https://oxygenlow.com/simplecookies.js" data-api-key="sk_..." defer></script>`}
                </pre>
                <Alert className="bg-slate-950 border-slate-800">
                  <Cookie className="h-4 w-4 text-cyan-500" />
                  <AlertTitle>{t("simpleCookies.scannerNote", undefined, "Auto-scanner")}</AlertTitle>
                  <AlertDescription className="text-slate-400">
                    {t("simpleCookies.scannerNoteDesc", undefined, "Use the Cookies tab to scan a public URL and generate the declaration. Static scan infers JS cookies from tracker scripts — review before publishing.")}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banner" className="m-0 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>{t("simpleCookies.bannerTitle", undefined, "Banner content")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("simpleCookies.titleLabel", undefined, "Title")}</Label>
                  <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.positionLabel", undefined, "Position")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {POSITION_OPTIONS.map((p) => (
                      <Button key={p} size="sm" variant={draft.position === p ? "default" : "outline"} onClick={() => set("position", p)}>
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>{t("simpleCookies.textLabel", undefined, "Text")}</Label>
                  <Input value={draft.text ?? ""} onChange={(e) => set("text", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.acceptLabelField", undefined, "Accept label")}</Label>
                  <Input value={draft.accept_label ?? ""} onChange={(e) => set("accept_label", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.rejectLabelField", undefined, "Reject label")}</Label>
                  <Input value={draft.reject_label ?? ""} onChange={(e) => set("reject_label", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.accentLabel", undefined, "Accent color")}</Label>
                  <Input value={draft.accent ?? "#06b6d4"} onChange={(e) => set("accent", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.backgroundLabel", undefined, "Background")}</Label>
                  <Input value={draft.background ?? "#0f172a"} onChange={(e) => set("background", e.target.value)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.policyVersion", undefined, "Policy version")}</Label>
                  <Input type="number" value={draft.policy_version ?? 1} onChange={(e) => set("policy_version", parseInt(e.target.value) || 1)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("simpleCookies.retentionDays", undefined, "Consent retention (days)")}</Label>
                  <Input type="number" value={draft.retention_days ?? 365} onChange={(e) => set("retention_days", parseInt(e.target.value) || 365)} className="bg-slate-950 border-slate-800" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t("simpleCookies.consentMode", undefined, "Google Consent Mode")}</Label>
                  <Switch checked={Boolean(draft.consent_mode)} onCheckedChange={(v) => set("consent_mode", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t("simpleCookies.respectDnt", undefined, "Respect Do Not Track")}</Label>
                  <Switch checked={Boolean(draft.respect_dnt)} onCheckedChange={(v) => set("respect_dnt", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t("simpleCookies.showPoweredBy", undefined, "Powered by SimpleCookies")}</Label>
                  <Switch
                    checked={Boolean(draft.show_powered_by ?? draft.showPoweredBy)}
                    onCheckedChange={(v) => {
                      set("show_powered_by", v);
                      set("showPoweredBy", v);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
            <Button onClick={saveConfig} disabled={isSaving}>
              {isSaving ? t("common.saving", undefined, "Saving...") : t("common.save", undefined, "Save")}
            </Button>
          </TabsContent>

          <TabsContent value="declaration" className="m-0 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>{t("simpleCookies.autoScanner", undefined, "Auto-scanner")}</CardTitle>
                <CardDescription>
                  {t("simpleCookies.scanDesc", undefined, "Scan any public URL to generate the cookie declaration.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={scanUrl}
                    onChange={(e) => setScanUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="bg-slate-950 border-slate-800 font-mono"
                  />
                  <Button onClick={runScan} disabled={isScanning}>
                    <ScanSearch className="w-4 h-4 mr-2" />
                    {isScanning ? t("simpleCookies.scanning", undefined, "Scanning...") : t("simpleCookies.scanButton", undefined, "Scan")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {declaration.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        {t("simpleCookies.noCookies", undefined, "No cookies yet. Run a scan or add one manually.")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    declaration.map((row, i) => (
                      <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="font-mono text-sm">{row.name}</TableCell>
                        <TableCell className="text-sm">{row.provider}</TableCell>
                        <TableCell className="text-sm text-slate-400">{row.purpose}</TableCell>
                        <TableCell className="text-sm">{row.expiry}</TableCell>
                        <TableCell>
                          <select
                            value={row.category}
                            onChange={(e) => {
                              const next = [...declaration];
                              next[i] = { ...row, category: e.target.value };
                              setDeclaration(next);
                            }}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
                          >
                            {CATEGORY_KEYS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeclaration(declaration.filter((_, x) => x !== i))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <CardContent className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() =>
                    setDeclaration([
                      ...declaration,
                      { name: "", provider: "First-party", purpose: "", expiry: "Session", category: "necessary" },
                    ])
                  }
                >
                  <Plus className="w-4 h-4 mr-2" /> {t("simpleCookies.addCookie", undefined, "Add cookie")}
                </Button>
                <Button onClick={saveDeclaration} disabled={isSaving}>
                  {isSaving ? t("common.saving", undefined, "Saving...") : t("common.save", undefined, "Save")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consents" className="m-0">
            <Card className="bg-slate-900 border-slate-800">
              <Table>
                <TableHeader className="bg-slate-950/50">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead>{t("simpleCookies.colTime", undefined, "Time")}</TableHead>
                    <TableHead>{t("simpleCookies.colConsent", undefined, "Consent")}</TableHead>
                    <TableHead>{t("simpleCookies.colChoice", undefined, "Choice")}</TableHead>
                    <TableHead>{t("simpleCookies.colPolicy", undefined, "Policy")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                        {t("simpleCookies.noConsents", undefined, "No consents logged yet.")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    consents.map((c) => (
                      <TableRow key={c.id} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="text-sm text-slate-400">
                          {new Date(c.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.consent_id.slice(0, 8)}…</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {CATEGORY_KEYS.map((k) => (
                              <Badge key={k} variant="outline" className={cn("text-[10px]", (c as any)[k] ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500")}>
                                {k === "necessary" ? <Check className="w-3 h-3" /> : (c as any)[k] ? "✓" : "—"}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">v{c.policy_version}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="m-0 space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>{t("simpleCookies.apiKey", undefined, "API key")}</CardTitle>
                <CardDescription>
                  {t("simpleCookies.rotateDesc", undefined, "Rotating invalidates the old key immediately.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-mono text-sm text-slate-400">Key: {project.api_key_prefix}••••••••</p>
                {rotatedKey && (
                  <div className="flex gap-2">
                    <Input value={rotatedKey} readOnly className="bg-slate-950 font-mono text-sm border-slate-800" />
                    <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(rotatedKey); toast.success(t("simpleCookies.copied", undefined, "Copied")); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <Button variant="outline" onClick={rotateKey}>
                  {t("simpleCookies.rotateKey", undefined, "Rotate key")}
                </Button>
                <p className="text-xs text-slate-500">
                  {t("simpleCookies.publicDeclaration", undefined, "Public declaration")}:{" "}
                  <code className="font-mono">/api/simplecookies/declaration/{project.id}</code>
                </p>
              </CardContent>
            </Card>

            <Card className="border-rose-500/30 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-rose-500">{t("simpleCookies.dangerZone", undefined, "Danger zone")}</CardTitle>
                <CardDescription>
                  {t("simpleCookies.dangerZoneDesc", undefined, "Deleting this project cannot be undone.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDeleteText("");
                    setIsDeleteOpen(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("simpleCookies.deleteProject", undefined, "Delete project")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="m-0 space-y-4">
            <BannerPreview draft={draft} />
          </TabsContent>
        </div>
      </Tabs>

      <Dialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      >
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle>{t("simpleCookies.deleteTitle", undefined, "Delete Project")}</DialogTitle>
            <DialogDescription>
              {t(
                "simpleCookies.deleteDesc",
                undefined,
                "This permanently deletes the project, its config, declaration, and consent log.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {t("simpleCookies.typeToConfirm", undefined, "Type")}{" "}
                <strong className="text-white">{project.name}</strong>
                {" "}
                {t("simpleCookies.toConfirm", undefined, "to confirm")}
              </Label>
              <Input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="bg-slate-900 border-slate-800"
                placeholder={project.name}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                {t("common.cancel", undefined, "Cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteProject}
                disabled={deleteText !== project.name || isDeleting}
              >
                {isDeleting
                  ? t("simpleCookies.deleting", undefined, "Deleting...")
                  : t("simpleCookies.deleteButton", undefined, "Delete")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BannerPreview({ draft }: { draft: Record<string, any> }) {
  const { t } = useTranslation();
  const [customizing, setCustomizing] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    preferences: true,
    statistics: false,
    marketing: false,
    custom: false,
  });
  const [acted, setActed] = useState<string | null>(null);
  const position = (draft.position ?? "bottom") as string;
  const categories = (draft.categories ?? {}) as Record<string, { label?: string; description?: string; enabled?: boolean }>;

  const wrapperClass =
    position === "top"
      ? "justify-center items-start pt-4"
      : position === "left"
        ? "justify-start items-end pl-4"
        : position === "right"
          ? "justify-end items-end pr-4"
          : position === "center"
            ? "justify-center items-center"
            : "justify-center items-end pb-4";

  const previewAction = (action: string) => {
    setActed(action);
    toast.success(t("simpleCookies.previewToast", undefined, `Preview: “${action}” (not saved)`));
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle>{t("simpleCookies.previewTitle", undefined, "Banner preview")}</CardTitle>
        <CardDescription>
          {t("simpleCookies.previewDesc", undefined, "Live preview of your banner with unsaved changes. Buttons are for preview only.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-2 font-mono text-xs text-slate-500">
              {(draft.domain as string | null) || "your-site.com"}
            </span>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {position}
            </Badge>
          </div>
          <div className={cn("relative flex h-[420px] p-4", wrapperClass)}>
            <div
              className="w-full max-w-[560px] rounded-xl p-4 shadow-2xl"
              style={{
                background: draft.background ?? "#0f172a",
                color: draft.text_color ?? "#f1f5f9",
                fontFamily: "system-ui, sans-serif",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
              role="dialog"
              aria-live="polite"
            >
              <div className="mb-1.5 text-base font-bold">
                {draft.title || t("simpleCookies.previewDefaultTitle", undefined, "We value your privacy")}
              </div>
              <div className="opacity-90">
                {draft.text || t("simpleCookies.previewDefaultText", undefined, "We use cookies to improve your experience.")}
              </div>

              {customizing && (
                <div className="mt-3 space-y-2">
                  {CATEGORY_KEYS.map((key) => {
                    const cat = categories[key];
                    const visible = key === "necessary" || cat?.enabled !== false;
                    if (!visible) return null;
                    const checked = key === "necessary" ? true : Boolean(toggles[key]);
                    return (
                      <label key={key} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={key === "necessary"}
                          onChange={(e) => setToggles((v) => ({ ...v, [key]: e.target.checked }))}
                          className="mt-1"
                        />
                        <span>
                          <strong className="capitalize">{cat?.label || key}</strong>{" "}
                          <span className="opacity-80">{cat?.description || ""}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => previewAction(draft.accept_label || "Accept all")}
                  className="rounded-lg px-3.5 py-2 font-semibold"
                  style={{ background: draft.accent ?? "#06b6d4", color: "#0b0f19", border: `1px solid ${draft.accent ?? "#06b6d4"}` }}
                >
                  {draft.accept_label || "Accept all"}
                </button>
                <button
                  type="button"
                  onClick={() => previewAction(draft.reject_label || "Reject all")}
                  className="rounded-lg px-3.5 py-2 font-semibold bg-transparent"
                  style={{ color: "inherit", border: "1px solid rgba(128,128,128,0.5)" }}
                >
                  {draft.reject_label || "Reject all"}
                </button>
                {draft.show_customize !== false && !customizing && (
                  <button
                    type="button"
                    onClick={() => setCustomizing(true)}
                    className="rounded-lg px-3.5 py-2 font-semibold bg-transparent"
                    style={{ color: "inherit", border: "1px solid rgba(128,128,128,0.5)" }}
                  >
                    {draft.customize_label || "Customize"}
                  </button>
                )}
                {customizing && (
                  <button
                    type="button"
                    onClick={() => previewAction(draft.save_label || "Save selection")}
                    className="rounded-lg px-3.5 py-2 font-semibold"
                    style={{ background: draft.accent ?? "#06b6d4", color: "#0b0f19", border: `1px solid ${draft.accent ?? "#06b6d4"}` }}
                  >
                    {draft.save_label || "Save selection"}
                  </button>
                )}
              </div>

              {Boolean(draft.show_powered_by ?? draft.showPoweredBy) && (
                <div className="mt-2 text-[11px] opacity-60">Powered by SimpleCookies</div>
              )}
              {acted && (
                <div className="mt-2 flex items-center gap-1.5 text-xs opacity-80">
                  <Check className="h-3.5 w-3.5" /> {acted}
                </div>
              )}
            </div>
          </div>
        </div>
        <Alert className="bg-slate-950 border-slate-800">
          <Eye className="h-4 w-4 text-cyan-500" />
          <AlertTitle>{t("simpleCookies.previewTip", undefined, "Preview tip")}</AlertTitle>
          <AlertDescription className="text-slate-400">
            {t("simpleCookies.previewTipDesc", undefined, "Edit the Banner tab and return here — the preview updates instantly without saving.")}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
