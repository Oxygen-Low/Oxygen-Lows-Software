/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PublicAssetsApp } from "./PublicAssets";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const mockToast = vi.fn();

vi.mock("@/lib/supabase", () => {
  const mockStorageFrom = {
    list: vi.fn(() => Promise.resolve({ data: [{ id: "f1", name: "audio.mp3", metadata: { size: 1024 } }], error: null })),
    createSignedUrl: vi.fn((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://example.com/${path}` }, error: null }),
    ),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://public.example.com/${path}` } })),
  };

  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
  };

  builder.then = vi.fn((resolve) => resolve({ data: [], error: null }));

  return {
    supabase: {
      from: vi.fn(() => builder),
      storage: {
        from: vi.fn(() => mockStorageFrom),
      },
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("PublicAssetsApp Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u123", email: "user@example.com" }, access_token: "mock-token" },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders tabs for Characters, Universes, Files, and My Submissions", async () => {
    render(
      <MemoryRouter>
        <PublicAssetsApp />
      </MemoryRouter>,
    );

    expect(screen.getByRole("tab", { name: "Characters" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Universes" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Files" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "My Submissions" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Publish Asset/i })).toBeDefined();
  });

  it("switches to Files tab and Submissions tab smoothly", async () => {
    render(
      <MemoryRouter>
        <PublicAssetsApp />
      </MemoryRouter>,
    );

    const filesTab = screen.getByRole("tab", { name: "Files" });
    fireEvent.click(filesTab);

    const submissionsTab = screen.getByRole("tab", { name: "My Submissions" });
    fireEvent.click(submissionsTab);

    expect(screen.getByText(/My Submissions/i)).toBeDefined();
  });

  it("opens publish modal when clicking Publish Asset", async () => {
    render(
      <MemoryRouter>
        <PublicAssetsApp />
      </MemoryRouter>,
    );

    const publishBtn = screen.getByRole("button", { name: /Publish Asset/i });
    fireEvent.click(publishBtn);

    expect(screen.getByText("Publish to Public Assets")).toBeDefined();
  });
});
