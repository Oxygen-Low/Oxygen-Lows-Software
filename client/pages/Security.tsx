import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
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
  clearActiveMasterKey,
  zeroizeBytes,
  onAutoLock,
  migrateCategoryEncryption,
  deriveEncryptionKeyFromPassword,
  type EncryptionCategory,
} from "@/lib/crypto";

const STORAGE_KEYS = {
  ENCRYPT_CHARACTERS: "oxygen_encrypt_characters",
  ENCRYPT_DATA_SAVE: "oxygen_encrypt_data_save",
  ENCRYPT_CHATBOT: "oxygen_encrypt_chatbot",
  ENCRYPT_INTEGRATIONS: "oxygen_encrypt_integrations",
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

  const [encryptIntegrations, setEncryptIntegrations] = useState<boolean>(
    () => {
      try {
        return (
          localStorage.getItem(STORAGE_KEYS.ENCRYPT_INTEGRATIONS) === "true"
        );
      } catch {
        return false;
      }
    },
  );

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

  // Keep session storage synced
  useEffect(() => {
    setActiveMasterKey(keyBytes);
  }, [keyBytes]);

  // Listen for auto-lock timeout
  useEffect(() => {
    const unsubscribe = onAutoLock(() => {
      setKeyBytes(null);
    });
    return () => {
      unsubscribe();
    };
  }, []);

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

  const handleLockSession = useCallback(() => {
    if (keyBytes) {
      zeroizeBytes(keyBytes);
    }
    setKeyBytes(null);
    clearActiveMasterKey();
    toast.info(
      t(
        "security.sessionLockedToast",
        undefined,
        "Session locked and encryption key cleared from memory",
      ),
    );
  }, [keyBytes, t]);

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

    if (category === "integrations" && !checked) {
      try {
        let query = supabase
          .from("user_integrations")
          .select("id", { count: "exact", head: true });
        if (session?.user?.id) {
          query = query.eq("user_id", session.user.id);
        }
        const { count, error } = await query;
        if (!error && count && count > 0) {
          toast.error(
            t(
              "security.cannotDisableIntegrationsWithKeys",
              undefined,
              "Cannot disable encryption while API keys/integrations are stored. Please remove all stored integrations first.",
            ),
          );
          return;
        }
      } catch (err) {
        console.error("Failed to check stored integrations:", err);
      }
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
    } else if (category === "integrations") {
      setEncryptIntegrations(checked);
      localStorage.setItem(STORAGE_KEYS.ENCRYPT_INTEGRATIONS, String(checked));
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

                  <Button
                    id="lock-session-btn"
                    onClick={handleLockSession}
                    variant="outline"
                    className="gap-2 border-rose-500/30 bg-rose-950/20 hover:bg-rose-900/30 text-rose-300 hover:text-rose-200 ml-auto text-xs"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {t("security.lockSession", undefined, "Lock Session")}
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

            {/* Zero-Knowledge Security Notice */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                {t(
                  "security.clientSideNotice",
                  undefined,
                  "Zero-Knowledge: Your encryption key is derived only in your browser session and is never sent to any server.",
                )}
              </span>
            </div>
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

            {/* Toggle 4: API Keys and Integrations */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/90 hover:border-slate-700/80 transition-all gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 mt-0.5 sm:mt-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="toggle-integrations"
                      className="text-sm sm:text-base font-semibold text-white cursor-pointer"
                    >
                      {t(
                        "security.integrations",
                        undefined,
                        "API Keys & Integrations",
                      )}
                    </Label>
                    {encryptIntegrations ? (
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
                      "security.integrationsDesc",
                      undefined,
                      "Encrypt stored API keys, LLM credentials, and MCP access tokens.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end sm:pl-4 gap-2">
                {migratingCategory === "integrations" && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
                <Switch
                  id="toggle-integrations"
                  checked={encryptIntegrations}
                  disabled={!keyBytes || migratingCategory !== null}
                  onCheckedChange={(checked) =>
                    handleToggleCategory("integrations", checked)
                  }
                />
              </div>
            </div>

            {/* Toggle 5: Password Vault */}
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
      </div>
    </Layout>
  );
}
