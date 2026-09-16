import { useAuth } from "@/hooks/useAuth";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { MessageArea } from "./MessageArea";
import { IncomingCallModal } from "./IncomingCallModal";
import { Button } from "@/components/ui/button";
import { MessageSquare, Shield, Lock, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function ChatApp() {
  const { session } = useAuth();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-6 text-center bg-slate-950/60 border border-slate-800/80 rounded-2xl">
        <div className="p-4 bg-primary/10 rounded-2xl mb-4 border border-primary/20">
          <MessageSquare className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to Oxygen Low's Chat</h2>
        <p className="text-slate-400 max-w-md mb-6">
          Hang out with friends in custom servers, voice & video call directly peer-to-peer, and send end-to-end encrypted messages.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Sign In to Chat</Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 max-w-2xl text-left">
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
            <Users className="h-5 w-5 text-primary mb-2" />
            <h4 className="text-sm font-semibold text-white">Servers & Channels</h4>
            <p className="text-xs text-slate-400 mt-1">Organize your communities with dedicated text and voice spaces.</p>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
            <Lock className="h-5 w-5 text-emerald-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">End-to-End Encrypted</h4>
            <p className="text-xs text-slate-400 mt-1">Private chats encrypted client-side using ECDH and AES-256-GCM.</p>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
            <Shield className="h-5 w-5 text-blue-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">Direct P2P Calling</h4>
            <p className="text-xs text-slate-400 mt-1">High fidelity WebRTC mesh calls with cross-platform native ringing.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-[780px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <ServerList />
      <ChannelList />
      <MessageArea />
      <IncomingCallModal />
    </div>
  );
}
