import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { surveysRouter } from "./surveys.ts";
import { generateToken } from "../lib/auth.ts";
import { DATA_DIR, initUserFolder } from "../lib/dataStore.ts";
import {
  SURVEYS_DIR,
  ensureSurveysDir,
  getAllSurveys,
  getSurveyById,
  submitSurveyAnswers,
  calculateSurveyResults,
  purgeExpiredMonthlySurveys,
  getCurrentMonthKey,
} from "../lib/surveys.ts";

describe("Surveys API & Core Engine", () => {
  const app = new Hono();
  app.route("/api/surveys", surveysRouter);

  const testUserId = "survey-user-99881";
  const adminUserId = "survey-admin-99882";
  let userToken: string;
  let adminToken: string;

  beforeEach(() => {
    ensureSurveysDir();
    initUserFolder(testUserId, {
      username: "surveyuser",
      email: "surveyuser@example.com",
      passwordHash: "hash",
      salt: "salt",
      role: "user",
    });
    initUserFolder(adminUserId, {
      username: "surveyadmin",
      email: "surveyadmin@example.com",
      passwordHash: "hash",
      salt: "salt",
      role: "admin",
    });

    userToken = generateToken({
      id: testUserId,
      username: "surveyuser",
      email: "surveyuser@example.com",
      role: "user",
    });

    adminToken = generateToken({
      id: adminUserId,
      username: "surveyadmin",
      email: "surveyadmin@example.com",
      role: "admin",
    });

    // Clear test survey response data
    try {
      if (fs.existsSync(path.join(SURVEYS_DIR, "responses.json"))) {
        fs.writeFileSync(path.join(SURVEYS_DIR, "responses.json"), "[]", "utf-8");
      }
      if (fs.existsSync(path.join(SURVEYS_DIR, "submissions.json"))) {
        fs.writeFileSync(path.join(SURVEYS_DIR, "submissions.json"), "[]", "utf-8");
      }
      if (fs.existsSync(path.join(SURVEYS_DIR, "monthly_history.json"))) {
        fs.writeFileSync(path.join(SURVEYS_DIR, "monthly_history.json"), "[]", "utf-8");
      }
    } catch {}
  });

  afterEach(() => {
    try {
      const uPath1 = path.join(DATA_DIR, testUserId);
      if (fs.existsSync(uPath1)) fs.rmSync(uPath1, { recursive: true, force: true });
      const uPath2 = path.join(DATA_DIR, adminUserId);
      if (fs.existsSync(uPath2)) fs.rmSync(uPath2, { recursive: true, force: true });
    } catch {}
  });

  it("should return predefined surveys list with monthly countdown info", async () => {
    const res = await app.request("/api/surveys");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.surveys).toBeDefined();
    expect(json.surveys.length).toBeGreaterThanOrEqual(3);

    const hardware = json.surveys.find((s: any) => s.id === "monthly-hardware-survey");
    expect(hardware).toBeDefined();
    expect(hardware.category).toBe("Hardware");
    expect(hardware.recurrence).toBe("monthly");
    expect(hardware.hasSubmitted).toBe(false);
  });

  it("should fetch a specific survey details and schema", async () => {
    const res = await app.request("/api/surveys/monthly-browser-survey");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.survey).toBeDefined();
    expect(json.survey.questions.length).toBeGreaterThan(0);
    expect(json.hasSubmitted).toBe(false);
  });

  it("should prevent submission without authentication", async () => {
    const res = await app.request("/api/surveys/monthly-browser-survey/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant: "verified",
        answers: { main_browser: "Chrome" },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("should accept valid anonymous submission and lock duplicate monthly submissions", async () => {
    const res1 = await app.request("/api/surveys/monthly-browser-survey/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        variant: "verified",
        answers: { main_browser: "Chrome" },
      }),
    });
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.success).toBe(true);

    // Verify answers stored anonymously (without userId)
    const responsesFile = path.join(SURVEYS_DIR, "responses.json");
    const responses = JSON.parse(fs.readFileSync(responsesFile, "utf-8"));
    expect(responses.length).toBe(1);
    expect(responses[0].user_id).toBeUndefined();
    expect(responses[0].username).toBeUndefined();
    expect(responses[0].answers.main_browser).toBe("Chrome");

    // Second submission in same month should fail
    const res2 = await app.request("/api/surveys/monthly-browser-survey/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        variant: "verified",
        answers: { main_browser: "Firefox" },
      }),
    });
    expect(res2.status).toBe(400);
    const json2 = await res2.json();
    expect(json2.error).toContain("already submitted");
  });

  it("should hide results before completion for regular users, but allow after submission", async () => {
    // Before submission: user 99881 cannot view results for gaming survey
    const resLocked = await app.request("/api/surveys/monthly-gaming-survey/results", {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    expect(resLocked.status).toBe(403);

    // Admin can view results even before submitting
    const resAdmin = await app.request("/api/surveys/monthly-gaming-survey/results", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(resAdmin.status).toBe(200);

    // User submits gaming survey
    const submitRes = await app.request("/api/surveys/monthly-gaming-survey/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        variant: "unverified",
        answers: {
          gaming_platform: "PC",
          favourite_genre: "RPG",
          input_device: "Keyboard + Mouse",
          weekly_hours: "6 - 15 hours",
        },
      }),
    });
    expect(submitRes.status).toBe(200);

    // Now results are unlocked for user!
    const resUnlocked = await app.request("/api/surveys/monthly-gaming-survey/results", {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    expect(resUnlocked.status).toBe(200);
    const jsonUnlocked = await resUnlocked.json();
    expect(jsonUnlocked.results.totalSubmissions).toBe(1);
    expect(jsonUnlocked.results.isHardwareSurvey).toBe(false);
    expect(jsonUnlocked.results.questions.length).toBeGreaterThan(0);
    expect(jsonUnlocked.results.questions[0].lineChartSeries).toBeDefined();
    expect(jsonUnlocked.results.questions[0].monthlyTimeline).toBeDefined();
    expect(jsonUnlocked.results.questions[0].monthlyTimeline.length).toBe(12);
    expect(jsonUnlocked.results.questions[0].seriesKeys.length).toBeGreaterThan(0);

    // Now test hardware survey specifically for verified/unverified exclusivity
    const hwSubmitRes = await app.request("/api/surveys/monthly-hardware-survey/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        variant: "verified",
        answers: {
          os: "Windows 11",
          form_factor: "Desktop PC",
          cpu_manufacturer: "AMD",
          cpu_name: "Ryzen 7 7800X3D",
          cpu_cores: "8",
          gpu_manufacturer: "NVIDIA",
          gpu_name: "RTX 4080",
          ram_amount_gb: "32 GB",
          storage_total_gb: "2 TB (2000 GB)",
          storage_free_gb: "500 GB - 1 TB",
          storage_type: "NVMe SSD (M.2 / PCIe)",
        },
      }),
    });
    expect(hwSubmitRes.status).toBe(200);

    const hwResultsRes = await app.request("/api/surveys/monthly-hardware-survey/results", {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    expect(hwResultsRes.status).toBe(200);
    const hwResultsJson = await hwResultsRes.json();
    expect(hwResultsJson.results.isHardwareSurvey).toBe(true);
    expect(hwResultsJson.results.verifiedCount).toBe(1);
    expect(hwResultsJson.results.unverifiedCount).toBe(0);
    expect(hwResultsJson.results.questions[0].monthlyTimeline.length).toBe(12);
  });

  it("should allow admin to create and delete custom surveys", async () => {
    const createRes = await app.request("/api/surveys/admin/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Programming Languages Survey",
        description: "What primary language do you code in?",
        category: "Development",
        recurrence: "permanent",
        questions: [
          {
            title: "Primary Language",
            type: "single_choice",
            required: true,
            options: ["TypeScript", "Rust", "Python", "C#", "Go"],
          },
        ],
      }),
    });
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.success).toBe(true);
    const createdId = createJson.survey.id;

    // Verify it appears in surveys list
    const listRes = await app.request("/api/surveys");
    const listJson = await listRes.json();
    expect(listJson.surveys.some((s: any) => s.id === createdId)).toBe(true);

    // Delete custom survey
    const delRes = await app.request(`/api/surveys/admin/${createdId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(delRes.status).toBe(200);

    // Verify it is gone
    const listResAfter = await app.request("/api/surveys");
    const listJsonAfter = await listResAfter.json();
    expect(listJsonAfter.surveys.some((s: any) => s.id === createdId)).toBe(false);
  });

  it("should purge expired monthly responses across cycles", async () => {
    // Insert an expired response from 2025-01
    const responsesFile = path.join(SURVEYS_DIR, "responses.json");
    const submissionsFile = path.join(SURVEYS_DIR, "submissions.json");
    fs.writeFileSync(
      responsesFile,
      JSON.stringify([
        {
          id: "exp_1",
          survey_id: "monthly-hardware-survey",
          month_key: "2025-01",
          variant: "verified",
          answers: { os: "Windows 10" },
          created_at: "2025-01-15T00:00:00.000Z",
        },
      ]),
      "utf-8",
    );
    fs.writeFileSync(
      submissionsFile,
      JSON.stringify([
        {
          id: "sub_1",
          user_id: testUserId,
          survey_id: "monthly-hardware-survey",
          month_key: "2025-01",
          created_at: "2025-01-15T00:00:00.000Z",
        },
      ]),
      "utf-8",
    );

    const stats = purgeExpiredMonthlySurveys();
    expect(stats.purgedResponses).toBe(1);
    expect(stats.purgedSubmissions).toBe(1);

    const afterResponses = JSON.parse(fs.readFileSync(responsesFile, "utf-8"));
    expect(afterResponses.length).toBe(0);
  });
});
