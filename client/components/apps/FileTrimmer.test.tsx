// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileTrimmerApp } from "./FileTrimmer";
import * as authHook from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");

const {
  mockExec,
  mockWriteFile,
  mockReadFile,
  mockDeleteFile,
  mockLoad,
  mockOn,
  mockOff,
} = vi.hoisted(() => ({
  mockExec: vi.fn().mockResolvedValue(0),
  mockWriteFile: vi.fn().mockResolvedValue(true),
  mockReadFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  mockDeleteFile: vi.fn().mockResolvedValue(true),
  mockLoad: vi.fn().mockResolvedValue(true),
  mockOn: vi.fn(),
  mockOff: vi.fn(),
}));

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

describe("FileTrimmerApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: { user: { id: "test-user-id" } },
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);

    // Mock URL.createObjectURL and URL.revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the component correctly for authenticated user", () => {
    render(<FileTrimmerApp />);
    expect(screen.getByText("File Trimmer")).toBeDefined();
    expect(screen.getByText("Local Device")).toBeDefined();
    expect(screen.getByText("Storage")).toBeDefined();
  });

  it("does not show Storage tab for unauthenticated users", () => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: null,
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);
    render(<FileTrimmerApp />);
    const storageTab = screen.queryByRole("tab", { name: "Storage" });
    expect(storageTab).toBeNull();
  });

  it("allows selecting a local video file and displays trimming controls", async () => {
    render(<FileTrimmerApp />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const mockFile = new File(["dummy video"], "test_video.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    expect(await screen.findByText("test_video.mp4")).toBeDefined();
    expect(screen.getByText(/Trim Interval/i)).toBeDefined();
    expect(screen.getByText("Start Time (seconds)")).toBeDefined();
    expect(screen.getByText("End Time (seconds)")).toBeDefined();
    expect(screen.getByText("Trim File (00:00.0)")).toBeDefined();
  });

  it("allows setting start and end time and executes trimming", async () => {
    render(<FileTrimmerApp />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const mockFile = new File(["dummy audio"], "track.mp3", { type: "audio/mp3" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    expect(await screen.findByText("track.mp3")).toBeDefined();

    const startInput = screen.getByLabelText("Start Time (seconds)");
    const endInput = screen.getByLabelText("End Time (seconds)");

    fireEvent.change(startInput, { target: { value: "2.5" } });
    fireEvent.change(endInput, { target: { value: "10.0" } });

    const trimButton = screen.getByRole("button", { name: /Trim File/i });
    expect(trimButton).toBeDefined();
    fireEvent.click(trimButton);

    await waitFor(() => {
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    expect(await screen.findByText("Trimming Complete")).toBeDefined();
    expect(screen.getByText("Download Trimmed File")).toBeDefined();
    expect(screen.getByText("Trim Another")).toBeDefined();
  });

  it("clears file when reset button is clicked", async () => {
    render(<FileTrimmerApp />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const mockFile = new File(["dummy video"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    expect(await screen.findByText("clip.mp4")).toBeDefined();

    const removeButton = screen.getByLabelText("Remove file");
    fireEvent.click(removeButton);

    expect(screen.queryByText("clip.mp4")).toBeNull();
    expect(screen.getByText("Local Device")).toBeDefined();
  });
});
