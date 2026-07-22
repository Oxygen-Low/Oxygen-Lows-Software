/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  getAuthenticatedClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
  })),
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
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

  it("should handle Google OAuth sign in", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
    });
    (supabase.auth.signInWithOAuth as any).mockResolvedValue({
      data: { provider: "google", url: "http://localhost" },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithOAuth("google");
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000",
        scopes: "email profile openid",
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
    const errorMessage = "Sign out failed";
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: { id: "123" } } },
    });
    (supabase.auth.signOut as any).mockResolvedValue({
      error: new Error(errorMessage),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.signOut();
      } catch (err) {
        // Expected
      }
    });

    expect(result.current.error).toBe(errorMessage);
  });
});
