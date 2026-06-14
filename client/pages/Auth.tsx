import { useState, useEffect } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isPasswordPwned } from "@/lib/hibp";
import { supabase } from "@/lib/supabase";
import { Mail, Lock, Loader2, Eye, EyeOff, Wand2, Globe2, ChevronLeft } from "lucide-react";
import { LANGUAGES, Language, SubLanguage } from "@/lib/languages";
import { useTranslation } from "react-i18next";

type AuthMode = "signin" | "signup" | "recovery";

export default function Auth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, signUp, signIn, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading_submit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Language selection state
  const [step, setStep] = useState<"language" | "sublanguage" | "form">("language");
  const [selectedLang, setSelectedLang] = useState<Language | null>(null);
  const [selectedSubLang, setSelectedSubLang] = useState<SubLanguage | null>(null);

  useEffect(() => {
    // Check for error in hash fragment (common for OAuth redirects)
    const hash = window.location.hash;
    if (hash && hash.includes("error_description")) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      }
    }

    // Also check query parameters
    const queryParams = new URLSearchParams(location.search);
    const queryError = queryParams.get("error_description");
    if (queryError) {
      setError(queryError);
    }

    const type = queryParams.get("type");
    if (type === "recovery") {
      setMode("recovery");
      setStep("form");
    }
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

    const generatePassword = async () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    const array = new Uint32Array(16);
    window.crypto.getRandomValues(array);
    let newPass = "";
    for (let i = 0; i < 16; i++) {
      newPass += chars[array[i] % chars.length];
    }
    setPassword(newPass);
    try {
      await navigator.clipboard.writeText(newPass);
      setSuccessMessage(t('auth.passwordGenerated'));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to copy password:", err);
      // Fallback: still set the password in the field
    }
  };

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLang(lang);
    if (lang.subLanguages) {
      setStep("sublanguage");
    } else {
      setSelectedSubLang(null);
      setStep("form");
    }
  };

  const handleSubLanguageSelect = (sub: SubLanguage) => {
    setSelectedSubLang(sub);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSubmit(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "signup") {
        const pwned = await isPasswordPwned(password);
        if (pwned) {
          throw new Error("This password has been found in a data breach. Please choose a more secure password.");
        }
        await signUp(email, password, username, selectedLang?.id, selectedSubLang?.id);
        setSuccessMessage("Account created! Check your email to verify.");
        setTimeout(() => setMode("signin"), 2000);
      } else if (mode === "recovery") {
        const pwned = await isPasswordPwned(password);
        if (pwned) {
          throw new Error("This password has been found in a data breach. Please choose a more secure password.");
        }
        const { error: updateError } = await supabase.auth.updateUser({
          password: password,
        });
        if (updateError) throw updateError;
        setSuccessMessage("Password updated successfully! You can now sign in.");
        setTimeout(() => setMode("signin"), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            {t('auth.title')}
          </h1>
          <p className="text-slate-400 text-sm">
            {mode === "signin" ? "" : mode === "signup" ? "" : t('auth.updatePassword')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          {mode === "signup" && step === "language" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-white mb-4">
                <Globe2 className="w-5 h-5 text-cyan-500" />
                <h2 className="text-xl font-semibold">{t('auth.selectLanguage')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageSelect(lang)}
                    className="flex items-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition group"
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className="text-slate-200 font-medium group-hover:text-white">{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "signup" && step === "sublanguage" && selectedLang && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("language")}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('auth.back')}</span>
              </button>
              <div className="flex items-center gap-2 text-white mb-4">
                <Globe2 className="w-5 h-5 text-cyan-500" />
                <h2 className="text-xl font-semibold">{t('auth.selectSubLanguage')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {selectedLang.subLanguages?.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => handleSubLanguageSelect(sub)}
                    className="flex items-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition group text-left"
                  >
                    <span className="text-2xl">{sub.flag}</span>
                    <span className="text-slate-200 font-medium group-hover:text-white">{sub.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(mode !== "signup" || step === "form") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => setStep(selectedLang?.subLanguages ? "sublanguage" : "language")}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition mb-2 text-xs"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>{t('auth.changeLanguage')} ({selectedLang?.name}{selectedSubLang ? ` - ${selectedSubLang.name}` : ''})</span>
                </button>
              )}

              {/* Email Input - Hidden in recovery mode */}
              {mode !== "recovery" && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    />
                  </div>
                </div>
              )}

              {/* Username Input - Only in signup mode */}
              {mode === "signup" && (
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                    {t('auth.username')}
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="your_username"
                    pattern="[a-z0-9_-]+"
                    title="Lowercase letters, numbers, hyphens, and underscores only"
                    required
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                  />
                </div>
              )}

              {/* Password Input */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  {mode === "recovery" ? t('auth.newPassword') : t('auth.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-12 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-400 transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="mt-2 w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
                  >
                    <Wand2 className="w-4 h-4" />
                    {t('auth.generatePassword')}
                  </button>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Success Message */}
              {successMessage && (
                <div className="p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                  <p className="text-green-400 text-sm">{successMessage}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading_submit}
                className="w-full py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-600 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2"
              >
                {loading_submit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('auth.processing')}
                  </>
                ) : mode === "signin" ? (
                  t('auth.signin')
                ) : mode === "signup" ? (
                  t('auth.createAccount')
                ) : (
                  t('auth.updatePassword')
                )}
              </button>
            </form>
          )}

          {/* OAuth Buttons - Only in signin mode */}
          {mode === "signin" && (
            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => signInWithOAuth("github")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                {t('auth.withProvider', { provider: 'GitHub' })}
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("discord")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                {t('auth.withProvider', { provider: 'Discord' })}
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("gitlab")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                {t('auth.withProvider', { provider: 'GitLab' })}
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("google")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                {t('auth.withProvider', { provider: 'Google' })}
              </button>
            </div>
          )}

          {/* Mode Toggle Buttons - Hidden in recovery mode */}
          {mode !== "recovery" && (
            <div className="mt-6 space-y-2 border-t border-slate-800 pt-6">
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMessage(null);
                  setStep("form");
                }}
                className={`w-full py-2 px-4 rounded-lg transition duration-200 text-sm font-medium ${
                  mode === "signin"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-300 border border-slate-700 hover:border-slate-600"
                }`}
              >
                {t('auth.signin')}
              </button>
              <button
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccessMessage(null);
                  setStep("language");
                }}
                className={`w-full py-2 px-4 rounded-lg transition duration-200 text-sm font-medium ${
                  mode === "signup"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-300 border border-slate-700 hover:border-slate-600"
                }`}
              >
                {t('auth.signup')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
