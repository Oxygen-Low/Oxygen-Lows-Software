/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LLMRunnerApp } from "./LLMRunner";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/services/llmRunnerService", () => ({
  llmRunnerService: {
    getModelsDir: vi.fn().mockResolvedValue({
      models_dir: "C:\\Users\\test\\AppData\\Local\\OxygenLowsSoftware\\Models",
      exists: true,
    }),
    listModels: vi.fn().mockResolvedValue({
      models_dir: "C:\\Users\\test\\AppData\\Local\\OxygenLowsSoftware\\Models",
      models: [
        {
          id: "llama-3-8b.Q4_K_M.gguf",
          name: "llama-3-8b.Q4_K_M.gguf",
          path: "C:\\models\\llama-3-8b.Q4_K_M.gguf",
          format: "gguf",
          size_bytes: 4500000000,
          size_display: "4.19 GB",
          quantization: "Q4_K_M",
          modified_at: "2026-10-22 12:00:00",
          is_active: false,
          is_directory: false,
        },
      ],
    }),
    getStatus: vi.fn().mockResolvedValue({
      state: "stopped",
      is_active: false,
      active_model: null,
      metrics: {
        last_prompt_tokens: 0,
        last_completion_tokens: 0,
        last_tokens_per_sec: 0,
        last_ttft_ms: 0,
      },
      error: null,
      hardware: {
        cuda_available: true,
        vram_mb: 8192,
      },
    }),
    getDownloadProgress: vi.fn().mockResolvedValue({ status: "idle", percent: 0 }),
    loadModel: vi.fn().mockResolvedValue({
      status: "ok",
      state: "running",
      model_name: "llama-3-8b.Q4_K_M.gguf",
      engine: "llama-cpp",
    }),
    unloadModel: vi.fn().mockResolvedValue({ status: "ok", state: "stopped" }),
  },
}));

vi.mock("@/lib/desktopBridge", () => ({
  isDesktopBridgeAvailable: vi.fn().mockReturnValue(true),
  openModelsFolder: vi.fn().mockResolvedValue({ path: "C:\\models" }),
  pickModelFile: vi.fn().mockResolvedValue(null),
  pickModelFolder: vi.fn().mockResolvedValue(null),
  addPushEventListener: vi.fn(() => () => {}),
}));

describe("LLMRunnerApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders LLM Runner header and tabs", async () => {
    render(
      <LanguageProvider>
        <LLMRunnerApp />
      </LanguageProvider>,
    );

    expect(screen.getAllByText("LLM Runner")[0]).toBeDefined();
    expect(screen.getByText("Desktop Exclusive")).toBeDefined();
    expect(screen.getAllByText(/Models & Storage/i)[0]).toBeDefined();
    expect(screen.getAllByText(/Runner Controls/i)[0]).toBeDefined();
    expect(screen.getAllByText(/Testing Chat/i)[0]).toBeDefined();
  });

  it("displays stored models in the list", async () => {
    render(
      <LanguageProvider>
        <LLMRunnerApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("llama-3-8b.Q4_K_M.gguf")[0]).toBeDefined();
      expect(screen.getAllByText("Q4_K_M")[0]).toBeDefined();
    });
  });

  it("allows switching to runner controls and testing chat tabs", async () => {
    render(
      <LanguageProvider>
        <LLMRunnerApp />
      </LanguageProvider>,
    );

    const runnerTabBtn = screen.getAllByText(/Runner Controls/i)[0];
    fireEvent.click(runnerTabBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Runtime Engine & Hardware Configuration/i),
      ).toBeDefined();
      expect(screen.getByText("GPU Offload Layers")).toBeDefined();
    });

    const chatTabBtn = screen.getAllByText(/Testing Chat/i)[0];
    fireEvent.click(chatTabBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Testing Chat \(No Model Loaded\)/i),
      ).toBeDefined();
    });
  });
});
