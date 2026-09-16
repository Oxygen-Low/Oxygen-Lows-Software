import { useChat } from "@/contexts/ChatContext";
import { Phone, PhoneOff, Video, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useChat();

  if (!incomingCall) return null;

  return (
    <Dialog open={!!incomingCall} onOpenChange={(open) => !open && declineIncomingCall()}>
      <DialogContent className="sm:max-w-md border-cyan-500/40 bg-slate-900/95 text-white backdrop-blur-2xl shadow-2xl rounded-3xl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-bold flex items-center justify-center gap-2 text-white">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            Incoming Call
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {incomingCall.isVideo ? "Direct P2P Video Call" : "Direct P2P Voice Call"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 gap-4">
          <div className="relative">
            <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 animate-pulse blur-md" />
            <Avatar className="h-24 w-24 border-2 border-cyan-400/60 shadow-2xl">
              <AvatarFallback className="bg-gradient-to-br from-cyan-900 to-indigo-900 text-2xl font-bold text-cyan-300">
                {incomingCall.callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-white tracking-wide">{incomingCall.callerName}</h3>
            <p className="text-xs text-cyan-400 animate-pulse font-mono flex items-center justify-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Direct P2P Encrypted
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5 pt-2">
          <Button
            variant="destructive"
            size="lg"
            className="rounded-2xl w-14 h-14 p-0 shadow-lg hover:bg-rose-600 bg-rose-700 transition-all hover:scale-105"
            onClick={declineIncomingCall}
          >
            <PhoneOff className="h-6 w-6" />
          </Button>

          <Button
            size="lg"
            className="rounded-2xl w-14 h-14 p-0 shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:scale-105"
            onClick={() => acceptIncomingCall(false)}
          >
            <Phone className="h-6 w-6" />
          </Button>

          {incomingCall.isVideo && (
            <Button
              size="lg"
              className="rounded-2xl w-14 h-14 p-0 shadow-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition-all hover:scale-105"
              onClick={() => acceptIncomingCall(true)}
            >
              <Video className="h-6 w-6" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
