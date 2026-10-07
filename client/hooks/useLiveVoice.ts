import { useState, useEffect, useRef, useCallback } from "react";

export type LiveVoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  default?: boolean;
}

export interface UseLiveVoiceOptions {
  languageCode?: string; // e.g. "en", "es", "ja", "ko", "ru", "zh-CN"
  apiKey?: string | null;
  systemPrompt?: string;
  onSendSpeech?: (transcript: string) => void;
  onAssistantResponse?: (userText: string, assistantText: string) => void;
  onInterrupt?: () => void;
  autoStart?: boolean;
}

export const OPENAI_REALTIME_VOICES: VoiceOption[] = [
  { name: "Alloy (Neutral & Balanced)", lang: "en-US", voiceURI: "alloy", default: true },
  { name: "Echo (Warm & Natural)", lang: "en-US", voiceURI: "echo" },
  { name: "Fable (Expressive & British)", lang: "en-GB", voiceURI: "fable" },
  { name: "Onyx (Deep & Authoritative)", lang: "en-US", voiceURI: "onyx" },
  { name: "Nova (Energetic & Bright)", lang: "en-US", voiceURI: "nova" },
  { name: "Shimmer (Clear & Expressive)", lang: "en-US", voiceURI: "shimmer" },
  { name: "Ash (Conversational)", lang: "en-US", voiceURI: "ash" },
  { name: "Coral (Melodic & Friendly)", lang: "en-US", voiceURI: "coral" },
  { name: "Sage (Calm & Soothing)", lang: "en-US", voiceURI: "sage" },
  { name: "Verse (Dynamic)", lang: "en-US", voiceURI: "verse" },
  { name: "Ballad (Melodious & Warm)", lang: "en-US", voiceURI: "ballad" },
];

const LANGUAGE_LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  "zh-CN": "zh-CN",
  zh: "zh-CN",
};

/**
 * Converts Float32Array audio buffer [-1.0, 1.0] to 16-bit linear PCM ArrayBuffer.
 */
function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16.buffer;
}

/**
 * Resamples Float32 audio samples from source sample rate to 24000 Hz.
 */
function resampleTo24k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 24000) return input;
  const ratio = inputSampleRate / 24000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const leftIdx = Math.floor(originPos);
    const rightIdx = Math.min(leftIdx + 1, input.length - 1);
    const weight = originPos - leftIdx;
    result[i] = input[leftIdx] * (1 - weight) + input[rightIdx] * weight;
  }
  return result;
}

/**
 * Converts an ArrayBuffer to a Base64 string safely.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== "undefined" ? btoa(binary) : "";
}

/**
 * Converts a Base64 PCM16 string to a Float32Array [-1.0, 1.0] for Web Audio API playback.
 */
function base64ToFloat32(base64: string): Float32Array {
  if (typeof atob === "undefined") return new Float32Array(0);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32;
  } catch {
    return new Float32Array(0);
  }
}

/**
 * Splits text into clean speakable sentence chunks for low-latency neural TTS.
 */
function splitTextIntoSentences(text: string): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#[\]()<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return [];

  const sentences: string[] = [];
  const rawParts = clean.match(/[^.!?\n]+[.!?\n]+/g) || [clean];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length > 180) {
      const subParts = trimmed.match(/[^,;:]+[,;:]+|\S.{1,160}(?:\s|$)/g) || [trimmed];
      for (const sp of subParts) {
        if (sp.trim()) sentences.push(sp.trim());
      }
    } else {
      sentences.push(trimmed);
    }
  }

  return sentences.length > 0 ? sentences : [clean];
}

export function useLiveVoice({
  languageCode = "en",
  apiKey: propApiKey,
  systemPrompt,
  onSendSpeech,
  onAssistantResponse,
  onInterrupt,
  autoStart = false,
}: UseLiveVoiceOptions) {
  const [voiceState, setVoiceState] = useState<LiveVoiceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [isHandsFree, setIsHandsFree] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 1 for visualizer
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(OPENAI_REALTIME_VOICES);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(() => {
    return localStorage.getItem("oxygen_live_voice_uri") || "alloy";
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    const saved = localStorage.getItem("oxygen_live_voice_rate");
    return saved ? parseFloat(saved) : 1.0;
  });
  const [speechPitch, setSpeechPitch] = useState<number>(() => {
    const saved = localStorage.getItem("oxygen_live_voice_pitch");
    return saved ? parseFloat(saved) : 1.0;
  });

  const isSupported =
    typeof window !== "undefined" &&
    (!!(navigator?.mediaDevices && navigator.mediaDevices.getUserMedia) ||
      !!(window.AudioContext || (window as any).webkitAudioContext));

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecognitionRunningRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const currentAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<any>(null);
  const speechSessionIdRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const isHandsFreeRef = useRef(isHandsFree);
  const isPushToTalkActiveRef = useRef(isPushToTalkActive);
  const voiceStateRef = useRef(voiceState);
  const interimTranscriptRef = useRef(interimTranscript);
  const isSessionActiveRef = useRef(false);
  const currentAssistantTextRef = useRef("");
  const currentUserTranscriptRef = useRef("");
  const targetLocale = LANGUAGE_LOCALE_MAP[languageCode] || "en-US";

  // Keep state refs synchronized
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  useEffect(() => {
    isPushToTalkActiveRef.current = isPushToTalkActive;
  }, [isPushToTalkActive]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript;
  }, [interimTranscript]);

  // Load voices
  useEffect(() => {
    const voicesList: VoiceOption[] = [...OPENAI_REALTIME_VOICES];

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const sysVoices = window.speechSynthesis.getVoices?.() || [];
        for (const sv of sysVoices) {
          if (!voicesList.some((v) => v.voiceURI === sv.voiceURI)) {
            voicesList.push({
              name: `${sv.name} (System)`,
              lang: sv.lang,
              voiceURI: sv.voiceURI,
            });
          }
        }
      } catch {
        // Ignore
      }
    }

    setAvailableVoices(voicesList);

    setSelectedVoiceUri((prev) => {
      if (prev && voicesList.some((v) => v.voiceURI === prev)) {
        return prev;
      }
      return "alloy";
    });
  }, [targetLocale]);

  // Preference setters
  const updateSelectedVoiceUri = useCallback((uri: string) => {
    setSelectedVoiceUri(uri);
    localStorage.setItem("oxygen_live_voice_uri", uri);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "session.update",
          session: {
            voice: uri,
          },
        }),
      );
    }
  }, []);

  const updateSpeechRate = useCallback((rate: number) => {
    setSpeechRate(rate);
    localStorage.setItem("oxygen_live_voice_rate", rate.toString());
  }, []);

  const updateSpeechPitch = useCallback((pitch: number) => {
    setSpeechPitch(pitch);
    localStorage.setItem("oxygen_live_voice_pitch", pitch.toString());
  }, []);

  // Stop / clear active audio output
  const stopSpeaking = useCallback(() => {
    speechSessionIdRef.current++;
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;

    // Stop queued PCM buffer sources
    if (activeSourcesRef.current.length > 0) {
      for (const source of activeSourcesRef.current) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Ignore
        }
      }
      activeSourcesRef.current = [];
    }
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    }

    // Stop HTML Audio element
    if (currentAudioElementRef.current) {
      try {
        currentAudioElementRef.current.pause();
        currentAudioElementRef.current.src = "";
        currentAudioElementRef.current = null;
      } catch {
        // Ignore
      }
    }

    // Stop SpeechSynthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel?.();
      } catch {
        // Ignore
      }
    }
  }, []);

  // Real-time PCM audio playback queue from Realtime WebSocket delta
  const queuePcmAudioChunk = useCallback((base64Delta: string) => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") return;
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const float32Samples = base64ToFloat32(base64Delta);
    if (float32Samples.length === 0) return;

    try {
      const audioBuffer = ctx.createBuffer(1, float32Samples.length, 24000);
      audioBuffer.getChannelData(0).set(float32Samples);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      isSpeakingRef.current = true;
      setVoiceState("speaking");

      source.onended = () => {
        const index = activeSourcesRef.current.indexOf(source);
        if (index >= 0) {
          activeSourcesRef.current.splice(index, 1);
        }
        if (activeSourcesRef.current.length === 0 && !isSpeakingRef.current) {
          if (isSessionActiveRef.current && !isMutedRef.current) {
            setVoiceState("listening");
          } else if (isMutedRef.current) {
            setVoiceState("muted");
          }
        }
      };
    } catch {
      // Ignore
    }
  }, []);

  // Send speech transcript to parent
  const handleFinalSpeechSend = useCallback(
    (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed) return;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      setFinalTranscript(trimmed);
      setInterimTranscript("");
      setVoiceState("thinking");

      if (onSendSpeech) {
        onSendSpeech(trimmed);
      }
    },
    [onSendSpeech],
  );

  // Fallback neural TTS using Pollinations audio endpoint
  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      stopSpeaking();
      const currentSessionId = ++speechSessionIdRef.current;

      const chunks = splitTextIntoSentences(text);
      if (chunks.length === 0) {
        if (isSessionActiveRef.current && !isMutedRef.current) {
          setVoiceState("listening");
        } else {
          setVoiceState("idle");
        }
        onDone?.();
        return;
      }

      const fullCleanText = chunks.join(" ");
      setLastAssistantText(fullCleanText);
      isSpeakingRef.current = true;
      setVoiceState("speaking");

      const voice = selectedVoiceUri || "alloy";
      let chunkIndex = 0;

      const finishSpeaking = () => {
        if (speechSessionIdRef.current !== currentSessionId) return;
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
        if (currentAudioElementRef.current) {
          currentAudioElementRef.current = null;
        }
        if (isSessionActiveRef.current && !isMutedRef.current) {
          setVoiceState("listening");
        } else if (isMutedRef.current) {
          setVoiceState("muted");
        } else {
          setVoiceState("idle");
        }
        onDone?.();
      };

      const speakNextChunk = async () => {
        if (speechSessionIdRef.current !== currentSessionId) return;
        if (chunkIndex >= chunks.length) {
          finishSpeaking();
          return;
        }

        const chunkText = chunks[chunkIndex];
        chunkIndex++;

        let playedAudio = false;
        if (typeof window !== "undefined" && typeof Audio !== "undefined") {
          try {
            const effectiveKey = propApiKey || localStorage.getItem("pollinations_api_key") || "";
            const audioUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(chunkText)}?voice=${encodeURIComponent(voice)}`;

            const audio = new Audio();
            currentAudioElementRef.current = audio;
            audio.playbackRate = speechRate;

            const audioPromise = new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = (e) => reject(e);
            });

            if (effectiveKey && typeof fetch !== "undefined") {
              const res = await fetch(audioUrl, {
                headers: { Authorization: `Bearer ${effectiveKey}` },
              });
              if (!res.ok) throw new Error(`Audio fetch returned ${res.status}`);
              const blob = await res.blob();
              audio.src = URL.createObjectURL(blob);
            } else {
              audio.src = audioUrl;
            }

            if (speechSessionIdRef.current !== currentSessionId) return;
            const playPromise = audio.play?.();
            if (playPromise && typeof playPromise.then === "function") {
              await playPromise;
            }
            playedAudio = true;
            await audioPromise;

            if (speechSessionIdRef.current === currentSessionId) {
              speakNextChunk();
            }
            return;
          } catch {
            playedAudio = false;
          }
        }

        if (!playedAudio && typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            const utteranceClass = (window as any).SpeechSynthesisUtterance;
            if (utteranceClass) {
              const utterance = new utteranceClass(chunkText);
              utterance.rate = speechRate;
              utterance.pitch = speechPitch;
              utterance.lang = targetLocale;

              utterance.onend = () => {
                if (speechSessionIdRef.current !== currentSessionId) return;
                speakNextChunk();
              };
              utterance.onerror = () => {
                if (speechSessionIdRef.current !== currentSessionId) return;
                speakNextChunk();
              };

              activeUtteranceRef.current = utterance;
              window.speechSynthesis.speak?.(utterance);
              return;
            }
          } catch {
            // Ignore
          }
        }

        speakNextChunk();
      };

      speakNextChunk();
    },
    [selectedVoiceUri, speechRate, speechPitch, targetLocale, propApiKey, stopSpeaking],
  );

  // Interruption / Cancel
  const interrupt = useCallback(() => {
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "response.cancel" }));
      } catch {
        // Ignore
      }
    }
    setInterimTranscript("");
    if (isSessionActiveRef.current && !isMutedRef.current) {
      setVoiceState("listening");
    }
    onInterrupt?.();
  }, [stopSpeaking, onInterrupt]);

  // Connect to Realtime WebSocket endpoint
  const connectRealtimeWebSocket = useCallback(() => {
    const effectiveKey = propApiKey || localStorage.getItem("pollinations_api_key") || "";
    const wsUrl = `wss://gen.pollinations.ai/v1/realtime?model=openai/gpt-realtime-2.1-mini${
      effectiveKey ? `&key=${encodeURIComponent(effectiveKey)}` : ""
    }`;

    try {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (voiceStateRef.current !== "muted") {
          setVoiceState("listening");
        }
        setErrorMessage(null);

        // Configure Realtime session for gpt-realtime-2.1-mini
        const instructions =
          systemPrompt ||
          "You are a helpful, conversational live voice assistant. Keep answers natural, concise, and easy to listen to. Do not produce markdown formatting, tables, or long code blocks unless explicitly requested.";

        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: instructions,
              voice: selectedVoiceUri || "alloy",
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: {
                model: "whisper-1",
              },
              turn_detection: isHandsFreeRef.current
                ? {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 600,
                  }
                : null,
            },
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "session.created":
            case "session.updated":
              break;

            case "input_audio_buffer.speech_started":
              stopSpeaking();
              if (!isMutedRef.current) {
                setVoiceState("listening");
              }
              break;

            case "input_audio_buffer.speech_stopped":
              setVoiceState("thinking");
              break;

            case "conversation.item.input_audio_transcription.completed":
              if (msg.transcript) {
                currentUserTranscriptRef.current = msg.transcript;
                setFinalTranscript(msg.transcript);
                setInterimTranscript("");
              }
              break;

            case "response.audio_transcript.delta":
              if (msg.delta) {
                currentAssistantTextRef.current += msg.delta;
                setLastAssistantText(currentAssistantTextRef.current);
                setVoiceState("speaking");
              }
              break;

            case "response.audio.delta":
              if (msg.delta) {
                queuePcmAudioChunk(msg.delta);
              }
              break;

            case "response.created":
              currentAssistantTextRef.current = "";
              setVoiceState("thinking");
              break;

            case "response.done": {
              isSpeakingRef.current = false;
              const userTxt = currentUserTranscriptRef.current;
              const assistantTxt = currentAssistantTextRef.current;
              if (assistantTxt) {
                onAssistantResponse?.(userTxt, assistantTxt);
                if (userTxt && onSendSpeech) {
                  onSendSpeech(userTxt);
                }
              }
              currentUserTranscriptRef.current = "";
              setTimeout(() => {
                if (
                  isSessionActiveRef.current &&
                  !isMutedRef.current &&
                  activeSourcesRef.current.length === 0
                ) {
                  setVoiceState("listening");
                }
              }, 400);
              break;
            }

            case "error":
              if (msg.error?.message?.includes("401") || msg.error?.code === "unauthorized") {
                setErrorMessage(
                  "Pollinations API key required for openai/gpt-realtime-2.1-mini. Please add your key in Settings.",
                );
              } else {
                setErrorMessage(msg.error?.message || "Realtime connection error.");
              }
              setVoiceState("error");
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        if (!effectiveKey) {
          setErrorMessage(
            "Pollinations API key required for openai/gpt-realtime-2.1-mini. Please add your key in Settings.",
          );
        }
      };

      ws.onclose = () => {
        // Closed
      };
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to initialize WebSocket session.");
    }
  }, [
    propApiKey,
    systemPrompt,
    selectedVoiceUri,
    stopSpeaking,
    queuePcmAudioChunk,
    onAssistantResponse,
    onSendSpeech,
  ]);

  // Audio Analyser & Microphone PCM capture
  const initAudioAnalyser = useCallback(async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!navigator?.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // ScriptProcessorNode for real-time PCM audio streaming
      const bufferSize = 2048;
      const scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (e) => {
        if (!isSessionActiveRef.current || isMutedRef.current) return;
        if (!isHandsFreeRef.current && !isPushToTalkActiveRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo24k(inputData, audioCtx.sampleRate);
        const pcm16Buffer = float32ToPcm16(resampled);
        const base64Audio = arrayBufferToBase64(pcm16Buffer);

        if (base64Audio && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Audio,
            }),
          );
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current || !isSessionActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0, avg / 80));

        if (isSpeakingRef.current) {
          const simulated = 0.4 + Math.sin(Date.now() / 150) * 0.3 + Math.random() * 0.2;
          setAudioLevel(simulated);
        } else if (isMutedRef.current) {
          setAudioLevel(0);
        } else {
          setAudioLevel(normalized);
        }

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch {
      // Audio capture fallback
    }
  }, []);

  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Optional Browser Speech Recognition for live captions
  const initSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return null;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = targetLocale;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isRecognitionRunningRef.current = true;
      if (isMutedRef.current) {
        setVoiceState("muted");
      } else if (!isSpeakingRef.current && voiceStateRef.current !== "thinking") {
        setVoiceState("listening");
      }
    };

    recognition.onresult = (event: any) => {
      if (isMutedRef.current) return;
      if (!isHandsFreeRef.current && !isPushToTalkActiveRef.current) return;
      if (isSpeakingRef.current) return;

      let interim = "";
      let currentFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
          currentFinal += item[0].transcript + " ";
        } else {
          interim += item[0].transcript;
        }
      }

      const combinedText = (currentFinal + " " + interim).trim();
      if (combinedText) {
        setInterimTranscript(combinedText);
        setVoiceState("listening");

        // If Realtime WebSocket is not connected or active, trigger fallback speech send
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          if (isHandsFreeRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              handleFinalSpeechSend(combinedText);
            }, 1400);
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event?.error === "no-speech") return;
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        isRecognitionRunningRef.current = false;
        setErrorMessage("Microphone access denied. Please grant microphone permissions.");
        setVoiceState("error");
        return;
      }
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;
      if (isSessionActiveRef.current && !isMutedRef.current) {
        try {
          recognition.start();
        } catch {}
      } else if (!isSessionActiveRef.current) {
        setVoiceState("idle");
      }
    };

    return recognition;
  }, [targetLocale, handleFinalSpeechSend]);

  // Start Live Session
  const startSession = useCallback(async () => {
    isSessionActiveRef.current = true;
    setErrorMessage(null);
    setInterimTranscript("");
    setFinalTranscript("");
    setLastAssistantText("");
    setIsMuted(false);

    try {
      await initAudioAnalyser();
    } catch {}

    try {
      connectRealtimeWebSocket();
    } catch {}

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      const rec = initSpeechRecognition();
      if (rec) {
        recognitionRef.current = rec;
        rec.start();
      } else {
        setVoiceState("listening");
      }
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to start audio session.");
      setVoiceState("error");
    }
  }, [initAudioAnalyser, connectRealtimeWebSocket, initSpeechRecognition]);

  // End Live Session
  const endSession = useCallback(() => {
    isSessionActiveRef.current = false;
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    cleanupAudioAnalyser();
    setVoiceState("idle");
    setInterimTranscript("");
    setFinalTranscript("");
  }, [stopSpeaking, cleanupAudioAnalyser]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setVoiceState("muted");
      } else {
        if (isSpeakingRef.current) {
          setVoiceState("speaking");
        } else {
          setVoiceState("listening");
        }
      }
      return next;
    });
  }, []);

  // Toggle Hands-Free / Push-to-Talk
  const toggleHandsFree = useCallback(() => {
    setIsHandsFree((prev) => {
      const next = !prev;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "session.update",
            session: {
              turn_detection: next
                ? {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 600,
                  }
                : null,
            },
          }),
        );
      }
      return next;
    });
  }, []);

  // Push-to-talk press / release handlers
  const handlePushToTalkStart = useCallback(() => {
    if (isHandsFree) return;
    setIsPushToTalkActive(true);
    setVoiceState("listening");
  }, [isHandsFree]);

  const handlePushToTalkEnd = useCallback(() => {
    if (isHandsFree) return;
    setIsPushToTalkActive(false);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        wsRef.current.send(JSON.stringify({ type: "response.create" }));
      } catch {}
      setVoiceState("thinking");
    } else {
      const textToSubmit = interimTranscriptRef.current.trim();
      if (textToSubmit) {
        handleFinalSpeechSend(textToSubmit);
      }
    }
  }, [isHandsFree, handleFinalSpeechSend]);

  const setThinking = useCallback(() => {
    stopSpeaking();
    setVoiceState("thinking");
  }, [stopSpeaking]);

  useEffect(() => {
    if (autoStart && isSupported) {
      startSession();
    }
    return () => {
      endSession();
    };
  }, [autoStart, isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isSupported,
    voiceState,
    errorMessage,
    interimTranscript,
    finalTranscript,
    lastAssistantText,
    audioLevel,
    isHandsFree,
    isMuted,
    isPushToTalkActive,
    availableVoices,
    selectedVoiceUri,
    speechRate,
    speechPitch,
    startSession,
    endSession,
    toggleMute,
    toggleHandsFree,
    handlePushToTalkStart,
    handlePushToTalkEnd,
    interrupt,
    speakText,
    stopSpeaking,
    setThinking,
    updateSelectedVoiceUri,
    updateSpeechRate,
    updateSpeechPitch,
  };
}
