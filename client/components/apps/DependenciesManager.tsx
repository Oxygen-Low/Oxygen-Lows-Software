import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  isNativeRunnerAvailable,
  llamaStatus,
  llamaCheckUpdate,
  llamaInstall,
  llamaUpdate,
  llamaUninstall,
  llamaIgnoreVersion,
  llamaSetAutoCheck,
  type LlamaStatus,
  type DependencyUpdate,
} from "@/lib/aiRunnerBridge";

type Busy = "install" | "update" | "uninstall" | null;

export function DependenciesManagerApp() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LlamaStatus | null>(null);
  const [update, setUpdate] = useState<DependencyUpdate | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const native = isNativeRunnerAvailable();

  const refresh = useCallback(async () => {
    if (!native) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [s, u] = await Promise.all([llamaStatus(), llamaCheckUpdate()]);
      setStatus(s);
      setUpdate(u);
      setError(null);
    } catch {
      setError(
        t(
          "dependencies.loadError",
          undefined,
          "Could not load dependency information.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [native, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onProgress = (pct: number) => setProgress(pct);

  const doInstall = async (isUpdate: boolean) => {
    setBusy(isUpdate ? "update" : "install");
    setProgress(0);
    try {
      const op = isUpdate ? llamaUpdate("", onProgress) : llamaInstall("", onProgress);
      await toast.promise(op, {
        loading: t(
          isUpdate ? "dependencies.updating" : "dependencies.installing",
          undefined,
          isUpdate ? "Updating llama.cpp…" : "Installing llama.cpp…",
        ),
        success: t(
          "dependencies.done",
          undefined,
          "llama.cpp is ready.",
        ),
        error: t(
          "dependencies.operationFailed",
          undefined,
          "The operation failed. Please try again.",
        ),
      });
      await refresh();
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const doUninstall = async () => {
    setBusy("uninstall");
    try {
      await toast.promise(llamaUninstall(), {
        loading: t("dependencies.uninstalling", undefined, "Uninstalling llama.cpp…"),
        success: t("dependencies.uninstalled", undefined, "llama.cpp was uninstalled."),
        error: t("dependencies.operationFailed", undefined, "The operation failed. Please try again."),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const doRemindLater = async () => {
    if (!update?.latestVersion) return;
    await llamaIgnoreVersion(update.latestVersion);
    toast.success(
      t("dependencies.reminderSet", undefined, "We'll remind you about the next version."),
    );
    await refresh();
  };

  const doToggleAutoCheck = async (enabled: boolean) => {
    await llamaSetAutoCheck(enabled);
    setStatus((s) => (s ? { ...s, autoCheckUpdates: enabled } : s));
  };

  if (!native) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>
              {t("dependencies.title", undefined, "Dependencies Manager")}
            </CardTitle>
            <CardDescription>
              {t(
                "dependencies.desktopOnly",
                undefined,
                "Dependency management requires the desktop or mobile app.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const installed = !!status?.installed;
  const currentVersion = status?.installedVersion || t("dependencies.notInstalled", undefined, "Not installed");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {t("dependencies.title", undefined, "Dependencies Manager")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t(
            "dependencies.subtitle",
            undefined,
            "Manage the local engines used by your apps.",
          )}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              llama.cpp
              {update?.hasUpdate ? (
                <Badge variant="secondary">
                  {t("dependencies.updateAvailable", undefined, "Update available")}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription className="mt-1">
              {t(
                "dependencies.llamaDesc",
                undefined,
                "Local inference engine used by AI Runner and the chatbot.",
              )}
            </CardDescription>
          </div>
          {!loading ? (
            <Badge variant={installed ? "default" : "outline"}>
              {installed
                ? t("dependencies.installed", undefined, "Installed")
                : t("dependencies.notInstalled", undefined, "Not installed")}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t("dependencies.version", undefined, "Version")}:{" "}
            </span>
            <span className="font-mono font-medium">{currentVersion}</span>
            {update?.latestVersion ? (
              <span className="text-muted-foreground ml-2">
                ({t("dependencies.latest", undefined, "latest")}: {update.latestVersion})
              </span>
            ) : null}
          </div>

          {busy && progress > 0 ? <Progress value={progress} className="w-full" /> : null}

          <div className="flex flex-wrap gap-2">
            {!installed ? (
              <Button onClick={() => doInstall(false)} disabled={busy !== null}>
                {t("dependencies.install", undefined, "Install")}
              </Button>
            ) : (
              <>
                <Button
                  variant="default"
                  onClick={() => doInstall(true)}
                  disabled={busy !== null || !update?.hasUpdate}
                >
                  {t("dependencies.update", undefined, "Update")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => doInstall(true)}
                  disabled={busy !== null}
                >
                  {t(
                    "dependencies.reinstallUpdate",
                    undefined,
                    "Reinstall / Update",
                  )}
                </Button>
                <Button
                  variant="destructive"
                  onClick={doUninstall}
                  disabled={busy !== null}
                >
                  {t("dependencies.uninstall", undefined, "Uninstall")}
                </Button>
              </>
            )}
          </div>

          {installed && update?.hasUpdate ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={doRemindLater}>
                {t(
                  "dependencies.remindNextVersion",
                  undefined,
                  "Remind me for the next version",
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    update.releaseUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                {t("dependencies.viewRelease", undefined, "View release")}
              </Button>
            </div>
          ) : null}

          <label className="flex items-center gap-2 pt-2 text-sm">
            <input
              type="checkbox"
              checked={status?.autoCheckUpdates ?? true}
              onChange={(e) => doToggleAutoCheck(e.target.checked)}
            />
            {t(
              "dependencies.autoCheck",
              undefined,
              "Check for updates automatically",
            )}
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
