// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("desktopBridge", () => {
  let desktopBridge: typeof import("./desktopBridge");
  let mockAddEventListener: any;

  beforeEach(async () => {
    vi.resetModules();

    mockAddEventListener = vi.fn();
    (window as any).chrome = {
      webview: {
        addEventListener: mockAddEventListener,
      },
    };

    desktopBridge = await import("./desktopBridge");
  });

  afterEach(() => {
    delete (window as any).chrome;
    vi.restoreAllMocks();
  });

  describe("initBridgeListener", () => {
    it("should initialize only once", () => {
      desktopBridge.initBridgeListener();
      desktopBridge.initBridgeListener();
      desktopBridge.initBridgeListener();

      expect(mockAddEventListener).toHaveBeenCalledTimes(1);
      expect(mockAddEventListener).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("should do nothing if window.chrome.webview is unavailable", async () => {
      vi.resetModules();
      delete (window as any).chrome;
      desktopBridge = await import("./desktopBridge");

      expect(() => {
        desktopBridge.initBridgeListener();
      }).not.toThrow();
    });

    it("should process push events correctly", () => {
      desktopBridge.initBridgeListener();

      const listener = vi.fn();
      desktopBridge.addPushEventListener(listener);

      const messageHandler = mockAddEventListener.mock.calls[0][1];

      // Test "event" key
      messageHandler({
        data: JSON.stringify({ event: "test_event", data: { foo: "bar" } })
      });
      expect(listener).toHaveBeenCalledWith("test_event", { foo: "bar" });

      // Test "event_type" key
      messageHandler({
        data: { event_type: "test_event_2", data: { bar: "baz" } }
      });
      expect(listener).toHaveBeenCalledWith("test_event_2", { bar: "baz" });

      // Test "@event" key
      messageHandler({
        data: { "@event": "test_event_3" } // No data field, should pass the whole object
      });
      expect(listener).toHaveBeenCalledWith("test_event_3", { "@event": "test_event_3" });
    });

    it("should handle RPC success calls", async () => {
      // It is tricky to test RPC fully because `callDesktopBridge` calls `initBridgeListener`.
      // We will mock `webview.postMessage` to simulate the desktop app responding.
      const mockPostMessage = vi.fn().mockImplementation((msg) => {
        const parsed = JSON.parse(msg);
        const messageHandler = mockAddEventListener.mock.calls[0][1];

        // Simulate immediate response from desktop
        setTimeout(() => {
          messageHandler({
            data: { id: parsed.id, success: true, data: { result: "ok" } }
          });
        }, 0);
      });

      (window as any).chrome.webview.postMessage = mockPostMessage;

      const result = await desktopBridge.callDesktopBridge("test_cmd");
      expect(result).toEqual({ result: "ok" });
    });

    it("should handle RPC error calls", async () => {
      const mockPostMessage = vi.fn().mockImplementation((msg) => {
        const parsed = JSON.parse(msg);
        const messageHandler = mockAddEventListener.mock.calls[0][1];

        setTimeout(() => {
          messageHandler({
            data: { id: parsed.id, success: false, error: "Something went wrong" }
          });
        }, 0);
      });

      (window as any).chrome.webview.postMessage = mockPostMessage;

      await expect(desktopBridge.callDesktopBridge("test_cmd")).rejects.toThrow("Something went wrong");
    });

    it("should ignore invalid JSON and missing data safely", () => {
      desktopBridge.initBridgeListener();
      const messageHandler = mockAddEventListener.mock.calls[0][1];

      // Invalid JSON string
      expect(() => {
        messageHandler({ data: "invalid json string {" });
      }).not.toThrow();

      // Falsy data
      expect(() => {
        messageHandler({ data: null });
      }).not.toThrow();
    });

    it("should catch errors in push event listeners and not crash", () => {
      desktopBridge.initBridgeListener();

      const failingListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });
      const succeedingListener = vi.fn();

      desktopBridge.addPushEventListener(failingListener);
      desktopBridge.addPushEventListener(succeedingListener);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const messageHandler = mockAddEventListener.mock.calls[0][1];

      expect(() => {
        messageHandler({
          data: { event: "test" }
        });
      }).not.toThrow();

      expect(failingListener).toHaveBeenCalled();
      expect(succeedingListener).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
