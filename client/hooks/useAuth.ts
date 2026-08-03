import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signInWithOAuth = async (provider: "google", redirectTo?: string) => {
    try {
      setError(null);
      const isWebView =
        typeof window !== "undefined" &&
        (window as any).chrome?.webview != null;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: isWebView
            ? "oxygenlows://auth/callback"
            : (redirectTo ?? window.location.origin),
          scopes: "email profile openid",
          ...(isWebView ? { skipBrowserRedirect: true } : {}),
        },
      });
      if (error) throw error;

      if (isWebView && data?.url) {
        (window as any).chrome.webview.postMessage(
          JSON.stringify({
            command: "open_browser",
            url: data.url,
          }),
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${provider} sign in failed`;
      setError(message);
      throw err;
    }
  };

  const linkIdentity = async (provider: "google") => {
    try {
      setError(null);
      const isWebView =
        typeof window !== "undefined" &&
        (window as any).chrome?.webview != null;
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: isWebView
            ? "oxygenlows://auth/callback"
            : `${window.location.origin}/account`,
          scopes: "email profile openid",
          ...(isWebView ? { skipBrowserRedirect: true } : {}),
        },
      });
      if (error) throw error;

      if (isWebView && data?.url) {
        (window as any).chrome.webview.postMessage(
          JSON.stringify({
            command: "open_browser",
            url: data.url,
          }),
        );
      }
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${provider} linking failed`;
      setError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  };

  return {
    session,
    loading,
    error,
    signInWithOAuth,
    linkIdentity,
    signOut,
  };
};
