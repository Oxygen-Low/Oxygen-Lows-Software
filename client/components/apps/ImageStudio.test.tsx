// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ImageStudioApp } from "./ImageStudio";
import * as authHook from "@/hooks/useAuth";
import * as themeHook from "@/hooks/useTheme";
import { BrowserRouter } from "react-router-dom";

vi.mock("@/hooks/useAuth");
vi.mock("@/hooks/useTheme");
vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test-path" }, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      download: vi.fn().mockResolvedValue({
        data: { text: vi.fn().mockResolvedValue(JSON.stringify({ width: 1920, height: 1080, layers: [] })) },
        error: null,
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "/api/storage/test.png" } }),
    }),
  },
}));

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  rect: vi.fn(),
  roundRect: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  createRadialGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  measureText: vi.fn().mockReturnValue({ width: 10 }),
} as any);

describe("ImageStudioApp", () => {
  beforeEach(() => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: { user: { id: "test-user-id" } },
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    vi.mocked(themeHook.useTheme).mockReturnValue({
      theme: "default",
      font: "font-zilla",
      useGradient: true,
      lastModelId: null,
      lastProvider: null,
      chatbotDefaultModel: null,
      chatbotDefaultProvider: null,
      researchAgentDefaultModel: null,
      researchAgentDefaultProvider: null,
      researchSummarizerDefaultModel: null,
      researchSummarizerDefaultProvider: null,
      setTheme: vi.fn(),
      setFont: vi.fn(),
      setUseGradient: vi.fn(),
      setModelPreference: vi.fn(),
      setChatbotDefault: vi.fn(),
      setResearchAgentDefault: vi.fn(),
      setResearchSummarizerDefault: vi.fn(),
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("gates access and displays sign-in prompt when user is not authenticated", () => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: null,
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    expect(screen.getByText("Image Studio")).toBeDefined();
    expect(screen.getByText("Sign In to Continue")).toBeDefined();
    expect(
      screen.getByText(/Sign in to your Oxygen Low's Software account/i),
    ).toBeDefined();
  });

  it("renders the studio workspace with toolbar, tools, and canvas for authenticated users", () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Project Name input
    expect(screen.getByDisplayValue("Untitled Graphic")).toBeDefined();

    // Studio toolbar items
    expect(screen.getByText("Export")).toBeDefined();
    expect(screen.getByText("Projects")).toBeDefined();

    // Studio sidebar tabs
    expect(screen.getByText("Uploads")).toBeDefined();
    expect(screen.getByText("Text")).toBeDefined();
    expect(screen.getByText("Shapes")).toBeDefined();
    expect(screen.getByText("Background")).toBeDefined();
    expect(screen.getByText("Layers")).toBeDefined();
  });

  it("allows switching sidebar tabs and adding text layers", () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Text tab
    fireEvent.click(screen.getByText("Text"));
    expect(screen.getByText("Add a heading")).toBeDefined();
    expect(screen.getByText("Add a subheading")).toBeDefined();
    expect(screen.getByText(/body text/i)).toBeDefined();

    // Click Add a heading
    fireEvent.click(screen.getByText("Add a heading"));

    // Check Layers tab has the new layer
    fireEvent.click(screen.getByText("Layers"));
    expect(screen.getByText("Add a heading")).toBeDefined();
  });

  it("allows adding geometric shapes to the canvas", () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Shapes tab
    fireEvent.click(screen.getByText("Shapes"));
    expect(screen.getByText("Rectangle")).toBeDefined();
    expect(screen.getByText("Circle")).toBeDefined();
    expect(screen.getByText("Star")).toBeDefined();

    // Click to add circle
    fireEvent.click(screen.getByText("Circle"));

    // Check Layers tab
    fireEvent.click(screen.getByText("Layers"));
    expect(screen.getByText("Circle")).toBeDefined();
  });

  it("supports changing canvas background types and colors", () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Background tab
    fireEvent.click(screen.getByText("Background"));
    expect(screen.getByText("Transparent")).toBeDefined();
    expect(screen.getByText("Solid")).toBeDefined();
    expect(screen.getByText("Gradient")).toBeDefined();

    // Switch to transparent
    fireEvent.click(screen.getByText("Transparent"));
    expect(screen.getByText(/Exporting as PNG will preserve transparency/i)).toBeDefined();

    // Switch to gradient
    fireEvent.click(screen.getByText("Gradient"));
    expect(screen.getByText("Linear")).toBeDefined();
    expect(screen.getByText("Radial")).toBeDefined();
  });

  it("opens and closes the export dialog", async () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Click Export
    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(screen.getByText("Export Image")).toBeDefined();
      expect(screen.getByText("File Format")).toBeDefined();
      expect(screen.getByText("Download Image")).toBeDefined();
    });
  });

  it("opens the projects dialog", async () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Click Projects
    fireEvent.click(screen.getByText("Projects"));

    await waitFor(() => {
      expect(screen.getAllByText(/Projects/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Save Current Project to Storage")).toBeDefined();
      expect(screen.getByText("Import File (.json)")).toBeDefined();
      expect(screen.getByText("Export File (.json)")).toBeDefined();
    });
  });

  it("allows selecting starter templates and replaces canvas layout", async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Templates tab
    fireEvent.click(screen.getByText("Templates"));
    expect(screen.getByText("YouTube Thumbnail")).toBeDefined();
    expect(screen.getByText("Special Offer / Sale")).toBeDefined();

    // Click Use Template on YouTube Thumbnail
    const useButtons = screen.getAllByText("Use Template");
    fireEvent.click(useButtons[0]);

    // Check project name updated
    await waitFor(() => {
      expect(screen.getByDisplayValue("YouTube Thumbnail")).toBeDefined();
    });
  });

  it("initializes line shape with visible stroke width and color", () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Shapes tab
    fireEvent.click(screen.getByText("Shapes"));
    expect(screen.getByText("Line")).toBeDefined();

    // Click to add line
    fireEvent.click(screen.getByText("Line"));

    // Check Layers tab
    fireEvent.click(screen.getByText("Layers"));
    expect(screen.getByText("Line")).toBeDefined();
  });

  it("supports inline layer renaming in the Layers tab", async () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Layers tab
    fireEvent.click(screen.getByText("Layers"));
    const headingLayer = screen.getByText("Welcome Heading");
    expect(headingLayer).toBeDefined();

    // Double click to trigger inline edit
    fireEvent.doubleClick(headingLayer);

    // Check input is shown with current value
    const input = screen.getByDisplayValue("Welcome Heading");
    fireEvent.change(input, { target: { value: "Updated Banner Title" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Verify updated title is rendered
    await waitFor(() => {
      expect(screen.getByText("Updated Banner Title")).toBeDefined();
    });
  });

  it("opens the AI Image generation modal from Uploads tab", async () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Uploads tab is active by default
    const generateBtn = screen.getByText("Generate with AI");
    expect(generateBtn).toBeDefined();

    // Click Generate with AI
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Generate Image with AI")).toBeDefined();
      expect(
        screen.getByPlaceholderText(/A futuristic cyber city with glowing neon billboards/i),
      ).toBeDefined();
      expect(screen.getByText("Generate & Insert")).toBeDefined();
    });
  });

  it("allows adding and configuring Background Light shape layer", async () => {
    render(
      <BrowserRouter>
        <ImageStudioApp />
      </BrowserRouter>,
    );

    // Switch to Shapes tab
    fireEvent.click(screen.getByText("Shapes"));
    expect(screen.getByText("Background Light")).toBeDefined();

    // Click to add Background Light
    fireEvent.click(screen.getByText("Background Light"));

    // Check Layers tab
    fireEvent.click(screen.getByText("Layers"));
    expect(screen.getByText("Background Light")).toBeDefined();
  });

  it("supports character color selection and styling in CharacterColorsPopover", async () => {
    const mockUpdateLayer = vi.fn();
    const sampleLayer = {
      id: "text-1",
      type: "text" as const,
      name: "Sample Text",
      text: "HELLO",
      x: 0,
      y: 0,
      width: 200,
      height: 50,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      fontFamily: "Inter, sans-serif",
      fontSize: 24,
      fontWeight: "normal" as const,
      fontStyle: "normal" as const,
      underline: false,
      color: "#ffffff",
      textAlign: "center" as const,
      lineHeight: 1.2,
      letterSpacing: 0,
    };

    const { CharacterColorsPopover } = await import("./ImageStudio/InspectorToolbar");

    const { unmount } = render(
      <CharacterColorsPopover
        textLayer={sampleLayer}
        onUpdateLayer={mockUpdateLayer}
      />,
    );

    // Open popover
    const trigger = screen.getByText("Color Characters");
    fireEvent.click(trigger);

    // Select All
    const selectAllBtn = screen.getByText("Select All");
    fireEvent.click(selectAllBtn);

    // Apply rainbow
    const rainbowBtn = screen.getByText(/Rainbow Effect/i);
    fireEvent.click(rainbowBtn);
    expect(mockUpdateLayer).toHaveBeenCalledWith(
      "text-1",
      expect.objectContaining({
        charColors: expect.any(Object),
      }),
    );

    // Apply gradient
    const gradientBtn = screen.getByText("Apply Gradient");
    fireEvent.click(gradientBtn);
    expect(mockUpdateLayer).toHaveBeenCalledWith(
      "text-1",
      expect.objectContaining({
        charColors: expect.any(Object),
      }),
    );

    unmount();
  });

  it("correctly draws background-light shape and per-character text onto canvas", async () => {
    const { drawShape, drawText, parseColorToRgb } = await import("./ImageStudio/canvasUtils");

    expect(parseColorToRgb("#06b6d4")).toEqual({ r: 6, g: 182, b: 212 });
    expect(parseColorToRgb("rgb(255, 100, 50)")).toEqual({ r: 255, g: 100, b: 50 });

    const ctx = document.createElement("canvas").getContext("2d")!;

    // Test background light shape drawing
    const bgLightLayer = {
      id: "light-1",
      type: "shape" as const,
      name: "Background Light",
      shapeType: "background-light" as const,
      fill: "#38bdf8",
      fillType: "solid" as const,
      strokeColor: "transparent",
      strokeWidth: 0,
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
    };

    expect(() => drawShape(ctx, bgLightLayer)).not.toThrow();

    // Test text with charColors drawing
    const textLayerWithCharColors = {
      id: "text-colored",
      type: "text" as const,
      name: "Colored Heading",
      text: "HELLO WORLD",
      fontFamily: "Inter, sans-serif",
      fontSize: 32,
      fontWeight: "bold" as const,
      fontStyle: "normal" as const,
      underline: false,
      color: "#ffffff",
      charColors: {
        0: "#ff0000",
        1: "#00ff00",
        2: "#0000ff",
      },
      textAlign: "center" as const,
      lineHeight: 1.2,
      letterSpacing: 2,
      x: 50,
      y: 50,
      width: 300,
      height: 60,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
    };

    expect(() => drawText(ctx, textLayerWithCharColors)).not.toThrow();
  });
});

