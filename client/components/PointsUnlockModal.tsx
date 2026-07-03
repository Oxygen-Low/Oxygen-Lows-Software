import { useState } from "react";
import { Diamond, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface PointsUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  itemName: string;
  cost: number;
  currentPoints: number;
}

export const PointsUnlockModal = ({
  isOpen,
  onClose,
  onSuccess,
  itemName,
  cost,
  currentPoints,
}: PointsUnlockModalProps) => {
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (currentPoints < cost) {
      toast.error("Not enough points!");
      return;
    }

    setIsUnlocking(true);
    try {
      const { error } = await supabase.rpc("adjust_points", {
        p_amount: -cost,
      });

      if (error) throw error;

      toast.success(`Successfully unlocked ${itemName}!`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Unlock error:", error);
      toast.error("Failed to unlock. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Lock className="w-5 h-5 text-cyan-400" />
            Unlock {itemName}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            This action requires {cost} points. You currently have {currentPoints} points.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-4 px-6 py-4 bg-slate-950 rounded-2xl border border-slate-800">
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 uppercase tracking-widest mb-1">Cost</span>
              <div className="flex items-center gap-2">
                <Diamond className="w-5 h-5 text-cyan-400" />
                <span className="text-2xl font-bold text-white">{cost}</span>
              </div>
            </div>
            <div className="w-px h-10 bg-slate-800" />
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 uppercase tracking-widest mb-1">Balance</span>
              <div className="flex items-center gap-2">
                <Diamond className="w-5 h-5 text-slate-400" />
                <span className="text-2xl font-bold text-slate-300">{currentPoints}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-center gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUnlock}
            disabled={isUnlocking || currentPoints < cost}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-8"
          >
            {isUnlocking ? "Unlocking..." : "Unlock Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
