import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// @vitest-environment jsdom

describe("desktopBridge - setupGameBridgeListeners", () => {
  let messageHandler: (event: any) => void;
  let setupGameBridgeListeners: any;

  beforeEach(async () => {
    vi.resetModules();
    messageHandler = undefined as any;

    const addEventListenerMock = vi.fn((event, handler) => {
      if (event === "message") {
        messageHandler = handler;
      }
    });

    (window as any).chrome = {
      webview: {
        addEventListener: addEventListenerMock,
      }
    };

    const module = await import("./desktopBridge");
    setupGameBridgeListeners = module.setupGameBridgeListeners;

    // We also need to reset the internal state of the module
    // The module has a `bridgeListenerInitialized` flag and a `pushEventListeners` set.
    // However since we resetModules and dynamically imported, it should be clean.
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const simulateMessage = (eventName: string, payload?: any) => {
    if (!messageHandler) {
      throw new Error("messageHandler is undefined - listener wasn't registered");
    }
    messageHandler({
      data: {
        event: eventName,
        data: payload
      }
    });
  };

  const simulateAltMessage = (key: string, eventName: string, payload?: any) => {
    if (!messageHandler) {
      throw new Error("messageHandler is undefined - listener wasn't registered");
    }
    messageHandler({
      data: {
        [key]: eventName,
        data: payload
      }
    });
  };

  it("should call onPlaytimeTick when game_playtime_tick event is received", () => {
    const onPlaytimeTick = vi.fn();
    const cleanup = setupGameBridgeListeners(onPlaytimeTick);

    expect(messageHandler).toBeDefined();

    simulateMessage("game_playtime_tick", { playtime: 120 });

    expect(onPlaytimeTick).toHaveBeenCalledWith({ playtime: 120 });

    cleanup();
  });

  it("should call onSessionEnded when game_session_ended event is received", () => {
    const onSessionEnded = vi.fn();
    const cleanup = setupGameBridgeListeners(undefined, onSessionEnded);

    simulateMessage("game_session_ended", { sessionId: "123" });

    expect(onSessionEnded).toHaveBeenCalledWith({ sessionId: "123" });

    cleanup();
  });

  it("should call onSessionStarted when game_session_started event is received", () => {
    const onSessionStarted = vi.fn();
    const cleanup = setupGameBridgeListeners(undefined, undefined, onSessionStarted);

    simulateMessage("game_session_started", { gameId: "game_456" });

    expect(onSessionStarted).toHaveBeenCalledWith({ gameId: "game_456" });

    cleanup();
  });

  it("should handle event types using different data shapes (event_type)", () => {
    const onPlaytimeTick = vi.fn();
    const cleanup = setupGameBridgeListeners(onPlaytimeTick);

    simulateAltMessage("event_type", "game_playtime_tick", { tick: true });
    expect(onPlaytimeTick).toHaveBeenCalledWith({ tick: true });

    cleanup();
  });

  it("should handle event types using different data shapes (@event)", () => {
    const onSessionEnded = vi.fn();
    const cleanup = setupGameBridgeListeners(undefined, onSessionEnded);

    simulateAltMessage("@event", "game_session_ended", { ended: true });
    expect(onSessionEnded).toHaveBeenCalledWith({ ended: true });

    cleanup();
  });

  it("should not crash if callbacks are not provided", () => {
    const cleanup = setupGameBridgeListeners();

    expect(() => {
      simulateMessage("game_playtime_tick", { playtime: 100 });
      simulateMessage("game_session_ended", {});
      simulateMessage("game_session_started", {});
    }).not.toThrow();

    cleanup();
  });

  it("should not trigger callbacks for unknown events", () => {
    const onPlaytimeTick = vi.fn();
    const cleanup = setupGameBridgeListeners(onPlaytimeTick);

    simulateMessage("unknown_event_type", { data: "test" });

    expect(onPlaytimeTick).not.toHaveBeenCalled();

    cleanup();
  });

  it("should stop triggering callbacks after cleanup is called", () => {
    const onPlaytimeTick = vi.fn();
    const cleanup = setupGameBridgeListeners(onPlaytimeTick);

    simulateMessage("game_playtime_tick", { playtime: 10 });
    expect(onPlaytimeTick).toHaveBeenCalledTimes(1);

    cleanup();

    simulateMessage("game_playtime_tick", { playtime: 20 });
    expect(onPlaytimeTick).toHaveBeenCalledTimes(1); // Should not increase
  });

  it("should safely ignore malformed messages or string messages", () => {
    const onPlaytimeTick = vi.fn();
    const cleanup = setupGameBridgeListeners(onPlaytimeTick);

    if (!messageHandler) {
      throw new Error("messageHandler is undefined - listener wasn't registered");
    }

    // Simulate non-json string message
    messageHandler({ data: "invalid json string" });

    // Simulate empty data
    messageHandler({ data: null });

    // Simulate valid JSON string
    messageHandler({
      data: JSON.stringify({ event: "game_playtime_tick", data: { p: 1 } })
    });

    expect(onPlaytimeTick).toHaveBeenCalledTimes(1);
    expect(onPlaytimeTick).toHaveBeenCalledWith({ p: 1 });

    cleanup();
  });
});
