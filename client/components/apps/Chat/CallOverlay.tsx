import { useEffect, useRef } from "react";
import { useChat } from "@/contexts/ChatContext";
import { CallControls } from "./CallControls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MicOff, VideoOff, Radio } from "lucide-react";
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
        "relative flex flex-col items-center justify-center bg-slate-950/95 rounded-2xl overflow-hidden border transition-all duration-300 aspect-video shadow-xl",
        isSpeaking
          ? "border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-500/20"
          : "border-slate-800/80 hover:border-slate-700"
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
          <div className="relative">
            <Avatar className="h-16 w-16 border-2 border-slate-700/80 shadow-2xl">
              <AvatarFallback className="bg-gradient-to-br from-cyan-900/60 to-indigo-900/60 text-cyan-300 text-xl font-bold">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isSpeaking && (
              <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
            )}
          </div>
          <span className="text-xs font-semibold text-slate-300 tracking-wide">{name}</span>
        </div>
      )}

      {/* Badges & Name overlay */}
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs text-white border border-slate-800/80 shadow-md">
        <span className="font-medium text-[11px]">{name}</span>
        {isLocal && <span className="text-cyan-400 font-mono text-[10px]">(You)</span>}
        {isMuted && <MicOff className="h-3 w-3 text-rose-400 ml-0.5" />}
        {isVideoOff && <VideoOff className="h-3 w-3 text-amber-400 ml-0.5" />}
      </div>

    </div>
  );
}

export function CallOverlay() {
  const { activeCall } = useChat();

  if (!activeCall) return null;

  return (
    <div className="relative flex flex-col bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-800/80 rounded-2xl p-4 gap-4 mb-4 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-full text-xs text-emerald-400 font-semibold font-mono">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
            <span>Live Studio: {activeCall.roomName}</span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            • {activeCall.peers.length + 1} Participant{activeCall.peers.length > 0 ? "s" : ""}
          </span>
        </div>

        <CallControls />
      </div>

      {/* Video / Audio Mesh Grid */}
      <div
        className={cn(
          "grid gap-3.5 w-full",
          activeCall.peers.length === 0
            ? "grid-cols-1 max-w-md mx-auto"
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
            name={peer.peerName || `Peer ${peer.peerId.slice(0, 4)}`}
            isMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoMuted}
            isSpeaking={peer.isSpeaking}
          />
        ))}
      </div>
    </div>
  );
}
