import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Shield,
  KeyRound,
  User,
  Mail,
  Image,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

interface AuthorizeDetails {
  app: {
    id: string;
    client_id: string;
    name: string;
    description: string;
    website_url: string;
    developer_username: string;
  };
  requested_scopes: string[];
  user_consented: boolean;
  logged_in: boolean;
  user: {
    id: string;
    username: string;
    email: string;
  } | null;
}

export default function OAuthAuthorize() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  usePageTitle(t("oauthAuthorize.title", undefined, "Authorize Application"));

  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const scope = searchParams.get("scope") || "";
  const state = searchParams.get("state") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<AuthorizeDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const token = session?.access_token;

  useEffect(() => {
    let active = true;

    async function fetchDetails() {
      if (!clientId || !redirectUri) {
        setError("Missing required OAuth parameters: client_id and redirect_uri.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
        });
        if (scope) params.set("scope", scope);

        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(
          `/api/oauth/authorize-details?${params.toString()}`,
          { headers },
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load authorization request");
        }

        if (!active) return;
        setDetails(data);

        // Auto-approve if user already gave consent for these scopes
        if (data.logged_in && data.user_consented) {
          handleDecision("allow", true);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Invalid authorization request");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDetails();

    return () => {
      active = false;
    };
  }, [clientId, redirectUri, scope, token]);

  const handleDecision = async (action: "allow" | "deny", auto = false) => {
    if (!token && action === "allow") return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          action,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authorization request failed");
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: any) {
      setError(err.message || "Failed to complete authorization");
      setSubmitting(false);
    }
  };

  const getScopeInfo = (s: string) => {
    switch (s) {
      case "username":
        return {
          icon: <User className="w-4 h-4 text-cyan-400" />,
          title: t("developerAuth.scopeUsername", undefined, "Username"),
          desc: t(
            "developerAuth.scopeUsernameDesc",
            undefined,
            "Access your Oxygen Low's Software username",
          ),
        };
      case "display_name":
        return {
          icon: <User className="w-4 h-4 text-cyan-400" />,
          title: t("developerAuth.scopeDisplayName", undefined, "Display Name"),
          desc: t(
            "developerAuth.scopeDisplayNameDesc",
            undefined,
            "Access your profile display name",
          ),
        };
      case "email":
        return {
          icon: <Mail className="w-4 h-4 text-emerald-400" />,
          title: t("developerAuth.scopeEmail", undefined, "Email Address"),
          desc: t(
            "developerAuth.scopeEmailDesc",
            undefined,
            "Access your verified email address",
          ),
        };
      case "profile_picture":
        return {
          icon: <Image className="w-4 h-4 text-purple-400" />,
          title: t("developerAuth.scopeProfilePicture", undefined, "Profile Picture"),
          desc: t(
            "developerAuth.scopeProfilePictureDesc",
            undefined,
            "Access your profile avatar URL",
          ),
        };
      case "bio":
        return {
          icon: <FileText className="w-4 h-4 text-amber-400" />,
          title: t("developerAuth.scopeBio", undefined, "Bio"),
          desc: t(
            "developerAuth.scopeBioDesc",
            undefined,
            "Access your public bio",
          ),
        };
      default:
        return {
          icon: <Shield className="w-4 h-4 text-slate-400" />,
          title: s,
          desc: `Access ${s}`,
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {loading ? (
          <Card className="bg-slate-900 border-slate-800 text-center py-12">
            <CardContent className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-400">
                {t("oauthAuthorize.redirecting", undefined, "Loading authorization details...")}
              </p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="bg-slate-900 border-red-500/30 text-white shadow-xl">
            <CardHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>
              <CardTitle className="text-red-400 text-lg">
                {t("oauthAuthorize.invalidRequest", undefined, "Invalid Authorization Request")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-slate-300">{error}</p>
              <Button
                variant="outline"
                onClick={() => navigate("/")}
                className="border-slate-700 text-slate-300 hover:text-white"
              >
                Return to Home
              </Button>
            </CardContent>
          </Card>
        ) : !details?.logged_in ? (
          <Card className="bg-slate-900 border-slate-800 text-white shadow-2xl">
            <CardHeader className="text-center pb-3">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 mb-2">
                <KeyRound className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl">
                {t("oauthAuthorize.title", undefined, "Authorize Application")}
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm">
                <strong className="text-white">{details?.app.name}</strong>{" "}
                {t(
                  "oauthAuthorize.subtitle",
                  undefined,
                  "wants to access your Oxygen Low's Software account",
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-center">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400">
                {t(
                  "oauthAuthorize.loginRequired",
                  undefined,
                  "Please log in to your Oxygen Low's Software account to authorize this application.",
                )}
              </div>

              <Link
                to={`/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className="w-full inline-block"
              >
                <Button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2">
                  {t("oauthAuthorize.loginButton", undefined, "Log In / Sign Up")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-900 border-slate-800 text-white shadow-2xl">
            <CardHeader className="text-center pb-3">
              {/* App Avatar / Icon */}
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 mb-3 shadow-inner">
                <KeyRound className="w-7 h-7" />
              </div>

              <CardTitle className="text-xl font-bold">
                {details.app.name}
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-1">
                {t("oauthAuthorize.by", undefined, "Created by")}{" "}
                <span className="text-cyan-400 font-medium">
                  @{details.app.developer_username}
                </span>
                {details.app.website_url && (
                  <a
                    href={details.app.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 ml-2 transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </CardDescription>
              {details.app.description && (
                <p className="text-xs text-slate-300 mt-2 bg-slate-950/60 p-2 rounded border border-slate-800/60">
                  {details.app.description}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-4 pt-1">
              <div className="border-t border-slate-800 pt-3">
                <p className="text-xs font-semibold text-slate-300 mb-2">
                  {t(
                    "oauthAuthorize.requestedPermissions",
                    undefined,
                    "This application will receive access to:",
                  )}
                </p>

                <div className="space-y-2">
                  {details.requested_scopes.map((s) => {
                    const info = getScopeInfo(s);
                    return (
                      <div
                        key={s}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80"
                      >
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800 shrink-0 mt-0.5">
                          {info.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white">
                            {info.title}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {info.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Logged in user info */}
              {details.user && (
                <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  <span>
                    Signed in as <strong className="text-white">@{details.user.username}</strong>
                  </span>
                  <Link
                    to={`/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                    className="text-cyan-400 hover:text-cyan-300 transition text-[11px]"
                  >
                    Switch account
                  </Link>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => handleDecision("deny")}
                disabled={submitting}
                className="w-1/2 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
              >
                {t("oauthAuthorize.deny", undefined, "Cancel")}
              </Button>
              <Button
                onClick={() => handleDecision("allow")}
                disabled={submitting}
                className="w-1/2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("oauthAuthorize.allow", undefined, "Authorize")
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
