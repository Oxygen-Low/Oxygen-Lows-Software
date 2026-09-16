import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Loader2,
  Lock,
  User,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Upload,
  ArrowLeft,
  Smartphone,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { setLocalSession } from "@/lib/localSession";
import {
  isValidMasterKeyString,
  parseMasterKeyString,
  parseKeyFileContent,
  bytesToHex,
  deriveEncryptionKeyFromPassword,
  setActiveMasterKey,
} from "@/lib/crypto";

export default function Auth() {
  const location = useLocation();
  const { session, loading, signIn, signUp, migrateAccount } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  usePageTitle(t("titles.auth", undefined, "Sign In"), {
    description: t("auth.welcomeBack", undefined, "Welcome back!"),
  });

  const [mode, setMode] = useState<"signin" | "signup" | "quick">("signin");
  const [login, setLogin] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Sign In state
  const [quickSessionId, setQuickSessionId] = useState<string | null>(null);
  const [quickCode, setQuickCode] = useState<string | null>(null);
  const [quickExpiresAt, setQuickExpiresAt] = useState<number>(0);
  const [quickRemainingSeconds, setQuickRemainingSeconds] = useState<number>(0);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickStatus, setQuickStatus] = useState<
    "pending" | "approved" | "rejected" | "expired" | null
  >(null);

  // Migration state
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrateLogin, setMigrateLogin] = useState("");
  const [migrateUser, setMigrateUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [oldMasterKey, setOldMasterKey] = useState("");
  const keyFileInputRef = React.useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const [requiresUnlock, setRequiresUnlock] = useState(() => {
    try {
      const sp = new URLSearchParams(location.search);
      return sp.get("requires_unlock") === "true";
    } catch {
      return false;
    }
  });
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(true);
  const [githubOAuthConfigured, setGithubOAuthConfigured] = useState(true);

  const requestedReturnTo = new URLSearchParams(location.search).get(
    "returnTo",
  );
  const returnTo = getSafeReturnPath(requestedReturnTo);

  useEffect(() => {
    fetch("/api/auth/oauth/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.google) {
          setGoogleOAuthConfigured(Boolean(data.google.enabled));
        }
        if (data?.github) {
          setGithubOAuthConfigured(Boolean(data.github.enabled));
        }
      })
      .catch(() => {});

    const hash = window.location.hash;
    if (hash && hash.includes("error_description")) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const queryError =
      queryParams.get("error_description") || queryParams.get("error");
    const queryProvider = queryParams.get("provider");
    const isGithub = queryProvider === "github";
    if (queryError) {
      if (queryError === "oauth_not_linked") {
        setError(
          isGithub
            ? t(
                "auth.githubNotLinkedError",
                undefined,
                "No account is linked to this GitHub account. Please log in with your credentials and link GitHub under Security -> OAuth.",
              )
            : t(
                "auth.oauthNotLinkedError",
                undefined,
                "No account is linked to this Google account. Please log in with your credentials and link Google under Security -> OAuth.",
              ),
        );
      } else if (queryError === "oauth_unconfigured") {
        setError(
          isGithub
            ? t(
                "auth.githubNotConfigured",
                undefined,
                "GitHub OAuth is not configured on this server",
              )
            : t(
                "auth.googleNotConfigured",
                undefined,
                "Google OAuth is not configured on this server",
              ),
        );
      } else {
        setError(queryError);
      }
    }

    const oauthToken = queryParams.get("oauth_token");
    const needsUnlock = queryParams.get("requires_unlock") === "true";
    if (oauthToken) {
      setOauthLoading(true);
      fetch(`/api/auth/session?token=${encodeURIComponent(oauthToken)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.session) {
            setLocalSession(data.session);
            if (needsUnlock) {
              setRequiresUnlock(true);
            }
          } else {
            setError(
              data?.error || "Failed to establish session from Google sign-in",
            );
          }
        })
        .catch((err) => {
          setError(err?.message || "Failed to establish session");
        })
        .finally(() => {
          setOauthLoading(false);
        });
    }
  }, [location]);

  const fetchQuickSignInCode = async () => {
    setQuickLoading(true);
    setError(null);
    setQuickStatus("pending");
    try {
      const res = await fetch("/api/auth/quick-sign-in/create", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to generate quick sign-in code");
      }
      setQuickSessionId(data.sessionId);
      setQuickCode(data.code);
      setQuickExpiresAt(data.expiresAt);
      setQuickRemainingSeconds(
        Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000)),
      );
    } catch (err: any) {
      setError(err.message || "Failed to generate quick sign-in code");
    } finally {
      setQuickLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "quick" && !quickCode && !quickLoading) {
      fetchQuickSignInCode();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "quick" || !quickExpiresAt) return;

    const timerInterval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((quickExpiresAt - Date.now()) / 1000),
      );
      setQuickRemainingSeconds(remaining);
      if (remaining <= 0) {
        setQuickStatus("expired");
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [mode, quickExpiresAt]);

  useEffect(() => {
    if (
      mode !== "quick" ||
      !quickSessionId ||
      quickStatus === "approved" ||
      quickStatus === "rejected" ||
      quickStatus === "expired"
    ) {
      return;
    }

    let active = true;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/quick-sign-in/poll?sessionId=${encodeURIComponent(quickSessionId)}`,
        );
        const data = await res.json();
        if (!active) return;

        if (data.status === "approved" && data.session) {
          setQuickStatus("approved");
          setLocalSession(data.session);
          navigate(returnTo, { replace: true });
        } else if (data.status === "rejected") {
          setQuickStatus("rejected");
          setError(
            t(
              "security.quickSignInDenied",
              undefined,
              "Sign in request was denied.",
            ),
          );
        } else if (data.status === "expired") {
          setQuickStatus("expired");
        }
      } catch {
        // Ignore polling transient network failures
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [mode, quickSessionId, quickStatus, returnTo, navigate, t]);

  if (loading || oauthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  // If already logged in locally (and not in post-OAuth unlock state)
  if (session && !requiresUnlock) {
    return <Navigate to={returnTo} replace />;
  }

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword) return;
    setError(null);
    setIsUnlocking(true);
    try {
      const userSalt =
        session?.user?.email || session?.user?.username || "";
      const encKey = await deriveEncryptionKeyFromPassword(
        unlockPassword,
        userSalt,
      );
      setActiveMasterKey(encKey);
      setRequiresUnlock(false);
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Failed to derive encryption key");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleSkipUnlock = () => {
    setRequiresUnlock(false);
    navigate(returnTo, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        if (!login.trim()) {
          throw new Error(
            t("auth.loginRequired", undefined, "Username or email is required"),
          );
        }
        if (!password) {
          throw new Error(
            t("auth.passwordRequired", undefined, "Password is required"),
          );
        }
        const res = await signIn(login.trim(), password);
        if (res?.needsMigration) {
          setNeedsMigration(true);
          setMigrateLogin(login.trim());
          setMigrateUser(res.user || null);
          setNewPassword("");
          setConfirmNewPassword("");
          setOldMasterKey("");
          return;
        }
      } else {
        if (!username.trim() || username.trim().length < 3) {
          throw new Error(
            t(
              "auth.usernameLength",
              undefined,
              "Username must be at least 3 characters long",
            ),
          );
        }
        if (!email.trim() || !email.includes("@")) {
          throw new Error(
            t(
              "auth.validEmailRequired",
              undefined,
              "A valid email address is required",
            ),
          );
        }
        if (!password || password.length < 6) {
          throw new Error(
            t(
              "auth.passwordLength",
              undefined,
              "Password must be at least 6 characters long",
            ),
          );
        }
        if (password !== confirmPassword) {
          throw new Error(
            t("auth.passwordMismatch", undefined, "Passwords do not match"),
          );
        }
        await signUp(username.trim(), email.trim(), password);
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedBytes = parseKeyFileContent(text);
      setOldMasterKey(bytesToHex(parsedBytes));
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Invalid masterkey file");
    }
    if (e.target) e.target.value = "";
  };

  const handleMigrateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!newPassword || newPassword.length < 6) {
        throw new Error(
          t(
            "auth.passwordLength",
            undefined,
            "Password must be at least 6 characters long",
          ),
        );
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error(
          t("auth.passwordMismatch", undefined, "Passwords do not match"),
        );
      }

      let masterKeyBytes: Uint8Array | null = null;
      const cleanKey = oldMasterKey.trim();
      if (cleanKey) {
        if (isValidMasterKeyString(cleanKey)) {
          masterKeyBytes = parseMasterKeyString(cleanKey);
        } else {
          try {
            masterKeyBytes = parseKeyFileContent(cleanKey);
          } catch {
            throw new Error(
              t(
                "security.invalidKeyError",
                undefined,
                "Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).",
              ),
            );
          }
        }
      }

      await migrateAccount(migrateLogin, newPassword, masterKeyBytes);
    } catch (err: any) {
      setError(err?.message || "Migration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <input
        type="file"
        ref={keyFileInputRef}
        onChange={handleKeyFileChange}
        accept=".key,.txt"
        className="hidden"
        id="auth-key-file-upload-input"
        aria-label="Upload .key file"
      />

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              {t("auth.title", undefined, "Oxygen Low's Software")}
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            {requiresUnlock
              ? t(
                  "auth.unlockAfterOAuthTitle",
                  undefined,
                  "Unlock Zero-Knowledge Encryption",
                )
              : needsMigration
                ? t(
                    "auth.securityUpgradeTitle",
                    undefined,
                    "Security Upgrade & Password Migration",
                  )
                : mode === "signin"
                  ? t("auth.welcomeBack", undefined, "Welcome back!")
                  : t(
                      "auth.createAccountDesc",
                      undefined,
                      "Create your local account",
                    )}
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl">
          {requiresUnlock ? (
            /* Post-OAuth Unlock Form */
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs">
                <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400" />
                <span>
                  {t(
                    "auth.unlockAfterOAuthDesc",
                    undefined,
                    "Enter your password to derive your zero-knowledge encryption key, or continue with session locked.",
                  )}
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t("auth.password", undefined, "Password")}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="oauth-unlock-password-input"
                    type={showUnlockPassword ? "text" : "password"}
                    required
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition"
                  >
                    {showUnlockPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <button
                id="oauth-unlock-and-continue-btn"
                type="submit"
                disabled={isUnlocking}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-lg shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {isUnlocking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>
                      {t(
                        "auth.unlockAndContinue",
                        undefined,
                        "Unlock & Continue",
                      )}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                id="oauth-skip-unlock-btn"
                type="button"
                onClick={handleSkipUnlock}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5"
              >
                <span>
                  {t("auth.skipUnlock", undefined, "Skip for Now")}
                </span>
              </button>
            </form>
          ) : needsMigration ? (
            /* Migration Form */
            <form onSubmit={handleMigrateSubmit} className="space-y-4">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs">
                <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400" />
                <span>
                  {t(
                    "auth.securityUpgradeDesc",
                    undefined,
                    "Passwords are never stored on the server. Set your new password to secure your account. If you previously had encrypted data, you can optionally provide your previous masterkey to migrate it.",
                  )}
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t("auth.account", undefined, "Account")}
                </label>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                  {migrateUser?.username || migrateLogin}
                  {migrateUser?.email && ` (${migrateUser.email})`}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t("auth.newPassword", undefined, "New Password")}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  {t(
                    "auth.confirmNewPassword",
                    undefined,
                    "Confirm New Password",
                  )}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                    {t(
                      "auth.previousMasterKeyOptional",
                      undefined,
                      "Previous Masterkey (Optional)",
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => keyFileInputRef.current?.click()}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
                  >
                    <Upload className="w-3 h-3" />
                    <span>
                      {t("auth.uploadKeyFile", undefined, "Upload .key File")}
                    </span>
                  </button>
                </div>
                <input
                  type="password"
                  value={oldMasterKey}
                  onChange={(e) => setOldMasterKey(e.target.value)}
                  placeholder={t(
                    "auth.previousMasterKeyPlaceholder",
                    undefined,
                    "Paste 64-char Hex/Base64 masterkey (if you had one)...",
                  )}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-lg shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>
                      {t(
                        "auth.migrateButton",
                        undefined,
                        "Complete Migration & Sign In",
                      )}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setNeedsMigration(false);
                  setError(null);
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>
                  {t("auth.cancelMigration", undefined, "Back to Sign In")}
                </span>
              </button>
            </form>
          ) : (
            /* Normal Mode Switcher Tabs */
            <>
              <div className="flex bg-slate-800/80 p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    mode === "signin"
                      ? "bg-cyan-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t("auth.signIn", undefined, "Sign In")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    mode === "signup"
                      ? "bg-cyan-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t("auth.signUp", undefined, "Create Account")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("quick");
                    setError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    mode === "quick"
                      ? "bg-cyan-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t("auth.quickSignIn", undefined, "Quick Sign In")}
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              {mode === "quick" ? (
                <div className="space-y-5">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-start gap-2.5">
                    <Smartphone className="w-5 h-5 shrink-0 text-cyan-400 mt-0.5" />
                    <span>
                      {t(
                        "auth.quickSignInInstructions",
                        undefined,
                        "On a device where you are already signed in, go to Security and enter this code.",
                      )}
                    </span>
                  </div>

                  {quickLoading ? (
                    <div className="py-10 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                      <p className="text-xs text-slate-400">
                        {t("common.loading", undefined, "Loading...")}
                      </p>
                    </div>
                  ) : quickStatus === "approved" ? (
                    <div className="py-6 flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-medium text-emerald-400 text-center">
                        {t(
                          "auth.quickSignInSuccess",
                          undefined,
                          "Quick Sign In successful! Redirecting...",
                        )}
                      </p>
                    </div>
                  ) : quickStatus === "expired" || quickRemainingSeconds <= 0 ? (
                    <div className="py-4 space-y-4">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs text-center">
                        {t(
                          "auth.codeExpired",
                          undefined,
                          "Code expired. Please generate a new code.",
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={fetchQuickSignInCode}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>
                          {t("auth.refreshCode", undefined, "Generate New Code")}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-slate-400 block mb-2 text-center">
                          {t(
                            "auth.quickSignInCode",
                            undefined,
                            "Quick Sign In Code",
                          )}
                        </label>
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center tracking-[0.3em] font-mono font-bold text-3xl text-cyan-400 select-all shadow-inner">
                          {quickCode}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{t("auth.expiresIn", undefined, "Expires in")}:</span>
                          <span className="font-mono text-white font-medium">
                            {Math.floor(quickRemainingSeconds / 60)}:
                            {String(quickRemainingSeconds % 60).padStart(2, "0")}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={fetchQuickSignInCode}
                          disabled={quickLoading}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline disabled:opacity-50"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>
                            {t("auth.refreshCode", undefined, "Generate New Code")}
                          </span>
                        </button>
                      </div>

                      <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                        <span>
                          {t(
                            "auth.waitingForApproval",
                            undefined,
                            "Waiting for approval from your other device...",
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === "signin" ? (
                      <div>
                        <label className="text-xs font-medium text-slate-300 block mb-1">
                          {t("auth.usernameOrEmail", undefined, "Username or Email")}
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            required
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            placeholder={t(
                              "auth.enterUsernameOrEmail",
                              undefined,
                              "Enter your username or email",
                            )}
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="text-xs font-medium text-slate-300 block mb-1">
                            {t("auth.username", undefined, "Username")}
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="text"
                              required
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="e.g. johndoe"
                              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-300 block mb-1">
                            {t("auth.email", undefined, "Email")}
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="user@example.com"
                              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1">
                        {t("auth.password", undefined, "Password")}
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            mode === "signup" ? "Min 6 characters" : "••••••••"
                          }
                          className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {mode === "signup" && (
                      <div>
                        <label className="text-xs font-medium text-slate-300 block mb-1">
                          {t("auth.confirmPassword", undefined, "Confirm Password")}
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium rounded-lg shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span>
                            {mode === "signin"
                              ? t("auth.signInButton", undefined, "Sign In")
                              : t(
                                  "auth.createAccountButton",
                                  undefined,
                                  "Create Account",
                                )}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>

                  {mode === "signin" &&
                    (googleOAuthConfigured || githubOAuthConfigured) && (
                      <div className="mt-4">
                        <div className="relative my-4">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-800"></div>
                          </div>
                          <div className="relative flex justify-center text-xs">
                            <span className="bg-slate-900/60 px-2 text-slate-500">
                              {t(
                                "auth.orSignInWith",
                                undefined,
                                "Or sign in with",
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          {googleOAuthConfigured && (
                            <a
                              id="sign-in-with-google-btn"
                              href={`/api/auth/oauth/google/login?returnTo=${encodeURIComponent(returnTo)}`}
                              className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2.5 transition shadow-sm"
                            >
                              <GoogleIcon className="w-4 h-4" />
                              <span>
                                {t(
                                  "auth.signInGoogle",
                                  undefined,
                                  "Sign in with Google",
                                )}
                              </span>
                            </a>
                          )}

                          {githubOAuthConfigured && (
                            <a
                              id="sign-in-with-github-btn"
                              href={`/api/auth/oauth/github/login?returnTo=${encodeURIComponent(returnTo)}`}
                              className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2.5 transition shadow-sm"
                            >
                              <GithubIcon className="w-4 h-4" />
                              <span>
                                {t(
                                  "auth.signInGithub",
                                  undefined,
                                  "Sign in with GitHub",
                                )}
                              </span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                </>
              )}
            </>
          )}

          <div className="space-y-4 mt-6">
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <label
                htmlFor="auth-language-select"
                className="text-xs font-medium text-slate-400 block"
              >
                {t("auth.language", undefined, "Language")}
              </label>
              <LanguageSelect
                id="auth-language-select"
                value={language}
                onValueChange={(lang) => setLanguage(lang)}
              />
            </div>

            <p className="text-center text-xs text-slate-500 mt-4">
              {t(
                "auth.agreeNotice",
                undefined,
                "By signing in, you agree to our",
              )}{" "}
              <Link to="/privacy" className="text-cyan-500 hover:underline">
                {t("auth.privacyPolicy", undefined, "Privacy Policy")}
              </Link>{" "}
              {t("auth.and", undefined, "and")}{" "}
              <Link to="/terms" className="text-cyan-500 hover:underline">
                {t("auth.termsOfUse", undefined, "Terms of Use")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Only allow same-origin, in-app paths to survive an OAuth round trip. */
export function getSafeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/apps";
  }

  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return "/apps";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/apps";
  }
}
