import { useEffect, useState, useRef } from "react";
import { Diamond } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

export const PointsDisplay = () => {
  const { session } = useAuth();
  const [points, setPoints] = useState<number | null>(null);
  const [diff, setDiff] = useState<number | null>(null);
  const prevPointsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Initial fetch
    const fetchPoints = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("points")
        .eq("user_id", session.user.id)
        .single();

      if (!error && data) {
        setPoints(data.points);
        prevPointsRef.current = data.points;
      }
    };

    fetchPoints();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("points_updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const newPoints = payload.new.points;
          if (newPoints !== prevPointsRef.current) {
            const difference = newPoints - (prevPointsRef.current ?? newPoints);
            setDiff(difference);
            setPoints(newPoints);
            prevPointsRef.current = newPoints;

            // Reset diff after animation
            setTimeout(() => setDiff(null), 2000);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  if (points === null) return null;

  return (
    <div className="px-4 py-3 mb-2 flex items-center justify-between bg-slate-900/50 rounded-xl border border-slate-800 mx-4 mt-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-500/10 rounded-lg">
          <Diamond className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Points
          </p>
          <div className="relative flex items-center">
            <span className="text-xl font-bold text-white tabular-nums">
              {points.toLocaleString()}
            </span>
            <AnimatePresence>
              {diff !== null && (
                <motion.span
                  initial={{ opacity: 0, y: 0, x: 10 }}
                  animate={{ opacity: 1, y: -20, x: 20 }}
                  exit={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
                  transition={{ duration: 2 }}
                  className={`absolute left-full ml-2 font-bold whitespace-nowrap ${
                    diff > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
