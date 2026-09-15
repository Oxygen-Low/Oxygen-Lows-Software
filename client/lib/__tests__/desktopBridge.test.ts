// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDesktopBridgeAvailable } from "../desktopBridge";

describe("isDesktopBridgeAvailable", () => {
  beforeEach(() => {
    // Reset window.chrome before each test
    (global.window as any).chrome = undefined;
  });

  afterEach(() => {
    (global.window as any).chrome = undefined;
  });

  it("should return false when window.chrome is not defined", () => {
    expect(isDesktopBridgeAvailable()).toBe(false);
  });

  it("should return false when window.chrome.webview is not defined", () => {
    (global.window as any).chrome = {};
    expect(isDesktopBridgeAvailable()).toBe(false);
  });

  it("should return true when window.chrome.webview is defined", () => {
    (global.window as any).chrome = {
      webview: {
        postMessage: () => {},
        addEventListener: () => {}
      },
    };
    expect(isDesktopBridgeAvailable()).toBe(true);
  });
});
