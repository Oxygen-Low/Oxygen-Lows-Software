import { CustomGameAchievement } from "@shared/customGames";
import { POLLINATIONS_TEXT_API_URL } from "@/services/pollinationsClient";

export type GameAssetType = "art" | "model" | "sound" | "music" | "voice";

export interface GeneratedArtAsset {
  id: string;
  name: string;
  role: "sprite" | "background" | "texture" | "cover" | "ui";
  prompt: string;
  url: string;
  model: string;
}

export interface Generated3DModelAsset {
  id: string;
  name: string;
  description: string;
  style: "low-poly" | "voxel" | "stylized" | "realistic";
  parts: Array<{
    shape: "box" | "sphere" | "cylinder" | "cone" | "torus";
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: [number, number, number];
    color: string;
    emissive?: string;
  }>;
  textureUrl?: string;
}

export interface GeneratedSoundAsset {
  id: string;
  name: string;
  description: string;
  waveform: "sine" | "square" | "sawtooth" | "triangle";
  startFreq: number;
  endFreq: number;
  duration: number;
  volume: number;
  audioUrl?: string;
}

export interface GeneratedMusicAsset {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  waveform: "sine" | "square" | "sawtooth" | "triangle";
  notes: number[]; // MIDI or Hz sequence
  noteDuration: number;
  audioUrl?: string;
}

export interface GeneratedVoiceAsset {
  id: string;
  name: string;
  text: string;
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  language: string;
  audioUrl: string;
}

export interface GameProjectAssets {
  art: GeneratedArtAsset[];
  models: Generated3DModelAsset[];
  sounds: GeneratedSoundAsset[];
  music: GeneratedMusicAsset[];
  voices: GeneratedVoiceAsset[];
}

export interface DirectorToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, any>;
  summary: string;
}

export const DEFAULT_PROJECT_ASSETS: GameProjectAssets = {
  art: [],
  models: [
    {
      id: "hearth_brazier",
      name: "Hearth Brazier 3D",
      description: "Low-poly brass hearth ring with glowing central candle",
      style: "low-poly",
      parts: [
        { shape: "torus", position: [0, 0, 0], scale: [1.5, 1.5, 0.3], color: "#b87d3b" },
        { shape: "cylinder", position: [0, 0.3, 0], scale: [0.3, 0.8, 0.3], color: "#e8d0a7" },
        { shape: "sphere", position: [0, 0.85, 0], scale: [0.2, 0.3, 0.2], color: "#ffae2b", emissive: "#ff7b1c" },
      ],
    },
  ],
  sounds: [
    {
      id: "coal_slide",
      name: "Coal Slide",
      description: "Warm stone slide across brass ring",
      waveform: "triangle",
      startFreq: 320,
      endFreq: 180,
      duration: 0.12,
      volume: 0.18,
    },
    {
      id: "vent_ignite",
      name: "Vent Ignite",
      description: "Sparkling chime when a coal pins into an air vent",
      waveform: "sine",
      startFreq: 587.33,
      endFreq: 1174.66,
      duration: 0.24,
      volume: 0.22,
    },
  ],
  music: [
    {
      id: "hearth_bgm",
      name: "Fireside Ambience Loop",
      mood: "warm, cozy, mysterious",
      bpm: 96,
      waveform: "triangle",
      notes: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63],
      noteDuration: 0.35,
    },
  ],
  voices: [],
};

/**
 * OpenAI-compatible function tool definitions sent to Pollinations (`gen.pollinations.ai/v1/chat/completions`)
 * so the LLM can autonomously generate art, 3D models, sound effects, music, voice TTS, and achievements.
 */
export const DIRECTOR_OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_art_asset",
      description:
        "Generate 2D game art, sprites, backgrounds, textures, or cover art using Pollinations Image AI.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique asset identifier (e.g. player_ship)" },
          name: { type: "string", description: "Human-readable asset name" },
          role: {
            type: "string",
            enum: ["sprite", "background", "texture", "cover", "ui"],
          },
          prompt: {
            type: "string",
            description: "Detailed visual description for Pollinations image generation",
          },
        },
        required: ["id", "name", "role", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_3d_model",
      description:
        "Generate a 3D model composed of 3D primitives and optional Pollinations texture for Three.js/WebGL games.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique model ID (e.g. cyber_cruiser)" },
          name: { type: "string", description: "Model display name" },
          description: { type: "string", description: "Visual description of the 3D object" },
          style: {
            type: "string",
            enum: ["low-poly", "voxel", "stylized", "realistic"],
          },
          parts: {
            type: "array",
            description: "3D mesh primitives that form the composite model",
            items: {
              type: "object",
              properties: {
                shape: {
                  type: "string",
                  enum: ["box", "sphere", "cylinder", "cone", "torus"],
                },
                position: {
                  type: "array",
                  items: { type: "number" },
                  description: "[x, y, z]",
                },
                scale: {
                  type: "array",
                  items: { type: "number" },
                  description: "[sx, sy, sz]",
                },
                color: { type: "string", description: "Hex color e.g. #38bdf8" },
                emissive: { type: "string", description: "Optional emissive glow hex color" },
              },
              required: ["shape", "position", "scale", "color"],
            },
          },
        },
        required: ["id", "name", "description", "parts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_sound_effect",
      description:
        "Generate a synthesized or Pollinations audio sound effect (SFX) playable via window.OxyGame.playSound(id).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Sound cue ID (e.g. plasma_blast)" },
          name: { type: "string", description: "Display name" },
          description: { type: "string", description: "Sound description" },
          waveform: {
            type: "string",
            enum: ["sine", "square", "sawtooth", "triangle"],
          },
          startFreq: { type: "number", description: "Starting frequency in Hz (e.g. 880)" },
          endFreq: { type: "number", description: "Ending frequency in Hz (e.g. 120)" },
          duration: { type: "number", description: "Duration in seconds (0.05 to 1.5)" },
        },
        required: ["id", "name", "waveform", "startFreq", "endFreq", "duration"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_music_track",
      description:
        "Compose a looping background music (BGM) track playable via window.OxyGame.playMusic(id).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Track ID (e.g. boss_theme)" },
          name: { type: "string", description: "Track title" },
          mood: { type: "string", description: "Musical mood or style" },
          bpm: { type: "number", description: "Tempo in BPM (60 to 180)" },
          waveform: {
            type: "string",
            enum: ["sine", "square", "sawtooth", "triangle"],
          },
          notes: {
            type: "array",
            items: { type: "number" },
            description: "Sequence of frequencies in Hz (e.g. [261.63, 329.63, 392.0, 523.25])",
          },
        },
        required: ["id", "name", "bpm", "waveform", "notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_voice_line",
      description:
        "Generate spoken character dialogue or narration using Pollinations Text-to-Speech (TTS) playable via window.OxyGame.playVoice(id).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Voice cue ID (e.g. intro_narrator)" },
          name: { type: "string", description: "Character or cue label" },
          text: { type: "string", description: "Dialogue line to speak" },
          voice: {
            type: "string",
            enum: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
          },
          language: {
            type: "string",
            description: "Language code (e.g. en, ja, zh-CN, es, ko, ru)",
          },
        },
        required: ["id", "name", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "define_achievements",
      description: "Define or update unlockable game achievements.",
      parameters: {
        type: "object",
        properties: {
          achievements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                points: { type: "number" },
              },
              required: ["id", "title", "description"],
            },
          },
        },
        required: ["achievements"],
      },
    },
  },
];

export function buildPollinationsImageUrl(
  prompt: string,
  model = "flux",
  apiKey?: string | null,
): string {
  const encoded = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 100000);
  let url = `https://image.pollinations.ai/prompt/${encoded}?model=${encodeURIComponent(
    model,
  )}&width=512&height=512&nologo=true&seed=${seed}`;
  if (apiKey && apiKey.trim()) {
    url += `&key=${encodeURIComponent(apiKey.trim())}`;
  }
  return url;
}

export function buildPollinationsVoiceUrl(
  text: string,
  voice = "alloy",
  apiKey?: string | null,
): string {
  const encoded = encodeURIComponent(text.trim().slice(0, 500));
  let url = `https://gen.pollinations.ai/audio/${encoded}?voice=${encodeURIComponent(
    voice,
  )}`;
  if (apiKey && apiKey.trim()) {
    url += `&key=${encodeURIComponent(apiKey.trim())}`;
  }
  return url;
}

/**
 * Executes a single tool call requested by the LLM Director and mutates a draft copy of assets/achievements.
 */
export function applyDirectorToolCall(
  toolName: string,
  rawArgs: Record<string, any>,
  currentAssets: GameProjectAssets,
  currentAchievements: CustomGameAchievement[],
  imageModel: string,
  apiKey?: string | null,
): {
  assets: GameProjectAssets;
  achievements: CustomGameAchievement[];
  coverUrl?: string;
  record: DirectorToolCallRecord;
} {
  const nextAssets: GameProjectAssets = {
    art: [...currentAssets.art],
    models: [...currentAssets.models],
    sounds: [...currentAssets.sounds],
    music: [...currentAssets.music],
    voices: [...currentAssets.voices],
  };
  let nextAchievements = [...currentAchievements];
  let newCoverUrl: string | undefined;
  let summary = "";

  if (toolName === "generate_art_asset") {
    const id = String(rawArgs.id || `art_${Date.now().toString(36)}`);
    const name = String(rawArgs.name || id);
    const role = (rawArgs.role || "sprite") as GeneratedArtAsset["role"];
    const prompt = String(rawArgs.prompt || name);
    const url = buildPollinationsImageUrl(prompt, imageModel, apiKey);
    const item: GeneratedArtAsset = {
      id,
      name,
      role,
      prompt,
      url,
      model: imageModel,
    };
    nextAssets.art = [
      ...nextAssets.art.filter((a) => a.id !== id),
      item,
    ];
    if (role === "cover") {
      newCoverUrl = url;
    }
    summary = `Generated ${role} art "${name}" via Pollinations (${imageModel})`;
  } else if (toolName === "generate_3d_model") {
    const id = String(rawArgs.id || `model_${Date.now().toString(36)}`);
    const name = String(rawArgs.name || id);
    const description = String(rawArgs.description || name);
    const style = (rawArgs.style || "low-poly") as Generated3DModelAsset["style"];
    const parts = Array.isArray(rawArgs.parts) && rawArgs.parts.length > 0
      ? rawArgs.parts.map((p: any) => ({
          shape: p.shape || "box",
          position: (Array.isArray(p.position) && p.position.length === 3
            ? p.position
            : [0, 0, 0]) as [number, number, number],
          scale: (Array.isArray(p.scale) && p.scale.length === 3
            ? p.scale
            : [1, 1, 1]) as [number, number, number],
          rotation: (Array.isArray(p.rotation) && p.rotation.length === 3
            ? p.rotation
            : [0, 0, 0]) as [number, number, number],
          color: String(p.color || "#38bdf8"),
          emissive: p.emissive ? String(p.emissive) : undefined,
        }))
      : [
          {
            shape: "box" as const,
            position: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
            color: "#38bdf8",
          },
        ];

    const modelAsset: Generated3DModelAsset = {
      id,
      name,
      description,
      style,
      parts,
      textureUrl: buildPollinationsImageUrl(
        `seamless 3d texture for ${description}`,
        imageModel,
        apiKey,
      ),
    };
    nextAssets.models = [
      ...nextAssets.models.filter((m) => m.id !== id),
      modelAsset,
    ];
    summary = `Generated 3D model "${name}" (${parts.length} meshes)`;
  } else if (toolName === "generate_sound_effect") {
    const id = String(rawArgs.id || `sfx_${Date.now().toString(36)}`);
    const name = String(rawArgs.name || id);
    const soundAsset: GeneratedSoundAsset = {
      id,
      name,
      description: String(rawArgs.description || name),
      waveform: (rawArgs.waveform || "sawtooth") as GeneratedSoundAsset["waveform"],
      startFreq: Number(rawArgs.startFreq) || 660,
      endFreq: Number(rawArgs.endFreq) || 180,
      duration: Math.max(0.05, Math.min(2.0, Number(rawArgs.duration) || 0.18)),
      volume: Number(rawArgs.volume) || 0.2,
    };
    nextAssets.sounds = [
      ...nextAssets.sounds.filter((s) => s.id !== id),
      soundAsset,
    ];
    summary = `Synthesized SFX "${name}" (${soundAsset.waveform}, ${soundAsset.startFreq}Hz → ${soundAsset.endFreq}Hz)`;
  } else if (toolName === "generate_music_track") {
    const id = String(rawArgs.id || `bgm_${Date.now().toString(36)}`);
    const name = String(rawArgs.name || id);
    const notes =
      Array.isArray(rawArgs.notes) && rawArgs.notes.length > 0
        ? rawArgs.notes.map((n: any) => Number(n) || 440)
        : [261.63, 329.63, 392.0, 523.25];
    const bpm = Number(rawArgs.bpm) || 120;
    const musicAsset: GeneratedMusicAsset = {
      id,
      name,
      mood: String(rawArgs.mood || "arcade"),
      bpm,
      waveform: (rawArgs.waveform || "triangle") as GeneratedMusicAsset["waveform"],
      notes,
      noteDuration: Number((60 / bpm / 2).toFixed(2)),
    };
    nextAssets.music = [
      ...nextAssets.music.filter((m) => m.id !== id),
      musicAsset,
    ];
    summary = `Composed BGM track "${name}" (${bpm} BPM, ${notes.length} notes)`;
  } else if (toolName === "generate_voice_line") {
    const id = String(rawArgs.id || `voice_${Date.now().toString(36)}`);
    const name = String(rawArgs.name || id);
    const text = String(rawArgs.text || "Ready Player One!");
    const voice = (rawArgs.voice || "alloy") as GeneratedVoiceAsset["voice"];
    const language = String(rawArgs.language || "en");
    const audioUrl = buildPollinationsVoiceUrl(text, voice, apiKey);
    const voiceAsset: GeneratedVoiceAsset = {
      id,
      name,
      text,
      voice,
      language,
      audioUrl,
    };
    nextAssets.voices = [
      ...nextAssets.voices.filter((v) => v.id !== id),
      voiceAsset,
    ];
    summary = `Generated TTS Voice "${name}" (${voice}): "${text.slice(0, 40)}"`;
  } else if (toolName === "define_achievements") {
    if (Array.isArray(rawArgs.achievements) && rawArgs.achievements.length > 0) {
      nextAchievements = rawArgs.achievements.map((a: any, i: number) => ({
        id: String(a.id || `ach_${i + 1}`),
        title: String(a.title || `Achievement ${i + 1}`),
        description: String(a.description || ""),
        points: Number(a.points) || 20,
      }));
      summary = `Defined ${nextAchievements.length} game achievements`;
    }
  }

  return {
    assets: nextAssets,
    achievements: nextAchievements,
    coverUrl: newCoverUrl,
    record: {
      id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      toolName,
      args: rawArgs,
      summary: summary || `Executed ${toolName}`,
    },
  };
}

/**
 * Parses `<tool_call>{"name": "...", "args": {...}}</tool_call>` blocks embedded in text completions
 * as well as OpenAI `choices[0].message.tool_calls`.
 */
export function parseEmbeddedToolCalls(
  text: string,
): Array<{ name: string; args: Record<string, any> }> {
  const results: Array<{ name: string; args: Record<string, any> }> = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.name === "string") {
        results.push({
          name: parsed.name,
          args: parsed.args || parsed.arguments || {},
        });
      }
    } catch {
      // Ignore malformed tool_call JSON
    }
  }
  return results;
}

/**
 * Sends a Director request to Pollinations (`gen.pollinations.ai/v1/chat/completions`)
 * with OpenAI `tools` definitions enabled and parses both native `tool_calls` and `<tool_call>` blocks.
 */
export async function invokePollinationsDirectorWithTools({
  model,
  messages,
  apiKey,
  signal,
}: {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  apiKey?: string | null;
  signal?: AbortSignal;
}): Promise<{
  content: string;
  toolCalls: Array<{ name: string; args: Record<string, any> }>;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(POLLINATIONS_TEXT_API_URL, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages,
      tools: DIRECTOR_OPENAI_TOOLS,
      tool_choice: "auto",
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pollinations HTTP ${response.status}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const content: string =
    message?.content ||
    data?.choices?.[0]?.text ||
    (typeof data === "string" ? data : "");

  const toolCalls: Array<{ name: string; args: Record<string, any> }> = [];

  if (Array.isArray(message?.tool_calls)) {
    for (const tc of message.tool_calls) {
      const fnName = tc?.function?.name;
      if (fnName) {
        let parsedArgs: Record<string, any> = {};
        try {
          parsedArgs =
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {};
        } catch {}
        toolCalls.push({ name: fnName, args: parsedArgs });
      }
    }
  }

  const embedded = parseEmbeddedToolCalls(content);
  for (const emb of embedded) {
    toolCalls.push(emb);
  }

  return { content, toolCalls };
}
