import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateModerationCategories,
  checkOpenAiModeration,
  moderateText,
  moderateImage,
  handleModerationEnforcement,
  SELF_HARM_HELP_URL,
} from "./openAiModeration.ts";
import * as enforcementModule from "./enforcement.ts";

describe("OpenAI Moderation Engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("evaluateModerationCategories policy mapping", () => {
    it("allows clean/empty categories", () => {
      expect(evaluateModerationCategories({})).toEqual({ allowed: true });
      expect(
        evaluateModerationCategories({
          harassment: false,
          hate: false,
          sexual: false,
          violence: false,
        }),
      ).toEqual({ allowed: true, details: undefined });
    });

    it("allows general violence when violence/graphic is false", () => {
      const res = evaluateModerationCategories({
        violence: true,
        "violence/graphic": false,
      });
      expect(res.allowed).toBe(true);
    });

    it("blocks graphic violence", () => {
      const res = evaluateModerationCategories({
        violence: true,
        "violence/graphic": true,
      });
      expect(res.allowed).toBe(false);
      expect(res.category).toBe("violence/graphic");
    });

    it.each([
      "harassment",
      "harassment/threatening",
      "hate",
      "hate/threatening",
      "illicit",
      "illicit/violent",
      "sexual",
    ])("blocks %s category", (category) => {
      const res = evaluateModerationCategories({ [category]: true });
      expect(res.allowed).toBe(false);
      expect(res.category).toBe(category);
      expect(res.isSelfHarm).toBeFalsy();
      expect(res.isCsamMinorViolation).toBeFalsy();
    });

    it.each([
      "self-harm",
      "self-harm/intent",
      "self-harm/instructions",
    ])("blocks %s and flags for helpline redirection", (category) => {
      const res = evaluateModerationCategories({ [category]: true });
      expect(res.allowed).toBe(false);
      expect(res.category).toBe(category);
      expect(res.isSelfHarm).toBe(true);
      expect(res.redirectUrl).toBe(SELF_HARM_HELP_URL);
    });

    it("blocks sexual/minors and flags for CSAM lockdown escalation", () => {
      const res = evaluateModerationCategories({
        "sexual/minors": true,
        sexual: true,
      });
      expect(res.allowed).toBe(false);
      expect(res.category).toBe("sexual/minors");
      expect(res.isCsamMinorViolation).toBe(true);
    });
  });

  describe("checkOpenAiModeration fail-open & API integration", () => {
    it("fails open when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODERATION_API_KEY;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OPENAI_API_KEY is not configured"),
      );
    });

    it("fails open when OpenAI returns an HTTP error status", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("API returned HTTP 500"),
      );
    });

    it("fails open when fetch throws a network exception", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network timeout"));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Request failed; failing open"),
        expect.any(Error),
      );
    });

    it("successfully evaluates flagged text from OpenAI response", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              flagged: true,
              categories: {
                harassment: true,
                violence: false,
              },
            },
          ],
        }),
      } as any);

      const res = await moderateText("some harassing text");
      expect(res.allowed).toBe(false);
      expect(res.category).toBe("harassment");
    });

    it("moderates images using base64 data URL formatting", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      let capturedBody: any = null;
      vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                flagged: true,
                categories: {
                  "self-harm": true,
                },
              },
            ],
          }),
        } as any;
      });

      const buffer = Buffer.from("fake-image-bytes");
      const res = await moderateImage(buffer, "image/png");

      expect(res.allowed).toBe(false);
      expect(res.isSelfHarm).toBe(true);
      expect(res.redirectUrl).toBe(SELF_HARM_HELP_URL);
      expect(capturedBody.model).toBe("omni-moderation-latest");
      expect(capturedBody.input[0].type).toBe("image_url");
      expect(capturedBody.input[0].image_url.url).toContain("data:image/png;base64,");
    });
  });

  describe("handleModerationEnforcement", () => {
    it("returns null if result is allowed", async () => {
      const enforcement = await handleModerationEnforcement(
        { allowed: true },
        { ip: "127.0.0.1", surface: "chat" },
      );
      expect(enforcement).toBeNull();
    });

    it("returns self-harm redirect client response for self-harm", async () => {
      const enforcement = await handleModerationEnforcement(
        {
          allowed: false,
          category: "self-harm",
          isSelfHarm: true,
          redirectUrl: SELF_HARM_HELP_URL,
        },
        { ip: "127.0.0.1", surface: "ai_chat" },
      );

      expect(enforcement).not.toBeNull();
      expect(enforcement?.isLockdown).toBe(false);
      expect(enforcement?.clientResponse.code).toBe("SELF_HARM_DETECTED");
      expect(enforcement?.clientResponse.redirectUrl).toBe(SELF_HARM_HELP_URL);
      expect(enforcement?.clientResponse.category).toBe("self-harm");
    });

    it("escalates to executeZeroToleranceLockdown on sexual/minors", async () => {
      const mockLockdown = vi
        .spyOn(enforcementModule, "executeZeroToleranceLockdown")
        .mockResolvedValueOnce({
          blocked: true,
          incidentId: "inc_123",
          ipBanned: true,
          userSuspended: true,
          report: {} as any,
          clientResponse: {
            error: "Child safety violation",
            code: "CHILD_SAFETY_POLICY_VIOLATION",
          },
        });

      const enforcement = await handleModerationEnforcement(
        {
          allowed: false,
          category: "sexual/minors",
          isCsamMinorViolation: true,
        },
        { ip: "1.2.3.4", surface: "image_gen_prompt" },
      );

      expect(mockLockdown).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "1.2.3.4",
          surface: "image_gen_prompt",
          severity: 3,
        }),
      );
      expect(enforcement?.isLockdown).toBe(true);
      expect(enforcement?.clientResponse.code).toBe("CHILD_SAFETY_POLICY_VIOLATION");
    });

    it("returns standard CONTENT_POLICY_VIOLATION for general blocked category", async () => {
      const enforcement = await handleModerationEnforcement(
        {
          allowed: false,
          category: "hate/threatening",
        },
        { ip: "1.2.3.4", surface: "chat" },
      );

      expect(enforcement?.isLockdown).toBe(false);
      expect(enforcement?.clientResponse.code).toBe("CONTENT_POLICY_VIOLATION");
      expect(enforcement?.clientResponse.category).toBe("hate/threatening");
    });
  });
});
