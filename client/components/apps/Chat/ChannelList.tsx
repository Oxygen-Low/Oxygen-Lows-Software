import { useState } from "react";
import { useChat, ChatChannel } from "@/contexts/ChatContext";
import { useAuth } from "@/hooks/useAuth";
import {
  Hash,
  Volume2,
  Plus,
  MessageSquare,
  Phone,
  Video,
  Mic,
  MicOff,
  Headphones,
  Shield,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ChannelList() {
  const {
    servers,
    channels,
    dms,
    activeServerId,
    activeChannelId,
    setActiveChannelId,
    createChannel,
    startDm,
    startCall,
    joinVoiceChannel,
    activeCall,
    toggleMute,
    toggleDeafen,
  } = useChat();

  const { session } = useAuth();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const username = session?.user?.user_metadata?.username || session?.user?.email?.split("@")[0] || "User";

  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");

  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [dmFriendId, setDmFriendId] = useState("");
  const [dmFriendName, setDmFriendName] = useState("");

  const activeServer = servers.find((s) => s.id === activeServerId);
  const serverChannels = channels.filter((c) => c.server_id === activeServerId);
  const textChannels = serverChannels.filter((c) => c.type === "text");
  const voiceChannels = serverChannels.filter((c) => c.type === "voice");

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !activeServerId || activeServerId === "dms") return;
    await createChannel(activeServerId, newChannelName.trim(), newChannelType);
    setNewChannelName("");
    setIsAddChannelOpen(false);
  };

  const handleStartDm = async () => {
    if (!dmFriendId.trim()) return;
    await startDm(dmFriendId.trim(), dmFriendName.trim() || "Friend");
    setDmFriendId("");
    setDmFriendName("");
    setIsNewDmOpen(false);
  };

  return (
    <div className="flex flex-col w-60 bg-slate-900/90 border-r border-slate-800/80 shrink-0 select-none h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-slate-800/80 font-bold text-white shadow-sm">
        <span className="truncate">
          {activeServerId === "dms" ? "Direct Messages" : activeServer?.name || "Server"}
        </span>
        {activeServerId !== "dms" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={() => setIsAddChannelOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Main Channel / DM list */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {activeServerId === "dms" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Conversations
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-slate-400 hover:text-white"
                onClick={() => setIsNewDmOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {dms.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-500 text-center">
                No direct messages yet. Start a chat with a friend!
              </div>
            ) : (
              dms.map((dm) => {
                const isActive = activeChannelId === dm.id;
                const otherUserId = dm.participants.find((p) => p !== userId) || dm.participants[0];
                const recipientName = dm.recipient_names?.[otherUserId] || `User ${otherUserId.slice(0, 4)}`;

                return (
                  <div
                    key={dm.id}
                    className={cn(
                      "group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-all cursor-pointer",
                      isActive
                        ? "bg-slate-800 text-white font-medium shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    )}
                    onClick={() => setActiveChannelId(dm.id)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="bg-primary/20 text-[10px] text-primary">
                          {recipientName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{recipientName}</span>
                      <Lock className="h-3 w-3 text-emerald-400/80 shrink-0" />
                    </div>

                    <div className="hidden group-hover:flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-emerald-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          startCall(dm.id, recipientName, false);
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-blue-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          startCall(dm.id, recipientName, true);
                        }}
                      >
                        <Video className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Text Channels */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Text Channels
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-slate-400 hover:text-white"
                  onClick={() => {
                    setNewChannelType("text");
                    setIsAddChannelOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {textChannels.map((channel) => {
                const isActive = activeChannelId === channel.id;
                return (
                  <button
                    key={channel.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-all text-left",
                      isActive
                        ? "bg-slate-800 text-white font-medium shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    )}
                    onClick={() => setActiveChannelId(channel.id)}
                  >
                    <Hash className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="truncate">{channel.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Voice Channels */}
            <div className="space-y-1 pt-2">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Voice Channels
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-slate-400 hover:text-white"
                  onClick={() => {
                    setNewChannelType("voice");
                    setIsAddChannelOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {voiceChannels.map((channel) => {
                const isConnected = activeCall?.roomId === channel.id;
                return (
                  <button
                    key={channel.id}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-all text-left",
                      isConnected
                        ? "bg-emerald-950/40 text-emerald-400 font-medium border border-emerald-500/30"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    )}
                    onClick={() => joinVoiceChannel(channel)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Volume2 className={cn("h-4 w-4 shrink-0", isConnected ? "text-emerald-400" : "text-slate-500")} />
                      <span className="truncate">{channel.name}</span>
                    </div>
                    {isConnected && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono">
                        Connected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* User Footer / Controls */}
      <div className="flex items-center justify-between h-14 px-3 bg-slate-950/80 border-t border-slate-800/80">
        <div className="flex items-center gap-2 truncate">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
          </div>
          <div className="flex flex-col truncate leading-tight">
            <span className="text-xs font-semibold text-white truncate">{username}</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
              <Shield className="h-2.5 w-2.5" /> E2EE Ready
            </span>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", activeCall?.isAudioMuted ? "text-rose-400" : "text-slate-400 hover:text-white")}
            onClick={toggleMute}
          >
            {activeCall?.isAudioMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", activeCall?.isDeafened ? "text-rose-400" : "text-slate-400 hover:text-white")}
            onClick={toggleDeafen}
          >
            <Headphones className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={isAddChannelOpen} onOpenChange={setIsAddChannelOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create Channel</DialogTitle>
            <DialogDescription className="text-slate-400">
              in {activeServer?.name || "Server"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Channel Type
              </Label>
              <RadioGroup
                value={newChannelType}
                onValueChange={(val: any) => setNewChannelType(val)}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800 cursor-pointer">
                  <RadioGroupItem value="text" id="text" />
                  <Label htmlFor="text" className="cursor-pointer flex items-center gap-1.5 text-sm">
                    <Hash className="h-4 w-4 text-slate-400" /> Text
                  </Label>
                </div>
                <div className="flex items-center space-x-2 bg-slate-950 p-3 rounded-lg border border-slate-800 cursor-pointer">
                  <RadioGroupItem value="voice" id="voice" />
                  <Label htmlFor="voice" className="cursor-pointer flex items-center gap-1.5 text-sm">
                    <Volume2 className="h-4 w-4 text-slate-400" /> Voice
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Channel Name
              </Label>
              <Input
                placeholder="new-channel"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddChannelOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChannel} disabled={!newChannelName.trim()}>
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Direct Message Dialog */}
      <Dialog open={isNewDmOpen} onOpenChange={setIsNewDmOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Direct Message</DialogTitle>
            <DialogDescription className="text-slate-400">
              Start an end-to-end encrypted direct chat with a friend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Friend User ID
              </Label>
              <Input
                placeholder="e.g. user_12345"
                value={dmFriendId}
                onChange={(e) => setDmFriendId(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Display Name (Optional)
              </Label>
              <Input
                placeholder="Friend's Name"
                value={dmFriendName}
                onChange={(e) => setDmFriendName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartDm()}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewDmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartDm} disabled={!dmFriendId.trim()}>
              Start Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
