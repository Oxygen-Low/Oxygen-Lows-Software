import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldBan, Search, ArrowLeft } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageTitle } from "@/hooks/usePageTitle";

type BannedIp = { ip: string; reason: string; banned_at: string };

export default function BannedIps() {
  const [bans, setBans] = useState<BannedIp[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  usePageTitle("Banned IPs", { description: "Active platform-wide Web Defender IP bans." });

  useEffect(() => {
    fetch("/api/webdefender/banned-ips")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load banned IPs");
        return response.json();
      })
      .then((data) => setBans(data.banned_ips || []))
      .catch((cause) => setError(cause.message || "Unable to load banned IPs"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? bans.filter((ban) => `${ban.ip} ${ban.reason}`.toLowerCase().includes(needle)) : bans;
  }, [bans, query]);

  return <Layout><main className="max-w-4xl mx-auto space-y-6">
    <Link to="/apps/webdefender" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Web Defender</Link>
    <div className="flex gap-3 items-start"><ShieldBan className="w-9 h-9 text-rose-500 mt-1" /><div><h1 className="text-3xl font-bold">Banned IPs</h1><p className="text-muted-foreground mt-1">Active platform-wide IP bans and their reasons.</p></div></div>
    <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search IP address or reason..." /></div>
    <Card><CardHeader><CardTitle>Active bans ({filtered.length})</CardTitle><CardDescription>These addresses may be blocked by Web Defender apps that enable administrator bans.</CardDescription></CardHeader><CardContent>
      {loading ? <p className="text-muted-foreground">Loading banned IPs…</p> : error ? <p className="text-destructive">{error}</p> : filtered.length === 0 ? <p className="text-muted-foreground">No active banned IPs match your search.</p> : <div className="divide-y divide-border">{filtered.map((ban) => <article key={ban.ip} className="py-4 first:pt-0"><div className="font-mono font-medium">{ban.ip}</div><p className="mt-1">{ban.reason}</p><time className="text-sm text-muted-foreground">Banned {new Date(ban.banned_at).toLocaleDateString()}</time></article>)}</div>}
    </CardContent></Card>
  </main></Layout>;
}
