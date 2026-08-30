/** @vitest-environment jsdom */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

// Mock hooks and contexts
vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, _params?: any, fallback?: string) => fallback || key,
  }),
}));

const mockModels = [
  { provider: "cloudflare", model_id: "@cf/nvidia/nemotron-3-120b-a12b", name: "Nemotron 3 120B (Smart)" },
  { provider: "cloudflare", model_id: "@cf/google/gemma-4-26b-a4b-it", name: "Gemma 4 26B IT (Balanced)" },
  { provider: "horde", model_id: "Fast", name: "Fast - google/gemma-4-31b" },
  { provider: "local-ollama", model_id: "llama3.2:latest", name: "Llama 3.2 (Local)", isLocal: true },
];

vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => ({
    models: mockModels,
    selectedModel: "@cf/nvidia/nemotron-3-120b-a12b",
    selectedProvider: "cloudflare",
    setSelectedModel: vi.fn(),
    setSelectedProvider: vi.fn(),
    chatbotDefaultModel: "@cf/nvidia/nemotron-3-120b-a12b",
    chatbotDefaultProvider: "cloudflare",
  }),
}));

import {
  AiGenerateDialog,
  type Character,
  type GeneratedEntityResult,
  type AiGenerateDialogProps,
} from "./AiGenerateDialog";



describe("AiGenerateDialog Component — 4-Tier Test Suite", () => {
  const mockUniverses: Character[] = [
    { id: "u-1", name: "Aetheria", display_name: "Aetheria Realm", is_universe: true },
    { id: "u-2", name: "CyberTokyo", display_name: "Cyber Tokyo 2099", is_universe: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Category-Partition)
  // =========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1-01: renders modal elements when open is true", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      expect(screen.getByTestId("ai-generate-dialog")).toBeDefined();
      expect(screen.getByText("AI Character Generator")).toBeDefined();
      expect(screen.getByTestId("prompt-input")).toBeDefined();
      expect(screen.getByTestId("universe-select")).toBeDefined();
      expect(screen.getByTestId("model-select")).toBeDefined();
      expect(screen.getByTestId("start-generate-btn")).toBeDefined();
    });

    it("T1-02: does not render anything when open is false", () => {
      render(
        <AiGenerateDialog
          open={false}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      expect(screen.queryByTestId("ai-generate-dialog")).toBeNull();
    });

    it("T1-03: renders universe selector with list of universes from props", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      const select = screen.getByTestId("universe-select") as HTMLSelectElement;
      expect(select.options.length).toBe(3); // None + 2 universes
      expect(select.options[1].text).toBe("Aetheria Realm");
      expect(select.options[2].text).toBe("Cyber Tokyo 2099");
    });

    it("T1-04: pre-selects initialUniverse if provided", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          initialType="character"
          initialUniverse={mockUniverses[1]}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      const select = screen.getByTestId("universe-select") as HTMLSelectElement;
      expect(select.value).toBe("u-2");
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (BVA)
  // =========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2-01: shows validation error when clicking generate with empty prompt", async () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("start-generate-btn"));

      expect(screen.getByTestId("ai-generate-error")).toBeDefined();
      expect(screen.getByText("Please enter a concept or prompt to generate.")).toBeDefined();
    });

    it("T2-02: shows error alert when generator function fails without unhandled rejection", async () => {
      const mockFailingGen = vi.fn().mockRejectedValue(new Error("Rate limit exceeded on provider"));

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
          generateEntityFn={mockFailingGen}
        />
      );

      fireEvent.change(screen.getByTestId("prompt-input"), { target: { value: "A brave warrior" } });
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-generate-error")).toBeDefined();
        expect(screen.getByText("Rate limit exceeded on provider")).toBeDefined();
      });

      // Assert prompt is still preserved in textarea
      expect((screen.getByTestId("prompt-input") as HTMLTextAreaElement).value).toBe("A brave warrior");
    });

    it("T2-03: clicking Stop Generation aborts active generation and resets to idle", async () => {
      let capturedSignal: AbortSignal | undefined;
      const mockLongGen = vi.fn().mockImplementation(({ signal }) => {
        capturedSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
          generateEntityFn={mockLongGen}
        />
      );

      fireEvent.change(screen.getByTestId("prompt-input"), { target: { value: "A long running task" } });
      fireEvent.click(screen.getByTestId("start-generate-btn"));

      expect(screen.getByTestId("stop-generate-btn")).toBeDefined();

      fireEvent.click(screen.getByTestId("stop-generate-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("start-generate-btn")).toBeDefined();
        expect(capturedSignal?.aborted).toBe(true);
      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Pairwise Combinatorial)
  // =========================================================================
  describe("Tier 3: Cross-Feature Interactions", () => {
    it("T3-01: hides universe selector when targetType is switched to universe", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      expect(screen.getByTestId("universe-selector-container")).toBeDefined();

      const universeRadio = screen.getByRole("radio", { name: /Universe/i });
      fireEvent.click(universeRadio);

      expect(screen.queryByTestId("universe-selector-container")).toBeNull();
      expect(screen.getByText("AI Universe Generator")).toBeDefined();
    });

    it("T3-02: updates model selection dropdown and handles provider switching", () => {
      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={vi.fn()}
          universes={mockUniverses}
          onApply={vi.fn()}
        />
      );

      const select = screen.getByTestId("model-select") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "llama3.2:latest" } });

      expect(select.value).toBe("llama3.2:latest");
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // =========================================================================
  describe("Tier 4: Real-World Scenarios", () => {
    it("T4-01: complete character generation and onApply callback flow", async () => {
      const mockApply = vi.fn();
      const mockOpenChange = vi.fn();

      const mockSuccessfulGen = vi.fn().mockImplementation(async ({ onProgress }) => {
        onProgress("summarizing", "Analyzing Aetheria Realm...");
        onProgress("researching", "Finding sky-pirate tropes...");
        onProgress("generating", "Creating Captain Vane...");
        return {
          name: "Captain Vane",
          display_name: "Sky Corsair",
          short_description: "A daring sky-corsair navigating crystal storm winds.",
          appearance: "Leather aviator jacket, bronze goggles, prosthetic glider wing.",
          personality: "Reckless, charming, loyal to his crew.",
          backstory: "Orphaned in the Cloud Spires, built his own airship from scrap.",
          hidden_description: "Possesses a navigational map to the Forgotten Core.",
          universe_id: "u-1",
          is_universe: false,
        };
      });

      render(
        <AiGenerateDialog
          open={true}
          onOpenChange={mockOpenChange}
          initialUniverse={mockUniverses[0]}
          universes={mockUniverses}
          onApply={mockApply}
          generateEntityFn={mockSuccessfulGen}
        />
      );

      fireEvent.change(screen.getByTestId("prompt-input"), {
        target: { value: "A daring sky pirate with bronze goggles" },
      });

      fireEvent.click(screen.getByTestId("start-generate-btn"));

      await waitFor(() => {
        expect(mockSuccessfulGen).toHaveBeenCalled();
        expect(mockApply).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Captain Vane",
            display_name: "Sky Corsair",
            universe_id: "u-1",
            is_universe: false,
          })
        );
        expect(mockOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
