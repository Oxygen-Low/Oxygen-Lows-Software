/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PublicAssetsApp } from "./PublicAssets";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase, db } from "@/lib/db";

const mockToast = vi.fn();

vi.mock("@/lib/db", () => {
  const mockStorageFrom = {
    list: vi.fn(() =>
      Promise.resolve({
        data: [{ id: "f1", name: "audio.mp3", metadata: { size: 1024 } }],
        error: null,
      }),
    ),
    createSignedUrl: vi.fn((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://example.com/${path}` },
        error: null,
      }),
    ),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://public.example.com/${path}` },
    })),
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

  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === "public_assets") {
        return {
          select: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: "asset-3d",
                  uploader_id: "u123",
                  name: "mech.glb",
                  display_name: "Battle Mech",
                  category: "model",
                  description: "Futuristic robot model",
                  file_path: "models/mech.glb",
                  file_size: 4096,
                  mime_type: "model/gltf-binary",
                  downloads: 5,
                  created_at: new Date().toISOString(),
                  likes_count: 2,
                  is_liked_by_user: false,
                },
              ],
              error: null,
            }),
          ),
        };
      }
      return builder;
    }),
    storage: {
      from: vi.fn(() => mockStorageFrom),
    },
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };

  return {
    db: mockClient,
    supabase: mockClient,
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
      session: {
        user: { id: "u123", email: "user@example.com" },
        access_token: "mock-token",
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
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
    expect(
      screen.getByRole("button", { name: /Publish Asset/i }),
    ).toBeDefined();
  });

  it("switches to Files tab and Submissions tab smoothly", async () => {
    render(
      <MemoryRouter>
        <PublicAssetsApp />
      </MemoryRouter>,
    );

    const filesTab = screen.getByRole("tab", { name: "Files" });
    fireEvent.keyDown(filesTab, { key: "Enter" });
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

  it("renders 3D model file assets in Files tab and opens details dialog", async () => {
    render(
      <MemoryRouter>
        <PublicAssetsApp />
      </MemoryRouter>,
    );

    const filesTab = screen.getByRole("tab", { name: "Files" });
    fireEvent.keyDown(filesTab, { key: "Enter" });
    fireEvent.click(filesTab);

    await waitFor(() => {
      expect(screen.getByText("Battle Mech")).toBeDefined();
    });

    const card = screen.getByText("Battle Mech");
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getAllByText("Futuristic robot model").length).toBeGreaterThanOrEqual(2);
    });
  });
});
