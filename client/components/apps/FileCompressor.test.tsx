/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { FileCompressorApp } from "./FileCompressor";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Mock react-i18next

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock supabase
const mockDownload = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getAuthenticatedClient: vi.fn(() => ({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: {}, error: null })) })) })) })) })), supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "test-user" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() =>
          Promise.resolve({
            data: { theme: "default", language: "English" },
            error: null,
          }),
        ),
        then: vi.fn((cb) =>
          cb({ data: { theme: "default", language: "English" }, error: null }),
        ),
      };
      return builder;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn(() => ({
        download: mockDownload,
        remove: vi.fn().mockResolvedValue({ error: null }),
        upload: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));

// Mock StorageFileSelector
vi.mock("@/components/StorageFileSelector", () => ({
  StorageFileSelector: ({ onSelect, trigger }: any) => (
    <div
      onClick={() =>
        onSelect({
          id: "1",
          name: "test.jpg",
          metadata: { size: 1024, mimetype: "image/jpeg" },
        })
      }
    >
      {trigger}
    </div>
  ),
}));

// Mock browser-image-compression
vi.mock("browser-image-compression", () => ({
  __esModule: true,
  default: vi.fn().mockResolvedValue(new Blob([], { type: "image/jpeg" })),
}));

describe("FileCompressorApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownload.mockResolvedValue({ data: new Blob(), error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the file compressor app", () => {
    render(
      <ThemeProvider>
        <FileCompressorApp />
      </ThemeProvider>,
    );
    expect(screen.getByText("Source File")).toBeDefined();
    expect(screen.getByText("Compression Settings")).toBeDefined();
  });

  it("handles image compression", async () => {
    render(
      <ThemeProvider>
        <FileCompressorApp />
      </ThemeProvider>,
    );

    // Select a file
    const selectors = screen.getAllByText("Click to select from storage");
    fireEvent.click(selectors[0]);

    // Check if file name appears
    await waitFor(() => {
      expect(screen.queryAllByText("test.jpg").length).toBeGreaterThan(0);
    });

    // Start compression
    const startButtons = screen.getAllByText("Start Compression");
    fireEvent.click(startButtons[0]);

    await waitFor(
      () => {
        expect(screen.getByText("Success")).toBeDefined();
      },
      { timeout: 3000 },
    );
  });
});
