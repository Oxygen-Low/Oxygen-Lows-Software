import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  ShieldCheck,
  KeyRound,
  Check,
  Lock,
  Unlock,
  Info,
  Database,
  Users,
  Bot,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Link2,
  Unlink,
  Smartphone,
  Laptop,
  Globe,
  Clock,
  Fingerprint,
  Plus,
  Trash2,
  Edit3,
} from "lucide-react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/db";
import {
  getActiveMasterKey,
  setActiveMasterKey,
  migrateCategoryEncryption,
  deriveEncryptionKeyFromPassword,
  type EncryptionCategory,
} from "@/lib/crypto";

const STORAGE_KEYS = {
  ENCRYPT_CHARACTERS: "oxygen_encrypt_characters",
  ENCRYPT_DATA_SAVE: "oxygen_encrypt_data_save",
  ENCRYPT_CHATBOT: "oxygen_encrypt_chatbot",
  ENCRYPT_PASSWORDS: "oxygen_encrypt_passwords",
};

export default function Security() {
  const auth = useAuth();
  const session = auth?.session;
  const changePassword = auth?.changePassword;
  const { t } = useTranslation();
  usePageTitle(t("titles.security", undefined, "Security"), {
    description: t(
      "security.subtitle",
      undefined,
      "Manage zero-knowledge password encryption and protect your private data.",
    ),
  });
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get("returnTo");

  // Active key in memory & session
  const [keyBytes, setKeyBytes] = useState<Uint8Array | null>(() =>
    getActiveMasterKey(),
  );

  // Encryption Toggles
  const [encryptCharacters, setEncryptCharacters] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ENCRYPT_CHARACTERS) === "true";
    } catch {
      return false;
    }
  });

  const [encryptDataSave, setEncryptDataSave] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ENCRYPT_DATA_SAVE) === "true";
    } catch {
      return false;
    }
  });

  const [encryptChatbot, setEncryptChatbot] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ENCRYPT_CHATBOT) === "true";
    } catch {
      return false;
    }
  });

  const [encryptPasswords, setEncryptPasswords] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ENCRYPT_PASSWORDS) === "true";
    } catch {
      return false;
    }
  });

  const [migratingCategory, setMigratingCategory] =
    useState<EncryptionCategory | null>(null);

  // Unlock with password state
  const [unlockPassword, setUnlockPassword] = useState<string>("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlockingPassword, setIsUnlockingPassword] =
    useState<boolean>(false);

  // Change password dialog state
  const [showChangePasswordDialog, setShowChangePasswordDialog] =
    useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [changePasswordError, setChangePasswordError] = useState<
    string | null
  >(null);

  // OAuth State
  const [googleOAuthConfigured, setGoogleOAuthConfigured] =
    useState<boolean>(true);
  const [githubOAuthConfigured, setGithubOAuthConfigured] =
    useState<boolean>(true);
  const [linkedGoogle, setLinkedGoogle] = useState<{
    linked: boolean;
    email?: string;
    linked_at?: string;
  } | null>(() => {
    const raw = session?.user?.oauth?.google;
    return raw?.id || raw?.linked
      ? { linked: true, email: raw.email, linked_at: raw.linked_at }
      : null;
  });
  const [linkedGithub, setLinkedGithub] = useState<{
    linked: boolean;
    email?: string;
    linked_at?: string;
  } | null>(() => {
    const raw = session?.user?.oauth?.github;
    return raw?.id || raw?.linked
      ? { linked: true, email: raw.email, linked_at: raw.linked_at }
      : null;
  });

  const [showLinkGoogleDialog, setShowLinkGoogleDialog] =
    useState<boolean>(false);
  const [showUnlinkGoogleDialog, setShowUnlinkGoogleDialog] =
    useState<boolean>(false);
  const [googleReauthPassword, setGoogleReauthPassword] = useState<string>("");
  const [googleReauthError, setGoogleReauthError] = useState<string | null>(
    null,
  );
  const [isProcessingGoogleOAuth, setIsProcessingGoogleOAuth] =
    useState<boolean>(false);

  const [showLinkGithubDialog, setShowLinkGithubDialog] =
    useState<boolean>(false);
  const [showUnlinkGithubDialog, setShowUnlinkGithubDialog] =
    useState<boolean>(false);
  const [githubReauthPassword, setGithubReauthPassword] = useState<string>("");
  const [githubReauthError, setGithubReauthError] = useState<string | null>(
    null,
  );
  const [isProcessingGithubOAuth, setIsProcessingGithubOAuth] =
    useState<boolean>(false);

  // Quick Sign In State
  const [quickCodeInput, setQuickCodeInput] = useState<string>("");
  const [quickVerifying, setQuickVerifying] = useState<boolean>(false);
  const [quickSessionDetails, setQuickSessionDetails] = useState<{
    valid: boolean;
    code: string;
    createdAt: number;
    expiresAt: number;
    ip: string;
    userAgent: string;
  } | null>(null);
  const [showQuickConfirmDialog, setShowQuickConfirmDialog] =
    useState<boolean>(false);
  const [quickApproving, setQuickApproving] = useState<boolean>(false);
  const [quickRejecting, setQuickRejecting] = useState<boolean>(false);

  // Passkeys State
  const [passkeys, setPasskeys] = useState<
    Array<{
      id: string;
      name: string;
      createdAt: string;
      lastUsedAt: string | null;
      deviceType?: string;
      backedUp?: boolean;
    }>
  >([]);
  const [passkeysLoading, setPasskeysLoading] = useState<boolean>(true);
  const [passkeysSupported, setPasskeysSupported] = useState<boolean>(false);

  // Register Passkey Dialog
  const [showRegisterPasskeyDialog, setShowRegisterPasskeyDialog] =
    useState<boolean>(false);
  const [registerNickname, setRegisterNickname] = useState<string>("");
  const [registerPassword, setRegisterPassword] = useState<string>("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegisteringPasskey, setIsRegisteringPasskey] =
    useState<boolean>(false);

  // Rename Passkey Dialog
  const [showRenamePasskeyDialog, setShowRenamePasskeyDialog] =
    useState<boolean>(false);
  const [passkeyToRename, setPasskeyToRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newPasskeyName, setNewPasskeyName] = useState<string>("");
  const [isRenamingPasskey, setIsRenamingPasskey] = useState<boolean>(false);

  // Delete Passkey Dialog
  const [showDeletePasskeyDialog, setShowDeletePasskeyDialog] =
    useState<boolean>(false);
  const [passkeyToDelete, setPasskeyToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletePasskeyPassword, setDeletePasskeyPassword] =
    useState<string>("");
  const [deletePasskeyError, setDeletePasskeyError] = useState<string | null>(
    null,
  );
  const [isDeletingPasskey, setIsDeletingPasskey] = useState<boolean>(false);

  const fetchPasskeys = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/auth/passkey/list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok && data.passkeys) {
        setPasskeys(data.passkeys);
      }
    } catch {
      // ignore
    } finally {
      setPasskeysLoading(false);
    }
  };

  useEffect(() => {
    try {
      setPasskeysSupported(browserSupportsWebAuthn());
    } catch {
      setPasskeysSupported(false);
    }
    fetchPasskeys();
  }, [session?.access_token]);

  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    if (!registerPassword) {
      setRegisterError(
        t("auth.passwordRequired", undefined, "Password is required"),
      );
      return;
    }
    setIsRegisteringPasskey(true);
    try {
      // 1. Get registration options with password confirmation
      const optRes = await fetch("/api/auth/passkey/register-options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          password: registerPassword,
          nickname: registerNickname,
        }),
      });
      const optData = await optRes.json();
      if (!optRes.ok || optData.error) {
        throw new Error(
          optData.error ||
            t(
              "security.failedToGetRegisterOptions",
              undefined,
              "Failed to get registration options",
            ),
        );
      }

      // 2. Perform WebAuthn registration ceremony with browser
      const attResp = await startRegistration({
        optionsJSON: optData.options,
      });

      // 3. Verify attestation response with server
      const verRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          response: attResp,
          nickname: registerNickname,
        }),
      });
      const verData = await verRes.json();
      if (!verRes.ok || verData.error) {
        throw new Error(
          verData.error ||
            t(
              "security.failedToVerifyPasskey",
              undefined,
              "Failed to verify passkey",
            ),
        );
      }

      toast.success(
        t(
          "security.passkeyRegisteredSuccess",
          undefined,
          "Passkey registered successfully!",
        ),
      );
      setShowRegisterPasskeyDialog(false);
      setRegisterNickname("");
      setRegisterPassword("");
      await fetchPasskeys();
    } catch (err: any) {
      if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
        setRegisterError(err.message || "Failed to register passkey");
        toast.error(err.message || "Failed to register passkey");
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleRenamePasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkeyToRename || !newPasskeyName.trim()) return;
    setIsRenamingPasskey(true);
    try {
      const res = await fetch("/api/auth/passkey/rename", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          credentialId: passkeyToRename.id,
          name: newPasskeyName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to rename passkey");
      }
      toast.success(
        t(
          "security.passkeyRenamedSuccess",
          undefined,
          "Passkey renamed successfully!",
        ),
      );
      setShowRenamePasskeyDialog(false);
      setPasskeyToRename(null);
      setNewPasskeyName("");
      await fetchPasskeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to rename passkey");
    } finally {
      setIsRenamingPasskey(false);
    }
  };

  const handleDeletePasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkeyToDelete) return;
    setDeletePasskeyError(null);
    if (!deletePasskeyPassword) {
      setDeletePasskeyError(
        t("auth.passwordRequired", undefined, "Password is required"),
      );
      return;
    }
    setIsDeletingPasskey(true);
    try {
      const res = await fetch("/api/auth/passkey/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          credentialId: passkeyToDelete.id,
          password: deletePasskeyPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete passkey");
      }
      toast.success(
        t(
          "security.passkeyDeletedSuccess",
          undefined,
          "Passkey deleted successfully!",
        ),
      );
      setShowDeletePasskeyDialog(false);
      setPasskeyToDelete(null);
      setDeletePasskeyPassword("");
      await fetchPasskeys();
    } catch (err: any) {
      setDeletePasskeyError(err.message || "Failed to delete passkey");
      toast.error(err.message || "Failed to delete passkey");
    } finally {
      setIsDeletingPasskey(false);
    }
  };

  const handleVerifyQuickCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = quickCodeInput.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 6) {
      toast.error(
        t(
          "security.invalidCode",
          undefined,
          "Invalid or expired quick sign in code.",
        ),
      );
      return;
    }
    setQuickVerifying(true);
    try {
      const res = await fetch("/api/auth/quick-sign-in/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code: cleanCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(
          data.error ||
            t(
              "security.invalidCode",
              undefined,
              "Invalid or expired quick sign in code.",
            ),
        );
      }
      setQuickSessionDetails(data);
      setShowQuickConfirmDialog(true);
    } catch (err: any) {
      toast.error(
        err.message ||
          t(
            "security.invalidCode",
            undefined,
            "Invalid or expired quick sign in code.",
          ),
      );
    } finally {
      setQuickVerifying(false);
    }
  };

  const handleApproveQuickSignIn = async () => {
    if (!quickSessionDetails) return;
    setQuickApproving(true);
    try {
      const res = await fetch("/api/auth/quick-sign-in/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code: quickSessionDetails.code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to approve sign in");
      }
      toast.success(
        t(
          "security.quickSignInApproved",
          undefined,
          "Device signed in successfully!",
        ),
      );
      setShowQuickConfirmDialog(false);
      setQuickCodeInput("");
      setQuickSessionDetails(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve sign in");
    } finally {
      setQuickApproving(false);
    }
  };

  const handleRejectQuickSignIn = async () => {
    if (!quickSessionDetails) return;
    setQuickRejecting(true);
    try {
      await fetch("/api/auth/quick-sign-in/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code: quickSessionDetails.code }),
      });
      toast.info(
        t(
          "security.quickSignInDenied",
          undefined,
          "Sign in request was denied.",
        ),
      );
      setShowQuickConfirmDialog(false);
      setQuickCodeInput("");
      setQuickSessionDetails(null);
    } catch {
      // Ignored
    } finally {
      setQuickRejecting(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/oauth/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.google) {
          setGoogleOAuthConfigured(Boolean(data.google.enabled));
        }
        if (data?.github) {
          setGithubOAuthConfigured(Boolean(data.github.enabled));
        }
      })
      .catch(() => {});

    if (session?.access_token) {
      fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.user?.oauth?.google) {
            setLinkedGoogle({
              linked: true,
              email: data.user.oauth.google.email,
              linked_at: data.user.oauth.google.linked_at,
            });
          } else {
            setLinkedGoogle(null);
          }

          if (data?.user?.oauth?.github) {
            setLinkedGithub({
              linked: true,
              email: data.user.oauth.github.email,
              linked_at: data.user.oauth.github.linked_at,
            });
          } else {
            setLinkedGithub(null);
          }
        })
        .catch(() => {});
    }

    const oauthParam = searchParams.get("oauth");
    const errorParam = searchParams.get("error");
    const providerParam = searchParams.get("provider");
    const isGithub = providerParam === "github";

    if (oauthParam === "linked") {
      toast.success(
        isGithub
          ? t(
              "security.githubLinkedSuccess",
              undefined,
              "GitHub account successfully linked.",
            )
          : t(
              "security.oauthLinkedSuccess",
              undefined,
              "Google account successfully linked.",
            ),
      );
      navigate("/security", { replace: true });
    } else if (errorParam === "oauth_already_linked") {
      toast.error(
        isGithub
          ? t(
              "security.githubAlreadyLinked",
              undefined,
              "This GitHub account is already linked to another account.",
            )
          : t(
              "security.oauthAlreadyLinked",
              undefined,
              "This Google account is already linked to another account.",
            ),
      );
      navigate("/security", { replace: true });
    } else if (errorParam) {
      toast.error(
        isGithub
          ? t(
              "security.githubOauthFailed",
              undefined,
              "GitHub authentication was cancelled or failed.",
            )
          : t(
              "security.oauthFailed",
              undefined,
              "Google authentication was cancelled or failed.",
            ),
      );
      navigate("/security", { replace: true });
    }
  }, [searchParams, session?.access_token]);

  const handleInitiateLinkGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleReauthPassword) return;
    setIsProcessingGoogleOAuth(true);
    setGoogleReauthError(null);
    try {
      if (!auth?.initLinkGoogle) {
        throw new Error("Authentication method not available");
      }
      const authUrl = await auth.initLinkGoogle(googleReauthPassword);
      window.location.href = authUrl;
    } catch (err: any) {
      setGoogleReauthError(err.message || "Failed to initiate Google link");
      setIsProcessingGoogleOAuth(false);
    }
  };

  const handleUnlinkGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleReauthPassword) return;
    setIsProcessingGoogleOAuth(true);
    setGoogleReauthError(null);
    try {
      if (!auth?.unlinkGoogle) {
        throw new Error("Authentication method not available");
      }
      await auth.unlinkGoogle(googleReauthPassword);
      setLinkedGoogle(null);
      setShowUnlinkGoogleDialog(false);
      setGoogleReauthPassword("");
      toast.success(
        t(
          "security.oauthUnlinkedSuccess",
          undefined,
          "Google account successfully unlinked.",
        ),
      );
    } catch (err: any) {
      setGoogleReauthError(err.message || "Failed to unlink Google account");
    } finally {
      setIsProcessingGoogleOAuth(false);
    }
  };

  const handleInitiateLinkGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubReauthPassword) return;
    setIsProcessingGithubOAuth(true);
    setGithubReauthError(null);
    try {
      if (!auth?.initLinkGithub) {
        throw new Error("Authentication method not available");
      }
      const authUrl = await auth.initLinkGithub(githubReauthPassword);
      window.location.href = authUrl;
    } catch (err: any) {
      setGithubReauthError(err.message || "Failed to initiate GitHub link");
      setIsProcessingGithubOAuth(false);
    }
  };

  const handleUnlinkGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubReauthPassword) return;
    setIsProcessingGithubOAuth(true);
    setGithubReauthError(null);
    try {
      if (!auth?.unlinkGithub) {
        throw new Error("Authentication method not available");
      }
      await auth.unlinkGithub(githubReauthPassword);
      setLinkedGithub(null);
      setShowUnlinkGithubDialog(false);
      setGithubReauthPassword("");
      toast.success(
        t(
          "security.githubUnlinkedSuccess",
          undefined,
          "GitHub account successfully unlinked.",
        ),
      );
    } catch (err: any) {
      setGithubReauthError(err.message || "Failed to unlink GitHub account");
    } finally {
      setIsProcessingGithubOAuth(false);
    }
  };

  // Keep session storage synced
  useEffect(() => {
    setActiveMasterKey(keyBytes);
  }, [keyBytes]);

  const handleUnlockWithPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!unlockPassword.trim()) return;
    setIsUnlockingPassword(true);
    setUnlockError(null);
    try {
      const userSalt = (
        session?.user?.email ||
        session?.user?.username ||
        session?.user?.id ||
        "default"
      ).toLowerCase();
      const derivedKey = await deriveEncryptionKeyFromPassword(
        unlockPassword,
        userSalt,
      );
      setKeyBytes(derivedKey);
      setActiveMasterKey(derivedKey);
      setUnlockPassword("");
      toast.success(
        t(
          "security.unlockSuccessToast",
          undefined,
          "Session unlocked and encryption key derived",
        ),
      );
    } catch (err: any) {
      console.error("Failed to unlock with password:", err);
      const msg =
        err?.message ||
        t(
          "security.invalidPasswordError",
          undefined,
          "Failed to unlock session with password.",
        );
      setUnlockError(msg);
      toast.error(msg);
    } finally {
      setIsUnlockingPassword(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    if (!currentPassword) {
      setChangePasswordError(
        t("auth.passwordRequired", undefined, "Password is required"),
      );
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError(
        t(
          "auth.passwordLength",
          undefined,
          "Password must be at least 6 characters long",
        ),
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError(
        t("auth.passwordMismatch", undefined, "Passwords do not match"),
      );
      return;
    }
    setIsChangingPassword(true);
    try {
      if (changePassword) {
        await changePassword(currentPassword, newPassword);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowChangePasswordDialog(false);
      toast.success(
        t(
          "security.passwordChangedToast",
          undefined,
          "Password changed and data re-encrypted successfully!",
        ),
      );
    } catch (err: any) {
      console.error("Change password error:", err);
      setChangePasswordError(err?.message || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleToggleCategory = async (
    category: EncryptionCategory,
    checked: boolean,
  ) => {
    if (!keyBytes) {
      toast.error(
        t(
          "security.masterKeyRequiredToChange",
          undefined,
          "Your session is currently locked. Unlock your session with your password to change encryption settings.",
        ),
      );
      return;
    }

    if (category === "passwords" && !checked) {
      try {
        let query = supabase
          .from("user_passwords")
          .select("id", { count: "exact", head: true });
        if (session?.user?.id) {
          query = query.eq("user_id", session.user.id);
        }
        const { count, error } = await query;
        if (!error && count && count > 0) {
          toast.error(
            t(
              "security.cannotDisablePasswordsWithRecords",
              undefined,
              "Cannot disable encryption while passwords are stored. Please delete all passwords first.",
            ),
          );
          return;
        }
      } catch (err) {
        console.error("Failed to check stored passwords:", err);
      }
    }

    if (category === "characters") {
      setEncryptCharacters(checked);
      localStorage.setItem(STORAGE_KEYS.ENCRYPT_CHARACTERS, String(checked));
    } else if (category === "data_save") {
      setEncryptDataSave(checked);
      localStorage.setItem(STORAGE_KEYS.ENCRYPT_DATA_SAVE, String(checked));
    } else if (category === "chatbot") {
      setEncryptChatbot(checked);
      localStorage.setItem(STORAGE_KEYS.ENCRYPT_CHATBOT, String(checked));
    } else if (category === "passwords") {
      setEncryptPasswords(checked);
      localStorage.setItem(STORAGE_KEYS.ENCRYPT_PASSWORDS, String(checked));
    }

    setMigratingCategory(category);
    try {
      const result = await migrateCategoryEncryption({
        category,
        enable: checked,
        keyBytes,
        userId: session?.user?.id,
      });

      const msg = checked
        ? t(
            "security.migrationEncryptedToast",
            { count: result.updatedCount },
            `Encryption enabled. ${result.updatedCount} records encrypted and updated in cloud.`,
          )
        : t(
            "security.migrationDecryptedToast",
            { count: result.updatedCount },
            `Encryption disabled. ${result.updatedCount} records decrypted and restored in cloud.`,
          );
      toast.success(msg);
    } catch (err: any) {
      console.error("Encryption migration failed:", err);
      toast.error(
        err.message ||
          t(
            "security.migrationFailed",
            undefined,
            "Failed to update encryption on existing cloud records.",
          ),
      );
    } finally {
      setMigratingCategory(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-20 animate-in fade-in duration-500">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
            <span>
              {t("security.title", undefined, "Security & Data Encryption")}
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400">
            {t(
              "security.subtitle",
              undefined,
              "Manage zero-knowledge password encryption and protect your private data.",
            )}
          </p>
        </div>

        {/* ReturnTo Banner if redirected from an encrypted section */}
        {returnTo && keyBytes && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">
                  {t(
                    "security.returnToPrompt",
                    undefined,
                    "Encryption active. You can now return to your previous page:",
                  )}
                </p>
                <p className="text-xs font-mono text-slate-400">{returnTo}</p>
              </div>
            </div>
            <Button
              onClick={() => navigate(returnTo)}
              size="sm"
              className="gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {t("security.returnToButton", undefined, "Return to Page")}
              </span>
            </Button>
          </div>
        )}

        {/* Section 1: Zero-Knowledge Password Encryption */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  {t(
                    "security.passwordEncryptionTitle",
                    undefined,
                    "Zero-Knowledge Password Encryption",
                  )}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "security.passwordEncryptionDesc",
                    undefined,
                    "Your private data is secured with client-side AES-256 encryption derived directly from your password. Your password and plaintext data never touch the server.",
                  )}
                </CardDescription>
              </div>

              <div className="shrink-0">
                {keyBytes ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1.5 py-0.5 px-2.5 font-medium"
                  >
                    <Lock className="w-3 h-3" />
                    {t(
                      "security.keyActiveBadge",
                      undefined,
                      "Encryption Active",
                    )}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-400 gap-1.5 py-0.5 px-2.5 font-medium"
                  >
                    <Unlock className="w-3 h-3" />
                    {t(
                      "security.keyNotSetBadge",
                      undefined,
                      "Session Locked",
                    )}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {keyBytes ? (
              /* Active Encryption View */
              <div className="space-y-4">
                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    id="change-password-btn"
                    onClick={() => setShowChangePasswordDialog(true)}
                    className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {t(
                        "security.changePasswordTitle",
                        undefined,
                        "Change Password",
                      )}
                    </span>
                  </Button>
                </div>
              </div>
            ) : (
              /* Inactive / Locked View - Password Unlock Form */
              <div className="space-y-5">
                <div className="p-5 sm:p-6 rounded-xl border border-cyan-500/40 bg-cyan-950/20 backdrop-blur-sm space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-white font-semibold text-base">
                      <Lock className="w-5 h-5 text-cyan-400" />
                      <span>
                        {t(
                          "security.unlockWithPasswordTitle",
                          undefined,
                          "Unlock with Password",
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                      {t(
                        "security.unlockWithPasswordDesc",
                        undefined,
                        "Enter your account password to derive your zero-knowledge AES-256 encryption key and unlock your data.",
                      )}
                    </p>
                  </div>

                  <form
                    onSubmit={handleUnlockWithPassword}
                    className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
                  >
                    <div className="relative flex-1">
                      <Input
                        id="unlock-password-input"
                        type="password"
                        placeholder={t(
                          "security.enterAccountPassword",
                          undefined,
                          "Enter your account password...",
                        )}
                        value={unlockPassword}
                        onChange={(e) => {
                          setUnlockPassword(e.target.value);
                          if (unlockError) setUnlockError(null);
                        }}
                        className="bg-slate-900/90 border-slate-800 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
                      />
                    </div>
                    <Button
                      id="unlock-with-password-btn"
                      type="submit"
                      disabled={!unlockPassword.trim() || isUnlockingPassword}
                      className="gap-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
                    >
                      {isUnlockingPassword ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                      <span>
                        {t(
                          "security.unlockWithPasswordBtn",
                          undefined,
                          "Unlock Session",
                        )}
                      </span>
                    </Button>
                  </form>
                  {unlockError && (
                    <p className="text-xs text-rose-400 leading-tight font-medium">
                      {unlockError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Data Encryption Toggles */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-cyan-400" />
              {t(
                "security.encryptionSettingsTitle",
                undefined,
                "Protected Data Categories",
              )}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-400">
              {t(
                "security.encryptionSettingsDesc",
                undefined,
                "Toggle client-side AES-256 encryption for each data category. When enabled, data is encrypted with your password key before storage.",
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!keyBytes && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t(
                    "security.masterKeyRequiredNotice",
                    undefined,
                    "Your session is currently locked. Enter your password above to modify encryption settings.",
                  )}
                </span>
              </div>
            )}

            {/* Toggle 1: Characters and Universes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0 mt-0.5 sm:mt-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="toggle-characters"
                      className="text-sm sm:text-base font-semibold text-white cursor-pointer"
                    >
                      {t(
                        "security.charactersUniverses",
                        undefined,
                        "Characters and Universes",
                      )}
                    </Label>
                    {encryptCharacters ? (
                      keyBytes ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        >
                          {t(
                            "security.encryptionEnabled",
                            undefined,
                            "Encrypted",
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30"
                        >
                          {t(
                            "security.keyRequiredBadge",
                            undefined,
                            "Locked",
                          )}
                        </Badge>
                      )
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t(
                          "security.encryptionDisabled",
                          undefined,
                          "Unencrypted",
                        )}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {t(
                      "security.charactersUniversesDesc",
                      undefined,
                      "Encrypt character bios, appearances, personalities, private notes, and universe lore.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {migratingCategory === "characters" && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
                <Switch
                  id="toggle-characters"
                  checked={encryptCharacters}
                  disabled={!keyBytes || migratingCategory !== null}
                  onCheckedChange={(checked) =>
                    handleToggleCategory("characters", checked)
                  }
                />
              </div>
            </div>

            {/* Toggle 2: Data Save Entries */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0 mt-0.5 sm:mt-0">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="toggle-datasave"
                      className="text-sm sm:text-base font-semibold text-white cursor-pointer"
                    >
                      {t("security.dataSave", undefined, "Data Save Entries")}
                    </Label>
                    {encryptDataSave ? (
                      keyBytes ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        >
                          {t(
                            "security.encryptionEnabled",
                            undefined,
                            "Encrypted",
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30"
                        >
                          {t(
                            "security.keyRequiredBadge",
                            undefined,
                            "Locked",
                          )}
                        </Badge>
                      )
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t(
                          "security.encryptionDisabled",
                          undefined,
                          "Unencrypted",
                        )}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {t(
                      "security.dataSaveDesc",
                      undefined,
                      "Encrypt custom key-value snippets, code snippets, notes, and stored data records.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {migratingCategory === "data_save" && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
                <Switch
                  id="toggle-datasave"
                  checked={encryptDataSave}
                  disabled={!keyBytes || migratingCategory !== null}
                  onCheckedChange={(checked) =>
                    handleToggleCategory("data_save", checked)
                  }
                />
              </div>
            </div>

            {/* Toggle 3: Chatbot Chats */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5 sm:mt-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="toggle-chatbot"
                      className="text-sm sm:text-base font-semibold text-white cursor-pointer"
                    >
                      {t("security.chatbotChats", undefined, "Chatbot Chats")}
                    </Label>
                    {encryptChatbot ? (
                      keyBytes ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        >
                          {t(
                            "security.encryptionEnabled",
                            undefined,
                            "Encrypted",
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30"
                        >
                          {t(
                            "security.keyRequiredBadge",
                            undefined,
                            "Locked",
                          )}
                        </Badge>
                      )
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t(
                          "security.encryptionDisabled",
                          undefined,
                          "Unencrypted",
                        )}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {t(
                      "security.chatbotChatsDesc",
                      undefined,
                      "Encrypt AI conversations, message history, and system prompts.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {migratingCategory === "chatbot" && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
                <Switch
                  id="toggle-chatbot"
                  checked={encryptChatbot}
                  disabled={!keyBytes || migratingCategory !== null}
                  onCheckedChange={(checked) =>
                    handleToggleCategory("chatbot", checked)
                  }
                />
              </div>
            </div>

            {/* Toggle 4: Password Vault */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5 sm:mt-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="toggle-passwords"
                      className="text-sm sm:text-base font-semibold text-white cursor-pointer"
                    >
                      {t("security.passwords", undefined, "Password Vault")}
                    </Label>
                    {encryptPasswords ? (
                      keyBytes ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        >
                          {t(
                            "security.encryptionEnabled",
                            undefined,
                            "Encrypted",
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border-amber-500/30"
                        >
                          {t(
                            "security.keyRequiredBadge",
                            undefined,
                            "Locked",
                          )}
                        </Badge>
                      )
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t(
                          "security.encryptionDisabled",
                          undefined,
                          "Unencrypted",
                        )}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {t(
                      "security.passwordsDesc",
                      undefined,
                      "Encrypt stored passwords, URLs, and notes in your personal password manager.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {migratingCategory === "passwords" && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
                <Switch
                  id="toggle-passwords"
                  checked={encryptPasswords}
                  disabled={!keyBytes || migratingCategory !== null}
                  onCheckedChange={(checked) =>
                    handleToggleCategory("passwords", checked)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: OAuth Accounts */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-cyan-400" />
                  {t("security.oauthTitle", undefined, "OAuth")}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "security.oauthDesc",
                    undefined,
                    "Manage external accounts linked to your profile for single sign-on.",
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 shrink-0 mt-0.5 sm:mt-0 flex items-center justify-center">
                  <GoogleIcon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold text-white">
                      {t("security.googleProvider", undefined, "Google")}
                    </span>
                    {linkedGoogle?.linked ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      >
                        {t(
                          "security.encryptionEnabled",
                          undefined,
                          "Linked",
                        )}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t("security.notLinked", undefined, "Not Linked")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {linkedGoogle?.linked && linkedGoogle.email
                      ? t(
                          "security.linkedAs",
                          { email: linkedGoogle.email },
                          `Linked as ${linkedGoogle.email}`,
                        )
                      : t(
                          "security.oauthDesc",
                          undefined,
                          "Connect your Google account to enable Google sign-in for your profile.",
                        )}
                  </p>
                  {!googleOAuthConfigured && (
                    <p className="text-[11px] text-amber-400/90">
                      {t(
                        "security.googleNotConfigured",
                        undefined,
                        "Google OAuth is not configured on this server.",
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {linkedGoogle?.linked ? (
                  <Button
                    id="unlink-google-btn"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGoogleReauthPassword("");
                      setGoogleReauthError(null);
                      setShowUnlinkGoogleDialog(true);
                    }}
                    className="border-rose-900/50 bg-rose-950/20 text-rose-400 hover:bg-rose-900/40 hover:text-rose-200 text-xs gap-1.5"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>
                      {t("security.unlinkGoogle", undefined, "Unlink Google")}
                    </span>
                  </Button>
                ) : (
                  <Button
                    id="link-google-btn"
                    size="sm"
                    disabled={!googleOAuthConfigured}
                    onClick={() => {
                      setGoogleReauthPassword("");
                      setGoogleReauthError(null);
                      setShowLinkGoogleDialog(true);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs gap-2"
                  >
                    <GoogleIcon className="w-3.5 h-3.5" />
                    <span>
                      {t(
                        "security.linkGoogle",
                        undefined,
                        "Link Google Account",
                      )}
                    </span>
                  </Button>
                )}
              </div>
            </div>

            {/* GitHub Provider */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 shrink-0 mt-0.5 sm:mt-0 flex items-center justify-center">
                  <GithubIcon className="w-5 h-5 text-white" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-semibold text-white">
                      {t("security.githubProvider", undefined, "GitHub")}
                    </span>
                    {linkedGithub?.linked ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      >
                        {t(
                          "security.encryptionEnabled",
                          undefined,
                          "Linked",
                        )}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 border-slate-700"
                      >
                        {t("security.notLinked", undefined, "Not Linked")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    {linkedGithub?.linked && linkedGithub.email
                      ? t(
                          "security.linkedAs",
                          { email: linkedGithub.email },
                          `Linked as ${linkedGithub.email}`,
                        )
                      : t(
                          "security.githubDesc",
                          undefined,
                          "Connect your GitHub account to enable GitHub sign-in for your profile.",
                        )}
                  </p>
                  {!githubOAuthConfigured && (
                    <p className="text-[11px] text-amber-400/90">
                      {t(
                        "security.githubNotConfigured",
                        undefined,
                        "GitHub OAuth is not configured on this server.",
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {linkedGithub?.linked ? (
                  <Button
                    id="unlink-github-btn"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGithubReauthPassword("");
                      setGithubReauthError(null);
                      setShowUnlinkGithubDialog(true);
                    }}
                    className="border-rose-900/50 bg-rose-950/20 text-rose-400 hover:bg-rose-900/40 hover:text-rose-200 text-xs gap-1.5"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>
                      {t("security.unlinkGithub", undefined, "Unlink GitHub")}
                    </span>
                  </Button>
                ) : (
                  <Button
                    id="link-github-btn"
                    size="sm"
                    disabled={!githubOAuthConfigured}
                    onClick={() => {
                      setGithubReauthPassword("");
                      setGithubReauthError(null);
                      setShowLinkGithubDialog(true);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs gap-2"
                  >
                    <GithubIcon className="w-3.5 h-3.5" />
                    <span>
                      {t(
                        "security.linkGithub",
                        undefined,
                        "Link GitHub Account",
                      )}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Passkeys */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-cyan-400" />
                  <span>
                    {t("security.passkeysTitle", undefined, "Passkeys")}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "security.passkeysDesc",
                    undefined,
                    "Sign in securely using your device biometrics, Touch ID, Face ID, Windows Hello, or hardware security keys.",
                  )}
                </CardDescription>
              </div>
              <Button
                id="add-passkey-btn"
                size="sm"
                onClick={() => {
                  setRegisterNickname("");
                  setRegisterPassword("");
                  setRegisterError(null);
                  setShowRegisterPasskeyDialog(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {t(
                    "security.registerPasskeyBtn",
                    undefined,
                    "Add Passkey",
                  )}
                </span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {passkeysLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-500 gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t("common.loading", undefined, "Loading...")}</span>
              </div>
            ) : passkeys.length === 0 ? (
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/40 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-white">
                  {t(
                    "security.noPasskeys",
                    undefined,
                    "No passkeys registered yet",
                  )}
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {t(
                    "security.passkeysDesc",
                    undefined,
                    "Add a passkey to sign in faster and more securely without typing your password.",
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-slate-700/80 transition-all gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                        <Fingerprint className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {pk.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-mono px-1.5 py-0 bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                          >
                            Passkey
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>
                            {t("security.passkeyCreated", undefined, "Created")}:{" "}
                            {new Date(pk.createdAt).toLocaleDateString()}
                          </span>
                          {pk.lastUsedAt && (
                            <span>
                              {t(
                                "security.passkeyLastUsed",
                                undefined,
                                "Last used",
                              )}:{" "}
                              {new Date(pk.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPasskeyToRename(pk);
                          setNewPasskeyName(pk.name);
                          setShowRenamePasskeyDialog(true);
                        }}
                        className="text-slate-400 hover:text-white text-xs h-8 px-2.5 gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>
                          {t("security.renamePasskey", undefined, "Rename")}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPasskeyToDelete(pk);
                          setDeletePasskeyPassword("");
                          setDeletePasskeyError(null);
                          setShowDeletePasskeyDialog(true);
                        }}
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs h-8 px-2.5 gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {t("security.deletePasskey", undefined, "Delete")}
                        </span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 5: Quick Sign In */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-cyan-400" />
                  <span>
                    {t(
                      "security.quickSignInTitle",
                      undefined,
                      "Quick Sign In",
                    )}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "security.quickSignInDesc",
                    undefined,
                    "Enter a 6-character code shown on another device to sign it into your account.",
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleVerifyQuickCode}
              className="flex flex-col sm:flex-row items-center gap-3"
            >
              <div className="relative w-full sm:w-72">
                <Input
                  type="text"
                  maxLength={6}
                  value={quickCodeInput}
                  onChange={(e) =>
                    setQuickCodeInput(e.target.value.toUpperCase())
                  }
                  placeholder={t(
                    "security.enterCode",
                    undefined,
                    "Enter 6-character code",
                  )}
                  className="bg-slate-950 border-slate-800 text-white font-mono tracking-[0.2em] uppercase text-center sm:text-left text-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={
                  quickVerifying || quickCodeInput.trim().length !== 6
                }
                className="w-full sm:w-auto bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs gap-2"
              >
                {quickVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Smartphone className="w-4 h-4" />
                )}
                <span>
                  {t("security.verifyCode", undefined, "Verify Code")}
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Dialog 1: Change Password */}
        <Dialog
          open={showChangePasswordDialog}
          onOpenChange={setShowChangePasswordDialog}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Lock className="w-5 h-5 text-cyan-400" />
                {t(
                  "security.changePasswordTitle",
                  undefined,
                  "Change Password",
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.changePasswordDesc",
                  undefined,
                  "Update your account password and re-encrypt all stored data with your new password-derived key.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleChangePassword} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="current-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.currentPassword",
                    undefined,
                    "Current Password",
                  )}
                </Label>
                <Input
                  id="current-password-input"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="new-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t("security.newPassword", undefined, "New Password")}
                </Label>
                <Input
                  id="new-password-input"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="confirm-new-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.confirmNewPassword",
                    undefined,
                    "Confirm New Password",
                  )}
                </Label>
                <Input
                  id="confirm-new-password-input"
                  type="password"
                  required
                  minLength={6}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {changePasswordError && (
                <p className="text-xs text-rose-400 font-medium">
                  {changePasswordError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChangePasswordDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-change-password-btn"
                  type="submit"
                  size="sm"
                  disabled={isChangingPassword}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isChangingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.changePasswordBtn",
                      undefined,
                      "Change Password",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog 2: Link Google Account */}
        <Dialog
          open={showLinkGoogleDialog}
          onOpenChange={(open) => {
            if (!isProcessingGoogleOAuth) setShowLinkGoogleDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <GoogleIcon className="w-5 h-5" />
                {t("security.linkGoogle", undefined, "Link Google Account")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.linkPasswordPrompt",
                  undefined,
                  "Enter your account password to verify your identity before linking Google:",
                )}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleInitiateLinkGoogle}
              className="space-y-4 py-2"
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="link-google-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.currentPassword",
                    undefined,
                    "Current Password",
                  )}
                </Label>
                <Input
                  id="link-google-password-input"
                  type="password"
                  required
                  value={googleReauthPassword}
                  onChange={(e) => setGoogleReauthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {googleReauthError && (
                <p className="text-xs text-rose-400 font-medium">
                  {googleReauthError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessingGoogleOAuth}
                  onClick={() => setShowLinkGoogleDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-link-google-btn"
                  type="submit"
                  size="sm"
                  disabled={
                    isProcessingGoogleOAuth || !googleReauthPassword.trim()
                  }
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isProcessingGoogleOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.linkGoogle",
                      undefined,
                      "Link Google Account",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog 3: Unlink Google Account */}
        <Dialog
          open={showUnlinkGoogleDialog}
          onOpenChange={(open) => {
            if (!isProcessingGoogleOAuth) setShowUnlinkGoogleDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-400">
                <Unlink className="w-5 h-5 text-rose-400" />
                {t("security.unlinkGoogle", undefined, "Unlink Google")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.unlinkPasswordPrompt",
                  undefined,
                  "Enter your account password to confirm unlinking your Google account:",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUnlinkGoogle} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="unlink-google-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.currentPassword",
                    undefined,
                    "Current Password",
                  )}
                </Label>
                <Input
                  id="unlink-google-password-input"
                  type="password"
                  required
                  value={googleReauthPassword}
                  onChange={(e) => setGoogleReauthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {googleReauthError && (
                <p className="text-xs text-rose-400 font-medium">
                  {googleReauthError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessingGoogleOAuth}
                  onClick={() => setShowUnlinkGoogleDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-unlink-google-btn"
                  type="submit"
                  size="sm"
                  disabled={
                    isProcessingGoogleOAuth || !googleReauthPassword.trim()
                  }
                  className="bg-rose-600 hover:bg-rose-500 text-white font-medium gap-2"
                >
                  {isProcessingGoogleOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.unlinkGoogle",
                      undefined,
                      "Unlink Google",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog 4: Link GitHub Account */}
        <Dialog
          open={showLinkGithubDialog}
          onOpenChange={(open) => {
            if (!isProcessingGithubOAuth) setShowLinkGithubDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <GithubIcon className="w-5 h-5" />
                {t("security.linkGithub", undefined, "Link GitHub Account")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.linkGithubPasswordPrompt",
                  undefined,
                  "Enter your account password to verify your identity before linking GitHub:",
                )}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleInitiateLinkGithub}
              className="space-y-4 py-2"
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="link-github-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.currentPassword",
                    undefined,
                    "Current Password",
                  )}
                </Label>
                <Input
                  id="link-github-password-input"
                  type="password"
                  required
                  value={githubReauthPassword}
                  onChange={(e) => setGithubReauthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {githubReauthError && (
                <p className="text-xs text-rose-400 font-medium">
                  {githubReauthError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessingGithubOAuth}
                  onClick={() => setShowLinkGithubDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-link-github-btn"
                  type="submit"
                  size="sm"
                  disabled={
                    isProcessingGithubOAuth || !githubReauthPassword.trim()
                  }
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isProcessingGithubOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GithubIcon className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.linkGithub",
                      undefined,
                      "Link GitHub Account",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog 5: Unlink GitHub Account */}
        <Dialog
          open={showUnlinkGithubDialog}
          onOpenChange={(open) => {
            if (!isProcessingGithubOAuth) setShowUnlinkGithubDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-400">
                <Unlink className="w-5 h-5 text-rose-400" />
                {t("security.unlinkGithub", undefined, "Unlink GitHub")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.unlinkGithubPasswordPrompt",
                  undefined,
                  "Enter your account password to confirm unlinking your GitHub account:",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUnlinkGithub} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="unlink-github-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.currentPassword",
                    undefined,
                    "Current Password",
                  )}
                </Label>
                <Input
                  id="unlink-github-password-input"
                  type="password"
                  required
                  value={githubReauthPassword}
                  onChange={(e) => setGithubReauthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {githubReauthError && (
                <p className="text-xs text-rose-400 font-medium">
                  {githubReauthError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessingGithubOAuth}
                  onClick={() => setShowUnlinkGithubDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-unlink-github-btn"
                  type="submit"
                  size="sm"
                  disabled={
                    isProcessingGithubOAuth || !githubReauthPassword.trim()
                  }
                  className="bg-rose-600 hover:bg-rose-500 text-white font-medium gap-2"
                >
                  {isProcessingGithubOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.unlinkGithub",
                      undefined,
                      "Unlink GitHub",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog 6: Confirm Quick Sign In */}
        <Dialog
          open={showQuickConfirmDialog}
          onOpenChange={(open) => {
            if (!open && !quickApproving && !quickRejecting) {
              setShowQuickConfirmDialog(false);
            }
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                <span>
                  {t(
                    "security.confirmQuickSignInTitle",
                    undefined,
                    "Confirm Quick Sign In",
                  )}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.confirmQuickSignInDesc",
                  undefined,
                  "A device is requesting to sign into your account. Please verify the device details before confirming.",
                )}
              </DialogDescription>
            </DialogHeader>

            {quickSessionDetails && (
              <div className="space-y-3 py-2 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">
                      {t(
                        "auth.quickSignInCode",
                        undefined,
                        "Quick Sign In Code",
                      )}
                    </span>
                    <span className="font-mono font-bold text-cyan-400 text-sm">
                      {quickSessionDetails.code}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t(
                          "security.requestingDevice",
                          undefined,
                          "Requesting Device",
                        )}
                      </span>
                    </span>
                    <span className="text-white text-right break-all">
                      {quickSessionDetails.userAgent}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t("security.ipAddress", undefined, "IP Address")}
                      </span>
                    </span>
                    <span className="font-mono text-white">
                      {quickSessionDetails.ip}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t("security.requestedAt", undefined, "Requested At")}
                      </span>
                    </span>
                    <span className="text-white">
                      {new Date(quickSessionDetails.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-300 text-[11px] leading-relaxed">
                  {t(
                    "security.approveSignInWarning",
                    undefined,
                    "Approving will grant this device full access to your account.",
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                disabled={quickApproving || quickRejecting}
                onClick={handleRejectQuickSignIn}
                className="text-slate-400 hover:text-red-400 text-xs"
              >
                {quickRejecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : null}
                <span>
                  {t("security.denySignIn", undefined, "Deny Request")}
                </span>
              </Button>
              <Button
                type="button"
                disabled={quickApproving || quickRejecting}
                onClick={handleApproveQuickSignIn}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs gap-1.5"
              >
                {quickApproving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                )}
                <span>
                  {t(
                    "security.approveSignIn",
                    undefined,
                    "Grant Access & Sign In",
                  )}
                </span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Register Passkey */}
        <Dialog
          open={showRegisterPasskeyDialog}
          onOpenChange={(open) => {
            if (!isRegisteringPasskey) setShowRegisterPasskeyDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Fingerprint className="w-5 h-5 text-cyan-400" />
                <span>
                  {t(
                    "security.registerPasskey",
                    undefined,
                    "Register a Passkey",
                  )}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.registerPasskeyDesc",
                  undefined,
                  "Provide a friendly nickname and confirm your password to register your biometric or hardware security key.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRegisterPasskey} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="register-passkey-nickname"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.passkeyNickname",
                    undefined,
                    "Passkey Nickname (Optional)",
                  )}
                </Label>
                <Input
                  id="register-passkey-nickname"
                  type="text"
                  value={registerNickname}
                  onChange={(e) => setRegisterNickname(e.target.value)}
                  placeholder={t(
                    "security.passkeyNicknamePlaceholder",
                    undefined,
                    "e.g. MacBook Touch ID, Work YubiKey",
                  )}
                  className="bg-slate-950 border-slate-800 text-xs text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="register-passkey-password"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.confirmPasswordToRegisterPasskey",
                    undefined,
                    "Account Password (Required)",
                  )}
                </Label>
                <Input
                  id="register-passkey-password"
                  type="password"
                  required
                  value={registerPassword}
                  onChange={(e) => {
                    setRegisterPassword(e.target.value);
                    if (registerError) setRegisterError(null);
                  }}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white placeholder:text-slate-500"
                />
              </div>

              {registerError && (
                <p className="text-xs text-rose-400 font-medium">
                  {registerError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRegisteringPasskey}
                  onClick={() => setShowRegisterPasskeyDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-register-passkey-btn"
                  type="submit"
                  size="sm"
                  disabled={isRegisteringPasskey || !registerPassword.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isRegisteringPasskey ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.registerPasskeyBtn",
                      undefined,
                      "Register Passkey",
                    )}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Rename Passkey */}
        <Dialog
          open={showRenamePasskeyDialog}
          onOpenChange={(open) => {
            if (!isRenamingPasskey) setShowRenamePasskeyDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Edit3 className="w-5 h-5 text-cyan-400" />
                <span>
                  {t("security.renamePasskey", undefined, "Rename Passkey")}
                </span>
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleRenamePasskey} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="rename-passkey-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t("security.passkeyNickname", undefined, "Passkey Name")}
                </Label>
                <Input
                  id="rename-passkey-input"
                  type="text"
                  required
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRenamingPasskey}
                  onClick={() => setShowRenamePasskeyDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-rename-passkey-btn"
                  type="submit"
                  size="sm"
                  disabled={isRenamingPasskey || !newPasskeyName.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isRenamingPasskey ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{t("common.save", undefined, "Save")}</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Delete Passkey */}
        <Dialog
          open={showDeletePasskeyDialog}
          onOpenChange={(open) => {
            if (!isDeletingPasskey) setShowDeletePasskeyDialog(open);
          }}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-400">
                <Trash2 className="w-5 h-5 text-rose-400" />
                <span>
                  {t("security.deletePasskey", undefined, "Delete Passkey")}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.deletePasskeyConfirm",
                  undefined,
                  "Are you sure you want to delete this passkey? Enter your account password to confirm.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleDeletePasskey} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="delete-passkey-password"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.confirmPasswordToDeletePasskey",
                    undefined,
                    "Confirm Account Password",
                  )}
                </Label>
                <Input
                  id="delete-passkey-password"
                  type="password"
                  required
                  value={deletePasskeyPassword}
                  onChange={(e) => {
                    setDeletePasskeyPassword(e.target.value);
                    if (deletePasskeyError) setDeletePasskeyError(null);
                  }}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {deletePasskeyError && (
                <p className="text-xs text-rose-400 font-medium">
                  {deletePasskeyError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDeletingPasskey}
                  onClick={() => setShowDeletePasskeyDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-delete-passkey-btn"
                  type="submit"
                  size="sm"
                  disabled={isDeletingPasskey || !deletePasskeyPassword.trim()}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-medium gap-2"
                >
                  {isDeletingPasskey ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>
                    {t("security.deletePasskey", undefined, "Delete Passkey")}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
