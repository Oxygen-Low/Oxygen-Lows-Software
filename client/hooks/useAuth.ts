import { useEffect, useState } from "react";
import {
  LocalSession,
  getLocalSession,
  setLocalSession,
} from "@/lib/localSession";
import { db } from "@/lib/db";
import {
  deriveAuthTokenFromPassword,
  deriveEncryptionKeyFromPassword,
  setActiveMasterKey,
  clearActiveMasterKey,
  getActiveMasterKey,
  migrateMasterKeyDataToPassword,
  rotateMasterKey,
} from "@/lib/crypto";
import { startAuthentication } from "@simplewebauthn/browser";

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

      const authToken = await deriveAuthTokenFromPassword(password, login);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, authToken }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Login failed");
      }

      if (json.needsMigration) {
        return json;
      }

      setLocalSession(json.session);
      setSession(json.session);

      // Derive and activate client-side zero-knowledge encryption key
      const salt = json.user?.email || login;
      const encKey = await deriveEncryptionKeyFromPassword(password, salt);
      setActiveMasterKey(encKey);

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

      const authToken = await deriveAuthTokenFromPassword(password, email);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, authToken }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Sign up failed");
      }

      setLocalSession(json.session);
      setSession(json.session);

      // Derive and activate client-side zero-knowledge encryption key
      const encKey = await deriveEncryptionKeyFromPassword(password, email);
      setActiveMasterKey(encKey);

      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const migrateAccount = async (
    login: string,
    newPassword: string,
    oldMasterKeyBytes?: Uint8Array | null,
  ) => {
    try {
      setError(null);
      setLoading(true);

      const authToken = await deriveAuthTokenFromPassword(newPassword, login);

      const res = await fetch("/api/auth/migrate-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, authToken }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Migration failed");
      }

      setLocalSession(json.session);
      setSession(json.session);

      const userEmail = json.user?.email || login;
      if (oldMasterKeyBytes) {
        await migrateMasterKeyDataToPassword({
          oldKeyBytes: oldMasterKeyBytes,
          password: newPassword,
          saltStr: userEmail,
          userId: json.user?.id,
        });
      } else {
        const newKey = await deriveEncryptionKeyFromPassword(
          newPassword,
          userEmail,
        );
        setActiveMasterKey(newKey);
      }

      return json;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Migration failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ) => {
    if (!session?.user) throw new Error("Not authenticated");
    try {
      setError(null);
      const userEmail = session.user.email || session.user.username;
      const currentAuthToken = await deriveAuthTokenFromPassword(
        currentPassword,
        userEmail,
      );
      const newAuthToken = await deriveAuthTokenFromPassword(
        newPassword,
        userEmail,
      );

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ currentAuthToken, newAuthToken }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to change password");
      }

      const currentKey =
        getActiveMasterKey() ||
        (await deriveEncryptionKeyFromPassword(currentPassword, userEmail));
      const newKey = await deriveEncryptionKeyFromPassword(
        newPassword,
        userEmail,
      );

      await rotateMasterKey({
        oldKeyBytes: currentKey,
        newKeyBytes: newKey,
        userId: session.user.id,
      });

      setActiveMasterKey(newKey);
      return { success: true };
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : "Failed to change password";
      setError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      setLocalSession(null);
      clearActiveMasterKey();
      await db.auth.signOut();
      setSession(null);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  };

  const unlockSessionWithPassword = async (password: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    const userEmail = session.user.email || session.user.username;
    const encKey = await deriveEncryptionKeyFromPassword(password, userEmail);
    setActiveMasterKey(encKey);
    return encKey;
  };

  const initLinkGoogle = async (password: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    setError(null);
    const userEmail = session.user.email || session.user.username;
    const authToken = await deriveAuthTokenFromPassword(password, userEmail);

    const res = await fetch("/api/auth/oauth/google/init-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authToken, password }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || "Failed to initialize Google link");
    }
    return json.url;
  };

  const unlinkGoogle = async (password: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    setError(null);
    const userEmail = session.user.email || session.user.username;
    const authToken = await deriveAuthTokenFromPassword(password, userEmail);

    const res = await fetch("/api/auth/oauth/google/unlink", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authToken, password }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || "Failed to unlink Google account");
    }

    try {
      const sessRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const sessJson = await sessRes.json();
      if (sessJson?.session) {
        setLocalSession(sessJson.session);
        setSession(sessJson.session);
      }
    } catch {}

    return { success: true };
  };

  const initLinkGithub = async (password: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    setError(null);
    const userEmail = session.user.email || session.user.username;
    const authToken = await deriveAuthTokenFromPassword(password, userEmail);

    const res = await fetch("/api/auth/oauth/github/init-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authToken, password }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || "Failed to initialize GitHub link");
    }
    return json.url;
  };

  const unlinkGithub = async (password: string) => {
    if (!session?.user) throw new Error("Not authenticated");
    setError(null);
    const userEmail = session.user.email || session.user.username;
    const authToken = await deriveAuthTokenFromPassword(password, userEmail);

    const res = await fetch("/api/auth/oauth/github/unlink", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authToken, password }),
    });

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || "Failed to unlink GitHub account");
    }

    try {
      const sessRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const sessJson = await sessRes.json();
      if (sessJson?.session) {
        setLocalSession(sessJson.session);
        setSession(sessJson.session);
      }
    } catch {}

    return { success: true };
  };

  const signInWithPasskey = async (options?: { conditional?: boolean }) => {
    try {
      setError(null);
      if (!options?.conditional) {
        setLoading(true);
      }

      // 1. Fetch authentication options from server
      const optRes = await fetch("/api/auth/passkey/login-options");
      const optJson = await optRes.json();
      if (!optRes.ok || optJson.error) {
        throw new Error(optJson.error || "Failed to get passkey login options");
      }

      // 2. Perform WebAuthn authentication ceremony with browser
      const asseResp = await startAuthentication({
        optionsJSON: optJson.options,
        useBrowserAutofill: options?.conditional,
      });

      // 3. Verify authentication response with server
      const verRes = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: asseResp }),
      });

      const verJson = await verRes.json();
      if (!verRes.ok || verJson.error) {
        throw new Error(verJson.error || "Passkey verification failed");
      }

      setLocalSession(verJson.session);
      setSession(verJson.session);

      return {
        session: verJson.session,
        user: verJson.user,
        token: verJson.token,
        requiresUnlock: true,
      };
    } catch (err: any) {
      if (
        options?.conditional &&
        (err.name === "AbortError" ||
          err.name === "WebAuthnAbortError" ||
          err.message?.includes("conditional"))
      ) {
        // Ignored for background conditional UI mediation cancellation
        return null;
      }
      const message =
        err instanceof Error ? err.message : "Passkey sign in failed";
      if (!options?.conditional) {
        setError(message);
      }
      throw err;
    } finally {
      if (!options?.conditional) {
        setLoading(false);
      }
    }
  };

  return {
    session,
    loading,
    error,
    signIn,
    signInWithPasskey,
    signUp,
    migrateAccount,
    changePassword,
    unlockSessionWithPassword,
    initLinkGoogle,
    unlinkGoogle,
    initLinkGithub,
    unlinkGithub,
    signOut,
  };
};
