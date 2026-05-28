import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface PublicModeAccessProps {
  children: ReactNode;
}

export const PublicModeAccess = ({ children }: PublicModeAccessProps) => {
  const { session } = useAuth();
  const isPublicMode = import.meta.env.VITE_PUBLIC_MODE === "true";
  const isAdmin = session?.user?.email === "info@danielward.xyz" && session?.user?.user_metadata?.username === "oxygen-low";
  const { toast } = useToast();

  useEffect(() => {
    if (isPublicMode && !isAdmin) {
      toast({
        title: "Unable to access in public servers",
        variant: "destructive",
      });
    }
  }, [isPublicMode, isAdmin, toast]);

  if (isPublicMode && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
