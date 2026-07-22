import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const location = useLocation();
  const { session, loading, signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const requestedReturnTo = new URLSearchParams(location.search).get("returnTo");
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

  if (session) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              Oxygen Low's Software
            </h1>
          </div>
          <p className="text-slate-400">Welcome back</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() =>
                signInWithOAuth(
                  "google",
                  `${window.location.origin}/auth?returnTo=${encodeURIComponent(returnTo)}`,
                )
              }
              className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200 flex items-center justify-center gap-2"
            >
              Sign in with Google
            </button>
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
