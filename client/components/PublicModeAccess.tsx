import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface PublicModeAccessProps {
  children: ReactNode;
}

export const PublicModeAccess = ({ children }: PublicModeAccessProps) => {
  const isPublicMode = import.meta.env.VITE_PUBLIC_MODE === "true";
  const { toast } = useToast();

  useEffect(() => {
    if (isPublicMode) {
      toast({
        title: "Unable to access in public servers",
        variant: "destructive",
      });
    }
  }, [isPublicMode, toast]);

  if (isPublicMode) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
