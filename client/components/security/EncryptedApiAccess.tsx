import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import { createEncryptedApiGrant } from "@/lib/encryptedApiCrypto";
import { getLocalSession } from "@/lib/localSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ENCRYPTED_API_CATEGORIES,
  type EncryptedApiCategory,
  type EncryptedApiGrant,
} from "@shared/encryptedApi";

const API_ROOT = "/api/encrypted-access";
const CATEGORY_LABELS: Record<EncryptedApiCategory, string> = {
  characters: "security.charactersUniverses",
  data_save: "security.dataSave",
  chatbot: "security.chatbotChats",
};
const CATEGORY_DEFAULTS: Record<EncryptedApiCategory, string> = {
  characters: "Characters and Universes",
  data_save: "Data Save Entries",
  chatbot: "Chatbot Chats",
};

const CREATE_ERROR_MESSAGES: Record<
  string,
  { key: string; fallback: string }
> = {
  "Invalid key name": {
    key: "security.encryptedApiErrorInvalidName",
    fallback: "Enter a valid name of 100 characters or fewer.",
  },
  "Select at least one data category": {
    key: "security.encryptedApiErrorCategory",
    fallback: "Select at least one data category.",
  },
  "Unsupported category in selection": {
    key: "security.encryptedApiErrorUnsupportedCategory",
    fallback: "Select only supported data categories.",
  },
  "Expiry must be in the future": {
    key: "security.encryptedApiErrorExpiry",
    fallback: "Choose an expiry date in the future.",
  },
  "Expiry too far in the future": {
    key: "security.encryptedApiErrorExpiryTooFar",
    fallback: "Expiry must be within one year.",
  },
  "Token hash is required": {
    key: "security.encryptedApiErrorTokenHash",
    fallback: "The access key could not be created securely. Please try again.",
  },
  "Token prefix is required": {
    key: "security.encryptedApiErrorTokenHash",
    fallback: "The access key could not be created securely. Please try again.",
  },
  "Invalid token hash": {
    key: "security.encryptedApiErrorTokenHash",
    fallback: "The access key could not be created securely. Please try again.",
  },
  "Wrapped keys are required": {
    key: "security.encryptedApiErrorWrappedKeys",
    fallback: "The encryption key could not be prepared. Please try again.",
  },
};

/** Map a known server creation error to a translated message descriptor. */
function getCreateErrorTranslation(err: any) {
  const serverError =
    typeof err?.serverError === "string" ? err.serverError : "";
  if (serverError.startsWith("Missing wrapped key for ")) {
    return CREATE_ERROR_MESSAGES["Wrapped keys are required"];
  }
  return CREATE_ERROR_MESSAGES[serverError];
}

interface EncryptedApiAccessProps {
  masterKey: Uint8Array | null;
  userId?: string;
}

/** Format a date for a datetime-local input in the user's timezone. */
function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Default access-key expiry, 30 days from now. */
function defaultExpiry() {
  return toLocalDateTimeInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
}

/** Manage encrypted API grants and display their metadata. */
export default function EncryptedApiAccess({
  masterKey,
  userId,
}: EncryptedApiAccessProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [categories, setCategories] = useState<EncryptedApiCategory[]>([]);
  const [grants, setGrants] = useState<EncryptedApiGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [grantToRevoke, setGrantToRevoke] =
    useState<EncryptedApiGrant | null>(null);

  const minimumExpiry = useMemo(() => toLocalDateTimeInput(new Date()), []);
  const session = getLocalSession();

  /** Translate a category name, falling back to its English label. */
  const categoryLabel = useCallback(
    (category: EncryptedApiCategory) =>
      t(CATEGORY_LABELS[category], undefined, CATEGORY_DEFAULTS[category]),
    [t],
  );

  /** Load the signed-in user's grants; only a session is required. */
  const loadGrants = useCallback(async () => {
    const accessToken = getLocalSession()?.access_token;
    if (!accessToken) {
      setGrants([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_ROOT}/keys`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(
          data.error ||
            t(
              "security.encryptedApiLoadError",
              undefined,
              "Failed to load encrypted API access keys.",
            ),
        );
      }
      setGrants(data.keys || data.grants || []);
    } catch (err: any) {
      setError(
        err?.message ||
          t(
            "security.encryptedApiLoadError",
            undefined,
            "Failed to load encrypted API access keys.",
          ),
      );
    } finally {
      setLoading(false);
    }
  }, [masterKey, t]);

  useEffect(() => {
    void loadGrants();
  }, [loadGrants]);

  /** Validate the form, create a grant, and reveal its one-time token. */
  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!masterKey || !session?.access_token) return;
    if (!name.trim()) {
      setError(
        t(
          "security.encryptedApiNameRequired",
          undefined,
          "Enter a name for this access key.",
        ),
      );
      return;
    }
    if (categories.length === 0) {
      setError(
        t(
          "security.encryptedApiCategoryRequired",
          undefined,
          "Select at least one data category.",
        ),
      );
      return;
    }
    const expiryDate = new Date(expiresAt);
    if (!expiresAt || Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      setError(
        t(
          "security.encryptedApiExpiryRequired",
          undefined,
          "Choose an expiry date in the future.",
        ),
      );
      return;
    }

    setCreating(true);
    try {
      const result = await createEncryptedApiGrant({
        name: name.trim(),
        categories,
        expires_at: expiryDate.toISOString(),
        masterKey,
        userId,
      });
      setNewToken(result.token);
      setCopied(false);
      setName("");
      setCategories([]);
      setExpiresAt(defaultExpiry());
      if (result.grant) {
        setGrants((current) => [result.grant, ...current]);
      } else {
        await loadGrants();
      }
    } catch (err: any) {
      const knownError = getCreateErrorTranslation(err);
      setError(
        knownError
          ? t(knownError.key, undefined, knownError.fallback)
          : t(
              "security.encryptedApiCreateError",
              undefined,
              "Failed to create the encrypted API access key.",
            ),
      );
    } finally {
      setCreating(false);
    }
  };

  /** Revoke the grant currently awaiting confirmation. */
  const handleRevoke = async () => {
    if (!grantToRevoke || !session?.access_token) return;
    setRevoking(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_ROOT}/keys/${encodeURIComponent(grantToRevoke.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(
          data.error ||
            t(
              "security.encryptedApiRevokeError",
              undefined,
              "Failed to revoke the access key.",
            ),
        );
      }
      setGrants((current) =>
        current.filter((grant) => grant.id !== grantToRevoke.id),
      );
      setGrantToRevoke(null);
    } catch (err: any) {
      setError(
        err?.message ||
          t(
            "security.encryptedApiRevokeError",
            undefined,
            "Failed to revoke the access key.",
          ),
      );
    } finally {
      setRevoking(false);
    }
  };

  /** Copy the newly created token to the clipboard. */
  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setError(
        t(
          "security.encryptedApiCopyError",
          undefined,
          "Failed to copy the token. Select and copy it manually.",
        ),
      );
    }
  };

  /** Clear one-time token state when its dialog closes. */
  const closeTokenDialog = (open: boolean) => {
    if (!open) {
      setNewToken(null);
      setCopied(false);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-cyan-400" />
          {t(
            "security.encryptedApiTitle",
            undefined,
            "Encrypted API Access",
          )}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-slate-400">
          {t(
            "security.encryptedApiDesc",
            undefined,
            "Create scoped tokens that let your own applications decrypt selected data without sharing your account password.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {t(
              "security.encryptedApiNoPasswordsWarning",
              undefined,
              "Password Vault access is not available through encrypted API tokens. Only Characters, Data Save, and Chatbot data can be selected.",
            )}
          </span>
        </div>

        {!masterKey && (
          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-sm text-slate-300">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
            <span>
              {t(
                "security.encryptedApiLocked",
                undefined,
                "Unlock your encryption session above to create and manage encrypted API access keys.",
              )}
            </span>
          </div>
        )}

        {masterKey && (
          <>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="encrypted-api-name" className="text-slate-300">
                    {t("security.encryptedApiName", undefined, "Key name")}
                  </Label>
                  <Input
                    id="encrypted-api-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t(
                      "security.encryptedApiNamePlaceholder",
                      undefined,
                      "e.g. My desktop app",
                    )}
                    maxLength={100}
                    className="bg-slate-950/60 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="encrypted-api-expiry" className="text-slate-300">
                    {t("security.encryptedApiExpiry", undefined, "Expires at")}
                  </Label>
                  <Input
                    id="encrypted-api-expiry"
                    type="datetime-local"
                    value={expiresAt}
                    min={minimumExpiry}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="bg-slate-950/60 border-slate-800 text-white"
                  />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-300 mb-2">
                  {t(
                    "security.encryptedApiScopes",
                    undefined,
                    "Allowed data categories",
                  )}
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ENCRYPTED_API_CATEGORIES.map((category) => (
                    <Label
                      key={category}
                      htmlFor={`encrypted-api-${category}`}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300 cursor-pointer hover:border-slate-700"
                    >
                      <Checkbox
                        id={`encrypted-api-${category}`}
                        checked={categories.includes(category)}
                        onCheckedChange={(checked) =>
                          setCategories((current) =>
                            checked
                              ? [...current, category]
                              : current.filter((item) => item !== category),
                          )
                        }
                      />
                      {categoryLabel(category)}
                    </Label>
                  ))}
                </div>
              </fieldset>

              <Button
                type="submit"
                disabled={creating}
                className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {creating
                  ? t(
                      "security.encryptedApiCreating",
                      undefined,
                      "Creating key...",
                    )
                  : t(
                      "security.encryptedApiCreate",
                      undefined,
                      "Create access key",
                    )}
              </Button>
            </form>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                {t(
                  "security.encryptedApiEndpointsTitle",
                  undefined,
                  "API endpoints",
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {t(
                  "security.encryptedApiEndpointsDesc",
                  undefined,
                  "Send the token in the Authorization header of every request:",
                )}
              </p>
              <code className="block overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-cyan-300">
                Authorization: Bearer &lt;your-token&gt;
              </code>
              <div className="space-y-1.5 font-mono text-xs text-slate-300">
                <p>GET {API_ROOT}/characters</p>
                <p>GET {API_ROOT}/data-save</p>
                <p>GET {API_ROOT}/chatbot</p>
              </div>
            </div>
          </>
        )}

        <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {t(
                    "security.encryptedApiExistingKeys",
                    undefined,
                    "Your access keys",
                  )}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadGrants()}
                  disabled={loading}
                  className="gap-2 text-slate-400 hover:text-white"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? "motion-safe:animate-spin" : ""}`}
                  />
                  {t("security.encryptedApiRefresh", undefined, "Refresh")}
                </Button>
              </div>

              {loading && grants.length === 0 ? (
                <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 motion-safe:animate-spin" />
                  {t("security.encryptedApiLoading", undefined, "Loading keys...")}
                </div>
              ) : grants.length === 0 ? (
                <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {t(
                    "security.encryptedApiNoKeys",
                    undefined,
                    "No encrypted API access keys have been created.",
                  )}
                </p>
              ) : (
                <div className="space-y-2">
                  {grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white break-all">
                            {grant.name}
                          </span>
                          <code className="text-xs text-cyan-300">
                            {grant.token_prefix}…
                          </code>
                          {grant.revoked_at && (
                            <Badge
                              variant="outline"
                              className="border-rose-500/40 text-rose-400"
                            >
                              {t(
                                "security.encryptedApiRevoked",
                                undefined,
                                "Revoked",
                              )}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {grant.categories.map((category) => (
                            <Badge
                              key={category}
                              variant="outline"
                              className="border-slate-700 text-slate-300"
                            >
                              {categoryLabel(category)}
                            </Badge>
                          ))}
                        </div>
                        <div className="space-y-1 text-xs text-slate-400">
                          <p>
                            {t("security.encryptedApiExpires", undefined, "Expires")}: {" "}
                            {new Date(grant.expires_at).toLocaleString()}
                          </p>
                          <p>
                            {t(
                              "security.encryptedApiLastUsed",
                              undefined,
                              "Last used",
                            )}: {" "}
                            {grant.last_used_at
                              ? new Date(grant.last_used_at).toLocaleString()
                              : t(
                                  "security.encryptedApiNeverUsed",
                                  undefined,
                                  "Never",
                                )}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setGrantToRevoke(grant)}
                        disabled={Boolean(grant.revoked_at)}
                        className="gap-2 shrink-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t("security.encryptedApiRevoke", undefined, "Revoke")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
      </CardContent>

      <Dialog open={Boolean(newToken)} onOpenChange={closeTokenDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>
              {t(
                "security.encryptedApiTokenTitle",
                undefined,
                "Copy your access token now",
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t(
                "security.encryptedApiTokenDesc",
                undefined,
                "For your security, this token is shown only once. Store it somewhere safe before closing this dialog.",
              )}
            </DialogDescription>
          </DialogHeader>
          <code className="block max-h-40 overflow-auto break-all rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-300 select-all">
            {newToken}
          </code>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void copyToken()}
              className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied
                ? t("security.encryptedApiCopied", undefined, "Copied")
                : t("security.encryptedApiCopyToken", undefined, "Copy token")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(grantToRevoke)}
        onOpenChange={(open) => {
          if (!open && !revoking) setGrantToRevoke(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>
              {t(
                "security.encryptedApiRevokeTitle",
                undefined,
                "Revoke this access key?",
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t(
                "security.encryptedApiRevokeDesc",
                undefined,
                "Applications using this token will immediately lose access. This action cannot be undone.",
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium text-white break-all">
            {grantToRevoke?.name}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={revoking}
              onClick={() => setGrantToRevoke(null)}
              className="border-slate-700"
            >
              {t("security.encryptedApiCancel", undefined, "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={revoking}
              onClick={() => void handleRevoke()}
              className="gap-2"
            >
              {revoking && <Loader2 className="w-4 h-4 motion-safe:animate-spin" />}
              {t(
                "security.encryptedApiConfirmRevoke",
                undefined,
                "Revoke access",
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
