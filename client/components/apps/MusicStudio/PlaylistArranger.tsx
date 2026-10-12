import React, { useState } from "react";
import {
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Copy,
  Layers,
  MoveHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusicProject, Pattern, PlaylistClip } from "./types";
import { PLAYLIST_TRACKS, STEPS_PER_BAR } from "./constants";
import { ToggleButton } from "./controls";
import {
  addClip,
  patternName,
  removeClip,
  updateClip,
} from "./projectOps";
import { songLengthBars } from "./audio/audioScheduler";
import type { MusicT } from "./useMusicT";

interface PlaylistArrangerProps {
  t: MusicT;
  project: MusicProject;
  activePatternId: string;
  playStep: number;
  onUpdateProject: (p: MusicProject) => void;
  onSelectPattern: (id: string) => void;
}

export const PlaylistArranger: React.FC<PlaylistArrangerProps> = ({
  t,
  project,
  activePatternId,
  playStep,
  onUpdateProject,
  onSelectPattern,
}) => {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const totalBars = Math.max(16, songLengthBars(project) + 4);
  const currentBar = playStep >= 0 ? Math.floor(playStep / STEPS_PER_BAR) : -1;

  const handleCellClick = (trackIndex: number, barIndex: number) => {
    // Check if there is an existing clip at this cell
    const existing = project.playlist.find(
      (c) => c.track === trackIndex && barIndex >= c.start && barIndex < c.start + c.length
    );

    if (existing) {
      // Remove clip if clicked
      onUpdateProject(removeClip(project, existing.id));
      return;
    }

    // Otherwise place a new clip of activePatternId
    onUpdateProject(addClip(project, activePatternId, trackIndex, barIndex));
  };

  const handleToggleTrackMute = (trackIndex: number) => {
    const nextMutes = [...project.playlistTrackMutes];
    nextMutes[trackIndex] = !nextMutes[trackIndex];
    onUpdateProject({ ...project, playlistTrackMutes: nextMutes });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none overflow-hidden border border-slate-800 rounded-lg">
      {/* Top Arranger Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider">
            {t("playlistArranger")}
          </span>
          <span className="text-slate-500 font-mono">
            ({songLengthBars(project)} {t("bars")})
          </span>
        </div>

        {/* Selected Paint Pattern */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">
            {t("paintPattern")}:
          </span>
          <select
            value={activePatternId}
            onChange={(e) => onSelectPattern(e.target.value)}
            aria-label={t("paintPattern")}
            className="h-7 px-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs font-semibold focus:outline-none"
          >
            {project.patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {patternName(project, p.id, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bar Ruler Header */}
      <div className="flex bg-slate-900/80 border-b border-slate-800 text-[10px] font-mono text-slate-500 h-6 items-center shrink-0">
        <div className="w-28 shrink-0 px-2 font-sans font-bold uppercase text-slate-400 border-r border-slate-800">
          {t("track")}
        </div>
        <div className="flex-1 flex overflow-x-auto">
          {Array.from({ length: totalBars }, (_, barIdx) => {
            const isPlaying = barIdx === currentBar;
            return (
              <div
                key={barIdx}
                className={cn(
                  "flex-1 min-w-[36px] text-center border-r border-slate-800/60 transition",
                  isPlaying ? "bg-orange-500/20 text-orange-400 font-bold" : "text-slate-400"
                )}
              >
                {barIdx + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* Multi-Track Lanes */}
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: PLAYLIST_TRACKS }, (_, trackIdx) => {
          const isMuted = project.playlistTrackMutes[trackIdx];
          const clips = project.playlist.filter((c) => c.track === trackIdx);

          return (
            <div
              key={trackIdx}
              className={cn(
                "flex h-14 border-b border-slate-800 transition relative",
                isMuted ? "bg-slate-950/30 opacity-60" : "bg-slate-950/80 hover:bg-slate-900/30"
              )}
            >
              {/* Track Header Header */}
              <div className="w-28 shrink-0 px-2 flex items-center justify-between border-r border-slate-800 bg-slate-900/70 z-20">
                <span className="text-xs font-semibold text-slate-300">
                  {t("track")} {trackIdx + 1}
                </span>
                <ToggleButton
                  active={isMuted}
                  activeClass="bg-red-500/80 text-white"
                  onClick={() => handleToggleTrackMute(trackIdx)}
                  title={t("mute")}
                >
                  M
                </ToggleButton>
              </div>

              {/* Grid Cells & Placed Pattern Clips */}
              <div className="flex-1 flex relative overflow-x-auto">
                {Array.from({ length: totalBars }, (_, barIdx) => (
                  <div
                    key={barIdx}
                    onClick={() => handleCellClick(trackIdx, barIdx)}
                    className={cn(
                      "flex-1 min-w-[36px] cursor-pointer hover:bg-cyan-500/10 transition border-r border-slate-900/60",
                      barIdx === currentBar && "bg-orange-500/10"
                    )}
                  />
                ))}

                {/* Render Placed Clips */}
                {clips.map((clip) => {
                  const pattern = project.patterns.find((p) => p.id === clip.patternId);
                  const leftPercent = (clip.start / totalBars) * 100;
                  const widthPercent = (clip.length / totalBars) * 100;

                  return (
                    <div
                      key={clip.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Click deletes the clip
                        onUpdateProject(removeClip(project, clip.id));
                      }}
                      className="absolute top-1 bottom-1 rounded border shadow-lg flex items-center px-2 text-xs font-bold text-slate-950 cursor-pointer z-10 transition hover:brightness-110 select-none overflow-hidden"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(1, widthPercent)}%`,
                        backgroundColor: pattern?.color || "#38bdf8",
                        borderColor: "#0f172a",
                        boxShadow: `0 0 10px ${pattern?.color || "#38bdf8"}66`,
                      }}
                      title={`${patternName(project, clip.patternId, t)} (${t("bars")} ${
                        clip.start + 1
                      }-${clip.start + clip.length}) - Click to remove`}
                    >
                      <span className="truncate">
                        {patternName(project, clip.patternId, t)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
