/**
 * Shared Web Audio context helpers.
 *
 * The real-time context is created lazily on the first user gesture
 * (browsers block audio until then) and re-used for the app lifetime.
 */

let sharedContext: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext || w.webkitAudioContext || null;
}

export function isAudioSupported(): boolean {
  return getCtor() !== null;
}

/** Returns the shared real-time AudioContext, creating and resuming it if needed. */
export function getAudioContext(): AudioContext | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new Ctor({ latencyHint: "interactive" });
  }
  if (sharedContext.state === "suspended") {
    void sharedContext.resume().catch(() => undefined);
  }
  return sharedContext;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Returns a cached 2-second white noise buffer for the given context. */
export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const length = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

const impulseCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** Procedurally generated stereo reverb impulse response (no samples needed). */
export function getImpulseResponse(
  ctx: BaseAudioContext,
  seconds: number,
): AudioBuffer {
  const size = Math.round(Math.min(6, Math.max(0.3, seconds)) * 10) / 10;
  let map = impulseCache.get(ctx);
  if (!map) {
    map = new Map();
    impulseCache.set(ctx, map);
  }
  const cached = map.get(size);
  if (cached) return cached;

  const length = Math.floor(ctx.sampleRate * size);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  const preDelay = Math.floor(ctx.sampleRate * 0.012);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      if (i < preDelay) {
        data[i] = 0;
        continue;
      }
      const progress = i / length;
      const env = Math.pow(1 - progress, 3);
      // Gentle one-pole lowpass that darkens the tail over time.
      const white = Math.random() * 2 - 1;
      const k = 0.15 + 0.8 * (1 - progress);
      lp = lp + k * (white - lp);
      data[i] = lp * env;
    }
  }
  map.set(size, buf);
  return buf;
}
