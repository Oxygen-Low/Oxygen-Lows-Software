/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PythonManagerApp } from "./PythonManager";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/services/llmRunnerService", () => ({
  llmRunnerService: {
    getPythonOverview: vi.fn().mockResolvedValue({
      status: "running",
      pid: 12345,
      uptime_seconds: 3600,
      python_version: "3.12.7",
      executable: "C:\\Python\\python.exe",
      environment_prefix: "C:\\PythonEnv",
      cpu_percent: 1.5,
      memory_mb: 85.2,
      loaded_apps: ["llm_runner", "python_manager"],
    }),
    getPythonDependencies: vi.fn().mockResolvedValue({
      dependencies: [
        {
          name: "torch",
          import_name: "torch",
          required: ">=2.4.0",
          description: "PyTorch deep learning tensor engine",
          installed: true,
          version: "2.6.0",
        },
        {
          name: "airllm",
          import_name: "airllm",
          required: ">=4.0.0",
          description: "Layer-wise massive model runner on low VRAM",
          installed: false,
          version: null,
        },
      ],
      cuda: {
        available: true,
        device_count: 1,
        device_name: "NVIDIA GeForce RTX 4080",
        total_vram_mb: 16384,
      },
    }),
    getPythonLogs: vi.fn().mockResolvedValue({
      total_count: 1,
      logs: [
        {
          id: 1,
          timestamp: 1234567890,
          time_str: "2026-10-22 12:00:00",
          level: "INFO",
          name: "PythonServer",
          message: "Server started successfully on port 54123",
          formatted: "[INFO] Server started",
          exception: null,
        },
      ],
    }),
    installPythonDependency: vi.fn().mockResolvedValue({ success: true, package: "airllm" }),
    clearPythonLogs: vi.fn().mockResolvedValue({ status: "ok", cleared: true }),
    restartServer: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("@/lib/desktopBridge", () => ({
  isDesktopBridgeAvailable: vi.fn().mockReturnValue(true),
  addPushEventListener: vi.fn(() => () => {}),
}));

describe("PythonManagerApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Python Manager header, metrics, and dependencies", async () => {
    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    expect(screen.getAllByText("Python Manager")[0]).toBeDefined();
    expect(screen.getByText("Desktop Exclusive")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("torch")).toBeDefined();
      expect(screen.getByText("v2.6.0")).toBeDefined();
      expect(screen.getByText("airllm")).toBeDefined();
      expect(screen.getByText("Missing")).toBeDefined();
    });
  });

  it("switches to logs tab and displays log records", async () => {
    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    const logsTabBtn = screen.getAllByText(/Logs & Diagnostics/i)[0];
    fireEvent.click(logsTabBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Server started successfully on port 54123"),
      ).toBeDefined();
    });
  });
});
