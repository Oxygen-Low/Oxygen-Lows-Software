/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Auth from "./Auth";
import { useAuth } from "@/hooks/useAuth";

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock db
vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  };
  return {
    db: mockClient,
    supabase: mockClient,
  };
});

describe("Auth Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("should render the login form when no session exists", async () => {
    (useAuth as any).mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>,
    );

    const heading = screen.getByText(/Welcome back/i);
    expect(heading).toBeDefined();

    const usernameLabel = screen.getByText("Username or Email");
    expect(usernameLabel).toBeDefined();

    const signInButtons = screen.getAllByRole("button", { name: /Sign In/i });
    expect(signInButtons.length).toBeGreaterThan(0);
  });

  it("should redirect to /apps if session exists", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "123", email: "test@example.com" } },
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
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

  it("returns to the validated desktop Apps URL after sign-in", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "123", email: "test@example.com" } },
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth?returnTo=%2Fapps%3Fdesktop%3D1"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/apps" element={<div>Desktop Apps Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Desktop Apps Page")).toBeDefined();
    });
  });

  it("should render the language selector dropdown on the auth page", async () => {
    (useAuth as any).mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Language")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
  });

  it("should show migration form when signIn indicates needsMigration", async () => {
    const mockSignIn = vi.fn().mockResolvedValue({
      needsMigration: true,
      user: { username: "legacyuser", email: "legacy@example.com" },
    });

    (useAuth as any).mockReturnValue({
      session: null,
      loading: false,
      signIn: mockSignIn,
      signUp: vi.fn(),
      migrateAccount: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>,
    );

    const inputs = document.querySelectorAll("input");
    // inputs[0] is keyFileInput (hidden), inputs[1] is login, inputs[2] is password
    const textInputs = Array.from(inputs).filter((i) => i.type !== "file");
    fireEvent.change(textInputs[0], { target: { value: "legacyuser" } });
    fireEvent.change(textInputs[1], { target: { value: "oldpassword" } });

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText("Security Upgrade & Password Migration"),
      ).toBeDefined();
      expect(
        screen.getByText("Complete Migration & Sign In"),
      ).toBeDefined();
      expect(
        screen.getByText(/Previous Masterkey \(Optional\)/i),
      ).toBeDefined();
    });
  });
});
