/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import UserProfile from "./UserProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        or: vi.fn(() => builder),
        single: vi.fn(() => {
          if (table === "profiles") {
            return Promise.resolve({
              data: {
                user_id: "user-123",
                username: "testuser",
                display_name: "Test User",
                bio: "Hello world",
                show_email: false,
                email: "test@example.com",
                language: "English",
              },
              error: null,
            });
          }
          if (table === "user_preferences") {
            return Promise.resolve({
              data: { profile_picture_path: null },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };
      return builder;
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "" } }),
      })),
    },
  },
}));

vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

describe("UserProfile Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "user-123", email: "test@example.com" } },
      loading: false,
    });
  });

  it("renders user profile with public language and flag", async () => {
    render(
      <MemoryRouter initialEntries={["/users/testuser"]}>
        <Routes>
          <Route path="/users/:username" element={<UserProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeDefined();
      expect(screen.getByText("@testuser")).toBeDefined();
      expect(screen.getByText("English")).toBeDefined();
      expect(screen.getByText("🇬🇧")).toBeDefined();
    });
  });
});
