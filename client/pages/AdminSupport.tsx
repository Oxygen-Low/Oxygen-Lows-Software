import { useState, useEffect } from "react";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Clock, Info } from "lucide-react";
import { supabase } from "@/lib/db";


type Ticket = {
  id: string;
  title: string;
  priority: string;
  type: string;
  status: string;
  created_at: string;
  closed_at?: string | null;
  user_id?: string;
  user: {
    email: string;
  };
  profiles: {
    user_id?: string;
    username: string;
  };
};

export default function AdminSupport() {
  const { session } = useAuth();
  const { t } = useTranslation();
  usePageTitle(t("titles.adminSupport", undefined, "Admin Support"), {
    description: t(
      "admin.supportDesc",
      undefined,
      "Manage and respond to user support tickets.",
    ),
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideClosed, setHideClosed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("admin_hide_closed_tickets");
      return stored !== null ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (session?.access_token) {
      fetchTickets(hideClosed);
    }
  }, [session, hideClosed]);

  // Real-time subscription for admin ticket list
  useEffect(() => {
    if (!session?.access_token) return;

    const channel = supabase
      .channel("admin_tickets_list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        () => {
          fetchTickets(hideClosed);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets" },
        (payload) => {
          setTickets((prev) =>
            prev.map((t) =>
              t.id === payload.new?.id
                ? { ...t, ...payload.new, status: payload.new?.status || "Open" }
                : t,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "support_tickets" },
        (payload) => {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setTickets((prev) => prev.filter((t) => t.id !== deletedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.access_token, hideClosed]);


  const handleToggleHideClosed = (checked: boolean) => {
    setHideClosed(checked);
    try {
      localStorage.setItem("admin_hide_closed_tickets", JSON.stringify(checked));
    } catch {}
  };

  const fetchTickets = async (shouldHideClosed: boolean) => {
    try {
      const url = shouldHideClosed
        ? "/api/admin/support/tickets?hideClosed=true"
        : "/api/admin/support/tickets";
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error ||
            `Failed to fetch tickets (Status ${response.status})`,
        );
      }

      const data = await response.json();
      const normalized = (data.tickets || []).map((t: any) => ({
        ...t,
        status: t.status || "Open",
      }));
      setTickets(normalized);
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error fetching tickets"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/admin")}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title={t("common.back", undefined, "Back to Admin Panel")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("admin.allTickets", undefined, "Admin Support")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.supportDesc", undefined, "Manage and respond to user support tickets.")}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-muted/40 p-2 px-3 rounded-lg border">
            <Switch
              id="hide-closed-switch"
              checked={hideClosed}
              onCheckedChange={handleToggleHideClosed}
            />
            <label
              htmlFor="hide-closed-switch"
              className="text-sm font-medium cursor-pointer select-none"
            >
              {t("admin.hideClosed", undefined, "Hide Closed Tickets")}
            </label>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-muted-foreground bg-muted/20 p-3 rounded-md border">
          <Info className="w-4 h-4 text-blue-500 shrink-0" />
          <span>
            {t(
              "admin.closedAutoDeleteNotice",
              undefined,
              "Closed tickets are automatically deleted after 3 days to clear space in the tickets section.",
            )}
          </span>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>
              {t("admin.allTickets", undefined, "All Support Tickets")}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">
                {t("common.loading", undefined, "Loading tickets...")}
              </p>
            ) : tickets.length === 0 ? (
              <p className="text-muted-foreground">
                {t("support.noTickets", undefined, "No tickets found.")}
              </p>
            ) : (
              <div className="space-y-4">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => navigate(`/admin/support/${ticket.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/admin/support/${ticket.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <div className="space-y-1 mb-2 sm:mb-0">
                      <p className="font-medium">{ticket.title}</p>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>{ticket.type}</span>
                        <span>•</span>
                        <span>
                          {ticket.profiles?.username ||
                            ticket.user?.email ||
                            "Unknown User"}
                        </span>
                        {(ticket.profiles?.user_id || ticket.user_id) && (
                          <>
                            <span>•</span>
                            <span
                              className="text-xs font-mono text-muted-foreground/70"
                              title={t("admin.userId", undefined, "User ID")}
                            >
                              {t("admin.userId", undefined, "UID")}:{" "}
                              {ticket.profiles?.user_id || ticket.user_id}
                            </span>
                          </>
                        )}
                        {ticket.status === "Closed" && (
                          <>
                            <span>•</span>
                            <span className="flex items-center text-xs text-amber-600 dark:text-amber-400">
                              <Clock className="w-3 h-3 mr-1 inline" />
                              Auto-deletes in 3d
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={
                          ticket.priority === "Highest"
                            ? "destructive"
                            : ticket.priority === "High"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {ticket.priority}
                      </Badge>
                      <Badge
                        variant={
                          ticket.status === "Open" ? "default" : "secondary"
                        }
                      >
                        {ticket.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
