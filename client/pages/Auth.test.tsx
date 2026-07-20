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

  it("should render recovery mode when query parameter type=recovery is present even if session exists", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "123", email: "test@example.com" } },
      loading: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      resetPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth?type=recovery"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/apps" element={<div>Apps Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Should not redirect to Apps page, but render the Set New Password header / New Password input field.
    const heading = screen.getByText("Set new password");
    expect(heading).toBeDefined();

    const newPasswordLabel = screen.getByText("New Password");
    expect(newPasswordLabel).toBeDefined();

    const appsPage = screen.queryByText("Apps Page");
    expect(appsPage).toBeNull();
  });

  it("should redirect to /apps if session exists and type is not recovery", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "123", email: "test@example.com" } },
      loading: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      resetPassword: vi.fn(),
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

    // Should redirect to Apps page because session exists and we are not in recovery mode.
    await waitFor(() => {
      const appsPage = screen.getByText("Apps Page");
      expect(appsPage).toBeDefined();
    });

    const heading = screen.queryByText("Set new password");
    expect(heading).toBeNull();
  });
});
