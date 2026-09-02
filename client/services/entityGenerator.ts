import { supabase } from "@/lib/db";

export interface EntityGenerationOptions {
  type: "character" | "universe" | "race";
  prompt: string;
  model: {
    provider: string;
    model_id: string;
    name?: string;
    isLocal?: boolean;
  };
  include_stats?: boolean;
  universe?: {
    id?: string;
    name: string;
    display_name?: string | null;
    short_description?: string | null;
    appearance?: string | null;
    personality?: string | null;
    backstory?: string | null;
    hidden_description?: string | null;
    is_universe?: boolean;
  } | null;
  race?: {
    id?: string;
    name: string;
    display_name?: string | null;
    short_description?: string | null;
    appearance?: string | null;
    personality?: string | null;
    backstory?: string | null;
    hidden_description?: string | null;
    is_race?: boolean;
  } | null;
  onProgress?: (step: GenerationStep, detail?: string) => void;
  signal?: AbortSignal;
}

export type GenerationStep =
  "idle" | "summarizing" | "researching" | "generating" | "completed" | "error";

export interface GeneratedEntityResult {
  name: string;
  display_name: string;
  short_description: string;
  appearance: string;
  personality: string;
  backstory: string;
  hidden_description: string;
  universe_id?: string;
  race_id?: string;
  is_universe: boolean;
  is_race?: boolean;
  stats_enabled?: boolean;
  stats?: {
    str?: number | null;
    dex?: number | null;
    con?: number | null;
    int?: number | null;
    wis?: number | null;
    cha?: number | null;
  };
}

/**
 * Resilient JSON Extraction Algorithm
 * Extracts valid JSON payloads from markdown codeblocks, conversational preambles, and outermost braces.
 */
export function extractJsonPayload(raw: string): unknown {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty response received from generator");
  }
  const trimmed = raw.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Markdown ```json ... ``` codeblock extraction
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {}
  }

  // 3. Outermost brace matching { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
    } catch {}
  }

  throw new Error("Failed to parse structured JSON from generator output");
}

/**
 * Universe Brief Builder for Character or Race Generation
 */
export function buildUniverseBriefPrompt(
  universe: NonNullable<EntityGenerationOptions["universe"]>,
): string {
  const parts: string[] = [];
  parts.push(`Universe Name: ${universe.name}`);
  if (universe.display_name) parts.push(`Title: ${universe.display_name}`);
  if (universe.short_description)
    parts.push(
      `World Lore & Setting:\n${universe.short_description.slice(0, 4000)}`,
    );
  if (universe.appearance)
    parts.push(
      `Geography & Environment:\n${universe.appearance.slice(0, 2000)}`,
    );
  if (universe.personality)
    parts.push(`Tone & Atmosphere:\n${universe.personality.slice(0, 2000)}`);
  if (universe.backstory)
    parts.push(`History & Factions:\n${universe.backstory.slice(0, 2000)}`);
  if (universe.hidden_description)
    parts.push(`Private Notes:\n${universe.hidden_description.slice(0, 2000)}`);
  return parts.join("\n\n");
}

/**
 * Race Brief Builder for Character Generation
 */
export function buildRaceBriefPrompt(
  race: NonNullable<EntityGenerationOptions["race"]>,
): string {
  const parts: string[] = [];
  parts.push(`Race/Species Name: ${race.name}`);
  if (race.display_name)
    parts.push(`Classification / Moniker: ${race.display_name}`);
  if (race.short_description)
    parts.push(
      `Race Overview & Lore:\n${race.short_description.slice(0, 3000)}`,
    );
  if (race.appearance)
    parts.push(
      `Physiology & Distinctive Physical Traits:\n${race.appearance.slice(0, 2000)}`,
    );
  if (race.personality)
    parts.push(
      `Cultural Traits & Behaviors:\n${race.personality.slice(0, 2000)}`,
    );
  if (race.backstory)
    parts.push(`Origins & History:\n${race.backstory.slice(0, 2000)}`);
  if (race.hidden_description)
    parts.push(`Private Notes:\n${race.hidden_description.slice(0, 2000)}`);
  return parts.join("\n\n");
}

/**
 * Character Generator Prompt Builder with Anti-Verbatim Rule
 */
export function buildCharacterGenerationPrompt(params: {
  prompt: string;
  universeSummary?: string;
  raceSummary?: string;
  researchFindings?: string;
  include_stats?: boolean;
}): { system: string; user: string } {
  const schema: any = {
    name: "Full character name",
    display_name: "Title or moniker",
    short_description: "1-2 sentence hook summarizing who they are",
    appearance: "Physical traits, clothing, distinctive markings, gear",
    personality: "Psychological profile, virtues, flaws, speech style",
    backstory: "Personal history, formative events, affiliations",
    hidden_description: "Private GM/creator notes and secrets",
  };

  if (params.include_stats) {
    schema.stats = {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    };
  }

  const rules = [
    "CRITICAL RULES:",
    "1. ANCHOR DEEPLY in the culture, factions, and rules of the provided universe and race context.",
    "2. STRICTLY AVOID VERBATIM REPETITION: DO NOT copy-paste or duplicate the universe or race descriptions verbatim into the character fields.",
    "3. Fill out all text fields with vivid, creative details.",
  ];

  if (params.include_stats) {
    rules.push(
      "4. Generate integer numbers between -100 and 100 for each stat (str, dex, con, int, wis, cha) that fit the character's archetype, strengths, and weaknesses.",
    );
  }

  const system = [
    "You are an expert character creator and narrative designer for fiction and roleplay.",
    "OUTPUT FORMAT: You MUST respond ONLY with a valid JSON object matching the schema below.",
    JSON.stringify(schema, null, 2),
    rules.join("\n"),
  ].join("\n\n");

  const userParts: string[] = [`Concept / Prompt: "${params.prompt}"`];
  if (params.raceSummary) {
    userParts.push(`Character Race Context & Biology:\n${params.raceSummary}`);
  }
  if (params.universeSummary) {
    userParts.push(
      `Universe Context & Design Brief:\n${params.universeSummary}`,
    );
  }
  if (params.researchFindings) {
    userParts.push(
      `Archetype & Lore Research Findings:\n${params.researchFindings}`,
    );
  }
  userParts.push("Generate the structured character JSON object now.");

  return { system, user: userParts.join("\n\n") };
}

/**
 * Race Generator Prompt Builder
 */
export function buildRaceGenerationPrompt(params: {
  prompt: string;
  universeSummary?: string;
  researchFindings?: string;
}): { system: string; user: string } {
  const system = [
    "You are an expert fantasy and sci-fi worldbuilder and species designer.",
    "OUTPUT FORMAT: You MUST respond ONLY with a valid JSON object matching the schema below.",
    JSON.stringify(
      {
        name: "Race or species name",
        display_name: "Subspecies, moniker, or classification",
        short_description:
          "Comprehensive overview of this race's culture, physiology, and role in the world",
        appearance:
          "Physiology, anatomical traits, size, skin/fur/scale features, distinctive visual traits",
        personality:
          "Cultural norms, societal values, common behavioral tendencies, and worldview",
        backstory:
          "Origins, evolutionary/mythological history, ancestral homeworld, and major cultural milestones",
        hidden_description:
          "Private GM notes, hidden biological quirks, and racial secrets",
      },
      null,
      2,
    ),
    "CRITICAL RULES:",
    "1. Establish distinct biology, cultural values, and history for this race or species.",
    "2. If universe context is provided, anchor the race believably into the universe's world rules.",
    "3. Fill out all 7 fields with evocative, high-quality lore.",
  ].join("\n\n");

  const userParts: string[] = [`Race / Species Concept: "${params.prompt}"`];
  if (params.universeSummary) {
    userParts.push(
      `Universe Context & Design Brief:\n${params.universeSummary}`,
    );
  }
  if (params.researchFindings) {
    userParts.push(
      `Species & Lore Research Findings:\n${params.researchFindings}`,
    );
  }
  userParts.push("Generate the structured race JSON object now.");

  return { system, user: userParts.join("\n\n") };
}

/**
 * Universe Generator Prompt Builder
 */
export function buildUniverseGenerationPrompt(params: {
  prompt: string;
  researchFindings?: string;
}): { system: string; user: string } {
  const system = [
    "You are a master worldbuilding architect and setting designer.",
    "OUTPUT FORMAT: You MUST respond ONLY with a valid JSON object matching the schema below.",
    JSON.stringify(
      {
        name: "Unique Universe Name",
        display_name: "Short subtitle or setting classification",
        short_description:
          "Comprehensive multi-paragraph world overview covering history, geography, magic/technology, and factions",
        hidden_description:
          "Private GM notes, cosmological secrets, and plot hooks",
      },
      null,
      2,
    ),
    "CRITICAL RULES:",
    "1. Establish coherent world rules, distinct cultures, and dynamic factions.",
    "2. Fill out all 4 fields with evocative, high-quality worldbuilding.",
  ].join("\n\n");

  const userParts: string[] = [`Universe Concept: "${params.prompt}"`];
  if (params.researchFindings) {
    userParts.push(
      `Worldbuilding Research Findings:\n${params.researchFindings}`,
    );
  }
  userParts.push("Generate the structured universe JSON object now.");

  return { system, user: userParts.join("\n\n") };
}

async function callModel(
  model: EntityGenerationOptions["model"],
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const isLocalOllama = model.isLocal && model.provider === "local-ollama";
  const isLocalLmStudio = model.isLocal && model.provider === "local-lmstudio";
  const isLocalKobold = model.isLocal && model.provider === "local-kobold";

  let url = "/api/ai/proxy";
  let headers: Record<string, string> = { "Content-Type": "application/json" };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {}

  let bodyData: any = {
    model: model.model_id,
    provider: model.provider,
    messages,
  };

  if (isLocalOllama) {
    url = "http://127.0.0.1:11434/api/chat";
    bodyData = {
      model: model.model_id,
      messages,
      stream: false,
    };
  } else if (isLocalLmStudio) {
    url = "http://127.0.0.1:1234/v1/chat/completions";
    bodyData = {
      model: model.model_id,
      messages,
      stream: false,
    };
  } else if (isLocalKobold) {
    url = "http://127.0.0.1:5001/v1/chat/completions";
    bodyData = {
      model: model.model_id,
      messages,
      stream: false,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyData),
      signal,
    });
  } catch (err: any) {
    if (url.includes("127.0.0.1")) {
      const fallbackUrl = url.replace("127.0.0.1", "localhost");
      res = await fetch(fallbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
        signal,
      });
    } else if (url.includes("localhost")) {
      const fallbackUrl = url.replace("localhost", "127.0.0.1");
      res = await fetch(fallbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
        signal,
      });
    } else {
      throw err;
    }
  }

  if (!res.ok) {
    const err: any = new Error(`Generation failed with status ${res.status}`);
    err.status = res.status;
    err.statusText = res.statusText;
    throw err;
  }

  const json = await res.json();
  return (
    json?.choices?.[0]?.message?.content ||
    json?.message?.content ||
    json?.result ||
    ""
  );
}

/**
 * Execute Multi-Stage Entity Generation Pipeline
 */
export async function executeEntityGeneration(
  options: EntityGenerationOptions,
): Promise<GeneratedEntityResult> {
  const { type, prompt, model, universe, race, onProgress, signal } = options;

  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt is required for entity generation");
  }

  if (signal?.aborted) {
    throw new DOMException("Generation was cancelled", "AbortError");
  }

  let universeSummary = "";
  let raceSummary = "";

  // Step 1a: Universe Summarization (if Character or Race with Universe)
  if ((type === "character" || type === "race") && universe) {
    onProgress?.(
      "summarizing",
      "Analyzing universe lore and formulating brief...",
    );

    if (signal?.aborted) {
      throw new DOMException("Generation was cancelled", "AbortError");
    }

    const briefInput = buildUniverseBriefPrompt(universe);
    try {
      universeSummary = await callModel(
        model,
        [
          {
            role: "system",
            content:
              "Produce a concise design brief summarizing the world rules, tone, and factions.",
          },
          { role: "user", content: briefInput },
        ],
        signal,
      );
    } catch (err: any) {
      if (signal?.aborted) throw err;
      throw new Error(
        `Universe summarization failed: ${err.statusText || err.message}`,
      );
    }
  }

  // Step 1b: Race Context (if Character with Race)
  if (type === "character" && race) {
    raceSummary = buildRaceBriefPrompt(race);
  }

  // Step 2: Agent Search Research
  onProgress?.("researching", "Researching lore archetypes and concepts...");
  if (signal?.aborted) {
    throw new DOMException("Generation was cancelled", "AbortError");
  }

  let searchQuery = `${prompt} worldbuilding concepts and tropes`;
  if (type === "character") {
    if (race && universe) {
      searchQuery = `${prompt} ${race.name} archetype in context of ${universe.name}`;
    } else if (universe) {
      searchQuery = `${prompt} archetypes in context of ${universe.name}: ${universeSummary.slice(0, 200)}`;
    } else if (race) {
      searchQuery = `${prompt} character concepts for ${race.name} species`;
    }
  } else if (type === "race") {
    searchQuery = universe
      ? `${prompt} species and race concepts in context of ${universe.name}`
      : `${prompt} species and race worldbuilding concepts and traits`;
  }

  let researchFindings = "";
  try {
    const searchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        searchHeaders["Authorization"] = `Bearer ${token}`;
      }
    } catch {}

    const searchRes = await fetch("/api/ai/agent-search", {
      method: "POST",
      headers: searchHeaders,
      body: JSON.stringify({
        query: searchQuery.slice(0, 950),
        responseFormat: "summary",
        researchOnly: true,
        stream: false,
        researchModel: model?.model_id,
        researchProvider: model?.provider,
        summarizerModel: model?.model_id,
        summarizerProvider: model?.provider,
      }),
      signal,
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      researchFindings =
        searchData?.result || searchData?.researchContext || "";
    } else {
      researchFindings = "Standard creative tropes applicable to this genre.";
    }
  } catch (err: any) {
    if (signal?.aborted) {
      throw new DOMException("Generation was cancelled", "AbortError");
    }
    // Graceful fallback on network search failure
    researchFindings = "Standard creative tropes applicable to this genre.";
  }

  // Step 3: Generator Agent
  onProgress?.(
    "generating",
    type === "character"
      ? "Generating character details..."
      : type === "race"
        ? "Generating race lore and traits..."
        : "Generating universe lore...",
  );
  if (signal?.aborted) {
    throw new DOMException("Generation was cancelled", "AbortError");
  }

  let promptBundle: { system: string; user: string };
  if (type === "character") {
    promptBundle = buildCharacterGenerationPrompt({
      prompt,
      universeSummary,
      raceSummary,
      researchFindings,
      include_stats: options.include_stats,
    });
  } else if (type === "race") {
    promptBundle = buildRaceGenerationPrompt({
      prompt,
      universeSummary,
      researchFindings,
    });
  } else {
    promptBundle = buildUniverseGenerationPrompt({
      prompt,
      researchFindings,
    });
  }

  const rawContent = await callModel(
    model,
    [
      { role: "system", content: promptBundle.system },
      { role: "user", content: promptBundle.user },
    ],
    signal,
  );

  const parsedRaw = extractJsonPayload(rawContent);
  if (!parsedRaw || typeof parsedRaw !== "object") {
    throw new Error("Invalid response format received from generator");
  }
  const parsed = parsedRaw as Record<string, any>;

  onProgress?.("completed", "Generation complete!");

  if (type === "character") {
    let generatedStats: any = undefined;
    let statsEnabled = Boolean(options.include_stats && parsed.stats);
    if (parsed.stats && typeof parsed.stats === "object") {
      const clampStat = (val: any) => {
        if (val === null || val === undefined || val === "") return undefined;
        const num = typeof val === "number" ? val : parseInt(String(val), 10);
        if (isNaN(num)) return undefined;
        return Math.max(-100, Math.min(100, num));
      };
      const parsedStr = clampStat(parsed.stats.str ?? parsed.stats.STR);
      const parsedDex = clampStat(parsed.stats.dex ?? parsed.stats.DEX);
      const parsedCon = clampStat(parsed.stats.con ?? parsed.stats.CON);
      const parsedInt = clampStat(parsed.stats.int ?? parsed.stats.INT);
      const parsedWis = clampStat(parsed.stats.wis ?? parsed.stats.WIS);
      const parsedCha = clampStat(parsed.stats.cha ?? parsed.stats.CHA);

      if (
        parsedStr !== undefined ||
        parsedDex !== undefined ||
        parsedCon !== undefined ||
        parsedInt !== undefined ||
        parsedWis !== undefined ||
        parsedCha !== undefined
      ) {
        generatedStats = {
          str: parsedStr,
          dex: parsedDex,
          con: parsedCon,
          int: parsedInt,
          wis: parsedWis,
          cha: parsedCha,
        };
        statsEnabled = true;
      }
    }

    return {
      name: parsed.name || "Unnamed Character",
      display_name: parsed.display_name || "",
      short_description: parsed.short_description || "",
      appearance: parsed.appearance || "",
      personality: parsed.personality || "",
      backstory: parsed.backstory || "",
      hidden_description: parsed.hidden_description || "",
      universe_id: universe?.id,
      race_id: race?.id,
      is_universe: false,
      is_race: false,
      stats_enabled: statsEnabled,
      stats: generatedStats,
    };
  } else if (type === "race") {
    return {
      name: parsed.name || "Unnamed Race",
      display_name: parsed.display_name || "",
      short_description: parsed.short_description || "",
      appearance: parsed.appearance || "",
      personality: parsed.personality || "",
      backstory: parsed.backstory || "",
      hidden_description: parsed.hidden_description || "",
      universe_id: universe?.id,
      is_universe: false,
      is_race: true,
    };
  } else {
    return {
      name: parsed.name || "Unnamed Universe",
      display_name: parsed.display_name || "",
      short_description: parsed.short_description || "",
      appearance: "",
      personality: "",
      backstory: "",
      hidden_description: parsed.hidden_description || "",
      universe_id: undefined,
      is_universe: true,
      is_race: false,
    };
  }
}

export const generateEntity = executeEntityGeneration;
