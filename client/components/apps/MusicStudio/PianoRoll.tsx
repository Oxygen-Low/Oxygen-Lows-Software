import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Trash2,
  Plus,
  Minus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Music2,
  MousePointer,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel, MusicProject, Note, Pattern } from "./types";
import {
  CHORDS,
  KEYBOARD_MAP,
  PIANO_HIGH,
  PIANO_LOW,
  STEPS_PER_BAR,
  isBlackKey,
  noteName,
  uid,
} from "./constants";
import { channelName, setNotes } from "./projectOps";
import type { MusicT } from "./useMusicT";

interface PianoRollProps {
  t: MusicT;
  project: MusicProject;
  activePattern: Pattern;
  activeChannelId: string;
  playStep: number;
  onSelectChannel: (id: string) => void;
  onUpdateProject: (p: MusicProject) => void;
  onPreviewNote: (channel: Channel, midi: number) => void;
}

export const PianoRoll: React.FC<PianoRollProps> = ({
  t,
  project,
  activePattern,
  activeChannelId,
  playStep,
  onSelectChannel,
  onUpdateProject,
  onPreviewNote,
}) => {
  const [selectedChord, setSelectedChord] = useState<string>("none");
  const [noteLength, setNoteLength] = useState<number>(2); // in 16th steps
  const [octaveShift, setOctaveShift] = useState<number>(0);
  const [snapSteps, setSnapSteps] = useState<number>(1);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const activeChannel =
    project.channels.find((c) => c.id === activeChannelId) || project.channels[0];

  const notes: Note[] = useMemo(() => {
    if (!activeChannel) return [];
    return activePattern.notes[activeChannel.id] || [];
  }, [activePattern, activeChannel]);

  const patternSteps = activePattern.length;
  const currentStep = playStep >= 0 ? playStep % patternSteps : -1;

  // Auto-scroll vertically to the middle octave when opened
  useEffect(() => {
    if (gridContainerRef.current) {
      // C4 is midi 60
      const rowHeight = 22;
      const totalNotes = PIANO_HIGH - PIANO_LOW + 1;
      const targetMidi = activeChannel?.stepNote || 60;
      const rowIndex = PIANO_HIGH - targetMidi;
      gridContainerRef.current.scrollTop = Math.max(
        0,
        rowIndex * rowHeight - gridContainerRef.current.clientHeight / 2
      );
    }
  }, [activeChannelId]);

  // Keys to display: from PIANO_HIGH down to PIANO_LOW
  const midiNotes = useMemo(() => {
    const list: number[] = [];
    for (let m = PIANO_HIGH; m >= PIANO_LOW; m--) {
      list.push(m);
    }
    return list;
  }, []);

  const handleCellClick = (pitch: number, stepIndex: number, e: React.MouseEvent) => {
    if (!activeChannel) return;

    // Check if clicked directly on an existing note to delete it
    const existing = notes.find(
      (n) => n.pitch === pitch && stepIndex >= n.start && stepIndex < n.start + n.length
    );

    if (existing) {
      const filtered = notes.filter((n) => n.id !== existing.id);
      onUpdateProject(setNotes(project, activePattern.id, activeChannel.id, filtered));
      return;
    }

    // Play preview
    onPreviewNote(activeChannel, pitch);

    // If chord tool is active, place the chord intervals
    const intervals = CHORDS[selectedChord] || [0];
    const newNotes: Note[] = intervals.map((interval) => ({
      id: uid("n"),
      pitch: pitch + interval,
      start: stepIndex,
      length: noteLength,
      velocity: 0.85,
    }));

    onUpdateProject(
      setNotes(project, activePattern.id, activeChannel.id, [...notes, ...newNotes])
    );
  };

  const handleClearAllNotes = () => {
    if (!activeChannel) return;
    onUpdateProject(setNotes(project, activePattern.id, activeChannel.id, []));
  };

  const handleShiftOctave = (deltaOctaves: number) => {
    if (!activeChannel) return;
    const deltaMidi = deltaOctaves * 12;
    const shifted = notes.map((n) => ({
      ...n,
      pitch: Math.min(PIANO_HIGH, Math.max(PIANO_LOW, n.pitch + deltaMidi)),
    }));
    onUpdateProject(setNotes(project, activePattern.id, activeChannel.id, shifted));
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none overflow-hidden border border-slate-800 rounded-lg">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        {/* Active Channel Selector */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300 uppercase tracking-wider">
            {t("channel")}:
          </span>
          <select
            value={activeChannel?.id || ""}
            onChange={(e) => onSelectChannel(e.target.value)}
            aria-label={t("channel")}
            className="h-7 px-2 bg-slate-950 border border-slate-700 rounded text-slate-200 font-semibold focus:outline-none"
          >
            {project.channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {channelName(ch, t)}
              </option>
            ))}
          </select>
        </div>

        {/* Note Length & Chord Stamp Toolbar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              {t("noteDuration")}:
            </span>
            {[1, 2, 4, 8].map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => setNoteLength(len)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono",
                  noteLength === len
                    ? "bg-cyan-600 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {len === 1 ? "1/16" : len === 2 ? "1/8" : len === 4 ? "1/4" : "1/2"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              {t("chordStamp")}:
            </span>
            <select
              value={selectedChord}
              onChange={(e) => setSelectedChord(e.target.value)}
              aria-label={t("chordStamp")}
              className="bg-transparent text-slate-300 text-xs focus:outline-none capitalize"
            >
              <option value="none">{t("singleNote")}</option>
              <option value="major">{t("majorChord")}</option>
              <option value="minor">{t("minorChord")}</option>
              <option value="maj7">Major 7th</option>
              <option value="min7">Minor 7th</option>
              <option value="sus2">Sus 2</option>
              <option value="sus4">Sus 4</option>
              <option value="octave">Octave</option>
            </select>
          </div>
        </div>

        {/* Octave & Clear Helpers */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleShiftOctave(-1)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono"
            title={t("octaveDown")}
          >
            -1 Oct
          </button>
          <button
            type="button"
            onClick={() => handleShiftOctave(1)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono"
            title={t("octaveUp")}
          >
            +1 Oct
          </button>
          <button
            type="button"
            onClick={handleClearAllNotes}
            disabled={notes.length === 0}
            className="px-2 py-1 bg-red-950/60 hover:bg-red-900/80 text-red-300 rounded text-xs flex items-center gap-1 disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" />
            <span>{t("clearNotes")}</span>
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Step Numbers Top Ruler */}
        <div className="flex bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-500 h-6 items-center shrink-0">
          <div className="w-16 shrink-0 text-center font-sans font-bold uppercase text-slate-400">
            {t("pitch")}
          </div>
          <div className="flex-1 flex">
            {Array.from({ length: patternSteps }, (_, i) => {
              const beatGroup = Math.floor(i / 4) % 2 === 0;
              const isPlaying = i === currentStep;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 min-w-[24px] text-center border-l border-slate-800/60",
                    isPlaying
                      ? "bg-orange-500/20 text-orange-400 font-bold"
                      : beatGroup
                      ? "text-slate-400"
                      : "text-slate-600"
                  )}
                >
                  {i % 4 === 0 ? Math.floor(i / 4) + 1 : ""}
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Piano Keys + Note Grid */}
        <div ref={gridContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {midiNotes.map((midi) => {
            const black = isBlackKey(midi);
            const isRootC = midi % 12 === 0;

            return (
              <div
                key={midi}
                className={cn(
                  "flex h-[22px] border-b border-slate-900/80",
                  black ? "bg-slate-950/80" : "bg-slate-900/40"
                )}
              >
                {/* Piano Key on the left */}
                <button
                  type="button"
                  onClick={() => activeChannel && onPreviewNote(activeChannel, midi)}
                  className={cn(
                    "w-16 shrink-0 px-1 text-right text-[10px] font-mono border-r border-slate-800 transition flex items-center justify-between",
                    black
                      ? "bg-slate-900 text-slate-400 hover:bg-slate-800"
                      : "bg-slate-800/90 text-slate-200 hover:bg-slate-700",
                    isRootC && "font-bold text-cyan-400"
                  )}
                >
                  <span className="text-[9px] text-slate-600">{midi}</span>
                  <span>{noteName(midi)}</span>
                </button>

                {/* Step cells for this pitch */}
                <div className="flex-1 flex relative">
                  {Array.from({ length: patternSteps }, (_, stepIdx) => {
                    const beatBoundary = stepIdx % 4 === 0;
                    return (
                      <div
                        key={stepIdx}
                        onClick={(e) => handleCellClick(midi, stepIdx, e)}
                        className={cn(
                          "flex-1 min-w-[24px] cursor-pointer hover:bg-cyan-500/10 transition border-r border-slate-900/50",
                          beatBoundary && "border-r-slate-800/80",
                          stepIdx === currentStep && "bg-orange-500/10"
                        )}
                      />
                    );
                  })}

                  {/* Render placed notes on this pitch row */}
                  {notes
                    .filter((n) => n.pitch === midi)
                    .map((note) => {
                      const leftPercent = (note.start / patternSteps) * 100;
                      const widthPercent = (note.length / patternSteps) * 100;

                      return (
                        <div
                          key={note.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Delete note on click
                            const filtered = notes.filter((n) => n.id !== note.id);
                            onUpdateProject(
                              setNotes(project, activePattern.id, activeChannel.id, filtered)
                            );
                          }}
                          className="absolute top-0.5 bottom-0.5 rounded shadow-md flex items-center px-1 text-[9px] font-bold text-slate-950 truncate cursor-pointer z-10 transition hover:brightness-110"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(1.5, widthPercent)}%`,
                            backgroundColor: activeChannel?.color || "#22d3ee",
                            boxShadow: `0 0 6px ${activeChannel?.color || "#22d3ee"}88`,
                          }}
                          title={`${noteName(note.pitch)} (${t("step")} ${note.start + 1}, len ${
                            note.length
                          }) - Click to delete`}
                        >
                          <span className="truncate">{noteName(note.pitch)}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Velocity Stalks Lane (Authentic Piano Roll Velocity Editor) */}
        <div className="h-20 shrink-0 bg-slate-950 border-t border-slate-800 flex flex-col">
          <div className="h-4 px-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-[9px] font-mono text-slate-400">
            <span className="uppercase font-semibold tracking-wider text-slate-300">
              {t("noteVelocity")} ({notes.length} {t("notes")})
            </span>
            <span className="text-slate-500">{t("clickDragVelocity")}</span>
          </div>

          <div className="flex-1 flex relative items-end px-16 pb-1">
            {notes.map((note) => {
              const leftPercent = (note.start / patternSteps) * 100;
              const heightPercent = Math.max(5, Math.min(100, (note.velocity || 0.8) * 100));

              return (
                <div
                  key={note.id}
                  className="absolute bottom-1 w-3 -ml-1.5 flex flex-col items-center group cursor-ns-resize"
                  style={{ left: `${leftPercent}%` }}
                  title={`${noteName(note.pitch)}: ${Math.round((note.velocity || 0.8) * 100)}%`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const startY = e.clientY;
                    const startVel = note.velocity || 0.8;
                    const handleMove = (me: PointerEvent) => {
                      const deltaY = startY - me.clientY;
                      const nextVel = Math.max(0.05, Math.min(1.0, startVel + deltaY / 60));
                      const updated = notes.map((n) =>
                        n.id === note.id ? { ...n, velocity: nextVel } : n
                      );
                      onUpdateProject(
                        setNotes(project, activePattern.id, activeChannel.id, updated)
                      );
                    };
                    const handleUp = () => {
                      window.removeEventListener("pointermove", handleMove);
                      window.removeEventListener("pointerup", handleUp);
                    };
                    window.addEventListener("pointermove", handleMove);
                    window.addEventListener("pointerup", handleUp);
                  }}
                >
                  {/* Velocity stalk head */}
                  <div
                    className="w-2.5 h-2.5 rounded-full border border-slate-950 shadow-xs transition group-hover:scale-125"
                    style={{ backgroundColor: activeChannel?.color || "#22d3ee" }}
                  />
                  {/* Velocity vertical stem */}
                  <div
                    className="w-0.5 rounded-t-xs"
                    style={{
                      height: `${heightPercent * 0.55}px`,
                      backgroundColor: activeChannel?.color || "#22d3ee",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
