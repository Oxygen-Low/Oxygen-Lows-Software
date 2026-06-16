import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { saveMasterKey } from "@/lib/crypto";

interface UnlockModalProps {
  isOpen: boolean;
  onUnlock: () => void;
}

export const UnlockModal = ({ isOpen, onUnlock }: UnlockModalProps) => {
  const [keyInput, setKeyInput] = useState('');

  const handleUnlock = () => {
    if (keyInput.trim()) {
      saveMasterKey(keyInput.trim());
      onUnlock();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-500" />
            Unlock Encrypted Content
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Enter your masterkey to access your encrypted data. This key is never stored on our servers.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            type="password"
            placeholder="Enter Masterkey"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            className="bg-slate-800 border-slate-700"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={handleUnlock} className="bg-cyan-600 hover:bg-cyan-700 w-full">
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
