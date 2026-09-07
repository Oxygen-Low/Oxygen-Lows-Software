import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Sparkles,
  Info,
  Database,
  Users,
  Bot,
  FileKey,
  CheckCircle2,
  ArrowLeft,
  Upload,
  Loader2,
  SlidersHorizontal,
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
import { cn } from "@/lib/utils";
import { db, supabase } from "@/lib/db";
import {
  generateAes256Key,
  bytesToHex,
  bytesToBase64,
  bytesToBase58,
  bytesToPassphraseWords,
  formatHexChunks,
  isValidMasterKeyString,
  parseMasterKeyString,
  parseKeyFileContent,
  getActiveMasterKey,
  setActiveMasterKey,
  clearActiveMasterKey,
  zeroizeBytes,
  onAutoLock,
  migrateCategoryEncryption,
  rotateMasterKey,
  deriveEncryptionKeyFromPassword,
  migrateMasterKeyDataToPassword,
  type EncryptionCategory,
} from "@/lib/crypto";

export type KeyFormat = "hex" | "base64" | "base58" | "words";

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
      "Manage your 256-bit AES masterkey and enable zero-knowledge encryption for your private data.",
    ),
  });
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get("returnTo");

  // Active key in memory & session
  const [keyBytes, setKeyBytes] = useState<Uint8Array | null>(() =>
    getActiveMasterKey(),
  );
  const [inputMasterKey, setInputMasterKey] = useState<string>("");
  const [keyFormat, setKeyFormat] = useState<KeyFormat>("hex");
  const [showKeyFormat, setShowKeyFormat] = useState<boolean>(false);
  const [isMasked, setIsMasked] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState<boolean>(false);

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
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRotatingKey, setIsRotatingKey] = useState<boolean>(false);

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

  // Migrate from masterkey dialog state
  const [showMigrateDialog, setShowMigrateDialog] = useState<boolean>(false);
  const [migrateOldKey, setMigrateOldKey] = useState<string>("");
  const [migratePassword, setMigratePassword] = useState<string>("");
  const [isMigratingFromKey, setIsMigratingFromKey] = useState<boolean>(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const migrateFileInputRef = useRef<HTMLInputElement>(null);

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
          "Decryption key derived and session unlocked",
        ),
      );
    } catch (err: any) {
      console.error("Failed to unlock with password:", err);
      const msg =
        err?.message ||
        t(
          "security.invalidPasswordError",
          undefined,
          "Failed to unlock with password.",
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

  const handleMigrateFromMasterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setMigrateError(null);
    const cleanKey = migrateOldKey.trim();
    if (!cleanKey) {
      setMigrateError("Please enter or upload your previous masterkey");
      return;
    }
    let oldBytes: Uint8Array;
    try {
      if (isValidMasterKeyString(cleanKey)) {
        oldBytes = parseMasterKeyString(cleanKey);
      } else {
        oldBytes = parseKeyFileContent(cleanKey);
      }
    } catch (err: any) {
      setMigrateError(
        t(
          "security.invalidKeyError",
          undefined,
          "Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).",
        ),
      );
      return;
    }

    if (!migratePassword) {
      setMigrateError(
        t("auth.passwordRequired", undefined, "Password is required"),
      );
      return;
    }

    setIsMigratingFromKey(true);
    try {
      const userEmail =
        session?.user?.email ||
        session?.user?.username ||
        session?.user?.id ||
        "";
      const result = await migrateMasterKeyDataToPassword({
        oldKeyBytes: oldBytes,
        password: migratePassword,
        saltStr: userEmail,
        userId: session?.user?.id,
      });

      const newKey = await deriveEncryptionKeyFromPassword(
        migratePassword,
        userEmail,
      );
      setActiveMasterKey(newKey);
      setKeyBytes(newKey);

      setMigrateOldKey("");
      setMigratePassword("");
      setShowMigrateDialog(false);
      toast.success(
        t(
          "security.migrationCompleteToast",
          { count: result.updatedCount },
          `Data migrated to password successfully! ${result.updatedCount} records re-encrypted.`,
        ),
      );
    } catch (err: any) {
      console.error("Masterkey to password migration error:", err);
      setMigrateError(err?.message || "Migration failed");
    } finally {
      setIsMigratingFromKey(false);
    }
  };

  const handleMigrateFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedBytes = parseKeyFileContent(text);
      setMigrateOldKey(bytesToHex(parsedBytes));
      setMigrateError(null);
    } catch (err: any) {
      setMigrateError(
        err?.message ||
          t(
            "security.invalidKeyFileError",
            undefined,
            "No valid 256-bit masterkey found in the uploaded file.",
          ),
      );
    }
    if (e.target) e.target.value = "";
  };

  const handleRotateKey = async () => {
    if (!keyBytes) return;

    if (
      !confirm(
        t(
          "security.rotateKeyConfirm",
          undefined,
          "Are you sure you want to rotate your masterkey? This will decrypt all your data and re-encrypt it with a new key. Do not close the window until it's finished.",
        ),
      )
    ) {
      return;
    }

    try {
      setIsRotatingKey(true);
      const newKey = generateAes256Key();

      const result = await rotateMasterKey({
        oldKeyBytes: keyBytes,
        newKeyBytes: newKey,
        userId: session?.user?.id,
      });

      setKeyBytes(newKey);
      setImportError(null);
      setInputMasterKey("");

      toast.success(
        t(
          "security.keyRotatedToast",
          { count: result.updatedCount },
          `Masterkey rotated successfully! ${result.updatedCount} records re-encrypted.`,
        ),
      );

      // Auto-download the new key for safety
      const hex = bytesToHex(newKey);
      const b64 = bytesToBase64(newKey);
      const b58 = bytesToBase58(newKey);
      const words = bytesToPassphraseWords(newKey);

      const fileContent = [
        "===========================================================",
        " Oxygen Low's Software - AES-256 Masterkey Backup (Rotated)",
        " Generated: " + new Date().toISOString(),
        " Algorithm: AES-256 (256-bit / 32 bytes)",
        " Entropy: 256 bits (CSPRNG hardware entropy)",
        "===========================================================",
        "",
        "[HEXADECIMAL MASTERKEY - 64 CHARACTERS]",
        hex,
        "",
        "[BASE64 MASTERKEY - 44 CHARACTERS]",
        b64,
        "",
        "[BASE58 MASTERKEY]",
        b58,
        "",
        "[24-WORD PASSPHRASE REPRESENTATION]",
        words,
        "",
        "===========================================================",
        " ZERO-KNOWLEDGE NOTICE:",
        " Store this masterkey in a secure password manager (e.g., Bitwarden,",
        " 1Password, KeePass) or offline vault.",
        " Oxygen Low's Software does not store or have access to your masterkey.",
        " If you lose your masterkey, your encrypted data cannot be recovered.",
        "===========================================================",
      ].join("\n");

      const blob = new Blob([fileContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oxygen-masterkey-rotated-aes256-${Date.now()}.key`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        t("security.keyDownloadedToast", undefined, "Masterkey saved to file"),
      );
    } catch (err: any) {
      console.error("Failed to rotate key:", err);
      toast.error(
        err.message ||
          t(
            "security.keyRotateFailed",
            undefined,
            "Failed to rotate masterkey.",
          ),
      );
    } finally {
      setIsRotatingKey(false);
    }
  };

  // Process and activate a .key file
  const processKeyFile = useCallback(
    async (file: File) => {
      if (!file) return;
      try {
        const text = await file.text();
        const parsedBytes = parseKeyFileContent(text);
        setKeyBytes(parsedBytes);
        setActiveMasterKey(parsedBytes);
        setInputMasterKey("");
        setImportError(null);
        toast.success(
          t(
            "security.keyFileUploadedToast",
            undefined,
            "Masterkey loaded and activated from file",
          ),
        );
      } catch (err: any) {
        console.error("Failed to parse key file:", err);
        const errMsg =
          err?.message ||
          t(
            "security.invalidKeyFileError",
            undefined,
            "No valid 256-bit masterkey found in the uploaded file.",
          );
        setImportError(errMsg);
        toast.error(errMsg);
      }
    },
    [t],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processKeyFile(file);
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processKeyFile(file);
    }
  };

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

  // Handle masterkey generation
  const handleGenerateKey = useCallback(() => {
    try {
      const newKey = generateAes256Key();
      setKeyBytes(newKey);
      setImportError(null);
      setInputMasterKey("");
      toast.success(
        t(
          "security.keyCopiedToast",
          undefined,
          "New 256-bit AES masterkey generated",
        ),
      );
    } catch (err) {
      console.error("Failed to generate masterkey:", err);
      toast.error(t("common.error", undefined, "Failed to generate masterkey"));
    }
  }, [t]);

  // Handle importing / unlocking with existing masterkey
  const handleImportKey = useCallback(() => {
    const trimmed = inputMasterKey.trim();
    if (!trimmed) return;
    if (!isValidMasterKeyString(trimmed)) {
      const errMsg = t(
        "security.invalidKeyError",
        undefined,
        "Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).",
      );
      setImportError(errMsg);
      toast.error(errMsg);
      return;
    }
    try {
      const parsedBytes = parseMasterKeyString(trimmed);
      setKeyBytes(parsedBytes);
      setActiveMasterKey(parsedBytes);
      setInputMasterKey("");
      setImportError(null);
      toast.success(
        t(
          "security.keyActivatedToast",
          undefined,
          "Masterkey activated successfully",
        ),
      );
    } catch (err: any) {
      const errMsg = err?.message || "Invalid masterkey";
      setImportError(errMsg);
      toast.error(errMsg);
    }
  }, [inputMasterKey, t]);

  // Formatted string representation of current key
  const formattedKeyString = useMemo(() => {
    if (!keyBytes) return "";
    switch (keyFormat) {
      case "hex":
        return bytesToHex(keyBytes);
      case "base64":
        return bytesToBase64(keyBytes);
      case "base58":
        return bytesToBase58(keyBytes);
      case "words":
        return bytesToPassphraseWords(keyBytes);
      default:
        return bytesToHex(keyBytes);
    }
  }, [keyBytes, keyFormat]);

  // Copy masterkey to clipboard
  const handleCopyKey = useCallback(async () => {
    if (!formattedKeyString) return;
    try {
      await navigator.clipboard.writeText(formattedKeyString);
      setHasCopied(true);
      toast.success(
        t(
          "security.keyCopiedToast",
          undefined,
          "Masterkey copied to clipboard",
        ),
      );
      setTimeout(() => setHasCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy key:", err);
      toast.error(
        t("common.error", undefined, "Failed to copy key to clipboard"),
      );
    }
  }, [formattedKeyString, t]);

  // Download key as backup file
  const handleDownloadKey = useCallback(() => {
    if (!keyBytes || !formattedKeyString) return;
    const hex = bytesToHex(keyBytes);
    const b64 = bytesToBase64(keyBytes);
    const b58 = bytesToBase58(keyBytes);
    const words = bytesToPassphraseWords(keyBytes);

    const fileContent = [
      "===========================================================",
      " Oxygen Low's Software - AES-256 Masterkey Backup",
      " Generated: " + new Date().toISOString(),
      " Algorithm: AES-256 (256-bit / 32 bytes)",
      " Entropy: 256 bits (CSPRNG hardware entropy)",
      "===========================================================",
      "",
      "[HEXADECIMAL MASTERKEY - 64 CHARACTERS]",
      hex,
      "",
      "[BASE64 MASTERKEY - 44 CHARACTERS]",
      b64,
      "",
      "[BASE58 MASTERKEY]",
      b58,
      "",
      "[24-WORD PASSPHRASE REPRESENTATION]",
      words,
      "",
      "===========================================================",
      " ZERO-KNOWLEDGE NOTICE:",
      " Store this masterkey in a secure password manager (e.g., Bitwarden,",
      " 1Password, KeePass) or offline vault.",
      " Oxygen Low's Software does not store or have access to your masterkey.",
      " If you lose your masterkey, your encrypted data cannot be recovered.",
      "===========================================================",
    ].join("\n");

    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oxygen-masterkey-aes256-${Date.now()}.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      t("security.keyDownloadedToast", undefined, "Masterkey saved to file"),
    );
  }, [keyBytes, formattedKeyString, t]);

  // Lock / Clear active key from session
  const handleClearKey = useCallback(() => {
    if (keyBytes) {
      zeroizeBytes(keyBytes);
    }
    setKeyBytes(null);
    clearActiveMasterKey();
    toast.info(
      t(
        "security.keyClearedToast",
        undefined,
        "Masterkey cleared and zeroized from session",
      ),
    );
  }, [keyBytes, t]);

  // Update encryption toggles and immediately migrate data in Supabase
  const handleToggleCategory = async (
    category: EncryptionCategory,
    checked: boolean,
  ) => {
    if (!keyBytes) {
      toast.error(
        t(
          "security.masterKeyRequiredToChange",
          undefined,
          "An active masterkey is required to enable or disable protected data categories.",
        ),
      );
      return;
    }

    if (category === "integrations" && !checked) {
      // Cannot disable while api keys/integrations are stored
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
      // Cannot disable while passwords are stored
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
              "Manage your 256-bit AES masterkey and enable zero-knowledge encryption for your private data.",
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
                    "Masterkey active. You can now return to your previous page:",
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

        {/* Section 1: AES-256 Masterkey Management */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-cyan-400" />
                  {t("security.masterKeyTitle", undefined, "AES-256 Masterkey")}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "security.masterKeyDesc",
                    undefined,
                    "Your masterkey encrypts your private data on your device before it is stored in the cloud. Nobody else can read your data without this key.",
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
                      "Masterkey Active",
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
                      "No Masterkey Set",
                    )}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {keyBytes ? (
              /* Active Key View */
              <div className="space-y-5">
                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleCopyKey}
                    className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>
                          {t("security.copied", undefined, "Copied!")}
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>
                          {t(
                            "security.copyKey",
                            undefined,
                            "Copy to Clipboard",
                          )}
                        </span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleDownloadKey}
                    variant="outline"
                    className="gap-2 border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {t("security.downloadKey", undefined, "Download key")}
                    </span>
                  </Button>

                  <Button
                    id="toggle-key-format-btn"
                    onClick={() => setShowKeyFormat((prev) => !prev)}
                    variant="outline"
                    className={cn(
                      "gap-2 border-slate-800 transition-all",
                      showKeyFormat
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white",
                    )}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>
                      {showKeyFormat
                        ? t(
                            "security.hideKeyFormat",
                            undefined,
                            "Hide Key Format",
                          )
                        : t("security.showKeyFormat", undefined, "Key Format")}
                    </span>
                  </Button>

                  <Button
                    onClick={() => setIsMasked((prev) => !prev)}
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                    title={
                      isMasked
                        ? t("security.revealKey", undefined, "Reveal key")
                        : t("security.maskKey", undefined, "Hide key")
                    }
                  >
                    {isMasked ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>

                  <Button
                    id="change-password-btn"
                    onClick={() => setShowChangePasswordDialog(true)}
                    variant="outline"
                    className="gap-2 border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <Lock className="w-4 h-4 text-cyan-400" />
                    <span>
                      {t(
                        "security.changePasswordTitle",
                        undefined,
                        "Change Password",
                      )}
                    </span>
                  </Button>

                  <Button
                    id="migrate-masterkey-btn"
                    onClick={() => setShowMigrateDialog(true)}
                    variant="outline"
                    className="gap-2 border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>
                      {t(
                        "security.migrateFromMasterKeyButton",
                        undefined,
                        "Migrate from Masterkey",
                      )}
                    </span>
                  </Button>

                  <Button
                    onClick={handleRotateKey}
                    disabled={isRotatingKey}
                    variant="outline"
                    className="gap-2 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300"
                  >
                    {isRotatingKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>
                      {t(
                        "security.rotateKeyButton",
                        undefined,
                        "Rotate Masterkey",
                      )}
                    </span>
                  </Button>

                  <Button
                    onClick={handleClearKey}
                    variant="ghost"
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 ml-auto text-xs gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {t("security.clearKey", undefined, "Lock / Clear Key")}
                    </span>
                  </Button>
                </div>

                {/* Key Format Tabs (Hidden by default) */}
                {showKeyFormat && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 animate-in fade-in-50 duration-200">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t("security.keyFormat", undefined, "Key Format")}:
                    </span>

                    <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      {(["hex", "base64", "base58", "words"] as const).map(
                        (fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setKeyFormat(fmt)}
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                              keyFormat === fmt
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent",
                            )}
                          >
                            {fmt === "hex" &&
                              t(
                                "security.formatHex",
                                undefined,
                                "Hex (64 chars)",
                              )}
                            {fmt === "base64" &&
                              t(
                                "security.formatBase64",
                                undefined,
                                "Base64 (44 chars)",
                              )}
                            {fmt === "base58" &&
                              t("security.formatBase58", undefined, "Base58")}
                            {fmt === "words" &&
                              t(
                                "security.formatWords",
                                undefined,
                                "Passphrase Words",
                              )}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Key Display Area */}
                <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs sm:text-sm leading-relaxed break-all select-all text-slate-200">
                  {isMasked ? (
                    <span className="text-slate-600 select-none tracking-widest">
                      ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
                    </span>
                  ) : keyFormat === "hex" ? (
                    formatHexChunks(formattedKeyString)
                  ) : (
                    formattedKeyString
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyKey}
                    className="absolute top-2.5 right-2.5 h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                    title={t(
                      "security.copyKey",
                      undefined,
                      "Copy to clipboard",
                    )}
                  >
                    {hasCopied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* Inactive Key View - Options to Unlock with Password, Generate, or Import */
              <div className="space-y-6">
                {/* Primary Option: Unlock with Account Password */}
                <div className="p-5 sm:p-6 rounded-xl border border-cyan-500/40 bg-cyan-950/20 backdrop-blur-sm space-y-4">
                  <div className="flex items-start justify-between gap-4">
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
                          "Unlock with Password",
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Option 1: Generate New Key */}
                  <div className="p-4 sm:p-5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4 flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white font-semibold text-base">
                        <Sparkles className="w-5 h-5 text-cyan-400" />
                        <span>
                          {t(
                            "security.generateButton",
                            undefined,
                            "Generate Masterkey",
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Create a brand new 256-bit symmetric masterkey using
                        cryptographically secure hardware random numbers.
                      </p>
                    </div>

                    <Button
                      id="generate-masterkey-btn"
                      onClick={handleGenerateKey}
                      className="w-full gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-950/30"
                    >
                      <KeyRound className="w-4 h-4" />
                      {t(
                        "security.generateButton",
                        undefined,
                        "Generate Masterkey",
                      )}
                    </Button>
                  </div>

                  {/* Option 2: Enter Existing Masterkey */}
                  <div
                    data-testid="key-drop-zone"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "p-4 sm:p-5 rounded-xl border bg-slate-950/60 transition-all space-y-4 flex flex-col justify-between",
                      isDragging
                        ? "border-cyan-500 bg-cyan-950/20 ring-2 ring-cyan-500/30"
                        : "border-slate-800 hover:border-slate-700",
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white font-semibold text-base">
                        <FileKey className="w-5 h-5 text-cyan-400" />
                        <span>
                          {t(
                            "security.importKeyTitle",
                            undefined,
                            "Use Existing Masterkey",
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t(
                          "security.uploadKeyDesc",
                          undefined,
                          "Upload your saved .key backup file to automatically activate and unlock your masterkey.",
                        )}
                      </p>
                    </div>

                    {/* File Upload Drop Area */}
                    <div className="space-y-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".key,.txt"
                        className="hidden"
                        id="key-file-upload-input"
                        aria-label="Upload .key file"
                      />

                      <Button
                        type="button"
                        id="upload-key-file-btn"
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        className="w-full border-dashed border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white gap-2 text-xs"
                      >
                        <Upload className="w-4 h-4" />
                        <span>
                          {t(
                            "security.uploadKeyFile",
                            undefined,
                            "Upload .key File",
                          )}
                        </span>
                      </Button>

                      <div className="relative flex items-center justify-center">
                        <div className="border-t border-slate-800 w-full" />
                        <span className="bg-slate-950 px-2 text-[10px] uppercase tracking-wider text-slate-500 absolute font-mono">
                          {t("common.or", undefined, "or enter text")}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <Input
                          type="password"
                          placeholder={t(
                            "security.importKeyPlaceholder",
                            undefined,
                            "Paste 64-char Hex or 256-bit Base64 masterkey...",
                          )}
                          value={inputMasterKey}
                          onChange={(e) => {
                            setInputMasterKey(e.target.value);
                            if (importError) setImportError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleImportKey();
                          }}
                          className="bg-slate-900 border-slate-800 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
                        />
                        {importError && (
                          <p className="text-xs text-rose-400 leading-tight font-medium">
                            {importError}
                          </p>
                        )}
                        <Button
                          id="activate-key-btn"
                          onClick={handleImportKey}
                          disabled={!inputMasterKey.trim()}
                          variant="secondary"
                          className="w-full gap-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          {t(
                            "security.activateKeyButton",
                            undefined,
                            "Unlock / Activate Key",
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
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
                  "Zero-Knowledge: Your masterkey is held only in your browser session and is never sent to any server.",
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
                "Toggle client-side AES-256 encryption for each data category. When enabled, data is encrypted with your masterkey before storage.",
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
                    "An active masterkey is required to change protected data category encryption settings. Generate or unlock a masterkey above to modify these settings.",
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
                            "Key Required",
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
                            "Key Required",
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
                            "Key Required",
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
                            "Key Required",
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
                            "Key Required",
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

        {/* Dialog 2: Migrate from Masterkey */}
        <Dialog
          open={showMigrateDialog}
          onOpenChange={setShowMigrateDialog}
        >
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                {t(
                  "security.migrateFromMasterKeyTitle",
                  undefined,
                  "Migrate Data from Previous Masterkey",
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t(
                  "security.migrateFromMasterKeyDesc",
                  undefined,
                  "If you have encrypted data from an earlier version that used a standalone masterkey, re-encrypt it to use your current account password.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleMigrateFromMasterKey} className="space-y-4 py-2">
              <input
                type="file"
                ref={migrateFileInputRef}
                onChange={handleMigrateFileChange}
                accept=".key,.txt"
                className="hidden"
                id="migrate-key-file-upload-input"
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="migrate-old-key-input"
                    className="text-xs font-medium text-slate-300"
                  >
                    {t(
                      "security.previousMasterKeyLabel",
                      undefined,
                      "Previous 256-bit Masterkey",
                    )}
                  </Label>
                  <button
                    type="button"
                    onClick={() => migrateFileInputRef.current?.click()}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
                  >
                    <Upload className="w-3 h-3" />
                    <span>
                      {t("auth.uploadKeyFile", undefined, "Upload .key File")}
                    </span>
                  </button>
                </div>
                <Input
                  id="migrate-old-key-input"
                  type="password"
                  required
                  value={migrateOldKey}
                  onChange={(e) => setMigrateOldKey(e.target.value)}
                  placeholder="Paste 64-char Hex/Base64 masterkey..."
                  className="bg-slate-950 border-slate-800 text-xs font-mono text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="migrate-password-input"
                  className="text-xs font-medium text-slate-300"
                >
                  {t(
                    "security.accountPasswordLabel",
                    undefined,
                    "Your Account Password",
                  )}
                </Label>
                <Input
                  id="migrate-password-input"
                  type="password"
                  required
                  value={migratePassword}
                  onChange={(e) => setMigratePassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border-slate-800 text-xs text-white"
                />
              </div>

              {migrateError && (
                <p className="text-xs text-rose-400 font-medium">
                  {migrateError}
                </p>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMigrateDialog(false)}
                  className="border-slate-800 text-slate-400 hover:text-white"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  id="submit-migrate-masterkey-btn"
                  type="submit"
                  size="sm"
                  disabled={isMigratingFromKey}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
                >
                  {isMigratingFromKey ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>
                    {t(
                      "security.runMigrationBtn",
                      undefined,
                      "Migrate Data to Password",
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
