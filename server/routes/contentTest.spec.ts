import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { contentTestRouter } from "./contentTest.ts";
import * as authLib from "../lib/auth.ts";
import * as openAiMod from "../lib/safety/openAiModeration.ts";
import * as enforcementLib from "../lib/safety/enforcement.ts";

describe("Content Moderation Test Route (/contenttest & /api/contenttest)", () => {
  const app = new Hono();
  app.route("/api/contenttest", contentTestRouter);

  const mockUser: any = {
    id: "user-123",
    email: "test@example.com",
    username: "testuser",
    role: "user",
    user_metadata: { username: "testuser", full_name: "Test User" },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(null);

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello world" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Authentication required");
  });

  it("passes completely benign text with safe: true", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    vi.spyOn(openAiMod, "moderateText").mockResolvedValue({ allowed: true });

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ text: "A peaceful sunny day in the park" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.safe).toBe(true);
    expect(json.message).toContain("passed all safety checks");
  });

  it("blocks CSAM and executes lockdown", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    const lockdownSpy = vi
      .spyOn(enforcementLib, "executeZeroToleranceLockdown")
      .mockResolvedValue({
        blocked: true,
        incidentId: "inc-1",
        ipBanned: true,
        userSuspended: true,
        report: {} as any,
        clientResponse: {
          error: "Child Safety Policy Violation",
          code: "CHILD_SAFETY_POLICY_VIOLATION",
        },
      });

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ text: "nude child photo" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.safe).toBe(false);
    expect(json.category).toBe("CSAM/CSAE");
    expect(json.code).toBe("CHILD_SAFETY_POLICY_VIOLATION");
    expect(lockdownSpy).toHaveBeenCalled();
  });

  it("blocks harassment via OpenAI moderation and returns reason and category", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    vi.spyOn(openAiMod, "moderateText").mockResolvedValue({
      allowed: false,
      category: "harassment",
      reason: "Content violates safety policy: harassment",
    });

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ text: "You are pathetic and nobody likes you" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.safe).toBe(false);
    expect(json.category).toBe("harassment");
    expect(json.code).toBe("CONTENT_POLICY_VIOLATION");
  });

  it("returns self-harm redirect info when self-harm is detected", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    vi.spyOn(openAiMod, "moderateText").mockResolvedValue({
      allowed: false,
      category: "self-harm",
      isSelfHarm: true,
      redirectUrl: "https://findahelpline.com/",
      reason: "Self-harm policy violation",
    });

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ text: "I want to hurt myself" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.safe).toBe(false);
    expect(json.category).toBe("self-harm");
    expect(json.code).toBe("SELF_HARM_DETECTED");
    expect(json.redirectUrl).toBe("https://findahelpline.com/");
  });

  it("passes general violence when not graphic (per policy)", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    vi.spyOn(openAiMod, "moderateText").mockResolvedValue({
      allowed: true,
    });

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ text: "The knight fought fiercely with his sword in battle" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.safe).toBe(true);
  });

  it("moderates image payloads successfully", async () => {
    vi.spyOn(authLib, "resolveUserFromToken").mockResolvedValue(mockUser);
    vi.spyOn(openAiMod, "moderateImage").mockResolvedValue({ allowed: true });

    // Valid 8-byte PNG header
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const b64 = pngBuffer.toString("base64");

    const res = await app.request("/api/contenttest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ image: `data:image/png;base64,${b64}` }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.safe).toBe(true);
  });
});
