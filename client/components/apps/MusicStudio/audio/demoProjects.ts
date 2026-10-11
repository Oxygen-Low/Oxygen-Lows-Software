import type {
  Channel,
  MixerTrack,
  MusicProject,
  Note,
  Pattern,
  PlaylistClip,
  Step,
} from "../types";
import {
  CHANNEL_COLORS,
  MIXER_INSERTS,
  PATTERN_COLORS,
  PLAYLIST_TRACKS,
  uid,
} from "../constants";
import { getPreset } from "./presetLibrary";

export type DemoId = "cyberpunk" | "lofi" | "synthwave";
export const DEMO_IDS: DemoId[] = ["cyberpunk", "lofi", "synthwave"];

export function createMixerTrack(partial: Partial<MixerTrack> = {}): MixerTrack {
  return {
    name: "",
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    reverb: 0,
    reverbSize: 2,
    delay: 0,
    delayFeedback: 0.35,
    delayTime: 0.75,
    distortion: 0,
    chorus: 0,
    filterType: "lowpass",
    filterCutoff: 20000,
    limiter: false,
    ...partial,
  };
}

export function createMixer(): MixerTrack[] {
  const tracks = [createMixerTrack({ volume: 0.9, limiter: true })];
  for (let i = 0; i < MIXER_INSERTS; i++) tracks.push(createMixerTrack());
  return tracks;
}

export function createChannel(
  presetId: string,
  index: number,
  partial: Partial<Channel> = {},
): Channel {
  const preset = getPreset(presetId);
  return {
    id: uid("ch"),
    name: "",
    presetId: preset.id,
    params: { ...preset.params },
    stepNote: preset.rootNote,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    mixerTrack: 0,
    color: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
    ...partial,
  };
}

export function emptySteps(length: number): Step[] {
  return Array.from({ length }, () => ({ on: false, velocity: 0.8 }));
}

export function createPattern(index: number, length = 16): Pattern {
  return {
    id: uid("pat"),
    name: "",
    length,
    color: PATTERN_COLORS[index % PATTERN_COLORS.length],
    steps: {},
    notes: {},
  };
}

/** "x" = loud hit, "o" = soft hit, anything else = rest. */
function steps(pattern: string, length = pattern.length): Step[] {
  const out = emptySteps(length);
  for (let i = 0; i < length; i++) {
    const c = pattern[i % pattern.length];
    if (c === "x") out[i] = { on: true, velocity: 0.9 };
    else if (c === "o") out[i] = { on: true, velocity: 0.5 };
  }
  return out;
}

function notes(list: [number, number, number, number?][]): Note[] {
  return list.map(([pitch, start, length, velocity]) => ({
    id: uid("n"),
    pitch,
    start,
    length,
    velocity: velocity ?? 0.8,
  }));
}

function chord(pitches: number[], start: number, length: number, velocity = 0.7) {
  return pitches.map((p) => [p, start, length, velocity] as [number, number, number, number]);
}

function clip(patternId: string, track: number, start: number, length: number): PlaylistClip {
  return { id: uid("clip"), patternId, track, start, length };
}

function baseProject(name: string, bpm: number): MusicProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    bpm,
    swing: 0,
    masterVolume: 0.9,
    channels: [],
    patterns: [],
    playlist: [],
    playlistTrackMutes: Array.from({ length: PLAYLIST_TRACKS }, () => false),
    mixer: createMixer(),
    createdAt: now,
    updatedAt: now,
  };
}

/** A blank project with a ready-to-use drum kit, bass and pluck. */
export function createEmptyProject(name: string): MusicProject {
  const project = baseProject(name, 128);
  project.channels = [
    createChannel("kick808", 0, { mixerTrack: 1 }),
    createChannel("clapVintage", 1, { mixerTrack: 2 }),
    createChannel("hatClosed", 2, { mixerTrack: 3, volume: 0.6 }),
    createChannel("hatOpen", 3, { mixerTrack: 3, volume: 0.5 }),
    createChannel("subBass808", 4, { mixerTrack: 4 }),
    createChannel("trancePluck", 5, { mixerTrack: 5 }),
  ];
  const pattern = createPattern(0, 16);
  project.patterns = [pattern];
  project.playlist = [clip(pattern.id, 0, 0, 1)];
  return project;
}

function cyberpunk(name: string): MusicProject {
  const p = baseProject(name, 128);
  const kick = createChannel("kickPunch", 0, { mixerTrack: 1 });
  const clap = createChannel("clapVintage", 1, { mixerTrack: 2 });
  const hat = createChannel("hatClosed", 2, { mixerTrack: 3, volume: 0.55 });
  const open = createChannel("hatOpen", 3, { mixerTrack: 3, volume: 0.5 });
  const bass = createChannel("acidBass", 4, { mixerTrack: 4 });
  const lead = createChannel("superSaw", 5, { mixerTrack: 5, volume: 0.7 });
  const pad = createChannel("ambientPad", 6, { mixerTrack: 6, volume: 0.7 });
  const crash = createChannel("crash", 7, { mixerTrack: 3, volume: 0.6 });
  p.channels = [kick, clap, hat, open, bass, lead, pad, crash];

  const beat = createPattern(0, 16);
  beat.steps[kick.id] = steps("x...x...x...x...");
  beat.steps[clap.id] = steps("....x.......x...");
  beat.steps[hat.id] = steps(".o.o.o.o.o.o.o.o");
  beat.steps[open.id] = steps("..x...x...x...x.");
  beat.notes[bass.id] = notes([
    [33, 0, 1], [33, 2, 1], [45, 3, 1, 0.95], [33, 4, 1], [43, 6, 1],
    [33, 8, 1], [33, 10, 1], [45, 11, 1, 0.95], [36, 12, 1], [38, 14, 1],
  ]);

  const melody = createPattern(1, 32);
  melody.notes[pad.id] = notes([...chord([57, 60, 64], 0, 16, 0.6), ...chord([53, 57, 60], 16, 16, 0.6)]);
  melody.notes[lead.id] = notes([
    [69, 0, 2], [72, 2, 2], [76, 4, 4], [74, 8, 2], [72, 10, 2], [71, 12, 4],
    [69, 16, 2], [72, 18, 2], [77, 20, 4], [76, 24, 4], [72, 28, 4],
  ]);

  const impact = createPattern(2, 16);
  impact.steps[crash.id] = steps("x...............");

  p.patterns = [beat, melody, impact];
  p.playlist = [
    clip(beat.id, 0, 0, 12),
    clip(melody.id, 1, 4, 8),
    clip(impact.id, 2, 4, 1),
    clip(impact.id, 2, 8, 1),
  ];
  p.mixer[1].eqLow = 3;
  p.mixer[2].reverb = 0.25;
  p.mixer[3].eqHigh = 2;
  p.mixer[4].distortion = 0.3;
  p.mixer[4].eqLow = 2;
  p.mixer[5].reverb = 0.35;
  p.mixer[5].delay = 0.25;
  p.mixer[6].reverb = 0.6;
  p.mixer[6].reverbSize = 4;
  p.mixer[6].chorus = 0.4;
  return p;
}

function lofi(name: string): MusicProject {
  const p = baseProject(name, 82);
  p.swing = 0.35;
  const kick = createChannel("kickPunch", 0, { mixerTrack: 1, volume: 0.75 });
  const snare = createChannel("snareCrisp", 1, { mixerTrack: 2, volume: 0.6 });
  const hat = createChannel("hatClosed", 2, { mixerTrack: 3, volume: 0.45 });
  const keys = createChannel("fmEPiano", 3, { mixerTrack: 4 });
  const bass = createChannel("subBass808", 4, { mixerTrack: 5, volume: 0.75 });
  const shaker = createChannel("shaker", 5, { mixerTrack: 3, volume: 0.4 });
  p.channels = [kick, snare, hat, keys, bass, shaker];

  const drums = createPattern(0, 32);
  drums.steps[kick.id] = steps("x.........x.....x.....x...x.....");
  drums.steps[snare.id] = steps("....x.......x.......x.......x...");
  drums.steps[hat.id] = steps("xoxoxoxoxoxoxoxo", 32);
  drums.steps[shaker.id] = steps("..o...o...o...o.", 32);

  const chords = createPattern(1, 64);
  chords.notes[keys.id] = notes([
    ...chord([53, 57, 60, 64], 0, 14),
    ...chord([52, 55, 59, 62], 16, 14),
    ...chord([50, 53, 57, 60], 32, 14),
    ...chord([48, 52, 55, 59], 48, 14),
  ]);
  chords.notes[bass.id] = notes([
    [41, 0, 6], [41, 10, 4], [40, 16, 6], [40, 26, 4],
    [38, 32, 6], [38, 42, 4], [36, 48, 6], [43, 58, 4],
  ]);

  p.patterns = [drums, chords];
  p.playlist = [clip(drums.id, 0, 2, 6), clip(chords.id, 1, 0, 8)];
  p.mixer[0].eqHigh = -3;
  p.mixer[0].distortion = 0.08;
  p.mixer[2].reverb = 0.2;
  p.mixer[4].filterCutoff = 3500;
  p.mixer[4].chorus = 0.5;
  p.mixer[4].reverb = 0.3;
  return p;
}

function synthwave(name: string): MusicProject {
  const p = baseProject(name, 100);
  const kick = createChannel("kickPunch", 0, { mixerTrack: 1 });
  const snare = createChannel("snareCrisp", 1, { mixerTrack: 2, volume: 0.7 });
  const hat = createChannel("hatClosed", 2, { mixerTrack: 3, volume: 0.45 });
  const bass = createChannel("reeseBass", 3, { mixerTrack: 4, volume: 0.7 });
  const arp = createChannel("trancePluck", 4, { mixerTrack: 5, volume: 0.55 });
  const pad = createChannel("lushStrings", 5, { mixerTrack: 6, volume: 0.6 });
  p.channels = [kick, snare, hat, bass, arp, pad];

  const drums = createPattern(0, 16);
  drums.steps[kick.id] = steps("x.......x.......");
  drums.steps[snare.id] = steps("....x.......x...");
  drums.steps[hat.id] = steps("x.o.x.o.x.o.x.o.");

  const progression = createPattern(1, 64);
  const roots = [33, 29, 36, 31];
  const chordTones = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [55, 60, 64, 67],
    [55, 59, 62, 67],
  ];
  const bassNotes: [number, number, number, number?][] = [];
  const arpNotes: [number, number, number, number?][] = [];
  const padNotes: [number, number, number, number?][] = [];
  roots.forEach((root, bar) => {
    for (let i = 0; i < 8; i++) bassNotes.push([i % 2 === 0 ? root : root + 12, bar * 16 + i * 2, 1, 0.85]);
    for (let i = 0; i < 16; i++) {
      const tones = chordTones[bar];
      arpNotes.push([tones[i % 4] + (i >= 8 ? 12 : 0), bar * 16 + i, 1, i % 4 === 0 ? 0.9 : 0.65]);
    }
    padNotes.push(...chord(chordTones[bar].slice(0, 3), bar * 16, 16, 0.55));
  });
  progression.notes[bass.id] = notes(bassNotes);
  progression.notes[arp.id] = notes(arpNotes);
  progression.notes[pad.id] = notes(padNotes);

  p.patterns = [drums, progression];
  p.playlist = [clip(drums.id, 0, 0, 8), clip(progression.id, 1, 0, 8)];
  p.mixer[2].reverb = 0.45;
  p.mixer[2].reverbSize = 3;
  p.mixer[4].eqLow = 2;
  p.mixer[5].delay = 0.3;
  p.mixer[5].delayTime = 0.75;
  p.mixer[6].reverb = 0.5;
  p.mixer[6].chorus = 0.5;
  return p;
}

export function createDemoProject(id: DemoId, name: string): MusicProject {
  switch (id) {
    case "lofi":
      return lofi(name);
    case "synthwave":
      return synthwave(name);
    default:
      return cyberpunk(name);
  }
}

/** Validates and normalizes a loaded project (from JSON or cloud storage). */
export function normalizeProject(raw: unknown): MusicProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<MusicProject>;
  if (!Array.isArray(r.channels) || !Array.isArray(r.patterns) || r.patterns.length === 0) {
    return null;
  }
  const base = baseProject(typeof r.name === "string" ? r.name : "", 120);
  const mixer = Array.isArray(r.mixer) ? r.mixer : [];
  return {
    ...base,
    ...r,
    version: 1,
    bpm: typeof r.bpm === "number" ? Math.min(240, Math.max(40, r.bpm)) : 120,
    swing: typeof r.swing === "number" ? r.swing : 0,
    masterVolume: typeof r.masterVolume === "number" ? r.masterVolume : 0.9,
    channels: r.channels.map((c, i) => {
      const preset = getPreset(c.presetId);
      return {
        ...createChannel(preset.id, i),
        ...c,
        params: { ...preset.params, ...(c.params || {}) },
      };
    }),
    patterns: r.patterns.map((pt, i) => ({
      ...createPattern(i, 16),
      ...pt,
      steps: pt.steps || {},
      notes: pt.notes || {},
    })),
    playlist: Array.isArray(r.playlist) ? r.playlist : [],
    playlistTrackMutes: Array.from(
      { length: PLAYLIST_TRACKS },
      (_, i) => !!r.playlistTrackMutes?.[i],
    ),
    mixer: base.mixer.map((def, i) => ({ ...def, ...(mixer[i] || {}) })),
  };
}
