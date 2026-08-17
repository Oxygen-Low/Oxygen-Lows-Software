import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isPasswordPwned } from "./hibp";

describe("isPasswordPwned", () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;

  beforeEach(() => {
    global.fetch = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  it("should return true if password is pwned", async () => {
    // SHA-1 of "password" is 5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8
    // Prefix: 5BAA6, Suffix: 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    const mockResponseText = "00000000000000000000000000000000000:1\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:100\n22222222222222222222222222222222222:2";

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    });

    const result = await isPasswordPwned("password");

    expect(global.fetch).toHaveBeenCalledWith("https://api.pwnedpasswords.com/range/5BAA6");
    expect(result).toBe(true);
  });

  it("should return false if password is not pwned", async () => {
    const mockResponseText = "00000000000000000000000000000000000:1\n22222222222222222222222222222222222:2";

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockResponseText),
    });

    const result = await isPasswordPwned("password");

    expect(global.fetch).toHaveBeenCalledWith("https://api.pwnedpasswords.com/range/5BAA6");
    expect(result).toBe(false);
  });

  it("should return false if API is down (not ok response)", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
    });

    const result = await isPasswordPwned("password");

    expect(result).toBe(false);
  });

  it("should return false if fetch throws an error", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network Error"));

    const result = await isPasswordPwned("password");

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith("Error checking HIBP API:", expect.any(Error));
  });
});
