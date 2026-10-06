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
 * Splits text into speakable sentence chunks to avoid browser SpeechSynthesis
 * 15-second / length timeouts in Chrome, Edge, and Safari.
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
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(() => {
    return localStorage.getItem("oxygen_live_voice_uri") || "";
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
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
    "speechSynthesis" in window;

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const resumeTimerRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const isHandsFreeRef = useRef(isHandsFree);
  const isPushToTalkActiveRef = useRef(isPushToTalkActive);
  const voiceStateRef = useRef(voiceState);
  const interimTranscriptRef = useRef(interimTranscript);
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

  // Load voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      const mapped: VoiceOption[] = voices.map((v) => ({
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
        default: v.default,
      }));
      setAvailableVoices(mapped);

      // If no valid selected voice, select the best matching voice for current language
      setSelectedVoiceUri((prev) => {
        if (prev && voices.some((v) => v.voiceURI === prev)) {
          return prev;
        }
        const langPrefix = targetLocale.split("-")[0].toLowerCase();
        const bestMatch =
          voices.find((v) => v.lang.toLowerCase() === targetLocale.toLowerCase()) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices.find((v) => v.default) ||
          voices[0];
        return bestMatch ? bestMatch.voiceURI : prev;
      });
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
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

  // Audio Level Analyser via Web Audio API
  const initAudioAnalyser = useCallback(async () => {
    try {
      if (audioContextRef.current) return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
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

        // If speaking via TTS, animate simulated voice amplitude
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
      // Audio level analyser is non-critical fallback
    }
  }, []);

  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
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

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearInterval(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const startResumeTimer = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }
    }, 10000);
  }, [clearResumeTimer]);

  // Text-To-Speech (TTS)
  const stopSpeaking = useCallback(() => {
    clearResumeTimer();
    activeUtterancesRef.current = [];
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }, [clearResumeTimer]);

  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onDone?.();
        return;
      }

      stopSpeaking();

      const chunks = splitTextIntoSentences(text);
      if (chunks.length === 0) {
        onDone?.();
        return;
      }

      const fullCleanText = chunks.join(" ");
      setLastAssistantText(fullCleanText);
      isSpeakingRef.current = true;
      setVoiceState("speaking");

      const voices = window.speechSynthesis.getVoices();
      let selectedVoice: SpeechSynthesisVoice | undefined = undefined;
      if (selectedVoiceUri) {
        selectedVoice = voices.find((v) => v.voiceURI === selectedVoiceUri);
      }
      if (!selectedVoice) {
        const langPrefix = targetLocale.split("-")[0].toLowerCase();
        selectedVoice =
          voices.find((v) => v.lang.toLowerCase() === targetLocale.toLowerCase()) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices.find((v) => v.default) ||
          voices[0];
      }

      const utterances = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.lang = targetLocale;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        const isLastChunk = index === chunks.length - 1;

        utterance.onend = () => {
          if (isLastChunk) {
            clearResumeTimer();
            isSpeakingRef.current = false;
            activeUtteranceRef.current = null;
            activeUtterancesRef.current = [];
            if (isSessionActiveRef.current && !isMutedRef.current) {
              setVoiceState("listening");
            } else if (isMutedRef.current) {
              setVoiceState("muted");
            } else {
              setVoiceState("idle");
            }
            onDone?.();
          }
        };

        utterance.onerror = () => {
          if (isLastChunk || activeUtterancesRef.current.length <= 1) {
            clearResumeTimer();
            isSpeakingRef.current = false;
            activeUtteranceRef.current = null;
            activeUtterancesRef.current = [];
            if (isSessionActiveRef.current && !isMutedRef.current) {
              setVoiceState("listening");
            } else {
              setVoiceState("idle");
            }
            onDone?.();
          }
        };

        return utterance;
      });

      activeUtterancesRef.current = utterances;
      activeUtteranceRef.current = utterances[0] || null;

      startResumeTimer();

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        utterances.forEach((utt) => window.speechSynthesis.speak(utt));
        window.speechSynthesis.resume();
      } catch (err) {
        console.error("Speech synthesis speak error:", err);
      }
    },
    [
      speechRate,
      speechPitch,
      targetLocale,
      selectedVoiceUri,
      stopSpeaking,
      startResumeTimer,
      clearResumeTimer,
    ],
  );

  // Send collected speech
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
      onSendSpeech(trimmed);
    },
    [onSendSpeech],
  );

  // Stop everything / Interruption
  const interrupt = useCallback(() => {
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setInterimTranscript("");
    if (isSessionActiveRef.current && !isMutedRef.current) {
      setVoiceState("listening");
    }
    onInterrupt?.();
  }, [stopSpeaking, onInterrupt]);

  // Speech Recognition setup
  const initSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorMessage("Speech recognition not supported in this browser.");
      setVoiceState("error");
      return null;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = targetLocale;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (isMutedRef.current) {
        setVoiceState("muted");
      } else if (!isSpeakingRef.current && voiceStateRef.current !== "thinking") {
        setVoiceState("listening");
      }
    };

    recognition.onresult = (event: any) => {
      if (isMutedRef.current) return;
      if (!isHandsFreeRef.current && !isPushToTalkActiveRef.current) return;
      // Do not process speech input while the assistant is speaking out loud
      // to avoid acoustic echo loops where the AI transcribes its own voice.
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

        // Clear existing silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // In hands-free mode, trigger send after 1.4 seconds of silence
        if (isHandsFreeRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            const textToSubmit = interimTranscriptRef.current.trim();
            if (textToSubmit) {
              handleFinalSpeechSend(textToSubmit);
            }
          }, 1400);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        // Ignorable transient event in continuous mode
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setErrorMessage("Microphone access denied. Please grant microphone permissions.");
        setVoiceState("error");
        return;
      }
      // For other transient errors, attempt to stay in listening if active
      if (isSessionActiveRef.current && !isMutedRef.current && !isSpeakingRef.current) {
        setVoiceState("listening");
      }
    };

    recognition.onend = () => {
      // If recognition ended but session is still active and not muted, automatically restart
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
  }, [targetLocale, handleFinalSpeechSend]);

  // Start Live Session
  const startSession = useCallback(async () => {
    isSessionActiveRef.current = true;
    setErrorMessage(null);
    setInterimTranscript("");
    setFinalTranscript("");
    setIsMuted(false);

    // Warm up speech synthesis on user gesture
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // Ignore
      }
    }

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
      }
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to start speech recognition.");
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
    setVoiceState("listening");
  }, [isHandsFree]);

  const handlePushToTalkEnd = useCallback(() => {
    if (isHandsFree) return;
    setIsPushToTalkActive(false);
    const textToSubmit = interimTranscriptRef.current.trim();
    if (textToSubmit) {
      handleFinalSpeechSend(textToSubmit);
    } else {
      setVoiceState(isSpeakingRef.current ? "speaking" : "idle");
    }
  }, [isHandsFree, handleFinalSpeechSend]);

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
