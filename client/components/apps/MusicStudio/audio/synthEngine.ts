import type { SynthParams } from "../types";
import { clamp, midiToFreq } from "../constants";
import { getNoiseBuffer } from "./audioContext";

export interface VoiceHandle {
  /** Time (in context seconds) at which the voice will be silent. */
  end: number;
  /** Release a held voice early (used for live keyboard playing). */
  release: (time?: number) => void;
}

export interface VoiceOptions {
  /** Previous pitch on this channel, used for glide. */
  glideFrom?: number;
}

/**
 * Plays one procedurally synthesized note.
 *
 * Each voice is a small Web Audio graph:
 *   [unison oscillators + osc2 + FM] + [noise] -> filter -> amp envelope -> destination
 * All sounds are generated in real time; no audio samples are used.
 */
export function playVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  p: SynthParams,
  midi: number,
  time: number,
  duration: number,
  velocity: number,
  options: VoiceOptions = {},
): VoiceHandle {
  const t = Math.max(time, ctx.currentTime);
  const nyquist = ctx.sampleRate / 2 - 200;
  const freq = clamp(midiToFreq(midi + p.pitchOffset), 8, nyquist);
  const peak = Math.max(0.0001, clamp(velocity, 0, 1) * p.gain * 0.45);
  const a = Math.max(0.001, p.attack);
  const d = Math.max(0.005, p.decay);
  const s = clamp(p.sustain, 0, 1);
  const r = Math.max(0.005, p.release);

  const noteOff = p.oneShot ? t + a + d : t + Math.max(duration, a + 0.01);
  const decayEnd = t + a + d;
  let end = Math.max(noteOff + r, decayEnd + 0.01);
  if (p.noiseDecay > 0 && p.noiseMix > 0) {
    end = Math.max(end, t + p.noiseDecay * 1.2 + 0.02);
  }

  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];

  // --- Filter + amp envelope ---------------------------------------------
  const filter = ctx.createBiquadFilter();
  filter.type = p.filterType;
  filter.Q.value = clamp(p.resonance, 0.0001, 30);
  const baseCutoff = clamp(p.cutoff, 20, nyquist);
  filter.frequency.setValueAtTime(baseCutoff, t);
  if (p.filterEnvAmount > 0) {
    const peakCutoff = clamp(baseCutoff + p.filterEnvAmount, 20, nyquist);
    filter.frequency.linearRampToValueAtTime(peakCutoff, t + a);
    filter.frequency.exponentialRampToValueAtTime(baseCutoff, decayEnd);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  const sustainLevel = Math.max(0.0001, peak * s);
  amp.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
  if (noteOff > decayEnd) amp.gain.setValueAtTime(sustainLevel, noteOff);
  amp.gain.linearRampToValueAtTime(0, end);

  filter.connect(amp);
  amp.connect(destination);
  nodes.push(filter, amp);

  // --- Pitch automation helper --------------------------------------------
  const applyPitch = (param: AudioParam, target: number) => {
    if (p.pitchEnvAmount !== 0) {
      const start = clamp(target * Math.pow(2, p.pitchEnvAmount / 12), 8, nyquist);
      param.setValueAtTime(start, t);
      param.exponentialRampToValueAtTime(target, t + Math.max(0.005, p.pitchEnvDecay));
    } else if (p.glide > 0 && options.glideFrom !== undefined && options.glideFrom !== midi) {
      const ratio = target / freq;
      const from = clamp(midiToFreq(options.glideFrom + p.pitchOffset) * ratio, 8, nyquist);
      param.setValueAtTime(from, t);
      param.exponentialRampToValueAtTime(target, t + p.glide);
    } else {
      param.setValueAtTime(target, t);
    }
  };

  // --- Tonal oscillators ----------------------------------------------------
  const tonalOscs: OscillatorNode[] = [];
  if (p.waveform !== "noise") {
    const unison = clamp(Math.round(p.unison), 1, 7);
    const oscBus = ctx.createGain();
    oscBus.gain.value = 1 / Math.sqrt(unison);
    oscBus.connect(filter);
    nodes.push(oscBus);
    for (let i = 0; i < unison; i++) {
      const osc = ctx.createOscillator();
      osc.type = p.waveform;
      applyPitch(osc.frequency, freq);
      if (unison > 1) {
        osc.detune.value = (i / (unison - 1) - 0.5) * 2 * p.unisonDetune;
      }
      osc.connect(oscBus);
      tonalOscs.push(osc);
      sources.push(osc);
    }
  }

  if (p.osc2Mix > 0 && p.osc2Waveform !== "noise") {
    const osc2 = ctx.createOscillator();
    osc2.type = p.osc2Waveform;
    applyPitch(osc2.frequency, clamp(freq * Math.pow(2, p.osc2Semitones / 12), 8, nyquist));
    const g = ctx.createGain();
    g.gain.value = p.osc2Mix;
    osc2.connect(g);
    g.connect(filter);
    nodes.push(g);
    tonalOscs.push(osc2);
    sources.push(osc2);
  }

  // --- FM modulator ---------------------------------------------------------
  if (p.fmRatio > 0 && p.fmIndex > 0 && tonalOscs.length > 0) {
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(clamp(freq * p.fmRatio, 1, nyquist), t);
    const modGain = ctx.createGain();
    const depth = freq * p.fmRatio * p.fmIndex;
    modGain.gain.setValueAtTime(depth, t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, depth * 0.25), decayEnd + 0.001);
    mod.connect(modGain);
    for (const osc of tonalOscs) modGain.connect(osc.frequency);
    nodes.push(modGain);
    sources.push(mod);
  }

  // --- Vibrato LFO ------------------------------------------------------------
  if (p.lfoDepth > 0 && tonalOscs.length > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = Math.max(0.01, p.lfoRate);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = p.lfoDepth;
    lfo.connect(lfoGain);
    for (const osc of tonalOscs) lfoGain.connect(osc.detune);
    nodes.push(lfoGain);
    sources.push(lfo);
  }

  // --- Noise layer --------------------------------------------------------------
  const noiseLevel = p.waveform === "noise" ? Math.max(p.noiseMix, 1) : p.noiseMix;
  if (noiseLevel > 0) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    noise.loop = true;
    let tail: AudioNode = noise;
    if (p.noiseHighpass > 0) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = clamp(p.noiseHighpass, 20, nyquist);
      tail.connect(hp);
      tail = hp;
      nodes.push(hp);
    }
    const ng = ctx.createGain();
    if (p.noiseDecay > 0 && p.waveform !== "noise") {
      // Independent noise envelope (e.g. snare wires) that bypasses the amp envelope.
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(noiseLevel * peak, t + 0.001);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + p.noiseDecay);
      ng.gain.linearRampToValueAtTime(0, t + p.noiseDecay + 0.01);
      tail.connect(ng);
      ng.connect(destination);
    } else {
      ng.gain.value = noiseLevel;
      tail.connect(ng);
      ng.connect(filter);
    }
    nodes.push(ng);
    sources.push(noise);
  }

  let stopped = false;
  const stopAll = (at: number) => {
    for (const src of sources) {
      try {
        src.stop(at);
      } catch {
        // Source may already be scheduled to stop.
      }
    }
  };

  for (const src of sources) src.start(t);
  stopAll(end + 0.05);

  if (sources.length > 0) {
    sources[0].onended = () => {
      if (stopped) return;
      stopped = true;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // Ignore already disconnected nodes.
        }
      }
    };
  }

  const handle: VoiceHandle = {
    end,
    release: (at?: number) => {
      const rt = Math.max(at ?? ctx.currentTime, ctx.currentTime);
      if (rt >= handle.end) return;
      const g = amp.gain as AudioParam & {
        cancelAndHoldAtTime?: (time: number) => AudioParam;
      };
      if (typeof g.cancelAndHoldAtTime === "function") {
        g.cancelAndHoldAtTime(rt);
      } else {
        g.cancelScheduledValues(rt);
        g.setValueAtTime(g.value, rt);
      }
      g.linearRampToValueAtTime(0, rt + r);
      handle.end = rt + r;
      for (const src of sources) {
        try {
          src.stop(rt + r + 0.05);
        } catch {
          // ignore
        }
      }
    },
  };
  return handle;
}
