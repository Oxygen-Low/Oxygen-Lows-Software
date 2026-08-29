import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { supabase, rawSupabase } from "@/lib/supabase";
import {
  getActiveMasterKey,
  setActiveMasterKey,
  bytesToHex,
  isValidMasterKeyString,
  parseMasterKeyString,
  parseKeyFileContent,
} from "@/lib/crypto";
import {
  Loader2,
  Key,
  Upload,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface MigrationModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function MigrationModal({ isOpen: propIsOpen, onClose }: MigrationModalProps) {
  const { supabaseSession, hasSupabaseSession, migrateAccount, signOut } = useAuth();
  const { t } = useTranslation();

  const [username, setUsername] = useState(() => {
    const meta = supabaseSession?.user?.user_metadata || {};
    return (
      meta.username ||
      meta.full_name?.replace(/\s+/g, "_").toLowerCase() ||
      supabaseSession?.user?.email?.split("@")[0] ||
      ""
    );
  });
  const [email, setEmail] = useState(
    () => supabaseSession?.user?.email || "",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [masterKey, setMasterKey] = useState(() => {
    const activeKey = getActiveMasterKey();
    return activeKey ? bytesToHex(activeKey) : "";
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyFileName, setKeyFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOpen = propIsOpen !== undefined ? propIsOpen : hasSupabaseSession;

  useEffect(() => {
    if (supabaseSession?.user) {
      const u = supabaseSession.user;
      const meta = u.user_metadata || {};
      const suggestedUsername =
        meta.username ||
        meta.full_name?.replace(/\s+/g, "_").toLowerCase() ||
        u.email?.split("@")[0] ||
        "";
      if (!username) setUsername(suggestedUsername);
      if (!email) setEmail(u.email || "");

      // Check if master key is already active in memory or session storage
      const activeKey = getActiveMasterKey();
      if (activeKey && !masterKey) {
        setMasterKey(bytesToHex(activeKey));
      }
    }
  }, [supabaseSession]);

  if (!isOpen) return null;

  const handleKeyFileUpload = async (file: File) => {
    setError(null);
    setKeyFileName(file.name);
    try {
      // 1. Try reading as text and parsing with parseKeyFileContent
      const text = await file.text();
      try {
        const bytes = parseKeyFileContent(text);
        const hex = bytesToHex(bytes);
        setMasterKey(hex);
        toast.success(
          t("migration.keyFileLoaded", undefined, "Master key file loaded successfully"),
        );
        return;
      } catch (textErr) {
        // 2. If text parsing failed, check if it's a raw 32-byte binary key
        const buffer = await file.arrayBuffer();
        const buf = new Uint8Array(buffer);
        if (buf.length === 32) {
          const hex = bytesToHex(buf);
          setMasterKey(hex);
          toast.success(
            t("migration.keyFileLoaded", undefined, "Master key file loaded successfully"),
          );
          return;
        }
        throw textErr;
      }
    } catch (err: any) {
      console.error("Failed to parse key file:", err);
      const errMsg =
        err?.message ||
        t("migration.invalidKeyFile", undefined, "Invalid key file format. Expected a 32-byte AES key.");
      setError(errMsg);
      toast.error(errMsg);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleKeyFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleKeyFileUpload(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || username.trim().length < 3) {
      setError(
        t("auth.usernameLength", undefined, "Username must be at least 3 characters long"),
      );
      return;
    }

    if (!password || password.length < 6) {
      setError(
        t("auth.passwordLength", undefined, "Password must be at least 6 characters long"),
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        t("auth.passwordMismatch", undefined, "Passwords do not match"),
      );
      return;
    }

    let cleanMasterKey: string | undefined = undefined;
    if (masterKey.trim()) {
      const trimmed = masterKey.trim();
      if (!isValidMasterKeyString(trimmed)) {
        setError(
          t("migration.invalidMasterKey", undefined, "Master key must be a valid 64-character hex string or 32-byte key"),
        );
        return;
      }
      cleanMasterKey = trimmed;
    }

    setLoading(true);

    try {
      let token = supabaseSession?.access_token;
      if (!token) {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token;
      }
      if (!token) {
        const { data: rawData } = await rawSupabase.auth.getSession();
        token = rawData?.session?.access_token;
      }

      if (!token) {
        throw new Error("No active Google / Supabase session found");
      }

      await migrateAccount({
        supabaseToken: token,
        masterKey: cleanMasterKey,
        username: username.trim(),
        email: email.trim(),
        password,
      });

      if (cleanMasterKey) {
        try {
          const parsed = parseMasterKeyString(cleanMasterKey);
          setActiveMasterKey(parsed);
        } catch {}
      }

      toast.success(
        t("migration.successToast", undefined, "Account successfully migrated to local website storage!"),
      );

      if (onClose) {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Migration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 my-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {t("migration.title", undefined, "Migrate to Website Account")}
            </h2>
            <p className="text-xs text-slate-400">
              {t(
                "migration.subtitle",
                undefined,
                "Transfer all your data to the local website storage",
              )}
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-slate-300 space-y-2">
          <p>
            {t(
              "migration.explanation",
              undefined,
              "We have migrated data storage directly to the website. Please set a username and password for your account. All your chatbot chats, universes, data saves, passwords, and storage files will be seamlessly transferred.",
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/50 flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("auth.username", undefined, "Username")}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. johndoe"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("auth.email", undefined, "Email")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t("auth.password", undefined, "New Password")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t("auth.confirmPassword", undefined, "Confirm Password")}
              </label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          </div>

          {/* Master Key Section */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                {t("migration.masterKeyLabel", undefined, "Master Key (Optional / For Encrypted Data)")}
              </label>
              {keyFileName && (
                <span className="text-[11px] text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {keyFileName}
                </span>
              )}
            </div>

            <div className="relative mb-2">
              <input
                type={showMasterKey ? "text" : "password"}
                value={masterKey}
                onChange={(e) => {
                  setMasterKey(e.target.value);
                  setKeyFileName(null);
                }}
                placeholder={t(
                  "migration.masterKeyPlaceholder",
                  undefined,
                  "Paste your master key or upload a .key file",
                )}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500 transition pr-9"
              />
              <button
                type="button"
                onClick={() => setShowMasterKey(!showMasterKey)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showMasterKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* .key file upload dropzone / button */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-slate-700 hover:border-cyan-500/60 rounded-lg p-2.5 text-center cursor-pointer bg-slate-800/50 transition flex items-center justify-center gap-2 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".key,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition" />
              <span className="text-xs text-slate-400 group-hover:text-slate-200 transition">
                {t(
                  "migration.uploadKeyFile",
                  undefined,
                  "Choose or drop .key file to load master key",
                )}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {t(
                "migration.masterKeyNotice",
                undefined,
                "If you had encrypted data (Data Saves or Password Manager), providing your master key will ensure your decrypted data is accessible in your new account.",
              )}
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => signOut()}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              {t("common.signOut", undefined, "Sign Out Instead")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {t("migration.migrating", undefined, "Migrating Account...")}
                  </span>
                </>
              ) : (
                <span>
                  {t("migration.migrateButton", undefined, "Migrate Account")}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
