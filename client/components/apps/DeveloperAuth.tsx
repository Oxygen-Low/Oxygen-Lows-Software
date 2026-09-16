import { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Code,
  Terminal,
  Users,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  Lock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";

interface OAuthApp {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  client_id: string;
  api_key_prefix: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  website_url?: string;
  created_at: string;
  updated_at: string;
}

interface AppStats {
  total_authorized_users: number;
  active_tokens: number;
}

const AVAILABLE_SCOPES = [
  { id: "username", labelKey: "developerAuth.scopeUsername", descKey: "developerAuth.scopeUsernameDesc", defaultLabel: "Username", defaultDesc: "Access user's username" },
  { id: "display_name", labelKey: "developerAuth.scopeDisplayName", descKey: "developerAuth.scopeDisplayNameDesc", defaultLabel: "Display Name", defaultDesc: "Access user's display name" },
  { id: "email", labelKey: "developerAuth.scopeEmail", descKey: "developerAuth.scopeEmailDesc", defaultLabel: "Email Address", defaultDesc: "Access user's email address" },
  { id: "profile_picture", labelKey: "developerAuth.scopeProfilePicture", descKey: "developerAuth.scopeProfilePictureDesc", defaultLabel: "Profile Picture", defaultDesc: "Access user's avatar URL" },
  { id: "bio", labelKey: "developerAuth.scopeBio", descKey: "developerAuth.scopeBioDesc", defaultLabel: "Bio", defaultDesc: "Access user's public bio" },
];

export function DeveloperAuthApp() {
  const { session } = useAuth();
  const { t } = useTranslation();

  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsMap, setStatsMap] = useState<Record<string, AppStats>>({});

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<OAuthApp | null>(null);
  const [appName, setAppName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [redirectUrisText, setRedirectUrisText] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "username",
    "display_name",
  ]);
  const [submitting, setSubmitting] = useState(false);

  // New Key Display Dialog (shown once when created or regenerated)
  const [newKeyDialog, setNewKeyDialog] = useState<{
    open: boolean;
    app: OAuthApp | null;
    apiKey: string;
  }>({
    open: false,
    app: null,
    apiKey: "",
  });

  // Confirmation alerts
  const [deleteConfirmApp, setDeleteConfirmApp] = useState<OAuthApp | null>(null);
  const [regenerateConfirmApp, setRegenerateConfirmApp] = useState<OAuthApp | null>(null);

  // Copied states
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const token = session?.access_token;

  const fetchApps = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/oauth/apps", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: OAuthApp[] = await res.json();
        setApps(data);

        // Fetch stats for each app
        data.forEach(async (app) => {
          try {
            const statsRes = await fetch(`/api/oauth/apps/${app.id}/stats`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              setStatsMap((prev) => ({ ...prev, [app.id]: statsData }));
            }
          } catch {}
        });
      }
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleOpenCreateModal = () => {
    setEditingApp(null);
    setAppName("");
    setDescription("");
    setWebsiteUrl("");
    setRedirectUrisText("http://localhost:3000/api/auth/callback");
    setSelectedScopes(["username", "display_name", "email"]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: OAuthApp) => {
    setEditingApp(app);
    setAppName(app.name);
    setDescription(app.description || "");
    setWebsiteUrl(app.website_url || "");
    setRedirectUrisText((app.redirect_uris || []).join("\n"));
    setSelectedScopes(app.allowed_scopes || ["username", "display_name"]);
    setIsModalOpen(true);
  };

  const handleSaveApp = async () => {
    if (!appName.trim()) {
      toast.error(t("developerAuth.appNamePlaceholder", undefined, "Application name is required"));
      return;
    }

    const uris = redirectUrisText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (uris.length === 0) {
      toast.error("Please enter at least one redirect URI");
      return;
    }

    setSubmitting(true);
    try {
      if (editingApp) {
        // Update
        const res = await fetch(`/api/oauth/apps/${editingApp.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: appName.trim(),
            description: description.trim(),
            website_url: websiteUrl.trim(),
            redirect_uris: uris,
            allowed_scopes: selectedScopes,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update application");
        }

        toast.success(t("developerAuth.appUpdated", undefined, "Application updated successfully"));
        setIsModalOpen(false);
        fetchApps();
      } else {
        // Create
        const res = await fetch("/api/oauth/apps", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: appName.trim(),
            description: description.trim(),
            website_url: websiteUrl.trim(),
            redirect_uris: uris,
            allowed_scopes: selectedScopes,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create application");
        }

        const data = await res.json();
        toast.success(t("developerAuth.appCreated", undefined, "Application created successfully"));
        setIsModalOpen(false);
        fetchApps();

        // Show newly generated API key
        setNewKeyDialog({
          open: true,
          app: data.app,
          apiKey: data.apiKey,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!regenerateConfirmApp) return;
    try {
      const res = await fetch(
        `/api/oauth/apps/${regenerateConfirmApp.id}/regenerate-key`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to regenerate API key");
      }

      const data = await res.json();
      toast.success(t("developerAuth.keyRegenerated", undefined, "API key regenerated successfully"));
      fetchApps();

      setNewKeyDialog({
        open: true,
        app: regenerateConfirmApp,
        apiKey: data.apiKey,
      });
    } catch (err: any) {
      toast.error(err.message || "Error regenerating key");
    } finally {
      setRegenerateConfirmApp(null);
    }
  };

  const handleDeleteApp = async () => {
    if (!deleteConfirmApp) return;
    try {
      const res = await fetch(`/api/oauth/apps/${deleteConfirmApp.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete application");
      }

      toast.success(t("developerAuth.appDeleted", undefined, "Application deleted successfully"));
      fetchApps();
    } catch (err: any) {
      toast.error(err.message || "Error deleting application");
    } finally {
      setDeleteConfirmApp(null);
    }
  };

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else if (type === "client") {
        setCopiedClientId(true);
        setTimeout(() => setCopiedClientId(false), 2000);
      } else {
        setCopiedSnippet(type);
        setTimeout(() => setCopiedSnippet(null), 2000);
      }
      toast.success(t("developerAuth.copied", undefined, "Copied to clipboard"));
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <KeyRound className="w-6 h-6 text-cyan-400" />
            {t("developerAuth.title", undefined, "Developer Auth")}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {t(
              "developerAuth.subtitle",
              undefined,
              "OAuth 2.0 applications, credentials, and authentication integrations",
            )}
          </p>
        </div>
        <Button
          onClick={handleOpenCreateModal}
          className="bg-cyan-600 hover:bg-cyan-500 text-white gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          {t("developerAuth.createNewApp", undefined, "Create Application")}
        </Button>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <p className="text-sm">Loading applications...</p>
        </div>
      ) : apps.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800 border-dashed text-center py-12">
          <CardContent className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-cyan-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {t("developerAuth.noApps", undefined, "No authentication applications yet")}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {t(
                "developerAuth.noAppsDesc",
                undefined,
                "Create your first application to obtain an API key and integrate Oxygen Low's Software authentication into your website or app.",
              )}
            </p>
            <Button
              onClick={handleOpenCreateModal}
              className="mt-2 bg-cyan-600 hover:bg-cyan-500 text-white gap-2"
            >
              <Plus className="w-4 h-4" />
              {t("developerAuth.createNewApp", undefined, "Create Application")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {apps.map((app) => {
            const stats = statsMap[app.id] || { total_authorized_users: 0, active_tokens: 0 };
            const firstRedirect = app.redirect_uris?.[0] || "";
            const testUrl = `${window.location.origin}/oauth/authorize?client_id=${app.client_id}&redirect_uri=${encodeURIComponent(firstRedirect)}&state=demo_test`;

            return (
              <Card key={app.id} className="bg-slate-900/70 border-slate-800 overflow-hidden shadow-lg">
                <CardHeader className="bg-slate-950/40 border-b border-slate-800/80 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        <span>{app.name}</span>
                        {app.website_url && (
                          <a
                            href={app.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-cyan-400 transition"
                            title={app.website_url}
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </CardTitle>
                      {app.description && (
                        <CardDescription className="text-slate-400 text-xs mt-0.5">
                          {app.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditModal(app)}
                        className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        {t("developerAuth.edit", undefined, "Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRegenerateConfirmApp(app)}
                        className="h-8 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t("developerAuth.regenerateKey", undefined, "Regenerate Key")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmApp(app)}
                        className="h-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10 text-xs px-2"
                        title={t("developerAuth.delete", undefined, "Delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-5">
                  {/* Credentials & Stats Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Credentials */}
                    <div className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>{t("developerAuth.clientId", undefined, "Client ID")}</span>
                          <button
                            onClick={() => handleCopy(app.client_id, `client_${app.id}`)}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
                          >
                            {copiedSnippet === `client_${app.id}` ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {t("developerAuth.copy", undefined, "Copy")}
                          </button>
                        </div>
                        <code className="text-xs text-cyan-300 font-mono block bg-slate-900 px-2 py-1.5 rounded border border-slate-800 select-all">
                          {app.client_id}
                        </code>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>{t("developerAuth.apiKeyPrefix", undefined, "API Key Prefix")}</span>
                          <span className="text-[11px] text-slate-500">Secret hashed</span>
                        </div>
                        <code className="text-xs text-slate-300 font-mono block bg-slate-900 px-2 py-1.5 rounded border border-slate-800">
                          {app.api_key_prefix}
                        </code>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-center">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                          <Users className="w-3.5 h-3.5 text-cyan-400" />
                          {t("developerAuth.statsAuthorizedUsers", undefined, "Authorized Users")}
                        </span>
                        <span className="text-2xl font-bold text-white">
                          {stats.total_authorized_users}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-center">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          {t("developerAuth.statsActiveTokens", undefined, "Active Tokens")}
                        </span>
                        <span className="text-2xl font-bold text-white">
                          {stats.active_tokens}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Scopes & Redirect URIs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-slate-300 block mb-1.5">
                        {t("developerAuth.permissions", undefined, "Requested Permissions (Scopes)")}:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(app.allowed_scopes || []).map((scope) => (
                          <Badge
                            key={scope}
                            variant="outline"
                            className="bg-slate-950 text-cyan-300 border-slate-800 text-[11px] py-0.5"
                          >
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-300 block mb-1.5">
                        {t("developerAuth.redirectUris", undefined, "Redirect URIs")}:
                      </span>
                      <ul className="space-y-1 text-slate-400 font-mono text-[11px]">
                        {(app.redirect_uris || []).map((uri, idx) => (
                          <li key={idx} className="truncate bg-slate-950 px-2 py-0.5 rounded border border-slate-800/60">
                            {uri}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Quick Start Tabs */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <Tabs defaultValue="env" className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <TabsList className="bg-slate-950 border border-slate-800 h-8">
                          <TabsTrigger value="env" className="text-xs py-1 px-3">
                            {t("developerAuth.envSnippet", undefined, "Environment (.env)")}
                          </TabsTrigger>
                          <TabsTrigger value="code" className="text-xs py-1 px-3">
                            {t("developerAuth.sdkIntegration", undefined, "SDK (@oxygenlow/auth)")}
                          </TabsTrigger>
                        </TabsList>

                        {firstRedirect && (
                          <a
                            href={testUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {t("developerAuth.openTestLogin", undefined, "Open Login Screen")}
                          </a>
                        )}
                      </div>

                      <TabsContent value="env" className="mt-0">
                        <div className="relative">
                          <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
{`OXYGEN_CLIENT_ID=${app.client_id}
OXYGEN_API_KEY=your_secret_api_key_here
OXYGEN_BASE_URL=${window.location.origin}`}
                          </pre>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleCopy(
                                `OXYGEN_CLIENT_ID=${app.client_id}\nOXYGEN_API_KEY=your_secret_api_key_here\nOXYGEN_BASE_URL=${window.location.origin}`,
                                `env_${app.id}`,
                              )
                            }
                            className="absolute top-2 right-2 h-7 px-2 text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                          >
                            {copiedSnippet === `env_${app.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="code" className="mt-0">
                        <div className="relative">
                          <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto">
{`import { OxygenAuth } from "@oxygenlow/auth";

const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID,
  apiKey: process.env.OXYGEN_API_KEY,
});

// 1. Generate redirect login URL
const loginUrl = auth.getAuthorizationUrl({
  redirectUri: "${firstRedirect || "http://localhost:3000/api/auth/callback"}",
  scopes: ${JSON.stringify(app.allowed_scopes || ["username", "email"])},
  state: "random_csrf_token",
});

// 2. In your callback endpoint, exchange code for user profile
const { accessToken, user } = await auth.exchangeCode({
  code: req.query.code,
  redirectUri: "${firstRedirect || "http://localhost:3000/api/auth/callback"}",
});`}
                          </pre>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleCopy(
                                `import { OxygenAuth } from "@oxygenlow/auth";\n\nconst auth = new OxygenAuth({\n  clientId: "${app.client_id}",\n  apiKey: process.env.OXYGEN_API_KEY,\n});\n\nconst loginUrl = auth.getAuthorizationUrl({\n  redirectUri: "${firstRedirect || "http://localhost:3000/api/auth/callback"}",\n  scopes: ${JSON.stringify(app.allowed_scopes || ["username", "email"])},\n});`,
                                `code_${app.id}`,
                              )
                            }
                            className="absolute top-2 right-2 h-7 px-2 text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                          >
                            {copiedSnippet === `code_${app.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingApp
                ? t("developerAuth.edit", undefined, "Edit") + " " + editingApp.name
                : t("developerAuth.createNewApp", undefined, "Create Application")}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Configure your OAuth application name, redirect callback URLs, and requested user scopes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-name" className="text-xs text-slate-300">
                {t("developerAuth.appName", undefined, "Application Name")} *
              </Label>
              <Input
                id="app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder={t("developerAuth.appNamePlaceholder", undefined, "e.g. My Custom Game")}
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="app-desc" className="text-xs text-slate-300">
                {t("developerAuth.description", undefined, "Description")}
              </Label>
              <Input
                id="app-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("developerAuth.descriptionPlaceholder", undefined, "Briefly describe your application")}
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="app-website" className="text-xs text-slate-300">
                {t("developerAuth.websiteUrl", undefined, "Website URL")}
              </Label>
              <Input
                id="app-website"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder={t("developerAuth.websiteUrlPlaceholder", undefined, "https://example.com")}
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="app-redirects" className="text-xs text-slate-300">
                {t("developerAuth.redirectUris", undefined, "Redirect URIs (one per line)")} *
              </Label>
              <Textarea
                id="app-redirects"
                value={redirectUrisText}
                onChange={(e) => setRedirectUrisText(e.target.value)}
                placeholder={t(
                  "developerAuth.redirectUrisPlaceholder",
                  undefined,
                  "http://localhost:3000/api/auth/callback\nhttps://example.com/api/auth/callback",
                )}
                rows={3}
                className="bg-slate-950 border-slate-800 font-mono text-xs"
              />
              <p className="text-[11px] text-slate-500">
                {t(
                  "developerAuth.redirectUrisHelp",
                  undefined,
                  "Enter full redirect URIs. http://localhost and http://127.0.0.1 are allowed for testing; production URLs must use HTTPS.",
                )}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <Label className="text-xs text-slate-300 block">
                {t("developerAuth.permissions", undefined, "Requested Permissions (Scopes)")}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {AVAILABLE_SCOPES.map((scope) => {
                  const checked = selectedScopes.includes(scope.id);
                  return (
                    <label
                      key={scope.id}
                      className="flex items-start gap-2 text-xs cursor-pointer select-none hover:text-cyan-300 transition"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          if (val) {
                            setSelectedScopes((prev) => [...prev, scope.id]);
                          } else {
                            setSelectedScopes((prev) => prev.filter((s) => s !== scope.id));
                          }
                        }}
                        className="mt-0.5 border-slate-700"
                      />
                      <div>
                        <span className="font-medium text-white block">
                          {t(scope.labelKey, undefined, scope.defaultLabel)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {t(scope.descKey, undefined, scope.defaultDesc)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              {t("developerAuth.cancel", undefined, "Cancel")}
            </Button>
            <Button
              onClick={handleSaveApp}
              disabled={submitting}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {submitting ? "Saving..." : t("developerAuth.save", undefined, "Save Application")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Key Display Dialog (Shown ONLY once upon creation or regeneration) */}
      <Dialog
        open={newKeyDialog.open}
        onOpenChange={(open) => {
          if (!open) setNewKeyDialog({ open: false, app: null, apiKey: "" });
        }}
      >
        <DialogContent className="bg-slate-900 border-amber-500/40 text-white max-w-lg shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-2">
              <Lock className="w-5 h-5" />
            </div>
            <DialogTitle className="text-amber-400">
              {t("developerAuth.keyGeneratedTitle", undefined, "Save Your Secret API Key")}
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-xs">
              {t(
                "developerAuth.keyGeneratedDesc",
                undefined,
                "This secret API key will only be shown once. Store it securely in your server's environment variables.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {newKeyDialog.app && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">
                  {t("developerAuth.clientId", undefined, "Client ID")}
                </Label>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-cyan-300 font-mono bg-slate-950 p-2 rounded border border-slate-800 flex-1 truncate">
                    {newKeyDialog.app.client_id}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCopy(newKeyDialog.app!.client_id, "dialog_client")
                    }
                    className="border-slate-700 h-8 px-2.5 text-xs text-slate-300"
                  >
                    {copiedSnippet === "dialog_client" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-amber-400 font-semibold flex items-center justify-between">
                <span>{t("developerAuth.apiKey", undefined, "Secret API Key")}</span>
                <span className="text-[10px] text-red-400">Never share publicly</span>
              </Label>
              <div className="flex items-center gap-2">
                <code className="text-xs text-amber-300 font-mono bg-slate-950 p-2 rounded border border-amber-500/30 flex-1 select-all break-all">
                  {newKeyDialog.apiKey}
                </code>
                <Button
                  size="sm"
                  onClick={() => handleCopy(newKeyDialog.apiKey, "dialog_key")}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-8 px-3 text-xs gap-1"
                >
                  {copiedSnippet === "dialog_key" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {t("developerAuth.copy", undefined, "Copy")}
                </Button>
              </div>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-lg text-xs text-amber-200/90 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                Add this key to your server's <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">.env</code> file under <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">OXYGEN_API_KEY</code>. You will not be able to retrieve this exact key again.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() =>
                setNewKeyDialog({ open: false, app: null, apiKey: "" })
              }
              className="bg-slate-800 hover:bg-slate-700 text-white w-full"
            >
              I have securely saved my API key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={Boolean(deleteConfirmApp)}
        onOpenChange={(open) => !open && setDeleteConfirmApp(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">
              {t("developerAuth.delete", undefined, "Delete Application")}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-xs">
              {t(
                "developerAuth.deleteConfirm",
                undefined,
                "Are you sure you want to delete this application? All active user sessions and tokens for this app will be revoked.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              {t("developerAuth.cancel", undefined, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteApp}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {t("developerAuth.delete", undefined, "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Key Confirmation Alert */}
      <AlertDialog
        open={Boolean(regenerateConfirmApp)}
        onOpenChange={(open) => !open && setRegenerateConfirmApp(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-400">
              {t("developerAuth.regenerateKey", undefined, "Regenerate API Key")}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-xs">
              {t(
                "developerAuth.regenerateKeyConfirm",
                undefined,
                "Are you sure you want to regenerate your API key? The previous key will stop working immediately.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              {t("developerAuth.cancel", undefined, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateKey}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold"
            >
              {t("developerAuth.regenerateKey", undefined, "Regenerate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DeveloperAuthApp;
