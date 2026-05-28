import { useState, useEffect } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isPasswordPwned } from "@/lib/hibp";
import { supabase } from "@/lib/supabase";
import { Mail, Lock, Loader2, Eye, EyeOff, Wand2 } from "lucide-react";

type AuthMode = "signin" | "signup" | "recovery";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, signUp, signIn, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading_submit, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    }
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  // Only redirect if NOT in recovery mode
  if (session && mode !== "recovery") {
    return <Navigate to="/" replace />;
  }

  const generatePassword = async () => {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowercase = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()_+-=";
    const allChars = `${uppercase}${lowercase}${numbers}${symbols}`;

    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
    const generatedChars = [
      pick(uppercase),
      pick(lowercase),
      pick(numbers),
      pick(symbols),
      ...Array.from({ length: 12 }, () => pick(allChars)),
    ];

    for (let i = generatedChars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [generatedChars[i], generatedChars[j]] = [generatedChars[j], generatedChars[i]];
    }

    const generated = generatedChars.join("");
    setPassword(generated);

    try {
      await navigator.clipboard.writeText(generated);
      setSuccessMessage("Generated complex password copied to clipboard.");
      setError(null);
    } catch {
      setSuccessMessage("Generated complex password, but couldn't copy automatically. Please copy it manually.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        await signIn(email, password);
        navigate("/");
      } else if (mode === "signup") {
        const pwned = await isPasswordPwned(password);
        if (pwned) {
          throw new Error("This password has been found in a data breach. Please choose a more secure password.");
        }
        await signUp(email, password, username);
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
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            Oxygen Low's Software
          </h1>
          <p className="text-slate-400 text-sm">
            {mode === "signin" ? "" : mode === "signup" ? "" : "Enter your new password below."}
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input - Hidden in recovery mode */}
            {mode !== "recovery" && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email
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
                  Username
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
                {mode === "recovery" ? "New Password" : "Password"}
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
                  Generate & Copy Password
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
                  Processing...
                </>
              ) : mode === "signin" ? (
                "Sign In"
              ) : mode === "signup" ? (
                "Create Account"
              ) : (
                "Update Password"
              )}
            </button>
          </form>

          {/* OAuth Buttons - Only in signin mode */}
          {mode === "signin" && (
            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => signInWithOAuth("github")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                Sign in with GitHub
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("discord")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                Sign in with Discord
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("gitlab")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                Sign in with GitLab
              </button>
              <button
                type="button"
                onClick={() => signInWithOAuth("google")}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
              >
                Sign in with Google
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
                }}
                className={`w-full py-2 px-4 rounded-lg transition duration-200 text-sm font-medium ${
                  mode === "signin"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-300 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`w-full py-2 px-4 rounded-lg transition duration-200 text-sm font-medium ${
                  mode === "signup"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-300 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
