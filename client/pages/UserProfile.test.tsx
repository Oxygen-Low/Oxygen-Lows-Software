/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import UserProfile from "./UserProfile";
import { useAuth } from "@/hooks/useAuth";

let mockProfileData: any = {
  user_id: "user-123",
  username: "testuser",
  display_name: "Test User",
  bio: "Hello world",
  show_email: false,
  email: "test@example.com",
  language: "English",
  additional_languages: [],
};

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
              data: mockProfileData,
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
    mockProfileData = {
      user_id: "user-123",
      username: "testuser",
      display_name: "Test User",
      bio: "Hello world",
      show_email: false,
      email: "test@example.com",
      language: "English",
      additional_languages: [],
    };
  });

  afterEach(() => {
    cleanup();
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
      const flagImg = document.querySelector("img[src*='flagcdn.com/w40/gb.png']");
      expect(flagImg).not.toBeNull();
    });
  });

  it("renders user profile with additional cosmetic languages and flags", async () => {
    mockProfileData = {
      user_id: "user-456",
      username: "polyglot",
      display_name: "Polyglot User",
      bio: "I speak multiple languages!",
      show_email: false,
      email: "poly@example.com",
      language: "English",
      additional_languages: ["Korean", "French", "Spanish"],
    };

    render(
      <MemoryRouter initialEntries={["/users/polyglot"]}>
        <Routes>
          <Route path="/users/:username" element={<UserProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Polyglot User")).toBeDefined();
      expect(screen.getByText("@polyglot")).toBeDefined();
      expect(screen.getByText("English")).toBeDefined();
      expect(screen.getByText("Korean")).toBeDefined();
      expect(screen.getByText("French")).toBeDefined();
      expect(screen.getByText("Spanish")).toBeDefined();

      expect(document.querySelector("img[src*='flagcdn.com/w40/gb.png']")).not.toBeNull();
      expect(document.querySelector("img[src*='flagcdn.com/w40/kr.png']")).not.toBeNull();
      expect(document.querySelector("img[src*='flagcdn.com/w40/fr.png']")).not.toBeNull();
      expect(document.querySelector("img[src*='flagcdn.com/w40/es.png']")).not.toBeNull();
    });
  });
});
