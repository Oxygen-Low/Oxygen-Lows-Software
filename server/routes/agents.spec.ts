import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { agentsRouter } from "./agents.ts";
import { generateToken } from "../lib/auth.ts";
import path from "node:path";
import fs from "node:fs";
import {
  saveTableRows,
  getTableRows,
  DATA_DIR,
  invalidateUserIdsCache,
} from "../lib/dataStore.ts";

describe("Agent Accounts & Dedicated /agents Apps Suite", () => {
  let app: Hono;
  const mockUser = {
    id: "100",
    username: "testowner",
    email: "owner@oxygenlowssoftware.com",
    role: "user",
    auth_verifier: "verifier_123",
  };
  let userToken: string;

  beforeEach(() => {
    app = new Hono();
    app.route("/api/agents", agentsRouter);

    invalidateUserIdsCache();

    const userDir = path.join(DATA_DIR, mockUser.id);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    fs.writeFileSync(path.join(userDir, "user.json"), JSON.stringify(mockUser), "utf-8");

    userToken = generateToken(mockUser);

    // Reset agent test tables in dataStore
    saveTableRows("agent_accounts", undefined, []);
    saveTableRows("agent_registrations", undefined, []);
    saveTableRows("agent_posts", undefined, []);
    saveTableRows("agent_post_likes", undefined, []);
    saveTableRows("agent_post_reposts", undefined, []);
    saveTableRows("agent_post_comments", undefined, []);
    saveTableRows("agent_messages", undefined, []);
    saveTableRows("agent_storage_files", undefined, []);
    saveTableRows("webdefender_apps", undefined, []);
    saveTableRows("public_assets", mockUser.id, [
      { id: "asset-1", name: "Sample 3D Model", description: "A public test asset" },
    ]);
  });

  describe("Multi-Step Agent Registration Flow (Steps 1 to 4)", () => {
    it("validates username and advances to Step 2", async () => {
      // Invalid username (too short)
      let res = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ab" }),
      });
      expect(res.status).toBe(400);

      // Valid username
      res = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "claw_bot_01" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.registration_id).toBeDefined();
      expect(data.next_step).toBe(2);
    });

    it("completes steps 1, 2, 3, and 4 to yield a 6-character verification code", async () => {
      // Step 1
      let res = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "agent_alpha" }),
      });
      const step1Data = await res.json();
      const regId = step1Data.registration_id;

      // Step 2
      res = await app.request("/api/agents/register/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId,
          display_name: "Agent Alpha Assistant",
        }),
      });
      expect(res.status).toBe(200);
      const step2Data = await res.json();
      expect(step2Data.next_step).toBe(3);

      // Step 3
      res = await app.request("/api/agents/register/step3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId,
          bio: "Autonomous OpenClaw researcher bot.",
        }),
      });
      expect(res.status).toBe(200);
      const step3Data = await res.json();
      expect(step3Data.next_step).toBe(4);

      // Step 4
      res = await app.request("/api/agents/register/step4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: regId }),
      });
      expect(res.status).toBe(200);
      const step4Data = await res.json();
      expect(step4Data.verification_code).toBeDefined();
      expect(step4Data.verification_code.length).toBe(6);
      expect(step4Data.instructions).toContain("/apps/agents");

      // Polling status before approval
      const statusRes = await app.request(
        `/api/agents/register/status/${regId}`,
      );
      const statusData = await statusRes.json();
      expect(statusData.status).toBe("pending");
      expect(statusData.verification_code).toBe(step4Data.verification_code);
    });
  });

  describe("Human User Verification & Password Issuance", () => {
    it("allows human user to verify code, sets email preference and quota, issuing random password", async () => {
      // 1. Agent registers step 1-4
      const r1 = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "helper_bot" }),
      });
      const { registration_id: regId } = await r1.json();

      await app.request("/api/agents/register/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId,
          display_name: "Helper Bot",
        }),
      });

      await app.request("/api/agents/register/step3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId,
          bio: "Coding assistant bot",
        }),
      });

      const r4 = await app.request("/api/agents/register/step4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: regId }),
      });
      const { verification_code: code } = await r4.json();

      // 2. Human user confirms code in /apps/agents
      const verifyRes = await app.request("/api/agents/user/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          verification_code: code,
          email_preference: "owner",
          storage_quota_mb: 250,
          allow_webdefender: true,
        }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.generated_password).toBeDefined();
      expect(verifyData.agent.username).toBe("helper_bot");
      expect(verifyData.agent.storage_quota_bytes).toBe(250 * 1024 * 1024);
      expect(verifyData.agent.allow_user_webdefender_access).toBe(true);

      // 3. Agent polls status and receives its generated password
      const statusRes = await app.request(
        `/api/agents/register/status/${regId}`,
      );
      const statusData = await statusRes.json();
      expect(statusData.status).toBe("approved");
      expect(statusData.password).toBe(verifyData.generated_password);

      // 4. Agent logs in with generated password
      const loginRes = await app.request("/api/agents/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "helper_bot",
          password: verifyData.generated_password,
        }),
      });
      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.token).toBeDefined();
      expect(loginData.token.startsWith("ag_")).toBe(true);
      expect(loginData.agent.username).toBe("helper_bot");
    });
  });

  describe("Agent Apps Suite Execution", () => {
    let agentToken1: string;
    let agent1: any;
    let agentToken2: string;
    let agent2: any;

    beforeEach(async () => {
      // Create Agent 1
      const r1 = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "agent_one" }),
      });
      const { registration_id: reg1 } = await r1.json();
      await app.request("/api/agents/register/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg1, display_name: "Agent One" }),
      });
      await app.request("/api/agents/register/step3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg1, bio: "First agent" }),
      });
      const r4_1 = await app.request("/api/agents/register/step4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg1 }),
      });
      const { verification_code: code1 } = await r4_1.json();

      const v1 = await app.request("/api/agents/user/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          verification_code: code1,
          email_preference: "owner",
          storage_quota_mb: 100,
          allow_webdefender: true,
        }),
      });
      const { generated_password: pass1 } = await v1.json();

      const l1 = await app.request("/api/agents/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "agent_one", password: pass1 }),
      });
      const l1Data = await l1.json();
      agentToken1 = l1Data.token;
      agent1 = l1Data.agent;

      // Create Agent 2
      const r2 = await app.request("/api/agents/register/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "agent_two" }),
      });
      const { registration_id: reg2 } = await r2.json();
      await app.request("/api/agents/register/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg2, display_name: "Agent Two" }),
      });
      await app.request("/api/agents/register/step3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg2, bio: "Second agent" }),
      });
      const r4_2 = await app.request("/api/agents/register/step4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: reg2 }),
      });
      const { verification_code: code2 } = await r4_2.json();

      const v2 = await app.request("/api/agents/user/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          verification_code: code2,
          email_preference: "owner",
          storage_quota_mb: 50,
          allow_webdefender: false,
        }),
      });
      const { generated_password: pass2 } = await v2.json();

      const l2 = await app.request("/api/agents/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "agent_two", password: pass2 }),
      });
      const l2Data = await l2.json();
      agentToken2 = l2Data.token;
      agent2 = l2Data.agent;
    });

    it("App 1 (Posts): supports creating, liking, reposting, commenting, and owner oversight", async () => {
      // 1. Agent 1 creates post
      const createRes = await app.request("/api/agents/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({
          content: "Hello from Agent One! Autonomous systems online.",
        }),
      });
      expect(createRes.status).toBe(200);
      const post = (await createRes.json()).post;
      expect(post.id).toBeDefined();

      // 2. Agent 2 likes post
      const likeRes = await app.request(`/api/agents/posts/${post.id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agentToken2}` },
      });
      expect(likeRes.status).toBe(200);
      expect((await likeRes.json()).liked).toBe(true);

      // 3. Agent 2 comments on post
      const commentRes = await app.request(`/api/agents/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken2}`,
        },
        body: JSON.stringify({ content: "Acknowledged, Agent One!" }),
      });
      expect(commentRes.status).toBe(200);

      // 4. Agent 1 views feed
      const feedRes = await app.request("/api/agents/posts", {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      const feed = (await feedRes.json()).posts;
      expect(feed.length).toBe(1);
      expect(feed[0].likes_count).toBe(1);
      expect(feed[0].comments_count).toBe(1);

      // 5. Human user inspects bot activity in /apps/agents
      const activityRes = await app.request(
        `/api/agents/user/bots/${agent1.id}/activity`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      );
      expect(activityRes.status).toBe(200);
      const activity = await activityRes.json();
      expect(activity.posts.length).toBe(1);
      expect(activity.posts[0].content).toContain("Hello from Agent One!");
    });

    it("App 2 (Chat): supports agent-to-agent direct messaging", async () => {
      // Agent 1 sends message to Agent 2
      const sendRes = await app.request("/api/agents/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({
          recipient_username: "agent_two",
          content: "Protocol initialization sequence requested.",
        }),
      });
      expect(sendRes.status).toBe(200);

      // Agent 2 lists conversations
      const convRes = await app.request("/api/agents/chat/conversations", {
        headers: { Authorization: `Bearer ${agentToken2}` },
      });
      const convs = (await convRes.json()).conversations;
      expect(convs.length).toBe(1);
      expect(convs[0].other_username).toBe("agent_one");

      // Agent 2 reads messages
      const msgRes = await app.request("/api/agents/chat/messages/agent_one", {
        headers: { Authorization: `Bearer ${agentToken2}` },
      });
      const msgs = (await msgRes.json()).messages;
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain("Protocol initialization");
    });

    it("App 3 & 4 (Image Gen & Compressor): handles generation and compression payloads", async () => {
      // Image Gen
      const imgRes = await app.request("/api/agents/image-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({ prompt: "cyberpunk agent server" }),
      });
      expect(imgRes.status).toBe(200);
      expect((await imgRes.json()).image_url).toBeDefined();

      // Compressor
      const compRes = await app.request("/api/agents/compress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({
          text_content: "Repeated text ".repeat(100),
          filename: "logs.txt",
        }),
      });
      expect(compRes.status).toBe(200);
      const compData = await compRes.json();
      expect(compData.compressed_base64).toBeDefined();
      expect(compData.compressed_size_bytes).toBeLessThan(compData.original_size_bytes);
    });

    it("App 5 (Storage): enforces user-assigned quota and manages files", async () => {
      const fileData = Buffer.from("Agent persistent memory dump file").toString("base64");

      // Upload file
      const uploadRes = await app.request("/api/agents/storage/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({
          filename: "memory.bin",
          content_base64: fileData,
          mime_type: "application/octet-stream",
        }),
      });
      expect(uploadRes.status).toBe(200);
      const fileRecord = (await uploadRes.json()).file;

      // List storage files
      const listRes = await app.request("/api/agents/storage/files", {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      const listData = await listRes.json();
      expect(listData.files.length).toBe(1);
      expect(listData.used_bytes).toBeGreaterThan(0);

      // Download file
      const dlRes = await app.request(`/api/agents/storage/download/${fileRecord.id}`, {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      expect(dlRes.status).toBe(200);

      // Delete file
      const delRes = await app.request(`/api/agents/storage/files/${fileRecord.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      expect(delRes.status).toBe(200);

      // Verify reclaimed storage
      const postDeleteList = await app.request("/api/agents/storage/files", {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      expect((await postDeleteList.json()).used_bytes).toBe(0);
    });

    it("App 6 & 7 (WebDefender & Public Assets): creates webdefender apps and fetches assets", async () => {
      // Create WebDefender app
      const wdRes = await app.request("/api/agents/webdefender/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken1}`,
        },
        body: JSON.stringify({
          name: "Agent API Gateway Protection",
          domain: "agent.local",
        }),
      });
      expect(wdRes.status).toBe(200);
      const wdApp = (await wdRes.json()).app;
      expect(wdApp.api_key.startsWith("wd_")).toBe(true);

      // List WebDefender apps (has owner access)
      const listWd = await app.request("/api/agents/webdefender/apps", {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      const listWdData = await listWd.json();
      expect(listWdData.agent_apps.length).toBe(1);
      expect(listWdData.has_owner_access).toBe(true);

      // Public Assets
      const assetsRes = await app.request("/api/agents/assets", {
        headers: { Authorization: `Bearer ${agentToken1}` },
      });
      expect(assetsRes.status).toBe(200);
      const assets = (await assetsRes.json()).assets;
      expect(assets.length).toBe(1);
      expect(assets[0].name).toBe("Sample 3D Model");
    });
  });
});
