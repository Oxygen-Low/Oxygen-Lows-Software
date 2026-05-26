/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
      linkIdentity: vi.fn(),
    },
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("should initialize with loading state and fetch session", async () => {
    const mockSession = { user: { id: "123" } };
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockSession },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);

    // Wait for the useEffect to finish
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toEqual(mockSession);
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it("should handle sign in", async () => {
    const mockSession = { user: { id: "123" } };
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const data = await result.current.signIn("test@example.com", "password");
      expect(data.session).toEqual(mockSession);
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password",
    });
  });

  it("should handle sign out", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: "123" } } },
    });
    (supabase.auth.signOut as any).mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("should handle OAuth sign in", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });
    (supabase.auth.signInWithOAuth as any).mockResolvedValue({
      data: { provider: "github", url: "http://localhost" },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithOAuth("github");
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "http://localhost:3000",
        scopes: undefined,
      },
    });
  });

  it("should handle GitLab OAuth sign in", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });
    (supabase.auth.signInWithOAuth as any).mockResolvedValue({
      data: { provider: "gitlab", url: "http://localhost" },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithOAuth("gitlab");
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "gitlab",
      options: {
        redirectTo: "http://localhost:3000",
        scopes: "read_user",
      },
    });
  });

  it("should handle identity linking", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: "123" } } },
    });
    (supabase.auth.linkIdentity as any).mockResolvedValue({
      data: { provider: "github", url: "http://localhost" },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.linkIdentity("github");
    });

    expect(supabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "http://localhost:3000/account",
        scopes: undefined,
      },
    });
  });

  it("should handle Google identity linking", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: "123" } } },
    });
    (supabase.auth.linkIdentity as any).mockResolvedValue({
      data: { provider: "google", url: "http://localhost" },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.linkIdentity("google");
    });

    expect(supabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/account",
        scopes: "email profile openid",
      },
    });
  });

  it("should handle errors", async () => {
    const errorMessage = "Invalid credentials";
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: null,
      error: new Error(errorMessage),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.signIn("test@example.com", "wrong-password");
      } catch (err) {
        // Expected
      }
    });

    expect(result.current.error).toBe(errorMessage);
  });
});
