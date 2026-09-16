import { useAuth } from "@/hooks/useAuth";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { MessageArea } from "./MessageArea";
import { IncomingCallModal } from "./IncomingCallModal";
import { Button } from "@/components/ui/button";
import { MessageSquare, Shield, Lock, Users, Sparkles, Radio } from "lucide-react";
import { Link } from "react-router-dom";

export function ChatApp() {
  const { session } = useAuth();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-8 text-center bg-gradient-to-b from-slate-950/80 to-slate-900/40 border border-slate-800/80 rounded-3xl backdrop-blur-xl shadow-2xl">
        <div className="p-4 bg-gradient-to-br from-cyan-500/20 via-blue-500/20 to-indigo-500/20 rounded-3xl mb-6 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
          <MessageSquare className="h-12 w-12 text-cyan-400" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-3 tracking-tight">
          Oxygen Low's Chat & Live Spaces
        </h2>
        <p className="text-slate-400 max-w-lg mb-8 text-sm leading-relaxed">
          Communicate securely with friends in custom spaces, enjoy high-fidelity direct peer-to-peer voice and video calls, and exchange end-to-end encrypted messages.
        </p>
        <div className="flex items-center gap-4">
          <Button asChild size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-2xl px-6 shadow-lg shadow-cyan-500/25">
            <Link to="/auth">Sign In to Start Chatting</Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-12 max-w-3xl text-left">
          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
            <Users className="h-6 w-6 text-cyan-400 mb-2.5" />
            <h4 className="text-sm font-bold text-white">Custom Spaces & Rooms</h4>
            <p className="text-xs text-slate-400 mt-1.5 leading-normal">Organize your communities with dedicated text discussions and voice rooms.</p>
          </div>
          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
            <Lock className="h-6 w-6 text-emerald-400 mb-2.5" />
            <h4 className="text-sm font-bold text-white">End-to-End Encrypted</h4>
            <p className="text-xs text-slate-400 mt-1.5 leading-normal">Client-side Web Crypto (ECDH + AES-256-GCM) ensures zero-knowledge message privacy.</p>
          </div>
          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
            <Radio className="h-6 w-6 text-indigo-400 mb-2.5" />
            <h4 className="text-sm font-bold text-white">Direct P2P Calling</h4>
            <p className="text-xs text-slate-400 mt-1.5 leading-normal">Peer-to-peer WebRTC media streaming with screen sharing and cross-platform native ringing.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-[780px] bg-slate-950/90 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-2xl">
      <ServerList />
      <ChannelList />
      <MessageArea />
      <IncomingCallModal />
    </div>
  );
}
