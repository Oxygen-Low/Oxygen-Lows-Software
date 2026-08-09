import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

/**
 * Handles the OAuth PKCE callback.
 *
 * After the external browser redirects to http://localhost:50321/?code=…,
 * the desktop app's C# HttpListener forwards the code to the WebView by
 * navigating to /auth/callback?code=…  This component picks up the code,
 * exchanges it for a session (using the PKCE code_verifier stored earlier
 * in this WebView's localStorage), and then redirects to the app.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        navigate("/apps", { replace: true });
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          navigate("/apps", { replace: true });
        }
      },
    );

    // Timeout if it takes too long
    const timeout = setTimeout(() => {
      setError("Authentication timed out. Please try again.");
    }, 10000);

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-2">
            Authentication Error
          </h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/auth", { replace: true })}
            className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition duration-200"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Completing sign in...</p>
      </div>
    </div>
  );
}
