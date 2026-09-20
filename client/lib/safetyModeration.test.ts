// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleSafetyModeration } from "./safetyModeration";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("client safetyModeration", () => {
  let openSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it("ignores non-moderation errors", () => {
    const handled = handleSafetyModeration({ error: "Network timeout", code: "TIMEOUT" });
    expect(handled).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("handles self-harm code by opening redirect URL in a new tab", () => {
    const handled = handleSafetyModeration({
      code: "SELF_HARM_DETECTED",
      redirectUrl: "https://findahelpline.com/",
    });

    expect(handled).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      "https://findahelpline.com/",
      "_blank",
      "noopener,noreferrer",
    );
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("Find A Helpline"),
      expect.any(Object),
    );
  });

  it("uses provided translation function for self-harm notice", () => {
    const mockT = vi.fn().mockReturnValue("Translated Crisis Help Notice");
    const handled = handleSafetyModeration(
      {
        code: "SELF_HARM_DETECTED",
        redirectUrl: "https://findahelpline.com/",
      },
      mockT,
    );

    expect(handled).toBe(true);
    expect(mockT).toHaveBeenCalledWith("safety.selfHarmSupportNotice");
    expect(toast.info).toHaveBeenCalledWith("Translated Crisis Help Notice", expect.any(Object));
  });

  it("handles child safety policy violation response", () => {
    const handled = handleSafetyModeration({
      code: "CHILD_SAFETY_POLICY_VIOLATION",
      error: "Child safety violation",
    });

    expect(handled).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Child safety violation", expect.any(Object));
  });

  it("handles standard content policy violation response", () => {
    const handled = handleSafetyModeration({
      code: "CONTENT_POLICY_VIOLATION",
      category: "hate",
      error: "Hate speech blocked",
    });

    expect(handled).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Hate speech blocked", expect.any(Object));
  });
});
