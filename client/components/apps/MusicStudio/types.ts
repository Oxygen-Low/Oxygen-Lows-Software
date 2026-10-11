/**
 * Music Studio core data model.
 *
 * Everything in a project is plain JSON so it can be saved locally,
 * synced to cloud storage, and rendered offline without any external assets.
 */

export type Waveform = "sine" | "square" | "sawtooth" | "triangle" | "noise";
export type FilterKind = "lowpass" | "highpass" | "bandpass";
export type PresetCategory = "drums" | "bass" | "leads" | "keys" | "pads" | "fx";

export interface SynthParams {
  /** Primary oscillator waveform. "noise" disables the tonal oscillator. */
  waveform: Waveform;
  /** Number of stacked (detuned) primary oscillators, 1-7. */
  unison: number;
  /** Detune spread for unison voices in cents. */
  unisonDetune: number;
  /** Optional secondary oscillator. */
  osc2Waveform: Waveform;
  /** Secondary oscillator level 0-1 (0 disables it). */
  osc2Mix: number;
  /** Secondary oscillator detune in semitones. */
  osc2Semitones: number;
  /** White noise level 0-1. */
  noiseMix: number;
  /** Optional dedicated decay (seconds) for the noise layer; 0 follows the amp envelope. */
  noiseDecay: number;
  /** Optional highpass filter frequency for the noise layer (Hz); 0 disables it. */
  noiseHighpass: number;
  /** FM modulator frequency ratio relative to the note frequency (0 disables FM). */
  fmRatio: number;
  /** FM modulation index. */
  fmIndex: number;
  /** Amp envelope (seconds / 0-1 sustain). */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** When true, note length is ignored and the envelope plays attack+decay then releases. */
  oneShot: boolean;
  filterType: FilterKind;
  cutoff: number;
  resonance: number;
  /** Extra cutoff (Hz) added at the envelope peak, decays with the amp decay. */
  filterEnvAmount: number;
  /** Pitch envelope start offset in semitones (decays to 0). */
  pitchEnvAmount: number;
  pitchEnvDecay: number;
  /** Vibrato LFO. */
  lfoRate: number;
  lfoDepth: number;
  /** Portamento/glide time in seconds. */
  glide: number;
  /** Global pitch offset in semitones. */
  pitchOffset: number;
  /** Output gain 0-1.5. */
  gain: number;
}

export interface Preset {
  id: string;
  category: PresetCategory;
  /** MIDI note used by step sequencer triggers. */
  rootNote: number;
  params: SynthParams;
}

export interface Channel {
  id: string;
  name: string;
  presetId: string;
  params: SynthParams;
  /** MIDI note the step sequencer triggers. */
  stepNote: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Mixer insert index (0 = Master, 1-8 = Inserts). */
  mixerTrack: number;
  color: string;
}

export interface Step {
  on: boolean;
  velocity: number;
}

export interface Note {
  id: string;
  pitch: number;
  /** Start position in steps (16th notes). */
  start: number;
  /** Length in steps. */
  length: number;
  velocity: number;
}

export interface Pattern {
  id: string;
  name: string;
  /** Length in steps (16, 32 or 64). */
  length: number;
  color: string;
  steps: Record<string, Step[]>;
  notes: Record<string, Note[]>;
}

export interface PlaylistClip {
  id: string;
  patternId: string;
  track: number;
  /** Start bar (0-based). */
  start: number;
  /** Length in bars. */
  length: number;
}

export interface MixerTrack {
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** EQ gains in dB (-15..15). */
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  /** Reverb send 0-1 and decay in seconds. */
  reverb: number;
  reverbSize: number;
  /** Delay wet 0-1, feedback 0-0.9, time as fraction of a beat. */
  delay: number;
  delayFeedback: number;
  delayTime: number;
  /** Distortion drive 0-1. */
  distortion: number;
  /** Chorus depth 0-1. */
  chorus: number;
  filterType: "lowpass" | "highpass";
  /** Filter cutoff (Hz). Lowpass 20000 / highpass 20 = bypass. */
  filterCutoff: number;
  /** Master limiter (only used on track 0). */
  limiter: boolean;
}

export interface MusicProject {
  version: 1;
  name: string;
  bpm: number;
  /** Swing amount 0-0.6. */
  swing: number;
  masterVolume: number;
  channels: Channel[];
  patterns: Pattern[];
  playlist: PlaylistClip[];
  playlistTrackMutes: boolean[];
  mixer: MixerTrack[];
  createdAt: string;
  updatedAt: string;
}

export type PlayMode = "pattern" | "song";
export type StudioView = "rack" | "piano" | "playlist" | "mixer";

/** A single scheduled note event produced by the sequencer. */
export interface NoteEvent {
  channelId: string;
  pitch: number;
  velocity: number;
  /** Offset from the event step start, in seconds. */
  time: number;
  duration: number;
}
