import { Layout } from "@/components/Layout";
import { FriendsApp } from "@/components/apps/Friends";

export default function Friends() {
  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Friends
          </h2>
          <p className="text-slate-400">Social</p>
        </div>
        <FriendsApp />
      </div>
    </Layout>
  );
}
