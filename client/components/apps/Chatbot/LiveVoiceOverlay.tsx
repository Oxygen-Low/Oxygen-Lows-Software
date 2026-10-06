import React, { useState, useEffect } from "react";
import {
  Mic,
  MicOff,
  Square,
  X,
  Sliders,
  Radio,
  Sparkles,
  Hand,
  Volume2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";
import type { LiveVoiceState, VoiceOption } from "@/hooks/useLiveVoice";

export interface LiveVoiceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  voiceState: LiveVoiceState;
  audioLevel: number;
  interimTranscript: string;
  finalTranscript: string;
  lastAssistantText: string;
  isMuted: boolean;
  isHandsFree: boolean;
  isPushToTalkActive: boolean;
  errorMessage: string | null;
  availableVoices: VoiceOption[];
  selectedVoiceUri: string;
  speechRate: number;
  speechPitch: number;
  onToggleMute: () => void;
  onToggleHandsFree: () => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onInterrupt: () => void;
  onSelectVoice: (uri: string) => void;
  onChangeRate: (rate: number) => void;
  onChangePitch: (pitch: number) => void;
}

export const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({
  isOpen,
  onClose,
  voiceState,
  audioLevel,
  interimTranscript,
  finalTranscript,
  lastAssistantText,
  isMuted,
  isHandsFree,
  isPushToTalkActive,
  errorMessage,
  availableVoices,
  selectedVoiceUri,
  speechRate,
  speechPitch,
  onToggleMute,
  onToggleHandsFree,
  onPushToTalkStart,
  onPushToTalkEnd,
  onInterrupt,
  onSelectVoice,
  onChangeRate,
  onChangePitch,
}) => {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        if (showSettings) {
          setShowSettings(false);
        } else {
          onClose();
        }
      }
      if (e.code === "Space" && !isHandsFree && !showSettings) {
        // Spacebar push to talk
        if (e.type === "keydown" && !isPushToTalkActive) {
          e.preventDefault();
          onPushToTalkStart();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.code === "Space" && !isHandsFree && isPushToTalkActive) {
        e.preventDefault();
        onPushToTalkEnd();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isOpen,
    showSettings,
    isHandsFree,
    isPushToTalkActive,
    onClose,
    onPushToTalkStart,
    onPushToTalkEnd,
  ]);

  if (!isOpen) return null;

  // Dynamic visualizer scaling based on audio level
  const baseScale = 1;
  const dynamicScale = baseScale + audioLevel * 0.45;
  const haloOpacity = 0.25 + audioLevel * 0.55;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("apps.chatbotLiveMode", undefined, "Live Voice Mode")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/90 backdrop-blur-2xl text-white select-none transition-all duration-300 animate-[fade-in_0.3s_ease-out]"
    >
      {/* Background Animated Ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-700 pointer-events-none",
            voiceState === "speaking"
              ? "bg-cyan-500/20"
              : voiceState === "thinking"
                ? "bg-violet-600/25 animate-pulse"
                : voiceState === "muted"
                  ? "bg-amber-600/10"
                  : voiceState === "error"
                    ? "bg-red-600/20"
                    : "bg-primary/20",
          )}
        />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-4xl px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
            <Radio className="w-4 h-4 text-primary animate-pulse" />
            <span className="font-display text-sm font-semibold tracking-wide text-white">
              {t("apps.chatbotLiveMode", undefined, "Live Voice")}
            </span>
          </div>

          <div
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium transition-colors border",
              voiceState === "listening" &&
                "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse",
              voiceState === "thinking" &&
                "bg-purple-500/15 text-purple-300 border-purple-500/30 animate-pulse",
              voiceState === "speaking" &&
                "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
              voiceState === "muted" &&
                "bg-amber-500/15 text-amber-300 border-amber-500/30",
              voiceState === "error" &&
                "bg-red-500/15 text-red-300 border-red-500/30",
              voiceState === "idle" &&
                "bg-white/10 text-slate-300 border-white/10",
            )}
          >
            {voiceState === "listening" &&
              t("apps.chatbotLiveListening", undefined, "Listening...")}
            {voiceState === "thinking" &&
              t("apps.chatbotLiveThinking", undefined, "Thinking...")}
            {voiceState === "speaking" &&
              t("apps.chatbotLiveSpeaking", undefined, "Speaking...")}
            {voiceState === "muted" &&
              t("apps.chatbotLiveMuted", undefined, "Microphone Muted")}
            {voiceState === "error" &&
              (errorMessage ||
                t(
                  "apps.chatbotLiveUnsupported",
                  undefined,
                  "Voice recognition unavailable",
                ))}
            {voiceState === "idle" &&
              t(
                "apps.chatbotLiveAssistantPrompt",
                undefined,
                "Ready to listen",
              )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2.5 rounded-full text-slate-300 hover:text-white transition-colors",
              showSettings ? "bg-white/20 text-white" : "hover:bg-white/10",
            )}
            title={t(
              "apps.chatbotLiveVoiceSettings",
              undefined,
              "Voice Settings",
            )}
            aria-label={t(
              "apps.chatbotLiveVoiceSettings",
              undefined,
              "Voice Settings",
            )}
          >
            <Sliders className="w-5 h-5" />
          </button>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            title={t("apps.chatbotLiveEnd", undefined, "End Live Chat")}
            aria-label={t("apps.chatbotLiveEnd", undefined, "End Live Chat")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Voice Settings Dropdown / Drawer Modal */}
      {showSettings && (
        <div className="relative z-20 w-full max-w-md mx-4 p-5 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 shadow-2xl space-y-4 mb-4 animate-[scale-in_0.2s_ease-out]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              {t(
                "apps.chatbotLiveVoiceSettings",
                undefined,
                "Voice Settings",
              )}
            </h3>
            <button
              onClick={() => setShowSettings(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1">
                {t(
                  "apps.chatbotLiveSelectVoice",
                  undefined,
                  "Select Voice",
                )}
              </label>
              <select
                value={selectedVoiceUri}
                onChange={(e) => onSelectVoice(e.target.value)}
                className="w-full bg-white/5 border border-white/15 text-white text-xs rounded-lg p-2.5 outline-none focus:border-primary"
              >
                <option value="" className="bg-slate-900 text-white">
                  {t(
                    "apps.chatbotLiveDefaultVoice",
                    undefined,
                    "Default Voice",
                  )}
                </option>
                {availableVoices.map((v) => (
                  <option
                    key={v.voiceURI}
                    value={v.voiceURI}
                    className="bg-slate-900 text-white"
                  >
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>{t("apps.chatbotLiveVoiceSpeed", undefined, "Speed")}</span>
                <span>{speechRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speechRate}
                onChange={(e) => onChangeRate(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>{t("apps.chatbotLiveVoicePitch", undefined, "Pitch")}</span>
                <span>{speechPitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={speechPitch}
                onChange={(e) => onChangePitch(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Visualizer Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6">
        {/* Animated 3D Glowing Orb */}
        <div className="relative flex items-center justify-center my-8">
          {/* Outer Wave Rings */}
          <div
            className={cn(
              "absolute rounded-full border border-primary/30 transition-all duration-300 pointer-events-none",
              voiceState === "listening" && "animate-ping opacity-30",
            )}
            style={{
              width: `${240 * dynamicScale}px`,
              height: `${240 * dynamicScale}px`,
              opacity: haloOpacity,
            }}
          />

          <div
            className={cn(
              "absolute rounded-full blur-2xl transition-all duration-300 pointer-events-none",
              voiceState === "speaking" && "bg-cyan-400/40",
              voiceState === "thinking" && "bg-purple-500/40 animate-pulse",
              voiceState === "listening" && "bg-primary/40",
              voiceState === "muted" && "bg-amber-500/20",
              voiceState === "error" && "bg-red-500/30",
            )}
            style={{
              width: `${180 * dynamicScale}px`,
              height: `${180 * dynamicScale}px`,
            }}
          />

          {/* Central Core Orb */}
          <div
            className={cn(
              "relative w-40 h-40 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 cursor-pointer",
              voiceState === "speaking" &&
                "bg-gradient-to-tr from-cyan-600 via-emerald-500 to-teal-400 shadow-[0_0_50px_rgba(6,182,212,0.6)]",
              voiceState === "thinking" &&
                "bg-gradient-to-tr from-violet-600 via-purple-600 to-indigo-500 animate-spin shadow-[0_0_50px_rgba(168,85,247,0.6)] duration-3000",
              voiceState === "listening" &&
                "bg-gradient-to-tr from-primary via-indigo-500 to-cyan-400 shadow-[0_0_50px_rgba(207,188,255,0.6)]",
              voiceState === "muted" &&
                "bg-gradient-to-tr from-slate-700 via-amber-700 to-slate-800 shadow-[0_0_30px_rgba(245,158,11,0.2)]",
              voiceState === "error" &&
                "bg-gradient-to-tr from-red-700 via-rose-600 to-red-900 shadow-[0_0_40px_rgba(239,68,68,0.4)]",
              voiceState === "idle" &&
                "bg-gradient-to-tr from-slate-800 via-slate-700 to-slate-900 shadow-[0_0_30px_rgba(255,255,255,0.1)]",
            )}
            style={{
              transform: `scale(${dynamicScale})`,
            }}
            onClick={
              voiceState === "speaking" || voiceState === "thinking"
                ? onInterrupt
                : onToggleMute
            }
          >
            {voiceState === "speaking" && (
              <Volume2 className="w-12 h-12 text-white/90 animate-bounce" />
            )}
            {voiceState === "thinking" && (
              <Sparkles className="w-12 h-12 text-white/90 animate-pulse" />
            )}
            {voiceState === "listening" && (
              <Mic className="w-12 h-12 text-white/90 animate-pulse" />
            )}
            {voiceState === "muted" && (
              <MicOff className="w-12 h-12 text-amber-300" />
            )}
            {voiceState === "error" && (
              <AlertCircle className="w-12 h-12 text-red-300" />
            )}
            {voiceState === "idle" && (
              <Mic className="w-12 h-12 text-slate-400" />
            )}
          </div>
        </div>

        {/* Live Transcript and Status Text Box */}
        <div className="w-full max-w-lg min-h-[110px] flex flex-col items-center justify-center text-center px-4 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          {voiceState === "speaking" && lastAssistantText && (
            <p className="text-sm sm:text-base text-cyan-200/90 font-display font-medium line-clamp-3 leading-relaxed animate-[fade-in_0.2s]">
              "{lastAssistantText}"
            </p>
          )}

          {(voiceState === "listening" || voiceState === "thinking") && (
            <>
              {interimTranscript ? (
                <p className="text-sm sm:text-base text-white font-medium line-clamp-3 leading-relaxed">
                  "{interimTranscript}"
                </p>
              ) : finalTranscript ? (
                <p className="text-sm text-slate-300 italic line-clamp-2">
                  "{finalTranscript}"
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-slate-400">
                  {t(
                    "apps.chatbotLiveStartSpeakingPrompt",
                    undefined,
                    "Start speaking, or tap to speak...",
                  )}
                </p>
              )}
            </>
          )}

          {voiceState === "muted" && (
            <p className="text-xs sm:text-sm text-amber-300/80 font-medium">
              {t(
                "apps.chatbotLiveMuted",
                undefined,
                "Microphone is currently muted.",
              )}
            </p>
          )}

          {voiceState === "error" && (
            <p className="text-xs sm:text-sm text-red-300/90 font-medium">
              {errorMessage ||
                t(
                  "apps.chatbotLiveMicDenied",
                  undefined,
                  "Microphone access required for voice mode.",
                )}
            </p>
          )}
        </div>
      </main>

      {/* Bottom Controls Bar */}
      <footer className="relative z-10 w-full max-w-xl px-6 py-8 flex flex-col items-center gap-4">
        {/* Hands-Free / Push to Talk Toggle */}
        <div className="flex items-center gap-2 bg-white/10 p-1 rounded-full border border-white/10">
          <button
            onClick={onToggleHandsFree}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all",
              isHandsFree
                ? "bg-primary text-black font-semibold shadow-md"
                : "text-slate-300 hover:text-white",
            )}
          >
            {t("apps.chatbotLiveHandsFree", undefined, "Hands-Free")}
          </button>
          <button
            onClick={onToggleHandsFree}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all",
              !isHandsFree
                ? "bg-primary text-black font-semibold shadow-md"
                : "text-slate-300 hover:text-white",
            )}
          >
            {t("apps.chatbotLivePushToTalk", undefined, "Push to Talk")}
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center justify-center gap-6 w-full">
          {/* Mute Button */}
          <button
            onClick={onToggleMute}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 border",
              isMuted
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
                : "bg-white/10 text-white border-white/15 hover:bg-white/20",
            )}
            title={
              isMuted
                ? t("apps.chatbotLiveListening", undefined, "Unmute")
                : t("apps.chatbotLiveMuted", undefined, "Mute")
            }
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>

          {/* Center Push-To-Talk or Interrupt Button */}
          {!isHandsFree ? (
            <button
              onMouseDown={onPushToTalkStart}
              onMouseUp={onPushToTalkEnd}
              onTouchStart={onPushToTalkStart}
              onTouchEnd={onPushToTalkEnd}
              className={cn(
                "px-8 h-14 rounded-full flex items-center gap-2 font-display text-sm font-semibold transition-all duration-200 shadow-xl select-none",
                isPushToTalkActive
                  ? "bg-cyan-500 text-black scale-105 shadow-cyan-500/50"
                  : "bg-primary text-black hover:bg-primary/90",
              )}
            >
              <Hand className="w-5 h-5" />
              <span>
                {isPushToTalkActive
                  ? t("apps.chatbotLiveListening", undefined, "Listening...")
                  : t("apps.chatbotLivePushToTalk", undefined, "Hold to Speak")}
              </span>
            </button>
          ) : (
            (voiceState === "speaking" || voiceState === "thinking") && (
              <button
                onClick={onInterrupt}
                className="w-14 h-14 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 flex items-center justify-center transition-all shadow-lg animate-[fade-in_0.2s]"
                title={t("apps.chatbotLiveInterrupt", undefined, "Interrupt")}
                aria-label={t(
                  "apps.chatbotLiveInterrupt",
                  undefined,
                  "Interrupt",
                )}
              >
                <Square className="w-6 h-6 fill-current" />
              </button>
            )
          )}

          {/* End Call Button */}
          <button
            onClick={onClose}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all duration-200 shadow-lg shadow-red-600/30"
            title={t("apps.chatbotLiveEnd", undefined, "End Live Chat")}
            aria-label={t("apps.chatbotLiveEnd", undefined, "End Live Chat")}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LiveVoiceOverlay;
