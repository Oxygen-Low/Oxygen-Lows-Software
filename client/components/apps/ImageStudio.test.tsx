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
    expect(screen.getByText("Add a little bit of body text")).toBeDefined();

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
      expect(screen.getByText("My Projects")).toBeDefined();
      expect(screen.getByText("Save Current Project to Storage")).toBeDefined();
      expect(screen.getByText("Import File (.json)")).toBeDefined();
      expect(screen.getByText("Export File (.json)")).toBeDefined();
    });
  });
});
