import { Hono } from "hono";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getAllAwards,
  getAwardById,
  isAwardActive,
  hasUserVoted,
  submitVote,
  calculateAwardResults,
  saveAward,
  deleteAward,
  getCurrentMonthKey,
} from "../lib/softwareAwards.ts";

export const softwareAwardsRouter = new Hono();

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

// Get all awards
softwareAwardsRouter.get("/", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const awards = getAllAwards();
    const currentMonthKey = getCurrentMonthKey();

    const awardsWithStatus = awards.map((a) => {
      const hasVoted = user ? hasUserVoted(user.id, a.id) : false;
      const active = isAwardActive(a);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        rewardName: a.rewardName,
        options: a.options,
        isActive: active,
        hasVoted,
        currentMonthKey,
      };
    });

    return c.json({
      awards: awardsWithStatus,
      currentMonthKey,
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to fetch awards" }, 500);
  }
});

// Submit vote
softwareAwardsRouter.post("/:id/vote", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Authentication required to vote" }, 401);
    }

    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }

    if (!isAwardActive(award)) {
      return c.json({ error: "Voting is closed for this award" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const answer = body.answer;

    if (!answer || typeof answer !== "string") {
      return c.json({ error: "Invalid answer payload" }, 400);
    }

    // validate if answer is in options
    if (!award.options.find((o) => o.value === answer)) {
      return c.json({ error: "Invalid option selected" }, 400);
    }

    const result = submitVote({
      userId: user.id,
      awardId: id,
      answer,
    });

    if (!result.success) {
      return c.json({ error: result.error || "Submission failed" }, 400);
    }

    return c.json({
      success: true,
      message: "Vote submitted anonymously.",
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to submit vote" }, 500);
  }
});

// Get results
softwareAwardsRouter.get("/:id/results", async (c) => {
  try {
    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }

    if (isAwardActive(award)) {
      return c.json(
        {
          error: "Award results are hidden until the voting period is over.",
          locked: true,
        },
        403,
      );
    }

    const results = calculateAwardResults(id);
    if (!results) {
      return c.json({ error: "Failed to compute results" }, 500);
    }

    return c.json({
      results,
    });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to fetch results" }, 500);
  }
});

// Admin endpoints
softwareAwardsRouter.post("/admin/create", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { title, description, rewardName, options } = body;

    if (
      !title ||
      !description ||
      !rewardName ||
      !Array.isArray(options) ||
      options.length === 0
    ) {
      return c.json(
        { error: "Title, description, reward name, and options are required." },
        400,
      );
    }

    const awardId = `award-${crypto.randomBytes(6).toString("hex")}`;
    const newAward = {
      id: awardId,
      title: title.trim(),
      description: description.trim(),
      rewardName: rewardName.trim(),
      options: options.map((opt: any) =>
        typeof opt === "string"
          ? { value: opt, defaultLabel: opt }
          : {
              value: opt.value || opt.label,
              defaultLabel: opt.defaultLabel || opt.label || opt.value,
            },
      ),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveAward(newAward);
    return c.json({ success: true, award: newAward });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create award" }, 500);
  }
});

softwareAwardsRouter.patch("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    if (body.title) award.title = String(body.title).trim();
    if (body.description) award.description = String(body.description).trim();
    if (body.rewardName) award.rewardName = String(body.rewardName).trim();
    if (Array.isArray(body.options)) award.options = body.options;

    saveAward(award);
    return c.json({ success: true, award });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to update award" }, 500);
  }
});

softwareAwardsRouter.delete("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || (user.role !== "admin" && String(user.id) !== "1")) {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }

    const deleted = deleteAward(id);
    return c.json({ success: deleted });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to delete award" }, 500);
  }
});
