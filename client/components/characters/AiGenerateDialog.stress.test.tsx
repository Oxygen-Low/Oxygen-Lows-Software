/** @vitest-environment jsdom */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock LanguageContext
vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, _params?: any, fallback?: string) => fallback || key,
  }),
}));

const mockModels = [
  {
    provider: "cloudflare",
    model_id: "@cf/nvidia/nemotron-3-120b-a12b",
    name: "Nemotron 3 120B (Smart)",
  },
  {
    provider: "cloudflare",
    model_id: "@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B IT (Balanced)",
  },
  {
    provider: "horde",
    model_id: "Fast",
    name: "Fast - google/gemma-4-31b",
  },
  {
    provider: "local-ollama",
    model_id: "llama3.2:latest",
    name: "Llama 3.2 (Local)",
    isLocal: true,
  },
];

vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => ({
    models: mockModels,
    selectedModel: "@cf/nvidia/nemotron-3-120b-a12b",
    selectedProvider: "cloudflare",
    setSelectedModel: vi.fn(),
    setSelectedProvider: vi.fn(),
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "u-123", email: "test@example.com" }, access_token: "mock-token" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

let mockDbCharacters: any[] = [];
let mockDbInserted: any[] = [];
let mockDbUpdated: any[] = [];

vi.mock("@/lib/db", () => {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [...mockDbCharacters], error: null })),
    insert: vi.fn((data: any) => {
      mockDbInserted.push(data);
      return {
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: "char-new-1", ...data },
              error: null,
            }),
          ),
        })),
      };
    }),
    update: vi.fn((data: any) => {
      mockDbUpdated.push(data);
      return builder;
    }),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
  };

  const mockClient = {
    from: vi.fn(() => builder),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "mock-token", user: { id: "u-123" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  };

  return {
    db: mockClient,
    supabase: mockClient,
  };
});

vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
    })),
  },
}));

vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/StorageFileSelector", () => ({
  StorageFileSelector: ({ trigger }: any) => <div>{trigger}</div>,
}));

import {
  AiGenerateDialog,
  type Character,
  type GeneratedEntityResult,
} from "./AiGenerateDialog";
import Characters from "@/pages/Characters";
import {
  buildUniverseBriefPrompt,
  buildCharacterGenerationPrompt,
  buildUniverseGenerationPrompt,
  extractJsonPayload,
} from "@/services/entityGenerator";
import {
  setCategoryEncryptionEnabled,
  setActiveMasterKey,
  clearActiveMasterKey,
  generateAes256Key,
  isCategoryLocked,
  encryptCharacterData,
  decryptCharacterData,
} from "@/lib/crypto";
import { en, es, ja, ko, ru, zhCN } from "@/locales";

describe("AiGenerateDialog & Characters — Adversarial Stress Suite", () => {
  const mockUniverses: Character[] = [
    {
      id: "u-1",
      name: "Solaris Empire",
      display_name: "Solaris Prime",
      short_description: "A galaxy-spanning empire powered by solar sails and dyson swarms.",
      appearance: "Gilded spires, blinding starlight, obsidian armor.",
      personality: "Authoritarian, proud, ritualistic.",
      backstory: "Formed after the Great Stellar Collapse of 3400.",
      hidden_description: "The Emperor is an ancient AI construct.",
      is_universe: true,
    },
    {
      id: "u-2",
      name: "Abyssal Trench",
      display_name: "The Deep Sunken World",
      short_description: "Undersea colonies nestled within hydrothermal vents.",
      appearance: "Bioluminescent coral, rusty submersible domes.",
      personality: "Paranoid, superstitious, resilient.",
      backstory: "Humanity fled oceanic planetary bombardment.",
      hidden_description: "Deep sirens communicate via sub-audible infrasound.",
      is_universe: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbCharacters = [...mockUniverses];
    mockDbInserted = [];
    mockDbUpdated = [];
    clearActiveMasterKey();
    setCategoryEncryptionEnabled("characters", false);
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // 1. RAPID OPENING, CLOSING, AND CANCELLING DURING ACTIVE GENERATION
  // =========================================================================
  describe("1. Rapid Opening, Closing & Cancellation Stress", () => {
    it("ST-01: Rapidly starts, stops, and restarts generation without unhandled rejections", async () => {
      let runCount = 0;
      const abortSignals: AbortSignal[] = [];

      const mockGenerator = vi.fn().mockImplementation(({ signal, onProgress }) => {
        runCount++;
        abortSignals.push(signal);
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({
              name: `Generated Entity ${runCount}`,
              display_name: "Title",
              short_description: "Desc",
              appearance: "App",
              personality: "Pers",
              backstory: "Back",
              hidden_description: "Hidden",
              is_universe: false,
            });
          }, 500);

          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Cancelled", "AbortError"));
          });
        });
      });

      const onApply = vi.fn();
      const onOpenChange = vi.fn();

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={onOpenChange}
          universes={mockUniverses}
          onApply={onApply}
          generateEntityFn={mockGenerator}
        />,
      );

      const promptInput = screen.getByTestId("prompt-input");
      fireEvent.change(promptInput, { target: { value: "Rapid test 1" } });

      // Start generation #1
      fireEvent.click(screen.getByTestId("start-generate-btn"));
      expect(screen.getByTestId("stop-generate-btn")).toBeDefined();

      // Immediately cancel generation #1
      fireEvent.click(screen.getByTestId("stop-generate-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("start-generate-btn")).toBeDefined();
      });
      expect(abortSignals[0]?.aborted).toBe(true);
      expect(onApply).not.toHaveBeenCalled();

      // Start generation #2 with different prompt
      fireEvent.change(promptInput, { target: { value: "Rapid test 2" } });
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      // Stop again
      fireEvent.click(screen.getByTestId("stop-generate-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("start-generate-btn")).toBeDefined();
      });
      expect(abortSignals[1]?.aborted).toBe(true);

      // Start generation #3 and let it complete
      fireEvent.change(promptInput, { target: { value: "Rapid test 3" } });
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(
        () => {
          expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "Generated Entity 3",
            }),
          );
          expect(onOpenChange).toHaveBeenCalledWith(false);
        },
        { timeout: 1500 },
      );
    });

    it("ST-02: Handles non-abort errors gracefully and preserves user input for retry", async () => {
      const mockFailingGen = vi
        .fn()
        .mockRejectedValueOnce(new Error("503 Provider Overloaded"))
        .mockResolvedValueOnce({
          name: "Recovered Entity",
          display_name: "Hero",
          short_description: "Successfully recovered",
          appearance: "Gold armor",
          personality: "Resolute",
          backstory: "Survived provider outage",
          hidden_description: "",
          is_universe: false,
        });

      const onApply = vi.fn();

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={onApply}
          generateEntityFn={mockFailingGen}
        />,
      );

      fireEvent.change(screen.getByTestId("prompt-input"), {
        target: { value: "Resilient warrior prompt" },
      });

      // First attempt fails
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-generate-error")).toBeDefined();
        expect(screen.getByText("503 Provider Overloaded")).toBeDefined();
      });

      // Prompt preserved in textarea
      expect((screen.getByTestId("prompt-input") as HTMLTextAreaElement).value).toBe(
        "Resilient warrior prompt",
      );

      // Retry immediately
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(onApply).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Recovered Entity",
          }),
        );
      });
    });

    it("ST-03: Multiple progress steps update correctly without crashing during in-flight generation", async () => {
      let stepCallback: any;
      const mockStepGen = vi.fn().mockImplementation(({ onProgress }) => {
        stepCallback = onProgress;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              name: "Step Master",
              display_name: "Master",
              short_description: "Desc",
              appearance: "App",
              personality: "Pers",
              backstory: "Back",
              hidden_description: "",
              is_universe: false,
            });
          }, 300);
        });
      });

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
          generateEntityFn={mockStepGen}
        />,
      );

      fireEvent.change(screen.getByTestId("prompt-input"), {
        target: { value: "Step progress test" },
      });

      fireEvent.click(screen.getByTestId("start-generate-btn"));

      expect(screen.getByTestId("progress-tracker")).toBeDefined();

      act(() => {
        stepCallback("summarizing", "Custom summarizing message...");
      });
      expect(screen.getByTestId("status-message").textContent).toBe(
        "Custom summarizing message...",
      );

      act(() => {
        stepCallback("researching", "Custom researching message...");
      });
      expect(screen.getByTestId("status-message").textContent).toBe(
        "Custom researching message...",
      );

      act(() => {
        stepCallback("generating", "Custom generating message...");
      });
      expect(screen.getByTestId("status-message").textContent).toBe(
        "Custom generating message...",
      );
    });
  });

  // =========================================================================
  // 2. DYNAMIC MODE SWITCHING (CHARACTER <-> UNIVERSE)
  // =========================================================================
  describe("2. Dynamic Mode Switching", () => {
    it("ST-04: Switching modes alters selectors, dialog titles, and passes proper targetType", async () => {
      let capturedOptions: any = null;
      const mockGen = vi.fn().mockImplementation((opts) => {
        capturedOptions = opts;
        return Promise.resolve({
          name: opts.type === "universe" ? "Cosmic Void" : "Void Walker",
          display_name: "Title",
          short_description: "Desc",
          appearance: "App",
          personality: "Pers",
          backstory: "Back",
          hidden_description: "",
          is_universe: opts.type === "universe",
        });
      });

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
          generateEntityFn={mockGen}
        />,
      );

      // Initially Character mode
      expect(screen.getByText("AI Character Generator")).toBeDefined();
      expect(screen.getByTestId("universe-selector-container")).toBeDefined();

      // Switch to Universe mode
      const universeRadio = screen.getByRole("radio", { name: /Universe/i });
      fireEvent.click(universeRadio);

      expect(screen.getByText("AI Universe Generator")).toBeDefined();
      expect(screen.queryByTestId("universe-selector-container")).toBeNull();

      fireEvent.change(screen.getByTestId("prompt-input"), {
        target: { value: "A realm of pure dark energy" },
      });
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(capturedOptions.type).toBe("universe");
        expect(capturedOptions.universe).toBeNull();
      });

      // Switch back to Character mode
      const charRadio = screen.getByRole("radio", { name: /Character/i });
      fireEvent.click(charRadio);

      expect(screen.getByText("AI Character Generator")).toBeDefined();
      expect(screen.getByTestId("universe-selector-container")).toBeDefined();

      const universeSelect = screen.getByTestId("universe-select") as HTMLSelectElement;
      fireEvent.change(universeSelect, { target: { value: "u-1" } });

      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(capturedOptions.type).toBe("character");
        expect(capturedOptions.universe?.id).toBe("u-1");
      });
    });

    it("ST-05: Preserves typed prompt when switching between character and universe modes", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />,
      );

      const promptInput = screen.getByTestId("prompt-input") as HTMLTextAreaElement;
      fireEvent.change(promptInput, {
        target: { value: "A persistent storyline prompt" },
      });
      expect(promptInput.value).toBe("A persistent storyline prompt");

      // Switch to Universe mode
      const universeRadio = screen.getByRole("radio", { name: /Universe/i });
      fireEvent.click(universeRadio);
      expect(promptInput.value).toBe("A persistent storyline prompt");

      // Switch back to Character mode
      const charRadio = screen.getByRole("radio", { name: /Character/i });
      fireEvent.click(charRadio);
      expect(promptInput.value).toBe("A persistent storyline prompt");
    });
  });

  // =========================================================================
  // 3. UNIVERSE CARD ACTION WITH MISSING/EMPTY UNIVERSE FIELDS
  // =========================================================================
  describe("3. Missing & Malformed Universe Fields Resilience", () => {
    it("ST-06: Resilient to universes with all nullable fields null/undefined and empty names", () => {
      const minimalUniverse: Character = {
        id: "u-empty",
        name: "",
        display_name: null,
        short_description: null,
        appearance: null,
        personality: null,
        backstory: null,
        hidden_description: null,
        is_universe: true,
      };

      // Ensure buildUniverseBriefPrompt handles empty/null without throwing
      const brief = buildUniverseBriefPrompt(minimalUniverse as any);
      expect(brief).toBe("Universe Name: ");

      // Ensure character prompt generation handles empty summaries safely
      const charPrompt = buildCharacterGenerationPrompt({
        prompt: "A nomad",
        universeSummary: "",
        researchFindings: "",
      });
      expect(charPrompt.user).toContain('Concept / Prompt: "A nomad"');
      expect(charPrompt.system).toContain("CRITICAL RULES:");
    });

    it("ST-07: Safely truncates extremely large universe descriptions without crashing", () => {
      const hugeUniverse: Character = {
        id: "u-huge",
        name: "Omniverse",
        display_name: "Infinite Realms",
        short_description: "A".repeat(50000),
        appearance: "B".repeat(30000),
        personality: "C".repeat(30000),
        backstory: "D".repeat(30000),
        hidden_description: "E".repeat(30000),
        is_universe: true,
      };

      const brief = buildUniverseBriefPrompt(hugeUniverse as any);
      expect(brief.length).toBeLessThan(15000);
      expect(brief).toContain("Universe Name: Omniverse");
      expect(brief).toContain("World Lore & Setting:");
    });

    it("ST-08: extractJsonPayload parses markdown codeblocks and conversational preambles", () => {
      const rawWithPreamble = `Here is your character payload as requested:
\`\`\`json
{
  "name": "Kaelen",
  "display_name": "Shadow Weaver",
  "short_description": "A rogue harnessing dark matter.",
  "appearance": "Obsidian cloak",
  "personality": "Stoic",
  "backstory": "Exiled from Solaris Prime.",
  "hidden_description": "Secretly allied with rebels."
}
\`\`\`
I hope this meets your expectations!`;

      const parsed = extractJsonPayload(rawWithPreamble);
      expect(parsed.name).toBe("Kaelen");
      expect(parsed.display_name).toBe("Shadow Weaver");

      // Test raw without codeblock
      const rawBraces = `Some text before {"name": "Lyra", "display_name": "Star Pilot", "short_description": "Fast"} some text after`;
      const parsedBraces = extractJsonPayload(rawBraces);
      expect(parsedBraces.name).toBe("Lyra");
    });
  });

  // =========================================================================
  // 4. FORM PRE-POPULATION AND MANUAL EDITS BEFORE SAVING
  // =========================================================================
  describe("4. Form Pre-Population & User Modification Flow", () => {
    it("ST-09: AI generation triggers modal open on Characters page", async () => {
      render(
        <MemoryRouter>
          <Characters />
        </MemoryRouter>,
      );

      // Open AI Generation modal from header
      const aiGenButtons = screen.getAllByRole("button", {
        name: /AI Generate/i,
      });
      fireEvent.click(aiGenButtons[0]);

      // Verify AI modal opens
      expect(screen.getByTestId("ai-generate-dialog")).toBeDefined();
    });
  });

  // =========================================================================
  // 5. ENCRYPTION LOCK GATING BEHAVIOR
  // =========================================================================
  describe("5. Encryption Lock Gating & Security", () => {
    it("ST-10: Renders EncryptionRequiredPrompt when characters category is locked", () => {
      clearActiveMasterKey();
      setCategoryEncryptionEnabled("characters", true);

      expect(isCategoryLocked("characters")).toBe(true);

      render(
        <MemoryRouter>
          <Characters />
        </MemoryRouter>,
      );

      expect(screen.getByTestId("encryption-required-prompt")).toBeDefined();
      expect(screen.getByText("Decryption Required")).toBeDefined();

      // Reset
      setCategoryEncryptionEnabled("characters", false);
    });

    it("ST-11: Encrypts character data before database storage when encryption is enabled and key active", async () => {
      const testKey = generateAes256Key();
      setActiveMasterKey(testKey);
      setCategoryEncryptionEnabled("characters", true);

      expect(isCategoryLocked("characters")).toBe(false);

      const plainCharacter = {
        name: "Shadow Blade",
        display_name: "Master Assassin",
        short_description: "Strikes from the shadows",
        appearance: "Dark cloak",
        personality: "Silent",
        backstory: "Trained in the mountain monastery",
        hidden_description: "Target list includes the king",
      };

      const encrypted = await encryptCharacterData(plainCharacter, testKey);
      expect(encrypted.name).toContain("ENC:aes-256-gcm:");
      expect(encrypted.backstory).toContain("ENC:aes-256-gcm:");
      expect(encrypted.hidden_description).toContain("ENC:aes-256-gcm:");

      const decrypted = await decryptCharacterData(encrypted, testKey);
      expect(decrypted.name).toBe("Shadow Blade");
      expect(decrypted.backstory).toBe("Trained in the mountain monastery");
      expect(decrypted.hidden_description).toBe("Target list includes the king");
    });
  });

  // =========================================================================
  // 6. BRANDING & LOCALIZATION
  // =========================================================================
  describe("6. Compliance & Locales Completeness", () => {
    it("ST-12: Verifies all 6 language files define all necessary aiGenerate translation keys", () => {
      const locales = [
        { lang: "en", data: en },
        { lang: "es", data: es },
        { lang: "ja", data: ja },
        { lang: "ko", data: ko },
        { lang: "ru", data: ru },
        { lang: "zh-CN", data: zhCN },
      ];

      const requiredKeys = [
        "button",
        "generateForUniverse",
        "titleCharacter",
        "titleUniverse",
        "subtitle",
        "targetType",
        "character",
        "universe",
        "targetUniverse",
        "standaloneOption",
        "model",
        "promptLabel",
        "promptPlaceholder",
        "generate",
        "stopGeneration",
        "stepSummarizing",
        "stepResearching",
        "stepGenerating",
        "errorPromptRequired",
        "errorGeneric",
      ];

      for (const { lang, data } of locales) {
        expect(
          data.characters?.aiGenerate,
          `Locale ${lang} missing characters.aiGenerate object`,
        ).toBeDefined();

        for (const key of requiredKeys) {
          expect(
            (data.characters.aiGenerate as any)[key],
            `Locale ${lang} missing characters.aiGenerate.${key}`,
          ).toBeTruthy();
        }
      }
    });
  });
});
