import { useNavigate, Link } from "react-router-dom";
import { LifeBuoy, ShieldCheck, ClipboardList, Trophy, Bell } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function AdminPanel() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  usePageTitle(t("titles.admin", undefined, "Admin Panel"), {
    description: t(
      "admin.subtitle",
      undefined,
      "Select an application to manage system resources.",
    ),
  });

  const apps = [
    {
      title: t("admin.notificationsTitle", undefined, "Notifications"),
      description: t(
        "admin.notificationsDesc",
        undefined,
        "Broadcast system announcements and send targeted user notifications.",
      ),
      icon: Bell,
      href: "/admin/notifications",
      color: "text-rose-500",
    },
    {
      title: t("admin.supportTitle", undefined, "Support"),
      description: t(
        "admin.supportDesc",
        undefined,
        "Manage and respond to user support tickets.",
      ),
      icon: LifeBuoy,
      href: "/admin/support",
      color: "text-blue-500",
    },
    {
      title: t("admin.verificationTitle", undefined, "Asset Verification"),
      description: t(
        "admin.verificationDesc",
        undefined,
        "Review, approve, or deny public assets and multiplayer verification requests.",
      ),
      icon: ShieldCheck,
      href: "/admin/verification",
      color: "text-cyan-500",
    },
    {
      title: t("admin.surveysTitle", undefined, "Surveys Management"),
      description: t(
        "admin.surveysDesc",
        undefined,
        "Create, configure, and monitor community and monthly surveys.",
      ),
      icon: ClipboardList,
      href: "/admin/surveys",
      color: "text-purple-500",
    },
    {
      title: t("admin.awardsTitle", undefined, "Awards Management"),
      description: t(
        "admin.awardsDesc",
        undefined,
        "Create, configure, and monitor software awards.",
      ),
      icon: Trophy,
      href: "/admin/awards",
      color: "text-yellow-500",
    },
  ];

  return (
    <Layout>
      <div className="min-h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {t("admin.title", undefined, "Admin Control Panel")}
          </h1>
          <p className="text-slate-500 mt-2">
            {t(
              "admin.subtitle",
              undefined,
              "Select an application to manage system resources.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <Link to={app.href} key={app.href} className="block">
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow border-slate-200 bg-white h-full"
                >
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                    <div className={`p-3 rounded-lg bg-slate-50 ${app.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-slate-900">
                        {app.title}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-slate-600 text-sm">
                      {app.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
