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
global.ResizeObserver = MockResizeObserver;

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
    expect(screen.getByText("CPU Cores")).toBeDefined();
    expect(screen.getByText("GPU Acceleration")).toBeDefined();
  });

  it("fetches and displays models based on hardware specs", async () => {
    const mockModels = [
      {
        id: "meta-llama/Llama-2-7b-chat-hf",
        downloads: 1000000,
        likes: 5000,
        lastModified: "2023-10-01T00:00:00Z",
        tags: ["text-generation", "conversational", "llama-2"],
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

    // 70B model should be estimated at 70*0.7 + 1 = 50GB RAM.
    // Default system RAM in component state is 16GB.
    expect(screen.queryByText("Llama-2-70b-chat-hf")).toBeNull();
  });
});
