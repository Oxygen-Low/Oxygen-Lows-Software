import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications, ClientNotification } from "@/hooks/useNotifications";
import {
  Bell,
  CheckCheck,
  Check,
  Info,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Trash2,
  Inbox,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t("titles.notifications", undefined, "Notifications"), {
    description: t(
      "notifications.subtitle",
      undefined,
      "Stay updated with platform announcements and account alerts.",
    ),
  });

  const { session } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    dismissNotification,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "announcements">("all");

  const isAdmin =
    session?.user?.role === "admin" ||
    (session?.user as any)?.user_metadata?.role === "admin" ||
    String(session?.user?.id) === "1";

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    if (activeFilter === "announcements") {
      return notifications.filter((n) => n.target_type === "all");
    }
    return notifications;
  }, [notifications, activeFilter]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return t("notifications.justNow", undefined, "Just now");
    }
    if (diffMins < 60) {
      return `${diffMins}m ${t("notifications.ago", undefined, "ago")}`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ${t("notifications.ago", undefined, "ago")}`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ${t("notifications.ago", undefined, "ago")}`;
    }
    return date.toLocaleDateString();
  };

  const getTypeDetails = (type: string) => {
    switch (type) {
      case "announcement":
        return {
          icon: Megaphone,
          color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
          badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
          label: t("notifications.types.announcement", undefined, "Announcement"),
        };
      case "warning":
        return {
          icon: AlertTriangle,
          color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          label: t("notifications.types.warning", undefined, "Warning"),
        };
      case "success":
        return {
          icon: CheckCircle2,
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          label: t("notifications.types.success", undefined, "Success"),
        };
      case "alert":
        return {
          icon: AlertCircle,
          color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
          label: t("notifications.types.alert", undefined, "Alert"),
        };
      case "info":
      default:
        return {
          icon: Info,
          color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
          badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
          label: t("notifications.types.info", undefined, "Information"),
        };
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  {t("notifications.title", undefined, "Notifications")}
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-1 text-xs px-2 py-0.5 font-bold">
                      {unreadCount} {t("notifications.unreadBadge", undefined, "new")}
                    </Badge>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t(
                    "notifications.subtitle",
                    undefined,
                    "Stay updated with platform announcements and account alerts.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {unreadCount > 0 && session && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="gap-1.5 text-xs sm:text-sm h-9 border-border/60 hover:bg-muted/50"
              >
                <CheckCheck className="w-4 h-4 text-cyan-400" />
                <span>{t("notifications.markAllRead", undefined, "Mark all as read")}</span>
              </Button>
            )}

            {isAdmin && (
              <Link to="/admin/notifications">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs sm:text-sm h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
                >
                  <Shield className="w-4 h-4" />
                  <span>{t("notifications.adminCenter", undefined, "Manage Notifications")}</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeFilter === "all"
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <span>{t("notifications.filterAll", undefined, "All")}</span>
              <span className="text-[11px] opacity-75 px-1.5 py-0.2 rounded-full bg-background/50">
                {notifications.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter("unread")}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeFilter === "unread"
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <span>{t("notifications.filterUnread", undefined, "Unread")}</span>
              {unreadCount > 0 && (
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter("announcements")}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeFilter === "announcements"
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>{t("notifications.filterAnnouncements", undefined, "Announcements")}</span>
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-border/50 bg-card/30 flex flex-col items-center justify-center p-8">
            <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center text-muted-foreground mb-4 shadow-inner">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {activeFilter === "unread"
                ? t("notifications.noUnread", undefined, "No unread notifications")
                : t("notifications.emptyTitle", undefined, "No notifications yet")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              {activeFilter === "unread"
                ? t(
                    "notifications.allCaughtUp",
                    undefined,
                    "You've read all your notifications! Check the 'All' tab to see previous updates.",
                  )
                : t(
                    "notifications.emptyDesc",
                    undefined,
                    "You're completely up to date. Important announcements and account notifications will appear here.",
                  )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif: ClientNotification) => {
              const typeInfo = getTypeDetails(notif.type);
              const TypeIcon = typeInfo.icon;
              const isUnread = !notif.is_read;

              return (
                <Card
                  key={notif.id}
                  className={`transition-all duration-200 border ${
                    isUnread
                      ? "border-cyan-500/40 bg-cyan-500/[0.03] shadow-sm ring-1 ring-cyan-500/10"
                      : "border-border/60 bg-card/60 hover:border-border"
                  }`}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Type Icon */}
                      <div
                        className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${typeInfo.color}`}
                      >
                        <TypeIcon className="w-5 h-5" />
                      </div>

                      {/* Notification Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-semibold uppercase tracking-wider py-0.5 ${typeInfo.badgeColor}`}
                            >
                              {typeInfo.label}
                            </Badge>
                            {notif.target_type === "all" ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0 px-2 bg-muted/60 text-muted-foreground"
                              >
                                {t("notifications.globalBadge", undefined, "Global Announcement")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0 px-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              >
                                {t("notifications.directBadge", undefined, "Direct Message")}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimeAgo(notif.created_at)}</span>
                            {isUnread && (
                              <span
                                className="w-2 h-2 rounded-full bg-cyan-400 ml-1 inline-block"
                                title={t("notifications.unread", undefined, "Unread")}
                              />
                            )}
                          </div>
                        </div>

                        {/* Title & Message */}
                        <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight mb-1">
                          {notif.title}
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                          {notif.message}
                        </p>

                        {/* Action Link & Footer Controls */}
                        <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-border/30 flex-wrap">
                          <div>
                            {notif.action_url && (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                              >
                                {notif.action_url.startsWith("http") ? (
                                  <a
                                    href={notif.action_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <span>
                                      {t("notifications.viewLink", undefined, "Open Link")}
                                    </span>
                                    <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                                  </a>
                                ) : (
                                  <Link to={notif.action_url}>
                                    <span>
                                      {t("notifications.viewDetails", undefined, "View Details")}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                                  </Link>
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Read/Unread and Dismiss Controls (for authenticated users) */}
                          {session && (
                            <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                              {isUnread ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => markAsRead(notif.id)}
                                  className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                                  title={t("notifications.markAsRead", undefined, "Mark as read")}
                                >
                                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="hidden sm:inline">
                                    {t("notifications.markAsRead", undefined, "Mark as read")}
                                  </span>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => markAsUnread(notif.id)}
                                  className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                                  title={t("notifications.markAsUnread", undefined, "Mark as unread")}
                                >
                                  <span className="w-2 h-2 rounded-full border border-current mr-0.5" />
                                  <span className="hidden sm:inline">
                                    {t("notifications.markAsUnread", undefined, "Mark as unread")}
                                  </span>
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissNotification(notif.id)}
                                className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title={t("notifications.dismiss", undefined, "Dismiss")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="sr-only">
                                  {t("notifications.dismiss", undefined, "Dismiss")}
                                </span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
