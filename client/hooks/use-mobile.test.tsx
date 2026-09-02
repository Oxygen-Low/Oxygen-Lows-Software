// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
  let addEventListenerMock: any;
  let removeEventListenerMock: any;
  let triggerChange: (e: any) => void;

  beforeEach(() => {
    addEventListenerMock = vi.fn((event, callback) => {
      if (event === "change") {
        triggerChange = callback;
      }
    });
    removeEventListenerMock = vi.fn();
    triggerChange = () => {};

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return false when window width is greater than or equal to MOBILE_BREAKPOINT", () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("should return true when window width is less than MOBILE_BREAKPOINT", () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("should update when window is resized past the breakpoint", () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      window.innerWidth = 500;
      triggerChange(new Event("change"));
    });

    expect(result.current).toBe(true);

    act(() => {
      window.innerWidth = 1024;
      triggerChange(new Event("change"));
    });

    expect(result.current).toBe(false);
  });

  it("should clean up event listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(removeEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
