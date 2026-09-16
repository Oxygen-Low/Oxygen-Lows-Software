import { useState } from "react";
import { useChat } from "@/contexts/ChatContext";
import {
  MessageSquare,
  Plus,
  Compass,
  Layers,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SPACE_COLORS = [
  "from-cyan-500 to-blue-600",
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
];

export function ServerList() {
  const { servers, activeServerId, setActiveServerId, createServer } = useChat();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [selectedColor, setSelectedColor] = useState(SPACE_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!newServerName.trim()) return;
    setIsSubmitting(true);
    await createServer(newServerName.trim());
    setIsSubmitting(false);
    setNewServerName("");
    setIsAddOpen(false);
  };

  return (
    <div className="flex flex-col items-center py-4 w-[76px] bg-slate-950/90 backdrop-blur-xl border-r border-slate-800/60 gap-3 shrink-0 select-none">
      {/* Direct Messages Pill */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative group flex items-center justify-center w-full">
            <div
              className={cn(
                "absolute left-0 w-1.5 bg-cyan-400 rounded-r-full transition-all duration-300",
                activeServerId === "dms" ? "h-9 opacity-100 shadow-[0_0_12px_rgba(34,211,238,0.8)]" : "h-0 opacity-0 group-hover:h-4 group-hover:opacity-60"
              )}
            />
            <button
              className={cn(
                "relative flex items-center justify-center h-12 w-12 rounded-2xl transition-all duration-300 font-medium",
                activeServerId === "dms"
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 ring-2 ring-cyan-400/40"
                  : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-cyan-400 hover:shadow-md hover:scale-105 border border-slate-800/80"
              )}
              onClick={() => setActiveServerId("dms")}
            >
              <MessageSquare className="h-5 w-5" />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-semibold bg-slate-900 border-slate-800 text-cyan-300">
          Direct Messages
        </TooltipContent>
      </Tooltip>

      <div className="w-8 h-[1px] bg-gradient-to-r from-transparent via-slate-700 to-transparent my-0.5" />

      {/* Spaces List */}
      <div className="flex flex-col items-center gap-3 w-full flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-1">
        {servers.map((server, index) => {
          const isActive = activeServerId === server.id;
          const colorGradient = SPACE_COLORS[index % SPACE_COLORS.length];
          const initials = server.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Tooltip key={server.id}>
              <TooltipTrigger asChild>
                <div className="relative group flex items-center justify-center w-full">
                  <div
                    className={cn(
                      "absolute left-0 w-1.5 bg-primary rounded-r-full transition-all duration-300",
                      isActive ? "h-9 opacity-100 shadow-[0_0_12px_rgba(56,189,248,0.8)]" : "h-0 opacity-0 group-hover:h-4 group-hover:opacity-60"
                    )}
                  />
                  <button
                    className={cn(
                      "relative flex items-center justify-center h-12 w-12 rounded-2xl font-bold text-xs transition-all duration-300",
                      isActive
                        ? `bg-gradient-to-br ${colorGradient} text-white shadow-lg shadow-indigo-500/25 ring-2 ring-white/30 scale-105`
                        : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white hover:scale-105 border border-slate-800/80"
                    )}
                    onClick={() => setActiveServerId(server.id)}
                  >
                    {initials}
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-semibold bg-slate-900 border-slate-800 text-white">
                {server.name}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Create Space Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="group relative flex items-center justify-center h-12 w-12 rounded-2xl bg-slate-900/60 border border-dashed border-slate-700/80 text-slate-400 hover:border-cyan-400 hover:text-cyan-400 hover:bg-cyan-500/10 hover:scale-105 transition-all duration-300"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="h-5 w-5 transition-transform group-hover:rotate-90 duration-300" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold bg-slate-900 border-slate-800 text-cyan-300">
            Create Space
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Create Space Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900/95 border-slate-800 text-white backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" /> Create a New Space
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Spaces are customized hubs for your team, group of friends, or community.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Space Name
              </label>
              <Input
                placeholder="e.g. Project Oasis, Creators Lounge"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="bg-slate-950 border-slate-800 text-white focus-visible:ring-cyan-500"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newServerName.trim() || isSubmitting}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold"
            >
              {isSubmitting ? "Creating Space..." : "Create Space"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
