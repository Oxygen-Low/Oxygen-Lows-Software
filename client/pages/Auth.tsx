import React, { useEffect, useState } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Loader2, Lock, User, Mail, ArrowRight, Eye, EyeOff } from "lucide-react";
import { LanguageSelect } from "@/components/ui/LanguageSelect";

export default function Auth() {
  const location = useLocation();
  const {
    session,
    loading,
    signIn,
    signUp,
  } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  usePageTitle(t("titles.auth", undefined, "Sign In"), {
    description: t("auth.welcomeBack", undefined, "Welcome back!"),
  });

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [login, setLogin] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestedReturnTo = new URLSearchParams(location.search).get(
    "returnTo",
  );
  const returnTo = getSafeReturnPath(requestedReturnTo);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("error_description")) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const queryError = queryParams.get("error_description");
    if (queryError) {
      setError(queryError);
    }
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  // If already logged in locally
  if (session) {
    return <Navigate to={returnTo} replace />;
  }

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
        await signIn(login.trim(), password);
      } else {
        if (!username.trim() || username.trim().length < 3) {
          throw new Error(
            t("auth.usernameLength", undefined, "Username must be at least 3 characters long"),
          );
        }
        if (!email.trim() || !email.includes("@")) {
          throw new Error(
            t("auth.validEmailRequired", undefined, "A valid email address is required"),
          );
        }
        if (!password || password.length < 6) {
          throw new Error(
            t("auth.passwordLength", undefined, "Password must be at least 6 characters long"),
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

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              {t("auth.title", undefined, "Oxygen Low's Software")}
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            {mode === "signin"
              ? t("auth.welcomeBack", undefined, "Welcome back!")
              : t("auth.createAccountDesc", undefined, "Create your local account")}
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl">
          {/* Mode Switcher Tabs */}
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
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

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
                    placeholder={t("auth.enterUsernameOrEmail", undefined, "Enter your username or email")}
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
                  placeholder={mode === "signup" ? "Min 6 characters" : "••••••••"}
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
                      : t("auth.createAccountButton", undefined, "Create Account")}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

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
