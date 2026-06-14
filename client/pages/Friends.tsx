import { Layout } from "@/components/Layout";
import { FriendsApp } from "@/components/apps/Friends";
import { useTranslation } from "react-i18next";

export default function Friends() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-white">{t('nav.friends')}</h2>
          <p className="text-slate-400">{t('friends.social')}</p>
        </div>
        <FriendsApp />
      </div>
    </Layout>
  );
}
