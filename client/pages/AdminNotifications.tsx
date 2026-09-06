import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Bell,
  Send,
  Trash2,
  Users,
  User,
  ArrowLeft,
  Loader2,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "announcement" | "warning" | "success" | "alert";
  action_url?: string | null;
  target_type: "all" | "user";
  target_user_id?: string | null;
  target_username?: string | null;
  created_by: string;
  created_by_username: string;
  created_at: string;
}

interface UserSearchResult {
  id: string;
  username: string;
  email: string;
}

export default function AdminNotifications() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  usePageTitle(t("titles.adminNotifications", undefined, "Admin Notifications"), {
    description: t(
      "adminNotifications.subtitle",
      undefined,
      "Compose, send, and manage platform-wide announcements and user alerts.",
    ),
  });

  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Compose form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "announcement" | "warning" | "success" | "alert">("announcement");
  const [targetType, setTargetType] = useState<"all" | "user">("all");
  const [targetUser, setTargetUser] = useState("");
  const [actionUrl, setActionUrl] = useState("");

  // User search suggestions
  const [userSuggestions, setUserSuggestions] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    if (session?.access_token) {
      fetchNotifications();
    }
  }, [session]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/notifications", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err: any) {
      toast.error(err.message || "Error fetching admin notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleUserSearch = async (query: string) => {
    setTargetUser(query);
    if (!query.trim() || query.length < 2) {
      setUserSuggestions([]);
      return;
    }

    try {
      setSearchingUsers(true);
      const res = await fetch(
        `/api/admin/notifications/users?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        },
      );

      if (res.ok) {
        const data = await res.json();
        setUserSuggestions(data.users || []);
      }
    } catch {
      // ignore suggestion search errors
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t("adminNotifications.errors.titleRequired", undefined, "Title is required"));
      return;
    }
    if (!message.trim()) {
      toast.error(t("adminNotifications.errors.messageRequired", undefined, "Message body is required"));
      return;
    }
    if (targetType === "user" && !targetUser.trim()) {
      toast.error(t("adminNotifications.errors.userRequired", undefined, "Recipient username is required"));
      return;
    }

    try {
      setSending(true);
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          target_type: targetType,
          target_user: targetType === "user" ? targetUser.trim() : null,
          action_url: actionUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to send notification");
      }

      toast.success(
        t("adminNotifications.sendSuccess", undefined, "Notification broadcast sent successfully!"),
      );

      // Reset form
      setTitle("");
      setMessage("");
      setActionUrl("");
      setTargetUser("");
      setUserSuggestions([]);

      // Prepend to list
      if (data.notification) {
        setNotifications((prev) => [data.notification, ...prev]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to delete notification");
      }

      toast.success(
        t("adminNotifications.deleteSuccess", undefined, "Notification deleted"),
      );
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notification");
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeBadge = (itemType: string) => {
    switch (itemType) {
      case "announcement":
        return (
          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 gap-1">
            <Megaphone className="w-3 h-3" />
            {t("notifications.types.announcement", undefined, "Announcement")}
          </Badge>
        );
      case "warning":
        return (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1">
            <AlertTriangle className="w-3 h-3" />
            {t("notifications.types.warning", undefined, "Warning")}
          </Badge>
        );
      case "success":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {t("notifications.types.success", undefined, "Success")}
          </Badge>
        );
      case "alert":
        return (
          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 gap-1">
            <AlertCircle className="w-3 h-3" />
            {t("notifications.types.alert", undefined, "Alert")}
          </Badge>
        );
      case "info":
      default:
        return (
          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 gap-1">
            <Info className="w-3 h-3" />
            {t("notifications.types.info", undefined, "Information")}
          </Badge>
        );
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin")}
              className="p-2 rounded-xl bg-card hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
              title={t("common.back", undefined, "Back to Admin Panel")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Bell className="w-7 h-7 text-primary" />
                {t("adminNotifications.title", undefined, "Notification Center")}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(
                  "adminNotifications.subtitle",
                  undefined,
                  "Compose, send, and manage platform-wide announcements and user alerts.",
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Compose Form */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-border/60 bg-card shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="w-5 h-5 text-primary" />
                  {t("adminNotifications.composeTitle", undefined, "Compose Notification")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "adminNotifications.composeDesc",
                    undefined,
                    "Send an instant announcement to all users or a direct alert.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSend} className="space-y-4">
                  {/* Notification Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {t("adminNotifications.fields.title", undefined, "Title")}
                    </label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t(
                        "adminNotifications.placeholders.title",
                        undefined,
                        "e.g., Major Platform Update v2.4",
                      )}
                      className="bg-background"
                      required
                    />
                  </div>

                  {/* Message Body */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {t("adminNotifications.fields.message", undefined, "Message")}
                    </label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t(
                        "adminNotifications.placeholders.message",
                        undefined,
                        "Write your announcement or alert message here...",
                      )}
                      rows={4}
                      className="bg-background resize-none"
                      required
                    />
                  </div>

                  {/* Type / Severity */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {t("adminNotifications.fields.type", undefined, "Notification Type")}
                    </label>
                    <Select
                      value={type}
                      onValueChange={(val: any) => setType(val)}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="announcement">
                          {t("notifications.types.announcement", undefined, "Announcement")}
                        </SelectItem>
                        <SelectItem value="info">
                          {t("notifications.types.info", undefined, "Information")}
                        </SelectItem>
                        <SelectItem value="warning">
                          {t("notifications.types.warning", undefined, "Warning")}
                        </SelectItem>
                        <SelectItem value="success">
                          {t("notifications.types.success", undefined, "Success")}
                        </SelectItem>
                        <SelectItem value="alert">
                          {t("notifications.types.alert", undefined, "Urgent Alert")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Audience */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {t("adminNotifications.fields.audience", undefined, "Target Audience")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetType("all")}
                        className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                          targetType === "all"
                            ? "bg-primary/15 border-primary/40 text-primary font-bold"
                            : "bg-background border-border hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>{t("adminNotifications.allUsers", undefined, "All Users")}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTargetType("user")}
                        className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                          targetType === "user"
                            ? "bg-primary/15 border-primary/40 text-primary font-bold"
                            : "bg-background border-border hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span>{t("adminNotifications.specificUser", undefined, "Specific User")}</span>
                      </button>
                    </div>
                  </div>

                  {/* Specific User Recipient Input */}
                  {targetType === "user" && (
                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        {t("adminNotifications.fields.recipient", undefined, "Recipient Username / ID")}
                      </label>
                      <div className="relative">
                        <Input
                          value={targetUser}
                          onChange={(e) => handleUserSearch(e.target.value)}
                          placeholder={t(
                            "adminNotifications.placeholders.recipient",
                            undefined,
                            "Enter username or user ID...",
                          )}
                          className="bg-background pr-8"
                          required
                        />
                        {searchingUsers && (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground absolute right-2.5 top-2.5" />
                        )}
                      </div>

                      {userSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto p-1">
                          {userSuggestions.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setTargetUser(u.username);
                                setUserSuggestions([]);
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-md hover:bg-muted text-xs flex items-center justify-between transition-colors"
                            >
                              <span className="font-semibold text-foreground">{u.username}</span>
                              <span className="text-[11px] text-muted-foreground">{u.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional Action URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1">
                      <span>{t("adminNotifications.fields.actionUrl", undefined, "Action URL (Optional)")}</span>
                    </label>
                    <Input
                      value={actionUrl}
                      onChange={(e) => setActionUrl(e.target.value)}
                      placeholder="/apps/webdefender or https://..."
                      className="bg-background"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={sending}
                    className="w-full gap-2 mt-2 h-10 font-medium"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t("adminNotifications.broadcasting", undefined, "Broadcasting...")}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>{t("adminNotifications.sendButton", undefined, "Broadcast Notification")}</span>
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sent History */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-border/60 bg-card shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {t("adminNotifications.historyTitle", undefined, "Notification Broadcast History")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "adminNotifications.historyDesc",
                      undefined,
                      "All active announcements and direct alerts sent by administrators.",
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {notifications.length} {t("adminNotifications.total", undefined, "total")}
                </Badge>
              </CardHeader>
              <CardContent className="p-0 sm:p-4">
                {loading ? (
                  <div className="py-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    {t("adminNotifications.noHistory", undefined, "No notifications have been sent yet.")}
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-4 hover:bg-muted/30 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getTypeBadge(n.type)}
                            {n.target_type === "all" ? (
                              <Badge variant="secondary" className="text-[10px]">
                                <Users className="w-3 h-3 mr-1" />
                                {t("adminNotifications.allUsers", undefined, "All Users")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] text-cyan-400">
                                <User className="w-3 h-3 mr-1" />
                                @{n.target_username || n.target_user_id}
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(n.created_at).toLocaleString()}
                            </span>
                          </div>

                          <h4 className="font-semibold text-sm text-foreground truncate">
                            {n.title}
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {n.message}
                          </p>

                          {n.action_url && (
                            <div className="text-[11px] text-primary flex items-center gap-1 pt-0.5">
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate max-w-xs">{n.action_url}</span>
                            </div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === n.id}
                          onClick={() => handleDelete(n.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title={t("adminNotifications.delete", undefined, "Revoke / Delete Notification")}
                        >
                          {deletingId === n.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
