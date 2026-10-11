import type {
  Channel,
  MixerTrack,
  MusicProject,
  Note,
  Pattern,
  PlaylistClip,
  Step,
} from "./types";
import { STEPS_PER_BAR, uid } from "./constants";
import { createChannel, createPattern, emptySteps } from "./audio/demoProjects";
import { getPreset } from "./audio/presetLibrary";
import type { MusicT } from "./useMusicT";

/* ---------------------------------------------------------------- Names */

export function channelName(ch: Channel, t: MusicT): string {
  return ch.name || t(`presets.${ch.presetId}`);
}

export function patternName(project: MusicProject, patternId: string, t: MusicT): string {
  const idx = project.patterns.findIndex((p) => p.id === patternId);
  const pattern = project.patterns[idx];
  if (!pattern) return "";
  return pattern.name || t("patternN", { n: idx + 1 });
}

export function mixerName(index: number, track: MixerTrack, t: MusicT): string {
  if (index === 0) return t("master");
  return track.name || t("insertN", { n: index });
}

/* ------------------------------------------------------------- Channels */

const touch = (p: MusicProject): MusicProject => ({ ...p, updatedAt: new Date().toISOString() });

export function updateChannel(p: MusicProject, id: string, partial: Partial<Channel>): MusicProject {
  return touch({
    ...p,
    channels: p.channels.map((c) => (c.id === id ? { ...c, ...partial } : c)),
  });
}

export function addChannel(p: MusicProject, presetId: string): { project: MusicProject; id: string } {
  const preset = getPreset(presetId);
  const used = new Set(p.channels.map((c) => c.mixerTrack));
  let track = 0;
  for (let i = 1; i <= 8; i++) {
    if (!used.has(i)) {
      track = i;
      break;
    }
  }
  const ch = createChannel(preset.id, p.channels.length, { mixerTrack: track });
  return { project: touch({ ...p, channels: [...p.channels, ch] }), id: ch.id };
}

export function cloneChannel(p: MusicProject, id: string): MusicProject {
  const idx = p.channels.findIndex((c) => c.id === id);
  if (idx < 0) return p;
  const src = p.channels[idx];
  const copy: Channel = { ...src, id: uid("ch"), params: { ...src.params }, solo: false };
  const channels = [...p.channels];
  channels.splice(idx + 1, 0, copy);
  const patterns = p.patterns.map((pt) => ({
    ...pt,
    steps: pt.steps[id] ? { ...pt.steps, [copy.id]: pt.steps[id].map((s) => ({ ...s })) } : pt.steps,
    notes: pt.notes[id]
      ? { ...pt.notes, [copy.id]: pt.notes[id].map((n) => ({ ...n, id: uid("n") })) }
      : pt.notes,
  }));
  return touch({ ...p, channels, patterns });
}

export function removeChannel(p: MusicProject, id: string): MusicProject {
  const patterns = p.patterns.map((pt) => {
    const steps = { ...pt.steps };
    const notes = { ...pt.notes };
    delete steps[id];
    delete notes[id];
    return { ...pt, steps, notes };
  });
  return touch({ ...p, channels: p.channels.filter((c) => c.id !== id), patterns });
}

export function moveChannel(p: MusicProject, id: string, dir: -1 | 1): MusicProject {
  const idx = p.channels.findIndex((c) => c.id === id);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= p.channels.length) return p;
  const channels = [...p.channels];
  [channels[idx], channels[target]] = [channels[target], channels[idx]];
  return touch({ ...p, channels });
}

export function loadPresetIntoChannel(p: MusicProject, id: string, presetId: string): MusicProject {
  const preset = getPreset(presetId);
  return updateChannel(p, id, {
    presetId: preset.id,
    params: { ...preset.params },
    stepNote: preset.rootNote,
  });
}

/* ------------------------------------------------------------- Patterns */

function mapPattern(p: MusicProject, patternId: string, fn: (pt: Pattern) => Pattern): MusicProject {
  return touch({ ...p, patterns: p.patterns.map((pt) => (pt.id === patternId ? fn(pt) : pt)) });
}

export function getSteps(pattern: Pattern, channelId: string): Step[] {
  const existing = pattern.steps[channelId] || [];
  if (existing.length === pattern.length) return existing;
  const out = emptySteps(pattern.length);
  for (let i = 0; i < Math.min(existing.length, pattern.length); i++) out[i] = existing[i];
  return out;
}

export function toggleStep(p: MusicProject, patternId: string, channelId: string, index: number): MusicProject {
  return mapPattern(p, patternId, (pt) => {
    const steps = [...getSteps(pt, channelId)];
    steps[index] = { ...steps[index], on: !steps[index].on };
    return { ...pt, steps: { ...pt.steps, [channelId]: steps } };
  });
}

export function setStep(p: MusicProject, patternId: string, channelId: string, index: number, step: Step): MusicProject {
  return mapPattern(p, patternId, (pt) => {
    const steps = [...getSteps(pt, channelId)];
    steps[index] = step;
    return { ...pt, steps: { ...pt.steps, [channelId]: steps } };
  });
}

export function fillSteps(p: MusicProject, patternId: string, channelId: string, every: number): MusicProject {
  return mapPattern(p, patternId, (pt) => {
    const steps = getSteps(pt, channelId).map((s, i) => ({ ...s, on: every > 0 && i % every === 0 }));
    return { ...pt, steps: { ...pt.steps, [channelId]: steps } };
  });
}

export function setNotes(p: MusicProject, patternId: string, channelId: string, notes: Note[]): MusicProject {
  return mapPattern(p, patternId, (pt) => ({ ...pt, notes: { ...pt.notes, [channelId]: notes } }));
}

export function addPattern(p: MusicProject): { project: MusicProject; id: string } {
  const pattern = createPattern(p.patterns.length, 16);
  return { project: touch({ ...p, patterns: [...p.patterns, pattern] }), id: pattern.id };
}

export function clonePattern(p: MusicProject, patternId: string): { project: MusicProject; id: string } {
  const src = p.patterns.find((pt) => pt.id === patternId);
  if (!src) return { project: p, id: patternId };
  const copy: Pattern = {
    ...createPattern(p.patterns.length, src.length),
    steps: Object.fromEntries(Object.entries(src.steps).map(([k, v]) => [k, v.map((s) => ({ ...s }))])),
    notes: Object.fromEntries(
      Object.entries(src.notes).map(([k, v]) => [k, v.map((n) => ({ ...n, id: uid("n") }))]),
    ),
  };
  return { project: touch({ ...p, patterns: [...p.patterns, copy] }), id: copy.id };
}

export function removePattern(p: MusicProject, patternId: string): MusicProject {
  if (p.patterns.length <= 1) return p;
  return touch({
    ...p,
    patterns: p.patterns.filter((pt) => pt.id !== patternId),
    playlist: p.playlist.filter((c) => c.patternId !== patternId),
  });
}

export function renamePattern(p: MusicProject, patternId: string, name: string): MusicProject {
  return mapPattern(p, patternId, (pt) => ({ ...pt, name }));
}

export function setPatternLength(p: MusicProject, patternId: string, length: number): MusicProject {
  return mapPattern(p, patternId, (pt) => ({ ...pt, length }));
}

export function clearPattern(p: MusicProject, patternId: string): MusicProject {
  return mapPattern(p, patternId, (pt) => ({ ...pt, steps: {}, notes: {} }));
}

/* ------------------------------------------------------------- Playlist */

export function addClip(p: MusicProject, patternId: string, track: number, start: number): MusicProject {
  const pattern = p.patterns.find((pt) => pt.id === patternId);
  const length = Math.max(1, Math.ceil((pattern?.length ?? STEPS_PER_BAR) / STEPS_PER_BAR));
  const clip: PlaylistClip = { id: uid("clip"), patternId, track, start, length };
  return touch({ ...p, playlist: [...p.playlist, clip] });
}

export function updateClip(p: MusicProject, id: string, partial: Partial<PlaylistClip>): MusicProject {
  return touch({ ...p, playlist: p.playlist.map((c) => (c.id === id ? { ...c, ...partial } : c)) });
}

export function removeClip(p: MusicProject, id: string): MusicProject {
  return touch({ ...p, playlist: p.playlist.filter((c) => c.id !== id) });
}

/* ---------------------------------------------------------------- Mixer */

export function updateMixer(p: MusicProject, index: number, partial: Partial<MixerTrack>): MusicProject {
  return touch({ ...p, mixer: p.mixer.map((m, i) => (i === index ? { ...m, ...partial } : m)) });
}
