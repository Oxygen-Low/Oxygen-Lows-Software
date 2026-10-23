/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
    getDesktopServerInfo: vi.fn().mockResolvedValue({
      isRunning: true,
      port: 54123,
      url: "http://127.0.0.1:54123",
      token: "mock-token",
      status: "Running",
    }),
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

  afterEach(() => {
    cleanup();
  });

  it("renders metrics and dependencies without AI badges, CUDA section, or redundant header", async () => {
    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    // App header, desktop exclusive badge, CUDA section, virtualenv box, and AI fluff should be removed
    expect(screen.queryByText("Desktop Exclusive")).toBeNull();
    expect(screen.queryByText("CUDA GPU Acceleration")).toBeNull();
    expect(screen.queryByText("Isolated Virtual Environment Details")).toBeNull();
    expect(screen.queryByText(/Required packages for GGUF/i)).toBeNull();

    // Dependencies title should be displayed
    await waitFor(() => {
      expect(screen.getByText("Dependencies")).toBeDefined();
      expect(screen.getByText("torch")).toBeDefined();
      expect(screen.getByText("v2.6.0")).toBeDefined();
      expect(screen.getByText("airllm")).toBeDefined();
      expect(screen.getByText("Missing")).toBeDefined();
    });

    // Server status should be static text "Running" without ping/blink dot
    await waitFor(() => {
      expect(screen.getByText("Running")).toBeDefined();
    });
    expect(document.querySelector(".animate-ping")).toBeNull();
  });

  it("changes running to restarting when restart is triggered", async () => {
    const { llmRunnerService } = await import("@/services/llmRunnerService");
    let resolveRestart: (val: any) => void;
    vi.mocked(llmRunnerService.restartServer).mockImplementation(
      () => new Promise((resolve) => { resolveRestart = resolve; }),
    );

    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeDefined();
    });

    const restartBtn = screen.getByText("Restart Python Server");
    fireEvent.click(restartBtn);

    // Status should switch to "Restarting" (both in button and server status metric)
    await waitFor(() => {
      expect(screen.getAllByText("Restarting").length).toBeGreaterThanOrEqual(1);
    });

    // Resolve restart
    resolveRestart!({ success: true });
    await waitFor(() => {
      expect(screen.getByText("Running")).toBeDefined();
    });
  });

  it("shows progress bar when installing a dependency", async () => {
    const { llmRunnerService } = await import("@/services/llmRunnerService");
    let resolveInstall: (val: any) => void;
    vi.mocked(llmRunnerService.installPythonDependency).mockImplementation(
      () => new Promise((resolve) => { resolveInstall = resolve; }),
    );

    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("airllm")).toBeDefined();
    });

    const installBtn = screen.getByRole("button", { name: /^Install$/i });
    fireEvent.click(installBtn);

    // Progress bar and stage should appear
    await waitFor(() => {
      expect(screen.getByText(/Resolving dependencies/i)).toBeDefined();
      expect(screen.getByText(/10%/)).toBeDefined();
    });

    resolveInstall!({ success: true, package: "airllm" });
    await waitFor(() => {
      expect(screen.getByText(/Installed/i)).toBeDefined();
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

  it("handles offline state gracefully without displaying fake running status", async () => {
    const { llmRunnerService } = await import("@/services/llmRunnerService");
    vi.mocked(llmRunnerService.getPythonOverview).mockRejectedValueOnce(new Error("Connection refused"));
    vi.mocked(llmRunnerService.getPythonDependencies).mockRejectedValueOnce(new Error("Connection refused"));
    vi.mocked(llmRunnerService.getDesktopServerInfo).mockResolvedValueOnce({
      isRunning: false,
      port: 54123,
      url: "http://127.0.0.1:54123",
      token: "",
      status: "Stopped",
    });

    render(
      <LanguageProvider>
        <PythonManagerApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Stopped")).toBeDefined();
      expect(screen.getByText("Python Background Server is Offline")).toBeDefined();
      expect(screen.getByText("Dependencies Unavailable")).toBeDefined();
    });
  });
});
