import React, { useState } from "react";
import {
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Copy,
  Sliders,
  ChevronUp,
  ChevronDown,
  Piano,
  MoreVertical,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel, MusicProject, Pattern, Step } from "./types";
import { Knob, ToggleButton, fmtPan, fmtPercent } from "./controls";
import { PRESETS, PRESET_CATEGORIES, getPreset } from "./audio/presetLibrary";
import {
  channelName,
  getSteps,
  toggleStep,
  setStep,
  fillSteps,
  updateChannel,
  cloneChannel,
  removeChannel,
  moveChannel,
  loadPresetIntoChannel,
} from "./projectOps";
import type { MusicT } from "./useMusicT";

interface ChannelRackProps {
  t: MusicT;
  project: MusicProject;
  activePattern: Pattern;
  playStep: number;
  onUpdateProject: (p: MusicProject) => void;
  onPreviewChannel: (channel: Channel) => void;
  onOpenSynth: (channel: Channel) => void;
  onOpenPianoRoll: (channelId: string) => void;
  onAddChannel: (presetId: string) => void;
}

export const ChannelRack: React.FC<ChannelRackProps> = ({
  t,
  project,
  activePattern,
  playStep,
  onUpdateProject,
  onPreviewChannel,
  onOpenSynth,
  onOpenPianoRoll,
  onAddChannel,
}) => {
  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("drums");
  const [velocityEditStep, setVelocityEditStep] = useState<{
    channelId: string;
    stepIndex: number;
  } | null>(null);

  const patternLength = activePattern.length;
  const currentStepInPattern = playStep >= 0 ? playStep % patternLength : -1;

  const handleStepClick = (channelId: string, stepIndex: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Shift-click opens velocity editor for this step
      setVelocityEditStep({ channelId, stepIndex });
      return;
    }
    const updated = toggleStep(project, activePattern.id, channelId, stepIndex);
    onUpdateProject(updated);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none overflow-hidden border border-slate-800 rounded-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 uppercase tracking-wider">
            {t("channelRack")}
          </span>
          <span className="text-slate-500 font-mono">
            ({project.channels.length} {t("channels")})
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("addInstrument")}</span>
          </button>

          {addMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg p-2 z-50 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-2">
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] capitalize font-medium transition",
                      activeCategory === cat
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    {t(`categories.${cat}`)}
                  </button>
                ))}
              </div>

              <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
                {PRESETS.filter((p) => p.category === activeCategory).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onAddChannel(preset.id);
                      setAddMenuOpen(false);
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-slate-800 text-left text-xs text-slate-200 transition group"
                  >
                    <span className="font-medium group-hover:text-cyan-400">
                      {t(`presets.${preset.id}`)}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase">
                      {preset.params.waveform}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step Numbers Grid Header */}
      <div className="flex items-center bg-slate-900/60 border-b border-slate-800/80 px-2 py-1 text-[10px] font-mono text-slate-500">
        <div className="w-72 shrink-0 px-2 font-sans font-bold uppercase tracking-wider text-slate-400">
          {t("channel")}
        </div>
        <div className="flex-1 flex gap-1 overflow-x-auto">
          {Array.from({ length: patternLength }, (_, i) => {
            const beatGroup = Math.floor(i / 4) % 2 === 0;
            const isPlaying = i === currentStepInPattern;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 min-w-[28px] max-w-[40px] text-center rounded py-0.5 transition-colors",
                  isPlaying
                    ? "bg-orange-500/30 text-orange-400 font-bold"
                    : beatGroup
                    ? "text-slate-400"
                    : "text-slate-600"
                )}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Rows */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {project.channels.map((channel, chIndex) => {
          const steps = getSteps(activePattern, channel.id);
          const hasNotes = (activePattern.notes[channel.id] || []).length > 0;

          return (
            <div
              key={channel.id}
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-lg border transition",
                channel.mute
                  ? "bg-slate-950/40 border-slate-900 opacity-60"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
              )}
            >
              {/* Channel Controls strip */}
              <div className="w-72 shrink-0 flex items-center gap-1.5 pr-2 border-r border-slate-800">
                {/* Reorder up/down */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={chIndex === 0}
                    onClick={() => onUpdateProject(moveChannel(project, channel.id, -1))}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20"
                    title={t("moveUp")}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={chIndex === project.channels.length - 1}
                    onClick={() => onUpdateProject(moveChannel(project, channel.id, 1))}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20"
                    title={t("moveDown")}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Mute & Solo */}
                <div className="flex items-center gap-0.5">
                  <ToggleButton
                    active={channel.mute}
                    activeClass="bg-red-500/80 text-white"
                    onClick={() =>
                      onUpdateProject(
                        updateChannel(project, channel.id, { mute: !channel.mute })
                      )
                    }
                    title={t("mute")}
                  >
                    M
                  </ToggleButton>
                  <ToggleButton
                    active={channel.solo}
                    activeClass="bg-green-500/80 text-white"
                    onClick={() =>
                      onUpdateProject(
                        updateChannel(project, channel.id, { solo: !channel.solo })
                      )
                    }
                    title={t("solo")}
                  >
                    S
                  </ToggleButton>
                </div>

                {/* Knobs: Volume & Pan */}
                <Knob
                  label={t("vol")}
                  value={channel.volume}
                  min={0}
                  max={1.5}
                  defaultValue={0.8}
                  size={26}
                  color={channel.color}
                  onChange={(v) =>
                    onUpdateProject(updateChannel(project, channel.id, { volume: v }))
                  }
                  format={fmtPercent}
                  hideLabel
                />
                <Knob
                  label={t("pan")}
                  value={channel.pan}
                  min={-1}
                  max={1}
                  defaultValue={0}
                  size={26}
                  onChange={(v) =>
                    onUpdateProject(updateChannel(project, channel.id, { pan: v }))
                  }
                  format={fmtPan}
                  hideLabel
                />

                {/* Channel Name / Audition button */}
                <button
                  type="button"
                  onClick={() => onPreviewChannel(channel)}
                  className="flex-1 min-w-0 text-left px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700/80 transition flex items-center justify-between group"
                  title={`${channelName(channel, t)} (Click to audition)`}
                >
                  <span
                    className="truncate text-xs font-semibold text-slate-200 group-hover:text-cyan-400"
                    style={{ borderLeft: `3px solid ${channel.color}`, paddingLeft: "6px" }}
                  >
                    {channelName(channel, t)}
                  </span>
                </button>

                {/* Mixer Track assign selector */}
                <select
                  value={channel.mixerTrack}
                  onChange={(e) =>
                    onUpdateProject(
                      updateChannel(project, channel.id, {
                        mixerTrack: parseInt(e.target.value, 10),
                      })
                    )
                  }
                  aria-label={t("mixerTrack")}
                  className="w-11 h-7 text-[10px] bg-slate-950 border border-slate-700 rounded text-slate-300 font-mono text-center focus:outline-none"
                  title={t("assignMixerTrack")}
                >
                  <option value={0}>M</option>
                  {Array.from({ length: 8 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>

                {/* Quick actions (Synth sound design & Piano roll) */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onOpenSynth(channel)}
                    className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition"
                    title={t("soundDesign")}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPianoRoll(channel.id)}
                    className={cn(
                      "p-1 rounded transition",
                      hasNotes
                        ? "text-orange-400 hover:text-orange-300 bg-orange-950/40"
                        : "text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                    )}
                    title={hasNotes ? t("pianoRollHasNotes") : t("pianoRoll")}
                  >
                    <Piano className="w-3.5 h-3.5" />
                  </button>

                  {/* Channel Menu toggle */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setMenuChannelId(menuChannelId === channel.id ? null : channel.id)
                      }
                      className="p-1 text-slate-500 hover:text-slate-200 rounded"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {menuChannelId === channel.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-slate-900 border border-slate-700 shadow-2xl rounded-md p-1 z-50 flex flex-col gap-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateProject(fillSteps(project, activePattern.id, channel.id, 2));
                            setMenuChannelId(null);
                          }}
                          className="px-2 py-1 text-left rounded hover:bg-slate-800 text-slate-200"
                        >
                          {t("fillEvery2")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateProject(fillSteps(project, activePattern.id, channel.id, 4));
                            setMenuChannelId(null);
                          }}
                          className="px-2 py-1 text-left rounded hover:bg-slate-800 text-slate-200"
                        >
                          {t("fillEvery4")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateProject(fillSteps(project, activePattern.id, channel.id, 0));
                            setMenuChannelId(null);
                          }}
                          className="px-2 py-1 text-left rounded hover:bg-slate-800 text-slate-200"
                        >
                          {t("clearSteps")}
                        </button>
                        <div className="h-px bg-slate-800 my-0.5" />
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateProject(cloneChannel(project, channel.id));
                            setMenuChannelId(null);
                          }}
                          className="px-2 py-1 text-left rounded hover:bg-slate-800 text-slate-200 flex items-center gap-1.5"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{t("cloneChannel")}</span>
                        </button>
                        <button
                          type="button"
                          disabled={project.channels.length <= 1}
                          onClick={() => {
                            onUpdateProject(removeChannel(project, channel.id));
                            setMenuChannelId(null);
                          }}
                          className="px-2 py-1 text-left rounded hover:bg-slate-800 text-red-400 flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t("deleteChannel")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Step Sequencer Button Grid */}
              <div className="flex-1 flex gap-1 overflow-x-auto py-1">
                {steps.map((step, stepIndex) => {
                  const beatGroup = Math.floor(stepIndex / 4) % 2 === 0;
                  const isCurrent = stepIndex === currentStepInPattern;

                  return (
                    <button
                      key={stepIndex}
                      type="button"
                      aria-label={`${t("step")} ${stepIndex + 1}`}
                      onClick={(e) => handleStepClick(channel.id, stepIndex, e)}
                      className={cn(
                        "flex-1 min-w-[28px] max-w-[40px] h-8 rounded border transition relative flex items-center justify-center font-mono text-[9px]",
                        isCurrent && "ring-2 ring-orange-400 z-10",
                        step.on
                          ? "shadow-sm border-transparent font-bold"
                          : beatGroup
                          ? "bg-slate-800/90 border-slate-700/60 hover:bg-slate-700/80"
                          : "bg-slate-900 border-slate-800 hover:bg-slate-800/80"
                      )}
                      style={
                        step.on
                          ? {
                              backgroundColor: channel.color,
                              color: "#0f172a",
                              boxShadow: `0 0 10px ${channel.color}66`,
                            }
                          : undefined
                      }
                      title={`${t("step")} ${stepIndex + 1} (${
                        step.on ? `${Math.round(step.velocity * 100)}%` : t("off")
                      })`}
                    >
                      {step.on && (
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-black/40 rounded-b"
                          style={{ height: `${(1 - step.velocity) * 100}%` }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Velocity Quick Slider Modal */}
      {velocityEditStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-72 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-200">
              <span>{t("stepVelocity")}</span>
              <span className="text-cyan-400 font-mono">
                {Math.round(
                  (getSteps(activePattern, velocityEditStep.channelId)[
                    velocityEditStep.stepIndex
                  ]?.velocity || 0.8) * 100
                )}
                %
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.01"
              value={
                getSteps(activePattern, velocityEditStep.channelId)[
                  velocityEditStep.stepIndex
                ]?.velocity || 0.8
              }
              onChange={(e) => {
                const current = getSteps(activePattern, velocityEditStep.channelId)[
                  velocityEditStep.stepIndex
                ];
                const updated = setStep(
                  project,
                  activePattern.id,
                  velocityEditStep.channelId,
                  velocityEditStep.stepIndex,
                  { on: true, velocity: parseFloat(e.target.value) }
                );
                onUpdateProject(updated);
              }}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setVelocityEditStep(null)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded"
              >
                {t("done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
