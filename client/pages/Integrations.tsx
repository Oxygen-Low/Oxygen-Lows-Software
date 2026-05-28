import { Layout } from "@/components/Layout";
import { Navigate } from "react-router-dom";

export default function Integrations() {
  const isPublicMode = import.meta.env.VITE_PUBLIC_MODE === "true";

  if (isPublicMode) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-slate-200">Server Integrations</h2>
    </Layout>
  );
}
