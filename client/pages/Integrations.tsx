import { Layout } from "@/components/Layout";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function Integrations() {
  const { session } = useAuth();
  const isPublicMode = import.meta.env.VITE_PUBLIC_MODE === "true";
  const isAdmin = session?.user?.email === "info@danielward.xyz" && session?.user?.user_metadata?.username === "oxygen-low";

  if (isPublicMode && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-slate-200">Server Integrations</h2>
    </Layout>
  );
}
