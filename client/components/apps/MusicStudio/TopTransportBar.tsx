import React, { useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Circle,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  Timer,
  Grid3x3,
  Piano,
  ListMusic,
  SlidersHorizontal,
  Plus,
  Copy,
  Trash2,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusicProject, PlayMode, StudioView } from "./types";
import { MAX_BPM, MIN_BPM, STEPS_PER_BAR, clamp } from "./constants";
import { Knob, fmtPercent } from "./controls";
import type { MusicT } from "./useMusicT";
import { patternName } from "./projectOps";

interface VisualizerProps {
  getAnalyser: () => AnalyserNode | null;
  label: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ getAnalyser, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext?.("2d");
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, w, h);
      const analyser = getAnalyser();
      if (!analyser) return;
      if (!data || data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      }
      analyser.getByteFrequencyData(data);
      const bars = 40;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        // Logarithmic bin mapping so bass and treble are evenly represented.
        const idx = Math.floor(Math.pow(i / bars, 2) * (data.length * 0.7));
        const v = data[idx] / 255;
        const bh = v * h;
        const hue = 190 - v * 150;
        ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser]);
  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={36}
      aria-label={label}
      className="hidden h-9 w-40 rounded border border-slate-800 bg-slate-950 lg:block"
    />
  );
};

interface TopTransportBarProps {
  t: MusicT;
  project: MusicProject;
  playing: boolean;
  playStep: number;
  mode: PlayMode;
  view: StudioView;
  metronome: boolean;
  recording: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activePatternId: string;
  onTogglePlay: () => void;
  onStop: () => void;
  onModeChange: (mode: PlayMode) => void;
  onViewChange: (view: StudioView) => void;
  onBpmChange: (bpm: number) => void;
  onSwingChange: (swing: number) => void;
  onMasterChange: (v: number) => void;
  onMetronomeChange: (v: boolean) => void;
  onRecordingChange: (v: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjects: () => void;
  onOpenExport: () => void;
  onRename: (name: string) => void;
  onPatternSelect: (id: string) => void;
  onPatternAdd: () => void;
  onPatternClone: () => void;
  onPatternDelete: () => void;
  onPatternRename: (name: string) => void;
  onPatternLength: (length: number) => void;
  getAnalyser: () => AnalyserNode | null;
}

export const TopTransportBar: React.FC<TopTransportBarProps> = (props) => {
  const { t, project, playing, playStep, mode, view } = props;
  const taps = useRef<number[]>([]);
  const activePattern = project.patterns.find((p) => p.id === props.activePatternId);

  const tapTempo = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((x) => now - x < 2500), now];
    if (taps.current.length >= 2) {
      const intervals = taps.current.slice(1).map((x, i) => x - taps.current[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      props.onBpmChange(clamp(Math.round(60000 / avg), MIN_BPM, MAX_BPM));
    }
  };

  const position =
    playStep >= 0
      ? `${Math.floor(playStep / STEPS_PER_BAR) + 1}:${Math.floor((playStep % STEPS_PER_BAR) / 4) + 1}:${(playStep % 4) + 1}`
      : "1:1:1";

  const views: { id: StudioView; icon: React.ReactNode; label: string }[] = [
    { id: "rack", icon: <Grid3x3 className="h-4 w-4" />, label: t("channelRack") },
    { id: "piano", icon: <Piano className="h-4 w-4" />, label: t("pianoRoll") },
    { id: "playlist", icon: <ListMusic className="h-4 w-4" />, label: t("playlist") },
    { id: "mixer", icon: <SlidersHorizontal className="h-4 w-4" />, label: t("mixer") },
  ];

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800";

  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-900/95">
      <div className="flex flex-wrap items-center gap-2 px-2 py-2 sm:px-3">
        <input
          value={project.name}
          onChange={(e) => props.onRename(e.target.value)}
          aria-label={t("projectName")}
          placeholder={t("untitled")}
          className="h-9 w-32 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white focus:border-cyan-500 focus:outline-none sm:w-44"
        />

        <div className="flex items-center gap-1">
          <button
            onClick={props.onTogglePlay}
            aria-label={playing ? t("pause") : t("play")}
            title={`${playing ? t("pause") : t("play")} (Space)`}
            className={cn(iconBtn, playing && "border-green-500 bg-green-600/30 text-green-300")}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={props.onStop} aria-label={t("stop")} title={t("stop")} className={iconBtn}>
            <Square className="h-4 w-4" />
          </button>
          <button
            onClick={() => props.onRecordingChange(!props.recording)}
            aria-label={t("record")}
            aria-pressed={props.recording}
            title={t("recordHint")}
            className={cn(iconBtn, props.recording && "border-red-500 bg-red-600/30 text-red-400")}
          >
            <Circle className={cn("h-4 w-4", props.recording && "fill-red-500")} />
          </button>
        </div>

        <div className="flex overflow-hidden rounded-md border border-slate-700" role="group" aria-label={t("playMode")}>
          {(["pattern", "song"] as PlayMode[]).map((m) => (
            <button
              key={m}
              onClick={() => props.onModeChange(m)}
              aria-pressed={mode === m}
              className={cn(
                "h-9 px-3 text-xs font-semibold uppercase",
                mode === m ? "bg-orange-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
              )}
            >
              {m === "pattern" ? t("modePattern") : t("modeSong")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2">
          <label className="text-[10px] font-semibold uppercase text-slate-500" htmlFor="ms-bpm">
            {t("bpm")}
          </label>
          <input
            id="ms-bpm"
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            value={project.bpm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) props.onBpmChange(clamp(Math.round(v), MIN_BPM, MAX_BPM));
            }}
            className="h-8 w-14 bg-transparent text-center font-mono text-sm text-orange-300 focus:outline-none"
          />
          <button onClick={tapTempo} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-800 hover:text-white">
            {t("tap")}
          </button>
        </div>

        <div
          className="flex h-9 min-w-[70px] items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-2 font-mono text-sm text-cyan-300"
          aria-label={t("position")}
          title={t("position")}
        >
          {position}
        </div>

        <button
          onClick={() => props.onMetronomeChange(!props.metronome)}
          aria-label={t("metronome")}
          aria-pressed={props.metronome}
          title={t("metronome")}
          className={cn(iconBtn, props.metronome && "border-cyan-500 bg-cyan-600/30 text-cyan-300")}
        >
          <Timer className="h-4 w-4" />
        </button>

        <Knob label={t("swing")} value={project.swing} min={0} max={0.6} defaultValue={0} size={30} onChange={props.onSwingChange} format={fmtPercent} hideLabel />
        <Knob label={t("masterVolume")} value={project.masterVolume} min={0} max={1.2} defaultValue={0.9} size={30} color="#f97316" onChange={props.onMasterChange} format={fmtPercent} hideLabel />

        <Visualizer getAnalyser={props.getAnalyser} label={t("visualizer")} />

        <div className="ml-auto flex items-center gap-1">
          <button onClick={props.onUndo} disabled={!props.canUndo} aria-label={t("undo")} title={`${t("undo")} (Ctrl+Z)`} className={iconBtn}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={props.onRedo} disabled={!props.canRedo} aria-label={t("redo")} title={`${t("redo")} (Ctrl+Y)`} className={iconBtn}>
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={props.onOpenProjects}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 hover:bg-slate-700"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">{t("projects")}</span>
          </button>
          <button
            onClick={props.onOpenExport}
            className="flex h-9 items-center gap-1.5 rounded-md bg-cyan-600 px-3 text-sm font-medium text-white hover:bg-cyan-500"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("exportWav")}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 px-2 py-1.5 sm:px-3">
        <div className="flex gap-1" role="tablist" aria-label={t("views")}>
          {views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => props.onViewChange(v.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm",
                view === v.id ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              )}
            >
              {v.icon}
              <span className="hidden md:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span className="hidden text-[10px] font-semibold uppercase text-slate-500 sm:inline">{t("pattern")}</span>
          <select
            value={props.activePatternId}
            onChange={(e) => props.onPatternSelect(e.target.value)}
            aria-label={t("pattern")}
            className="h-8 max-w-[140px] rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white"
          >
            {project.patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {patternName(project, p.id, t)}
              </option>
            ))}
          </select>
          <input
            value={activePattern?.name ?? ""}
            placeholder={activePattern ? patternName(project, activePattern.id, t) : ""}
            onChange={(e) => props.onPatternRename(e.target.value)}
            aria-label={t("renamePattern")}
            className="hidden h-8 w-28 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-white md:block"
          />
          <select
            value={activePattern?.length ?? 16}
            onChange={(e) => props.onPatternLength(Number(e.target.value))}
            aria-label={t("patternLength")}
            className="h-8 rounded-md border border-slate-700 bg-slate-950 px-1 text-sm text-white"
          >
            {[16, 32, 64].map((n) => (
              <option key={n} value={n}>
                {t("barsN", { n: n / STEPS_PER_BAR })}
              </option>
            ))}
          </select>
          <button onClick={props.onPatternAdd} aria-label={t("addPattern")} title={t("addPattern")} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={props.onPatternClone} aria-label={t("clonePattern")} title={t("clonePattern")} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={props.onPatternDelete}
            disabled={project.patterns.length <= 1}
            aria-label={t("deletePattern")}
            title={t("deletePattern")}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <span className="ml-1 hidden items-center gap-1 text-[10px] text-slate-500 xl:flex" title={t("keyboardHint")}>
            <Keyboard className="h-3.5 w-3.5" /> {t("keyboardHint")}
          </span>
        </div>
      </div>
    </div>
  );
};
