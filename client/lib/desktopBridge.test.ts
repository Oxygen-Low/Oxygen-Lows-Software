// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("desktopBridge", () => {
  let addPushEventListener: any;
  let webviewAddEventListenerMock: any;

  beforeEach(async () => {
    vi.resetModules();

    webviewAddEventListenerMock = vi.fn();
    (window as any).chrome = {
      webview: {
        addEventListener: webviewAddEventListenerMock,
      },
    };

    const module = await import("./desktopBridge");
    addPushEventListener = module.addPushEventListener;
  });

  afterEach(() => {
    delete (window as any).chrome;
    vi.restoreAllMocks();
  });

  it("should add a listener and receive push events", () => {
    const listener = vi.fn();
    addPushEventListener(listener);

    expect(webviewAddEventListenerMock).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    );
    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    // Simulate incoming message
    messageCallback({
      data: JSON.stringify({
        event: "test_event",
        data: { foo: "bar" },
      }),
    });

    expect(listener).toHaveBeenCalledWith("test_event", { foo: "bar" });
  });

  it("should return an unsubscribe function that removes the listener", () => {
    const listener = vi.fn();
    const unsubscribe = addPushEventListener(listener);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    unsubscribe();

    messageCallback({
      data: JSON.stringify({
        event: "test_event",
        data: { foo: "bar" },
      }),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("should support alternative event keys: event_type and @event", () => {
    const listener = vi.fn();
    addPushEventListener(listener);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    messageCallback({
      data: JSON.stringify({
        event_type: "event_1",
        data: "payload_1",
      }),
    });

    messageCallback({
      data: JSON.stringify({
        "@event": "event_2",
        data: "payload_2",
      }),
    });

    expect(listener).toHaveBeenCalledWith("event_1", "payload_1");
    expect(listener).toHaveBeenCalledWith("event_2", "payload_2");
  });

  it("should default to the full data object if data.data is not present", () => {
    const listener = vi.fn();
    addPushEventListener(listener);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];
    const payload = {
      event: "test_event",
      foo: "bar",
    };

    messageCallback({
      data: JSON.stringify(payload),
    });

    expect(listener).toHaveBeenCalledWith("test_event", payload);
  });

  it("should not prevent other listeners from executing if one throws an error", () => {
    const consoleErrorMock = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const listenerThrow = vi.fn().mockImplementation(() => {
      throw new Error("test error");
    });
    const listenerSuccess = vi.fn();

    addPushEventListener(listenerThrow);
    addPushEventListener(listenerSuccess);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    messageCallback({
      data: JSON.stringify({
        event: "test_event",
        data: "payload",
      }),
    });

    expect(listenerThrow).toHaveBeenCalledWith("test_event", "payload");
    expect(listenerSuccess).toHaveBeenCalledWith("test_event", "payload");
    expect(consoleErrorMock).toHaveBeenCalled();

    consoleErrorMock.mockRestore();
  });

  it("should safely ignore non-JSON or invalid messages without crashing", () => {
    const listener = vi.fn();
    addPushEventListener(listener);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    expect(() => {
      // Non-JSON string
      messageCallback({
        data: "not json",
      });
      // Null data
      messageCallback({
        data: null,
      });
      // Undefined data
      messageCallback({});
    }).not.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });

  it("should handle object data directly without parsing", () => {
    const listener = vi.fn();
    addPushEventListener(listener);

    const messageCallback = webviewAddEventListenerMock.mock.calls[0][1];

    messageCallback({
      data: {
        event: "test_event",
        data: "payload",
      },
    });

    expect(listener).toHaveBeenCalledWith("test_event", "payload");
  });
});
