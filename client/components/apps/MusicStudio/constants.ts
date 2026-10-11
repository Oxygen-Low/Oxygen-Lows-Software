export const STEPS_PER_BAR = 16;
export const MIXER_INSERTS = 8;
export const PLAYLIST_TRACKS = 8;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const PIANO_LOW = 24; // C1
export const PIANO_HIGH = 96; // C7

export const CHANNEL_COLORS = [
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#a3e635",
];

export const PATTERN_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#d946ef",
  "#84cc16",
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

let uidCounter = 0;
export function uid(prefix = "id"): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${uidCounter.toString(36)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}

export function gainToDb(gain: number): string {
  if (gain <= 0.0001) return "-∞";
  const db = 20 * Math.log10(gain);
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)}`;
}

/** Chord intervals for the piano roll chord stamp tool. */
export const CHORDS: Record<string, number[]> = {
  none: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  octave: [0, 12],
};

/** Delay time options as fractions of a beat (quarter note). */
export const DELAY_TIMES: { value: number; label: string }[] = [
  { value: 0.25, label: "1/16" },
  { value: 0.5, label: "1/8" },
  { value: 0.75, label: "1/8." },
  { value: 1, label: "1/4" },
  { value: 1.5, label: "1/4." },
  { value: 2, label: "1/2" },
];

/** Computer keyboard -> semitone offset mapping for live playing. */
export const KEYBOARD_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};
