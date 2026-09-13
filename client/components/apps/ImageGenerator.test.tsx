// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ImageGeneratorApp } from "./ImageGenerator";
import { generateImage, fetchImageModels } from "@/services/imageGen";
import { setLocalSession } from "@/lib/localSession";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock services/imageGen
vi.mock("@/services/imageGen", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    fetchImageModels: vi.fn().mockResolvedValue({
      horde: [
        {
          provider: "horde",
          id: "SDXL 1.0",
          name: "SDXL 1.0 (Horde)",
          description: "Community photorealistic checkpoint",
          free: true,
          maxSteps: 30,
          defaultSteps: 20,
          aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
          workers: 8,
          queued: 1,
          eta: 12,
        },
      ],
    }),
    generateImage: vi.fn().mockImplementation((params) =>
      Promise.resolve({
        id: "mock-generated-img-1",
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        timestamp: Date.now(),
        aspectRatio: params.aspectRatio || "1:1",
      }),
    ),
    saveGeneratedImageToStorage: vi.fn().mockResolvedValue({
      url: "/api/storage/download/Storage/1/ai-images/mock.png",
      filename: "mock.png",
      path: "1/ai-images/mock.png",
    }),
  };
});

describe("ImageGeneratorApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setLocalSession({
      access_token: "test-token",
      token_type: "bearer",
      user: {
        id: "test-user-1",
        email: "test@example.com",
        username: "tester",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderApp = () =>
    render(
      <BrowserRouter>
        <ThemeProvider>
          <ImageGeneratorApp />
        </ThemeProvider>
      </BrowserRouter>,
    );

  it("renders the AI Image Generator app and loads models for authenticated users", async () => {
    renderApp();

    expect(screen.getByText("AI Image Generator")).toBeDefined();
    expect(screen.getByText("AI Horde (SFW)")).toBeDefined();

    // Model dropdown options load AI Horde models
    await waitFor(() => {
      expect(screen.getByText(/SDXL 1\.0 \(Horde\)/)).toBeDefined();
    });
  });

  it("defaults to AI Horde for guest users", async () => {
    setLocalSession(null);
    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/SDXL 1\.0 \(Horde\)/)).toBeDefined();
    });
  });

  it("populates prompt when clicking a sample prompt chip", async () => {
    renderApp();

    const promptTextarea = screen.getByPlaceholderText(
      /Describe the image you want to generate/i,
    ) as HTMLTextAreaElement;
    expect(promptTextarea.value).toBe("");

    const sampleBtn = screen.getByText(/A futuristic cyberpunk metropolis/i);
    fireEvent.click(sampleBtn);

    expect(promptTextarea.value).toContain(
      "A futuristic cyberpunk metropolis at twilight",
    );
  });

  it("toggles negative prompt and advanced settings", async () => {
    renderApp();

    // Negative prompt accordion
    expect(
      screen.queryByPlaceholderText(/Elements to exclude/i),
    ).toBeNull();
    const negToggle = screen.getByText(/Negative Prompt/i);
    fireEvent.click(negToggle);
    expect(
      screen.getByPlaceholderText(/Elements to exclude/i),
    ).toBeDefined();

    // Advanced settings accordion
    expect(screen.queryByText(/Guidance \/ CFG/i)).toBeNull();
    const advToggle = screen.getByText(/Advanced Settings/i);
    fireEvent.click(advToggle);
    expect(screen.getByText(/Guidance \/ CFG/i)).toBeDefined();
    expect(screen.getByText(/Steps/i)).toBeDefined();
  });

  it("generates an image and displays it on the canvas with actions", async () => {
    renderApp();

    const promptTextarea = screen.getByPlaceholderText(
      /Describe the image you want to generate/i,
    );
    fireEvent.change(promptTextarea, {
      target: { value: "A majestic snow leopard in the Himalayas" },
    });

    const generateBtn = screen.getByRole("button", {
      name: /Generate Image/i,
    });
    expect((promptTextarea as HTMLTextAreaElement).value).toBe(
      "A majestic snow leopard in the Himalayas",
    );
    expect((generateBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(generateBtn);
    expect(generateImage).toHaveBeenCalled();

    // Wait for the generated image to render
    await waitFor(() => {
      const imgs = screen.getAllByAltText("A majestic snow leopard in the Himalayas");
      expect(imgs.length).toBeGreaterThanOrEqual(1);
      expect(imgs[0].getAttribute("src")).toContain("data:image/png;base64");
    });

    // Verify action buttons
    expect(screen.getByRole("button", { name: /Download/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Copy/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Open in Image Studio/i })).toBeDefined();
  });

  it("selects aspect ratios correctly", async () => {
    renderApp();

    const sixteenNineBtn = screen.getByText("16:9");
    fireEvent.click(sixteenNineBtn);

    // Verify selection visual styling
    const btnParent = sixteenNineBtn.closest("button");
    expect(btnParent?.className).toContain("bg-cyan-500/20");
  });
});
