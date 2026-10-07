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
  onSendSpeech: (transcript: string) => void;
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
 * Splits text into speakable sentence chunks for low-latency voice streaming.
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
  onSendSpeech,
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

  // Support is active on any browser with mediaDevices or AudioContext (no longer strictly requires SpeechRecognition or speechSynthesis)
  const isSupported =
    typeof window !== "undefined" &&
    (!!(navigator?.mediaDevices && navigator.mediaDevices.getUserMedia) ||
      !!(window.AudioContext || (window as any).webkitAudioContext));

  const recognitionRef = useRef<any>(null);
  const isRecognitionRunningRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const isRecordingPhraseRef = useRef(false);
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
  const hasSpokenSinceListeningRef = useRef(false);
  const isSessionActiveRef = useRef(false);
  const targetLocale = LANGUAGE_LOCALE_MAP[languageCode] || "en-US";

  // Keep refs up to date
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

  // Load voices: prioritize OpenAI Realtime neural voices, optionally augment with system voices
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

  // Save preferences
  const updateSelectedVoiceUri = useCallback((uri: string) => {
    setSelectedVoiceUri(uri);
    localStorage.setItem("oxygen_live_voice_uri", uri);
  }, []);

  const updateSpeechRate = useCallback((rate: number) => {
    setSpeechRate(rate);
    localStorage.setItem("oxygen_live_voice_rate", rate.toString());
  }, []);

  const updateSpeechPitch = useCallback((pitch: number) => {
    setSpeechPitch(pitch);
    localStorage.setItem("oxygen_live_voice_pitch", pitch.toString());
  }, []);

  // Send collected speech
  const handleFinalSpeechSend = useCallback(
    (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed) return;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      hasSpokenSinceListeningRef.current = false;
      isRecordingPhraseRef.current = false;
      recordedAudioChunksRef.current = [];
      setFinalTranscript(trimmed);
      setInterimTranscript("");
      setVoiceState("thinking");
      onSendSpeech(trimmed);
    },
    [onSendSpeech],
  );

  // Submit recorded phrase with fallback to Whisper transcription
  const submitRecordedPhrase = useCallback(async () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const textToSubmit = interimTranscriptRef.current.trim();
    if (textToSubmit) {
      handleFinalSpeechSend(textToSubmit);
      return;
    }

    // If SpeechRecognition didn't produce text, transcribe recorded audio blob
    if (recordedAudioChunksRef.current.length > 0) {
      const blob = new Blob(recordedAudioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || "audio/webm",
      });
      recordedAudioChunksRef.current = [];
      isRecordingPhraseRef.current = false;

      if (blob.size > 1500) {
        setVoiceState("thinking");
        try {
          const formData = new FormData();
          formData.append("file", blob, "speech.webm");
          const apiKey = localStorage.getItem("pollinations_api_key") || "";
          if (apiKey) formData.append("apiKey", apiKey);

          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            const transcript = data.text?.trim();
            if (transcript) {
              handleFinalSpeechSend(transcript);
              return;
            }
          }
        } catch (e) {
          console.warn("[useLiveVoice] Transcription error:", e);
        }
      }
    }

    hasSpokenSinceListeningRef.current = false;
    isRecordingPhraseRef.current = false;
    if (isSessionActiveRef.current && !isMutedRef.current && !isSpeakingRef.current) {
      setVoiceState("listening");
    }
  }, [handleFinalSpeechSend]);

  // Audio Level Analyser via Web Audio API
  const initAudioAnalyser = useCallback(async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!navigator?.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Start MediaRecorder for audio recording
      if (typeof MediaRecorder !== "undefined") {
        try {
          const mimeType = MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported?.("audio/webm")
            ? "audio/webm"
            : "";
          const options = mimeType ? { mimeType } : undefined;
          const recorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              recordedAudioChunksRef.current.push(e.data);
            }
          };
          recorder.start(250);
        } catch {
          // Ignore
        }
      }

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

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

        // If speaking via neural voice, animate voice amplitude
        if (isSpeakingRef.current) {
          const simulated = 0.4 + Math.sin(Date.now() / 150) * 0.3 + Math.random() * 0.2;
          setAudioLevel(simulated);
        } else if (isMutedRef.current) {
          setAudioLevel(0);
        } else {
          setAudioLevel(normalized);

          // Voice Activity Detection (VAD)
          if (normalized > 0.08 && !isSpeakingRef.current && voiceStateRef.current !== "thinking") {
            hasSpokenSinceListeningRef.current = true;
            if (!isRecordingPhraseRef.current) {
              isRecordingPhraseRef.current = true;
              recordedAudioChunksRef.current = [];
            }
            if (voiceStateRef.current !== "listening") {
              setVoiceState("listening");
            }

            if (isHandsFreeRef.current) {
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            }
          } else if (
            normalized <= 0.05 &&
            isHandsFreeRef.current &&
            hasSpokenSinceListeningRef.current &&
            !isSpeakingRef.current &&
            voiceStateRef.current === "listening"
          ) {
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = setTimeout(() => {
                submitRecordedPhrase();
              }, 1400);
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch {
      // Audio level analyser fallback
    }
  }, [submitRecordedPhrase]);

  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null;
    }
    recordedAudioChunksRef.current = [];
    isRecordingPhraseRef.current = false;

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

  // Stop / cancel audio playback
  const stopSpeaking = useCallback(() => {
    speechSessionIdRef.current++;
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;

    if (currentAudioElementRef.current) {
      try {
        currentAudioElementRef.current.pause();
        currentAudioElementRef.current.src = "";
        currentAudioElementRef.current = null;
      } catch {
        // Ignore
      }
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel?.();
      } catch {
        // Ignore
      }
    }
  }, []);

  // Neural Text-To-Speech with OpenAI Realtime voice model
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

        // 1. Primary path: Play neural audio from OpenAI Realtime voice endpoint
        let playedAudio = false;
        if (typeof window !== "undefined" && typeof Audio !== "undefined") {
          try {
            const apiKey = localStorage.getItem("pollinations_api_key") || "";
            const audioUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(chunkText)}?voice=${encodeURIComponent(voice)}`;
            
            const audio = new Audio();
            currentAudioElementRef.current = audio;
            audio.playbackRate = speechRate;

            const audioPromise = new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = (e) => reject(e);
            });

            // If an API key is present, fetch the blob with Authorization header
            if (apiKey && typeof fetch !== "undefined") {
              const res = await fetch(audioUrl, {
                headers: { Authorization: `Bearer ${apiKey}` },
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

        // 2. Fallback path if audio playback is unavailable (e.g., unit test mocks or offline)
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

        // If neither Audio nor SpeechSynthesis succeeded, move to next chunk
        speakNextChunk();
      };

      setTimeout(() => {
        if (speechSessionIdRef.current === currentSessionId) {
          speakNextChunk();
        }
      }, 20);
    },
    [selectedVoiceUri, speechRate, speechPitch, targetLocale, stopSpeaking],
  );

  // Stop everything / Interruption
  const interrupt = useCallback(() => {
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    hasSpokenSinceListeningRef.current = false;
    isRecordingPhraseRef.current = false;
    recordedAudioChunksRef.current = [];
    setInterimTranscript("");
    if (isSessionActiveRef.current && !isMutedRef.current) {
      setVoiceState("listening");
    }
    onInterrupt?.();
  }, [stopSpeaking, onInterrupt]);

  // Optional Browser Speech Recognition for progressive live captions
  const initSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      // Speech recognition is optional now, speech input and VAD work independently!
      return null;
    }

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
        hasSpokenSinceListeningRef.current = true;
        setInterimTranscript(combinedText);
        setVoiceState("listening");

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        if (isHandsFreeRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            submitRecordedPhrase();
          }, 1400);
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
      if (isSessionActiveRef.current && !isMutedRef.current && !isSpeakingRef.current) {
        setVoiceState("listening");
      }
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;
      if (isSessionActiveRef.current && !isMutedRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore
        }
      } else if (!isSessionActiveRef.current) {
        setVoiceState("idle");
      }
    };

    return recognition;
  }, [targetLocale, submitRecordedPhrase]);

  // Start Live Session
  const startSession = useCallback(async () => {
    isSessionActiveRef.current = true;
    setErrorMessage(null);
    setInterimTranscript("");
    setFinalTranscript("");
    setIsMuted(false);
    hasSpokenSinceListeningRef.current = false;
    isRecordingPhraseRef.current = false;
    recordedAudioChunksRef.current = [];

    try {
      await initAudioAnalyser();
    } catch {
      // Audio level analyser is optional
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      const rec = initSpeechRecognition();
      if (rec) {
        recognitionRef.current = rec;
        rec.start();
      } else {
        // Recognition not in browser, but audio recording/VAD session is active!
        setVoiceState("listening");
      }
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to start audio session.");
      setVoiceState("error");
    }
  }, [initAudioAnalyser, initSpeechRecognition]);

  // Stop / End Live Session
  const endSession = useCallback(() => {
    isSessionActiveRef.current = false;
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    cleanupAudioAnalyser();
    setVoiceState("idle");
    setInterimTranscript("");
    setFinalTranscript("");
    hasSpokenSinceListeningRef.current = false;
    isRecordingPhraseRef.current = false;
    recordedAudioChunksRef.current = [];
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
    setIsHandsFree((prev) => !prev);
  }, []);

  // Push-to-talk press / release handlers
  const handlePushToTalkStart = useCallback(() => {
    if (isHandsFree) return;
    setIsPushToTalkActive(true);
    isRecordingPhraseRef.current = true;
    recordedAudioChunksRef.current = [];
    setVoiceState("listening");
  }, [isHandsFree]);

  const handlePushToTalkEnd = useCallback(() => {
    if (isHandsFree) return;
    setIsPushToTalkActive(false);
    submitRecordedPhrase();
  }, [isHandsFree, submitRecordedPhrase]);

  // Notify that the AI has started thinking / generating
  const setThinking = useCallback(() => {
    stopSpeaking();
    setVoiceState("thinking");
  }, [stopSpeaking]);

  // Auto-start if requested
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
