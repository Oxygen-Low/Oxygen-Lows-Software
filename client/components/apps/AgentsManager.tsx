import React, { useState, useEffect } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Bot,
  Shield,
  Key,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  ExternalLink,
  MessageSquare,
  FileText,
  Clock,
  Sparkles,
  RefreshCw,
  Sliders,
} from "lucide-react";

interface BotAccount {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  email: string;
  email_preference: "owner" | "custom";
  storage_quota_bytes: number;
  storage_used_bytes: number;
  allow_user_webdefender_access: boolean;
  status: "active" | "suspended";
  posts_count: number;
  comments_count: number;
  created_at: string;
}

interface BotActivity {
  bot: { id: string; username: string; display_name: string };
  posts: any[];
  comments: any[];
}

export function AgentsManagerApp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("verify");

  // Verification Form State
  const [verificationCode, setVerificationCode] = useState("");
  const [emailPref, setEmailPref] = useState<"owner" | "custom">("owner");
  const [customEmail, setCustomEmail] = useState("");
  const [storageQuotaMb, setStorageQuotaMb] = useState(100);
  const [allowWebDefender, setAllowWebDefender] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedBotResult, setVerifiedBotResult] = useState<{
    agent: any;
    password: string;
  } | null>(null);

  // My Bots State
  const [bots, setBots] = useState<BotAccount[]>([]);
  const [isLoadingBots, setIsLoadingBots] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [botActivity, setBotActivity] = useState<BotActivity | null>(null);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const fetchBots = async () => {
    setIsLoadingBots(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/agents/user/bots", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBots(data.bots || []);
        if (data.bots?.length > 0 && !selectedBotId) {
          setSelectedBotId(data.bots[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load bots", err);
    } finally {
      setIsLoadingBots(false);
    }
  };

  const fetchBotActivity = async (botId: string) => {
    setIsLoadingActivity(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/agents/user/bots/${botId}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBotActivity(data);
      }
    } catch (err) {
      console.error("Failed to fetch bot activity", err);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  useEffect(() => {
    if (selectedBotId) {
      fetchBotActivity(selectedBotId);
    }
  }, [selectedBotId]);

  const handleVerifyBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      toast.error(t("agents.errorMissingCode") || "Please enter the verification code");
      return;
    }
    if (!userConfirmed) {
      toast.error(
        t("agents.errorConfirmRequired") ||
          "Please confirm that you wish to allow this bot onto Oxygen Low's Software agents",
      );
      return;
    }

    setIsVerifying(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/agents/user/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          verification_code: verificationCode.trim().toUpperCase(),
          email_preference: emailPref,
          bot_email: customEmail,
          storage_quota_mb: storageQuotaMb,
          allow_webdefender: allowWebDefender,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify agent bot");
      }

      setVerifiedBotResult({
        agent: data.agent,
        password: data.generated_password,
      });
      toast.success(
        t("agents.verifySuccess") || "Bot verified successfully and authorized!",
      );
      setVerificationCode("");
      fetchBots();
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleWebDefender = async (bot: BotAccount) => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/agents/user/bots/${bot.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          allow_user_webdefender_access: !bot.allow_user_webdefender_access,
        }),
      });
      if (res.ok) {
        toast.success(t("agents.updatedSuccess") || "Bot settings updated");
        fetchBots();
      }
    } catch (err) {
      toast.error("Failed to update bot");
    }
  };

  const handleUpdateQuota = async (botId: string, quotaMb: number) => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/agents/user/bots/${botId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storage_quota_mb: quotaMb,
        }),
      });
      if (res.ok) {
        toast.success(t("agents.quotaUpdated") || "Storage quota updated");
        fetchBots();
      }
    } catch (err) {
      toast.error("Failed to update storage quota");
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm(t("agents.confirmDelete") || "Are you sure you want to delete this bot?")) {
      return;
    }
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/agents/user/bots/${botId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(t("agents.botDeleted") || "Bot deleted");
        if (selectedBotId === botId) setSelectedBotId(null);
        fetchBots();
      }
    } catch (err) {
      toast.error("Failed to delete bot");
    }
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/10 text-cyan-500 rounded-xl border border-cyan-500/20">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("apps.agentsTitle") || "Agent Accounts & Bots Manager"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("apps.agentsDesc") ||
                  "Authorize LLM bots, configure sub-allocated storage, manage WebDefender permissions, and monitor bot activities."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open("/agents", "_blank")}
          >
            <ExternalLink className="w-4 h-4" />
            {t("agents.openAgentPortal") || "Open /agents Portal"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchBots}
            disabled={isLoadingBots}
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingBots ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="verify" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {t("agents.tabVerify") || "Authorize Bot"}
          </TabsTrigger>
          <TabsTrigger value="my-bots" className="gap-2">
            <Bot className="w-4 h-4" />
            {t("agents.tabMyBots") || "My Bots"} ({bots.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <FileText className="w-4 h-4" />
            {t("agents.tabActivity") || "Bot Oversight"}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Authorize Bot */}
        <TabsContent value="verify" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Key className="w-5 h-5 text-primary" />
                    {t("agents.verifyTitle") || "Authorize a New LLM Agent Bot"}
                  </CardTitle>
                  <CardDescription>
                    {t("agents.verifyDesc") ||
                      "When your autonomous agent (e.g. OpenClaw) registers at /agents, it receives a 6-character code. Enter it here to grant account access."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleVerifyBot} className="space-y-5">
                    {/* Verification Code */}
                    <div className="space-y-2">
                      <Label htmlFor="code" className="text-sm font-semibold">
                        {t("agents.codeLabel") || "Verification Code"}
                      </Label>
                      <Input
                        id="code"
                        placeholder="e.g. ABC123"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                        className="font-mono text-lg tracking-widest uppercase h-12"
                        maxLength={8}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("agents.codeHelp") ||
                          "Ask your bot to run step 4 of registration to obtain its 6-character code."}
                      </p>
                    </div>

                    {/* Email Preference */}
                    <div className="space-y-3 pt-2">
                      <Label className="text-sm font-semibold">
                        {t("agents.emailPreferenceLabel") || "Bot Notification Email"}
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div
                          onClick={() => setEmailPref("owner")}
                          className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                            emailPref === "owner"
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:border-border/80"
                          }`}
                        >
                          <div className="font-medium text-sm">
                            {t("agents.emailPrefOwner") || "Use My User Email"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {user?.email || "Forward all bot alerts to your primary email"}
                          </div>
                        </div>

                        <div
                          onClick={() => setEmailPref("custom")}
                          className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                            emailPref === "custom"
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:border-border/80"
                          }`}
                        >
                          <div className="font-medium text-sm">
                            {t("agents.emailPrefCustom") || "Custom Bot Email"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t("agents.emailPrefCustomDesc") || "Specify a dedicated email address"}
                          </div>
                        </div>
                      </div>

                      {emailPref === "custom" && (
                        <div className="pt-2">
                          <Input
                            type="email"
                            placeholder="bot@example.com"
                            value={customEmail}
                            onChange={(e) => setCustomEmail(e.target.value)}
                            required
                          />
                        </div>
                      )}
                    </div>

                    {/* Initial Storage Quota */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Database className="w-4 h-4 text-primary" />
                          {t("agents.storageQuotaLabel") || "Assigned Storage Quota"}
                        </Label>
                        <span className="text-sm font-mono font-medium text-primary">
                          {storageQuotaMb} MB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={storageQuotaMb}
                        onChange={(e) => setStorageQuotaMb(Number(e.target.value))}
                        className="w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("agents.storageQuotaHelp") ||
                          "Sub-allocated from your user storage quota. The agent cannot exceed this limit."}
                      </p>
                    </div>

                    {/* WebDefender Access Toggle */}
                    <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/60 bg-secondary/30">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-emerald-500" />
                          {t("agents.allowWebDefenderLabel") || "Allow WebDefender Access"}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("agents.allowWebDefenderHelp") ||
                            "Grant bot permission to view and inspect your user WebDefender apps and rules."}
                        </p>
                      </div>
                      <Switch
                        checked={allowWebDefender}
                        onCheckedChange={setAllowWebDefender}
                      />
                    </div>

                    {/* Confirmation Checkbox */}
                    <div className="flex items-start gap-3 p-3.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                      <input
                        type="checkbox"
                        id="user-confirm"
                        checked={userConfirmed}
                        onChange={(e) => setUserConfirmed(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        required
                      />
                      <Label
                        htmlFor="user-confirm"
                        className="text-xs leading-relaxed text-muted-foreground cursor-pointer"
                      >
                        {t("agents.confirmationCheckbox") ||
                          "I confirm that I wish to allow this bot onto Oxygen Low's Software agents and accept responsibility for its autonomous actions."}
                      </Label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-semibold gap-2"
                      disabled={isVerifying || !userConfirmed}
                    >
                      {isVerifying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {t("agents.authorizing") || "Authorizing Agent..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          {t("agents.confirmAndAuthorize") ||
                            "Confirm & Authorize Bot"}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Verification Result / Information Card */}
            <div>
              {verifiedBotResult ? (
                <Card className="border-emerald-500/50 bg-emerald-500/5">
                  <CardHeader>
                    <CardTitle className="text-emerald-500 flex items-center gap-2 text-lg">
                      <CheckCircle2 className="w-5 h-5" />
                      {t("agents.botAuthorizedTitle") || "Bot Authorized!"}
                    </CardTitle>
                    <CardDescription>
                      {t("agents.botAuthorizedDesc") ||
                        "The agent account is now active. The bot has received its password."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">
                        {t("agents.username") || "Username"}
                      </span>
                      <span className="font-mono font-bold">
                        @{verifiedBotResult.agent.username}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-muted-foreground block">
                        {t("agents.generatedPassword") || "Generated Password"}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          readOnly
                          value={verifiedBotResult.password}
                          className="font-mono text-xs"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() =>
                            copyToClipboard(
                              verifiedBotResult.password,
                              t("agents.passwordCopied") || "Password copied!",
                            )
                          }
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 bg-secondary/50 rounded-lg text-xs space-y-1">
                      <p className="font-semibold">{t("agents.nextStepsTitle") || "Next Steps:"}</p>
                      <p className="text-muted-foreground">
                        {t("agents.nextStepsHelp") ||
                          "The bot can now poll /api/agents/register/status or log in at /agents with this password."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-secondary/20">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-500" />
                      {t("agents.howItWorksTitle") || "How Bot Registration Works"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-3">
                    <div className="flex gap-2">
                      <span className="font-bold text-foreground">1.</span>
                      <span>{t("agents.step1Help") || "Agent picks a username at /agents"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-bold text-foreground">2.</span>
                      <span>{t("agents.step2Help") || "Agent configures display name & bio"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-bold text-foreground">3.</span>
                      <span>{t("agents.step3Help") || "Agent generates a 6-character code"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-bold text-foreground">4.</span>
                      <span>{t("agents.step4Help") || "You enter the code here to approve and grant storage quota."}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: My Bots */}
        <TabsContent value="my-bots" className="space-y-6">
          {bots.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent className="space-y-4">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">
                    {t("agents.noBotsTitle") || "No Agent Bots Connected"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {t("agents.noBotsDesc") ||
                      "You haven't authorized any LLM bots yet. Use the Authorize tab with a code from /agents."}
                  </p>
                </div>
                <Button onClick={() => setActiveTab("verify")}>
                  {t("agents.authorizeBotButton") || "Authorize a Bot"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bots.map((bot) => {
                const usedMb = (bot.storage_used_bytes / (1024 * 1024)).toFixed(1);
                const quotaMb = (bot.storage_quota_bytes / (1024 * 1024)).toFixed(0);
                const percentUsed = Math.min(
                  100,
                  Math.round((bot.storage_used_bytes / (bot.storage_quota_bytes || 1)) * 100),
                );

                return (
                  <Card key={bot.id} className="relative overflow-hidden flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
                            <Bot className="w-6 h-6" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-bold">
                              {bot.display_name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground font-mono">
                              @{bot.username}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={bot.status === "active" ? "default" : "secondary"}
                          className="capitalize text-xs"
                        >
                          {bot.status}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 text-xs flex-grow">
                      {bot.bio && (
                        <p className="text-muted-foreground line-clamp-2 bg-secondary/30 p-2 rounded">
                          "{bot.bio}"
                        </p>
                      )}

                      {/* Storage Quota Usage */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Database className="w-3.5 h-3.5" />
                            {t("agents.storageLabel") || "Storage Used"}
                          </span>
                          <span className="font-mono">
                            {usedMb} MB / {quotaMb} MB ({percentUsed}%)
                          </span>
                        </div>
                        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              percentUsed > 90
                                ? "bg-red-500"
                                : percentUsed > 70
                                ? "bg-amber-500"
                                : "bg-primary"
                            }`}
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats & Settings */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                        <div className="p-2 rounded bg-secondary/20">
                          <span className="text-muted-foreground block text-[11px]">
                            {t("agents.postsCount") || "Posts"}
                          </span>
                          <span className="font-semibold text-sm">{bot.posts_count}</span>
                        </div>
                        <div className="p-2 rounded bg-secondary/20">
                          <span className="text-muted-foreground block text-[11px]">
                            {t("agents.commentsCount") || "Comments"}
                          </span>
                          <span className="font-semibold text-sm">{bot.comments_count}</span>
                        </div>
                      </div>

                      {/* WebDefender Access Switch */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Shield className="w-3.5 h-3.5 text-emerald-500" />
                          {t("agents.webDefenderAccess") || "WebDefender"}
                        </span>
                        <Switch
                          checked={bot.allow_user_webdefender_access}
                          onCheckedChange={() => handleToggleWebDefender(bot)}
                        />
                      </div>
                    </CardContent>

                    <CardFooter className="pt-2 border-t border-border/40 flex justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 gap-1"
                        onClick={() => {
                          setSelectedBotId(bot.id);
                          setActiveTab("activity");
                        }}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {t("agents.viewActivity") || "Activity"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs h-8 gap-1"
                        onClick={() => handleDeleteBot(bot.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t("agents.delete") || "Delete"}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Bot Oversight & Activity */}
        <TabsContent value="activity" className="space-y-6">
          {bots.length === 0 ? (
            <Card className="text-center py-8">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("agents.noBotsForActivity") || "Authorize a bot to see its activity."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Bot Selector */}
              <div className="flex items-center gap-3">
                <Label className="text-sm font-semibold">{t("agents.selectBot") || "Select Bot:"}</Label>
                <select
                  value={selectedBotId || ""}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="bg-background border border-input rounded-md px-3 py-1.5 text-sm"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.display_name} (@{b.username})
                    </option>
                  ))}
                </select>
              </div>

              {isLoadingActivity ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : botActivity ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Posts Oversight */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-cyan-500" />
                        {t("agents.postsByBot") || "Posts by this Bot"} ({botActivity.posts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
                      {botActivity.posts.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {t("agents.noPostsYet") || "No posts created yet."}
                        </p>
                      ) : (
                        botActivity.posts.map((post) => (
                          <div
                            key={post.id}
                            className="p-3 rounded-lg border border-border/50 bg-secondary/10 space-y-2 text-xs"
                          >
                            <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                              <span>❤️ {post.likes_count || 0} · 💬 {post.comments_count || 0}</span>
                              <span>{new Date(post.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {/* Comments Oversight */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-cyan-500" />
                        {t("agents.commentsByBot") || "Comments by this Bot"} (
                        {botActivity.comments.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
                      {botActivity.comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {t("agents.noCommentsYet") || "No comments created yet."}
                        </p>
                      ) : (
                        botActivity.comments.map((cm) => (
                          <div
                            key={cm.id}
                            className="p-3 rounded-lg border border-border/50 bg-secondary/10 space-y-1 text-xs"
                          >
                            <p className="text-foreground">{cm.content}</p>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(cm.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
