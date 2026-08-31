import { describe, it, expect } from "vitest";
import {
  base32ToBytes,
  bytesToBase32,
  generateTotp,
  validateTotpSecret,
  cleanTotpSecret,
  parseTotpSecret,
  formatOtpCode,
  getTotpTimeRemaining,
  getTotpProgress,
} from "./totp";

describe("TOTP Utilities", () => {
  describe("Base32 Conversion", () => {
    it("should encode and decode ASCII strings in Base32", () => {
      const input = new TextEncoder().encode("Hello World!");
      const b32 = bytesToBase32(input);
      expect(b32).toBe("JBSWY3DPEBLW64TMMQQQ");
      const decoded = base32ToBytes(b32);
      expect(new TextDecoder().decode(decoded)).toBe("Hello World!");
    });

    it("should handle lowercase, spaces, dashes, and padding in Base32 decoding", () => {
      const decoded1 = base32ToBytes("JBSWY3DPEBLW64TMMQ");
      const decoded2 = base32ToBytes("jbsw y3dp - eblw 64tm mq==");
      expect(decoded1).toEqual(decoded2);
    });

    it("should throw error on invalid Base32 characters (like 8, 9, 0, 1)", () => {
      expect(() => base32ToBytes("INVALID890")).toThrow(
        "Invalid Base32 character",
      );
    });
  });

  describe("RFC 6238 Official Test Vectors", () => {
    // RFC 6238 Appendix B Test Vectors
    // The test token shared secret in ASCII is "12345678901234567890" (20 bytes).
    // In Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    it("matches RFC 6238 SHA-1 test vectors at T=59", async () => {
      const otp8 = await generateTotp(rfcSecret, {
        time: 59,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(otp8).toBe("94287082");

      const otp6 = await generateTotp(rfcSecret, {
        time: 59,
        digits: 6,
        algorithm: "SHA-1",
      });
      expect(otp6).toBe("287082");
    });

    it("matches RFC 6238 SHA-1 test vectors at T=1111111109", async () => {
      const otp8 = await generateTotp(rfcSecret, {
        time: 1111111109,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(otp8).toBe("07081804");

      const otp6 = await generateTotp(rfcSecret, {
        time: 1111111109,
        digits: 6,
        algorithm: "SHA-1",
      });
      expect(otp6).toBe("081804");
    });

    it("matches RFC 6238 SHA-1 test vectors at T=1111111111", async () => {
      const otp8 = await generateTotp(rfcSecret, {
        time: 1111111111,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(otp8).toBe("14050471");

      const otp6 = await generateTotp(rfcSecret, {
        time: 1111111111,
        digits: 6,
        algorithm: "SHA-1",
      });
      expect(otp6).toBe("050471");
    });

    it("matches RFC 6238 SHA-1 test vectors at T=1234567890", async () => {
      const otp8 = await generateTotp(rfcSecret, {
        time: 1234567890,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(otp8).toBe("89005924");

      const otp6 = await generateTotp(rfcSecret, {
        time: 1234567890,
        digits: 6,
        algorithm: "SHA-1",
      });
      expect(otp6).toBe("005924");
    });

    it("matches RFC 6238 SHA-1 test vectors at T=2000000000", async () => {
      const otp8 = await generateTotp(rfcSecret, {
        time: 2000000000,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(otp8).toBe("69279037");

      const otp6 = await generateTotp(rfcSecret, {
        time: 2000000000,
        digits: 6,
        algorithm: "SHA-1",
      });
      expect(otp6).toBe("279037");
    });
  });

  describe("Secret Parsing & Validation", () => {
    it("validates valid Base32 secrets", () => {
      expect(validateTotpSecret("JBSWY3DPEHPK3PXP")).toBe(true);
      expect(validateTotpSecret("jbsw y3dp ehpk 3pxp")).toBe(true);
      expect(
        validateTotpSecret(
          "otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP",
        ),
      ).toBe(true);
    });

    it("rejects invalid secrets", () => {
      expect(validateTotpSecret("")).toBe(false);
      expect(validateTotpSecret("short")).toBe(false);
      expect(validateTotpSecret("12345890")).toBe(false); // 8, 9, 0, 1 are not Base32
    });

    it("cleans raw secrets and parses otpauth URIs", () => {
      expect(cleanTotpSecret("  jbsw-y3dp ehpk 3pxp  ")).toBe(
        "JBSWY3DPEHPK3PXP",
      );
      expect(
        cleanTotpSecret(
          "otpauth://totp/Acme:alice?secret=JBSWY3DPEHPK3PXP&issuer=Acme",
        ),
      ).toBe("JBSWY3DPEHPK3PXP");

      const parsed = parseTotpSecret(
        "otpauth://totp/TestApp:bob@example.com?secret=JBSWY3DPEHPK3PXP&period=60&digits=8",
      );
      expect(parsed.secret).toBe("JBSWY3DPEHPK3PXP");
      expect(parsed.period).toBe(60);
      expect(parsed.digits).toBe(8);
    });
  });

  describe("Code Formatting and Timers", () => {
    it("formats 6-digit and 8-digit OTP codes with spaces", () => {
      expect(formatOtpCode("123456")).toBe("123 456");
      expect(formatOtpCode("12345678")).toBe("1234 5678");
      expect(formatOtpCode("")).toBe("");
    });

    it("calculates time remaining and progress", () => {
      const remaining = getTotpTimeRemaining(30);
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(30);

      const progress = getTotpProgress(30);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
  });
});
