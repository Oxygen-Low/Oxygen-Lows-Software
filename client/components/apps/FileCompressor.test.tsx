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

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user" } },
  }),
}));

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock supabase
const mockDownload = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getAuthenticatedClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
  })),
  supabase: {
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

// Mock @ffmpeg/ffmpeg and @ffmpeg/util
const mockExec = vi.fn().mockResolvedValue(0);
const mockWriteFile = vi.fn().mockResolvedValue(true);
const mockReadFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockDeleteFile = vi.fn().mockResolvedValue(true);
const mockLoad = vi.fn().mockResolvedValue(true);
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock("@ffmpeg/ffmpeg", () => {
  return {
    FFmpeg: vi.fn().mockImplementation(function (this: any) {
      this.loaded = true;
      this.load = mockLoad;
      this.exec = mockExec;
      this.writeFile = mockWriteFile;
      this.readFile = mockReadFile;
      this.deleteFile = mockDeleteFile;
      this.on = mockOn;
      this.off = mockOff;
    }),
  };
});

vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  toBlobURL: vi.fn().mockResolvedValue("blob:http://localhost/mock-core"),
}));

describe("FileCompressorApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownload.mockResolvedValue({ data: new Blob(), error: null });
    mockLoad.mockResolvedValue(true);
    mockExec.mockResolvedValue(0);
    mockWriteFile.mockResolvedValue(true);
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockDeleteFile.mockResolvedValue(true);
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
    const { container } = render(
      <ThemeProvider>
        <FileCompressorApp />
      </ThemeProvider>,
    );

    // Select a file
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Check if file name appears
    await waitFor(() => {
      expect(screen.queryAllByText("test.jpg").length).toBeGreaterThan(0);
    });

    // Start compression
    const startButtons = screen.getAllByText("Start Compression");
    fireEvent.click(startButtons[0]);

    await waitFor(
      () => {
        expect(screen.getByText("Compression Complete")).toBeDefined();
      },
      { timeout: 3000 },
    );
  });

  it("handles audio compression with FFmpeg", async () => {
    const { container } = render(
      <ThemeProvider>
        <FileCompressorApp />
      </ThemeProvider>,
    );

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["audio content"], "song.mp3", { type: "audio/mp3" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.queryAllByText("song.mp3").length).toBeGreaterThan(0);
    });

    const startButtons = screen.getAllByText("Start Compression");
    fireEvent.click(startButtons[0]);

    await waitFor(
      () => {
        expect(screen.getByText("Compression Complete")).toBeDefined();
      },
      { timeout: 3000 },
    );

    expect(mockLoad).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalled();
    expect(mockReadFile).toHaveBeenCalled();
    expect(mockDeleteFile).toHaveBeenCalled();
  });

  it("handles video compression with FFmpeg", async () => {
    const { container } = render(
      <ThemeProvider>
        <FileCompressorApp />
      </ThemeProvider>,
    );

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["video content"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.queryAllByText("clip.mp4").length).toBeGreaterThan(0);
    });

    const startButtons = screen.getAllByText("Start Compression");
    fireEvent.click(startButtons[0]);

    await waitFor(
      () => {
        expect(screen.getByText("Compression Complete")).toBeDefined();
      },
      { timeout: 3000 },
    );

    expect(mockExec).toHaveBeenCalledWith(
      expect.arrayContaining(["-vcodec", "libx264"]),
    );
  });
});
