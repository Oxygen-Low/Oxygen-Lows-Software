import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateModerationCategories,
  evaluateQwen3GuardVerdict,
  parseQwen3GuardOutput,
  checkPollinationsModeration,
  moderateText,
  moderateImage,
  handleModerationEnforcement,
  SELF_HARM_HELP_URL,
  POLLINATIONS_MODERATION_MODEL,
} from "./openAiModeration.ts";
import * as enforcementModule from "./enforcement.ts";

describe("Pollinations Qwen3Guard Moderation Engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("parseQwen3GuardOutput", () => {
    it("parses standard Safe output", () => {
      const parsed = parseQwen3GuardOutput("Safety: Safe\nCategories: None");
      expect(parsed.safety).toBe("Safe");
      expect(parsed.categories).toEqual([]);
    });

    it("parses Controversial output with categories", () => {
      const parsed = parseQwen3GuardOutput("Safety: Controversial\nCategories: Politically Sensitive Topics");
      expect(parsed.safety).toBe("Controversial");
      expect(parsed.categories).toEqual(["Politically Sensitive Topics"]);
    });

    it("parses Unsafe output with single category", () => {
      const parsed = parseQwen3GuardOutput("Safety: Unsafe\nCategories: Violent");
      expect(parsed.safety).toBe("Unsafe");
      expect(parsed.categories).toEqual(["Violent"]);
    });

    it("parses Unsafe output with multiple comma-separated categories", () => {
      const parsed = parseQwen3GuardOutput("Safety: Unsafe\nCategories: Violent, Non-violent Illegal Acts");
      expect(parsed.safety).toBe("Unsafe");
      expect(parsed.categories).toEqual(["Violent", "Non-violent Illegal Acts"]);
    });

    it("returns Unknown for empty or non-string input", () => {
      expect(parseQwen3GuardOutput("").safety).toBe("Unknown");
      expect(parseQwen3GuardOutput(null as any).safety).toBe("Unknown");
    });
  });

  describe("evaluateQwen3GuardVerdict policy mapping", () => {
    it("allows Safe verdicts", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Safe",
        categories: [],
        rawText: "Safety: Safe\nCategories: None",
      });
      expect(res.allowed).toBe(true);
    });

    it("allows Controversial verdicts in Standard Mode", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Controversial",
        categories: ["Politically Sensitive Topics"],
        rawText: "Safety: Controversial\nCategories: Politically Sensitive Topics",
      });
      expect(res.allowed).toBe(true);
    });

    it("blocks Unsafe verdicts for violent content", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Unsafe",
        categories: ["Violent"],
        rawText: "Safety: Unsafe\nCategories: Violent",
      });
      expect(res.allowed).toBe(false);
      expect(res.category).toBe("Violent");
      expect(res.isSelfHarm).toBeFalsy();
      expect(res.isCsamMinorViolation).toBeFalsy();
    });

    it("blocks Unsafe verdicts for Suicide & Self-Harm and flags for helpline redirection", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Unsafe",
        categories: ["Suicide & Self-Harm"],
        rawText: "Safety: Unsafe\nCategories: Suicide & Self-Harm",
      });
      expect(res.allowed).toBe(false);
      expect(res.isSelfHarm).toBe(true);
      expect(res.redirectUrl).toBe(SELF_HARM_HELP_URL);
    });

    it("blocks Unsafe verdicts mentioning child or minor exploitation and flags for CSAM lockdown", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Unsafe",
        categories: ["Child Sexual Abuse Material (CSAM)", "Exploitation"],
        rawText: "Safety: Unsafe\nCategories: CSAM, Exploitation",
      });
      expect(res.allowed).toBe(false);
      expect(res.isCsamMinorViolation).toBe(true);
      expect(res.category).toBe("sexual/minors");
    });

    it("fails closed on Unknown verdict", () => {
      const res = evaluateQwen3GuardVerdict({
        safety: "Unknown",
        categories: [],
        rawText: "Garbled output",
      });
      expect(res.allowed).toBe(false);
      expect(res.isServiceUnavailable).toBe(true);
    });
  });

  describe("evaluateModerationCategories legacy mapping", () => {
    it("allows clean/empty categories", () => {
      expect(evaluateModerationCategories({})).toEqual({ allowed: true });
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
    });
  });

  describe("API integration & fail-closed behavior", () => {
    it("bypasses cloud moderation when POLLINATIONS_API_KEY is missing", async () => {
      delete process.env.POLLINATIONS_API_KEY;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("POLLINATIONS_API_KEY is not configured"),
      );
    });

    it("fails closed when Pollinations API returns an HTTP error status", async () => {
      process.env.POLLINATIONS_API_KEY = "pk_test_123";
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as any);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(false);
      expect(res.isServiceUnavailable).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("API returned HTTP 500"),
      );
    });

    it("fails closed when fetch throws a network exception", async () => {
      process.env.POLLINATIONS_API_KEY = "pk_test_123";
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network timeout"));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await moderateText("test text");
      expect(res.allowed).toBe(false);
      expect(res.isServiceUnavailable).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Request failed; failing closed"),
        expect.stringContaining("Network timeout"),
      );
    });

    it("blocks direct violent threats via baseline heuristic even if API key is missing", async () => {
      delete process.env.POLLINATIONS_API_KEY;

      const res = await moderateText("I'm going to hunt you down and harm you.");
      expect(res.allowed).toBe(false);
      expect(res.category).toBe("harassment/threatening");
      expect(res.reason).toContain("threat of violence");
    });

    it("successfully calls qwen/qwen3guard-gen-8b on Pollinations endpoint", async () => {
      process.env.POLLINATIONS_API_KEY = "pk_test_123";
      let capturedBody: any = null;
      let capturedUrl = "";

      vi.spyOn(global, "fetch").mockImplementationOnce(async (url: any, opts: any) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Safety: Safe\nCategories: None",
                },
              },
            ],
          }),
        } as any;
      });

      const res = await moderateText("Hello world!");
      expect(res.allowed).toBe(true);
      expect(capturedUrl).toBe("https://gen.pollinations.ai/v1/chat/completions");
      expect(capturedBody.model).toBe(POLLINATIONS_MODERATION_MODEL);
      expect(capturedBody.messages[0].content).toBe("Hello world!");
    });

    it("moderateImage bypasses cloud moderation and returns allowed", async () => {
      const buffer = Buffer.from("fake-image-bytes");
      const res = await moderateImage(buffer, "image/png");
      expect(res.allowed).toBe(true);
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

    it("returns MODERATION_SERVICE_UNAVAILABLE when service is unavailable", async () => {
      const enforcement = await handleModerationEnforcement(
        {
          allowed: false,
          isServiceUnavailable: true,
          apiError: "HTTP 500",
        },
        { ip: "127.0.0.1", surface: "chat" },
      );

      expect(enforcement).not.toBeNull();
      expect(enforcement?.isLockdown).toBe(false);
      expect(enforcement?.clientResponse.code).toBe("MODERATION_SERVICE_UNAVAILABLE");
    });

    it("returns self-harm redirect client response for self-harm", async () => {
      const enforcement = await handleModerationEnforcement(
        {
          allowed: false,
          category: "Suicide & Self-Harm",
          isSelfHarm: true,
          redirectUrl: SELF_HARM_HELP_URL,
        },
        { ip: "127.0.0.1", surface: "ai_chat" },
      );

      expect(enforcement).not.toBeNull();
      expect(enforcement?.isLockdown).toBe(false);
      expect(enforcement?.clientResponse.code).toBe("SELF_HARM_DETECTED");
      expect(enforcement?.clientResponse.redirectUrl).toBe(SELF_HARM_HELP_URL);
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
        { ip: "1.2.3.4", surface: "chat_prompt" },
      );

      expect(mockLockdown).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "1.2.3.4",
          surface: "chat_prompt",
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
          category: "Violent",
        },
        { ip: "1.2.3.4", surface: "chat" },
      );

      expect(enforcement?.isLockdown).toBe(false);
      expect(enforcement?.clientResponse.code).toBe("CONTENT_POLICY_VIOLATION");
      expect(enforcement?.clientResponse.category).toBe("Violent");
    });
  });
});
