import type { Channel, MusicProject, NoteEvent, Pattern, PlayMode } from "../types";
import { STEPS_PER_BAR, secondsPerStep } from "../constants";
import { getAudioContext } from "./audioContext";
import { MixerGraph } from "./mixerEffects";
import { playVoice, playSampleVoice, type VoiceHandle } from "./synthEngine";

export function songLengthBars(project: MusicProject): number {
  let bars = 1;
  for (const clip of project.playlist) bars = Math.max(bars, clip.start + clip.length);
  return bars;
}

export function loopLengthSteps(
  project: MusicProject,
  mode: PlayMode,
  patternId: string,
): number {
  if (mode === "song") return songLengthBars(project) * STEPS_PER_BAR;
  const pattern = project.patterns.find((p) => p.id === patternId);
  return pattern?.length ?? STEPS_PER_BAR;
}

function audibleChannels(project: MusicProject): Channel[] {
  const anySolo = project.channels.some((c) => c.solo);
  return project.channels.filter((c) => !c.mute && (!anySolo || c.solo));
}

function patternEventsAt(
  pattern: Pattern,
  channels: Channel[],
  step: number,
  sps: number,
  out: NoteEvent[],
) {
  for (const ch of channels) {
    const s = pattern.steps[ch.id]?.[step];
    if (s?.on) {
      out.push({
        channelId: ch.id,
        pitch: ch.stepNote,
        velocity: s.velocity,
        time: 0,
        duration: sps,
      });
    }
    const notes = pattern.notes[ch.id];
    if (notes) {
      for (const n of notes) {
        if (n.start === step) {
          out.push({
            channelId: ch.id,
            pitch: n.pitch,
            velocity: n.velocity,
            time: 0,
            duration: n.length * sps,
          });
        }
      }
    }
  }
}

/** Collects every note that starts on the given (looped) step. */
export function collectStepEvents(
  project: MusicProject,
  mode: PlayMode,
  patternId: string,
  step: number,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const sps = secondsPerStep(project.bpm);
  const channels = audibleChannels(project);
  if (mode === "pattern") {
    const pattern = project.patterns.find((p) => p.id === patternId);
    if (pattern) patternEventsAt(pattern, channels, step % pattern.length, sps, events);
    return events;
  }
  const bar = Math.floor(step / STEPS_PER_BAR);
  for (const clip of project.playlist) {
    if (project.playlistTrackMutes[clip.track]) continue;
    if (bar < clip.start || bar >= clip.start + clip.length) continue;
    const pattern = project.patterns.find((p) => p.id === clip.patternId);
    if (!pattern) continue;
    const local = step - clip.start * STEPS_PER_BAR;
    patternEventsAt(pattern, channels, local % pattern.length, sps, events);
  }
  return events;
}

/** Swing delays every off-beat 16th note. */
export function swingOffset(step: number, swing: number, sps: number): number {
  return step % 2 === 1 ? swing * sps * 0.66 : 0;
}

export type EngineStateGetter = () => {
  project: MusicProject;
  mode: PlayMode;
  patternId: string;
  metronome: boolean;
};

interface TimelineEntry {
  step: number;
  time: number;
}

/**
 * Real-time engine: owns the mixer graph and runs a lookahead scheduler
 * locked to the audio clock for sample-accurate, jitter-free timing.
 */
export class StudioEngine {
  readonly ctx: AudioContext;
  readonly graph: MixerGraph;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private timeline: TimelineEntry[] = [];
  private lastPitch = new Map<string, number>();
  playing = false;

  constructor(
    ctx: AudioContext,
    private getState: EngineStateGetter,

  ) {
    this.ctx = ctx;
    this.graph = new MixerGraph(ctx, ctx.destination);
  }

  static create(getState: EngineStateGetter): StudioEngine | null {
    const ctx = getAudioContext();
    if (!ctx) return null;
    return new StudioEngine(ctx, getState);
  }

  update(project: MusicProject) {
    this.graph.update(project);
  }

  start(fromStep = 0) {
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.stop();
    this.playing = true;
    this.step = fromStep;
    this.timeline = [];
    this.lastPitch.clear();
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timeline = [];
  }

  /** Step currently audible (for playhead display), or -1 when stopped. */
  currentStep(): number {
    if (!this.playing) return -1;
    const now = this.ctx.currentTime;
    let current = -1;
    for (const entry of this.timeline) {
      if (entry.time <= now) current = entry.step;
      else break;
    }
    return current;
  }

  private tick() {
    const { project, mode, patternId, metronome } = this.getState();
    const sps = secondsPerStep(project.bpm);
    const loop = loopLengthSteps(project, mode, patternId);
    // Hidden tabs throttle timers, so schedule further ahead when not visible.
    const ahead = typeof document !== "undefined" && document.hidden ? 1.2 : 0.12;
    while (this.nextStepTime < this.ctx.currentTime + ahead) {
      const step = this.step % loop;
      const time = this.nextStepTime + swingOffset(step, project.swing, sps);
      this.scheduleStep(project, mode, patternId, step, time);
      if (metronome && step % 4 === 0) this.click(time, step % STEPS_PER_BAR === 0);
      this.timeline.push({ step, time: this.nextStepTime });
      if (this.timeline.length > 128) this.timeline.splice(0, this.timeline.length - 128);
      this.nextStepTime += sps;
      this.step = step + 1;
    }
  }

  private scheduleStep(
    project: MusicProject,
    mode: PlayMode,
    patternId: string,
    step: number,
    time: number,
  ) {
    const events = collectStepEvents(project, mode, patternId, step);
    for (const ev of events) {
      const ch = project.channels.find((c) => c.id === ev.channelId);
      if (!ch) continue;
      const sample = ch.sampleId && project.samples?.[ch.sampleId];
      if (sample?.audioBuffer) {
        playSampleVoice(
          this.ctx,
          this.graph.getChannelInput(ch),
          sample.audioBuffer,
          ev.pitch,
          ch.stepNote,
          time + ev.time,
          ev.velocity,
        );
      } else {
        playVoice(
          this.ctx,
          this.graph.getChannelInput(ch),
          ch.params,
          ev.pitch,
          time + ev.time,
          ev.duration,
          ev.velocity,
          { glideFrom: this.lastPitch.get(ch.id) },
        );
      }
      this.lastPitch.set(ch.id, ev.pitch);
    }
  }

  private click(time: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.25, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  /** Plays a channel sound immediately (UI auditioning). */
  preview(channel: Channel, midi: number, velocity = 0.85, duration = 0.35, sampleBuffer?: AudioBuffer): VoiceHandle {
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (sampleBuffer) {
      return playSampleVoice(
        this.ctx,
        this.graph.getChannelInput(channel),
        sampleBuffer,
        midi,
        channel.stepNote,
        this.ctx.currentTime + 0.005,
        velocity,
      );
    }
    return playVoice(
      this.ctx,
      this.graph.getChannelInput(channel),
      channel.params,
      midi,
      this.ctx.currentTime + 0.005,
      duration,
      velocity,
    );
  }

  /** Starts a held note for live keyboard playing; call release() on key up. */
  noteOn(channel: Channel, midi: number, velocity = 0.85): VoiceHandle {
    return this.preview(channel, midi, velocity, 30);
  }

  dispose() {
    this.stop();
  }
}
