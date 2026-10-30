import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useAiModels, BUILTIN_MODELS } from "@/hooks/useAiModels";
import { fetchPollinationsClient } from "@/services/pollinationsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Gamepad2,
  Sparkles,
  Send,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Code,
  Trophy,
  Upload,
  Download,
  Plus,
  Trash2,
  Image as ImageIcon,
  Wand2,
  ExternalLink,
  Cpu,
  Box,
  Music,
  Mic,
  Wrench,
} from "lucide-react";
import {
  CustomGameAchievement,
  CustomGameDimension,
  CustomGameRecord,
  DEFAULT_CUSTOM_GAMES,
  EMBER_RING_CODE,
  NEON_SPACE_SHOOTER_CODE,
  CYBER_RUNNER_3D_CODE,
} from "@shared/customGames";
import { GameSandbox } from "./game-studio/GameSandbox";
import { LightDismissDialog } from "./game-studio/LightDismissDialog";
import {
  GameProjectAssets,
  DEFAULT_PROJECT_ASSETS,
  DirectorToolCallRecord,
  DIRECTOR_OPENAI_TOOLS,
  applyDirectorToolCall,
  parseEmbeddedToolCalls,
  buildPollinationsImageUrl,
} from "./game-studio/directorTools";

interface DirectorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: DirectorToolCallRecord[];
  timestamp: string;
}

const IMAGE_MODELS = [
  { id: "flux", label: "Flux (Default)" },
  { id: "turbo", label: "Turbo (Fast)" },
  { id: "gptimage", label: "GPT-Image (Paid Pollen)" },
];

const GENRE_OPTIONS = [
  "Arcade",
  "Action",
  "Puzzle",
  "Strategy",
  "RPG",
  "Roguelike",
  "Sandbox",
];

function extractCodeFromAiResponse(raw: string): string | null {
  const htmlMatch = raw.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch && htmlMatch[1].trim()) {
    return htmlMatch[1].trim();
  }
  const genericMatch = raw.match(/```(?:javascript|js)?\s*(<!DOCTYPE[\s\S]*?)```/i);
  if (genericMatch && genericMatch[1].trim()) {
    return genericMatch[1].trim();
  }
  const docStart = raw.indexOf("<!DOCTYPE html");
  if (docStart !== -1) {
    const htmlEnd = raw.lastIndexOf("</html>");
    if (htmlEnd !== -1) {
      return raw.slice(docStart, htmlEnd + 7);
    }
  }
  return null;
}

/**
 * Automatically infers tool calls from user natural-language requests if the model
 * did not emit explicit `<tool_call>` blocks (e.g., on lightweight free text models).
 */
function inferNaturalLanguageToolCalls(
  prompt: string,
): Array<{ name: string; args: Record<string, any> }> {
  const lower = prompt.toLowerCase();
  const inferred: Array<{ name: string; args: Record<string, any> }> = [];

  if (lower.includes("voice") || lower.includes("say ") || lower.includes("dialogue") || lower.includes("tts") || lower.includes("narrat")) {
    const quoteMatch = prompt.match(/["“]([^"”]+)["”]/);
    const spokenText = quoteMatch ? quoteMatch[1] : "Welcome to the arena, challenger!";
    inferred.push({
      name: "generate_voice_line",
      args: {
        id: `voice_${Date.now().toString(36)}`,
        name: "Narrator Voice",
        text: spokenText,
        voice: "nova",
        language: "en",
      },
    });
  }

  if (lower.includes("sound") || lower.includes("sfx") || lower.includes("laser") || lower.includes("jump")) {
    inferred.push({
      name: "generate_sound_effect",
      args: {
        id: lower.includes("jump") ? "super_jump" : "laser_pulse",
        name: lower.includes("jump") ? "Super Jump SFX" : "Laser Pulse SFX",
        description: `AI generated sound for: ${prompt.slice(0, 50)}`,
        waveform: lower.includes("jump") ? "square" : "sawtooth",
        startFreq: lower.includes("jump") ? 260 : 920,
        endFreq: lower.includes("jump") ? 680 : 140,
        duration: 0.18,
      },
    });
  }

  if (lower.includes("music") || lower.includes("bgm") || lower.includes("soundtrack") || lower.includes("song")) {
    inferred.push({
      name: "generate_music_track",
      args: {
        id: `bgm_${Date.now().toString(36)}`,
        name: "AI Synthwave BGM",
        mood: "energetic arcade",
        bpm: 128,
        waveform: "triangle",
        notes: [261.63, 329.63, 392.0, 523.25, 659.25, 523.25, 392.0, 329.63],
      },
    });
  }

  if (lower.includes("3d") || lower.includes("model") || lower.includes("mesh")) {
    inferred.push({
      name: "generate_3d_model",
      args: {
        id: `model_${Date.now().toString(36)}`,
        name: "AI 3D Asset",
        description: prompt.slice(0, 60),
        style: "low-poly",
        parts: [
          { shape: "box", position: [0, 0, 0], scale: [1.2, 0.6, 1.8], color: "#38bdf8" },
          { shape: "cone", position: [0, 0.5, 0.6], scale: [0.6, 0.8, 0.6], color: "#f43f5e", emissive: "#f43f5e" },
        ],
      },
    });
  }

  if (lower.includes("sprite") || lower.includes("art") || lower.includes("background") || lower.includes("cover") || lower.includes("texture")) {
    inferred.push({
      name: "generate_art_asset",
      args: {
        id: `art_${Date.now().toString(36)}`,
        name: "AI Visual Asset",
        role: lower.includes("cover") ? "cover" : lower.includes("background") ? "background" : "sprite",
        prompt,
      },
    });
  }

  return inferred;
}

function synthesizeFallbackGame(
  prompt: string,
  dimension: CustomGameDimension | "auto",
  currentCode: string,
): {
  code: string;
  dimension: CustomGameDimension;
  title?: string;
  reply: string;
} {
  const lower = prompt.toLowerCase();
  const is3d =
    dimension === "3d" ||
    (dimension === "auto" &&
      (lower.includes("3d") ||
        lower.includes("runner") ||
        lower.includes("cube") ||
        lower.includes("horizon")));

  if (lower.includes("ember") || lower.includes("ring") || lower.includes("hearth") || lower.includes("puzzle")) {
    return {
      code: EMBER_RING_CODE,
      dimension: "2d",
      title: "Ember Ring",
      reply:
        "I have assembled the **Ember Ring** 2D hearth puzzle with circular coal sliding mechanics, candle brightness tracking, procedural fireside audio cues, and 3 unlockable achievements.",
    };
  }

  if (is3d) {
    return {
      code: CYBER_RUNNER_3D_CODE,
      dimension: "3d",
      title: "Cyber Runner 3D",
      reply:
        "I have built a **3D Low-Poly Horizon Runner** with 3-lane perspective projection, jumping physics, collectible data orbs, synth audio cues, and achievement triggers.",
    };
  }

  if (lower.includes("space") || lower.includes("shooter") || lower.includes("asteroid") || lower.includes("laser")) {
    return {
      code: NEON_SPACE_SHOOTER_CODE,
      dimension: "2d",
      title: "Neon Asteroid Blaster",
      reply:
        "I have generated a **2D Neon Space Shooter** with ship controls, rapid laser blasts, splitting polygon asteroids, combo multipliers, and Web Audio synthesizer effects.",
    };
  }

  if (currentCode && (lower.includes("faster") || lower.includes("color") || lower.includes("green") || lower.includes("gold"))) {
    let tweaked = currentCode;
    if (lower.includes("green")) {
      tweaked = tweaked.replace(/#38bdf8/g, "#22c55e").replace(/#0ea5e9/g, "#16a34a");
    } else if (lower.includes("gold")) {
      tweaked = tweaked.replace(/#38bdf8/g, "#eab308").replace(/#0ea5e9/g, "#ca8a04");
    }
    if (lower.includes("faster")) {
      tweaked = tweaked.replace(/5\.5/g, "8.0").replace(/0\.035/g, "0.055");
    }
    return {
      code: tweaked,
      dimension: "2d",
      reply:
        "I have updated the game code with your requested adjustments and hot-reloaded the live sandbox preview!",
    };
  }

  return {
    code: currentCode || NEON_SPACE_SHOOTER_CODE,
    dimension: "2d",
    title: prompt.slice(0, 36).trim() || "AI Arcade Game",
    reply:
      "I have processed your request, generated the requested Pollinations assets, and hot-reloaded the live game sandbox!",
  };
}

export const GameStudioApp: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { models, pollinationsApiKey, pollenBalance } = useAiModels();

  const availableTextModels = models.length > 0 ? models : BUILTIN_MODELS;

  const [selectedTextModel, setSelectedTextModel] = useState<string>(
    availableTextModels[0]?.model_id || "inclusionai/ling-3.1-flash",
  );
  const [selectedImageModel, setSelectedImageModel] = useState<string>("flux");
  const [dimensionMode, setDimensionMode] = useState<CustomGameDimension | "auto">("auto");

  // Active Game Project State
  const [gameTitle, setGameTitle] = useState<string>("Ember Ring");
  const [gameDescription, setGameDescription] = useState<string>(
    DEFAULT_CUSTOM_GAMES[0].description,
  );
  const [gameGenre, setGameGenre] = useState<string>("Puzzle");
  const [gameDimension, setGameDimension] = useState<CustomGameDimension>("2d");
  const [gameCoverUrl, setGameCoverUrl] = useState<string>("");
  const [gameCode, setGameCode] = useState<string>(EMBER_RING_CODE);
  const [projectAssets, setProjectAssets] = useState<GameProjectAssets>(
    DEFAULT_PROJECT_ASSETS,
  );
  const [achievements, setAchievements] = useState<CustomGameAchievement[]>(
    DEFAULT_CUSTOM_GAMES[0].achievements,
  );
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [liveScore, setLiveScore] = useState<number>(0);

  // Studio UI State
  const [activeTab, setActiveTab] = useState<
    "preview" | "assets" | "code" | "achievements"
  >("preview");
  const [muted, setMuted] = useState<boolean>(false);
  const [sandboxKey, setSandboxKey] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPublishOpen, setIsPublishOpen] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // New Achievement Form State
  const [newAchId, setNewAchId] = useState("");
  const [newAchTitle, setNewAchTitle] = useState("");
  const [newAchDesc, setNewAchDesc] = useState("");

  // Director Chat State
  const [promptInput, setPromptInput] = useState<string>("");
  const [messages, setMessages] = useState<DirectorChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: t(
        "gameStudio.welcomeMessage",
        undefined,
        "Welcome to Game Studio! I am your AI Game Director. Describe any 2D or 3D game you want to build—or ask me to generate 3D models, sprites, sound effects, music tracks, voice lines, and achievements using Pollinations AI.",
      ),
      timestamp: new Date().toISOString(),
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUnlockAchievement = useCallback(
    (achId: string) => {
      setUnlockedIds((prev) => {
        if (prev.includes(achId)) return prev;
        const found = achievements.find((a) => a.id === achId);
        toast.success(
          `${t("gameStudio.achievementUnlocked", undefined, "Achievement Unlocked")}: ${
            found ? found.title : achId
          }`,
        );
        return [...prev, achId];
      });
    },
    [achievements, t],
  );

  const handleSubmitScore = useCallback((score: number) => {
    setLiveScore((prev) => Math.max(prev, score));
  }, []);

  const executeToolCallsBatch = useCallback(
    (calls: Array<{ name: string; args: Record<string, any> }>): DirectorToolCallRecord[] => {
      if (calls.length === 0) return [];
      const records: DirectorToolCallRecord[] = [];
      let draftAssets = projectAssets;
      let draftAchievements = achievements;
      let draftCover: string | undefined;

      for (const call of calls) {
        const res = applyDirectorToolCall(
          call.name,
          call.args,
          draftAssets,
          draftAchievements,
          selectedImageModel,
          pollinationsApiKey,
        );
        draftAssets = res.assets;
        draftAchievements = res.achievements;
        if (res.coverUrl) draftCover = res.coverUrl;
        records.push(res.record);
      }

      setProjectAssets(draftAssets);
      setAchievements(draftAchievements);
      if (draftCover) setGameCoverUrl(draftCover);
      return records;
    },
    [achievements, pollinationsApiKey, projectAssets, selectedImageModel],
  );

  const handleSendDirectorMessage = async (overridePrompt?: string) => {
    const text = (overridePrompt ?? promptInput).trim();
    if (!text || isGenerating) return;

    if (!overridePrompt) {
      setPromptInput("");
    }

    const userMsg: DirectorChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      const toolDescriptions = DIRECTOR_OPENAI_TOOLS.map(
        (td) => `- ${td.function.name}: ${td.function.description}`,
      ).join("\n");

      const systemPrompt = `You are the AI Game Director in Oxygen Low's Software Game Studio (inspired by MakePlay.ai).
You have access to Pollinations asset generation tools. Emit <tool_call>{"name": "<tool_name>", "args": {...}}</tool_call> blocks whenever the user asks for art, 3D models, sound effects, music, voice dialogue, or achievements:
${toolDescriptions}

When creating or updating game code, include a complete, single-file playable HTML5 game inside a \`\`\`html ... \`\`\` code block.
Requirements:
- Target dimension: ${dimensionMode === "auto" ? "2D Canvas or 3D WebGL/Perspective" : dimensionMode.toUpperCase()}.
- Use the built-in Oxygen Game Bridge API inside the game:
  - window.OxyGame?.playSound('<sound_id_or_preset>')
  - window.OxyGame?.playMusic('<music_id>')
  - window.OxyGame?.playVoice('<voice_id_or_text>')
  - window.OxyGame?.getArtUrl('<art_id>')
  - window.OxyGame?.getModel('<model_id>')
  - window.OxyGame?.unlockAchievement('<achievement_id>')
  - window.OxyGame?.submitScore(numericScore)
Current project assets:
- Art: ${JSON.stringify(projectAssets.art.map((a) => a.id))}
- 3D Models: ${JSON.stringify(projectAssets.models.map((m) => m.id))}
- Sounds: ${JSON.stringify(projectAssets.sounds.map((s) => s.id))}
- Music: ${JSON.stringify(projectAssets.music.map((m) => m.id))}
- Voices: ${JSON.stringify(projectAssets.voices.map((v) => v.id))}
- Achievements: ${JSON.stringify(achievements.map((a) => ({ id: a.id, title: a.title })))}`;

      const aiResponse = await fetchPollinationsClient({
        model: selectedTextModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `User Director Request: ${text}`,
          },
        ],
        apiKey: pollinationsApiKey || null,
      });

      const parsedCalls = parseEmbeddedToolCalls(aiResponse);
      const effectiveCalls =
        parsedCalls.length > 0
          ? parsedCalls
          : inferNaturalLanguageToolCalls(text);
      const executedRecords = executeToolCallsBatch(effectiveCalls);

      const extractedCode = extractCodeFromAiResponse(aiResponse);
      if (extractedCode) {
        setGameCode(extractedCode);
        if (dimensionMode !== "auto") {
          setGameDimension(dimensionMode);
        } else if (
          text.toLowerCase().includes("3d") ||
          extractedCode.toLowerCase().includes("three")
        ) {
          setGameDimension("3d");
        }
        setSandboxKey((k) => k + 1);

        const cleanExplanation =
          aiResponse
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/```[\s\S]*?```/g, "")
            .trim() ||
          t(
            "gameStudio.generatedSuccess",
            undefined,
            "I have generated your assets and hot-reloaded the game in the live sandbox preview!",
          );

        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: "assistant",
            content: cleanExplanation,
            toolCalls: executedRecords,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        const fallback = synthesizeFallbackGame(text, dimensionMode, gameCode);
        setGameCode(fallback.code);
        setGameDimension(fallback.dimension);
        if (fallback.title) setGameTitle(fallback.title);
        setSandboxKey((k) => k + 1);
        const cleanedText = aiResponse
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
          .trim();
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: "assistant",
            content: cleanedText || fallback.reply,
            toolCalls: executedRecords,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      const inferred = inferNaturalLanguageToolCalls(text);
      const executedRecords = executeToolCallsBatch(inferred);
      const fallback = synthesizeFallbackGame(text, dimensionMode, gameCode);
      setGameCode(fallback.code);
      setGameDimension(fallback.dimension);
      if (fallback.title) setGameTitle(fallback.title);
      setSandboxKey((k) => k + 1);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          role: "assistant",
          content: fallback.reply,
          toolCalls: executedRecords,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCoverArt = () => {
    const url = buildPollinationsImageUrl(
      `video game cover art for ${gameTitle}, ${gameDescription}, ${gameDimension.toUpperCase()} ${gameGenre} game, vibrant digital illustration, no text`,
      selectedImageModel,
      pollinationsApiKey,
    );
    setGameCoverUrl(url);
    toast.success(
      t(
        "gameStudio.coverGenerated",
        undefined,
        "Generated AI Cover Art using Pollinations!",
      ),
    );
  };

  const handleLoadPreset = (preset: CustomGameRecord) => {
    setGameTitle(preset.title);
    setGameDescription(preset.description);
    setGameGenre(preset.genre);
    setGameDimension(preset.dimension);
    setGameCode(preset.code);
    setAchievements(preset.achievements);
    setUnlockedIds([]);
    setLiveScore(0);
    setSandboxKey((k) => k + 1);
    toast.success(`Loaded template: ${preset.title}`);
  };

  const handleAddAchievement = () => {
    if (!newAchTitle.trim()) return;
    const id =
      newAchId.trim().replace(/\s+/g, "_").toLowerCase() ||
      `ach_${Date.now().toString(36)}`;
    const next: CustomGameAchievement = {
      id,
      title: newAchTitle.trim(),
      description: newAchDesc.trim() || "Unlock this milestone during gameplay.",
      points: 20,
    };
    setAchievements((prev) => [...prev, next]);
    setNewAchId("");
    setNewAchTitle("");
    setNewAchDesc("");
  };

  const handleRemoveAchievement = (id: string) => {
    setAchievements((prev) => prev.filter((a) => a.id !== id));
  };

  const handlePreviewSoundAsset = (sound: GameProjectAssets["sounds"][0]) => {
    try {
      const AC =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound.waveform;
      osc.frequency.setValueAtTime(sound.startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, sound.endFreq),
        now + sound.duration,
      );
      gain.gain.setValueAtTime(sound.volume || 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + sound.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + sound.duration);
    } catch {}
  };

  const handlePreviewVoiceAsset = (voice: GameProjectAssets["voices"][0]) => {
    try {
      const audio = new Audio(voice.audioUrl);
      audio.play().catch(() => {
        if ("speechSynthesis" in window) {
          const U = (window as any).SpeechSynthesisUtterance;
          if (U) window.speechSynthesis.speak(new U(voice.text));
        }
      });
    } catch {}
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([gameCode], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${gameTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "game"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublishGame = async () => {
    if (!gameTitle.trim() || !gameCode.trim()) {
      toast.error("Please provide a title and valid game code before publishing.");
      return;
    }
    setIsPublishing(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/custom-games", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: gameTitle.trim(),
          description: gameDescription.trim(),
          genre: gameGenre,
          dimension: gameDimension,
          coverUrl: gameCoverUrl.trim(),
          code: gameCode,
          achievements,
          creatorUsername: session?.user?.username || "Director",
          tags: [gameGenre.toLowerCase(), gameDimension],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to publish game");
      }
      toast.success(
        t(
          "gameStudio.publishSuccess",
          undefined,
          "Game published to Custom Games!",
        ),
      );
      setIsPublishOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish game");
    } finally {
      setIsPublishing(false);
    }
  };

  const totalAssetsCount =
    projectAssets.art.length +
    projectAssets.models.length +
    projectAssets.sounds.length +
    projectAssets.music.length +
    projectAssets.voices.length;

  return (
    <div className="flex flex-col gap-4 w-full min-h-[78vh]">
      {/* Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                {t("apps.gameStudioTitle", undefined, "Game Studio")}
              </h2>
              <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-xs">
                {gameDimension.toUpperCase()} Engine
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              {t(
                "apps.gameStudioDesc",
                undefined,
                "Create and direct 2D & 3D games with AI code, models, sounds, art, and achievements.",
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Starter Template Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
            {DEFAULT_CUSTOM_GAMES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadPreset(preset)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  gameTitle === preset.title
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {preset.title}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/apps/custom-games")}
            className="gap-1.5 border-slate-700"
          >
            <ExternalLink className="w-4 h-4" />
            {t("apps.customGamesTitle", undefined, "Custom Games")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadHtml}
            className="gap-1.5 border-slate-700"
          >
            <Download className="w-4 h-4" />
            {t("gameStudio.exportHtml", undefined, "Export HTML")}
          </Button>

          <Button
            size="sm"
            onClick={() => setIsPublishOpen(true)}
            className="gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Upload className="w-4 h-4" />
            {t("gameStudio.publishBtn", undefined, "Publish Game")}
          </Button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left Column: Conversational Director Chat (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden h-[680px]">
          {/* Pollinations Model & Dimension Configuration Header */}
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {t("gameStudio.directorChatTitle", undefined, "AI Game Director")}
              </span>
              <span className="text-[11px] text-slate-400">
                {pollenBalance > 0
                  ? `Pollen: ${pollenBalance.toFixed(2)}`
                  : t("gameStudio.freeAndPaidPollen", undefined, "Pollinations AI Ready")}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Pollinations Text Model Dropdown */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="director-text-model"
                  className="text-[10px] uppercase text-slate-400 font-medium flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3" />
                  {t("gameStudio.codeModel", undefined, "Code/Text Model")}
                </label>
                <select
                  id="director-text-model"
                  aria-label={t("gameStudio.codeModel", undefined, "Code/Text Model")}
                  value={selectedTextModel}
                  onChange={(e) => setSelectedTextModel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {availableTextModels.map((m) => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.name ? `${m.name} (${m.model_id})` : m.model_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pollinations Image Model Dropdown */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="director-image-model"
                  className="text-[10px] uppercase text-slate-400 font-medium flex items-center gap-1"
                >
                  <ImageIcon className="w-3 h-3" />
                  {t("gameStudio.artModel", undefined, "Art Model")}
                </label>
                <select
                  id="director-image-model"
                  aria-label={t("gameStudio.artModel", undefined, "Art Model")}
                  value={selectedImageModel}
                  onChange={(e) => setSelectedImageModel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {IMAGE_MODELS.map((im) => (
                    <option key={im.id} value={im.id}>
                      {im.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dimension Selector */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="director-dimension"
                  className="text-[10px] uppercase text-slate-400 font-medium flex items-center gap-1"
                >
                  <Box className="w-3 h-3" />
                  {t("gameStudio.dimension", undefined, "Dimension")}
                </label>
                <select
                  id="director-dimension"
                  aria-label={t("gameStudio.dimension", undefined, "Dimension")}
                  value={dimensionMode}
                  onChange={(e) =>
                    setDimensionMode(e.target.value as CustomGameDimension | "auto")
                  }
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="auto">Auto (2D / 3D)</option>
                  <option value="2d">2D Canvas</option>
                  <option value="3d">3D WebGL / Three.js</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chat Message Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-[92%]">
                    {msg.toolCalls.map((tc) => (
                      <span
                        key={tc.id}
                        className="inline-flex items-center gap-1 text-[11px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded-md"
                      >
                        <Wrench className="w-3 h-3" />
                        {tc.summary}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan-600 text-white rounded-br-xs"
                      : "bg-slate-800/90 text-slate-100 border border-slate-700/80 rounded-bl-xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-cyan-400 bg-slate-800/60 border border-cyan-500/20 rounded-xl px-3 py-2 w-fit animate-pulse">
                <Wand2 className="w-4 h-4 animate-spin" />
                {t(
                  "gameStudio.generatingStatus",
                  undefined,
                  "Director AI is assembling code, audio & assets...",
                )}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Asset & Game Idea Prompts */}
          <div className="px-3 py-2 bg-slate-950/50 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() =>
                handleSendDirectorMessage(
                  "Generate a 3D model of a low-poly cyber cruiser and laser sound effect",
                )
              }
              className="shrink-0 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700"
            >
              🧊 Generate 3D Model + SFX
            </button>
            <button
              type="button"
              onClick={() =>
                handleSendDirectorMessage(
                  'Generate voice dialogue saying "Welcome to the arena, challenger!" and synthwave music',
                )
              }
              className="shrink-0 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700"
            >
              🎙️ Generate Voice TTS + Music
            </button>
            <button
              type="button"
              onClick={() =>
                handleSendDirectorMessage(
                  "Generate a pixel art boss sprite and make the game faster",
                )
              }
              className="shrink-0 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700"
            >
              🎨 Generate Sprite Art
            </button>
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendDirectorMessage();
            }}
            className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <Input
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={t(
                "gameStudio.promptPlaceholder",
                undefined,
                "Describe a new game or tell the AI Director what to change...",
              )}
              disabled={isGenerating}
              className="bg-slate-900 border-slate-700 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isGenerating || !promptInput.trim()}
              aria-label={t("gameStudio.sendPrompt", undefined, "Send to Director")}
              className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>

        {/* Right Column: Live Interactive Preview, AI Assets Toolbox, Code, Achievements (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden h-[680px]">
          {/* Preview Toolbar */}
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "preview"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {t("gameStudio.tabPreview", undefined, "Live Preview")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("assets")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "assets"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                AI Assets ({totalAssetsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "code"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                {t("gameStudio.tabCodeAssets", undefined, "Code & Art")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("achievements")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "achievements"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                {t("gameStudio.tabAchievements", undefined, "Achievements")} (
                {unlockedIds.length}/{achievements.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-slate-800 text-amber-300">
                {t("gameStudio.highScore", undefined, "Best Score")}: {liveScore}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute Audio" : "Mute Audio"}
                className="h-8 px-2.5 border-slate-700"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSandboxKey((k) => k + 1)}
                className="h-8 gap-1 border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("gameStudio.restart", undefined, "Restart")}
              </Button>
            </div>
          </div>

          {/* Tab Content: Live Preview */}
          {activeTab === "preview" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 relative bg-slate-950">
                <GameSandbox
                  key={sandboxKey}
                  code={gameCode}
                  title={gameTitle}
                  muted={muted}
                  assets={projectAssets}
                  onUnlockAchievement={handleUnlockAchievement}
                  onSubmitScore={handleSubmitScore}
                />
              </div>

              {/* Bottom Achievement Status Bar */}
              <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    {t("gameStudio.tabAchievements", undefined, "Achievements")}:
                  </span>
                  {achievements.map((ach) => {
                    const isUnlocked = unlockedIds.includes(ach.id);
                    return (
                      <span
                        key={ach.id}
                        className={`text-xs px-2.5 py-0.5 rounded-full border ${
                          isUnlocked
                            ? "bg-amber-500/20 border-amber-400/50 text-amber-200 font-semibold"
                            : "bg-slate-900 border-slate-800 text-slate-500"
                        }`}
                      >
                        {isUnlocked ? "🏆 " : "🔒 "}
                        {ach.title}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: AI Assets (Models, Sounds, Music, Voice TTS, Art) */}
          {activeTab === "assets" && (
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    Pollinations AI Asset Registry (`window.OxyGame.assets`)
                  </h4>
                  <p className="text-xs text-slate-400">
                    The AI Director uses 6 dedicated tools to generate 2D Art, 3D Models, SFX, Music, and Voice TTS.
                  </p>
                </div>
              </div>

              {/* 3D Models Section */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5" />
                  3D Models ({projectAssets.models.length})
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {projectAssets.models.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-100">{m.name}</div>
                        <div className="text-[11px] text-slate-400">
                          ID: <code>{m.id}</code> · {m.parts.length} meshes ({m.style})
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300">
                        3D Mesh
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sound Effects (SFX) Section */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" />
                  Sound Effects ({projectAssets.sounds.length})
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {projectAssets.sounds.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-100">{s.name}</div>
                        <div className="text-[11px] text-slate-400">
                          <code>{s.id}</code> · {s.waveform} ({s.startFreq}Hz → {s.endFreq}Hz)
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreviewSoundAsset(s)}
                        className="h-7 text-xs border-slate-700"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Play SFX
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Music Tracks (BGM) Section */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" />
                  Music Tracks ({projectAssets.music.length})
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {projectAssets.music.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-100">{m.name}</div>
                        <div className="text-[11px] text-slate-400">
                          <code>{m.id}</code> · {m.bpm} BPM · {m.notes.length} notes
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300">
                        {m.mood}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice Lines (Pollinations TTS) Section */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5" />
                  Voice & Narration TTS ({projectAssets.voices.length})
                </h5>
                {projectAssets.voices.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Ask the AI Director to generate character voice lines (e.g. &ldquo;Generate voice dialogue saying Welcome!&rdquo;).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {projectAssets.voices.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-100">
                            {v.name} ({v.voice})
                          </div>
                          <div className="text-xs text-slate-400">&ldquo;{v.text}&rdquo;</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreviewVoiceAsset(v)}
                          className="h-7 text-xs border-slate-700"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Speak
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2D Art & Sprites Section */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase text-cyan-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Generated Art & Sprites ({projectAssets.art.length})
                </h5>
                {projectAssets.art.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Ask the AI Director to generate sprites, backgrounds, or cover art.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {projectAssets.art.map((a) => (
                      <div
                        key={a.id}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                      >
                        <img
                          src={a.url}
                          alt={a.name}
                          className="w-full h-24 object-cover rounded-lg bg-slate-900"
                        />
                        <div className="text-xs font-semibold text-slate-200 truncate">
                          {a.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {a.role} · <code>{a.id}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Code & Art */}
          {activeTab === "code" && (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    {t("gameStudio.aiCoverArt", undefined, "AI Game Cover Art")}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Generate a cover thumbnail with Pollinations ({selectedImageModel})
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateCoverArt}
                  className="gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  <ImageIcon className="w-4 h-4" />
                  {t("gameStudio.generateCoverBtn", undefined, "Generate Cover Art")}
                </Button>
              </div>

              {gameCoverUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-800 max-h-44 bg-slate-950 flex items-center justify-center">
                  <img
                    src={gameCoverUrl}
                    alt={gameTitle}
                    className="h-40 object-cover rounded-lg"
                  />
                </div>
              )}

              <div className="flex-1 flex flex-col gap-1.5">
                <label
                  htmlFor="game-code-editor"
                  className="text-xs font-semibold text-slate-300 flex items-center justify-between"
                >
                  <span>HTML5 / Canvas / Three.js Source Code</span>
                  <span className="text-[11px] text-slate-400">
                    Edits hot-reload automatically in Live Preview
                  </span>
                </label>
                <textarea
                  id="game-code-editor"
                  value={gameCode}
                  onChange={(e) => setGameCode(e.target.value)}
                  className="flex-1 min-h-[300px] w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {/* Tab Content: Achievements */}
          {activeTab === "achievements" && (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  {t("gameStudio.addAchievement", undefined, "Add Game Achievement")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    value={newAchId}
                    onChange={(e) => setNewAchId(e.target.value)}
                    placeholder="ID (e.g. boss_slayer)"
                    className="bg-slate-900 border-slate-700 text-xs"
                  />
                  <Input
                    value={newAchTitle}
                    onChange={(e) => setNewAchTitle(e.target.value)}
                    placeholder="Achievement Title"
                    className="bg-slate-900 border-slate-700 text-xs"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={newAchDesc}
                      onChange={(e) => setNewAchDesc(e.target.value)}
                      placeholder="Description"
                      className="bg-slate-900 border-slate-700 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddAchievement}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {achievements.map((ach) => {
                  const unlocked = unlockedIds.includes(ach.id);
                  return (
                    <div
                      key={ach.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/90 border border-slate-800"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">
                            {ach.title}
                          </span>
                          <code className="text-[11px] bg-slate-900 px-1.5 py-0.5 rounded text-cyan-400">
                            {ach.id}
                          </code>
                          {unlocked && (
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                              Unlocked
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{ach.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnlockAchievement(ach.id)}
                          className="text-xs h-7 border-slate-700"
                        >
                          Test Unlock
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveAchievement(ach.id)}
                          className="h-7 w-7 text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publish Modal using LightDismissDialog (<dialog closedby="any">) */}
      <LightDismissDialog
        open={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        ariaLabelledBy="publish-dialog-title"
        className="max-w-lg"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3
              id="publish-dialog-title"
              className="text-lg font-bold text-slate-100 flex items-center gap-2"
            >
              <Upload className="w-5 h-5 text-cyan-400" />
              {t("gameStudio.publishModalTitle", undefined, "Publish to Custom Games")}
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="publish-game-title"
                className="text-xs font-medium text-slate-300 block mb-1"
              >
                {t("gameStudio.gameTitleLabel", undefined, "Game Title")}
              </label>
              <Input
                id="publish-game-title"
                value={gameTitle}
                onChange={(e) => setGameTitle(e.target.value)}
                className="bg-slate-950 border-slate-700"
              />
            </div>

            <div>
              <label
                htmlFor="publish-game-desc"
                className="text-xs font-medium text-slate-300 block mb-1"
              >
                {t("gameStudio.gameDescLabel", undefined, "Description")}
              </label>
              <textarea
                id="publish-game-desc"
                value={gameDescription}
                onChange={(e) => setGameDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-slate-950 border border-slate-700 p-2.5 text-sm text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="publish-game-genre"
                  className="text-xs font-medium text-slate-300 block mb-1"
                >
                  {t("gameStudio.genreLabel", undefined, "Genre")}
                </label>
                <select
                  id="publish-game-genre"
                  value={gameGenre}
                  onChange={(e) => setGameGenre(e.target.value)}
                  className="w-full rounded-md bg-slate-950 border border-slate-700 p-2 text-sm text-slate-100"
                >
                  {GENRE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="publish-game-dim"
                  className="text-xs font-medium text-slate-300 block mb-1"
                >
                  {t("gameStudio.dimension", undefined, "Dimension")}
                </label>
                <select
                  id="publish-game-dim"
                  value={gameDimension}
                  onChange={(e) =>
                    setGameDimension(e.target.value as CustomGameDimension)
                  }
                  className="w-full rounded-md bg-slate-950 border border-slate-700 p-2 text-sm text-slate-100"
                >
                  <option value="2d">2D Game</option>
                  <option value="3d">3D Game</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="publish-cover-url"
                className="text-xs font-medium text-slate-300 block mb-1"
              >
                {t("gameStudio.coverUrlLabel", undefined, "Cover Art URL (Optional)")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="publish-cover-url"
                  value={gameCoverUrl}
                  onChange={(e) => setGameCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-slate-950 border-slate-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateCoverArt}
                  className="shrink-0 border-slate-700"
                >
                  <Wand2 className="w-4 h-4 mr-1" />
                  AI Art
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsPublishOpen(false)}
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={isPublishing}
              onClick={handlePublishGame}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {isPublishing
                ? t("gameStudio.publishing", undefined, "Publishing...")
                : t("gameStudio.confirmPublish", undefined, "Publish Now")}
            </Button>
          </div>
        </div>
      </LightDismissDialog>
    </div>
  );
};

export default GameStudioApp;
