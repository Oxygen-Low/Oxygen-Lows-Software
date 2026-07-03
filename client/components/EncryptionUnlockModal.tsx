import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { saveMasterKey, decrypt } from "@/lib/crypto";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface UnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

export const EncryptionUnlockModal = ({ isOpen, onClose, onUnlock }: UnlockModalProps) => {
  const { session } = useAuth();
  const [keyInput, setKeyInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [validationHashExists, setValidationHashExists] = useState<boolean | null>(null);

  const handleUnlock = async () => {
    if (!keyInput.trim() || !session?.user?.id) return;

    setIsVerifying(true);
    setError(null);
    try {
      // Validate key against validation_hash in user_preferences
      const { data, error: fetchError } = await supabase
        .from('user_preferences')
        .select('encryption_settings')
        .eq('user_id', session.user.id)
        .single();

      if (fetchError) throw fetchError;

      const validationHash = data?.encryption_settings?.validation_hash;
      if (validationHash) {
        setValidationHashExists(true);
        try {
          await decrypt(validationHash, keyInput.trim());
        } catch (e) {
          throw new Error("Invalid masterkey. Please check your key and try again.");
        }
      } else {
        setValidationHashExists(false);
        if (!needsConfirmation) {
          setNeedsConfirmation(true);
          return;
        }
      }

      saveMasterKey(keyInput.trim());
      onUnlock();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
        <div className="py-4 space-y-4">
          <Input
            type="password"
            placeholder="Enter Masterkey"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            className={`bg-slate-800 border-slate-700 ${error ? 'border-red-500 focus:border-red-500' : ''}`}
            autoFocus
            disabled={isVerifying}
          />
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          {needsConfirmation && !error && (
            <p className="text-xs text-amber-500 font-medium">
              No existing encryption found. This will be set as your new masterkey. Please ensure you have copied it correctly.
            </p>
          )}
        </div>
        <DialogFooter className="flex justify-end">
          <Button onClick={handleUnlock} disabled={isVerifying} className="bg-cyan-600 hover:bg-cyan-700">
            {isVerifying ? "Verifying..." : (needsConfirmation ? "Confirm & Set Key" : "Unlock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
