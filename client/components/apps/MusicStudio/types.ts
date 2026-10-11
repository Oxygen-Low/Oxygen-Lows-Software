/**
 * Music Studio core data model for production-grade DAW architecture.
 *
 * Supports multi-window docking, custom audio sample buffers, audio clips in playlist,
 * advanced piano roll (velocity stalks, scale snapping), and 10 FX plugin slots per mixer track.
 */

export type Waveform = "sine" | "square" | "sawtooth" | "triangle" | "noise";
export type FilterKind = "lowpass" | "highpass" | "bandpass";
export type PresetCategory = "drums" | "bass" | "leads" | "keys" | "pads" | "fx";

export interface SynthParams {
  waveform: Waveform;
  unison: number;
  unisonDetune: number;
  osc2Waveform: Waveform;
  osc2Mix: number;
  osc2Semitones: number;
  noiseMix: number;
  noiseDecay: number;
  noiseHighpass: number;
  fmRatio: number;
  fmIndex: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  oneShot: boolean;
  filterType: FilterKind;
  cutoff: number;
  resonance: number;
  filterEnvAmount: number;
  pitchEnvAmount: number;
  pitchEnvDecay: number;
  lfoRate: number;
  lfoDepth: number;
  glide: number;
  pitchOffset: number;
  gain: number;
}

export interface Preset {
  id: string;
  category: PresetCategory;
  rootNote: number;
  params: SynthParams;
}

export interface CustomSample {
  id: string;
  name: string;
  dataUrl?: string; // Base64 audio for serialization
  audioBuffer?: AudioBuffer; // In-memory decoded buffer
}

export interface Channel {
  id: string;
  name: string;
  presetId: string;
  sampleId?: string; // Optional custom audio sample
  params: SynthParams;
  stepNote: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  mixerTrack: number; // 0 = Master, 1-8 = Inserts
  color: string;
  swing?: number; // Per-channel swing
}

export interface Step {
  on: boolean;
  velocity: number;
}

export interface Note {
  id: string;
  pitch: number;
  start: number; // In 16th steps
  length: number; // In 16th steps
  velocity: number; // 0.05 to 1.0
}

export interface Pattern {
  id: string;
  name: string;
  length: number; // 16, 32, 64, etc.
  color: string;
  steps: Record<string, Step[]>;
  notes: Record<string, Note[]>;
}

export interface PlaylistClip {
  id: string;
  type?: "pattern" | "audio";
  patternId?: string;
  sampleId?: string;
  track: number; // Track lane (0 to 7)
  start: number; // Start in bars
  length: number; // Length in bars
  color?: string;
}

export type FXPluginType =
  | "none"
  | "eq"
  | "reverb"
  | "delay"
  | "distortion"
  | "chorus"
  | "limiter";

export interface FXSlot {
  id: string;
  type: FXPluginType;
  enabled: boolean;
  wet: number;
  params: Record<string, number>;
}

export interface MixerTrack {
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  // Legacy quick EQ/reverb compatibility
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  reverb: number;
  reverbSize: number;
  delay: number;
  delayFeedback: number;
  delayTime: number;
  distortion: number;
  chorus: number;
  filterType: "lowpass" | "highpass";
  filterCutoff: number;
  limiter: boolean;
  // Up to 10 modular FX plugin slots
  fxSlots: FXSlot[];
}

export interface MusicProject {
  version: 1;
  name: string;
  bpm: number;
  swing: number;
  masterVolume: number;
  channels: Channel[];
  patterns: Pattern[];
  playlist: PlaylistClip[];
  playlistTrackMutes: boolean[];
  mixer: MixerTrack[];
  samples?: Record<string, CustomSample>;
  createdAt: string;
  updatedAt: string;
}

export type PlayMode = "pattern" | "song";

/** Window ID for the floating multi-window DAW desktop */
export type WindowId = "rack" | "piano" | "playlist" | "mixer" | "browser";
export type StudioView = WindowId;

export interface WindowState {
  id: WindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface NoteEvent {
  channelId: string;
  pitch: number;
  velocity: number;
  time: number;
  duration: number;
}
