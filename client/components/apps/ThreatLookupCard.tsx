import React, { useState } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  Search,
  Activity,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

export interface ThreatLookupResult {
  ip: string;
  is_known_threat: boolean;
  is_tor: boolean;
  is_vpn: boolean;
  details: {
    banned: boolean;
    banned_reason: string | null;
    threat_actor: boolean;
    threat_category: string | null;
  };
}

export function ThreatLookupCard() {
  const { t } = useTranslation();
  const [lookupIp, setLookupIp] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<ThreatLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = lookupIp.trim();
    if (!clean) {
      setError(
        t("threatLookup.errorRequired", undefined, "IP address is required"),
      );
      setResult(null);
      return;
    }

    setIsChecking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/webdefender/known-threats?ip=${encodeURIComponent(clean)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error ||
            t(
              "threatLookup.errorGeneric",
              undefined,
              "Failed to evaluate IP threat status. Please try again.",
            ),
        );
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError(
        t(
          "threatLookup.errorGeneric",
          undefined,
          "Failed to evaluate IP threat status. Please try again.",
        ),
      );
      setResult(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-xl text-white">
              {t("threatLookup.title", undefined, "Threat Intelligence Lookup")}
            </CardTitle>
            <CardDescription className="text-slate-400 mt-1">
              {t(
                "threatLookup.subtitle",
                undefined,
                "Check any IP address against active platform bans, known threat actors, TOR exit nodes, and VPN networks.",
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder={t(
                "threatLookup.inputPlaceholder",
                undefined,
                "Enter IPv4 or IPv6 address (e.g., 1.1.1.1)",
              )}
              value={lookupIp}
              onChange={(e) => {
                setLookupIp(e.target.value);
                if (error) setError(null);
              }}
              className="bg-slate-950 border-slate-800 text-white font-mono placeholder:text-slate-500"
            />
          </div>
          <Button
            type="submit"
            disabled={isChecking || !lookupIp.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
          >
            {isChecking ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                {t("threatLookup.checking", undefined, "Checking...")}
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                {t(
                  "threatLookup.checkButton",
                  undefined,
                  "Check Threat Status",
                )}
              </>
            )}
          </Button>
        </form>

        {error && (
          <Alert
            variant="destructive"
            className="bg-rose-500/10 border-rose-500/30 text-rose-400"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-slate-300 font-semibold">
                  {result.ip}
                </span>
              </div>
              <Badge
                variant={result.is_known_threat ? "destructive" : "default"}
                className={cn(
                  result.is_known_threat
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                )}
              >
                {result.is_known_threat ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    {t(
                      "threatLookup.knownThreat",
                      undefined,
                      "Known Threat Detected",
                    )}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    {t(
                      "threatLookup.cleanIp",
                      undefined,
                      "Clean IP - No Threats Detected",
                    )}
                  </>
                )}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">
                  {t("threatLookup.torExitNode", undefined, "TOR Exit Node")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {result.is_tor ? (
                    <span className="text-amber-400">
                      {t("threatLookup.torExitNode", undefined, "TOR Exit Node")}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">
                      {t("threatLookup.notTor", undefined, "Not a TOR Exit Node")}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">
                  {t("threatLookup.vpnNetwork", undefined, "VPN Network")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {result.is_vpn ? (
                    <span className="text-blue-400">
                      {t("threatLookup.vpnNetwork", undefined, "VPN Network")}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">
                      {t("threatLookup.notVpn", undefined, "Not a Known VPN")}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">
                  {t("threatLookup.bannedStatus", undefined, "Platform Ban")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {result.details.banned ? (
                    <span className="text-rose-400">
                      {t("threatLookup.banned", undefined, "Banned")}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">
                      {t("threatLookup.notBanned", undefined, "Not Banned")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {(result.details.banned_reason || result.details.threat_category) && (
              <div className="mt-2 text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded border border-slate-800/50 space-y-1">
                {result.details.banned_reason && (
                  <div>
                    <span className="font-semibold text-slate-300">
                      {t("threatLookup.reason", undefined, "Reason")}:{" "}
                    </span>
                    {result.details.banned_reason}
                  </div>
                )}
                {result.details.threat_category && (
                  <div>
                    <span className="font-semibold text-slate-300">
                      {t("threatLookup.category", undefined, "Category")}:{" "}
                    </span>
                    <span className="font-mono text-amber-300">
                      {result.details.threat_category}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
