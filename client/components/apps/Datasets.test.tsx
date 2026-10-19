/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DatasetsApp } from "./Datasets";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => ({
    models: [
      {
        provider: "pollinations",
        model_id: "inclusionai/ling-3.1-flash",
        name: "Free",
      },
      {
        provider: "pollinations",
        model_id: "openai/gpt-6-luna",
        name: "Fast",
      },
    ],
    chatbotDefaultModel: "inclusionai/ling-3.1-flash",
    pollinationsApiKey: "pk_test",
    isPollinationsSupporter: false,
  }),
}));

vi.mock("@/lib/localSession", () => ({
  getLocalSession: () => ({
    accessToken: "test-token",
    user: { id: "u1", username: "test" },
  }),
}));

describe("DatasetsApp", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty state when no datasets exist and navigates to Create tabs", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/api/datasets")) {
        return new Response(JSON.stringify({ success: true, datasets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <LanguageProvider>
        <DatasetsApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("No datasets yet")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Create Dataset"));

    expect(screen.getByText("Generate with AI")).toBeDefined();
    expect(screen.getByText("Import from HuggingFace")).toBeDefined();
    expect(screen.getByText("Queue")).toBeDefined();
    expect(screen.getByText("Refine")).toBeDefined();

    // Switch to HuggingFace tab
    fireEvent.click(screen.getByText("Import from HuggingFace"));
    expect(screen.getByText(/HuggingFace Dataset Path/i)).toBeDefined();

    // Switch to Queue tab
    fireEvent.click(screen.getByText("Queue"));
    expect(screen.getByText("Generation Queue is Empty")).toBeDefined();

    // Switch to Refine tab
    fireEvent.click(screen.getByText("Refine"));
    expect(screen.getByText("Dataset Refinement")).toBeDefined();
  });

  it("lists existing datasets and opens View / Edit rows view", async () => {
    const mockDatasets = [
      {
        id: "alpaca-demo",
        name: "Alpaca Demo",
        description: "Sample instruction dataset",
        createdAt: "2026-10-19T12:00:00.000Z",
        updatedAt: "2026-10-19T12:00:00.000Z",
        rowCount: 1,
        tokenCount: 42,
        model: "inclusionai/ling-3.1-flash",
        prompt: "Test prompt",
        datasetType: "standard",
        archived: false,
      },
    ];

    vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/api/datasets/alpaca-demo/rows")) {
        return new Response(
          JSON.stringify({
            success: true,
            rows: [
              {
                instruction: "What is TypeScript?",
                input: "",
                output: "A typed superset of JavaScript.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/datasets")) {
        return new Response(
          JSON.stringify({ success: true, datasets: mockDatasets }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <LanguageProvider>
        <DatasetsApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpaca Demo")).toBeDefined();
    });

    fireEvent.click(screen.getByText("View / Edit"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("What is TypeScript?")).toBeDefined();
      expect(
        screen.getByDisplayValue("A typed superset of JavaScript."),
      ).toBeDefined();
    });
  });
});
