import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, ShieldBan, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

type BanRecord = {
  id: string;
  ip: string;
  reason: string;
  active: boolean;
  created_at: string;
  revoked_at?: string | null;
};

export default function AdminBannedIps() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  usePageTitle(t("titles.adminBannedIps", undefined, "Admin Banned IPs"), {
    description: t(
      "adminBannedIps.subtitle",
      undefined,
      "Manage platform-wide Web Defender IP bans.",
    ),
  });

  const [records, setRecords] = useState<BanRecord[]>([]);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
  };

  const load = async () => {
    const response = await fetch("/api/admin/webdefender/banned-ips", {
      headers,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error ||
          t("adminBannedIps.loadError", undefined, "Unable to load banned IPs"),
      );
    }
    setRecords(data.banned_ips || []);
  };

  useEffect(() => {
    if (session?.access_token) {
      load().catch((error) => toast.error(error.message));
    }
  }, [session?.access_token]);

  const reset = () => {
    setIp("");
    setReason("");
    setEditing(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/webdefender/banned-ips/${editing}`
          : "/api/admin/webdefender/banned-ips",
        {
          method: editing ? "PATCH" : "POST",
          headers,
          body: JSON.stringify({ ip, reason }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminBannedIps.saveError",
              undefined,
              "Unable to save banned IP",
            ),
        );
      }
      toast.success(
        editing
          ? t("adminBannedIps.banUpdated", undefined, "Ban updated")
          : t("adminBannedIps.ipBanned", undefined, "IP banned"),
      );
      reset();
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const response = await fetch(
        `/api/admin/webdefender/banned-ips/${id}`,
        { method: "DELETE", headers },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            t(
              "adminBannedIps.revokeError",
              undefined,
              "Unable to revoke banned IP",
            ),
        );
      }
      toast.success(
        t("adminBannedIps.banRevoked", undefined, "Ban revoked"),
      );
      await load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Layout>
      <main className="max-w-5xl mx-auto space-y-6">
        <button
          onClick={() => navigate("/admin")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />{" "}
          {t("adminBannedIps.backToAdmin", undefined, "Back to Admin Panel")}
        </button>

        <div className="flex gap-3">
          <ShieldBan className="w-9 h-9 text-rose-500" />
          <div>
            <h1 className="text-3xl font-bold">
              {t("adminBannedIps.title", undefined, "Banned IPs")}
            </h1>
            <p className="text-muted-foreground">
              {t(
                "adminBannedIps.subtitle",
                undefined,
                "Manage platform-wide Web Defender IP bans.",
              )}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {editing
                ? t("adminBannedIps.editTitle", undefined, "Edit banned IP")
                : t(
                    "adminBannedIps.createTitle",
                    undefined,
                    "Ban an IP address",
                  )}
            </CardTitle>
            <CardDescription>
              {t(
                "adminBannedIps.createDesc",
                undefined,
                "A reason is required and appears in the public ban directory.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-4">
              <Input
                value={ip}
                onChange={(event) => setIp(event.target.value)}
                placeholder={t(
                  "adminBannedIps.ipPlaceholder",
                  undefined,
                  "IPv4 or IPv6 address",
                )}
                required
              />
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t(
                  "adminBannedIps.reasonPlaceholder",
                  undefined,
                  "Reason for this ban",
                )}
                maxLength={500}
                required
              />
              <div className="flex gap-2">
                <Button disabled={saving}>
                  {editing
                    ? t("adminBannedIps.saveChanges", undefined, "Save changes")
                    : t("adminBannedIps.banButton", undefined, "Ban IP")}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={reset}>
                    {t("adminBannedIps.cancel", undefined, "Cancel")}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t("adminBannedIps.historyTitle", undefined, "Ban history")}
            </CardTitle>
            <CardDescription>
              {t(
                "adminBannedIps.historyDesc",
                undefined,
                "Revoked entries are retained for administrators only.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="rounded-lg border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex gap-2 items-center">
                    <code>{record.ip}</code>
                    <Badge variant={record.active ? "destructive" : "secondary"}>
                      {record.active
                        ? t("adminBannedIps.active", undefined, "Active")
                        : t("adminBannedIps.revoked", undefined, "Revoked")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm">{record.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(record.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  {record.active && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(record.id);
                          setIp(record.ip);
                          setReason(record.reason);
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        {t("adminBannedIps.edit", undefined, "Edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revoke(record.id)}
                      >
                        <Undo2 className="w-4 h-4 mr-1" />
                        {t("adminBannedIps.revoke", undefined, "Revoke")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {records.length === 0 && (
              <p className="text-muted-foreground">
                {t(
                  "adminBannedIps.noBans",
                  undefined,
                  "No IP bans have been created.",
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </Layout>
  );
}
