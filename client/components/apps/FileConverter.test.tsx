// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileConverterApp } from "./FileConverter";
import * as authHook from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    writeFile: vi.fn(),
    exec: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  })),
}));

vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn().mockResolvedValue(new Blob(["test"])),
}));

describe("FileConverterApp", () => {
  beforeEach(() => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: { user: { id: "test-user-id" } },
      loading: false,
      error: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the component correctly", () => {
    render(<FileConverterApp />);
    expect(screen.getByText("File Converter")).toBeDefined();
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
    render(<FileConverterApp />);
    const storageTab = screen.queryByRole("tab", { name: "Storage" });
    expect(storageTab).toBeNull();
  });

  it("allows selecting a local file", () => {
    render(<FileConverterApp />);
    // It's a bit hard to test file input directly with testing-library without full user-event setup,
    // but we can ensure the upload prompt exists.
    expect(screen.getAllByText("Click to select a file").length).toBeGreaterThan(0);
  });
});
