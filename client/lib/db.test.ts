// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db, setLocalSession, notifyAuthListeners, LocalSession } from "./db";

describe("db.ts auth listeners", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("should add a listener, notify it, and unsubscribe", () => {
    const listener = vi.fn();
    const { data } = db.auth.onAuthStateChange(listener);
    const unsubscribe = data.subscription.unsubscribe;

    const mockSession: LocalSession = {
      access_token: "test-token",
      token_type: "bearer",
      user: {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
      },
    };

    // Notify listeners directly
    notifyAuthListeners("TEST_EVENT", mockSession);
    expect(listener).toHaveBeenCalledWith("TEST_EVENT", mockSession);
    expect(listener).toHaveBeenCalledTimes(1);

    // Unsubscribe and verify it's no longer called
    unsubscribe();
    notifyAuthListeners("ANOTHER_EVENT", null);
    expect(listener).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should call notifyAuthListeners with SIGNED_IN when setLocalSession is called with a session", () => {
    const listener = vi.fn();
    const { data } = db.auth.onAuthStateChange(listener);

    const mockSession: LocalSession = {
      access_token: "test-token",
      token_type: "bearer",
      user: {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
      },
    };

    setLocalSession(mockSession);

    expect(listener).toHaveBeenCalledWith("SIGNED_IN", mockSession);
    expect(listener).toHaveBeenCalledTimes(1);

    data.subscription.unsubscribe();
  });

  it("should call notifyAuthListeners with SIGNED_OUT when setLocalSession is called with null", () => {
    const listener = vi.fn();
    const { data } = db.auth.onAuthStateChange(listener);

    setLocalSession(null);

    expect(listener).toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(listener).toHaveBeenCalledTimes(1);

    data.subscription.unsubscribe();
  });

  it("should trigger SIGNED_OUT when db.auth.signOut() is called", async () => {
    const listener = vi.fn();
    const { data } = db.auth.onAuthStateChange(listener);

    const { error } = await db.auth.signOut();

    expect(error).toBeNull();
    expect(listener).toHaveBeenCalledWith("SIGNED_OUT", null);
    expect(listener).toHaveBeenCalledTimes(1);

    data.subscription.unsubscribe();
  });

  it("should continue notifying other listeners even if one throws an error", () => {
    const throwingListener = vi.fn(() => {
      throw new Error("I am a bad listener");
    });
    const goodListener = vi.fn();

    const sub1 = db.auth.onAuthStateChange(throwingListener);
    const sub2 = db.auth.onAuthStateChange(goodListener);

    notifyAuthListeners("ERROR_TEST", null);

    expect(throwingListener).toHaveBeenCalledWith("ERROR_TEST", null);
    expect(goodListener).toHaveBeenCalledWith("ERROR_TEST", null);
    expect(throwingListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);

    sub1.data.subscription.unsubscribe();
    sub2.data.subscription.unsubscribe();
  });
});
