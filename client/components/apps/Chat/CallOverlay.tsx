import { useEffect, useRef } from "react";
import { useChat } from "@/contexts/ChatContext";
import { CallControls } from "./CallControls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MicOff, VideoOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function VideoStreamTile({
  stream,
  name,
  isMuted,
  isVideoOff,
  isSpeaking,
  isLocal,
}: {
  stream: MediaStream | null;
  name: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isSpeaking?: boolean;
  isLocal?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideoTracks = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks().some((t) => t.enabled);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center bg-slate-950 rounded-xl overflow-hidden border transition-all aspect-video shadow-md",
        isSpeaking ? "border-emerald-500 ring-2 ring-emerald-500/50" : "border-slate-800"
      )}
    >
      {hasVideoTracks && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn("w-full h-full object-cover", isLocal && "scale-x-[-1]")}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Avatar className="h-16 w-16 border-2 border-slate-700 shadow-inner">
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-slate-300">{name}</span>
        </div>
      )}

      {/* Badges & Name overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md text-xs text-white">
        <span>{name}</span>
        {isLocal && <span className="text-slate-400 font-mono text-[10px]">(You)</span>}
        {isMuted && <MicOff className="h-3 w-3 text-rose-400 ml-1" />}
        {isVideoOff && <VideoOff className="h-3 w-3 text-amber-400 ml-1" />}
      </div>

      {/* P2P Direct WebRTC badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-950/70 border border-emerald-500/30 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] text-emerald-400">
        <ShieldCheck className="h-2.5 w-2.5" />
        <span>P2P Direct</span>
      </div>
    </div>
  );
}

export function CallOverlay() {
  const { activeCall } = useChat();

  if (!activeCall) return null;

  return (
    <div className="relative flex flex-col bg-slate-900/60 border border-slate-800 rounded-xl p-4 gap-4 mb-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-white text-sm">Voice/Video Call: {activeCall.roomName}</span>
          <span className="text-xs text-slate-400">
            ({activeCall.peers.length + 1} connected)
          </span>
        </div>

        <CallControls />
      </div>

      {/* Video / Audio Mesh Grid */}
      <div
        className={cn(
          "grid gap-3 w-full",
          activeCall.peers.length === 0
            ? "grid-cols-1 max-w-sm mx-auto"
            : activeCall.peers.length === 1
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
        )}
      >
        {/* Local user tile */}
        <VideoStreamTile
          stream={activeCall.localStream}
          name="You"
          isLocal={true}
          isMuted={activeCall.isAudioMuted}
          isVideoOff={activeCall.isVideoMuted}
        />

        {/* Remote peer tiles */}
        {activeCall.peers.map((peer) => (
          <VideoStreamTile
            key={peer.peerId}
            stream={peer.stream}
            name={peer.peerName || `User ${peer.peerId.slice(0, 4)}`}
            isMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoMuted}
            isSpeaking={peer.isSpeaking}
          />
        ))}
      </div>
    </div>
  );
}
