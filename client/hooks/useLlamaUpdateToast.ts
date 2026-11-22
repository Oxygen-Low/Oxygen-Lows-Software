import { useCallback, useEffect, useRef, createElement } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  isNativeRunnerAvailable,
  llamaCheckUpdate,
  llamaIgnoreVersion,
  llamaUpdate,
  type DependencyUpdate,
} from "@/lib/aiRunnerBridge";

const DISMISSED_KEY = "oxygen_llama_update_dismissed";

/**
 * Checks for a newer llama.cpp release once per session and shows a toast with
 * three actions: update in background, remind me for the next version, and go
 * to Dependencies Manager. The "remind me" choice is remembered so the same
 * version is never announced twice.
 */
export function useLlamaUpdateToast(enabled = true) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shown = useRef(false);

  const check = useCallback(async () => {
    if (!enabled || shown.current || !isNativeRunnerAvailable()) return;
    shown.current = true;
    try {
      const update: DependencyUpdate = await llamaCheckUpdate();
      if (!update.hasUpdate || !update.latestVersion) return;
      if (localStorage.getItem(DISMISSED_KEY) === update.latestVersion) return;

      const runUpdate = async () => {
        toast.promise(llamaUpdate(), {
          loading: t(
            "dependencies.updatingBackground",
            undefined,
            "Updating llama.cpp in the background…",
          ),
          success: t(
            "dependencies.updateComplete",
            undefined,
            "llama.cpp is up to date.",
          ),
          error: t(
            "dependencies.updateFailed",
            undefined,
            "Could not update llama.cpp.",
          ),
        });
      };
      const remindLater = async () => {
        localStorage.setItem(DISMISSED_KEY, update.latestVersion);
        try {
          await llamaIgnoreVersion(update.latestVersion);
        } catch {
          // best effort
        }
      };
      const goToDeps = () => navigate("/apps/dependencies-manager");

      // Sonner supports a single `action` + `cancel`. To offer all three
      // requested actions, render them as buttons in a custom message node.
      toast.custom(
        (id) =>
          createElement(
            "div",
            {
              className:
                "w-full rounded-lg border border-border bg-background p-4 shadow-lg text-sm",
            },
            createElement(
              "div",
              { className: "font-semibold mb-1" },
              t(
                "dependencies.updateAvailableTitle",
                undefined,
                "llama.cpp update available",
              ),
            ),
            createElement(
              "div",
              { className: "text-muted-foreground mb-3" },
              t(
                "dependencies.updateAvailableDesc",
                { version: update.latestVersion },
                `Version ${update.latestVersion} is ready to install.`,
              ),
            ),
            createElement(
              "div",
              { className: "flex flex-wrap gap-2" },
              createElement(
                "button",
                {
                  className:
                    "rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90",
                  onClick: async () => {
                    toast.dismiss(id);
                    await runUpdate();
                  },
                },
                t(
                  "dependencies.updateNowBackground",
                  undefined,
                  "Update now (updates in background)",
                ),
              ),
              createElement(
                "button",
                {
                  className:
                    "rounded-md border border-border px-3 py-1.5 hover:bg-accent",
                  onClick: async () => {
                    toast.dismiss(id);
                    await remindLater();
                  },
                },
                t(
                  "dependencies.remindNextVersion",
                  undefined,
                  "Remind me for the next version",
                ),
              ),
              createElement(
                "button",
                {
                  className:
                    "rounded-md border border-border px-3 py-1.5 hover:bg-accent",
                  onClick: () => {
                    toast.dismiss(id);
                    goToDeps();
                  },
                },
                t(
                  "dependencies.goToDependencies",
                  undefined,
                  "Go to dependencies",
                ),
              ),
            ),
          ),
        { duration: 20000 },
      );
    } catch {
      // Update check is best-effort and never blocks the UI.
    }
  }, [enabled, t, navigate]);

  useEffect(() => {
    const timer = setTimeout(check, 2500);
    return () => clearTimeout(timer);
  }, [check]);

  const goToDependencies = useCallback(() => {
    navigate("/apps/dependencies-manager");
  }, [navigate]);

  return { check, goToDependencies };
}
