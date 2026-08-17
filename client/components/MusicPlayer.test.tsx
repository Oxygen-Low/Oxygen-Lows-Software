/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { MusicPlayer } from "./MusicPlayer";
import { SidebarMusicPlayer } from "./SidebarMusicPlayer";
import { MusicProvider, useMusicContext } from "@/contexts/MusicContext";

const mockUseMusic = vi.fn();

vi.mock("@/hooks/useMusic", () => ({
  useMusic: () => mockUseMusic(),
}));

const mockSupabase = {
  from: vi.fn((_table?: string) => ({} as any)),
  storage: {
    from: vi.fn((_bucket?: string) => ({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/audio.mp3" },
        error: null,
      }),
    })),
  },
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => mockSupabase.from(table),
    storage: {
      from: (bucket: string) => mockSupabase.storage.from(bucket),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-id" } },
  }),
}));

describe("MusicPlayer & SidebarMusicPlayer components", () => {
  const defaultContext = {
    currentTrack: { name: "Test Song", fileName: "test.mp3" },
    currentPosition: 15000,
    isPlaying: true,
    shuffle: false,
    loop: false,
    audioRef: { current: { duration: 180 } },
    play: vi.fn(),
    pause: vi.fn(),
    playNext: vi.fn(),
    playPrev: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleLoop: vi.fn(),
    playlist: [{ name: "Test Song", fileName: "test.mp3" }],
    playTrack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMusic.mockReturnValue(defaultContext);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loop button and triggers toggleLoop in MusicPlayer", () => {
    render(<MusicPlayer />);

    const loopButton = screen.getByTitle("Toggle loop");
    expect(loopButton).not.toBeNull();
    expect(loopButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(loopButton);
    expect(defaultContext.toggleLoop).toHaveBeenCalledWith(true);
  });

  it("renders active loop button in MusicPlayer when loop is true", () => {
    mockUseMusic.mockReturnValue({
      ...defaultContext,
      loop: true,
    });

    render(<MusicPlayer />);

    const loopButton = screen.getByTitle("Toggle loop");
    expect(loopButton).not.toBeNull();
    expect(loopButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(loopButton);
    expect(defaultContext.toggleLoop).toHaveBeenCalledWith(false);
  });

  it("renders loop button and triggers toggleLoop in SidebarMusicPlayer", () => {
    render(<SidebarMusicPlayer />);

    const loopButton = screen.getByTitle("Toggle loop");
    expect(loopButton).not.toBeNull();
    expect(loopButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(loopButton);
    expect(defaultContext.toggleLoop).toHaveBeenCalledWith(true);
  });

  it("renders active loop button in SidebarMusicPlayer when loop is true", () => {
    mockUseMusic.mockReturnValue({
      ...defaultContext,
      loop: true,
    });

    render(<SidebarMusicPlayer />);

    const loopButton = screen.getByTitle("Toggle loop");
    expect(loopButton).not.toBeNull();
    expect(loopButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(loopButton);
    expect(defaultContext.toggleLoop).toHaveBeenCalledWith(false);
  });
});

describe("MusicContext loop integration", () => {
  let mockUpsert: any;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            music_playlist: [
              { name: "Song 1", fileName: "song1.mp3" },
              { name: "Song 2", fileName: "song2.mp3" },
            ],
            current_music_track: "song1.mp3",
            current_music_position: 0,
            shuffle_enabled: false,
            loop_enabled: true,
          },
          error: null,
        }),
      })),
    }));

    mockSupabase.from = vi.fn((table?: string) => {
      if (table === "user_preferences") {
        return {
          select: mockSelect,
          upsert: mockUpsert,
        };
      }
      return {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  const TestConsumer = () => {
    const { loop, toggleLoop, currentTrack, audioRef } = useMusicContext();
    return (
      <div>
        <span data-testid="loop-state">{loop ? "loop-on" : "loop-off"}</span>
        <span data-testid="track-state">{currentTrack?.name || "none"}</span>
        <span data-testid="audio-loop">{audioRef.current?.loop ? "audio-loop-on" : "audio-loop-off"}</span>
        <button data-testid="toggle-btn" onClick={() => toggleLoop(!loop)}>
          Toggle Loop
        </button>
      </div>
    );
  };

  it("loads loop_enabled preference from database and toggles it", async () => {
    render(
      <MusicProvider>
        <TestConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loop-state").textContent).toBe("loop-on");
      expect(screen.getByTestId("audio-loop").textContent).toBe("audio-loop-on");
    });

    fireEvent.click(screen.getByTestId("toggle-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("loop-state").textContent).toBe("loop-off");
      expect(screen.getByTestId("audio-loop").textContent).toBe("audio-loop-off");
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "test-user-id",
        loop_enabled: false,
      }),
      { onConflict: "user_id" },
    );
  });
});
