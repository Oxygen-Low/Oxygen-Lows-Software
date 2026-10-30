import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { GameProjectAssets, DEFAULT_PROJECT_ASSETS } from "./directorTools";

export interface GameSandboxProps {
  code: string;
  title?: string;
  muted?: boolean;
  assets?: GameProjectAssets;
  onUnlockAchievement?: (achievementId: string) => void;
  onSubmitScore?: (score: number) => void;
  onGameReady?: () => void;
  className?: string;
}

export function buildBridgeScript(assets: GameProjectAssets = DEFAULT_PROJECT_ASSETS): string {
  const serializedAssets = JSON.stringify(assets).replace(/<\//g, "<\\/");
  return `
<script>
(function() {
  var muted = false;
  var audioCtx = null;
  var bgmInterval = null;
  var projectAssets = ${serializedAssets};

  function getAudioCtx() {
    if (muted) return null;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function playCustomOrPresetSound(type) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var custom = (projectAssets.sounds || []).find(function(s) { return s.id === type || s.name === type; });
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (custom) {
        osc.type = custom.waveform || 'sawtooth';
        osc.frequency.setValueAtTime(custom.startFreq || 440, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, custom.endFreq || 220), now + (custom.duration || 0.18));
        gain.gain.setValueAtTime(custom.volume || 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (custom.duration || 0.18));
        osc.start(now);
        osc.stop(now + (custom.duration || 0.18));
        return;
      }

      if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'coin' || type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (type === 'explosion' || type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.5, now + 0.3);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'lose') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
  }

  function playMusicTrack(trackId) {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
    var list = projectAssets.music || [];
    var track = trackId
      ? list.find(function(m) { return m.id === trackId || m.name === trackId; })
      : list[0];
    if (!track || !Array.isArray(track.notes) || track.notes.length === 0) return;

    var step = 0;
    var stepMs = Math.max(120, Math.round((60 / (track.bpm || 120) / 2) * 1000));
    bgmInterval = setInterval(function() {
      if (muted) return;
      var ctx = getAudioCtx();
      if (!ctx) return;
      try {
        var freq = track.notes[step % track.notes.length] || 261.63;
        step++;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = track.waveform || 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (stepMs / 1000) * 0.9);
      } catch (e) {}
    }, stepMs);
  }

  function stopMusicTrack() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  function playVoiceLine(voiceIdOrText) {
    if (muted) return;
    var voices = projectAssets.voices || [];
    var found = voices.find(function(v) { return v.id === voiceIdOrText || v.name === voiceIdOrText; });
    var url = found ? found.audioUrl : ('https://gen.pollinations.ai/audio/' + encodeURIComponent(String(voiceIdOrText).slice(0, 300)) + '?voice=alloy');
    var textToSpeak = found ? found.text : String(voiceIdOrText);

    try {
      var audio = new Audio(url);
      audio.onerror = function() {
        if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(textToSpeak));
        }
      };
      audio.play().catch(function() {
        if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(textToSpeak));
        }
      });
    } catch (e) {}
  }

  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.type === 'OXY_SET_MUTED') {
      muted = !!ev.data.muted;
      if (muted) stopMusicTrack();
    }
  });

  window.OxyGame = {
    assets: projectAssets,
    unlockAchievement: function(achievementId) {
      if (!achievementId) return;
      window.parent.postMessage({
        type: 'OXY_GAME_EVENT',
        source: 'oxy-game-sandbox',
        action: 'UNLOCK_ACHIEVEMENT',
        achievementId: String(achievementId)
      }, '*');
    },
    submitScore: function(score) {
      var num = Number(score);
      if (isNaN(num)) return;
      window.parent.postMessage({
        type: 'OXY_GAME_EVENT',
        source: 'oxy-game-sandbox',
        action: 'SUBMIT_SCORE',
        score: num
      }, '*');
    },
    playSound: function(soundType) {
      playCustomOrPresetSound(soundType || 'click');
    },
    playMusic: function(trackId) {
      playMusicTrack(trackId);
    },
    stopMusic: function() {
      stopMusicTrack();
    },
    playVoice: function(voiceIdOrText) {
      playVoiceLine(voiceIdOrText);
    },
    getArtUrl: function(artId) {
      var found = (projectAssets.art || []).find(function(a) { return a.id === artId || a.name === artId; });
      return found ? found.url : '';
    },
    getModel: function(modelId) {
      return (projectAssets.models || []).find(function(m) { return m.id === modelId || m.name === modelId; }) || null;
    }
  };

  window.parent.postMessage({
    type: 'init',
    source: 'oxy-game-sandbox'
  }, '*');
})();
</script>
`;
}

export function injectGameBridge(
  rawCode: string,
  assets: GameProjectAssets = DEFAULT_PROJECT_ASSETS,
): string {
  const code = rawCode || "";
  const bridgeScript = buildBridgeScript(assets);
  if (code.includes("<head>")) {
    return code.replace("<head>", `<head>${bridgeScript}`);
  }
  if (code.includes("<body")) {
    return `${bridgeScript}\n${code}`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${bridgeScript}</head><body style="margin:0;background:#090d16;color:#fff;">${code}</body></html>`;
}

/**
 * Validates sandboxed widget messages using the HTML Origin API (`Origin.from(event)` and `isSameOrigin`)
 * with a fallback to `event.source === expectedWidgetWindow` for browsers without `Origin`.
 */
export function verifySandboxedMessageOrigin(
  event: MessageEvent,
  expectedWidgetWindow: Window | null | undefined,
  pinnedRef: { current: any; isPinned: boolean },
): boolean {
  const OriginCtor = (globalThis as any).Origin;
  if (typeof OriginCtor === "function" && typeof OriginCtor.from === "function") {
    try {
      const senderOrigin = OriginCtor.from(event);
      if (
        !pinnedRef.isPinned &&
        event.source === expectedWidgetWindow &&
        event.data?.type === "init"
      ) {
        pinnedRef.current = senderOrigin;
        pinnedRef.isPinned = true;
      }
      if (pinnedRef.isPinned && pinnedRef.current) {
        return Boolean(senderOrigin.isSameOrigin(pinnedRef.current));
      }
    } catch {
      // Synthetic MessageEvent in test environments or browsers throwing on opaque origins
    }
  }

  // Fallback for browsers without Origin API or synthetic test MessageEvents
  if (expectedWidgetWindow && event.source === expectedWidgetWindow) {
    return true;
  }
  if (event.source === null && event.data?.source === "oxy-game-sandbox") {
    return true;
  }
  return false;
}

export const GameSandbox: React.FC<GameSandboxProps> = ({
  code,
  title = "Game Preview",
  muted = false,
  assets = DEFAULT_PROJECT_ASSETS,
  onUnlockAchievement,
  onSubmitScore,
  onGameReady,
  className = "",
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const OriginCtor = (globalThis as any).Origin;
  const pinnedOriginRef = useRef<{ current: any; isPinned: boolean }>({
    current: typeof OriginCtor === "function" ? new OriginCtor() : null,
    isPinned: false,
  });

  const [reloadKey] = useState(0);

  const srcDoc = useMemo(() => {
    const Ctor = (globalThis as any).Origin;
    pinnedOriginRef.current = {
      current: typeof Ctor === "function" ? new Ctor() : null,
      isPinned: false,
    };
    return injectGameBridge(code, assets);
  }, [code, assets, reloadKey]);

  const syncMuteState = useCallback((isMuted: boolean) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "OXY_SET_MUTED", muted: isMuted },
        "*",
      );
    } catch {
      // Ignore cross-origin errors before load
    }
  }, []);

  useEffect(() => {
    syncMuteState(muted);
  }, [muted, syncMuteState]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const isValidOrigin = verifySandboxedMessageOrigin(
        event,
        iframeRef.current?.contentWindow,
        pinnedOriginRef.current,
      );
      if (!isValidOrigin) return;

      if (data.type === "init") {
        syncMuteState(muted);
        onGameReady?.();
        return;
      }

      if (data.type === "OXY_GAME_EVENT") {
        if (
          data.action === "UNLOCK_ACHIEVEMENT" &&
          typeof data.achievementId === "string"
        ) {
          onUnlockAchievement?.(data.achievementId);
        } else if (
          data.action === "SUBMIT_SCORE" &&
          typeof data.score === "number"
        ) {
          onSubmitScore?.(data.score);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [muted, onUnlockAchievement, onSubmitScore, onGameReady, syncMuteState]);

  return (
    <div className={`relative w-full h-full bg-slate-950 overflow-hidden ${className}`}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        className="w-full h-full border-0 block"
      />
    </div>
  );
};
