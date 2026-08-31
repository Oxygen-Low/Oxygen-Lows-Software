/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import React from "react";
import { MusicPlayer } from "./MusicPlayer";
import { SidebarMusicPlayer } from "./SidebarMusicPlayer";
import { MusicProvider, useMusicContext } from "@/contexts/MusicContext";

const mockUseMusic = vi.fn();

vi.mock("@/hooks/useMusic", () => ({
  useMusic: () => mockUseMusic(),
}));

const mockCreateSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: "https://example.com/audio.mp3" },
  error: null,
});

const mockSupabase = {
  from: vi.fn((_table?: string) => ({}) as any),
};

vi.mock("@/lib/db", () => ({
  db: {
    from: (table: string) => mockSupabase.from(table),
  },
  supabase: {
    from: (table: string) => mockSupabase.from(table),
  },
}));

vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn((_bucket?: string) => ({
      createSignedUrl: mockCreateSignedUrl,
    })),
  },
  customStorage: {
    from: vi.fn((_bucket?: string) => ({
      createSignedUrl: mockCreateSignedUrl,
    })),
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
    const { loop, toggleLoop, currentTrack } = useMusicContext();
    return (
      <div>
        <span data-testid="loop-state">{loop ? "loop-on" : "loop-off"}</span>
        <span data-testid="track-state">{currentTrack?.name || "none"}</span>
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
      expect(document.querySelector("audio")?.loop).toBe(true);
    });

    fireEvent.click(screen.getByTestId("toggle-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("loop-state").textContent).toBe("loop-off");
      expect(document.querySelector("audio")?.loop).toBe(false);
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

describe("MusicContext 10-second auto-resume after exit/refresh", () => {
  let mockSelect: any;
  const playMock = vi.fn().mockResolvedValue(undefined);
  const pauseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    window.HTMLMediaElement.prototype.play = playMock;
    window.HTMLMediaElement.prototype.pause = pauseMock;

    mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            music_playlist: [
              { name: "Song 1", fileName: "song1.mp3" },
              { name: "Song 2", fileName: "song2.mp3" },
            ],
            current_music_track: "song1.mp3",
            current_music_position: 12000,
            shuffle_enabled: false,
            loop_enabled: false,
          },
          error: null,
        }),
      })),
    }));

    mockSupabase.from = vi.fn((table?: string) => {
      if (table === "user_preferences") {
        return {
          select: mockSelect,
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const AutoResumeConsumer = () => {
    const { isPlaying, currentPosition, currentTrack, pause, play } =
      useMusicContext();
    return (
      <div>
        <span data-testid="is-playing">{isPlaying ? "playing" : "paused"}</span>
        <span data-testid="current-pos">{currentPosition}</span>
        <span data-testid="track-name">{currentTrack?.name || "none"}</span>
        <button data-testid="pause-btn" onClick={pause}>
          Pause
        </button>
        <button data-testid="play-btn" onClick={play}>
          Play
        </button>
      </div>
    );
  };

  it("automatically starts music again if exited/refreshed within 10 seconds while playing", async () => {
    // Simulate exit 3 seconds ago while playing at position 15000ms
    const exitTimestamp = Date.now() - 3000;
    localStorage.setItem(
      "oxygen_music_exit_state",
      JSON.stringify({
        isPlaying: true,
        timestamp: exitTimestamp,
        trackFileName: "song1.mp3",
        position: 15000,
      }),
    );

    render(
      <MusicProvider>
        <AutoResumeConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-playing").textContent).toBe("playing");
      expect(screen.getByTestId("current-pos").textContent).toBe("15000");
    });

    expect(playMock).toHaveBeenCalled();
  });

  it("does NOT automatically start music if returning after more than 10 seconds", async () => {
    // Simulate exit 15 seconds ago (> 10s) while playing
    const exitTimestamp = Date.now() - 15000;
    localStorage.setItem(
      "oxygen_music_exit_state",
      JSON.stringify({
        isPlaying: true,
        timestamp: exitTimestamp,
        trackFileName: "song1.mp3",
        position: 15000,
      }),
    );

    render(
      <MusicProvider>
        <AutoResumeConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("track-name").textContent).toBe("Song 1");
    });

    expect(screen.getByTestId("is-playing").textContent).toBe("paused");
    expect(playMock).not.toHaveBeenCalled();
  });

  it("does NOT automatically start music if music was paused before exit", async () => {
    // Simulate exit 2 seconds ago, but music was paused
    const exitTimestamp = Date.now() - 2000;
    localStorage.setItem(
      "oxygen_music_exit_state",
      JSON.stringify({
        isPlaying: false,
        timestamp: exitTimestamp,
        trackFileName: "song1.mp3",
        position: 15000,
      }),
    );

    render(
      <MusicProvider>
        <AutoResumeConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("track-name").textContent).toBe("Song 1");
    });

    expect(screen.getByTestId("is-playing").textContent).toBe("paused");
    expect(playMock).not.toHaveBeenCalled();
  });

  it("records exit state to localStorage when beforeunload event fires", async () => {
    // Start with auto-resume active so isPlaying becomes true
    const exitTimestamp = Date.now() - 2000;
    localStorage.setItem(
      "oxygen_music_exit_state",
      JSON.stringify({
        isPlaying: true,
        timestamp: exitTimestamp,
        trackFileName: "song1.mp3",
        position: 12000,
      }),
    );

    render(
      <MusicProvider>
        <AutoResumeConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-playing").textContent).toBe("playing");
    });

    // Fire beforeunload
    fireEvent(window, new Event("beforeunload"));

    const stored = JSON.parse(
      localStorage.getItem("oxygen_music_exit_state") || "{}",
    );
    expect(stored.isPlaying).toBe(true);
    expect(stored.trackFileName).toBe("song1.mp3");
    expect(typeof stored.timestamp).toBe("number");
  });

  it("updates localStorage with isPlaying: false when paused", async () => {
    const exitTimestamp = Date.now() - 2000;
    localStorage.setItem(
      "oxygen_music_exit_state",
      JSON.stringify({
        isPlaying: true,
        timestamp: exitTimestamp,
        trackFileName: "song1.mp3",
        position: 12000,
      }),
    );

    render(
      <MusicProvider>
        <AutoResumeConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-playing").textContent).toBe("playing");
    });

    fireEvent.click(screen.getByTestId("pause-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("is-playing").textContent).toBe("paused");
    });

    const stored = JSON.parse(
      localStorage.getItem("oxygen_music_exit_state") || "{}",
    );
    expect(stored.isPlaying).toBe(false);
  });
});

describe("MusicContext storage path sanitization", () => {
  function PathTestConsumer({ track }: { track: any }) {
    const { playTrack } = useMusicContext();
    return (
      <button data-testid="play-track-btn" onClick={() => playTrack(track)}>
        Play
      </button>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        })),
      })),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("recursively sanitizes nested and spliced path traversal sequences", async () => {
    render(
      <MusicProvider>
        <PathTestConsumer
          track={{
            name: "Traversed Track",
            fileName: "....//....//nested/song.mp3",
          }}
        />
      </MusicProvider>,
    );

    fireEvent.click(screen.getByTestId("play-track-btn"));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "test-user-id/nested/song.mp3",
        3600,
      );
    });
  });

  it("correctly resolves tracks that have a Supabase UUID prefix without duplicating user id", async () => {
    render(
      <MusicProvider>
        <PathTestConsumer
          track={{
            name: "Test Song",
            fileName: "3cb76293-8c6c-49b9-b431-1ff5fce471ee/testsong.mp3",
          }}
        />
      </MusicProvider>,
    );

    fireEvent.click(screen.getByTestId("play-track-btn"));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "test-user-id/testsong.mp3",
        3600,
      );
    });
  });

  it("strips nested UUID prefix if already prepended with current user id", async () => {
    render(
      <MusicProvider>
        <PathTestConsumer
          track={{
            name: "Test Song",
            fileName:
              "test-user-id/3cb76293-8c6c-49b9-b431-1ff5fce471ee/testsong.mp3",
          }}
        />
      </MusicProvider>,
    );

    fireEvent.click(screen.getByTestId("play-track-btn"));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "test-user-id/testsong.mp3",
        3600,
      );
    });
  });
});

describe("MusicContext playlist management and playback features", () => {
  let mockUpsert: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              music_playlist: [
                { name: "Song A", fileName: "songA.mp3" },
                { name: "Song B", fileName: "songB.mp3" },
                { name: "Song C", fileName: "songC.mp3" },
              ],
              current_music_track: "songA.mp3",
              current_music_position: 0,
              shuffle_enabled: false,
              loop_enabled: false,
            },
            error: null,
          }),
        })),
      })),
      upsert: mockUpsert,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  const PlaylistConsumer = () => {
    const {
      playlist,
      currentTrack,
      currentPosition,
      seek,
      volume,
      isMuted,
      setVolume,
      toggleMute,
      moveTrack,
      clearPlaylist,
      playNext,
      playPrev,
    } = useMusicContext();

    return (
      <div>
        <span data-testid="track-count">{playlist.length}</span>
        <span data-testid="current-track">{currentTrack?.name || "none"}</span>
        <span data-testid="position">{currentPosition}</span>
        <span data-testid="volume">{volume}</span>
        <span data-testid="muted">{isMuted ? "muted" : "unmuted"}</span>
        <div data-testid="playlist-order">
          {playlist.map((t) => t.name).join(",")}
        </div>
        <button data-testid="seek-btn" onClick={() => seek(30000)}>
          Seek
        </button>
        <button data-testid="volume-btn" onClick={() => setVolume(0.5)}>
          Set Volume
        </button>
        <button data-testid="mute-btn" onClick={toggleMute}>
          Toggle Mute
        </button>
        <button data-testid="move-btn" onClick={() => moveTrack(0, 2)}>
          Move Track
        </button>
        <button data-testid="clear-btn" onClick={clearPlaylist}>
          Clear Playlist
        </button>
        <button data-testid="next-btn" onClick={() => playNext()}>
          Next
        </button>
        <button data-testid="prev-btn" onClick={() => playPrev()}>
          Prev
        </button>
      </div>
    );
  };

  it("allows seeking to a specific position", async () => {
    render(
      <MusicProvider>
        <PlaylistConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-track").textContent).toBe("Song A");
    });

    fireEvent.click(screen.getByTestId("seek-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("position").textContent).toBe("30000");
    });
  });

  it("handles volume adjustments and mute toggling", async () => {
    render(
      <MusicProvider>
        <PlaylistConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("volume").textContent).toBe("1");
    });

    fireEvent.click(screen.getByTestId("volume-btn"));
    expect(screen.getByTestId("volume").textContent).toBe("0.5");

    fireEvent.click(screen.getByTestId("mute-btn"));
    expect(screen.getByTestId("muted").textContent).toBe("muted");
  });

  it("allows reordering tracks with moveTrack and clearing the playlist", async () => {
    render(
      <MusicProvider>
        <PlaylistConsumer />
      </MusicProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("playlist-order").textContent).toBe(
        "Song A,Song B,Song C",
      );
    });

    fireEvent.click(screen.getByTestId("move-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("playlist-order").textContent).toBe(
        "Song B,Song C,Song A",
      );
    });

    fireEvent.click(screen.getByTestId("clear-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("track-count").textContent).toBe("0");
      expect(screen.getByTestId("current-track").textContent).toBe("none");
    });
  });
});
