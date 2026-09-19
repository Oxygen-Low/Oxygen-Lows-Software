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
const mockMoveTrack = vi.fn();
const mockRemoveTrack = vi.fn();
const mockPlayTrack = vi.fn();
const mockClearPlaylist = vi.fn();

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
  removeTrack: mockRemoveTrack,
  moveTrack: mockMoveTrack,
  clearPlaylist: mockClearPlaylist,
  playTrack: mockPlayTrack,
  shuffle: false,
  toggleShuffle: vi.fn(),
  loop: false,
  toggleLoop: vi.fn(),
  setTrackVolume: mockSetTrackVolume,
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
  StorageFileSelector: () => <div data-testid="mock-storage-file-selector" />,
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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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
      expect(screen.getByText("100%")).not.toBeNull();
    });

    const resetButton = screen.getByRole("button", { name: "Reset to 100%" });
    expect(resetButton.hasAttribute("disabled")).toBe(true);
  });
});
