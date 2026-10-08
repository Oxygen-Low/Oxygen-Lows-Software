import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { exchangePollinationsAuthCode } from "../services/pollinationsAuth";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useTranslation } from "../contexts/LanguageContext";

export default function PollinationsOAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      const errorParam =
        searchParams.get("error") || searchParams.get("error_description");
      if (errorParam) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage(errorParam);
        if (window.opener) {
          window.opener.postMessage(
            { type: "POLLINATIONS_AUTH_ERROR", error: errorParam },
            window.location.origin,
          );
        }
        localStorage.setItem(
          "pollinations_auth_result",
          JSON.stringify({ success: false, error: errorParam }),
        );
        return;
      }

      // Check URL hash for direct token/api_key
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const hashApiKey = hashParams.get("api_key") || hashParams.get("token");

      if (hashApiKey) {
        const isSupporter =
          (sessionStorage.getItem("pollinations_auth_is_supporter") ||
            localStorage.getItem("pollinations_auth_is_supporter")) === "true";

        localStorage.setItem("pollinations_api_key", hashApiKey.trim());
        localStorage.setItem("oxygen_pollinations_api_key", hashApiKey.trim());
        localStorage.setItem(
          "oxygen_pollinations_is_supporter",
          isSupporter ? "true" : "false",
        );

        if (window.opener) {
          window.opener.postMessage(
            {
              type: "POLLINATIONS_AUTH_SUCCESS",
              apiKey: hashApiKey.trim(),
              isSupporter,
            },
            window.location.origin,
          );
          localStorage.setItem(
            "pollinations_auth_result",
            JSON.stringify({
              success: true,
              apiKey: hashApiKey.trim(),
              isSupporter,
            }),
          );
          setTimeout(() => window.close(), 300);
          return;
        }

        if (!isMounted) return;
        setStatus("success");
        setTimeout(() => navigate("/account"), 1500);
        return;
      }

      const code = searchParams.get("code");
      const state = searchParams.get("state") || undefined;

      if (!code) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMessage("No authorization code received.");
        return;
      }

      try {
        const result = await exchangePollinationsAuthCode({ code, state });

        localStorage.setItem("pollinations_api_key", result.apiKey);
        localStorage.setItem("oxygen_pollinations_api_key", result.apiKey);
        localStorage.setItem(
          "oxygen_pollinations_is_supporter",
          result.isSupporter ? "true" : "false",
        );

        if (window.opener) {
          window.opener.postMessage(
            {
              type: "POLLINATIONS_AUTH_SUCCESS",
              apiKey: result.apiKey,
              isSupporter: result.isSupporter,
            },
            window.location.origin,
          );
          localStorage.setItem(
            "pollinations_auth_result",
            JSON.stringify({
              success: true,
              apiKey: result.apiKey,
              isSupporter: result.isSupporter,
            }),
          );
          setTimeout(() => window.close(), 300);
          return;
        }

        if (!isMounted) return;
        setStatus("success");
        setTimeout(() => navigate("/account"), 1500);
      } catch (err: any) {
        if (!isMounted) return;
        setStatus("error");
        const msg = err?.message || "Failed to exchange authorization code.";
        setErrorMessage(msg);
        if (window.opener) {
          window.opener.postMessage(
            { type: "POLLINATIONS_AUTH_ERROR", error: msg },
            window.location.origin,
          );
        }
        localStorage.setItem(
          "pollinations_auth_result",
          JSON.stringify({ success: false, error: msg }),
        );
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl text-center space-y-4">
        {status === "processing" && (
          <div className="space-y-3 py-6">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-white">
              {t(
                "account.connectingPollinations",
                undefined,
                "Connecting Pollinations...",
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {t(
                "account.completingAuth",
                undefined,
                "Exchanging credentials and verifying your account.",
              )}
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold text-white">
              {t(
                "account.authSuccessToast",
                undefined,
                "Pollinations Connected Successfully!",
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {t(
                "account.redirectingBack",
                undefined,
                "Redirecting you back to your account...",
              )}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 py-4">
            <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
            <h2 className="text-lg font-semibold text-white">
              {t(
                "account.authFailedToast",
                undefined,
                "Connection Authorization Failed",
              )}
            </h2>
            <p className="text-xs text-rose-300/90 font-mono bg-rose-950/30 border border-rose-800/40 p-2.5 rounded-lg text-left break-all">
              {errorMessage}
            </p>
            <Button
              onClick={() => navigate("/account")}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs w-full"
            >
              <span>
                {t(
                  "account.returnToAccount",
                  undefined,
                  "Return to Account Settings",
                )}
              </span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
