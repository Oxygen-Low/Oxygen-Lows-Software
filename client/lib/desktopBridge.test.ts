// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("desktopBridge", () => {
  let mockWebview: any;
  let messageListeners: Function[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "test-uuid-1234"),
    });

    vi.resetModules();

    messageListeners = [];
    mockWebview = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((event, listener) => {
        if (event === "message") {
          messageListeners.push(listener);
        }
      }),
    };

    (window as any).chrome = {
      webview: mockWebview,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as any).chrome;
  });

  const simulateMessage = (data: any) => {
    for (const listener of messageListeners) {
      listener({
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
    }
  };

  const simulateRawMessage = (data: any) => {
    for (const listener of messageListeners) {
      listener({ data });
    }
  };

  describe("isDesktopBridgeAvailable", () => {
    it("should detect bridge availability", async () => {
      const { isDesktopBridgeAvailable } = await import("./desktopBridge");
      expect(isDesktopBridgeAvailable()).toBe(true);
      delete (window as any).chrome;
      expect(isDesktopBridgeAvailable()).toBe(false);
    });
  });

  describe("callDesktopBridge", () => {
    it("should reject if webview is not available", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      delete (window as any).chrome;
      await expect(callDesktopBridge("test_command")).rejects.toThrow(
        "Desktop bridge not available. Run in the desktop app.",
      );
    });

    it("should post message to webview with default params", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      callDesktopBridge("test_command");
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        JSON.stringify({ command: "test_command", id: "test-uuid-1234" }),
      );
    });

    it("should post message to webview with provided params", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      callDesktopBridge("test_command", { param1: "value1" });
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        JSON.stringify({
          command: "test_command",
          id: "test-uuid-1234",
          param1: "value1",
        }),
      );
    });

    it("should resolve when response is received", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command");
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { result: "ok" },
      });
      const result = await promise;
      expect(result).toEqual({ result: "ok" });
    });

    it("should resolve with root object if data is not present", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command");
      simulateMessage({ id: "test-uuid-1234", success: true, result: "ok" });
      const result = await promise;
      expect(result).toEqual({
        id: "test-uuid-1234",
        success: true,
        result: "ok",
      });
    });

    it("should handle raw object message data", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command");
      simulateRawMessage({
        id: "test-uuid-1234",
        success: true,
        data: { result: "ok" },
      });
      const result = await promise;
      expect(result).toEqual({ result: "ok" });
    });

    it("should reject when error response is received", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command");
      simulateMessage({
        id: "test-uuid-1234",
        success: false,
        error: "Custom error",
      });
      await expect(promise).rejects.toThrow("Custom error");
    });

    it("should reject with default error when success is false without error field", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command");
      simulateMessage({ id: "test-uuid-1234", success: false });
      await expect(promise).rejects.toThrow("Bridge call failed");
    });

    it("should timeout after specified duration", async () => {
      const { callDesktopBridge } = await import("./desktopBridge");
      const promise = callDesktopBridge("test_command", {}, 1000);

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("Bridge call timed out");
    });
  });

  describe("push events", () => {
    it("should call listener on push event", async () => {
      const { addPushEventListener } = await import("./desktopBridge");
      const listener = vi.fn();
      const unsubscribe = addPushEventListener(listener);

      simulateMessage({ event: "test_event", data: "payload" });
      expect(listener).toHaveBeenCalledWith("test_event", "payload");

      unsubscribe();
      simulateMessage({ event: "test_event2", data: "payload2" });
      expect(listener).not.toHaveBeenCalledWith("test_event2", "payload2");
    });

    it("should use fallback event fields", async () => {
      const { addPushEventListener } = await import("./desktopBridge");
      const listener = vi.fn();
      addPushEventListener(listener);

      simulateMessage({ event_type: "test_event_type", data: "payload" });
      expect(listener).toHaveBeenCalledWith("test_event_type", "payload");

      simulateMessage({ "@event": "test_at_event", data: "payload" });
      expect(listener).toHaveBeenCalledWith("test_at_event", "payload");
    });

    it("should ignore non-JSON messages or invalid payloads", async () => {
      const { addPushEventListener } = await import("./desktopBridge");
      const listener = vi.fn();
      addPushEventListener(listener);

      simulateMessage(undefined); // should ignore
      for (const msgListener of messageListeners) {
        msgListener({ data: "invalid json" });
      }
      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle errors in listeners gracefully", async () => {
      const { addPushEventListener } = await import("./desktopBridge");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const badListener = () => {
        throw new Error("Listener error");
      };
      const goodListener = vi.fn();

      addPushEventListener(badListener);
      addPushEventListener(goodListener);

      simulateMessage({ event: "test_event", data: "payload" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in bridge event listener",
        expect.any(Error),
      );
      expect(goodListener).toHaveBeenCalledWith("test_event", "payload");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("specific API functions", () => {
    it("toggleFullscreen should call correct bridge method", async () => {
      const { toggleFullscreen } = await import("./desktopBridge");
      const promise = toggleFullscreen();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"toggle_fullscreen"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { isFullscreen: true },
      });
      expect(await promise).toEqual({ isFullscreen: true });
    });

    it("setFullscreen should call correct bridge method", async () => {
      const { setFullscreen } = await import("./desktopBridge");
      const promise = setFullscreen(true);
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"set_fullscreen"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { isFullscreen: true },
      });
      expect(await promise).toEqual({ isFullscreen: true });
    });

    it("isFullscreen should call correct bridge method", async () => {
      const { isFullscreen } = await import("./desktopBridge");
      const promise = isFullscreen();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"is_fullscreen"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { isFullscreen: true },
      });
      expect(await promise).toEqual({ isFullscreen: true });
    });

    it("scanInstalledGames should handle array response", async () => {
      const { scanInstalledGames } = await import("./desktopBridge");
      const promise = scanInstalledGames();
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: [{ id: "1", title: "Game 1" }],
      });
      expect(await promise).toEqual([{ id: "1", title: "Game 1" }]);
    });

    it("scanInstalledGames should handle object response with games array", async () => {
      const { scanInstalledGames } = await import("./desktopBridge");
      const promise = scanInstalledGames();
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { games: [{ id: "1", title: "Game 1" }] },
      });
      expect(await promise).toEqual([{ id: "1", title: "Game 1" }]);
    });

    it("scanInstalledGames should return empty array if no games field in object", async () => {
      const { scanInstalledGames } = await import("./desktopBridge");
      const promise = scanInstalledGames();
      simulateMessage({ id: "test-uuid-1234", success: true, data: {} });
      expect(await promise).toEqual([]);
    });

    it("launchGame should call correct bridge method", async () => {
      const { launchGame } = await import("./desktopBridge");
      const params = { gameId: "1", platform: "pc" };
      const promise = launchGame(params);
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"launch_game"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { success: true },
      });
      expect(await promise).toEqual({ success: true });
    });

    it("pickGameExecutable should call correct bridge method", async () => {
      const { pickGameExecutable } = await import("./desktopBridge");
      const promise = pickGameExecutable();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"pick_game_executable"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { title: "Game", executablePath: "path" },
      });
      expect(await promise).toEqual({ title: "Game", executablePath: "path" });
    });

    it("getGameIcon should call correct bridge method", async () => {
      const { getGameIcon } = await import("./desktopBridge");
      const promise = getGameIcon("path", "1");
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"get_game_icon"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { iconDataUrl: "url" },
      });
      expect(await promise).toEqual({ iconDataUrl: "url" });
    });

    it("getRunningGames should call correct bridge method", async () => {
      const { getRunningGames } = await import("./desktopBridge");
      const promise = getRunningGames();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"command":"get_running_games"'),
      );
      simulateMessage({
        id: "test-uuid-1234",
        success: true,
        data: { runningGames: [] },
      });
      expect(await promise).toEqual({ runningGames: [] });
    });

    it("getRunningGames should fallback to empty array if not in data", async () => {
      const { getRunningGames } = await import("./desktopBridge");
      const promise = getRunningGames();
      simulateMessage({ id: "test-uuid-1234", success: true, data: {} });
      expect(await promise).toEqual({ runningGames: [] });
    });

    it("setupGameBridgeListeners should setup event listeners", async () => {
      const { setupGameBridgeListeners } = await import("./desktopBridge");
      const onPlaytimeTick = vi.fn();
      const onSessionEnded = vi.fn();
      const onSessionStarted = vi.fn();

      const unsubscribe = setupGameBridgeListeners(
        onPlaytimeTick,
        onSessionEnded,
        onSessionStarted,
      );

      simulateMessage({ event: "game_playtime_tick", data: "tick" });
      expect(onPlaytimeTick).toHaveBeenCalledWith("tick");

      simulateMessage({ event: "game_session_ended", data: "end" });
      expect(onSessionEnded).toHaveBeenCalledWith("end");

      simulateMessage({ event: "game_session_started", data: "start" });
      expect(onSessionStarted).toHaveBeenCalledWith("start");

      unsubscribe();
    });
  });
});
