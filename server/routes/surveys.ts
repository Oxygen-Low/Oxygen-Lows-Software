import { Hono } from "hono";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getAllSurveys,
  getSurveyById,
  hasUserSubmittedSurvey,
  submitSurveyAnswers,
  calculateSurveyResults,
  saveCustomSurvey,
  deleteCustomSurvey,
  purgeExpiredMonthlySurveys,
  getDaysRemainingInCurrentMonth,
  getCurrentMonthKey,
  SurveyDefinition,
  ResponseVariant,
} from "../lib/surveys.ts";

export const surveysRouter = new Hono();

async function getAuthenticatedUser(c: any) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}

// Get all surveys with user completion status
surveysRouter.get("/", async (c) => {
  try {
    purgeExpiredMonthlySurveys();
    const user = await getAuthenticatedUser(c);
    const surveys = getAllSurveys();
    const currentMonthKey = getCurrentMonthKey();
    const daysRemaining = getDaysRemainingInCurrentMonth();

    const surveysWithStatus = surveys.map((s) => {
      const hasSubmitted = user ? hasUserSubmittedSurvey(user.id, s.id) : false;
      return {
        id: s.id,
        titleKey: s.titleKey,
        defaultTitle: s.defaultTitle,
        descriptionKey: s.descriptionKey,
        defaultDescription: s.defaultDescription,
        category: s.category,
        recurrence: s.recurrence,
        isPredefined: s.isPredefined,
        isActive: s.isActive,
        isHardwareSurvey: s.isHardwareSurvey || false,
        questionsCount: s.questions.length,
        hasSubmitted,
        currentMonthKey,
        daysRemaining,
      };
    });

    return c.json({
      surveys: surveysWithStatus,
      currentMonthKey,
      daysRemaining,
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to fetch surveys" }, 500);
  }
});

// Get a single survey details
surveysRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }

    const user = await getAuthenticatedUser(c);
    const hasSubmitted = user ? hasUserSubmittedSurvey(user.id, survey.id) : false;
    const currentMonthKey = getCurrentMonthKey();
    const daysRemaining = getDaysRemainingInCurrentMonth();

    return c.json({
      survey,
      hasSubmitted,
      currentMonthKey,
      daysRemaining,
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to fetch survey" }, 500);
  }
});

// Submit anonymous survey answers (Requires auth)
surveysRouter.post("/:id/submit", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Authentication required to submit surveys" }, 401);
    }

    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }

    if (!survey.isActive) {
      return c.json({ error: "This survey is currently closed" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const variant: ResponseVariant =
      body.variant === "verified" ? "verified" : "unverified";
    const answers = body.answers || {};

    if (typeof answers !== "object" || answers === null) {
      return c.json({ error: "Invalid survey answers payload" }, 400);
    }

    // Validate required questions
    for (const q of survey.questions) {
      if (q.required) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          (typeof val === "string" && val.trim() === "") ||
          (Array.isArray(val) && val.length === 0)
        ) {
          return c.json(
            { error: `Please answer required question: ${q.defaultTitle}` },
            400,
          );
        }
      }
    }

    const result = submitSurveyAnswers({
      userId: user.id,
      surveyId: id,
      variant,
      answers,
    });

    if (!result.success) {
      return c.json({ error: result.error || "Submission failed" }, 400);
    }

    return c.json({
      success: true,
      message: "Survey answers submitted anonymously.",
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to submit survey" }, 500);
  }
});

// Get aggregate survey results (Only accessible after user has submitted or if admin)
surveysRouter.get("/:id/results", async (c) => {
  try {
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }

    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Authentication required to view survey results" }, 401);
    }

    const isAdmin = user.role === "admin" || String(user.id) === "1";
    const hasSubmitted = hasUserSubmittedSurvey(user.id, survey.id);

    if (!hasSubmitted && !isAdmin) {
      return c.json(
        {
          error:
            "Survey results are hidden until you complete this month's survey.",
          locked: true,
        },
        403,
      );
    }

    const variantParam = c.req.query("variant");
    const variantFilter: "all" | "verified" | "unverified" =
      variantParam === "verified" || variantParam === "unverified"
        ? variantParam
        : "all";

    const results = calculateSurveyResults(id, variantFilter);
    if (!results) {
      return c.json({ error: "Failed to compute results" }, 500);
    }

    return c.json({
      results,
      daysRemaining: getDaysRemainingInCurrentMonth(),
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to fetch survey results" }, 500);
  }
});

// Admin: Create custom survey
surveysRouter.post("/admin/create", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { title, description, category, recurrence, questions } = body;

    if (!title || !description || !Array.isArray(questions) || questions.length === 0) {
      return c.json(
        { error: "Title, description, and at least one question are required." },
        400,
      );
    }

    const surveyId = `custom-${crypto.randomBytes(6).toString("hex")}`;
    const newSurvey: SurveyDefinition = {
      id: surveyId,
      titleKey: `surveys.custom.${surveyId}.title`,
      defaultTitle: title.trim(),
      descriptionKey: `surveys.custom.${surveyId}.desc`,
      defaultDescription: description.trim(),
      category: category || "General",
      recurrence: recurrence === "permanent" ? "permanent" : "monthly",
      isPredefined: false,
      isActive: true,
      questions: questions.map((q: any, idx: number) => ({
        id: q.id || `q_${idx + 1}`,
        titleKey: `surveys.custom.${surveyId}.q_${idx + 1}`,
        defaultTitle: q.defaultTitle || q.title || `Question ${idx + 1}`,
        type: q.type || "single_choice",
        required: q.required !== false,
        options: Array.isArray(q.options)
          ? q.options.map((opt: any) =>
              typeof opt === "string"
                ? { value: opt, defaultLabel: opt }
                : {
                    value: opt.value || opt.label,
                    defaultLabel: opt.defaultLabel || opt.label || opt.value,
                  },
            )
          : undefined,
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveCustomSurvey(newSurvey);
    return c.json({ success: true, survey: newSurvey });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create survey" }, 500);
  }
});

// Admin: Update custom survey
surveysRouter.patch("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    if (body.isActive !== undefined) {
      survey.isActive = Boolean(body.isActive);
    }
    if (body.title) survey.defaultTitle = String(body.title).trim();
    if (body.description) survey.defaultDescription = String(body.description).trim();
    if (body.category) survey.category = body.category;
    if (body.recurrence) survey.recurrence = body.recurrence;
    if (Array.isArray(body.questions)) survey.questions = body.questions;

    saveCustomSurvey(survey);
    return c.json({ success: true, survey });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to update survey" }, 500);
  }
});

// Admin: Delete custom survey
surveysRouter.delete("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    if (survey.isPredefined) {
      return c.json({ error: "Predefined surveys cannot be deleted" }, 400);
    }

    const deleted = deleteCustomSurvey(id);
    return c.json({ success: deleted });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to delete survey" }, 500);
  }
});

// Admin: Trigger monthly purge manually
surveysRouter.post("/admin/purge", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const stats = purgeExpiredMonthlySurveys();
    return c.json({ success: true, ...stats });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to purge surveys" }, 500);
  }
});
