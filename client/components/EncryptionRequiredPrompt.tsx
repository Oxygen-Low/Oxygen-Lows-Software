import React, { useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Lock,
  Unlock,
  ShieldAlert,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  Upload,
} from "lucide-react";
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
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  isValidMasterKeyString,
  parseMasterKeyString,
  parseKeyFileContent,
  setActiveMasterKey,
  type EncryptionCategory,
} from "@/lib/crypto";

interface EncryptionRequiredPromptProps {
  category: EncryptionCategory;
  returnTo?: string;
  onUnlocked?: () => void;
  title?: string;
  description?: string;
  categoryLabel?: string;
}

export function EncryptionRequiredPrompt({
  category,
  returnTo = window.location.pathname + window.location.search,
  onUnlocked,
  title,
  description,
  categoryLabel,
}: EncryptionRequiredPromptProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showInlineUnlock, setShowInlineUnlock] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultTitle = t(
    "security.encryptionPromptTitle",
    undefined,
    "Decryption Required",
  );
  const defaultDesc = t(
    "security.encryptionPromptDesc",
    undefined,
    "This section is encrypted with your 256-bit AES masterkey. Please enter or unlock your key to decrypt and access your data.",
  );

  const processKeyFile = useCallback(
    async (file: File) => {
      if (!file) return;
      try {
        const text = await file.text();
        const bytes = parseKeyFileContent(text);
        setActiveMasterKey(bytes);
        setError(null);
        setInputKey("");
        toast.success(
          t(
            "security.keyFileUploadedToast",
            undefined,
            "Masterkey loaded and activated from file",
          ),
        );
        if (onUnlocked) {
          onUnlocked();
        }
      } catch (err: any) {
        console.error("Failed to parse key file:", err);
        const errMsg =
          err?.message ||
          t(
            "security.invalidKeyFileError",
            undefined,
            "No valid 256-bit masterkey found in the uploaded file.",
          );
        setError(errMsg);
        toast.error(errMsg);
      }
    },
    [onUnlocked, t],
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

  const handleQuickUnlock = useCallback(() => {
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    if (!isValidMasterKeyString(trimmed)) {
      const errMsg = t(
        "security.invalidKeyError",
        undefined,
        "Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).",
      );
      setError(errMsg);
      toast.error(errMsg);
      return;
    }

    try {
      const bytes = parseMasterKeyString(trimmed);
      setActiveMasterKey(bytes);
      setError(null);
      setInputKey("");
      toast.success(
        t(
          "security.keyActivatedToast",
          undefined,
          "Masterkey activated successfully",
        ),
      );
      if (onUnlocked) {
        onUnlocked();
      }
    } catch (err: any) {
      const errMsg = err?.message || "Invalid masterkey";
      setError(errMsg);
      toast.error(errMsg);
    }
  }, [inputKey, onUnlocked, t]);

  const securityLink = `/security?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      className="w-full max-w-2xl mx-auto my-8 px-4"
      data-testid="encryption-required-prompt"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".key,.txt"
        className="hidden"
        id="prompt-upload-key-input"
        aria-label="Upload .key file"
      />

      <Card
        className={`bg-slate-900/80 border backdrop-blur-md shadow-2xl overflow-hidden relative transition-all ${
          isDragging
            ? "border-cyan-500 bg-cyan-950/20 ring-2 ring-cyan-500/30"
            : "border-amber-500/30"
        }`}
      >
        <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/80 to-amber-500/0" />

        <CardHeader className="text-center space-y-3 pb-4 pt-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-950/40">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {title || defaultTitle}
              </CardTitle>
              {categoryLabel && (
                <Badge
                  variant="outline"
                  className="bg-slate-800 text-slate-300 border-slate-700 text-xs"
                >
                  {categoryLabel}
                </Badge>
              )}
            </div>
            <CardDescription className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
              {description || defaultDesc}
            </CardDescription>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-mono text-[11px]"
            >
              AES-256-GCM
            </Badge>
            <Badge
              variant="outline"
              className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[11px]"
            >
              Zero-Knowledge
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-2 pb-6 px-6 sm:px-8">
          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Button
              id="prompt-upload-key-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold gap-2 shadow-lg shadow-cyan-950/50 px-5 py-2.5 h-auto transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>
                {t("security.uploadKeyFile", undefined, "Upload .key File")}
              </span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowInlineUnlock((prev) => !prev)}
              className="w-full sm:w-auto border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs gap-1.5 h-auto py-2.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>
                {t(
                  "security.quickUnlockTitle",
                  undefined,
                  "Quick Unlock on this Page",
                )}
              </span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => navigate(securityLink)}
              className="w-full sm:w-auto text-slate-400 hover:text-slate-200 text-xs gap-1.5 h-auto py-2.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {t("security.goToSecurityButton", undefined, "Go to Security")}
              </span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>

          {/* Quick Inline Unlock Field */}
          {showInlineUnlock && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3 transition-all animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {t("security.quickUnlockTitle", undefined, "Quick Unlock")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-medium flex items-center gap-1 hover:underline"
                >
                  <Upload className="w-3 h-3" />
                  <span>
                    {t("security.uploadKeyFile", undefined, "Upload .key File")}
                  </span>
                </button>
              </div>

              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder={t(
                    "security.quickUnlockPlaceholder",
                    undefined,
                    "Paste 64-char Hex or Base64 masterkey...",
                  )}
                  value={inputKey}
                  onChange={(e) => {
                    setInputKey(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickUnlock();
                  }}
                  className="bg-slate-900 border-slate-800 font-mono text-xs text-slate-100 placeholder:text-slate-500"
                />

                {error && (
                  <p className="text-xs text-rose-400 leading-tight font-medium">
                    {error}
                  </p>
                )}

                <Button
                  onClick={handleQuickUnlock}
                  disabled={!inputKey.trim()}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium gap-1.5"
                  size="sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      "security.quickUnlockButton",
                      undefined,
                      "Unlock & Decrypt",
                    )}
                  </span>
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 text-center">
            <p className="text-[11px] text-slate-500">
              {t(
                "security.clientSideNotice",
                undefined,
                "Zero-Knowledge: Your masterkey is held only in your browser session and is never sent to any server.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
