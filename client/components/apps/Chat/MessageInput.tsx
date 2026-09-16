import { useState, useRef, KeyboardEvent } from "react";
import { useChat } from "@/contexts/ChatContext";
import { Send, Smile, Paperclip, Lock, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const POPULAR_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎉", "🚀", "✨", "💯", "👀", "🙌", "👏", "🎮", "🛡️", "📞"];

export function MessageInput({ channelName, isDm }: { channelName: string; isDm: boolean }) {
  const { sendMessage } = useChat();
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    const textToSend = content.trim();
    const atts = [...attachments];
    setContent("");
    setAttachments([]);
    await sendMessage(textToSend, atts);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setIsEmojiOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        setAttachments((prev) => [...prev, files[i].name]);
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 bg-slate-950/80 backdrop-blur-md border-t border-slate-800/60 shrink-0">
      {/* Attached files previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5 p-2 bg-slate-900/90 rounded-xl border border-slate-800/80">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-slate-800/90 px-3 py-1 rounded-lg text-xs text-slate-200 border border-slate-700/60 shadow-sm"
            >
              <span className="truncate max-w-[160px] font-mono text-[11px]">{att}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="text-slate-400 hover:text-rose-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-center bg-slate-900/90 border border-slate-800/80 rounded-2xl px-3 py-1.5 focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all shadow-inner">
        {/* Attachment button */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
          multiple
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="h-8 w-8 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 rounded-xl flex items-center justify-center shrink-0 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900 border-slate-800 text-xs">Attach File</TooltipContent>
        </Tooltip>

        {/* Input */}
        <Input
          placeholder={isDm ? `Message @${channelName}...` : `Message #${channelName}...`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-white placeholder:text-slate-500 text-xs sm:text-sm h-10 px-3"
        />

        {/* E2EE Lock Icon */}
        {isDm && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center text-emerald-400/90 px-2 shrink-0 cursor-default">
                <Lock className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900 border-slate-800 text-xs text-emerald-400 font-mono">
              End-to-End Encrypted
            </TooltipContent>
          </Tooltip>
        )}

        {/* Emoji popover */}
        <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-8 w-8 text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2.5 bg-slate-900 border-slate-800 text-white shadow-2xl rounded-2xl" side="top">
            <div className="grid grid-cols-7 gap-1">
              {POPULAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  className="p-1.5 text-lg hover:bg-slate-800 rounded-xl transition-all text-center hover:scale-110"
                  onClick={() => addEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Send button */}
        <Button
          size="icon"
          className="h-8 w-8 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shrink-0 ml-1.5 shadow-md shadow-cyan-500/20"
          onClick={handleSend}
          disabled={!content.trim() && attachments.length === 0}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
