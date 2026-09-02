/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeEntityGeneration,
  generateEntity,
  extractJsonPayload,
  buildUniverseBriefPrompt,
  buildCharacterGenerationPrompt,
  buildUniverseGenerationPrompt,
  type EntityGenerationOptions,
  type GenerationStep,
  type GeneratedEntityResult,
} from "./entityGenerator";

describe("entityGenerator Service — 4-Tier Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Category-Partition)
  // =========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1-05: executes 2-stage pipeline for standalone character generation", async () => {
      const progressCalls: Array<{ step: GenerationStep; detail?: string }> =
        [];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result:
                  "Netrunner archetypes: deckers, street shamans, ICE breakers.",
              }),
          });
        }
        if (url === "/api/ai/proxy") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Cipher Nyx",
                        display_name: "Cipher",
                        short_description:
                          "A freelance cyber-infiltrator who hacks neural implants.",
                        appearance:
                          "Wears an optic visor with glowing amber telemetry data and a synth-leather duster.",
                        personality:
                          "Calculated, paranoid, fiercely protective of personal privacy.",
                        backstory:
                          "Ex-Megacorp systems architect who vanished into the neon slums.",
                        hidden_description:
                          "Has a dormant AI fragment embedded in her neural link.",
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "A rogue cyber-infiltrator in the neon slums",
        model: {
          provider: "cloudflare",
          model_id: "@cf/nvidia/nemotron-3-120b-a12b",
        },
        universe: null,
        onProgress: (step, detail) => progressCalls.push({ step, detail }),
      });

      expect(result.name).toBe("Cipher Nyx");
      expect(result.display_name).toBe("Cipher");
      expect(result.is_universe).toBe(false);
      expect(result.appearance).toContain("optic visor");
      expect(result.personality).toContain("Calculated");
      expect(result.backstory).toContain("Megacorp");
      expect(result.hidden_description).toContain("dormant AI");

      // Verify progress sequence (2 stages: researching -> generating -> completed)
      expect(progressCalls.map((p) => p.step)).toEqual([
        "researching",
        "generating",
        "completed",
      ]);
    });

    it("executes character generation with optional stats enabled", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result: "Paladin tropes and martial prowess.",
              }),
          });
        }
        if (url === "/api/ai/proxy") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Sir Gareth",
                        display_name: "The Iron Knight",
                        short_description: "A holy knight clad in plate armor.",
                        appearance: "Silver plate with blue cloth.",
                        personality: "Noble, unyielding, kind to the weak.",
                        backstory: "Served in the Sun Order for twenty years.",
                        hidden_description: "Carries a cursed talisman.",
                        stats: {
                          str: 18,
                          dex: 12,
                          con: 16,
                          int: 10,
                          wis: 14,
                          cha: 15,
                        },
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "A holy knight of the Sun Order",
        include_stats: true,
        model: {
          provider: "cloudflare",
          model_id: "@cf/nvidia/nemotron-3-120b-a12b",
        },
        universe: null,
      });

      expect(result.name).toBe("Sir Gareth");
      expect(result.stats_enabled).toBe(true);
      expect(result.stats).toEqual({
        str: 18,
        dex: 12,
        con: 16,
        int: 10,
        wis: 14,
        cha: 15,
      });
    });

    it("T1-06: executes 3-stage pipeline for universe-contextualized character with anti-verbatim rule", async () => {
      const progressCalls: Array<{ step: GenerationStep; detail?: string }> =
        [];
      const fetchCalls: Array<{ url: string; body: any }> = [];

      const mockUniverse = {
        id: "univ-neo-kyoto-99",
        name: "Neo-Kyoto 2099",
        display_name: "Cyberpunk Metropolis",
        short_description:
          "A sprawling neon megacity governed by megacorps where rain never stops and synthetics have no civil rights.",
        appearance:
          "Bioluminescent skyscrapers, rainy asphalt alleyways, flying transit lines.",
        personality: "High-tech noir, corporate oppression, cynical rebellion.",
        backstory:
          "After the 2070 Corporate War, Kyoto was rebuilt by Arasaka-style zaibatsu cartels.",
        hidden_description:
          "The underworld runs an underground railway for sentient synthetics.",
        is_universe: true,
      };

      global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
        const parsedBody = JSON.parse(init.body);
        fetchCalls.push({ url, body: parsedBody });

        if (
          url === "/api/ai/proxy" &&
          parsedBody.messages[0].content.includes("brief")
        ) {
          // Stage 1: Universe summary
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content:
                        "Brief: Oppressive zaibatsu megacity, synthetic rights tension, cyberware arms race.",
                    },
                  },
                ],
              }),
          });
        }
        if (url === "/api/ai/agent-search") {
          // Stage 2: Research
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result:
                  "Street medic and cyberdoc archetypes in cyberpunk noir.",
              }),
          });
        }
        if (
          url === "/api/ai/proxy" &&
          parsedBody.messages[0].content.includes("CRITICAL RULES")
        ) {
          // Stage 3: Character Generation
          // Assert Anti-Verbatim instructions exist in prompt
          expect(parsedBody.messages[0].content).toContain(
            "STRICTLY AVOID VERBATIM REPETITION",
          );
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Dr. Kenji Sato",
                        display_name: "Doc Sato",
                        short_description:
                          "An underground cyberdoc patching up rogue synthetics.",
                        appearance:
                          "Wears blood-stained surgical scrubs over chrome cybernetic hands.",
                        personality:
                          "Weary pragmatist with a strict medical oath.",
                        backstory:
                          "Fired from a zaibatsu trauma clinic for refusing to let a synthetic bleed out.",
                        hidden_description:
                          "Maintains an unregistered surgical theater in an abandoned subway station.",
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "An underground cyberdoc who helps fugitives",
        model: { provider: "horde", model_id: "Smart" },
        universe: mockUniverse,
        onProgress: (step, detail) => progressCalls.push({ step, detail }),
      });

      expect(result.name).toBe("Dr. Kenji Sato");
      expect(result.universe_id).toBe("univ-neo-kyoto-99");
      expect(result.is_universe).toBe(false);

      // Verify 3-stage progress
      expect(progressCalls.map((p) => p.step)).toEqual([
        "summarizing",
        "researching",
        "generating",
        "completed",
      ]);
      expect(fetchCalls.length).toBe(3);
    });

    it("T1-07: executes 2-stage pipeline for standalone universe generation", async () => {
      const progressCalls: Array<{ step: GenerationStep; detail?: string }> =
        [];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result:
                  "Solarpunk floating island worldbuilding tropes, crystal energy grids.",
              }),
          });
        }
        if (url === "/api/ai/proxy") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Aetheria: The Skyward Realm",
                        display_name: "Floating Archipelago",
                        short_description:
                          "A world of drifting celestial landmasses interconnected by solar-gliders and powered by harmonic aether crystals.",
                        hidden_description:
                          "The central core crystal is suffering from harmonic decay.",
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "universe",
        prompt:
          "Floating sky islands with solarpunk aesthetic and crystal airships",
        model: {
          provider: "cloudflare",
          model_id: "@cf/nvidia/nemotron-3-120b-a12b",
        },
        onProgress: (step, detail) => progressCalls.push({ step, detail }),
      });

      expect(result.is_universe).toBe(true);
      expect(result.name).toBe("Aetheria: The Skyward Realm");
      expect(result.display_name).toBe("Floating Archipelago");
      expect(result.short_description).toContain("celestial landmasses");
      expect(result.hidden_description).toContain("harmonic decay");
      expect(progressCalls.map((p) => p.step)).toEqual([
        "researching",
        "generating",
        "completed",
      ]);
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (BVA)
  // =========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2-01: rejects empty or whitespace-only prompt", async () => {
      await expect(
        executeEntityGeneration({
          type: "character",
          prompt: "   ",
          model: { provider: "cloudflare", model_id: "fast" },
        }),
      ).rejects.toThrow("Prompt is required");
    });

    it("T2-02: handles extremely long prompt without crashing", async () => {
      const longPrompt = "A fantasy knight ".repeat(300); // 5100 characters

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Knight tropes" }),
          });
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      name: "Sir Galahad",
                      display_name: "The White Knight",
                      short_description: "A knight of valor.",
                    }),
                  },
                },
              ],
            }),
        });
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: longPrompt,
        model: { provider: "cloudflare", model_id: "smart" },
      });

      expect(result.name).toBe("Sir Galahad");
    });

    it("T2-03: handles unicode, emoji, quotes, and multilingual text", async () => {
      const complexPrompt =
        'An enigmatic 🧙‍♂️ sorcerer known as "O\'Connor" in 桜の国 (Sakura Realm)';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Sorcerer tropes" }),
          });
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      name: "Kaelen O'Connor 🧙‍♂️",
                      display_name: "桜の賢者 (Sakura Sage)",
                      short_description:
                        "A wandering sorcerer weaving cherry-blossom magic.",
                      appearance:
                        'Kimono with embroidered dragons & glowing runes: "永遠の光"',
                      personality: "Stoic, cryptic, speaks in haiku.",
                      backstory:
                        "Banished from the Emperor's court for forbidden arcane research.",
                      hidden_description:
                        "Possesses the final shard of the Cherry Blossom Relic.",
                    }),
                  },
                },
              ],
            }),
        });
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: complexPrompt,
        model: { provider: "cloudflare", model_id: "smart" },
      });

      expect(result.name).toBe("Kaelen O'Connor 🧙‍♂️");
      expect(result.display_name).toContain("桜の賢者");
      expect(result.appearance).toContain('"永遠の光"');
    });

    it("T2-04: handles prompt injection / HTML tags safely as plain text", async () => {
      const injectionPrompt =
        '<script>alert("XSS")</script> Netrunner --drop table users;';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Hacker tropes" }),
          });
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      name: "Null Pointer",
                      display_name: "Null",
                      short_description: "A glitch hacker.",
                    }),
                  },
                },
              ],
            }),
        });
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: injectionPrompt,
        model: { provider: "cloudflare", model_id: "smart" },
      });

      expect(result.name).toBe("Null Pointer");
    });

    it("T2-05: aborts execution cleanly when AbortSignal triggers", async () => {
      const abortController = new AbortController();

      global.fetch = vi.fn().mockImplementation((_url: string, init: any) => {
        if (init?.signal?.aborted) {
          return Promise.reject(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        }
        // Simulate in-flight abort
        abortController.abort();
        return Promise.reject(
          new DOMException("The operation was aborted.", "AbortError"),
        );
      });

      await expect(
        executeEntityGeneration({
          type: "character",
          prompt: "Interrupted generation test",
          model: { provider: "cloudflare", model_id: "smart" },
          signal: abortController.signal,
        }),
      ).rejects.toThrow();
    });

    it("T2-06: extracts JSON correctly from markdown ```json ``` codeblock", () => {
      const rawMarkdown = `
Here is the requested character:
\`\`\`json
{
  "name": "Aria Stark",
  "display_name": "Faceless Girl",
  "short_description": "A lethal assassin from the North.",
  "appearance": "Small stature, dark hair, Needle at her side.",
  "personality": "Determined, vengeful, quiet.",
  "backstory": "Trained with the Faceless Men in Braavos.",
  "hidden_description": "Has a list of names she recites before sleep."
}
\`\`\`
Hope this helps!`;

      const parsed = extractJsonPayload(rawMarkdown) as any;
      expect(parsed.name).toBe("Aria Stark");
      expect(parsed.display_name).toBe("Faceless Girl");
    });

    it("T2-07: extracts JSON correctly with conversational preamble and postscript without codeblocks", () => {
      const rawText = `
Sure! I designed a great character for you:
{
  "name": "Boba Fett",
  "display_name": "Bounty Hunter",
  "short_description": "The galaxy's most notorious bounty hunter.",
  "appearance": "Mandalorian armor with dented helmet and jetpack.",
  "personality": "Laconic, ruthless, disciplined.",
  "backstory": "Clone of Jango Fett raised on Kamino.",
  "hidden_description": "Survived the Sarlacc pit through sheer willpower."
}
Let me know if you want any modifications!`;

      const parsed = extractJsonPayload(rawText) as any;
      expect(parsed.name).toBe("Boba Fett");
      expect(parsed.appearance).toContain("Mandalorian");
    });

    it("T2-08: throws descriptive error on malformed JSON response from LLM", () => {
      const invalidJson = `Here is your character: { "name": "Broken JSON without close brace...`;
      expect(() => extractJsonPayload(invalidJson)).toThrow(
        "Failed to parse structured JSON from generator output",
      );
    });

    it("T2-09: handles 500 error from proxy gracefully", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Tropes" }),
          });
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      });

      await expect(
        executeEntityGeneration({
          type: "character",
          prompt: "Failing server test",
          model: { provider: "cloudflare", model_id: "smart" },
        }),
      ).rejects.toThrow("Generation failed with status 500");
    });

    it("T2-10: handles missing / null universe fields without throwing errors", () => {
      const partialUniverse = {
        name: "Minimalist Realm",
        short_description: null,
        appearance: null,
        personality: null,
        backstory: null,
        hidden_description: null,
      };

      const prompt = buildUniverseBriefPrompt(partialUniverse as any);
      expect(prompt).toBe("Universe Name: Minimalist Realm");
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Pairwise Combinatorial)
  // =========================================================================
  describe("Tier 3: Cross-Feature Interactions", () => {
    it("T3-01: routes local Ollama provider to direct 127.0.0.1 endpoint", async () => {
      let routedUrl = "";

      global.fetch = vi.fn().mockImplementation((url: string) => {
        routedUrl = url;
        if (url === "/api/ai/agent-search")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Local tropes" }),
          });
        if (url === "http://127.0.0.1:11434/api/chat") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                message: {
                  content: JSON.stringify({
                    name: "Ollama Runner",
                    display_name: "Local Bot",
                    short_description: "Generated purely locally on localhost.",
                  }),
                },
              }),
          });
        }
        return Promise.reject(new Error(`Wrong route: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "Generate with local Ollama",
        model: {
          provider: "local-ollama",
          model_id: "llama3.2:latest",
          isLocal: true,
        },
      });

      expect(result.name).toBe("Ollama Runner");
      expect(routedUrl).toBe("http://127.0.0.1:11434/api/chat");
    });

    it("T3-02: falls back gracefully when Search Agent is offline, continuing generation", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ai/agent-search") {
          // Simulate 503 Service Unavailable for search
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      name: "Resilient Hero",
                      display_name: "Fallback",
                      short_description:
                        "Generated despite search agent failure.",
                    }),
                  },
                },
              ],
            }),
        });
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "Hero in a post-search apocalypse",
        model: { provider: "cloudflare", model_id: "smart" },
      });

      expect(result.name).toBe("Resilient Hero");
      expect(result.short_description).toContain(
        "Generated despite search agent failure",
      );
    });

    it("T3-03: routes Step 1 universe summarization to local Ollama endpoint without calling /api/ai/proxy", async () => {
      const calls: Array<{ url: string; body: any }> = [];

      const mockUniverse = {
        id: "univ-cyber-local",
        name: "Local Cyber City",
        display_name: "Local Cyberpunk",
        short_description: "A local universe running on localhost.",
        appearance: "Neon alleyways and local servers.",
        personality: "Offline, sovereign, high-tech.",
        backstory: "Built on self-hosted infrastructure.",
        hidden_description: "Encrypted hidden chamber.",
        is_universe: true,
      };

      global.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        calls.push({ url, body });

        if (url === "http://127.0.0.1:11434/api/chat") {
          // If it's Step 1 (brief summary)
          if (body.messages?.[0]?.content?.includes("brief")) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  message: {
                    content: "Local universe summary: Sovereign local network.",
                  },
                }),
            });
          }
          // If it's Step 3 (character generation)
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                message: {
                  content: JSON.stringify({
                    name: "Local Nomad",
                    display_name: "Nomad",
                    short_description:
                      "A wanderer generated entirely through local Ollama.",
                    appearance: "Wears insulated cloak and mechanical boots.",
                    personality: "Independent and quiet.",
                    backstory: "Operates outside corporate cloud services.",
                    hidden_description: "Carries a portable node.",
                  }),
                },
              }),
          });
        }

        if (url === "/api/ai/agent-search") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: "Local node archetypes" }),
          });
        }

        return Promise.reject(new Error(`Unexpected call to URL: ${url}`));
      });

      const result = await executeEntityGeneration({
        type: "character",
        prompt: "A nomad disconnected from cloud networks",
        model: {
          provider: "local-ollama",
          model_id: "llama3.2:latest",
          isLocal: true,
        },
        universe: mockUniverse,
      });

      expect(result.name).toBe("Local Nomad");
      expect(result.universe_id).toBe("univ-cyber-local");

      // Verify that no call was made to /api/ai/proxy
      const proxyCalls = calls.filter((c) => c.url === "/api/ai/proxy");
      expect(proxyCalls.length).toBe(0);

      // Verify calls went to local Ollama endpoint (Step 1 and Step 3) and search endpoint (Step 2)
      const localOllamaCalls = calls.filter(
        (c) => c.url === "http://127.0.0.1:11434/api/chat",
      );
      expect(localOllamaCalls.length).toBe(2);
      expect(calls.some((c) => c.url === "/api/ai/agent-search")).toBe(true);
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // =========================================================================
  describe("Tier 4: Real-World Scenarios", () => {
    it("T4-01: Cyberpunk Universe Character Generation Flow", async () => {
      const cyberpunkUniverse = {
        id: "u-cyber-001",
        name: "Neo-Veridia",
        display_name: "Dystopian Megalopolis",
        short_description:
          "A neon-soaked sprawl where biotech corporations rule the sky platforms while the ground levels drown in toxic fog and black-market cyber-enhancements.",
        appearance:
          "Multi-tiered sky towers, holo-billboards, subterranean bio-markets.",
        personality: "Grim, high-tech, transhumanist, hyper-capitalist.",
        backstory: "Created following the Great Bio-Collapse of 2104.",
        hidden_description:
          "The atmospheric scrubbers are failing, a secret guarded by the governing board.",
        is_universe: true,
      };

      global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
        const body = JSON.parse(init.body);
        if (
          url === "/api/ai/proxy" &&
          body.messages[0].content.includes("brief")
        ) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content:
                        "Setting: Bio-capitalist sprawl. Factions: Sky corps vs Underground bio-hackers.",
                    },
                  },
                ],
              }),
          });
        }
        if (url === "/api/ai/agent-search") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result:
                  "Bio-hacker naming tropes: Razor, Wire, Helix, Echo. Archetypes: Black market organ dealer.",
              }),
          });
        }
        if (url === "/api/ai/proxy") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Jax 'Helix' Thorne",
                        display_name: "Helix",
                        short_description:
                          "A rogue bio-engineer synthesizing synthetic blood for fog refugees.",
                        appearance:
                          "Slender build, dermal chrome ports on wrists, augmented green iris lenses.",
                        personality:
                          "Sarcastic, deeply compassionate, caffeine-addicted.",
                        backstory:
                          "Former head of genetics at Veridia Bio-Corp before smuggling artificial immunity strains.",
                        hidden_description:
                          "Injected himself with the only stable cure to the fog contagion.",
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error("Unexpected"));
      });

      const character = await executeEntityGeneration({
        type: "character",
        prompt:
          "A rogue bio-engineer creating black-market cures for the toxic fog",
        model: {
          provider: "cloudflare",
          model_id: "@cf/nvidia/nemotron-3-120b-a12b",
        },
        universe: cyberpunkUniverse,
      });

      expect(character.name).toBe("Jax 'Helix' Thorne");
      expect(character.display_name).toBe("Helix");
      expect(character.universe_id).toBe("u-cyber-001");
      expect(character.appearance).toContain("dermal chrome");
      expect(character.hidden_description).toContain("fog contagion");
    });

    it("T4-02: Forwards selected model & provider to agent-search endpoint", async () => {
      let capturedSearchBody: any = null;

      global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
        if (url === "/api/ai/agent-search") {
          capturedSearchBody = JSON.parse(init.body);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result: "Smart archetypes research findings.",
              }),
          });
        }
        if (url === "/api/ai/proxy") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        name: "Cosmic Sentinel",
                        display_name: "Sentinel",
                        short_description: "An ancient guardian.",
                        appearance: "Star metal armor.",
                        personality: "Vigilant.",
                        backstory: "Forged in a supernova.",
                        hidden_description: "Knows the universe origin.",
                      }),
                    },
                  },
                ],
              }),
          });
        }
        return Promise.reject(new Error("Unexpected"));
      });

      await executeEntityGeneration({
        type: "character",
        prompt: "A cosmic guardian",
        model: { provider: "horde", model_id: "Smart" },
      });

      expect(capturedSearchBody).not.toBeNull();
      expect(capturedSearchBody.researchModel).toBe("Smart");
      expect(capturedSearchBody.researchProvider).toBe("horde");
      expect(capturedSearchBody.summarizerModel).toBe("Smart");
      expect(capturedSearchBody.summarizerProvider).toBe("horde");
    });
  });
});
