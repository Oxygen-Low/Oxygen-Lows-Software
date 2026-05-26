import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";

type AuthMode = "signin" | "signup";

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading, error: authError, signUp, signIn, signInWithMagicLink, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading_submit, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        await signUp(email, password);
        setSuccessMessage("Account created! Check your email to verify.");
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
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
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

            {/* Password Input (hidden for magic link mode) */}
            {(mode === "signin" || mode === "signup") && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
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
              </div>
            )}

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
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* OAuth Buttons */}
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
          </div>

          {/* Mode Toggle Buttons */}
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
        </div>
      </div>
    </div>
  );
}
