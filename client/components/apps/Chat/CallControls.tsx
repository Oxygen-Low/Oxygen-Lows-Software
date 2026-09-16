import { useChat } from "@/contexts/ChatContext";
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Monitor, PhoneOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CallControls() {
  const {
    activeCall,
    toggleMute,
    toggleVideo,
    toggleDeafen,
    toggleScreenShare,
    leaveCall,
  } = useChat();

  if (!activeCall) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-slate-900/95 backdrop-blur-xl p-1.5 px-3.5 rounded-2xl border border-slate-700/60 shadow-2xl">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-center rounded-xl h-9 w-9 transition-all duration-200",
              activeCall.isAudioMuted
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            )}
            onClick={toggleMute}
          >
            {activeCall.isAudioMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-xs">{activeCall.isAudioMuted ? "Unmute Mic" : "Mute Mic"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-center rounded-xl h-9 w-9 transition-all duration-200",
              activeCall.isVideoMuted
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
            )}
            onClick={toggleVideo}
          >
            {activeCall.isVideoMuted ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-xs">{activeCall.isVideoMuted ? "Turn on Camera" : "Turn off Camera"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-center rounded-xl h-9 w-9 transition-all duration-200",
              activeCall.isDeafened
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            )}
            onClick={toggleDeafen}
          >
            {activeCall.isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-xs">{activeCall.isDeafened ? "Undeafen" : "Deafen"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "flex items-center justify-center rounded-xl h-9 w-9 transition-all duration-200",
              activeCall.isScreenSharing
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            )}
            onClick={toggleScreenShare}
          >
            <Monitor className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-xs">{activeCall.isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}</TooltipContent>
      </Tooltip>

      <div className="w-[1px] h-5 bg-slate-700/80 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center justify-center rounded-xl h-9 w-9 bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all duration-200"
            onClick={leaveCall}
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-xs font-semibold text-rose-400">Disconnect</TooltipContent>
      </Tooltip>
    </div>
  );
}
