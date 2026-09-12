import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, ShieldBan, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type BanRecord = { id: string; ip: string; reason: string; active: boolean; created_at: string; revoked_at?: string | null };

export default function AdminBannedIps() {
  const { session } = useAuth(); const navigate = useNavigate();
  const [records, setRecords] = useState<BanRecord[]>([]); const [ip, setIp] = useState(""); const [reason, setReason] = useState(""); const [editing, setEditing] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` };
  const load = async () => { const response = await fetch("/api/admin/webdefender/banned-ips", { headers }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load banned IPs"); setRecords(data.banned_ips || []); };
  useEffect(() => { if (session?.access_token) load().catch((error) => toast.error(error.message)); }, [session?.access_token]);
  const reset = () => { setIp(""); setReason(""); setEditing(null); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { const response = await fetch(editing ? `/api/admin/webdefender/banned-ips/${editing}` : "/api/admin/webdefender/banned-ips", { method: editing ? "PATCH" : "POST", headers, body: JSON.stringify({ ip, reason }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save banned IP"); toast.success(editing ? "Ban updated" : "IP banned"); reset(); await load(); } catch (error: any) { toast.error(error.message); } finally { setSaving(false); } };
  const revoke = async (id: string) => { try { const response = await fetch(`/api/admin/webdefender/banned-ips/${id}`, { method: "DELETE", headers }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to revoke banned IP"); toast.success("Ban revoked"); await load(); } catch (error: any) { toast.error(error.message); } };
  return <Layout><main className="max-w-5xl mx-auto space-y-6"><button onClick={() => navigate("/admin")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to Admin Panel</button><div className="flex gap-3"><ShieldBan className="w-9 h-9 text-rose-500" /><div><h1 className="text-3xl font-bold">Banned IPs</h1><p className="text-muted-foreground">Manage platform-wide Web Defender IP bans.</p></div></div><Card><CardHeader><CardTitle>{editing ? "Edit banned IP" : "Ban an IP address"}</CardTitle><CardDescription>A reason is required and appears in the public ban directory.</CardDescription></CardHeader><CardContent><form onSubmit={save} className="grid gap-4"><Input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="IPv4 or IPv6 address" required /><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this ban" maxLength={500} required /><div className="flex gap-2"><Button disabled={saving}>{editing ? "Save changes" : "Ban IP"}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancel</Button>}</div></form></CardContent></Card><Card><CardHeader><CardTitle>Ban history</CardTitle><CardDescription>Revoked entries are retained for administrators only.</CardDescription></CardHeader><CardContent className="space-y-3">{records.map((record) => <div key={record.id} className="rounded-lg border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex gap-2 items-center"><code>{record.ip}</code><Badge variant={record.active ? "destructive" : "secondary"}>{record.active ? "Active" : "Revoked"}</Badge></div><p className="mt-1 text-sm">{record.reason}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(record.created_at).toLocaleString()}</p></div><div className="flex gap-2">{record.active && <><Button size="sm" variant="outline" onClick={() => { setEditing(record.id); setIp(record.ip); setReason(record.reason); }}><Pencil className="w-4 h-4 mr-1" />Edit</Button><Button size="sm" variant="outline" onClick={() => revoke(record.id)}><Undo2 className="w-4 h-4 mr-1" />Revoke</Button></>}</div></div>)}{records.length === 0 && <p className="text-muted-foreground">No IP bans have been created.</p>}</CardContent></Card></main></Layout>;
}
