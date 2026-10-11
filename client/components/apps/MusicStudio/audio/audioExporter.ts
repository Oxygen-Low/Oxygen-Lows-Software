import type { MusicProject, PlayMode } from "../types";
import { secondsPerStep } from "../constants";
import { collectStepEvents, loopLengthSteps, swingOffset } from "./audioScheduler";
import { MixerGraph } from "./mixerEffects";
import { playVoice } from "./synthEngine";

export interface RenderOptions {
  sampleRate?: number;
  /** Extra seconds rendered after the last step so reverb/delay tails ring out. */
  tail?: number;
  /** Number of times to repeat the loop (pattern mode). */
  loops?: number;
}

export function isOfflineRenderSupported(): boolean {
  return typeof OfflineAudioContext !== "undefined";
}

/** Renders the song or current pattern faster than real time. */
export async function renderProject(
  project: MusicProject,
  mode: PlayMode,
  patternId: string,
  options: RenderOptions = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const tail = options.tail ?? 2.5;
  const loops = Math.max(1, options.loops ?? 1);
  const loop = loopLengthSteps(project, mode, patternId);
  const totalSteps = loop * loops;
  const sps = secondsPerStep(project.bpm);
  const duration = totalSteps * sps + tail;

  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const graph = new MixerGraph(ctx, ctx.destination);
  for (const ch of project.channels) graph.getChannelInput(ch);
  graph.update(project);

  const lastPitch = new Map<string, number>();
  for (let i = 0; i < totalSteps; i++) {
    const step = i % loop;
    const time = i * sps + swingOffset(step, project.swing, sps);
    const events = collectStepEvents(project, mode, patternId, step);
    for (const ev of events) {
      const ch = project.channels.find((c) => c.id === ev.channelId);
      if (!ch) continue;
      playVoice(ctx, graph.getChannelInput(ch), ch.params, ev.pitch, time + ev.time, ev.duration, ev.velocity, {
        glideFrom: lastPitch.get(ch.id),
      });
      lastPitch.set(ch.id, ev.pitch);
    }
  }
  return ctx.startRendering();
}

/** Encodes an AudioBuffer as a 16-bit PCM WAV file. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
