import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/contexts/LanguageContext";

export default function Download() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">{t("download.title", undefined, "Download")}</h1>
          <p className="text-lg text-slate-400">
            {t("download.subtitle", undefined, "Get Oxygen Low's Software for your device")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all">
            <CardHeader>
              <Monitor className="w-12 h-12 text-cyan-400 mb-4" />
              <CardTitle className="text-2xl text-white">{t("download.windowsTitle", undefined, "Windows")}</CardTitle>
              <CardDescription className="text-slate-400">
                {t("download.windowsDesc", undefined, "Full desktop experience with all features")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
                <a href="https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware_Installer.exe">
                  {t("download.downloadDesktop", undefined, "Download Desktop App")}
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all">
            <CardHeader>
              <Smartphone className="w-12 h-12 text-cyan-400 mb-4" />
              <CardTitle className="text-2xl text-white">{t("download.androidTitle", undefined, "Android")}</CardTitle>
              <CardDescription className="text-slate-400">
                {t("download.androidDesc", undefined, "Mobile experience with all features")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
                <a href="https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware.apk">
                  {t("download.downloadAndroid", undefined, "Download Android App")}
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
