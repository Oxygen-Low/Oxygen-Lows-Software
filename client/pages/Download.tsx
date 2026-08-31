import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

const DEFAULT_WINDOWS_DOWNLOAD_URL =
  "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware_Installer.exe";
const DEFAULT_ANDROID_DOWNLOAD_URL =
  "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware.apk";

export default function Download() {
  const { t } = useTranslation();
  usePageTitle(t("titles.download", undefined, "Download"), {
    description: t(
      "download.subtitle",
      undefined,
      "Get Oxygen Low's Software for your device",
    ),
  });

  const [windowsUrl, setWindowsUrl] = useState(DEFAULT_WINDOWS_DOWNLOAD_URL);
  const [androidUrl, setAndroidUrl] = useState(DEFAULT_ANDROID_DOWNLOAD_URL);

  useEffect(() => {
    let isMounted = true;

    async function resolveLatestValidAssets() {
      try {
        const response = await fetch(
          "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases",
        );
        if (!response.ok) return;

        const releases = await response.json();
        if (!Array.isArray(releases)) return;

        let resolvedWindowsUrl: string | null = null;
        let resolvedAndroidUrl: string | null = null;

        for (const release of releases) {
          if (release.draft) continue;
          const assets = Array.isArray(release.assets) ? release.assets : [];

          if (!resolvedWindowsUrl) {
            const exeAsset = assets.find(
              (asset: any) =>
                typeof asset.name === "string" &&
                asset.name.toLowerCase().endsWith(".exe"),
            );
            if (exeAsset?.browser_download_url) {
              resolvedWindowsUrl = exeAsset.browser_download_url;
            }
          }

          if (!resolvedAndroidUrl) {
            const apkAsset = assets.find(
              (asset: any) =>
                typeof asset.name === "string" &&
                asset.name.toLowerCase().endsWith(".apk"),
            );
            if (apkAsset?.browser_download_url) {
              resolvedAndroidUrl = apkAsset.browser_download_url;
            }
          }

          if (resolvedWindowsUrl && resolvedAndroidUrl) {
            break;
          }
        }

        if (isMounted) {
          if (resolvedWindowsUrl) setWindowsUrl(resolvedWindowsUrl);
          if (resolvedAndroidUrl) setAndroidUrl(resolvedAndroidUrl);
        }
      } catch {
        // Keep default URLs on network failure or rate limit
      }
    }

    resolveLatestValidAssets();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            {t("download.title", undefined, "Download")}
          </h1>
          <p className="text-lg text-slate-400">
            {t(
              "download.subtitle",
              undefined,
              "Get Oxygen Low's Software for your device",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all">
            <CardHeader>
              <Monitor className="w-12 h-12 text-cyan-400 mb-4" />
              <CardTitle className="text-2xl text-white">
                {t("download.windowsTitle", undefined, "Windows")}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {t(
                  "download.windowsDesc",
                  undefined,
                  "Full desktop experience with all features",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                <a href={windowsUrl}>
                  {t(
                    "download.downloadDesktop",
                    undefined,
                    "Download Desktop App",
                  )}
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all">
            <CardHeader>
              <Smartphone className="w-12 h-12 text-cyan-400 mb-4" />
              <CardTitle className="text-2xl text-white">
                {t("download.androidTitle", undefined, "Android")}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {t(
                  "download.androidDesc",
                  undefined,
                  "Mobile experience with all features",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                <a href={androidUrl}>
                  {t(
                    "download.downloadAndroid",
                    undefined,
                    "Download Android App",
                  )}
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
