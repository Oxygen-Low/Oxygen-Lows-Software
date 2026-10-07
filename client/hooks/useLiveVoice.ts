import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/db";

export type LiveVoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "speaking"
  | "error";

export interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  default?: boolean;
}

export interface UseLiveVoiceOptions {
  languageCode?: string;
  apiKey?: string | null;
  onSendSpeech?: (transcript: string) => void;
  onAssistantResponse?: (userText: string, assistantText: string) => void;
  onInterrupt?: () => void;
}

export const OPENAI_TTS_VOICES: VoiceOption[] = [
  { name: "Alloy (Neutral & Balanced)", lang: "en-US", voiceURI: "alloy", default: true },
  { name: "Echo (Warm & Natural)", lang: "en-US", voiceURI: "echo" },
  { name: "Fable (Expressive & British)", lang: "en-GB", voiceURI: "fable" },
  { name: "Onyx (Deep & Authoritative)", lang: "en-US", voiceURI: "onyx" },
  { name: "Nova (Energetic & Bright)", lang: "en-US", voiceURI: "nova" },
  { name: "Shimmer (Clear & Expressive)", lang: "en-US", voiceURI: "shimmer" },
  { name: "Ash (Conversational)", lang: "en-US", voiceURI: "ash" },
  { name: "Coral (Melodic & Friendly)", lang: "en-US", voiceURI: "coral" },
  { name: "Sage (Calm & Soothing)", lang: "en-US", voiceURI: "sage" },
];

export const OPENAI_REALTIME_VOICES = OPENAI_TTS_VOICES;

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
 * Clean text for natural speech synthesis.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "Code snippet omitted.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#[\]()<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function useLiveVoice({
  languageCode = "en",
  apiKey: propApiKey,
  onSendSpeech,
  onAssistantResponse,
  onInterrupt,
}: UseLiveVoiceOptions = {}) {
  const [voiceState, setVoiceState] = useState<LiveVoiceState>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(OPENAI_TTS_VOICES);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(() => {
    return localStorage.getItem("oxygen_live_voice_uri") || "alloy";
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    const saved = localStorage.getItem("oxygen_live_voice_rate");
    return saved ? parseFloat(saved) : 1.0;
  });

  const isSupported =
    typeof window !== "undefined" &&
    (!!(navigator?.mediaDevices && navigator.mediaDevices.getUserMedia) ||
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<any>(null);
  const speechSessionIdRef = useRef(0);
  const recognitionRef = useRef<any>(null);

  const targetLocale = LANGUAGE_LOCALE_MAP[languageCode] || "en-US";

  // Preference setters
  const updateSelectedVoiceUri = useCallback((uri: string) => {
    setSelectedVoiceUri(uri);
    localStorage.setItem("oxygen_live_voice_uri", uri);
  }, []);

  const updateSpeechRate = useCallback((rate: number) => {
    setSpeechRate(rate);
    localStorage.setItem("oxygen_live_voice_rate", rate.toString());
  }, []);

  // Stop active audio playback
  const stopSpeaking = useCallback(() => {
    speechSessionIdRef.current++;
    setIsSpeaking(false);
    activeUtteranceRef.current = null;

    if (currentAudioElementRef.current) {
      try {
        currentAudioElementRef.current.pause();
        currentAudioElementRef.current.src = "";
        currentAudioElementRef.current = null;
      } catch {}
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel?.();
      } catch {}
    }

    setVoiceState((prev) => (prev === "speaking" ? "idle" : prev));
  }, []);

  // Text-to-Speech using openai/tts-1
  const speakText = useCallback(
    async (text: string, onDone?: () => void) => {
      stopSpeaking();
      const currentSessionId = ++speechSessionIdRef.current;
      const clean = cleanTextForSpeech(text);

      if (!clean) {
        setIsSpeaking(false);
        setVoiceState("idle");
        onDone?.();
        return;
      }

      setLastAssistantText(clean);
      setIsSpeaking(true);
      setVoiceState("speaking");

      const voice = selectedVoiceUri || "alloy";
      let playedAudio = false;

      // Try server /tts endpoint with model openai/tts-1
      if (typeof window !== "undefined" && typeof Audio !== "undefined") {
        try {
          const effectiveKey = propApiKey || localStorage.getItem("pollinations_api_key") || "";
          const session = (await supabase.auth.getSession()).data.session;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const res = await fetch("/api/ai/tts", {
            method: "POST",
            headers,
            body: JSON.stringify({
              input: clean,
              model: "openai/tts-1",
              voice,
              apiKey: effectiveKey,
            }),
          });

          if (res.ok && res.status === 200) {
            const blob = await res.blob();
            if (speechSessionIdRef.current !== currentSessionId) return;

            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            currentAudioElementRef.current = audio;
            audio.playbackRate = speechRate;

            const audioPromise = new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = (e) => reject(e);
            });

            await audio.play();
            playedAudio = true;
            await audioPromise;

            URL.revokeObjectURL(blobUrl);
            if (speechSessionIdRef.current === currentSessionId) {
              setIsSpeaking(false);
              setVoiceState("idle");
              currentAudioElementRef.current = null;
              onDone?.();
            }
            return;
          }
        } catch {
          playedAudio = false;
        }

        // Secondary fallback to direct Pollinations audio endpoint
        if (!playedAudio && speechSessionIdRef.current === currentSessionId) {
          try {
            const audioUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(
              clean.slice(0, 500),
            )}?voice=${encodeURIComponent(voice)}`;
            const audio = new Audio(audioUrl);
            currentAudioElementRef.current = audio;
            audio.playbackRate = speechRate;

            const audioPromise = new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = (e) => reject(e);
            });

            await audio.play();
            playedAudio = true;
            await audioPromise;

            if (speechSessionIdRef.current === currentSessionId) {
              setIsSpeaking(false);
              setVoiceState("idle");
              currentAudioElementRef.current = null;
              onDone?.();
            }
            return;
          } catch {
            playedAudio = false;
          }
        }
      }

      // Browser SpeechSynthesis fallback
      if (!playedAudio && typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          const Utterance = (window as any).SpeechSynthesisUtterance;
          if (Utterance) {
            const utterance = new Utterance(clean);
            utterance.rate = speechRate;
            utterance.lang = targetLocale;

            utterance.onend = () => {
              if (speechSessionIdRef.current !== currentSessionId) return;
              setIsSpeaking(false);
              setVoiceState("idle");
              activeUtteranceRef.current = null;
              onDone?.();
            };

            utterance.onerror = () => {
              if (speechSessionIdRef.current !== currentSessionId) return;
              setIsSpeaking(false);
              setVoiceState("idle");
              activeUtteranceRef.current = null;
              onDone?.();
            };

            activeUtteranceRef.current = utterance;
            window.speechSynthesis.speak?.(utterance);
            return;
          }
        } catch {}
      }

      if (speechSessionIdRef.current === currentSessionId) {
        setIsSpeaking(false);
        setVoiceState("idle");
        onDone?.();
      }
    },
    [selectedVoiceUri, speechRate, targetLocale, propApiKey, stopSpeaking],
  );

  // Audio Analyser level tracking for microphone
  const startAudioAnalyser = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0, avg / 80));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch {}
  }, []);

  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Transcribe recorded audio with openai/whisper-large-v3
  const transcribeAudioBlob = useCallback(
    async (blob: Blob): Promise<string> => {
      setIsTranscribing(true);
      setVoiceState("transcribing");

      const session = (await supabase.auth.getSession()).data.session;
      const effectiveKey = propApiKey || localStorage.getItem("pollinations_api_key") || "";

      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("model", "openai/whisper-large-v3");
      if (effectiveKey) formData.append("apiKey", effectiveKey);

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Transcription error: ${errText}`);
      }

      const json = await res.json();
      const text = (json.text || json.transcript || "").trim();
      return text;
    },
    [propApiKey],
  );

  // Start Speech-to-Text recording
  const startRecording = useCallback(async () => {
    stopSpeaking();
    setErrorMessage(null);
    setInterimTranscript("");
    setFinalTranscript("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Fallback to Web SpeechRecognition if mediaDevices is not available
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        try {
          const rec = new SpeechRecognitionClass();
          rec.continuous = false;
          rec.interimResults = true;
          rec.lang = targetLocale;

          rec.onstart = () => {
            setIsRecording(true);
            setVoiceState("listening");
          };

          rec.onresult = (event: any) => {
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            if (final) {
              setFinalTranscript(final);
              onSendSpeech?.(final);
            } else if (interim) {
              setInterimTranscript(interim);
            }
          };

          rec.onerror = (e: any) => {
            if (e?.error !== "no-speech") {
              setErrorMessage("Microphone access denied or error occurred.");
              setVoiceState("error");
            }
            setIsRecording(false);
          };

          rec.onend = () => {
            setIsRecording(false);
            setVoiceState("idle");
          };

          recognitionRef.current = rec;
          rec.start();
          return;
        } catch (err: any) {
          setErrorMessage(err?.message || "Speech recognition unavailable.");
          setVoiceState("error");
          return;
        }
      }

      setErrorMessage("Microphone is not supported in this browser.");
      setVoiceState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      micStreamRef.current = stream;
      startAudioAnalyser(stream);

      audioChunksRef.current = [];
      const options: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options.mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          options.mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options.mimeType = "audio/mp4";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setVoiceState("listening");
      };

      mediaRecorder.onerror = (e: any) => {
        setErrorMessage(e?.error?.message || "Microphone recording error.");
        setVoiceState("error");
        setIsRecording(false);
      };

      mediaRecorder.start(250);
    } catch (e: any) {
      setErrorMessage(
        e?.message?.includes("Permission") || e?.name === "NotAllowedError"
          ? "Microphone access denied. Please grant microphone permissions."
          : e?.message || "Failed to start microphone recording.",
      );
      setVoiceState("error");
      setIsRecording(false);
    }
  }, [stopSpeaking, targetLocale, onSendSpeech, startAudioAnalyser]);

  // Stop Speech-to-Text recording and transcribe
  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      setIsRecording(false);
      setVoiceState("idle");
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      setVoiceState("idle");
      return;
    }

    setIsRecording(false);
    cleanupAudioAnalyser();

    return new Promise<string>((resolve) => {
      recorder.onstop = async () => {
        try {
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((track) => track.stop());
            micStreamRef.current = null;
          }

          const mimeType = recorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];

          if (audioBlob.size < 500) {
            setVoiceState("idle");
            setIsTranscribing(false);
            resolve("");
            return;
          }

          const transcript = await transcribeAudioBlob(audioBlob);
          setFinalTranscript(transcript);
          setIsTranscribing(false);
          setVoiceState("idle");

          if (transcript && onSendSpeech) {
            onSendSpeech(transcript);
          }
          resolve(transcript);
        } catch (e: any) {
          setErrorMessage(e?.message || "Transcription failed.");
          setVoiceState("error");
          setIsTranscribing(false);
          resolve("");
        }
      };

      try {
        recorder.stop();
      } catch {
        resolve("");
      }
    });
  }, [cleanupAudioAnalyser, transcribeAudioBlob, onSendSpeech]);

  // Cancel recording without transcribing
  const cancelRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    cleanupAudioAnalyser();
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
    setVoiceState("idle");
    setInterimTranscript("");
  }, [cleanupAudioAnalyser]);

  // Interruption
  const interrupt = useCallback(() => {
    stopSpeaking();
    cancelRecording();
    onInterrupt?.();
  }, [stopSpeaking, cancelRecording, onInterrupt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      cancelRecording();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isSupported,
    voiceState,
    isRecording,
    isTranscribing,
    isSpeaking,
    errorMessage,
    interimTranscript,
    finalTranscript,
    lastAssistantText,
    audioLevel,
    availableVoices,
    selectedVoiceUri,
    speechRate,
    startRecording,
    stopRecording,
    cancelRecording,
    startSession: startRecording,
    endSession: stopSpeaking,
    interrupt,
    speakText,
    stopSpeaking,
    updateSelectedVoiceUri,
    updateSpeechRate,
  };
}
