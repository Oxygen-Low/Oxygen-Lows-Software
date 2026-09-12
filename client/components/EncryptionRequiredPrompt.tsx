import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  ShieldAlert,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  Loader2,
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
import { useAuth } from "@/hooks/useAuth";
import {
  setActiveMasterKey,
  deriveEncryptionKeyFromPassword,
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
  const auth = useAuth();
  const session = auth?.session;

  const [inputPassword, setInputPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const defaultTitle = t(
    "security.encryptionPromptTitle",
    undefined,
    "Decryption Required",
  );
  const defaultDesc = t(
    "security.encryptionPromptDesc",
    undefined,
    "This section is encrypted. Enter your account password below to unlock your data for this session.",
  );

  const handleUnlock = useCallback(async () => {
    const trimmed = inputPassword.trim();
    if (!trimmed) return;

    setIsUnlocking(true);
    setError(null);
    try {
      const userSalt = (
        session?.user?.email ||
        session?.user?.username ||
        session?.user?.id ||
        "default"
      ).toLowerCase();
      const bytes = await deriveEncryptionKeyFromPassword(trimmed, userSalt);
      setActiveMasterKey(bytes);
      setInputPassword("");
      toast.success(
        t(
          "security.unlockSuccessToast",
          undefined,
          "Decryption key derived and session unlocked",
        ),
      );
      if (onUnlocked) {
        onUnlocked();
      }
    } catch (err: any) {
      const errMsg =
        err?.message ||
        t(
          "security.invalidPasswordError",
          undefined,
          "Invalid password or key derivation failed",
        );
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsUnlocking(false);
    }
  }, [inputPassword, onUnlocked, session, t]);

  const securityLink = `/security?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      className="w-full max-w-2xl mx-auto my-8 px-4"
      data-testid="encryption-required-prompt"
    >
      <Card className="bg-slate-900/80 border border-amber-500/30 backdrop-blur-md shadow-2xl overflow-hidden relative">
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
          {/* Inline Password Unlock */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {t(
                  "security.inlineUnlockTitle",
                  undefined,
                  "Unlock Encryption",
                )}
              </span>
            </div>

            <div className="space-y-2">
              <Input
                type="password"
                placeholder={t(
                  "security.enterAccountPassword",
                  undefined,
                  "Enter your account password...",
                )}
                value={inputPassword}
                onChange={(e) => {
                  setInputPassword(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock();
                }}
                className="bg-slate-900 border-slate-800 text-xs text-slate-100 placeholder:text-slate-500"
              />

              {error && (
                <p className="text-xs text-rose-400 leading-tight font-medium">
                  {error}
                </p>
              )}

              <Button
                onClick={handleUnlock}
                disabled={!inputPassword.trim() || isUnlocking}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium gap-1.5"
                size="sm"
              >
                {isUnlocking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>
                  {t(
                    "security.inlineUnlockBtn",
                    undefined,
                    "Unlock & Decrypt",
                  )}
                </span>
              </Button>
            </div>
          </div>

          {/* Go to Security */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={() => navigate(securityLink)}
              className="text-slate-400 hover:text-slate-200 text-xs gap-1.5 h-auto py-2.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {t("security.goToSecurityButton", undefined, "Go to Security")}
              </span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>

          <div className="pt-2 text-center">
            <p className="text-[11px] text-slate-500">
              {t(
                "security.clientSideNotice",
                undefined,
                "Zero-Knowledge: Your encryption key is derived from your password in your browser and is never sent to any server.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
