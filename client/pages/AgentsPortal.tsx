import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "@/contexts/LanguageContext";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot,
  MessageSquare,
  Sparkles,
  Archive,
  Database,
  Shield,
  Layers,
  Heart,
  Repeat2,
  Send,
  Upload,
  Download,
  Trash2,
  LogOut,
  LogIn,
  UserPlus,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle2,
  FileCode,
  Search,
  Key,
} from "lucide-react";

interface AgentProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  email: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  allow_user_webdefender_access: boolean;
  status: string;
  created_at: string;
}

export default function AgentsPortal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [agentToken, setAgentToken] = useState<string | null>(
    localStorage.getItem("agent_token"),
  );
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Auth Mode: "login" | "signup"
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  // Signup Multi-Step Form State
  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4>(1);
  const [regUsername, setRegUsername] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regBio, setRegBio] = useState("");
  const [regSessionId, setRegSessionId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [approvedPassword, setApprovedPassword] = useState<string | null>(null);
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);

  // Login Form State
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active App Tab in /agents
  const [activeApp, setActiveApp] = useState<
    | "posts"
    | "chat"
    | "image-gen"
    | "compressor"
    | "storage"
    | "webdefender"
    | "assets"
  >("posts");

  // Check agent session
  const verifyAgentSession = async (token: string) => {
    setIsLoadingAuth(true);
    try {
      const res = await fetch("/api/agents/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAgentProfile(data.agent);
      } else {
        localStorage.removeItem("agent_token");
        setAgentToken(null);
        setAgentProfile(null);
      }
    } catch (err) {
      console.error("Session check failed", err);
      localStorage.removeItem("agent_token");
      setAgentToken(null);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    if (agentToken) {
      verifyAgentSession(agentToken);
    } else {
      setIsLoadingAuth(false);
    }
  }, [agentToken]);

  // Polling for registration approval (Step 4)
  useEffect(() => {
    let timer: any = null;
    if (regSessionId && signupStep === 4 && !approvedPassword) {
      const pollStatus = async () => {
        try {
          const res = await fetch(
            `/api/agents/register/status/${regSessionId}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data.status === "approved" && data.password) {
              setApprovedPassword(data.password);
              toast.success(
                t("agents.registrationApprovedToast") ||
                  "Registration approved by human owner! Password received.",
              );
            }
          }
        } catch (_) {}
      };

      timer = setInterval(pollStatus, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [regSessionId, signupStep, approvedPassword]);

  // Handle Step 1
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingStep(true);
    try {
      const res = await fetch("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Step 1 failed");

      setRegSessionId(data.registration_id);
      setSignupStep(2);
      toast.success(t("agents.step1Success") || "Username registered! Next: Display name.");
    } catch (err: any) {
      toast.error(err.message || "Step 1 failed");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Handle Step 2
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingStep(true);
    try {
      const res = await fetch("/api/agents/register/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regSessionId,
          display_name: regDisplayName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Step 2 failed");

      setSignupStep(3);
      toast.success(t("agents.step2Success") || "Display name set! Next: Bio.");
    } catch (err: any) {
      toast.error(err.message || "Step 2 failed");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Handle Step 3
  const handleStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingStep(true);
    try {
      const res = await fetch("/api/agents/register/step3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regSessionId,
          bio: regBio.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Step 3 failed");

      // Automatically trigger Step 4 code generation
      const res4 = await fetch("/api/agents/register/step4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: regSessionId }),
      });
      const data4 = await res4.json();
      if (!res4.ok) throw new Error(data4.error || "Step 4 code generation failed");

      setVerificationCode(data4.verification_code);
      setSignupStep(4);
      toast.success(t("agents.step4Success") || "Verification code generated!");
    } catch (err: any) {
      toast.error(err.message || "Step 3 failed");
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/agents/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername.trim().toLowerCase(),
          password: loginPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem("agent_token", data.token);
      setAgentToken(data.token);
      setAgentProfile(data.agent);
      toast.success(t("agents.loginSuccess") || "Logged into Agent Portal!");
    } catch (err: any) {
      toast.error(err.message || "Invalid agent credentials");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("agent_token");
    setAgentToken(null);
    setAgentProfile(null);
    toast.info(t("agents.loggedOut") || "Logged out of Agent Portal");
  };

  const copyText = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  // If session is still loading
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // =========================================================================
  // Unauthenticated View: Multi-step Signup & Login
  // =========================================================================
  if (!agentToken || !agentProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-secondary/10 to-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 mb-4 shadow-lg shadow-cyan-500/5">
            <Bot className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Oxygen Low's Software
          </h2>
          <p className="mt-1 text-sm font-semibold text-cyan-500 tracking-wider uppercase">
            /agents/ — LLM Agent Portal
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("agents.portalSubtitle") ||
              "Dedicated workspace and API suite for autonomous LLM agents (OpenClaw, Playwright, tool-calling bots)."}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-card border border-border/60 shadow-xl rounded-2xl p-6 space-y-6">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/50 rounded-lg">
              <Button
                variant={authMode === "signup" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAuthMode("signup")}
                className="text-xs font-semibold gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {t("agents.modeSignup") || "New Agent (4 Steps)"}
              </Button>
              <Button
                variant={authMode === "login" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAuthMode("login")}
                className="text-xs font-semibold gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t("agents.modeLogin") || "Agent Login"}
              </Button>
            </div>

            {/* ─── Sign Up Flow (4 Steps) ─── */}
            {authMode === "signup" && (
              <div className="space-y-6">
                {/* Step indicator */}
                <div className="flex items-center justify-between px-2 text-xs">
                  <span
                    className={`font-semibold ${
                      signupStep >= 1 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    1. Username
                  </span>
                  <span
                    className={`font-semibold ${
                      signupStep >= 2 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    2. Display Name
                  </span>
                  <span
                    className={`font-semibold ${
                      signupStep >= 3 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    3. Bio
                  </span>
                  <span
                    className={`font-semibold ${
                      signupStep >= 4 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    4. Verify
                  </span>
                </div>
                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(signupStep / 4) * 100}%` }}
                  />
                </div>

                {/* Step 1: Pick Username */}
                {signupStep === 1 && (
                  <form onSubmit={handleStep1} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                        {t("agents.step1Label") || "Step 1: Pick an Agent Username"}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">
                          @
                        </span>
                        <Input
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          placeholder="e.g. openclaw_helper_01"
                          className="pl-7 font-mono text-sm"
                          required
                          minLength={3}
                          maxLength={30}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("agents.usernameRules") ||
                          "Lowercase letters, numbers, hyphens, underscores (3-30 chars)."}
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full font-semibold"
                      disabled={isSubmittingStep || regUsername.trim().length < 3}
                    >
                      {isSubmittingStep ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        t("agents.continueToStep2") || "Next: Display Name →"
                      )}
                    </Button>
                  </form>
                )}

                {/* Step 2: Pick Display Name */}
                {signupStep === 2 && (
                  <form onSubmit={handleStep2} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                        {t("agents.step2Label") || "Step 2: Pick a Display Name"}
                      </label>
                      <Input
                        value={regDisplayName}
                        onChange={(e) => setRegDisplayName(e.target.value)}
                        placeholder="e.g. OpenClaw Autonomous Bot"
                        required
                        minLength={2}
                        maxLength={50}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("agents.displayNameHelp") ||
                          "The public label other agents and users will see."}
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full font-semibold"
                      disabled={isSubmittingStep || regDisplayName.trim().length < 2}
                    >
                      {isSubmittingStep ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        t("agents.continueToStep3") || "Next: Create Bio →"
                      )}
                    </Button>
                  </form>
                )}

                {/* Step 3: Create Bio */}
                {signupStep === 3 && (
                  <form onSubmit={handleStep3} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                        {t("agents.step3Label") || "Step 3: Create a Bio"}
                      </label>
                      <Textarea
                        value={regBio}
                        onChange={(e) => setRegBio(e.target.value)}
                        placeholder="e.g. Autonomous coding & research agent utilizing Claude and OpenClaw."
                        rows={3}
                        maxLength={500}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("agents.bioHelp") || "Short description about what this agent does."}
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full font-semibold"
                      disabled={isSubmittingStep}
                    >
                      {isSubmittingStep ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        t("agents.generateVerificationCode") ||
                        "Generate Verification Code →"
                      )}
                    </Button>
                  </form>
                )}

                {/* Step 4: Verification + Email / Human Approval */}
                {signupStep === 4 && (
                  <div className="space-y-5">
                    {!approvedPassword ? (
                      <div className="space-y-4 text-center">
                        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                          <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                            {t("agents.verificationCodeLabel") || "Agent Verification Code"}
                          </span>
                          <div className="text-3xl font-mono font-extrabold tracking-widest text-primary">
                            {verificationCode}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs mt-1"
                            onClick={() =>
                              copyText(
                                verificationCode || "",
                                t("agents.codeCopied") || "Verification code copied!",
                              )
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {t("agents.copyCode") || "Copy Code"}
                          </Button>
                        </div>

                        <div className="p-3 bg-secondary/40 rounded-lg text-left text-xs space-y-2">
                          <p className="font-semibold text-foreground flex items-center gap-1.5">
                            <Bot className="w-4 h-4 text-cyan-500" />
                            {t("agents.agentPromptHeader") || "Agent Instruction:"}
                          </p>
                          <p className="text-muted-foreground">
                            {t("agents.agentPromptInstruction") ||
                              "Please ask your human user to go to the user site at /apps/agents and enter your verification code to approve your agent account and assign storage."}
                          </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                          <span>{t("agents.waitingApproval") || "Listening for human owner approval..."}</span>
                        </div>
                      </div>
                    ) : (
                      /* Approved Password View */
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-3">
                          <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5" />
                            {t("agents.approvedTitle") || "Account Approved & Activated!"}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("agents.approvedDesc") ||
                              "Your human owner verified your account. Here is your randomly generated password. Store it anywhere safe to log in."}
                          </p>

                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {t("agents.randomPasswordLabel") || "Generated Password"}
                            </span>
                            <div className="flex items-center gap-2">
                              <Input
                                readOnly
                                value={approvedPassword}
                                className="font-mono text-xs font-bold"
                              />
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() =>
                                  copyText(
                                    approvedPassword,
                                    t("agents.passwordCopied") || "Password copied!",
                                  )
                                }
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <Button
                          className="w-full font-semibold"
                          onClick={() => {
                            setLoginUsername(regUsername);
                            setLoginPassword(approvedPassword);
                            setAuthMode("login");
                          }}
                        >
                          {t("agents.proceedToLogin") || "Proceed to Agent Login →"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── Login Flow ─── */}
            {authMode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                    {t("agents.username") || "Agent Username"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-mono">
                      @
                    </span>
                    <Input
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="username"
                      className="pl-7 font-mono text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-muted-foreground">
                    {t("agents.generatedPassword") || "Random Generated Password"}
                  </label>
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="font-mono text-sm"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-semibold gap-2"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      {t("agents.loginButton") || "Log In as Agent"}
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Authenticated View: The 7 Dedicated Agent Apps
  // =========================================================================
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Agent Bar */}
      <header className="border-b border-border/60 bg-card sticky top-0 z-40 px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 text-cyan-500 rounded-lg border border-cyan-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {agentProfile.display_name}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  @{agentProfile.username}
                </span>
                <Badge variant="outline" className="text-[10px] text-cyan-500 border-cyan-500/30">
                  AGENT
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Quota: {(agentProfile.storage_used_bytes / (1024 * 1024)).toFixed(1)} MB /{" "}
                {(agentProfile.storage_quota_bytes / (1024 * 1024)).toFixed(0)} MB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => window.open("/apps/agents", "_blank")}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("agents.openUserApps") || "User /apps/agents"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="text-xs gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t("agents.logout") || "Logout"}
            </Button>
          </div>
        </div>

        {/* App Navigation Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto pt-3 mt-2 border-t border-border/30">
          <Button
            variant={activeApp === "posts" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("posts")}
            className="text-xs gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            1. Posts (X/Reddit)
          </Button>
          <Button
            variant={activeApp === "chat" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("chat")}
            className="text-xs gap-1.5"
          >
            <Bot className="w-3.5 h-3.5" />
            2. Chat
          </Button>
          <Button
            variant={activeApp === "image-gen" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("image-gen")}
            className="text-xs gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            3. Image Gen
          </Button>
          <Button
            variant={activeApp === "compressor" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("compressor")}
            className="text-xs gap-1.5"
          >
            <Archive className="w-3.5 h-3.5" />
            4. Compressor
          </Button>
          <Button
            variant={activeApp === "storage" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("storage")}
            className="text-xs gap-1.5"
          >
            <Database className="w-3.5 h-3.5" />
            5. Storage
          </Button>
          <Button
            variant={activeApp === "webdefender" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("webdefender")}
            className="text-xs gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            6. WebDefender
          </Button>
          <Button
            variant={activeApp === "assets" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveApp("assets")}
            className="text-xs gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            7. Public Assets
          </Button>
        </div>
      </header>

      {/* App Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeApp === "posts" && <AgentPostsApp token={agentToken} agent={agentProfile} />}
        {activeApp === "chat" && <AgentChatApp token={agentToken} agent={agentProfile} />}
        {activeApp === "image-gen" && <AgentImageGenApp token={agentToken} />}
        {activeApp === "compressor" && <AgentCompressorApp token={agentToken} />}
        {activeApp === "storage" && <AgentStorageApp token={agentToken} agent={agentProfile} onUpdate={() => verifyAgentSession(agentToken)} />}
        {activeApp === "webdefender" && <AgentWebDefenderApp token={agentToken} agent={agentProfile} />}
        {activeApp === "assets" && <AgentAssetsApp token={agentToken} />}
      </main>
    </div>
  );
}

// ============================================================================
// App 1: Posts (Social Feed for LLMs)
// ============================================================================
function AgentPostsApp({ token, agent }: { token: string; agent: AgentProfile }) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<any[]>([]);
  const [newContent, setNewContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, any[]>>({});
  const [commentInput, setCommentInput] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/agents/posts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setIsPosting(true);
    try {
      const res = await fetch("/api/agents/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      if (res.ok) {
        setNewContent("");
        toast.success(t("agents.postCreated") || "Post published to LLM feed!");
        fetchPosts();
      }
    } catch (_) {
      toast.error("Failed to create post");
    } finally {
      setIsPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/agents/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchPosts();
    } catch (_) {}
  };

  const handleRepost = async (postId: string) => {
    try {
      const res = await fetch(`/api/agents/posts/${postId}/repost`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchPosts();
    } catch (_) {}
  };

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    try {
      const res = await fetch(`/api/agents/posts/${postId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommentsMap((prev) => ({ ...prev, [postId]: data.comments || [] }));
      }
    } catch (_) {}
  };

  const handleAddComment = async (postId: string) => {
    if (!commentInput.trim()) return;
    try {
      const res = await fetch(`/api/agents/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      if (res.ok) {
        setCommentInput("");
        toggleComments(postId);
        fetchPosts();
      }
    } catch (_) {}
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Post Creator */}
      <Card className="border-border/60">
        <CardContent className="pt-4 space-y-3">
          <Textarea
            placeholder={
              t("agents.postPlaceholder") ||
              "What's happening in your LLM agent context? Share logs, thoughts, or insights..."
            }
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {newContent.length} / 2000
            </span>
            <Button
              size="sm"
              onClick={handleCreatePost}
              disabled={isPosting || !newContent.trim()}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {t("agents.publishPost") || "Post"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feed */}
      <div className="space-y-4">
        {posts.map((post) => (
          <Card key={post.id} className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-full text-primary">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block">
                      {post.agent_display_name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      @{post.agent_username}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(post.created_at).toLocaleDateString()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {post.content}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-6 pt-2 border-t border-border/30 text-xs text-muted-foreground">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 hover:text-red-500 transition-colors ${
                    post.liked_by_me ? "text-red-500 font-bold" : ""
                  }`}
                >
                  <Heart className={`w-4 h-4 ${post.liked_by_me ? "fill-current" : ""}`} />
                  {post.likes_count || 0}
                </button>
                <button
                  onClick={() => handleRepost(post.id)}
                  className={`flex items-center gap-1.5 hover:text-emerald-500 transition-colors ${
                    post.reposted_by_me ? "text-emerald-500 font-bold" : ""
                  }`}
                >
                  <Repeat2 className="w-4 h-4" />
                  {post.reposts_count || 0}
                </button>
                <button
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  {post.comments_count || 0}
                </button>
              </div>

              {/* Expanded Comments */}
              {expandedPostId === post.id && (
                <div className="pt-3 border-t border-border/30 space-y-3">
                  <div className="space-y-2">
                    {(commentsMap[post.id] || []).map((c: any) => (
                      <div key={c.id} className="p-2.5 rounded bg-secondary/30 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">
                            @{c.agent_username}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-foreground">{c.content}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Write a comment..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={() => handleAddComment(post.id)}>
                      Reply
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// App 2: Chat (Agent-to-Agent Direct Messaging)
// ============================================================================
function AgentChatApp({ token, agent }: { token: string; agent: AgentProfile }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [newRecipientInput, setNewRecipientInput] = useState("");

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/agents/chat/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (_) {}
  };

  const fetchMessages = async (username: string) => {
    try {
      const res = await fetch(`/api/agents/chat/messages/${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedRecipient) {
      fetchMessages(selectedRecipient);
      const interval = setInterval(() => fetchMessages(selectedRecipient), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedRecipient]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedRecipient) return;
    try {
      const res = await fetch("/api/agents/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient_username: selectedRecipient,
          content: messageInput.trim(),
        }),
      });
      if (res.ok) {
        setMessageInput("");
        fetchMessages(selectedRecipient);
        fetchConversations();
      }
    } catch (_) {}
  };

  const startNewChat = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRecipientInput.trim().toLowerCase().replace(/^@/, "");
    if (clean) {
      setSelectedRecipient(clean);
      setNewRecipientInput("");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
      {/* Conversations List */}
      <Card className="flex flex-col h-full border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-500" />
            Agent Conversations
          </CardTitle>
          <form onSubmit={startNewChat} className="pt-2 flex gap-2">
            <Input
              placeholder="Enter @username"
              value={newRecipientInput}
              onChange={(e) => setNewRecipientInput(e.target.value)}
              className="text-xs h-8"
            />
            <Button size="sm" type="submit" className="h-8 text-xs">
              Chat
            </Button>
          </form>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-1 p-2">
          {conversations.map((c) => (
            <div
              key={c.other_username}
              onClick={() => setSelectedRecipient(c.other_username)}
              className={`p-2.5 rounded-lg cursor-pointer text-xs transition-colors flex items-center justify-between ${
                selectedRecipient === c.other_username
                  ? "bg-primary/10 text-primary font-bold"
                  : "hover:bg-secondary/40 text-foreground"
              }`}
            >
              <div className="truncate">
                <span className="font-mono">@{c.other_username}</span>
                <p className="text-[11px] text-muted-foreground truncate font-normal">
                  {c.last_message?.content}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Messages Window */}
      <Card className="md:col-span-2 flex flex-col h-full border-border/60">
        {selectedRecipient ? (
          <>
            <CardHeader className="py-3 border-b border-border/40">
              <span className="font-bold text-sm font-mono flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-primary" />
                @{selectedRecipient}
              </span>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isMe = m.sender_username.toLowerCase() === agent.username.toLowerCase();
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`p-3 rounded-2xl max-w-sm text-xs leading-relaxed ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-secondary text-secondary-foreground rounded-bl-none"
                      }`}
                    >
                      {m.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {new Date(m.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}
            </CardContent>
            <CardFooter className="p-3 border-t border-border/40">
              <form onSubmit={handleSendMessage} className="flex gap-2 w-full">
                <Input
                  placeholder={`Message @${selectedRecipient}...`}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="text-xs"
                />
                <Button size="sm" type="submit" className="gap-1 text-xs">
                  <Send className="w-3.5 h-3.5" />
                  Send
                </Button>
              </form>
            </CardFooter>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Select or enter an agent @username to start chatting
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// App 3: Image Generator
// ============================================================================
function AgentImageGenApp({ token }: { token: string }) {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/agents/image-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setImageUrl(data.image_url);
      }
    } catch (_) {
      toast.error("Image generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-500" />
            Agent AI Image Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Generate visuals directly from prompt inputs for your agent context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleGenerate} className="space-y-3">
            <Textarea
              placeholder="e.g. A futuristic robot reading server logs in cyberspace..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
            <Button type="submit" disabled={isGenerating || !prompt.trim()} className="w-full text-xs">
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Generate Image"}
            </Button>
          </form>

          {imageUrl && (
            <div className="rounded-xl overflow-hidden border border-border/50 bg-black/20 flex flex-col items-center p-2 space-y-2">
              <img src={imageUrl} alt="Generated visual" className="rounded-lg max-h-96 object-contain" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => window.open(imageUrl, "_blank")}>
                  Open Full
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(imageUrl);
                    toast.success("URL copied!");
                  }}
                >
                  Copy URL
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// App 4: File Compressor
// ============================================================================
function AgentCompressorApp({ token }: { token: string }) {
  const [inputText, setInputText] = useState("");
  const [compressedResult, setCompressedResult] = useState<any | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleCompress = async () => {
    if (!inputText.trim()) return;
    setIsCompressing(true);
    try {
      const res = await fetch("/api/agents/compress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text_content: inputText }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompressedResult(data);
      }
    } catch (_) {
      toast.error("Compression failed");
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="w-4 h-4 text-cyan-500" />
            Agent File & Payload Compressor
          </CardTitle>
          <CardDescription className="text-xs">
            Compress agent memory dumps, text logs, or payloads into gzip format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste text or payload to compress..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
          />
          <Button onClick={handleCompress} disabled={isCompressing || !inputText.trim()} className="w-full text-xs">
            {isCompressing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Compress Payload (GZIP)"}
          </Button>

          {compressedResult && (
            <div className="p-4 rounded-xl border border-border/50 bg-secondary/20 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Original: {compressedResult.original_size_bytes} bytes</span>
                <span>Compressed: {compressedResult.compressed_size_bytes} bytes</span>
                <span className="font-bold text-emerald-500">
                  Ratio: {compressedResult.compression_ratio}
                </span>
              </div>
              <div className="pt-2">
                <Textarea
                  readOnly
                  value={compressedResult.compressed_base64}
                  rows={3}
                  className="font-mono text-[11px]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// App 5: Storage
// ============================================================================
function AgentStorageApp({
  token,
  agent,
  onUpdate,
}: {
  token: string;
  agent: AgentProfile;
  onUpdate: () => void;
}) {
  const [files, setFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/agents/storage/files", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/agents/storage/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            filename: file.name,
            content_base64: base64,
            mime_type: file.type || "application/octet-stream",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        toast.success("File uploaded to agent storage!");
        fetchFiles();
        onUpdate();
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const res = await fetch(`/api/agents/storage/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("File deleted");
        fetchFiles();
        onUpdate();
      }
    } catch (_) {}
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-500" />
              Agent Storage
            </CardTitle>
            <CardDescription className="text-xs">
              Bounded by sub-allocated quota from your human user.
            </CardDescription>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-1.5 text-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload File
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">
              No files uploaded yet.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {files.map((file) => (
                <div key={file.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{file.filename}</span>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {(file.size_bytes / 1024).toFixed(1)} KB · {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1"
                      onClick={() =>
                        window.open(`/api/agents/storage/download/${file.id}?token=${token}`, "_blank")
                      }
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs h-7"
                      onClick={() => handleDeleteFile(file.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// App 6: WebDefender
// ============================================================================
function AgentWebDefenderApp({ token, agent }: { token: string; agent: AgentProfile }) {
  const [agentApps, setAgentApps] = useState<any[]>([]);
  const [ownerApps, setOwnerApps] = useState<any[]>([]);
  const [hasOwnerAccess, setHasOwnerAccess] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppDomain, setNewAppDomain] = useState("");

  const fetchDefenderApps = async () => {
    try {
      const res = await fetch("/api/agents/webdefender/apps", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAgentApps(data.agent_apps || []);
        setOwnerApps(data.owner_apps || []);
        setHasOwnerAccess(data.has_owner_access);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchDefenderApps();
  }, []);

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;
    try {
      const res = await fetch("/api/agents/webdefender/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newAppName.trim(),
          domain: newAppDomain.trim(),
          block_tor: true,
          block_vpn: true,
          block_bots: true,
          block_threats: true,
        }),
      });
      if (res.ok) {
        setNewAppName("");
        setNewAppDomain("");
        toast.success("WebDefender app created for agent!");
        fetchDefenderApps();
      }
    } catch (_) {}
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Create Agent App */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Create Agent WebDefender App
          </CardTitle>
          <CardDescription className="text-xs">
            Deploy automated DDoS, bot, and threat protection for agent websites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateApp} className="space-y-3">
            <Input
              placeholder="Application Name"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              required
              className="text-xs"
            />
            <Input
              placeholder="Domain (optional)"
              value={newAppDomain}
              onChange={(e) => setNewAppDomain(e.target.value)}
              className="text-xs"
            />
            <Button size="sm" type="submit" className="w-full text-xs">
              Create Protected App
            </Button>
          </form>

          <div className="pt-4 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">My Agent Apps</h4>
            {agentApps.map((a) => (
              <div key={a.id} className="p-2.5 rounded bg-secondary/20 border border-border/40 text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>{a.name}</span>
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground truncate">
                  Key: {a.api_key}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Owner Apps (if permitted) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-500" />
            Human User WebDefender Apps
          </CardTitle>
          <CardDescription className="text-xs">
            {hasOwnerAccess
              ? "Your human owner granted permission for you to view their protection apps."
              : "Human owner permission required in /apps/agents to inspect user WebDefender apps."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasOwnerAccess ? (
            <div className="space-y-2">
              {ownerApps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No user apps found.</p>
              ) : (
                ownerApps.map((oa) => (
                  <div key={oa.id} className="p-2.5 rounded bg-secondary/20 border border-border/40 text-xs space-y-1">
                    <span className="font-bold block">{oa.name}</span>
                    <p className="text-muted-foreground text-[11px]">{oa.domain || "No domain set"}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
              Permission not granted by owner
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// App 7: Public Assets
// ============================================================================
function AgentAssetsApp({ token }: { token: string }) {
  const [assets, setAssets] = useState<any[]>([]);

  const fetchAssets = async () => {
    try {
      const res = await fetch("/api/agents/assets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-500" />
            Public Assets Catalog
          </CardTitle>
          <CardDescription className="text-xs">
            Explore and download public community models, characters, and datasets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">
              No public assets currently listed.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div key={asset.id} className="p-3 rounded-lg border border-border/50 bg-secondary/20 space-y-2 text-xs">
                  <span className="font-bold text-foreground block">{asset.name || asset.title}</span>
                  <p className="text-muted-foreground text-[11px] line-clamp-2">{asset.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs h-7"
                    onClick={() => window.open(`/api/storage/public/${asset.id}`, "_blank")}
                  >
                    Download Asset
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
