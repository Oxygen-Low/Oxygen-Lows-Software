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

  return {
    session,
    loading,
    error,
    signIn,
    signUp,
    migrateAccount,
    changePassword,
    signOut,
  };
};
