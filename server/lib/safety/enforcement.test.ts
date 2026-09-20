import { describe, it, expect, beforeAll } from "vitest";
import { executeZeroToleranceLockdown } from "./enforcement.ts";
import { getActiveDefenderBannedIps } from "../defenderBannedIps.ts";
import { initUserFolder, getUserById } from "../dataStore.ts";
import { getQuarantinedIncidentById } from "./ncmecReporter.ts";

describe("Safety Enforcement - Zero-Tolerance Lockdown", () => {
  const testUserId = "safety_test_user_777";
  const testIp = "203.0.113.195";

  beforeAll(() => {
    initUserFolder(testUserId, {
      username: "offender_test",
      email: "offender@example.com",
      passwordHash: "mock_hash",
      salt: "mock_salt",
      role: "user",
      authVerifier: "valid_hash",
    });
  });

  it("executes complete lockdown across IP, user account, and NCMEC report dossier", async () => {
    const user = getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user.status).not.toBe("suspended");

    const result = await executeZeroToleranceLockdown({
      ip: testIp,
      user,
      surface: "image_gen_prompt",
      promptText: "prohibited prompt content",
      severity: 3,
      reason: "Matched illicit minor safety pattern",
      userAgent: "TestAgent/1.0",
    });

    expect(result.blocked).toBe(true);
    expect(result.ipBanned).toBe(true);
    expect(result.userSuspended).toBe(true);
    expect(result.incidentId).toBeDefined();

    // Verify IP is in active WebDefender bans
    const activeBans = getActiveDefenderBannedIps();
    const foundBan = activeBans.find((b) => b.ip === testIp);
    expect(foundBan).toBeDefined();
    expect(foundBan?.reason).toContain("Automated Zero-Tolerance Ban");

    // Verify User is suspended in dataStore
    const updatedUser = getUserById(testUserId);
    expect(updatedUser.status).toBe("suspended");
    expect(updatedUser.suspended).toBe(true);
    expect(updatedUser.auth_verifier).toBeNull();

    // Verify NCMEC dossier was persisted
    const savedReport = getQuarantinedIncidentById(result.incidentId);
    expect(savedReport).toBeDefined();
    expect(savedReport?.suspectUser.id).toBe(testUserId);
    expect(savedReport?.networkTelemetry.ip).toBe(testIp);
    expect(savedReport?.incidentDetails.promptText).toBe("prohibited prompt content");
    expect(savedReport?.status).toBe("quarantined");
  });
});
