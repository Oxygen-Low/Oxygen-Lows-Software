import { Hono } from "hono";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  generateAgentToken,
  generateRandomPassword,
  generateVerificationCode,
  hashAgentPassword,
  verifyAgentPassword,
  requireAgentAuth,
} from "../lib/agentAuth.ts";
import {
  getTableRows,
  saveTableRows,
  insertTable,
  updateTable,
  deleteTable,
  readJsonFile,
  DATA_DIR,
} from "../lib/dataStore.ts";
import { sanitizePath } from "../lib/storage.ts";

export const agentsRouter = new Hono<{
  Variables: {
    agent: any;
    agentId: string;
    user: any;
    userId: string;
  };
}>();

// Helper: Ensure agent storage directory exists
const AGENTS_STORAGE_DIR = path.join(DATA_DIR, "agent_storage");
if (!fs.existsSync(AGENTS_STORAGE_DIR)) {
  fs.mkdirSync(AGENTS_STORAGE_DIR, { recursive: true });
}

// User Authentication Middleware for /api/agents/user/*
async function requireUserAuth(c: any, next: any) {
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.replace(/^Bearer /i, "").trim() || c.req.query("token");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("user", user);
  c.set("userId", String(user.id));
  await next();
}

// ============================================================================
// 1. Multi-Step Registration Flow
// ============================================================================

// Step 1: Pick a username
agentsRouter.post("/register/step1", async (c) => {
  try {
    const body = await c.req.json();
    const username = (body.username || "").trim().toLowerCase();

    if (!username || username.length < 3 || username.length > 30) {
      return c.json(
        { error: "Username must be between 3 and 30 characters" },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9_-]+$/.test(username)) {
      return c.json(
        {
          error:
            "Username can only contain alphanumeric characters, underscores, and hyphens",
        },
        { status: 400 },
      );
    }

    // Check existing accounts
    const existingAccounts = getTableRows("agent_accounts");
    if (existingAccounts.some((a: any) => a.username.toLowerCase() === username)) {
      return c.json({ error: "Username is already taken" }, { status: 409 });
    }

    // Clean up expired registrations
    const now = Date.now();
    let registrations = getTableRows("agent_registrations");
    registrations = registrations.filter((r: any) => r.expires_at > now);

    if (
      registrations.some(
        (r: any) =>
          r.status === "pending" && r.username.toLowerCase() === username,
      )
    ) {
      return c.json(
        { error: "A registration for this username is already in progress" },
        { status: 409 },
      );
    }

    const regId = crypto.randomUUID();
    const newReg = {
      id: regId,
      username,
      display_name: "",
      bio: "",
      verification_code: "",
      generated_password: "",
      status: "pending",
      step: 1,
      expires_at: now + 24 * 60 * 60 * 1000, // 24 hours
      created_at: new Date().toISOString(),
    };

    insertTable("agent_registrations", [newReg], "global");

    return c.json({
      success: true,
      registration_id: regId,
      username,
      next_step: 2,
      message: "Username accepted. Proceed to Step 2 (Pick a display name).",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to process step 1" }, { status: 500 });
  }
});

// Step 2: Pick a display name
agentsRouter.post("/register/step2", async (c) => {
  try {
    const body = await c.req.json();
    const { registration_id, display_name } = body;

    if (!registration_id) {
      return c.json({ error: "Missing registration_id" }, { status: 400 });
    }

    const trimmedName = (display_name || "").trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 50) {
      return c.json(
        { error: "Display name must be between 2 and 50 characters" },
        { status: 400 },
      );
    }

    const registrations = getTableRows("agent_registrations");
    const reg = registrations.find(
      (r: any) => r.id === registration_id && r.status === "pending",
    );

    if (!reg) {
      return c.json({ error: "Registration session not found or expired" }, { status: 404 });
    }

    updateTable(
      "agent_registrations",
      [{ field: "id", operator: "eq", value: registration_id }],
      { display_name: trimmedName, step: 2 },
      "global",
    );

    return c.json({
      success: true,
      registration_id,
      display_name: trimmedName,
      next_step: 3,
      message: "Display name accepted. Proceed to Step 3 (Create a bio).",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to process step 2" }, { status: 500 });
  }
});

// Step 3: Create a bio
agentsRouter.post("/register/step3", async (c) => {
  try {
    const body = await c.req.json();
    const { registration_id, bio } = body;

    if (!registration_id) {
      return c.json({ error: "Missing registration_id" }, { status: 400 });
    }

    const trimmedBio = (bio || "").trim();
    if (trimmedBio.length > 500) {
      return c.json({ error: "Bio cannot exceed 500 characters" }, { status: 400 });
    }

    const registrations = getTableRows("agent_registrations");
    const reg = registrations.find(
      (r: any) => r.id === registration_id && r.status === "pending",
    );

    if (!reg) {
      return c.json({ error: "Registration session not found or expired" }, { status: 404 });
    }

    updateTable(
      "agent_registrations",
      [{ field: "id", operator: "eq", value: registration_id }],
      { bio: trimmedBio, step: 3 },
      "global",
    );

    return c.json({
      success: true,
      registration_id,
      bio: trimmedBio,
      next_step: 4,
      message: "Bio accepted. Proceed to Step 4 (Generate Verification Code).",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to process step 3" }, { status: 500 });
  }
});

// Step 4: Verification + email code generation
agentsRouter.post("/register/step4", async (c) => {
  try {
    const body = await c.req.json();
    const { registration_id } = body;

    if (!registration_id) {
      return c.json({ error: "Missing registration_id" }, { status: 400 });
    }

    const registrations = getTableRows("agent_registrations");
    const reg = registrations.find(
      (r: any) => r.id === registration_id && r.status === "pending",
    );

    if (!reg) {
      return c.json({ error: "Registration session not found or expired" }, { status: 404 });
    }

    // Generate unique verification code
    let verificationCode = generateVerificationCode();
    while (
      registrations.some(
        (r: any) =>
          r.status === "pending" && r.verification_code === verificationCode,
      )
    ) {
      verificationCode = generateVerificationCode();
    }

    updateTable(
      "agent_registrations",
      [{ field: "id", operator: "eq", value: registration_id }],
      {
        verification_code: verificationCode,
        step: 4,
      },
      "global",
    );

    return c.json({
      success: true,
      registration_id,
      verification_code: verificationCode,
      instructions:
        "Please ask your human owner to visit Oxygen Low's Software at /apps/agents and enter this verification code to confirm your registration.",
      status_url: `/api/agents/register/status/${registration_id}`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to process step 4" }, { status: 500 });
  }
});

// Polling status for agent registration
agentsRouter.get("/register/status/:registration_id", async (c) => {
  const regId = c.req.param("registration_id");
  const registrations = getTableRows("agent_registrations");
  const reg = registrations.find((r: any) => r.id === regId);

  if (!reg) {
    return c.json({ error: "Registration session not found" }, { status: 404 });
  }

  if (reg.status === "approved") {
    return c.json({
      status: "approved",
      username: reg.username,
      display_name: reg.display_name,
      password: reg.generated_password,
      message:
        "Your account has been approved by your human owner! Save your password securely to log in.",
    });
  }

  if (reg.expires_at < Date.now()) {
    return c.json({
      status: "expired",
      message: "This registration code has expired. Please sign up again.",
    });
  }

  return c.json({
    status: "pending",
    verification_code: reg.verification_code,
    message: "Waiting for human owner approval in /apps/agents...",
  });
});

// ============================================================================
// 2. Agent Authentication (Login & Me)
// ============================================================================

agentsRouter.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const username = (body.username || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    if (!username || !password) {
      return c.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const accounts = getTableRows("agent_accounts");
    const agent = accounts.find(
      (a: any) => a.username.toLowerCase() === username,
    );

    if (!agent) {
      return c.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (agent.status === "suspended") {
      return c.json(
        { error: "This agent account is suspended by its owner" },
        { status: 403 },
      );
    }

    const isValid = verifyAgentPassword(
      password,
      agent.password_verifier,
      agent.salt,
    );
    if (!isValid) {
      return c.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = generateAgentToken(agent);

    return c.json({
      success: true,
      token,
      agent: {
        id: agent.id,
        username: agent.username,
        display_name: agent.display_name,
        bio: agent.bio,
        email: agent.email,
        storage_quota_bytes: agent.storage_quota_bytes,
        storage_used_bytes: agent.storage_used_bytes || 0,
        allow_user_webdefender_access: !!agent.allow_user_webdefender_access,
        created_at: agent.created_at,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Login failed" }, { status: 500 });
  }
});

agentsRouter.get("/me", requireAgentAuth, async (c) => {
  const agent = c.get("agent");
  return c.json({
    agent: {
      id: agent.id,
      username: agent.username,
      display_name: agent.display_name,
      bio: agent.bio,
      email: agent.email,
      storage_quota_bytes: agent.storage_quota_bytes,
      storage_used_bytes: agent.storage_used_bytes || 0,
      allow_user_webdefender_access: !!agent.allow_user_webdefender_access,
      status: agent.status,
      created_at: agent.created_at,
    },
  });
});

// ============================================================================
// 3. User-Side Management (/apps/agents endpoints)
// ============================================================================

// User verifies agent registration code
agentsRouter.post("/user/verify", requireUserAuth, async (c) => {
  try {
    const user = c.get("user");
    const userId = c.get("userId");
    const body = await c.req.json();
    const code = (body.verification_code || "").trim().toUpperCase();
    const emailPreference = body.email_preference === "custom" ? "custom" : "owner";
    const customEmail = (body.bot_email || "").trim();
    const storageQuotaMb = Math.max(10, Math.min(5000, Number(body.storage_quota_mb) || 100));
    const allowWebdefender = !!body.allow_webdefender;

    if (!code) {
      return c.json({ error: "Verification code is required" }, { status: 400 });
    }

    const botEmail = emailPreference === "custom" && customEmail ? customEmail : (user.email || `${user.username}@oxygenlowssoftware.com`);

    const registrations = getTableRows("agent_registrations");
    const reg = registrations.find(
      (r: any) =>
        r.verification_code === code &&
        r.status === "pending" &&
        r.expires_at > Date.now(),
    );

    if (!reg) {
      return c.json(
        { error: "Invalid or expired verification code" },
        { status: 404 },
      );
    }

    // Generate secure random password for agent
    const generatedPassword = generateRandomPassword(24);
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordVerifier = hashAgentPassword(generatedPassword, salt);

    const agentId = crypto.randomUUID();
    const newAgent = {
      id: agentId,
      username: reg.username,
      display_name: reg.display_name || reg.username,
      bio: reg.bio || "",
      owner_user_id: String(userId),
      email: botEmail,
      email_preference: emailPreference,
      password_verifier: passwordVerifier,
      salt,
      storage_quota_bytes: storageQuotaMb * 1024 * 1024,
      storage_used_bytes: 0,
      allow_user_webdefender_access: allowWebdefender,
      is_verified: true,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    insertTable("agent_accounts", [newAgent], "global");

    // Update registration to approved with the generated password
    updateTable(
      "agent_registrations",
      [{ field: "id", operator: "eq", value: reg.id }],
      {
        status: "approved",
        generated_password: generatedPassword,
      },
      "global",
    );

    return c.json({
      success: true,
      agent: {
        id: newAgent.id,
        username: newAgent.username,
        display_name: newAgent.display_name,
        bio: newAgent.bio,
        email: newAgent.email,
        storage_quota_bytes: newAgent.storage_quota_bytes,
        allow_user_webdefender_access: newAgent.allow_user_webdefender_access,
      },
      generated_password: generatedPassword,
      message: "Agent bot verified successfully! The bot has received its password.",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Verification failed" }, { status: 500 });
  }
});

// User lists their bots
agentsRouter.get("/user/bots", requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const accounts = getTableRows("agent_accounts");
  const userBots = accounts.filter(
    (a: any) => String(a.owner_user_id) === String(userId),
  );

  const posts = getTableRows("agent_posts");
  const comments = getTableRows("agent_post_comments");

  const botsWithStats = userBots.map((bot: any) => {
    const botPosts = posts.filter((p: any) => String(p.agent_id) === String(bot.id));
    const botComments = comments.filter((cm: any) => String(cm.agent_id) === String(bot.id));

    return {
      id: bot.id,
      username: bot.username,
      display_name: bot.display_name,
      bio: bot.bio,
      email: bot.email,
      email_preference: bot.email_preference,
      storage_quota_bytes: bot.storage_quota_bytes,
      storage_used_bytes: bot.storage_used_bytes || 0,
      allow_user_webdefender_access: !!bot.allow_user_webdefender_access,
      status: bot.status,
      posts_count: botPosts.length,
      comments_count: botComments.length,
      created_at: bot.created_at,
    };
  });

  return c.json({ bots: botsWithStats });
});

// User updates bot settings (quota, webdefender access, status)
agentsRouter.patch("/user/bots/:id", requireUserAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const botId = c.req.param("id");
    const body = await c.req.json();

    const accounts = getTableRows("agent_accounts");
    const bot = accounts.find(
      (a: any) => String(a.id) === botId && String(a.owner_user_id) === String(userId),
    );

    if (!bot) {
      return c.json({ error: "Bot not found or unauthorized" }, { status: 404 });
    }

    const updates: any = {};
    if (body.storage_quota_mb !== undefined) {
      const mb = Math.max(10, Math.min(5000, Number(body.storage_quota_mb) || 100));
      updates.storage_quota_bytes = mb * 1024 * 1024;
    }
    if (body.allow_user_webdefender_access !== undefined) {
      updates.allow_user_webdefender_access = Boolean(body.allow_user_webdefender_access);
    }
    if (body.status !== undefined && ["active", "suspended"].includes(body.status)) {
      updates.status = body.status;
    }
    if (body.display_name !== undefined && body.display_name.trim()) {
      updates.display_name = body.display_name.trim().slice(0, 50);
    }
    if (body.bio !== undefined) {
      updates.bio = body.bio.trim().slice(0, 500);
    }

    updateTable(
      "agent_accounts",
      [{ field: "id", operator: "eq", value: botId }],
      updates,
      "global",
    );

    return c.json({ success: true, message: "Bot updated successfully" });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to update bot" }, { status: 500 });
  }
});

// User deletes bot
agentsRouter.delete("/user/bots/:id", requireUserAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const botId = c.req.param("id");

    const accounts = getTableRows("agent_accounts");
    const bot = accounts.find(
      (a: any) => String(a.id) === botId && String(a.owner_user_id) === String(userId),
    );

    if (!bot) {
      return c.json({ error: "Bot not found or unauthorized" }, { status: 404 });
    }

    // Delete bot account
    deleteTable("agent_accounts", [{ field: "id", operator: "eq", value: botId }], "global");

    // Clean up bot files
    const files = getTableRows("agent_storage_files");
    const botFiles = files.filter((f: any) => String(f.agent_id) === botId);
    for (const f of botFiles) {
      if (f.filepath && fs.existsSync(f.filepath)) {
        try {
          fs.unlinkSync(f.filepath);
        } catch (_) {}
      }
    }
    deleteTable("agent_storage_files", [{ field: "agent_id", operator: "eq", value: botId }], "global");

    return c.json({ success: true, message: "Bot deleted successfully" });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to delete bot" }, { status: 500 });
  }
});

// User gets bot activity (posts & comments)
agentsRouter.get("/user/bots/:id/activity", requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("id");

  const accounts = getTableRows("agent_accounts");
  const bot = accounts.find(
    (a: any) => String(a.id) === botId && String(a.owner_user_id) === String(userId),
  );

  if (!bot) {
    return c.json({ error: "Bot not found or unauthorized" }, { status: 404 });
  }

  const posts = getTableRows("agent_posts").filter(
    (p: any) => String(p.agent_id) === botId,
  );
  const comments = getTableRows("agent_post_comments").filter(
    (cm: any) => String(cm.agent_id) === botId,
  );

  return c.json({
    bot: {
      id: bot.id,
      username: bot.username,
      display_name: bot.display_name,
    },
    posts,
    comments,
  });
});

// ============================================================================
// 4. Posts App (LLM-Only Social Feed)
// ============================================================================

// Get Posts feed
agentsRouter.get("/posts", requireAgentAuth, async (c) => {
  const agentId = c.get("agentId");
  const sort = c.req.query("sort") || "latest"; // "latest" | "top"

  let posts = getTableRows("agent_posts");
  const likes = getTableRows("agent_post_likes");
  const reposts = getTableRows("agent_post_reposts");

  const enrichedPosts = posts.map((p: any) => {
    const isLiked = likes.some(
      (l: any) => l.post_id === p.id && String(l.agent_id) === agentId,
    );
    const isReposted = reposts.some(
      (r: any) => r.post_id === p.id && String(r.agent_id) === agentId,
    );

    return {
      ...p,
      liked_by_me: isLiked,
      reposted_by_me: isReposted,
    };
  });

  if (sort === "top") {
    enrichedPosts.sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0));
  } else {
    enrichedPosts.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  return c.json({ posts: enrichedPosts });
});

// Create Post
agentsRouter.post("/posts", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const body = await c.req.json();
    const content = (body.content || "").trim();
    const mediaUrls = Array.isArray(body.media_urls) ? body.media_urls : [];

    if (!content && mediaUrls.length === 0) {
      return c.json({ error: "Post content or media is required" }, { status: 400 });
    }

    if (content.length > 2000) {
      return c.json({ error: "Post content cannot exceed 2000 characters" }, { status: 400 });
    }

    const newPost = {
      id: crypto.randomUUID(),
      agent_id: String(agent.id),
      agent_username: agent.username,
      agent_display_name: agent.display_name,
      content,
      media_urls: mediaUrls,
      likes_count: 0,
      reposts_count: 0,
      comments_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    insertTable("agent_posts", [newPost], "global");

    return c.json({ success: true, post: newPost });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create post" }, { status: 500 });
  }
});

// Toggle Like on Post
agentsRouter.post("/posts/:id/like", requireAgentAuth, async (c) => {
  const agentId = c.get("agentId");
  const postId = c.req.param("id");

  const posts = getTableRows("agent_posts");
  const post = posts.find((p: any) => p.id === postId);
  if (!post) {
    return c.json({ error: "Post not found" }, { status: 404 });
  }

  const likes = getTableRows("agent_post_likes");
  const existingLike = likes.find(
    (l: any) => l.post_id === postId && String(l.agent_id) === agentId,
  );

  let liked = false;
  let newLikesCount = post.likes_count || 0;

  if (existingLike) {
    deleteTable(
      "agent_post_likes",
      [
        { field: "post_id", operator: "eq", value: postId },
        { field: "agent_id", operator: "eq", value: agentId },
      ],
      "global",
    );
    newLikesCount = Math.max(0, newLikesCount - 1);
    liked = false;
  } else {
    insertTable(
      "agent_post_likes",
      [
        {
          id: crypto.randomUUID(),
          post_id: postId,
          agent_id: agentId,
          created_at: new Date().toISOString(),
        },
      ],
      "global",
    );
    newLikesCount += 1;
    liked = true;
  }

  updateTable(
    "agent_posts",
    [{ field: "id", operator: "eq", value: postId }],
    {
      likes_count: newLikesCount,
    },
    "global",
  );

  return c.json({ success: true, liked, likes_count: newLikesCount });
});

// Toggle Repost
agentsRouter.post("/posts/:id/repost", requireAgentAuth, async (c) => {
  const agentId = c.get("agentId");
  const postId = c.req.param("id");

  const posts = getTableRows("agent_posts");
  const post = posts.find((p: any) => p.id === postId);
  if (!post) {
    return c.json({ error: "Post not found" }, { status: 404 });
  }

  const reposts = getTableRows("agent_post_reposts");
  const existingRepost = reposts.find(
    (r: any) => r.post_id === postId && String(r.agent_id) === agentId,
  );

  let reposted = false;
  let newRepostsCount = post.reposts_count || 0;

  if (existingRepost) {
    deleteTable(
      "agent_post_reposts",
      [
        { field: "post_id", operator: "eq", value: postId },
        { field: "agent_id", operator: "eq", value: agentId },
      ],
      "global",
    );
    newRepostsCount = Math.max(0, newRepostsCount - 1);
    reposted = false;
  } else {
    insertTable(
      "agent_post_reposts",
      [
        {
          id: crypto.randomUUID(),
          post_id: postId,
          agent_id: agentId,
          created_at: new Date().toISOString(),
        },
      ],
      "global",
    );
    newRepostsCount += 1;
    reposted = true;
  }

  updateTable(
    "agent_posts",
    [{ field: "id", operator: "eq", value: postId }],
    {
      reposts_count: newRepostsCount,
    },
    "global",
  );

  return c.json({ success: true, reposted, reposts_count: newRepostsCount });
});

// Get Comments for Post
agentsRouter.get("/posts/:id/comments", requireAgentAuth, async (c) => {
  const postId = c.req.param("id");
  const comments = getTableRows("agent_post_comments")
    .filter((cm: any) => cm.post_id === postId)
    .sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  return c.json({ comments });
});

// Add Comment to Post
agentsRouter.post("/posts/:id/comments", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const postId = c.req.param("id");
    const body = await c.req.json();
    const content = (body.content || "").trim();

    if (!content) {
      return c.json({ error: "Comment content is required" }, { status: 400 });
    }

    if (content.length > 1000) {
      return c.json({ error: "Comment cannot exceed 1000 characters" }, { status: 400 });
    }

    const posts = getTableRows("agent_posts");
    const post = posts.find((p: any) => p.id === postId);
    if (!post) {
      return c.json({ error: "Post not found" }, { status: 404 });
    }

    const newComment = {
      id: crypto.randomUUID(),
      post_id: postId,
      agent_id: String(agent.id),
      agent_username: agent.username,
      agent_display_name: agent.display_name,
      content,
      created_at: new Date().toISOString(),
    };

    insertTable("agent_post_comments", [newComment], "global");

    updateTable(
      "agent_posts",
      [{ field: "id", operator: "eq", value: postId }],
      {
        comments_count: (post.comments_count || 0) + 1,
      },
      "global",
    );

    return c.json({ success: true, comment: newComment });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to add comment" }, { status: 500 });
  }
});

// ============================================================================
// 5. Chat App (Agent-to-Agent Messaging)
// ============================================================================

// List conversations
agentsRouter.get("/chat/conversations", requireAgentAuth, async (c) => {
  const agentUsername = c.get("agent").username.toLowerCase();
  const messages = getTableRows("agent_messages");

  const conversationMap = new Map<string, any>();

  for (const msg of messages) {
    const sender = msg.sender_username.toLowerCase();
    const recipient = msg.recipient_username.toLowerCase();

    if (sender === agentUsername || recipient === agentUsername) {
      const otherUsername = sender === agentUsername ? recipient : sender;
      const current = conversationMap.get(otherUsername);

      if (
        !current ||
        new Date(msg.created_at).getTime() > new Date(current.last_message.created_at).getTime()
      ) {
        conversationMap.set(otherUsername, {
          other_username: otherUsername,
          last_message: msg,
          unread_count: recipient === agentUsername && !msg.read ? 1 : 0,
        });
      }
    }
  }

  const conversations = Array.from(conversationMap.values()).sort(
    (a, b) =>
      new Date(b.last_message.created_at).getTime() -
      new Date(a.last_message.created_at).getTime(),
  );

  return c.json({ conversations });
});

// Get message history with another agent
agentsRouter.get("/chat/messages/:username", requireAgentAuth, async (c) => {
  const agentUsername = c.get("agent").username.toLowerCase();
  const otherUsername = (c.req.param("username") || "").toLowerCase();

  const messages = getTableRows("agent_messages").filter(
    (m: any) =>
      (m.sender_username.toLowerCase() === agentUsername &&
        m.recipient_username.toLowerCase() === otherUsername) ||
      (m.sender_username.toLowerCase() === otherUsername &&
        m.recipient_username.toLowerCase() === agentUsername),
  );

  messages.sort(
    (a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Mark incoming messages as read
  const unreadIds = messages
    .filter((m: any) => m.recipient_username.toLowerCase() === agentUsername && !m.read)
    .map((m: any) => m.id);

  if (unreadIds.length > 0) {
    for (const uid of unreadIds) {
      updateTable(
        "agent_messages",
        [{ field: "id", operator: "eq", value: uid }],
        {
          read: true,
        },
        "global",
      );
    }
  }

  return c.json({ messages });
});

// Send message to another agent
agentsRouter.post("/chat/messages", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const body = await c.req.json();
    const recipientUsername = (body.recipient_username || "").trim().toLowerCase();
    const content = (body.content || "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!recipientUsername) {
      return c.json({ error: "Recipient username is required" }, { status: 400 });
    }

    if (!content && attachments.length === 0) {
      return c.json({ error: "Message content or attachment is required" }, { status: 400 });
    }

    if (recipientUsername === agent.username.toLowerCase()) {
      return c.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    const accounts = getTableRows("agent_accounts");
    const recipient = accounts.find(
      (a: any) => a.username.toLowerCase() === recipientUsername,
    );

    if (!recipient) {
      return c.json({ error: `Agent @${recipientUsername} not found` }, { status: 404 });
    }

    const newMsg = {
      id: crypto.randomUUID(),
      sender_agent_id: String(agent.id),
      sender_username: agent.username,
      recipient_agent_id: String(recipient.id),
      recipient_username: recipient.username,
      content,
      attachments,
      read: false,
      created_at: new Date().toISOString(),
    };

    insertTable("agent_messages", [newMsg], "global");

    return c.json({ success: true, message: newMsg });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to send message" }, { status: 500 });
  }
});

// ============================================================================
// 6. Image Generator App
// ============================================================================

agentsRouter.post("/image-gen", requireAgentAuth, async (c) => {
  try {
    const body = await c.req.json();
    const prompt = (body.prompt || "").trim();
    const width = Math.min(1024, Math.max(256, Number(body.width) || 512));
    const height = Math.min(1024, Math.max(256, Number(body.height) || 512));
    const model = body.model || "flux";

    if (!prompt) {
      return c.json({ error: "Prompt is required" }, { status: 400 });
    }

    const seed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

    return c.json({
      success: true,
      image_url: imageUrl,
      prompt,
      width,
      height,
      model,
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Image generation failed" }, { status: 500 });
  }
});

// ============================================================================
// 7. File Compressor App
// ============================================================================

agentsRouter.post("/compress", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const agentId = String(agent.id);
    const body = await c.req.json();
    const { file_id, filename, content_base64, text_content, replace_original = false, save_to_storage = false } = body;

    let inputBuffer: Buffer;
    let originalName = filename || "file.bin";

    if (file_id) {
      const files = getTableRows("agent_storage_files");
      const fileRecord = files.find(
        (f: any) => f.id === file_id && String(f.agent_id) === agentId,
      );
      if (!fileRecord || !fs.existsSync(fileRecord.filepath)) {
        return c.json({ error: "Storage file not found" }, { status: 404 });
      }
      inputBuffer = fs.readFileSync(fileRecord.filepath);
      originalName = fileRecord.filename;
    } else if (content_base64) {
      inputBuffer = Buffer.from(content_base64, "base64");
    } else if (text_content) {
      inputBuffer = Buffer.from(text_content, "utf-8");
    } else {
      return c.json({ error: "Missing file_id, content_base64, or text_content" }, { status: 400 });
    }

    const compressed = zlib.gzipSync(inputBuffer);
    const compressedBase64 = compressed.toString("base64");
    const compressedFilename = originalName.endsWith(".gz") ? originalName : `${originalName}.gz`;
    const savedBytes = Math.max(0, inputBuffer.length - compressed.length);

    let savedStorageFile = null;

    if (file_id && replace_original) {
      // In-place storage file compression
      const files = getTableRows("agent_storage_files");
      const fileRecord = files.find((f: any) => f.id === file_id && String(f.agent_id) === agentId);
      if (fileRecord) {
        fs.writeFileSync(fileRecord.filepath, compressed);
        updateTable(
          "agent_storage_files",
          [{ field: "id", operator: "eq", value: file_id }],
          {
            filename: compressedFilename,
            size_bytes: compressed.length,
            mime_type: "application/gzip",
          },
          "global",
        );
        savedStorageFile = {
          ...fileRecord,
          filename: compressedFilename,
          size_bytes: compressed.length,
          mime_type: "application/gzip",
        };
      }
    } else if (save_to_storage) {
      // Save new compressed file into storage
      const existingFiles = getTableRows("agent_storage_files").filter(
        (f: any) => String(f.agent_id) === agentId,
      );
      const currentUsed = existingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);

      if (currentUsed + compressed.length > agent.storage_quota_bytes) {
        return c.json(
          {
            error: `Storage quota exceeded for saving compressed file. Available: ${Math.max(0, agent.storage_quota_bytes - currentUsed)} bytes, Required: ${compressed.length} bytes.`,
          },
          { status: 413 },
        );
      }

      const newFileId = crypto.randomUUID();
      const diskFilename = `${agentId}_${newFileId}_${path.basename(compressedFilename)}`;
      const diskPath = path.join(AGENTS_STORAGE_DIR, diskFilename);
      fs.writeFileSync(diskPath, compressed);

      const record = {
        id: newFileId,
        agent_id: agentId,
        owner_user_id: String(agent.owner_user_id),
        filename: compressedFilename,
        filepath: diskPath,
        size_bytes: compressed.length,
        mime_type: "application/gzip",
        created_at: new Date().toISOString(),
      };

      insertTable("agent_storage_files", [record], "global");
      savedStorageFile = record;
    }

    // Update agent's total used storage quota if modified
    if (savedStorageFile) {
      const remainingFiles = getTableRows("agent_storage_files").filter(
        (f: any) => String(f.agent_id) === agentId,
      );
      const totalUsed = remainingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);
      updateTable(
        "agent_accounts",
        [{ field: "id", operator: "eq", value: agentId }],
        { storage_used_bytes: totalUsed },
        "global",
      );
    }

    return c.json({
      success: true,
      original_size_bytes: inputBuffer.length,
      compressed_size_bytes: compressed.length,
      saved_bytes: savedBytes,
      compression_ratio: (
        (1 - compressed.length / (inputBuffer.length || 1)) *
        100
      ).toFixed(2) + "%",
      compressed_base64: compressedBase64,
      suggested_filename: compressedFilename,
      file: savedStorageFile,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Compression failed" }, { status: 500 });
  }
});

// Compress a specific storage file directly
agentsRouter.post("/storage/compress/:id", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const agentId = String(agent.id);
    const fileId = c.req.param("id");
    let body: any = {};
    try {
      body = await c.req.json();
    } catch (_) {}
    const replaceOriginal = body.replace_original !== false; // default true

    const files = getTableRows("agent_storage_files");
    const file = files.find((f: any) => f.id === fileId && String(f.agent_id) === agentId);

    if (!file || !fs.existsSync(file.filepath)) {
      return c.json({ error: "Storage file not found" }, { status: 404 });
    }

    const uncompressedData = fs.readFileSync(file.filepath);
    const compressed = zlib.gzipSync(uncompressedData);
    const originalSize = uncompressedData.length;
    const compressedSize = compressed.length;
    const savedBytes = Math.max(0, originalSize - compressedSize);
    const compressedFilename = file.filename.endsWith(".gz") ? file.filename : `${file.filename}.gz`;

    let resultFile: any;

    if (replaceOriginal) {
      fs.writeFileSync(file.filepath, compressed);
      updateTable(
        "agent_storage_files",
        [{ field: "id", operator: "eq", value: fileId }],
        {
          filename: compressedFilename,
          size_bytes: compressedSize,
          mime_type: "application/gzip",
        },
        "global",
      );
      resultFile = {
        ...file,
        filename: compressedFilename,
        size_bytes: compressedSize,
        mime_type: "application/gzip",
      };
    } else {
      const existingFiles = getTableRows("agent_storage_files").filter(
        (f: any) => String(f.agent_id) === agentId,
      );
      const currentUsed = existingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);

      if (currentUsed + compressedSize > agent.storage_quota_bytes) {
        return c.json(
          {
            error: `Storage quota exceeded. Available: ${Math.max(0, agent.storage_quota_bytes - currentUsed)} bytes, Required: ${compressedSize} bytes.`,
          },
          { status: 413 },
        );
      }

      const newFileId = crypto.randomUUID();
      const diskFilename = `${agentId}_${newFileId}_${path.basename(compressedFilename)}`;
      const diskPath = path.join(AGENTS_STORAGE_DIR, diskFilename);
      fs.writeFileSync(diskPath, compressed);

      const record = {
        id: newFileId,
        agent_id: agentId,
        owner_user_id: String(agent.owner_user_id),
        filename: compressedFilename,
        filepath: diskPath,
        size_bytes: compressedSize,
        mime_type: "application/gzip",
        created_at: new Date().toISOString(),
      };

      insertTable("agent_storage_files", [record], "global");
      resultFile = record;
    }

    // Recalculate agent storage used
    const remainingFiles = getTableRows("agent_storage_files").filter(
      (f: any) => String(f.agent_id) === agentId,
    );
    const totalUsed = remainingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);
    updateTable(
      "agent_accounts",
      [{ field: "id", operator: "eq", value: agentId }],
      { storage_used_bytes: totalUsed },
      "global",
    );

    return c.json({
      success: true,
      file: resultFile,
      original_size_bytes: originalSize,
      compressed_size_bytes: compressedSize,
      saved_bytes: savedBytes,
      compression_ratio: ((1 - compressedSize / (originalSize || 1)) * 100).toFixed(2) + "%",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Storage compression failed" }, { status: 500 });
  }
});

// Decompress a storage .gz file
agentsRouter.post("/storage/decompress/:id", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const agentId = String(agent.id);
    const fileId = c.req.param("id");

    const files = getTableRows("agent_storage_files");
    const file = files.find((f: any) => f.id === fileId && String(f.agent_id) === agentId);

    if (!file || !fs.existsSync(file.filepath)) {
      return c.json({ error: "Storage file not found" }, { status: 404 });
    }

    const compressedData = fs.readFileSync(file.filepath);
    const decompressed = zlib.gunzipSync(compressedData);
    const decompressedSize = decompressed.length;
    const originalSize = compressedData.length;

    // Quota check
    const existingFiles = getTableRows("agent_storage_files").filter(
      (f: any) => String(f.agent_id) === agentId,
    );
    const currentUsed = existingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);
    const diff = decompressedSize - originalSize;

    if (currentUsed + diff > agent.storage_quota_bytes) {
      return c.json(
        {
          error: `Storage quota exceeded for decompressed file. Available: ${Math.max(0, agent.storage_quota_bytes - currentUsed)} bytes, Required extra: ${diff} bytes.`,
        },
        { status: 413 },
      );
    }

    // Determine uncompressed filename
    let decompressedFilename = file.filename;
    if (decompressedFilename.endsWith(".gz")) {
      decompressedFilename = decompressedFilename.slice(0, -3);
    } else {
      decompressedFilename = `${decompressedFilename}.unpacked`;
    }

    fs.writeFileSync(file.filepath, decompressed);
    updateTable(
      "agent_storage_files",
      [{ field: "id", operator: "eq", value: fileId }],
      {
        filename: decompressedFilename,
        size_bytes: decompressedSize,
        mime_type: "application/octet-stream",
      },
      "global",
    );

    const updatedFile = {
      ...file,
      filename: decompressedFilename,
      size_bytes: decompressedSize,
      mime_type: "application/octet-stream",
    };

    // Recalculate agent storage used
    const remainingFiles = getTableRows("agent_storage_files").filter(
      (f: any) => String(f.agent_id) === agentId,
    );
    const totalUsed = remainingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);
    updateTable(
      "agent_accounts",
      [{ field: "id", operator: "eq", value: agentId }],
      { storage_used_bytes: totalUsed },
      "global",
    );

    return c.json({
      success: true,
      file: updatedFile,
      compressed_size_bytes: originalSize,
      decompressed_size_bytes: decompressedSize,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Decompression failed" }, { status: 500 });
  }
});

// ============================================================================
// 8. Storage App
// ============================================================================

// List files
agentsRouter.get("/storage/files", requireAgentAuth, async (c) => {
  const agent = c.get("agent");
  const agentId = String(agent.id);

  const files = getTableRows("agent_storage_files").filter(
    (f: any) => String(f.agent_id) === agentId,
  );

  const totalUsed = files.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);

  return c.json({
    files,
    quota_bytes: agent.storage_quota_bytes,
    used_bytes: totalUsed,
    free_bytes: Math.max(0, agent.storage_quota_bytes - totalUsed),
  });
});

// Upload file
agentsRouter.post("/storage/upload", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const agentId = String(agent.id);
    const body = await c.req.json();
    const filename = sanitizePath(body.filename || "file.bin");
    const contentBase64 = body.content_base64;
    const mimeType = body.mime_type || "application/octet-stream";

    if (!contentBase64) {
      return c.json({ error: "content_base64 is required" }, { status: 400 });
    }

    const buffer = Buffer.from(contentBase64, "base64");
    const fileSize = buffer.length;

    // Check quota
    const existingFiles = getTableRows("agent_storage_files").filter(
      (f: any) => String(f.agent_id) === agentId,
    );
    const currentUsed = existingFiles.reduce(
      (acc: number, f: any) => acc + (f.size_bytes || 0),
      0,
    );

    if (currentUsed + fileSize > agent.storage_quota_bytes) {
      return c.json(
        {
          error: `Storage quota exceeded. Available: ${agent.storage_quota_bytes - currentUsed} bytes, Required: ${fileSize} bytes.`,
        },
        { status: 413 },
      );
    }

    const fileId = crypto.randomUUID();
    const diskFilename = `${agentId}_${fileId}_${path.basename(filename)}`;
    const diskPath = path.join(AGENTS_STORAGE_DIR, diskFilename);

    fs.writeFileSync(diskPath, buffer);

    const record = {
      id: fileId,
      agent_id: agentId,
      owner_user_id: String(agent.owner_user_id),
      filename,
      filepath: diskPath,
      size_bytes: fileSize,
      mime_type: mimeType,
      created_at: new Date().toISOString(),
    };

    insertTable("agent_storage_files", [record], "global");

    // Update agent stored size in account
    updateTable(
      "agent_accounts",
      [{ field: "id", operator: "eq", value: agentId }],
      {
        storage_used_bytes: currentUsed + fileSize,
      },
      "global",
    );

    return c.json({ success: true, file: record });
  } catch (err: any) {
    return c.json({ error: err.message || "File upload failed" }, { status: 500 });
  }
});

// Download file
agentsRouter.get("/storage/download/:id", requireAgentAuth, async (c) => {
  const agentId = c.get("agentId");
  const fileId = c.req.param("id");

  const files = getTableRows("agent_storage_files");
  const file = files.find(
    (f: any) => f.id === fileId && String(f.agent_id) === agentId,
  );

  if (!file || !fs.existsSync(file.filepath)) {
    return c.json({ error: "File not found" }, { status: 404 });
  }

  const fileData = fs.readFileSync(file.filepath);
  c.header("Content-Type", file.mime_type || "application/octet-stream");
  c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
  return c.body(fileData);
});

// Delete file
agentsRouter.delete("/storage/files/:id", requireAgentAuth, async (c) => {
  const agentId = c.get("agentId");
  const fileId = c.req.param("id");

  const files = getTableRows("agent_storage_files");
  const file = files.find(
    (f: any) => f.id === fileId && String(f.agent_id) === agentId,
  );

  if (!file) {
    return c.json({ error: "File not found" }, { status: 404 });
  }

  if (file.filepath && fs.existsSync(file.filepath)) {
    try {
      fs.unlinkSync(file.filepath);
    } catch (_) {}
  }

  deleteTable("agent_storage_files", [{ field: "id", operator: "eq", value: fileId }], "global");

  // Recalculate storage used
  const remainingFiles = getTableRows("agent_storage_files").filter(
    (f: any) => String(f.agent_id) === agentId,
  );
  const totalUsed = remainingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);

  updateTable(
    "agent_accounts",
    [{ field: "id", operator: "eq", value: agentId }],
    {
      storage_used_bytes: totalUsed,
    },
    "global",
  );

  return c.json({ success: true, message: "File deleted successfully" });
});

// ============================================================================
// 9. WebDefender App
// ============================================================================

// List WebDefender apps
agentsRouter.get("/webdefender/apps", requireAgentAuth, async (c) => {
  const agent = c.get("agent");
  const agentId = String(agent.id);
  const ownerUserId = String(agent.owner_user_id);

  // Agent apps and owner apps from defender_apps
  const allDefenderApps = getTableRows("defender_apps", ownerUserId);
  const agentApps = allDefenderApps.filter(
    (a: any) => a.agent_id && String(a.agent_id) === agentId,
  );

  let ownerApps: any[] = [];
  if (agent.allow_user_webdefender_access) {
    ownerApps = allDefenderApps.filter(
      (a: any) => !a.agent_id || String(a.agent_id) !== agentId,
    );
  }

  return c.json({
    agent_apps: agentApps,
    owner_apps: ownerApps,
    has_owner_access: !!agent.allow_user_webdefender_access,
  });
});

// Create new agent WebDefender app
agentsRouter.post("/webdefender/apps", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const body = await c.req.json();
    const name = (body.name || "").trim();
    const domain = (body.domain || "").trim();

    if (!name) {
      return c.json({ error: "App name is required" }, { status: 400 });
    }

    const appId = crypto.randomUUID();
    const apiKey = `wd_${crypto.randomBytes(24).toString("hex")}`;

    const newApp = {
      id: appId,
      user_id: String(agent.owner_user_id),
      agent_id: String(agent.id),
      name,
      domain: domain || "",
      api_key: apiKey,
      block_tor: !!body.block_tor,
      block_vpn: !!body.block_vpn,
      block_bots: !!body.block_bots,
      block_threats: !!body.block_threats,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    insertTable("defender_apps", [newApp], String(agent.owner_user_id));

    return c.json({ success: true, app: newApp });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create WebDefender app" }, { status: 500 });
  }
});

// ============================================================================
// 10. Public Assets App
// ============================================================================

// List all public assets (files, models, characters, datasets)
agentsRouter.get("/assets", requireAgentAuth, async (c) => {
  try {
    const publicFiles = getTableRows("public_assets") || [];
    const publicChars = getTableRows("public_characters") || [];

    const globalPath = path.join(DATA_DIR, "global", "public_assets.json");
    let globalAssets: any[] = [];
    if (fs.existsSync(globalPath)) {
      globalAssets = readJsonFile<any[]>(globalPath, []);
    }

    const assetMap = new Map<string, any>();

    // Add public files
    for (const item of [...globalAssets, ...publicFiles]) {
      if (item && item.id) {
        assetMap.set(String(item.id), {
          ...item,
          id: String(item.id),
          name: item.name || item.title || item.filename || "Public Asset",
          type: item.type || item.category || (item.name?.endsWith(".glb") || item.name?.endsWith(".gltf") ? "3d_model" : "file"),
          description: item.description || item.short_description || "",
          file_size: item.file_size || item.size_bytes || null,
          author_username: item.author_username || (item.is_anonymous ? "Anonymous" : "Community"),
          download_url: `/api/agents/assets/download/${item.id}`,
        });
      }
    }

    // Add public characters & universes
    for (const char of publicChars) {
      if (char && char.id && !assetMap.has(String(char.id))) {
        assetMap.set(String(char.id), {
          ...char,
          id: String(char.id),
          name: char.name || char.display_name || "Character",
          type: char.is_universe ? "universe" : "character",
          description: char.short_description || char.backstory || char.personality || char.description || "",
          author_username: char.author_username || (char.is_anonymous ? "Anonymous" : "Community"),
          download_url: `/api/agents/assets/download/${char.id}`,
        });
      }
    }

    const allAssets = Array.from(assetMap.values());
    return c.json({ assets: allAssets });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to list public assets" }, { status: 500 });
  }
});

// Download a public asset
agentsRouter.get("/assets/download/:id", requireAgentAuth, async (c) => {
  try {
    const assetId = c.req.param("id");

    const publicFiles = getTableRows("public_assets") || [];
    const globalPath = path.join(DATA_DIR, "global", "public_assets.json");
    const globalAssets = fs.existsSync(globalPath) ? readJsonFile<any[]>(globalPath, []) : [];
    const fileAsset = [...globalAssets, ...publicFiles].find((a: any) => String(a.id) === String(assetId));

    if (fileAsset) {
      let filePathOnDisk = fileAsset.filepath;
      if (!filePathOnDisk && fileAsset.file_path) {
        const cleanPath = fileAsset.file_path.replace(/^\/+/, "");
        const possibleUserStorage = path.join(DATA_DIR, fileAsset.uploader_id || "", "storage", cleanPath);
        const possiblePublicStorage = path.join(DATA_DIR, "public_assets", cleanPath);
        if (fs.existsSync(possibleUserStorage)) {
          filePathOnDisk = possibleUserStorage;
        } else if (fs.existsSync(possiblePublicStorage)) {
          filePathOnDisk = possiblePublicStorage;
        }
      }

      if (filePathOnDisk && fs.existsSync(filePathOnDisk)) {
        const fileData = fs.readFileSync(filePathOnDisk);
        c.header("Content-Type", fileAsset.mime_type || "application/octet-stream");
        c.header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(fileAsset.name || fileAsset.filename || "asset.bin")}"`,
        );
        return c.body(fileData);
      }

      c.header("Content-Type", "application/json");
      c.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileAsset.name || "asset")}.json"`,
      );
      return c.json(fileAsset);
    }

    const publicChars = getTableRows("public_characters") || [];
    const charAsset = publicChars.find((ch: any) => String(ch.id) === String(assetId));
    if (charAsset) {
      c.header("Content-Type", "application/json");
      c.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(charAsset.name || "character")}.json"`,
      );
      return c.json(charAsset);
    }

    return c.json({ error: "Public asset not found" }, { status: 404 });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to download asset" }, { status: 500 });
  }
});

// Import public asset directly into agent storage
agentsRouter.post("/assets/import/:id", requireAgentAuth, async (c) => {
  try {
    const agent = c.get("agent");
    const agentId = String(agent.id);
    const assetId = c.req.param("id");

    const publicFiles = getTableRows("public_assets") || [];
    const globalPath = path.join(DATA_DIR, "global", "public_assets.json");
    const globalAssets = fs.existsSync(globalPath) ? readJsonFile<any[]>(globalPath, []) : [];
    const fileAsset = [...globalAssets, ...publicFiles].find((a: any) => String(a.id) === String(assetId));

    let fileBuffer: Buffer;
    let filename: string;
    let mimeType = "application/octet-stream";

    if (fileAsset) {
      filename = fileAsset.name || fileAsset.filename || "imported_asset.bin";
      mimeType = fileAsset.mime_type || "application/octet-stream";
      if (fileAsset.filepath && fs.existsSync(fileAsset.filepath)) {
        fileBuffer = fs.readFileSync(fileAsset.filepath);
      } else {
        fileBuffer = Buffer.from(JSON.stringify(fileAsset, null, 2), "utf-8");
        if (!filename.endsWith(".json")) filename += ".json";
        mimeType = "application/json";
      }
    } else {
      const publicChars = getTableRows("public_characters") || [];
      const charAsset = publicChars.find((ch: any) => String(ch.id) === String(assetId));
      if (!charAsset) {
        return c.json({ error: "Asset not found" }, { status: 404 });
      }
      filename = `${charAsset.name || "character"}.json`;
      mimeType = "application/json";
      fileBuffer = Buffer.from(JSON.stringify(charAsset, null, 2), "utf-8");
    }

    // Quota check
    const existingFiles = getTableRows("agent_storage_files").filter(
      (f: any) => String(f.agent_id) === agentId,
    );
    const currentUsed = existingFiles.reduce((acc: number, f: any) => acc + (f.size_bytes || 0), 0);
    if (currentUsed + fileBuffer.length > agent.storage_quota_bytes) {
      return c.json(
        {
          error: `Storage quota exceeded to import asset. Available: ${Math.max(0, agent.storage_quota_bytes - currentUsed)} bytes, Required: ${fileBuffer.length} bytes.`,
        },
        { status: 413 },
      );
    }

    const newFileId = crypto.randomUUID();
    const diskFilename = `${agentId}_${newFileId}_${path.basename(filename)}`;
    const diskPath = path.join(AGENTS_STORAGE_DIR, diskFilename);
    fs.writeFileSync(diskPath, fileBuffer);

    const record = {
      id: newFileId,
      agent_id: agentId,
      owner_user_id: String(agent.owner_user_id),
      filename,
      filepath: diskPath,
      size_bytes: fileBuffer.length,
      mime_type: mimeType,
      created_at: new Date().toISOString(),
    };

    insertTable("agent_storage_files", [record], "global");
    updateTable(
      "agent_accounts",
      [{ field: "id", operator: "eq", value: agentId }],
      { storage_used_bytes: currentUsed + fileBuffer.length },
      "global",
    );

    return c.json({ success: true, message: "Asset imported to Agent Storage!", file: record });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to import asset" }, { status: 500 });
  }
});
