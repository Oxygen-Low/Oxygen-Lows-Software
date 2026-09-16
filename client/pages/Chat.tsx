import { Layout } from "@/components/Layout";
import { ChatApp } from "@/components/apps/Chat";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Chat() {
  const { t } = useTranslation();
  usePageTitle(t("titles.chat", undefined, "Chat"), {
    description: t(
      "chat.subtitle",
      undefined,
      "Chat with friends, hang out in servers, and make direct voice & video calls.",
    ),
  });

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {t("chat.title", undefined, "Chat")}
          </h1>
          <p className="text-slate-400">
            {t(
              "chat.subtitle",
              undefined,
              "Chat with friends, hang out in servers, and make direct voice & video calls.",
            )}
          </p>
        </div>
        <ChatApp />
      </div>
    </Layout>
  );
}
