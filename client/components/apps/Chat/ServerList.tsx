import { useState } from "react";
import { useChat, ChatServer } from "@/contexts/ChatContext";
import { MessageSquare, Plus, Compass } from "lucide-react";
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

export function ServerList() {
  const { servers, activeServerId, setActiveServerId, createServer } = useChat();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
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
    <div className="flex flex-col items-center py-3 w-[72px] bg-slate-950 border-r border-slate-800/80 gap-2 shrink-0 select-none">
      {/* Direct Messages Icon */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative group flex items-center justify-center w-full">
            <div
              className={cn(
                "absolute left-0 w-1 bg-primary rounded-r-full transition-all duration-200",
                activeServerId === "dms" ? "h-10" : "h-0 group-hover:h-5"
              )}
            />
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-12 w-12 rounded-3xl transition-all duration-200 group-hover:rounded-2xl",
                activeServerId === "dms"
                  ? "bg-primary text-primary-foreground rounded-2xl shadow-md"
                  : "bg-slate-900 text-slate-300 hover:bg-primary/20 hover:text-primary"
              )}
              onClick={() => setActiveServerId("dms")}
            >
              <MessageSquare className="h-6 w-6" />
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">Direct Messages</TooltipContent>
      </Tooltip>

      <div className="w-8 h-[2px] bg-slate-800 rounded-full my-1" />

      {/* Server Icons List */}
      <div className="flex flex-col items-center gap-2 w-full flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {servers.map((server) => {
          const isActive = activeServerId === server.id;
          const initials = server.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 3)
            .toUpperCase();

          return (
            <Tooltip key={server.id}>
              <TooltipTrigger asChild>
                <div className="relative group flex items-center justify-center w-full">
                  <div
                    className={cn(
                      "absolute left-0 w-1 bg-primary rounded-r-full transition-all duration-200",
                      isActive ? "h-10" : "h-0 group-hover:h-5"
                    )}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-12 w-12 rounded-3xl font-semibold text-sm transition-all duration-200 group-hover:rounded-2xl",
                      isActive
                        ? "bg-primary text-primary-foreground rounded-2xl shadow-md"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                    )}
                    onClick={() => setActiveServerId(server.id)}
                  >
                    {initials}
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{server.name}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Add Server Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-3xl bg-slate-900/60 text-emerald-400 hover:bg-emerald-600 hover:text-white hover:rounded-2xl transition-all duration-200"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Add a Server</TooltipContent>
        </Tooltip>
      </div>

      {/* Create Server Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create Your Server</DialogTitle>
            <DialogDescription className="text-slate-400">
              Your server is where you and your friends hang out. Make yours and start talking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Server Name
              </label>
              <Input
                placeholder="e.g. Gaming Clan, Study Group"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newServerName.trim() || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
