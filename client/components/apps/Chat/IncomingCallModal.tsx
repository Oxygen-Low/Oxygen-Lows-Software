import { useChat } from "@/contexts/ChatContext";
import { Phone, PhoneOff, Video } from "lucide-react";
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
      <DialogContent className="sm:max-w-md border-primary/40 bg-slate-900/95 text-white backdrop-blur-xl shadow-2xl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Incoming Call
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {incomingCall.isVideo ? "Incoming Video Call" : "Incoming Voice Call"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 gap-4">
          <div className="relative">
            <div className="absolute -inset-2 rounded-full bg-primary/20 animate-pulse" />
            <Avatar className="h-24 w-24 border-2 border-primary/50 shadow-lg">
              <AvatarFallback className="bg-primary/20 text-2xl font-bold text-primary">
                {incomingCall.callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold text-white">{incomingCall.callerName}</h3>
            <p className="text-sm text-emerald-400 animate-pulse mt-1">Ringing...</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="destructive"
            size="lg"
            className="rounded-full w-14 h-14 p-0 shadow-lg hover:bg-rose-600 bg-rose-700"
            onClick={declineIncomingCall}
          >
            <PhoneOff className="h-6 w-6" />
          </Button>

          <Button
            size="lg"
            className="rounded-full w-14 h-14 p-0 shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => acceptIncomingCall(false)}
          >
            <Phone className="h-6 w-6" />
          </Button>

          {incomingCall.isVideo && (
            <Button
              size="lg"
              className="rounded-full w-14 h-14 p-0 shadow-lg bg-blue-600 hover:bg-blue-500 text-white"
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
