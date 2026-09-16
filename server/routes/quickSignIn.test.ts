import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRouter } from "./auth.ts";
import { clearAllQuickSignInSessions } from "../lib/quickSignIn.ts";

const app = new Hono();
app.route("/api/auth", authRouter);

describe("Quick Sign In API", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  let authToken = "";
  let userEmail = `quickuser_${uniqueSuffix}@example.com`;

  beforeEach(() => {
    clearAllQuickSignInSessions();
  });

  it("should create, verify, approve, and poll a quick sign-in session successfully", async () => {
    // 1. Register a user who will act as the authenticated device
    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `quickuser_${uniqueSuffix}`,
        email: userEmail,
        password: "securePassword123",
      }),
    });
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();
    authToken = regData.token;

    // 2. Unauthenticated device creates quick sign-in session
    const createRes = await app.request("/api/auth/quick-sign-in/create", {
      method: "POST",
      headers: {
        "user-agent": "TestBrowser/1.0",
        "x-forwarded-for": "192.168.1.50",
      },
    });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    expect(createData.sessionId).toBeDefined();
    expect(createData.code).toBeDefined();
    expect(createData.code.length).toBe(6);
    expect(createData.expiresAt).toBeGreaterThan(Date.now());

    // 3. Polling before approval returns status: pending
    const pollPendingRes = await app.request(
      `/api/auth/quick-sign-in/poll?sessionId=${createData.sessionId}`,
    );
    expect(pollPendingRes.status).toBe(200);
    const pollPendingData = await pollPendingRes.json();
    expect(pollPendingData.status).toBe("pending");

    // 4. Authenticated device verifies the code
    const verifyRes = await app.request("/api/auth/quick-sign-in/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ code: createData.code.toLowerCase() }), // test case-insensitivity
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.valid).toBe(true);
    expect(verifyData.ip).toBe("192.168.1.50");
    expect(verifyData.userAgent).toBe("TestBrowser/1.0");

    // 5. Authenticated device approves the session
    const approveRes = await app.request("/api/auth/quick-sign-in/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ code: createData.code }),
    });
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);

    // 6. Unauthenticated device polls again and receives authenticated session & token
    const pollApprovedRes = await app.request(
      `/api/auth/quick-sign-in/poll?sessionId=${createData.sessionId}`,
    );
    expect(pollApprovedRes.status).toBe(200);
    const pollApprovedData = await pollApprovedRes.json();
    expect(pollApprovedData.status).toBe("approved");
    expect(pollApprovedData.token).toBeDefined();
    expect(pollApprovedData.token.startsWith("ol_")).toBe(true);
    expect(pollApprovedData.user.email).toBe(userEmail);
  });

  it("should handle rejection of a quick sign-in code", async () => {
    // Register user
    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `rejuser_${uniqueSuffix}`,
        email: `rejuser_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });
    const regData = await regRes.json();

    // Create session
    const createRes = await app.request("/api/auth/quick-sign-in/create", {
      method: "POST",
    });
    const { sessionId, code } = await createRes.json();

    // Reject session
    const rejectRes = await app.request("/api/auth/quick-sign-in/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${regData.token}`,
      },
      body: JSON.stringify({ code }),
    });
    expect(rejectRes.status).toBe(200);

    // Polling receives status: rejected
    const pollRes = await app.request(
      `/api/auth/quick-sign-in/poll?sessionId=${sessionId}`,
    );
    const pollData = await pollRes.json();
    expect(pollData.status).toBe("rejected");
  });

  it("should return error for invalid or nonexistent code", async () => {
    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `invuser_${uniqueSuffix}`,
        email: `invuser_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });
    const regData = await regRes.json();

    const verifyRes = await app.request("/api/auth/quick-sign-in/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${regData.token}`,
      },
      body: JSON.stringify({ code: "ZZZZZZ" }),
    });
    expect(verifyRes.status).toBe(400);
  });
});
