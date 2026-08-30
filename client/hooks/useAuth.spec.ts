/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { db, getLocalSession, setLocalSession } from "@/lib/db";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should initialize with loading state and local session", async () => {
    const mockSession = {
      access_token: "test-jwt",
      token_type: "bearer",
      user: { id: "123", email: "user@example.com", username: "user" },
    };
    setLocalSession(mockSession);

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toEqual(mockSession);
  });

  it("should handle signIn successfully", async () => {
    const mockSession = {
      access_token: "login-jwt",
      token_type: "bearer",
      user: { id: "u1", email: "login@test.com", username: "loginuser" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: mockSession, user: mockSession.user }),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const res = await result.current.signIn("loginuser", "password123");
      expect(res.session).toEqual(mockSession);
    });

    expect(result.current.session).toEqual(mockSession);
    expect(getLocalSession()).toEqual(mockSession);
  });

  it("should handle signUp successfully", async () => {
    const mockSession = {
      access_token: "signup-jwt",
      token_type: "bearer",
      user: { id: "u2", email: "new@test.com", username: "newuser" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: mockSession, user: mockSession.user }),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const res = await result.current.signUp("newuser", "new@test.com", "password123");
      expect(res.session).toEqual(mockSession);
    });

    expect(result.current.session).toEqual(mockSession);
    expect(getLocalSession()).toEqual(mockSession);
  });

  it("should handle signOut", async () => {
    const mockSession = {
      access_token: "active-jwt",
      token_type: "bearer",
      user: { id: "u1", email: "active@test.com", username: "activeuser" },
    };
    setLocalSession(mockSession);

    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toEqual(mockSession);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.session).toBeNull();
    expect(getLocalSession()).toBeNull();
  });

  it("should handle signIn error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid credentials" }),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.signIn("wronguser", "wrongpassword");
      } catch {
        // Expected error
      }
    });

    expect(result.current.error).toBe("Invalid credentials");
  });
});
