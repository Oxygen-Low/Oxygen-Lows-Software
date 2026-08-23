import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle(t("titles.notFound", undefined, "Page Not Found"), {
    description: t("notFound.subtitle", undefined, "Page not found"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          {t("notFound.title", undefined, "Page not found")}
        </p>
        <Button asChild>
          <Link to="/">{t("notFound.returnHome", undefined, "Back")}</Link>
        </Button>
      </div>
    </div>
  );
}
