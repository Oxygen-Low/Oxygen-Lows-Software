/**
 * SavedRoomsDrawer.tsx
 * Right side panel for browsing, switching, creating copies, and deleting
 * saved room slots in Oxygen Low's Software 3D Studio Editor.
 */

import React from "react";
import { RoomMetadata } from "@/types/threeDBackground";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Folder,
  Copy,
  Trash2,
  X,
  Clock,
  Box,
  CheckCircle2,
  FolderOpen,
} from "lucide-react";

export interface SavedRoomsDrawerProps {
  savedRooms: RoomMetadata[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onDeleteRoom: (roomId: string) => void;
  onSaveAsCopy: () => void;
  onClose?: () => void;
}

export const SavedRoomsDrawer: React.FC<SavedRoomsDrawerProps> = ({
  savedRooms,
  activeRoomId,
  onSelectRoom,
  onDeleteRoom,
  onSaveAsCopy,
  onClose,
}) => {
  const { t } = useLanguage();

  return (
    <aside className="absolute top-14 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 z-30 flex flex-col shadow-2xl text-white">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-cyan-400" />
          <h2 className="font-semibold text-sm">
            {t("threeDBackground.savedRooms", undefined, "Saved Room Slots")}
          </h2>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            {savedRooms.length}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Action Bar: Save as Copy */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 shrink-0">
        <button
          type="button"
          onClick={onSaveAsCopy}
          className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition border border-slate-700"
        >
          <Copy className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("threeDBackground.saveAsCopy", undefined, "Save Current as Copy")}</span>
        </button>
      </div>

      {/* Slots List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {savedRooms.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3">
            <FolderOpen className="w-10 h-10 opacity-30 text-cyan-400" />
            <p className="text-xs max-w-[200px]">
              {t(
                "threeDBackground.noRoomsFound",
                undefined,
                "No saved rooms found. Create your first room!"
              )}
            </p>
          </div>
        ) : (
          savedRooms.map((slot) => {
            const isActive = slot.id === activeRoomId;
            return (
              <div
                key={slot.id}
                className={cn(
                  "group p-3 rounded-xl border transition flex flex-col gap-2",
                  isActive
                    ? "bg-cyan-950/40 border-cyan-800/80 shadow-sm"
                    : "bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {slot.name}
                      </span>
                      {isActive && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] bg-cyan-900 text-cyan-300 rounded font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Box className="w-3 h-3 text-slate-500" />
                        {slot.objectCount} {t("threeDBackground.objectsCount", undefined, "Objects")}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(slot.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteRoom(slot.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700/80 transition opacity-60 group-hover:opacity-100 shrink-0"
                    title={t("threeDBackground.deleteRoom", undefined, "Delete Room")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!isActive && (
                  <button
                    type="button"
                    onClick={() => onSelectRoom(slot.id)}
                    className="w-full py-1 px-2 rounded bg-slate-700/80 hover:bg-cyan-600 hover:text-white text-slate-300 text-[11px] font-medium transition"
                  >
                    {t("threeDBackground.loadRoom", undefined, "Load Room")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default SavedRoomsDrawer;
