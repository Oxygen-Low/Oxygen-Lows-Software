import { useNavigate } from "react-router-dom";
import { LifeBuoy, Settings, Users, Database } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function AdminPanel() {
  const navigate = useNavigate();

  const apps = [
    {
      title: "Support",
      description: "Manage and respond to user support tickets.",
      icon: LifeBuoy,
      href: "/admin/support",
      color: "text-blue-500",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-200 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Admin Control Panel
        </h1>
        <p className="text-slate-500 mt-2">
          Select an application to manage system resources.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <Card
              key={app.title}
              className="cursor-pointer hover:shadow-md transition-shadow border-slate-200 bg-white"
              onClick={() => navigate(app.href)}
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
          );
        })}
      </div>
    </div>
  );
}
