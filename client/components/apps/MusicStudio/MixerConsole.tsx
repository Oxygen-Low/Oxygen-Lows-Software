import React, { useState } from "react";
import {
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Activity,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MixerTrack, MusicProject } from "./types";
import { Knob, ToggleButton, fmtDb, fmtHz, fmtPan, fmtPercent, fmtSec } from "./controls";
import { mixerName, updateMixer } from "./projectOps";
import type { MusicT } from "./useMusicT";

interface MixerConsoleProps {
  t: MusicT;
  project: MusicProject;
  onUpdateProject: (p: MusicProject) => void;
}

export const MixerConsole: React.FC<MixerConsoleProps> = ({
  t,
  project,
  onUpdateProject,
}) => {
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);

  const selectedTrack = project.mixer[selectedTrackIndex] || project.mixer[0];

  const handleUpdateSelected = (partial: Partial<MixerTrack>) => {
    onUpdateProject(updateMixer(project, selectedTrackIndex, partial));
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none overflow-hidden border border-slate-800 rounded-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider">
            {t("mixerConsole")}
          </span>
          <span className="text-slate-500 font-mono">
            ({t("track")}: {mixerName(selectedTrackIndex, selectedTrack, t)})
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Channel Strips Section (Master + 8 Inserts) */}
        <div className="flex-1 flex overflow-x-auto p-3 gap-2 bg-slate-950/70 border-r border-slate-800">
          {project.mixer.map((track, trackIdx) => {
            const isSelected = trackIdx === selectedTrackIndex;
            const isMaster = trackIdx === 0;

            return (
              <div
                key={trackIdx}
                onClick={() => setSelectedTrackIndex(trackIdx)}
                className={cn(
                  "w-20 shrink-0 flex flex-col items-center justify-between p-2 rounded-lg border transition cursor-pointer",
                  isSelected
                    ? "bg-slate-900 border-cyan-500/80 shadow-lg"
                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60",
                  track.mute && "opacity-50"
                )}
              >
                {/* Track Label */}
                <div className="w-full text-center border-b border-slate-800 pb-1">
                  <span
                    className={cn(
                      "text-[11px] font-bold truncate block",
                      isMaster ? "text-orange-400" : isSelected ? "text-cyan-400" : "text-slate-300"
                    )}
                  >
                    {isMaster ? t("master") : `Ins ${trackIdx}`}
                  </span>
                </div>

                {/* Pan knob */}
                <div className="py-1">
                  <Knob
                    label={t("pan")}
                    value={track.pan}
                    min={-1}
                    max={1}
                    defaultValue={0}
                    size={28}
                    onChange={(v) =>
                      onUpdateProject(updateMixer(project, trackIdx, { pan: v }))
                    }
                    format={fmtPan}
                    hideLabel
                  />
                </div>

                {/* Vertical Fader */}
                <div className="flex-1 flex items-center justify-center py-2">
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.01"
                    value={track.volume}
                    onChange={(e) =>
                      onUpdateProject(
                        updateMixer(project, trackIdx, {
                          volume: parseFloat(e.target.value),
                        })
                      )
                    }
                    className="h-28 -rotate-90 w-28 accent-cyan-500 cursor-ns-resize"
                  />
                </div>

                {/* Volume display */}
                <span className="text-[10px] font-mono text-slate-400 mb-1">
                  {Math.round(track.volume * 100)}%
                </span>

                {/* Mute and Solo */}
                <div className="flex gap-1 w-full justify-center pt-1 border-t border-slate-800">
                  <ToggleButton
                    active={track.mute}
                    activeClass="bg-red-500/80 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateProject(
                        updateMixer(project, trackIdx, { mute: !track.mute })
                      );
                    }}
                    title={t("mute")}
                  >
                    M
                  </ToggleButton>
                  {!isMaster && (
                    <ToggleButton
                      active={track.solo}
                      activeClass="bg-green-500/80 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateProject(
                          updateMixer(project, trackIdx, { solo: !track.solo })
                        );
                      }}
                      title={t("solo")}
                    >
                      S
                    </ToggleButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Track Effects Rack Panel (Right side) */}
        <div className="w-80 shrink-0 bg-slate-900/90 p-3 overflow-y-auto flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {t("effectsRack")}: {mixerName(selectedTrackIndex, selectedTrack, t)}
            </span>
          </div>

          {/* 10 Modular FX Slots Rack */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              FX Slots (1-10)
            </span>
            <div className="flex flex-col gap-1.5">
              {(selectedTrack.fxSlots || []).map((slot, sIdx) => {
                const updateSlot = (partial: Partial<typeof slot>) => {
                  const newSlots = [...(selectedTrack.fxSlots || [])];
                  newSlots[sIdx] = { ...slot, ...partial };
                  handleUpdateSelected({ fxSlots: newSlots });
                };

                const updateParam = (key: string, val: number) => {
                  const params = { ...(slot.params || {}), [key]: val };
                  updateSlot({ params });
                };

                return (
                  <div
                    key={slot.id || sIdx}
                    className={cn(
                      "rounded border border-slate-800 bg-slate-950/70 p-1.5 transition",
                      slot.enabled && slot.type !== "none" ? "border-cyan-500/40" : "opacity-75"
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-4 font-mono text-[10px] text-slate-500">{sIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => updateSlot({ enabled: !slot.enabled })}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition",
                          slot.enabled && slot.type !== "none"
                            ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]"
                            : "bg-slate-700 hover:bg-slate-600"
                        )}
                        title={slot.enabled ? t("on") : t("off")}
                      />
                      <select
                        value={slot.type}
                        onChange={(e) =>
                          updateSlot({
                            type: e.target.value as any,
                            enabled: e.target.value !== "none",
                          })
                        }
                        className="flex-1 rounded bg-slate-900 px-1 py-0.5 text-[11px] text-slate-200 border border-slate-800 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="none">-- (Empty Slot) --</option>
                        <option value="eq">Parametric EQ</option>
                        <option value="reverb">Reverb</option>
                        <option value="delay">Delay</option>
                        <option value="distortion">Distortion</option>
                        <option value="chorus">Chorus</option>
                      </select>
                      {slot.type !== "none" && (
                        <div className="shrink-0">
                          <Knob
                            label="Wet"
                            value={slot.wet ?? 1}
                            min={0}
                            max={1}
                            defaultValue={1}
                            size={22}
                            onChange={(v) => updateSlot({ wet: v })}
                            format={fmtPercent}
                            hideLabel
                          />
                        </div>
                      )}
                    </div>

                    {/* Slot Expanded Parameter Controls */}
                    {slot.enabled && slot.type === "eq" && (
                      <div className="mt-1.5 flex justify-around border-t border-slate-800/80 pt-1">
                        <Knob
                          label={t("low")}
                          value={slot.params?.low ?? 0}
                          min={-15}
                          max={15}
                          defaultValue={0}
                          size={24}
                          onChange={(v) => updateParam("low", v)}
                          format={fmtDb}
                        />
                        <Knob
                          label={t("mid")}
                          value={slot.params?.mid ?? 0}
                          min={-15}
                          max={15}
                          defaultValue={0}
                          size={24}
                          onChange={(v) => updateParam("mid", v)}
                          format={fmtDb}
                        />
                        <Knob
                          label={t("high")}
                          value={slot.params?.high ?? 0}
                          min={-15}
                          max={15}
                          defaultValue={0}
                          size={24}
                          onChange={(v) => updateParam("high", v)}
                          format={fmtDb}
                        />
                      </div>
                    )}

                    {slot.enabled && slot.type === "reverb" && (
                      <div className="mt-1.5 flex justify-around border-t border-slate-800/80 pt-1">
                        <Knob
                          label={t("mix")}
                          value={slot.params?.mix ?? 0.3}
                          min={0}
                          max={1}
                          defaultValue={0.3}
                          size={24}
                          onChange={(v) => updateParam("mix", v)}
                          format={fmtPercent}
                        />
                        <Knob
                          label={t("decay")}
                          value={slot.params?.decay ?? 2}
                          min={0.5}
                          max={5}
                          defaultValue={2}
                          size={24}
                          onChange={(v) => updateParam("decay", v)}
                          format={fmtSec}
                        />
                      </div>
                    )}

                    {slot.enabled && slot.type === "delay" && (
                      <div className="mt-1.5 flex justify-around border-t border-slate-800/80 pt-1">
                        <Knob
                          label={t("mix")}
                          value={slot.params?.mix ?? 0.25}
                          min={0}
                          max={1}
                          defaultValue={0.25}
                          size={24}
                          onChange={(v) => updateParam("mix", v)}
                          format={fmtPercent}
                        />
                        <Knob
                          label={t("feedback")}
                          value={slot.params?.feedback ?? 0.35}
                          min={0}
                          max={0.85}
                          defaultValue={0.35}
                          size={24}
                          onChange={(v) => updateParam("feedback", v)}
                          format={fmtPercent}
                        />
                      </div>
                    )}

                    {slot.enabled && slot.type === "distortion" && (
                      <div className="mt-1.5 flex justify-around border-t border-slate-800/80 pt-1">
                        <Knob
                          label={t("drive")}
                          value={slot.params?.drive ?? 0.2}
                          min={0}
                          max={1}
                          defaultValue={0.2}
                          size={24}
                          color="#f97316"
                          onChange={(v) => updateParam("drive", v)}
                          format={fmtPercent}
                        />
                      </div>
                    )}

                    {slot.enabled && slot.type === "chorus" && (
                      <div className="mt-1.5 flex justify-around border-t border-slate-800/80 pt-1">
                        <Knob
                          label={t("chorus")}
                          value={slot.params?.depth ?? 0.3}
                          min={0}
                          max={1}
                          defaultValue={0.3}
                          size={24}
                          onChange={(v) => updateParam("depth", v)}
                          format={fmtPercent}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick 3-Band Parametric EQ */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">
              {t("parametricEq")} (Quick EQ)
            </span>
            <div className="flex justify-around items-center pt-1">
              <Knob
                label={t("low")}
                value={selectedTrack.eqLow}
                min={-15}
                max={15}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ eqLow: v })}
                format={fmtDb}
              />
              <Knob
                label={t("mid")}
                value={selectedTrack.eqMid}
                min={-15}
                max={15}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ eqMid: v })}
                format={fmtDb}
              />
              <Knob
                label={t("high")}
                value={selectedTrack.eqHigh}
                min={-15}
                max={15}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ eqHigh: v })}
                format={fmtDb}
              />
            </div>
          </div>

          {/* Stereo Reverb */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">
              {t("reverb")}
            </span>
            <div className="flex justify-around items-center pt-1">
              <Knob
                label={t("mix")}
                value={selectedTrack.reverb}
                min={0}
                max={1}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ reverb: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("decay")}
                value={selectedTrack.reverbSize}
                min={0.5}
                max={5}
                defaultValue={2}
                size={34}
                onChange={(v) => handleUpdateSelected({ reverbSize: v })}
                format={fmtSec}
              />
            </div>
          </div>

          {/* Tempo-synced Delay */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">
              {t("delay")}
            </span>
            <div className="flex justify-around items-center pt-1">
              <Knob
                label={t("mix")}
                value={selectedTrack.delay}
                min={0}
                max={1}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ delay: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("feedback")}
                value={selectedTrack.delayFeedback}
                min={0}
                max={0.85}
                defaultValue={0.35}
                size={34}
                onChange={(v) => handleUpdateSelected({ delayFeedback: v })}
                format={fmtPercent}
              />
            </div>
          </div>

          {/* Distortion / Drive */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">
              {t("distortionDrive")}
            </span>
            <div className="flex justify-around items-center pt-1">
              <Knob
                label={t("drive")}
                value={selectedTrack.distortion}
                min={0}
                max={1}
                defaultValue={0}
                size={34}
                color="#f97316"
                onChange={(v) => handleUpdateSelected({ distortion: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("chorus")}
                value={selectedTrack.chorus}
                min={0}
                max={1}
                defaultValue={0}
                size={34}
                onChange={(v) => handleUpdateSelected({ chorus: v })}
                format={fmtPercent}
              />
            </div>
          </div>

          {/* Master Limiter (If Master Track) */}
          {selectedTrackIndex === 0 && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wide">
                {t("masterLimiter")}
              </span>
              <ToggleButton
                active={selectedTrack.limiter}
                activeClass="bg-orange-500 text-slate-950 font-bold"
                onClick={() => handleUpdateSelected({ limiter: !selectedTrack.limiter })}
              >
                {selectedTrack.limiter ? t("on") : t("off")}
              </ToggleButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
