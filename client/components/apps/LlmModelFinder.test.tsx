/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LlmModelFinderApp } from "./LlmModelFinder";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock ResizeObserver for Radix UI
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as any;

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the ScrollArea component to avoid Radix UI issues in tests
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock the Slider component to avoid Radix UI useSize issues
vi.mock("@/components/ui/slider", () => ({
  Slider: ({ value, onValueChange, min, max }: any) => (
    <input
      type="range"
      min={min}
      max={max}
      value={value[0]}
      onChange={(e) => onValueChange([parseInt(e.target.value)])}
    />
  ),
}));

describe("LlmModelFinderApp", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the hardware config section", () => {
    render(<LlmModelFinderApp />);
    expect(screen.getByText("Hardware Config")).toBeDefined();
    expect(screen.getByText("System RAM")).toBeDefined();
    expect(screen.getByText("GPU Acceleration")).toBeDefined();
  });

  it("fetches and displays models based on hardware specs", async () => {
    const mockModels = [
      {
        id: "meta-llama/Llama-2-7b-chat-hf",
        downloads: 1000000,
        likes: 5000,
        lastModified: "2023-10-01T00:00:00Z",
        tags: ["text-generation", "conversational", "llama-2", "params:7B"],
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModels,
    });

    render(<LlmModelFinderApp />);

    const findButton = screen.getByText("Find Compatible Models");
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(screen.getByText("Llama-2-7b-chat-hf")).toBeDefined();
      expect(screen.getByText("meta-llama")).toBeDefined();
    });
  });

  it("filters out models that exceed RAM limit", async () => {
    const mockModels = [
      {
        id: "meta-llama/Llama-2-70b-chat-hf",
        downloads: 500000,
        likes: 2000,
        lastModified: "2023-10-01T00:00:00Z",
        tags: ["text-generation", "params:70B"],
      },
      {
        id: "meta-llama/Llama-2-7b-chat-hf",
        downloads: 1000000,
        likes: 5000,
        lastModified: "2023-10-01T00:00:00Z",
        tags: ["text-generation", "params:7B"],
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModels,
    });

    render(<LlmModelFinderApp />);

    const findButton = screen.getByText("Find Compatible Models");
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(screen.getByText("Llama-2-7b-chat-hf")).toBeDefined();
    });

    expect(screen.queryByText("Llama-2-70b-chat-hf")).toBeNull();
  });

  it("handles GPU mode toggle and VRAM filtering", async () => {
    const mockModels = [
      {
        id: "heavy-gpu-model",
        downloads: 100,
        likes: 10,
        lastModified: "2023-10-01T00:00:00Z",
        tags: ["text-generation", "params:40B"], // ~29GB RAM
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModels,
    });

    render(<LlmModelFinderApp />);

    // Enable GPU
    const gpuSwitch = screen.getByLabelText("GPU Acceleration");
    fireEvent.click(gpuSwitch);

    // Default VRAM is 8GB. 40B model won't fit.
    const findButton = screen.getByText("Find Compatible Models");
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(screen.queryByText("heavy-gpu-model")).toBeNull();
    });

    // Increase VRAM to 40GB
    const vramSlider = screen.getAllByRole("slider").find(s => s.getAttribute("max") === "48");
    if (vramSlider) {
       fireEvent.change(vramSlider, { target: { value: "40" } });
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModels,
    });
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(screen.getByText("heavy-gpu-model")).toBeDefined();
    });
  });

  it("filters models by search query", async () => {
    const mockModels = [
      { id: "owner/llama", downloads: 10, likes: 1, lastModified: "2023", tags: ["text-generation", "params:7B"] },
      { id: "owner/mistral", downloads: 10, likes: 1, lastModified: "2023", tags: ["text-generation", "params:7B"] }
    ];

    mockFetch.mockResolvedValue({ ok: true, json: async () => mockModels });

    render(<LlmModelFinderApp />);

    const input = screen.getByPlaceholderText("Filter by name...");
    fireEvent.change(input, { target: { value: "llama" } });

    fireEvent.click(screen.getByText("Find Compatible Models"));

    await waitFor(() => {
      expect(screen.getByText("llama")).toBeDefined();
      expect(screen.queryByText("mistral")).toBeNull();
    });
  });

  it("handles fetch errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("API Down"));

    render(<LlmModelFinderApp />);
    fireEvent.click(screen.getByText("Find Compatible Models"));

    await waitFor(() => {
      expect(screen.getByText("Search Failed")).toBeDefined();
      expect(screen.getByText("API Down")).toBeDefined();
    });
  });

  it("filters out models with unknown size (ramRequired === 0)", async () => {
    const mockModels = [
      { id: "owner/unknown", downloads: 10, likes: 1, lastModified: "2023", tags: ["text-generation"] } // No params
    ];

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModels });

    render(<LlmModelFinderApp />);
    fireEvent.click(screen.getByText("Find Compatible Models"));

    await waitFor(() => {
      expect(screen.queryByText("unknown")).toBeNull();
      expect(screen.getByText("No models found")).toBeDefined();
    });
  });
});
