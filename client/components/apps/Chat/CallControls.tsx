import { useChat } from "@/contexts/ChatContext";
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Monitor, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
    <div className="flex items-center justify-center gap-2 bg-slate-900/90 backdrop-blur-md p-2 px-4 rounded-full border border-slate-700/60 shadow-xl">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeCall.isAudioMuted ? "destructive" : "secondary"}
            size="icon"
            className="rounded-full h-10 w-10"
            onClick={toggleMute}
          >
            {activeCall.isAudioMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{activeCall.isAudioMuted ? "Unmute Mic" : "Mute Mic"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeCall.isVideoMuted ? "secondary" : "default"}
            size="icon"
            className="rounded-full h-10 w-10"
            onClick={toggleVideo}
          >
            {activeCall.isVideoMuted ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{activeCall.isVideoMuted ? "Turn on Camera" : "Turn off Camera"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeCall.isDeafened ? "destructive" : "secondary"}
            size="icon"
            className="rounded-full h-10 w-10"
            onClick={toggleDeafen}
          >
            {activeCall.isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{activeCall.isDeafened ? "Undeafen" : "Deafen"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={activeCall.isScreenSharing ? "default" : "secondary"}
            size="icon"
            className="rounded-full h-10 w-10"
            onClick={toggleScreenShare}
          >
            <Monitor className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{activeCall.isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}</TooltipContent>
      </Tooltip>

      <div className="w-[1px] h-6 bg-slate-700 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="destructive"
            size="icon"
            className="rounded-full h-10 w-10 bg-rose-600 hover:bg-rose-500"
            onClick={leaveCall}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Disconnect</TooltipContent>
      </Tooltip>
    </div>
  );
}
