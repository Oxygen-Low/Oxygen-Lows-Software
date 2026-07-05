import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Check, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function OauthConsent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const authorizationId = searchParams.get("authorization_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      const currentPath = window.location.pathname + window.location.search;
      navigate(`/auth?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    async function loadAuthDetails() {
      if (!authorizationId) {
        setError("Missing authorization_id");
        setLoading(false);
        return;
      }

      try {
        // @ts-ignore
        const { data, error } =
          await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

        if (error) throw error;
        setAuthDetails(data);
      } catch (err: any) {
        setError(err.message || "Failed to load authorization details");
      } finally {
        setLoading(false);
      }
    }

    loadAuthDetails();
  }, [authorizationId, session, authLoading, navigate]);

  const handleApprove = async () => {
    if (!authorizationId || processing) return;
    setProcessing(true);
    try {
      // @ts-ignore
      const { data, error } =
        await supabase.auth.oauth.approveAuthorization(authorizationId);
      if (error) throw error;
      if ((data as any)?.redirect_to) {
        window.location.href = (data as any).redirect_to;
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (!authorizationId || processing) return;
    setProcessing(true);
    try {
      // @ts-ignore
      const { data, error } =
        await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (error) throw error;
      if ((data as any)?.redirect_to) {
        window.location.href = (data as any).redirect_to;
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
      setProcessing(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader className="space-y-4">
            <Skeleton className="h-12 w-12 rounded-full mx-auto" />
            <Skeleton className="h-6 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <Card className="w-full max-w-md bg-slate-900 border-red-900/50">
          <CardHeader>
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-center text-white">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-slate-400">{error}</p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => navigate("/")}
              className="w-full bg-slate-800 hover:bg-slate-700"
            >
              Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!authDetails) return null;
  const { client, scopes } = authDetails;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-10 h-10 text-cyan-500" />
          </div>
          <CardTitle className="text-2xl text-white">{`Authorize ${client.name}`}</CardTitle>
          <CardDescription className="text-slate-400 mt-2">
            {`This application wants to connect to your Oxygen Low's Software account.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Requested Permissions:
            </h4>
            <ul className="space-y-2">
              {scopes && scopes.length > 0 ? (
                scopes.map((scope: string) => (
                  <li
                    key={scope}
                    className="flex items-start gap-3 text-sm text-slate-400"
                  >
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>
                      {scope === "openid" &&
                        "Access to your unique user identifier"}
                      {scope === "email" && "View your email address"}
                      {scope === "profile" &&
                        "Access your profile info (name, photo)"}
                      {scope === "phone" && "Access your phone number"}
                      {!["openid", "email", "profile", "phone"].includes(
                        scope,
                      ) && `Access to ${scope}`}
                    </span>
                  </li>
                ))
              ) : (
                <li className="flex items-start gap-3 text-sm text-slate-400">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>View your email address (default)</span>
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <p className="text-xs text-slate-400">
              Only authorize applications you trust.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleApprove}
            disabled={processing}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-11 font-bold"
          >
            {processing ? "Processing..." : "Approve"}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDeny}
            disabled={processing}
            className="w-full text-slate-500 hover:text-red-400 hover:bg-red-400/10"
          >
            Deny Access
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
