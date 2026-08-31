import { useEffect, useState } from "react";
import {
  LocalSession,
  getLocalSession,
  setLocalSession,
} from "@/lib/localSession";
import { db } from "@/lib/db";

export const useAuth = () => {
  const [session, setSession] = useState<LocalSession | null>(() =>
    getLocalSession(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const current = getLocalSession();
    if (mounted) {
      setSession(current);
      setLoading(false);
    }

    const { data } = db.auth.onAuthStateChange(
      (_event: any, newSession: any) => {
        if (mounted) {
          setSession(newSession);
        }
      },
    );

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
      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign up failed";
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
      await db.auth.signOut();
      setSession(null);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  };

  return {
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
  };
};
