import { useEffect, useRef } from "react";
import { useChat, ChatMessage } from "@/contexts/ChatContext";
import { useAuth } from "@/hooks/useAuth";
import { CallOverlay } from "./CallOverlay";
import { MessageInput } from "./MessageInput";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Hash,
  Phone,
  Video,
  ShieldCheck,
  Lock,
  Smile,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function MessageArea() {
  const {
    servers,
    channels,
    dms,
    activeServerId,
    activeChannelId,
    messages,
    startCall,
    activeCall,
  } = useChat();

  const { session } = useAuth();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDm = dms.find((d) => d.id === activeChannelId);

  const otherUserId = activeDm?.participants.find((p) => p !== userId) || activeDm?.participants[0];
  const dmRecipientName = otherUserId ? activeDm?.recipient_names?.[otherUserId] || `User ${otherUserId.slice(0, 4)}` : "Friend";

  const isDm = activeServerId === "dms" || !!activeDm;
  const title = isDm ? dmRecipientName : activeChannel?.name || "general";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 bg-slate-950 h-full overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between h-14 px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          {isDm ? (
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/20 text-xs text-primary font-bold">
                {title.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Hash className="h-5 w-5 text-slate-400" />
          )}
          <span className="font-bold text-white text-base">{title}</span>

          {isDm && (
            <div className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-mono ml-2">
              <Lock className="h-3 w-3" />
              <span>E2EE Encrypted</span>
            </div>
          )}
        </div>

        {/* Action buttons (Call / Video Call) */}
        <div className="flex items-center gap-2">
          {isDm && activeChannelId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-emerald-400 hover:bg-slate-800 flex items-center gap-1.5"
                onClick={() => startCall(activeChannelId, title, false)}
              >
                <Phone className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-semibold">Start Voice Call</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-blue-400 hover:bg-slate-800 flex items-center gap-1.5"
                onClick={() => startCall(activeChannelId, title, true)}
              >
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-semibold">Start Video Call</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Call Video Grid if in call */}
        <CallOverlay />

        {/* Channel Welcome Message */}
        <div className="py-6 px-2 border-b border-slate-800/40 space-y-1 text-slate-400">
          <div className="p-3 bg-slate-900 rounded-full w-fit mb-2">
            {isDm ? <Lock className="h-6 w-6 text-emerald-400" /> : <Hash className="h-6 w-6 text-primary" />}
          </div>
          <h2 className="text-2xl font-bold text-white">
            {isDm ? `Direct chat with ${title}` : `Welcome to #${title}!`}
          </h2>
          <p className="text-sm">
            {isDm
              ? "All direct messages in this conversation are end-to-end encrypted with ECDH & AES-GCM."
              : `This is the start of the #${title} channel.`}
          </p>
        </div>

        {/* Messages List */}
        {messages.map((msg) => {
          const isMe = msg.sender_id === userId;
          const formattedTime = msg.created_at
            ? format(new Date(msg.created_at), "HH:mm")
            : "";

          return (
            <div
              key={msg.id}
              className="group flex gap-3 hover:bg-slate-900/40 -mx-4 px-4 py-1.5 rounded-lg transition-colors"
            >
              <Avatar className="h-9 w-9 mt-0.5 shrink-0">
                <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                  {(msg.sender_name || "User").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-white">
                    {msg.sender_name || "User"}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {formattedTime}
                  </span>
                  {msg.is_encrypted && (
                    <span className="text-[10px] text-emerald-400/90 flex items-center gap-0.5 bg-emerald-950/40 px-1 rounded border border-emerald-500/20 font-mono">
                      <Lock className="h-2.5 w-2.5" /> E2EE
                    </span>
                  )}
                </div>

                <div className="text-sm text-slate-200 mt-1 whitespace-pre-wrap break-words">
                  {msg.content}
                </div>

                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-slate-300"
                      >
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate max-w-[200px]">{att}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <MessageInput channelName={title} isDm={isDm} />
    </div>
  );
}
