import type { Channel, MixerTrack, MusicProject } from "../types";
import { clamp } from "../constants";
import { getImpulseResponse } from "./audioContext";

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = amount * 60 + 1;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

const SMOOTH = 0.015;

function setParam(param: AudioParam, value: number, ctx: BaseAudioContext) {
  if (!Number.isFinite(value)) return;
  // Offline renders apply values instantly; real-time changes are smoothed to avoid clicks.
  if ("startRendering" in ctx) {
    param.value = value;
  } else {
    param.setTargetAtTime(value, ctx.currentTime, SMOOTH);
  }
}

/**
 * One mixer insert: drive -> 3-band EQ -> filter -> (dry + chorus + reverb + delay)
 * -> fader -> pan -> meter -> output.
 */
export class InsertStrip {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly analyser: AnalyserNode;
  private shaper: WaveShaperNode;
  private driveMakeup: GainNode;
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private filter: BiquadFilterNode;
  private sum: GainNode;
  private chorusDelay: DelayNode;
  private chorusWet: GainNode;
  private chorusLfoGain: GainNode;
  private reverbSend: GainNode;
  private convolver: ConvolverNode;
  private reverbSize = 0;
  private delaySend: GainNode;
  private delayNode: DelayNode;
  private delayFeedback: GainNode;
  private fader: GainNode;
  private panner: StereoPannerNode;
  private limiter: DynamicsCompressorNode | null = null;
  private lastDrive = -1;

  constructor(
    private ctx: BaseAudioContext,
    isMaster: boolean,
  ) {
    this.input = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    this.driveMakeup = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 150;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 2500;
    this.eqMid.Q.value = 0.9;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 8000;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.7;

    this.sum = ctx.createGain();

    // Chorus: short modulated delay blended with the dry signal.
    this.chorusDelay = ctx.createDelay(0.1);
    this.chorusDelay.delayTime.value = 0.018;
    this.chorusWet = ctx.createGain();
    this.chorusWet.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.8;
    this.chorusLfoGain = ctx.createGain();
    this.chorusLfoGain.gain.value = 0;
    lfo.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorusDelay.delayTime);
    lfo.start(0);

    // Reverb send.
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.convolver = ctx.createConvolver();

    // Tempo-synced feedback delay with damping.
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0;
    this.delayNode = ctx.createDelay(4);
    this.delayFeedback = ctx.createGain();
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 4500;

    this.fader = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = isMaster ? 2048 : 256;
    this.output = ctx.createGain();

    // Wiring
    this.input.connect(this.shaper);
    this.shaper.connect(this.driveMakeup);
    this.driveMakeup.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.filter);

    this.filter.connect(this.sum);
    this.filter.connect(this.chorusDelay);
    this.chorusDelay.connect(this.chorusWet);
    this.chorusWet.connect(this.sum);

    this.filter.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.sum);

    this.filter.connect(this.delaySend);
    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(damp);
    damp.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    damp.connect(this.sum);

    this.sum.connect(this.fader);
    this.fader.connect(this.panner);

    if (isMaster) {
      this.limiter = ctx.createDynamicsCompressor();
      this.panner.connect(this.limiter);
      this.limiter.connect(this.analyser);
    } else {
      this.panner.connect(this.analyser);
    }
    this.analyser.connect(this.output);
  }

  update(track: MixerTrack, bpm: number, audible: boolean) {
    const ctx = this.ctx;
    const drive = clamp(track.distortion, 0, 1);
    if (drive !== this.lastDrive) {
      this.shaper.curve = drive > 0.001 ? makeDriveCurve(drive) : null;
      this.lastDrive = drive;
    }
    setParam(this.driveMakeup.gain, 1 / (1 + drive * 1.5), ctx);
    setParam(this.eqLow.gain, clamp(track.eqLow, -15, 15), ctx);
    setParam(this.eqMid.gain, clamp(track.eqMid, -15, 15), ctx);
    setParam(this.eqHigh.gain, clamp(track.eqHigh, -15, 15), ctx);

    this.filter.type = track.filterType;
    setParam(this.filter.frequency, clamp(track.filterCutoff, 20, 20000), ctx);

    setParam(this.chorusWet.gain, clamp(track.chorus, 0, 1) * 0.7, ctx);
    setParam(this.chorusLfoGain.gain, clamp(track.chorus, 0, 1) * 0.006, ctx);

    const size = clamp(track.reverbSize || 2, 0.3, 6);
    if (track.reverb > 0 && Math.abs(size - this.reverbSize) > 0.05) {
      this.convolver.buffer = getImpulseResponse(ctx, size);
      this.reverbSize = size;
    }
    setParam(this.reverbSend.gain, clamp(track.reverb, 0, 1) * 0.9, ctx);

    const delaySeconds = clamp(((track.delayTime || 0.75) * 60) / bpm, 0.01, 3.9);
    setParam(this.delayNode.delayTime, delaySeconds, ctx);
    setParam(this.delaySend.gain, clamp(track.delay, 0, 1) * 0.8, ctx);
    setParam(this.delayFeedback.gain, clamp(track.delayFeedback, 0, 0.9), ctx);

    setParam(this.fader.gain, audible ? clamp(track.volume, 0, 1.5) : 0, ctx);
    setParam(this.panner.pan, clamp(track.pan, -1, 1), ctx);

    if (this.limiter) {
      const on = track.limiter;
      setParam(this.limiter.threshold, on ? -2 : 0, ctx);
      setParam(this.limiter.ratio, on ? 20 : 1, ctx);
      setParam(this.limiter.knee, on ? 0 : 0, ctx);
      setParam(this.limiter.attack, 0.002, ctx);
      setParam(this.limiter.release, 0.12, ctx);
    }
  }

  /** Peak level 0-1 from the post-fader meter. */
  getPeak(buffer: Float32Array<ArrayBuffer>): number {
    this.analyser.getFloatTimeDomainData(buffer);
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(buffer[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }
}

interface ChannelNode {
  gain: GainNode;
  panner: StereoPannerNode;
  track: number;
}

/** Complete mixer graph: per-channel gain/pan -> 8 inserts -> master bus. */
export class MixerGraph {
  readonly strips: InsertStrip[] = [];
  private channels = new Map<string, ChannelNode>();
  private masterGain: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    insertCount = 8,
  ) {
    for (let i = 0; i <= insertCount; i++) {
      this.strips.push(new InsertStrip(ctx, i === 0));
    }
    this.masterGain = ctx.createGain();
    for (let i = 1; i <= insertCount; i++) {
      this.strips[i].output.connect(this.strips[0].input);
    }
    this.strips[0].output.connect(this.masterGain);
    this.masterGain.connect(destination);
  }

  get masterAnalyser(): AnalyserNode {
    return this.strips[0].analyser;
  }

  getChannelInput(channel: Channel): AudioNode {
    let node = this.channels.get(channel.id);
    if (!node) {
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();
      gain.connect(panner);
      const track = clamp(channel.mixerTrack, 0, this.strips.length - 1);
      panner.connect(this.strips[track].input);
      node = { gain, panner, track };
      gain.gain.value = channel.mute ? 0 : channel.volume;
      panner.pan.value = channel.pan;
      this.channels.set(channel.id, node);
    }
    return node.gain;
  }

  update(project: MusicProject) {
    const anyChannelSolo = project.channels.some((c) => c.solo);
    const liveIds = new Set<string>();
    for (const ch of project.channels) {
      liveIds.add(ch.id);
      const node = this.channels.get(ch.id);
      if (!node) continue;
      const audible = !ch.mute && (!anyChannelSolo || ch.solo);
      setParam(node.gain.gain, audible ? ch.volume : 0, this.ctx);
      setParam(node.panner.pan, clamp(ch.pan, -1, 1), this.ctx);
      const track = clamp(ch.mixerTrack, 0, this.strips.length - 1);
      if (track !== node.track) {
        node.panner.disconnect();
        node.panner.connect(this.strips[track].input);
        node.track = track;
      }
    }
    // Drop nodes for removed channels.
    for (const [id, node] of this.channels) {
      if (!liveIds.has(id)) {
        try {
          node.panner.disconnect();
        } catch {
          // ignore
        }
        this.channels.delete(id);
      }
    }

    const anyInsertSolo = project.mixer.some((m, i) => i > 0 && m.solo);
    project.mixer.forEach((track, i) => {
      const strip = this.strips[i];
      if (!strip) return;
      const audible = i === 0 ? !track.mute : !track.mute && (!anyInsertSolo || track.solo);
      strip.update(track, project.bpm, audible);
    });
    setParam(this.masterGain.gain, clamp(project.masterVolume, 0, 1.5), this.ctx);
  }
}
