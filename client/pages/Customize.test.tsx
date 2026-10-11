/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import Customize from "./Customize";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockSetTrackVolume = vi.fn();
const mockSetPlaylistSessionVolume = vi.fn();
const mockMoveTrack = vi.fn();
const mockRemoveTrack = vi.fn();
const mockPlayTrack = vi.fn();
const mockClearPlaylist = vi.fn();
const mockAddTracks = vi.fn();
const mockSetTrackBackground = vi.fn();
const mockRemoveTrackBackground = vi.fn();
const mockGetTrackBackgroundUrl = vi.fn((track: any) =>
  track?.fileName === "alpha.mp3" ? "/api/storage/track-backgrounds/file/songbg-alpha.webp" : null
);
const mockGetTrackBackgroundSource = vi.fn((track: any) =>
  track?.fileName === "alpha.mp3" ? "images/custom-bg.png" : null
);

const mockMusicContext = {
  playlist: [
    { name: "Track Alpha", fileName: "alpha.mp3", volume: 0.75 },
    { name: "Track Beta", fileName: "beta.mp3" }, // default undefined volume -> 1.0 (100%)
  ],
  currentTrack: { name: "Track Alpha", fileName: "alpha.mp3", volume: 0.75 },
  isPlaying: true,
  play: vi.fn(),
  pause: vi.fn(),
  addTrack: vi.fn(),
  addTracks: mockAddTracks,
  removeTrack: mockRemoveTrack,
  moveTrack: mockMoveTrack,
  clearPlaylist: mockClearPlaylist,
  playTrack: mockPlayTrack,
  shuffle: false,
  toggleShuffle: vi.fn(),
  loop: false,
  toggleLoop: vi.fn(),
  volume: 1,
  playlistSessionVolume: 1,
  setPlaylistSessionVolume: mockSetPlaylistSessionVolume,
  setTrackVolume: mockSetTrackVolume,
  trackBackgrounds: {
    "alpha.mp3": { file: "songbg-alpha.webp", source: "images/custom-bg.png" },
  },
  currentBackgroundUrl: "/api/storage/track-backgrounds/file/songbg-alpha.webp",
  getTrackBackgroundUrl: mockGetTrackBackgroundUrl,
  getTrackBackgroundSource: mockGetTrackBackgroundSource,
  setTrackBackground: mockSetTrackBackground,
  removeTrackBackground: mockRemoveTrackBackground,
  refreshTrackBackgrounds: vi.fn(),
};

vi.mock("@/contexts/MusicContext", () => ({
  useMusicContext: () => mockMusicContext,
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock("@/components/MusicPlayer", () => ({
  MusicPlayer: () => <div data-testid="mock-music-player" />,
}));

vi.mock("@/components/StorageFileSelector", () => ({
  StorageFileSelector: ({ trigger, onSelect }: any) => (
    <div
      data-testid="mock-storage-file-selector"
      onClick={() => onSelect && onSelect({ name: "images/new-bg.png" })}
    >
      {trigger || <button>Select file</button>}
    </div>
  ),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "default",
    setTheme: vi.fn(),
    font: "font-zilla",
    setFont: vi.fn(),
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (_k: string, _o?: any, fallback?: string) => fallback || _k,
  }),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-123" } } }),
}));

const mockStorageList = vi.fn();
vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn(() => ({
      list: mockStorageList,
      download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
    })),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe("Customize page playlist individual track volume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a volume button on each playlist track row", () => {
    render(<Customize />);

    const volumeButtons = screen.getAllByRole("button", { name: "Track Volume" });
    expect(volumeButtons).toHaveLength(2);
  });

  it("opens the track volume popover, displays percentage, and handles resetting to 100%", async () => {
    render(<Customize />);

    const volumeButtons = screen.getAllByRole("button", { name: "Track Volume" });
    // Click volume button for Track Alpha (volume: 0.75)
    fireEvent.click(volumeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("75%")).not.toBeNull();
    });

    const resetButton = screen.getByRole("button", { name: "Reset to 100%" });
    expect(resetButton).not.toBeNull();
    expect(resetButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(resetButton);
    expect(mockSetTrackVolume).toHaveBeenCalledWith(0, 1);
  });

  it("disables the Reset button when track volume is already 100%", async () => {
    render(<Customize />);

    const volumeButtons = screen.getAllByRole("button", { name: "Track Volume" });
    // Click volume button for Track Beta (volume undefined -> 100%)
    fireEvent.click(volumeButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
    });

    const resetButton = screen.getByRole("button", { name: "Reset to 100%" });
    expect(resetButton.hasAttribute("disabled")).toBe(true);
  });

  it("renders track background buttons for configured and unconfigured tracks", () => {
    render(<Customize />);

    // Track Alpha has a background configured
    const alphaBgBtn = screen.getByRole("button", { name: "Track Background" });
    expect(alphaBgBtn).not.toBeNull();

    // Track Beta does not have a background configured
    const betaBgBtn = screen.getByRole("button", { name: "Set Background" });
    expect(betaBgBtn).not.toBeNull();
  });

  it("opens the background popover and allows removing background", async () => {
    render(<Customize />);

    const alphaBgBtn = screen.getByRole("button", { name: "Track Background" });
    fireEvent.click(alphaBgBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Remove Background/i })).not.toBeNull();
    });

    const removeBtn = screen.getByRole("button", { name: /Remove Background/i });
    fireEvent.click(removeBtn);

    expect(mockRemoveTrackBackground).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "alpha.mp3" }),
    );
  });

  it("does not render session volume control on customize page", () => {
    render(<Customize />);
    expect(screen.queryByText("Session Playlist Volume")).toBeNull();
  });

  it("renders Add All Audio Files buttons on the customize page", () => {
    render(<Customize />);
    const addAllButtons = screen.getAllByRole("button", { name: "Add All Audio Files" });
    expect(addAllButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("adds all audio files found in storage with a single button press", async () => {
    mockStorageList.mockImplementation((path: string) => {
      if (path === "user-123") {
        return Promise.resolve({
          data: [
            { id: "1", name: "song1.mp3", metadata: { mimetype: "audio/mpeg" } },
            { id: "2", name: "song2.wav", metadata: { mimetype: "audio/wav" } },
            { id: null, name: "music-folder", metadata: { mimetype: "" } }, // folder
          ],
          error: null,
        });
      }
      if (path === "user-123/music-folder") {
        return Promise.resolve({
          data: [
            { id: "3", name: "song3.ogg", metadata: { mimetype: "audio/ogg" } },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    render(<Customize />);
    const addAllButtons = screen.getAllByRole("button", { name: "Add All Audio Files" });
    fireEvent.click(addAllButtons[0]);

    await waitFor(() => {
      expect(mockAddTracks).toHaveBeenCalledWith([
        { id: "1", name: "song1", fileName: "user-123/song1.mp3" },
        { id: "2", name: "song2", fileName: "user-123/song2.wav" },
        { id: "3", name: "song3", fileName: "user-123/music-folder/song3.ogg" },
      ]);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Success",
        description: "Added 3 track(s) to playlist",
      }),
    );
  });

  it("shows an info toast if no audio files are found in storage", async () => {
    mockStorageList.mockResolvedValue({
      data: [
        { id: "doc1", name: "document.pdf", metadata: { mimetype: "application/pdf" } },
      ],
      error: null,
    });

    render(<Customize />);
    const addAllButtons = screen.getAllByRole("button", { name: "Add All Audio Files" });
    fireEvent.click(addAllButtons[0]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Info",
          description: "No audio files found in storage",
        }),
      );
    });
    expect(mockAddTracks).not.toHaveBeenCalled();
  });

  it("shows an info toast if all audio files are already in the playlist", async () => {
    mockStorageList.mockResolvedValue({
      data: [
        { id: "alpha-id", name: "alpha.mp3", metadata: { mimetype: "audio/mpeg" } },
      ],
      error: null,
    });

    render(<Customize />);
    const addAllButtons = screen.getAllByRole("button", { name: "Add All Audio Files" });
    fireEvent.click(addAllButtons[0]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Info",
          description: "All audio files are already in the playlist",
        }),
      );
    });
    expect(mockAddTracks).not.toHaveBeenCalled();
  });
});
