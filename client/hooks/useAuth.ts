import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLocalSession, setLocalSession } from "@/lib/localSession";

export const useAuth = () => {
  const [session, setSession] = useState<any>(null);
  const [supabaseSession, setSupabaseSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const getSession = async () => {
      try {
        const local = getLocalSession();
        if (local) {
          if (mounted) {
            setSession(local);
            setSupabaseSession(null);
          }
        } else {
          const { data } = await supabase.auth.getSession();
          if (mounted) {
            setSession(data?.session || null);
            setSupabaseSession(data?.session || null);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    getSession();

    const { data } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      const local = getLocalSession();
      if (local) {
        setSession(local);
        setSupabaseSession(null);
      } else {
        setSession(newSession);
        setSupabaseSession(newSession);
      }
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  const signIn = async (login: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Login failed");
      }

      setLocalSession(json.session);
      setSession(json.session);
      setSupabaseSession(null);
      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (username: string, email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Sign up failed");
      }

      setLocalSession(json.session);
      setSession(json.session);
      setSupabaseSession(null);
      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithOAuth = async (
    provider: "google",
    redirectTo?: string,
  ) => {
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

  const migrateAccount = async (params: {
    supabaseToken: string;
    masterKey?: string;
    username: string;
    email: string;
    password: string;
  }) => {
    try {
      setError(null);
      setLoading(true);

      const res = await fetch("/api/auth/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Migration failed");
      }

      setLocalSession(json.session);
      setSession(json.session);
      setSupabaseSession(null);

      // Sign out from Supabase once migrated
      await supabase.auth.signOut().catch(() => {});

      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Migration failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      setLocalSession(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setSupabaseSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  };

  const hasSupabaseSession =
    Boolean(supabaseSession?.access_token) && !getLocalSession();

  return {
    session,
    supabaseSession,
    hasSupabaseSession,
    loading,
    error,
    signIn,
    signUp,
    signInWithOAuth,
    linkIdentity,
    migrateAccount,
    signOut,
  };
};
