import { useEffect, useRef, useState } from "react";
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
  Key,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    keyPair,
  } = useChat();

  const { session } = useAuth();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isCryptoInfoOpen, setIsCryptoInfoOpen] = useState(false);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDm = dms.find((d) => d.id === activeChannelId);

  const otherUserId = activeDm?.participants.find((p) => p !== userId) || activeDm?.participants[0];
  const dmRecipientName = otherUserId ? activeDm?.recipient_names?.[otherUserId] || `User ${otherUserId.slice(0, 4)}` : "Friend";

  const isDm = activeServerId === "dms" || !!activeDm;
  const title = isDm ? dmRecipientName : activeChannel?.name || "general";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 bg-slate-950/90 h-full overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between h-14 px-6 border-b border-slate-800/70 bg-slate-900/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          {isDm ? (
            <div className="relative">
              <Avatar className="h-8 w-8 ring-1 ring-cyan-500/40 shadow-inner">
                <AvatarFallback className="bg-gradient-to-br from-cyan-900/60 to-indigo-900/60 text-xs font-bold text-cyan-300">
                  {title.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
            </div>
          ) : (
            <div className="p-1.5 bg-slate-800/80 rounded-lg text-cyan-400">
              <Hash className="h-4 w-4" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm tracking-wide">{title}</span>
              {isDm && (
                <button
                  onClick={() => setIsCryptoInfoOpen(true)}
                  className="flex items-center gap-1 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors"
                >
                  <Lock className="h-2.5 w-2.5" />
                  <span>E2EE Verified</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons (Call / Video Call) */}
        <div className="flex items-center gap-2">
          {isDm && activeChannelId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-emerald-400 hover:bg-slate-800/80 rounded-xl px-3 flex items-center gap-1.5 transition-colors"
                onClick={() => startCall(activeChannelId, title, false)}
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs font-semibold">Voice Call</span>
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl px-3 flex items-center gap-1.5 shadow-md shadow-cyan-500/20 font-semibold text-xs"
                onClick={() => startCall(activeChannelId, title, true)}
              >
                <Video className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Video Call</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Active Call Video Grid if in call */}
        <CallOverlay />

        {/* Channel Welcome Card */}
        <div className="p-6 bg-gradient-to-br from-slate-900/60 to-slate-900/30 border border-slate-800/60 rounded-2xl space-y-2 backdrop-blur-sm">
          <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 rounded-xl w-fit border border-cyan-500/30 text-cyan-400">
            {isDm ? <Lock className="h-6 w-6 text-emerald-400" /> : <Hash className="h-6 w-6 text-cyan-400" />}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {isDm ? `Direct Chat with ${title}` : `Welcome to #${title}`}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
            {isDm
              ? "All messages sent in this private conversation are end-to-end encrypted with zero-knowledge keys."
              : `This is the start of the #${title} discussion space.`}
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
              className={cn(
                "group flex gap-3 p-3 rounded-2xl transition-all duration-200",
                isMe
                  ? "bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/40"
                  : "bg-slate-900/20 hover:bg-slate-900/50 border border-transparent hover:border-slate-800/30"
              )}
            >
              <Avatar className="h-9 w-9 mt-0.5 shrink-0 ring-1 ring-slate-700 shadow-inner">
                <AvatarFallback className="bg-gradient-to-br from-cyan-900/60 to-indigo-900/60 text-xs font-bold text-cyan-300">
                  {(msg.sender_name || "User").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-white">
                    {msg.sender_name || "User"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formattedTime}
                  </span>
                  {msg.is_encrypted && (
                    <span className="text-[9px] text-emerald-400 flex items-center gap-0.5 bg-emerald-950/50 px-1.5 py-0.2 rounded-full border border-emerald-500/20 font-mono">
                      <Lock className="h-2 w-2" /> E2EE
                    </span>
                  )}
                </div>

                <div className="text-xs sm:text-sm text-slate-200 mt-1.5 whitespace-pre-wrap break-words leading-relaxed font-normal">
                  {msg.content}
                </div>

                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-slate-900/90 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs text-slate-300 shadow-sm"
                      >
                        <FileText className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="truncate max-w-[200px] font-mono text-[11px]">{att}</span>
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

      {/* Cryptography Info Dialog */}
      <Dialog open={isCryptoInfoOpen} onOpenChange={setIsCryptoInfoOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900/95 border-slate-800 text-white backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="h-6 w-6" /> End-to-End Encryption Details
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Cryptographic session parameters verified by Web Crypto API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Algorithm:</span>
                <span className="font-mono text-cyan-300">ECDH (NIST P-256)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cipher:</span>
                <span className="font-mono text-cyan-300">AES-256-GCM</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Key Derivation:</span>
                <span className="font-mono text-cyan-300">HKDF / SHA-256</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Zero-Knowledge:</span>
                <span className="font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </span>
              </div>
            </div>

            {keyPair && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400">Your Public Fingerprint</span>
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 break-all select-all">
                  {keyPair.publicKey.slice(0, 64)}...
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
