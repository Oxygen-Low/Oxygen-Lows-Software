import React from "react";
import { Sliders, Volume2, Sparkles, Piano } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel, SynthParams, Waveform } from "./types";
import { Modal, Knob, ToggleButton, fmtHz, fmtPercent, fmtSec } from "./controls";
import { channelName } from "./projectOps";
import type { MusicT } from "./useMusicT";

interface InstrumentEditorModalProps {
  t: MusicT;
  channel: Channel | null;
  onClose: () => void;
  onChangeParams: (params: SynthParams) => void;
  onPreview: (midi: number) => void;
}

const WAVEFORMS: Waveform[] = ["sine", "triangle", "sawtooth", "square", "noise"];

export const InstrumentEditorModal: React.FC<InstrumentEditorModalProps> = ({
  t,
  channel,
  onClose,
  onChangeParams,
  onPreview,
}) => {
  if (!channel) return null;

  const p = channel.params;

  const update = (partial: Partial<SynthParams>) => {
    onChangeParams({ ...p, ...partial });
  };

  return (
    <Modal
      open={!!channel}
      onClose={onClose}
      title={`${t("soundDesign")}: ${channelName(channel, t)}`}
      closeLabel={t("close")}
      wide
    >
      <div className="flex flex-col gap-4 text-xs select-none">
        {/* Oscillators Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Primary Oscillator */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
            <span className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">
              {t("oscillator1")}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {WAVEFORMS.map((wave) => (
                <button
                  key={wave}
                  type="button"
                  onClick={() => update({ waveform: wave })}
                  className={cn(
                    "px-2 py-1 rounded text-[11px] uppercase font-bold transition",
                    p.waveform === wave
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  )}
                >
                  {wave}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-around pt-1">
              <Knob
                label={t("unison")}
                value={p.unison}
                min={1}
                max={7}
                step={1}
                defaultValue={1}
                size={32}
                onChange={(v) => update({ unison: Math.round(v) })}
              />
              <Knob
                label={t("detune")}
                value={p.unisonDetune}
                min={0}
                max={50}
                defaultValue={15}
                size={32}
                onChange={(v) => update({ unisonDetune: v })}
              />
              <Knob
                label={t("glide")}
                value={p.glide}
                min={0}
                max={0.2}
                defaultValue={0}
                size={32}
                onChange={(v) => update({ glide: v })}
                format={fmtSec}
              />
            </div>
          </div>

          {/* Secondary Oscillator & Sub/Noise */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
            <span className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">
              {t("oscillator2AndNoise")}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {WAVEFORMS.filter((w) => w !== "noise").map((wave) => (
                <button
                  key={wave}
                  type="button"
                  onClick={() => update({ osc2Waveform: wave })}
                  className={cn(
                    "px-2 py-1 rounded text-[11px] uppercase font-bold transition",
                    p.osc2Waveform === wave
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  )}
                >
                  {wave}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-around pt-1">
              <Knob
                label={t("osc2Mix")}
                value={p.osc2Mix}
                min={0}
                max={1}
                defaultValue={0}
                size={32}
                onChange={(v) => update({ osc2Mix: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("noiseMix")}
                value={p.noiseMix}
                min={0}
                max={1}
                defaultValue={0}
                size={32}
                onChange={(v) => update({ noiseMix: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("fmIndex")}
                value={p.fmIndex}
                min={0}
                max={5}
                defaultValue={0}
                size={32}
                onChange={(v) => update({ fmIndex: v })}
              />
            </div>
          </div>
        </div>

        {/* Envelope ADSR & Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Amp Envelope ADSR */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">
                {t("ampEnvelope")}
              </span>
              <ToggleButton
                active={p.oneShot}
                activeClass="bg-orange-500 text-slate-950 font-bold"
                onClick={() => update({ oneShot: !p.oneShot })}
              >
                {t("oneShotDrum")}
              </ToggleButton>
            </div>

            <div className="flex items-center justify-around pt-1">
              <Knob
                label={t("attack")}
                value={p.attack}
                min={0.001}
                max={2.0}
                log
                defaultValue={0.01}
                size={34}
                onChange={(v) => update({ attack: v })}
                format={fmtSec}
              />
              <Knob
                label={t("decay")}
                value={p.decay}
                min={0.01}
                max={3.0}
                log
                defaultValue={0.3}
                size={34}
                onChange={(v) => update({ decay: v })}
                format={fmtSec}
              />
              <Knob
                label={t("sustain")}
                value={p.sustain}
                min={0}
                max={1.0}
                defaultValue={0.7}
                size={34}
                onChange={(v) => update({ sustain: v })}
                format={fmtPercent}
              />
              <Knob
                label={t("release")}
                value={p.release}
                min={0.01}
                max={4.0}
                log
                defaultValue={0.2}
                size={34}
                onChange={(v) => update({ release: v })}
                format={fmtSec}
              />
            </div>
          </div>

          {/* Filter Cutoff & Resonance */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
            <span className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">
              {t("filterSection")}
            </span>

            <div className="flex items-center justify-around pt-1">
              <Knob
                label={t("cutoff")}
                value={p.cutoff}
                min={50}
                max={20000}
                log
                defaultValue={18000}
                size={34}
                onChange={(v) => update({ cutoff: v })}
                format={fmtHz}
              />
              <Knob
                label={t("resonance")}
                value={p.resonance}
                min={0.1}
                max={15}
                defaultValue={0.7}
                size={34}
                onChange={(v) => update({ resonance: v })}
              />
              <Knob
                label={t("pitchDecay")}
                value={p.pitchEnvDecay}
                min={0.01}
                max={0.5}
                defaultValue={0.05}
                size={34}
                onChange={(v) => update({ pitchEnvDecay: v })}
                format={fmtSec}
              />
            </div>
          </div>
        </div>

        {/* Quick Audition Virtual Keyboard */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t("auditionKeyboard")}
          </span>
          <div className="flex h-12 gap-1 overflow-x-auto justify-center">
            {[48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72].map((midi) => (
              <button
                key={midi}
                type="button"
                onClick={() => onPreview(midi)}
                className="flex-1 min-w-[28px] max-w-[44px] bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded flex items-end justify-center pb-1 text-[10px] font-mono font-semibold transition"
              >
                {midi}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
