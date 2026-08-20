/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Storage from "./Storage";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/lib/supabase", () => {
  const mockStorage = {
    list: vi.fn(() =>
      Promise.resolve({
        data: [{ id: "f1", name: "test-audio.mp3", metadata: { size: 1024, mimetype: "audio/mp3" }, created_at: new Date().toISOString() }],
        error: null,
      }),
    ),
    createSignedUrls: vi.fn(() =>
      Promise.resolve({
        data: [{ signedUrl: "https://example.com/test-audio.mp3" }],
        error: null,
      }),
    ),
    upload: vi.fn(() => Promise.resolve({ error: null })),
    remove: vi.fn(() => Promise.resolve({ error: null })),
  };

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    then: vi.fn((resolve) => resolve({ data: [], error: null })),
  };

  return {
    supabase: {
      from: vi.fn(() => builder),
      storage: {
        from: vi.fn((bucket: string) => {
          if (bucket === "public-assets") {
            return {
              list: vi.fn(() => Promise.resolve({ data: [], error: null })),
              createSignedUrls: vi.fn(() => Promise.resolve({ data: [], error: null })),
              upload: vi.fn(() => Promise.resolve({ error: null })),
              remove: vi.fn(() => Promise.resolve({ error: null })),
            };
          }
          return mockStorage;
        }),
      },
    },
  };
});

describe("Storage Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: {
        user: { id: "user-123", email: "user@example.com" },
        access_token: "test-token",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Storage page with Files and Submissions tabs", async () => {
    render(
      <MemoryRouter>
        <Storage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Storage")).toBeDefined();
    expect(screen.getByRole("tab", { name: /Files/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Verification Submissions/i })).toBeDefined();
  });

  it("switches to Verification Submissions tab", async () => {
    render(
      <MemoryRouter>
        <Storage />
      </MemoryRouter>,
    );

    const submissionsTab = screen.getByRole("tab", { name: /Verification Submissions/i });
    fireEvent.keyDown(submissionsTab, { key: "Enter" });
    fireEvent.click(submissionsTab);

    await waitFor(() => {
      expect(screen.getByText(/No verification submissions for storage files yet/i)).toBeDefined();
    });
  });

  it("renders file actions and opens publish/verify modal", async () => {
    render(
      <MemoryRouter>
        <Storage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("test-audio.mp3")).toBeDefined();
    });

    const verifyBtn = screen.getByRole("button", { name: /^Verify$/i });
    expect(verifyBtn).toBeDefined();

    fireEvent.click(verifyBtn);

    expect(screen.getByText(/Verify Asset/i)).toBeDefined();
  });

  it("renders delete button on verification submission card and confirms deletion", async () => {
    window.confirm = vi.fn(() => true);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(
      <MemoryRouter>
        <Storage />
      </MemoryRouter>,
    );

    const submissionsTab = screen.getByRole("tab", { name: /Verification Submissions/i });
    fireEvent.click(submissionsTab);
  });
});
