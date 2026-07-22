/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Auth from "./Auth";
import { useAuth } from "@/hooks/useAuth";

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}));

describe("Auth Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should render the google sign in button when no session exists", async () => {
    (useAuth as any).mockReturnValue({
      session: null,
      loading: false,
      signInWithOAuth: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>,
    );

    const heading = screen.getByText("Welcome back");
    expect(heading).toBeDefined();

    const googleBtn = screen.getByText("Sign in with Google");
    expect(googleBtn).toBeDefined();
  });

  it("should redirect to /apps if session exists", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "123", email: "test@example.com" } },
      loading: false,
      signInWithOAuth: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/apps" element={<div>Apps Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const appsPage = screen.getByText("Apps Page");
      expect(appsPage).toBeDefined();
    });
  });
});
