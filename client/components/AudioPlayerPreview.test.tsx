// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { AudioPlayerPreview } from "./AudioPlayerPreview";

vi.mock("@/lib/supabase", () => {
  return {
    supabase: {
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://example.com/mock-audio.mp3" },
            error: null,
          }),
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: "https://example.com/mock-audio.mp3" },
          }),
          download: vi.fn().mockResolvedValue({
            data: new Blob(["audio-bytes"], { type: "audio/mpeg" }),
            error: null,
          }),
        })),
      },
    },
  };
});

describe("AudioPlayerPreview Component", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders audio player and handles mute toggle", async () => {
    render(
      <AudioPlayerPreview
        src="https://example.com/song.mp3"
        fileName="song.mp3"
      />,
    );

    const playBtn = screen.getByRole("button", { name: /Play audio/i });
    expect(playBtn).toBeDefined();

    const seekSlider = screen.getByRole("slider", { name: /Seek audio/i });
    expect(seekSlider).toBeDefined();

    const muteBtn = screen.getByRole("button", { name: /Mute/i });
    expect(muteBtn).toBeDefined();
    fireEvent.click(muteBtn);
    expect(screen.getByRole("button", { name: /Unmute/i })).toBeDefined();
  });

  it("resolves from filePath when src is not provided", async () => {
    render(
      <AudioPlayerPreview filePath="user-123/my-song.mp3" bucket="Storage" />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Play audio/i })).toBeDefined();
    });
  });
});
