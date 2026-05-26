import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";

export default function Account() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!session?.user?.email) {
      toast({
        title: "Error",
        description: "No email found in session",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        session.user.email,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Password reset link sent to your email",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send reset link";
      toast({
        title: "Error",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-8">Account Settings</h2>

        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 space-y-8">
          {/* Email Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">Email Address</label>
            <div className="bg-slate-950 rounded-lg border border-slate-700 px-4 py-3">
              <p className="text-slate-200">{session?.user?.email || "Loading..."}</p>
            </div>
          </div>

          {/* Password Reset Section */}
          <div className="border-t border-slate-800 pt-8">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <p className="text-sm text-slate-400">
                Update your password to keep your account secure.
              </p>
              <button
                onClick={handleResetPassword}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-blue-500/30 transition duration-200 text-sm font-medium"
              >
                <Lock className="w-4 h-4" />
                {isLoading ? "Sending..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
