// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalSession, setLocalSession, LocalSession } from "./localSession";

const LOCAL_SESSION_KEY = "oxygen_auth_session";

describe("localSession", () => {
  const mockSession: LocalSession = {
    access_token: "test_token",
    token_type: "bearer",
    user: {
      id: "1",
      email: "test@example.com",
      username: "testuser",
    },
  };

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("getLocalSession", () => {
    it("returns null if localStorage is undefined", () => {
      const originalLocalStorage = global.localStorage;
      vi.stubGlobal("localStorage", undefined);
      expect(getLocalSession()).toBeNull();
      vi.stubGlobal("localStorage", originalLocalStorage);
    });

    it("returns null if session is not in localStorage", () => {
      expect(getLocalSession()).toBeNull();
    });

    it("returns null if session is invalid JSON", () => {
      localStorage.setItem(LOCAL_SESSION_KEY, "{ invalid json");
      expect(getLocalSession()).toBeNull();
    });

    it("returns the session if valid JSON is in localStorage", () => {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(mockSession));
      expect(getLocalSession()).toEqual(mockSession);
    });
  });

  describe("setLocalSession", () => {
    it("does nothing if localStorage is undefined", () => {
      const originalLocalStorage = global.localStorage;
      vi.stubGlobal("localStorage", undefined);
      expect(() => setLocalSession(mockSession)).not.toThrow();
      vi.stubGlobal("localStorage", originalLocalStorage);
    });

    it("removes the session if null is passed", () => {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(mockSession));
      setLocalSession(null);
      expect(localStorage.getItem(LOCAL_SESSION_KEY)).toBeNull();
    });

    it("sets the session if a valid session is passed", () => {
      setLocalSession(mockSession);
      const stored = localStorage.getItem(LOCAL_SESSION_KEY);
      expect(stored).toEqual(JSON.stringify(mockSession));
    });

    it("catches errors thrown by localStorage.setItem", () => {
      const setItemSpy = vi
        .spyOn(localStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("Quota exceeded");
        });
      expect(() => setLocalSession(mockSession)).not.toThrow();
    });
  });
});
