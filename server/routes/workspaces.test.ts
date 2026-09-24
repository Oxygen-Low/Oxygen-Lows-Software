import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { authRouter } from "./auth.ts";
import { workspacesRouter } from "./workspaces.ts";
import { storageRouter } from "./storage.ts";
import { STORAGE_DIR } from "../lib/storage.ts";

const app = new Hono();
app.route("/api/auth", authRouter);
app.route("/api/workspaces", workspacesRouter);
app.route("/api/storage", storageRouter);

describe("Workspaces Router Integration", () => {
  const ts = Date.now();
  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let userBId: string;
  let workspaceId: string;
  let inviteCode: string;
  let createdFileId: string;

  beforeAll(async () => {
    // Register User A
    const resA = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `Owner_${ts}`,
        email: `owner_${ts}@example.com`,
        password: "password123",
      }),
    });
    const dataA = await resA.json();
    tokenA = dataA.token;
    userAId = String(dataA.user.id);

    // Register User B
    const resB = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `Collab_${ts}`,
        email: `collab_${ts}@example.com`,
        password: "password123",
      }),
    });
    const dataB = await resB.json();
    tokenB = dataB.token;
    userBId = String(dataB.user.id);
  });

  it("creates a new workspace as User A", async () => {
    const res = await app.request("/api/workspaces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: "Project Apollo",
        description: "Shared project workspace",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.name).toBe("Project Apollo");
    expect(json.data.role).toBe("owner");
    expect(json.data.invite_code).toBeDefined();

    workspaceId = json.data.id;
    inviteCode = json.data.invite_code;
  });

  it("lists workspaces for User A", async () => {
    const res = await app.request("/api/workspaces", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    const found = json.data.find((w: any) => w.id === workspaceId);
    expect(found).toBeDefined();
    expect(found.role).toBe("owner");
  });

  it("allows public preview of invite link", async () => {
    const res = await app.request(`/api/workspaces/invite/${inviteCode}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe("Project Apollo");
    expect(json.data.member_count).toBe(1);
  });

  it("joins workspace as User B via invite code", async () => {
    const res = await app.request(`/api/workspaces/invite/${inviteCode}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.workspaceId).toBe(workspaceId);
    expect(json.data.alreadyMember).toBe(false);

    // Verify User B now sees the workspace
    const listRes = await app.request("/api/workspaces", {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const listJson = await listRes.json();
    const ws = listJson.data.find((w: any) => w.id === workspaceId);
    expect(ws).toBeDefined();
    expect(ws.role).toBe("collaborator");
  });

  it("imports a personal storage file into workspace", async () => {
    // Put a personal test file in User A's storage folder
    const userStorageDir = path.join(STORAGE_DIR, "Storage", userAId);
    fs.mkdirSync(userStorageDir, { recursive: true });
    const sourceFilePath = path.join(userStorageDir, "project_notes.txt");
    fs.writeFileSync(sourceFilePath, "Initial notes for project Apollo.");

    const res = await app.request(`/api/workspaces/${workspaceId}/import-file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        sourcePath: "project_notes.txt",
        fileName: "Apollo_Notes.txt",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.name).toBe("Apollo_Notes.txt");
    expect(json.data.size).toBeGreaterThan(0);
    createdFileId = json.data.id;
  });

  it("allows User B (collaborator) to read and modify file content", async () => {
    // Read content
    const readRes = await app.request(
      `/api/workspaces/${workspaceId}/files/${createdFileId}/content`,
      {
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    expect(readRes.status).toBe(200);
    const readJson = await readRes.json();
    expect(readJson.data.content).toBe("Initial notes for project Apollo.");

    // Update content
    const updateRes = await app.request(
      `/api/workspaces/${workspaceId}/files/${createdFileId}/content`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          content: "Updated notes by collaborator B.",
          lastKnownUpdatedAt: readJson.data.file.updated_at,
        }),
      },
    );
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.data.size).toBe("Updated notes by collaborator B.".length);
  });

  it("detects editing conflicts when lastKnownUpdatedAt is outdated", async () => {
    const outdatedTimestamp = new Date(Date.now() - 100000).toISOString();
    const conflictRes = await app.request(
      `/api/workspaces/${workspaceId}/files/${createdFileId}/content`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: "Overwriting without knowing latest",
          lastKnownUpdatedAt: outdatedTimestamp,
        }),
      },
    );
    expect(conflictRes.status).toBe(409);
    const json = await conflictRes.json();
    expect(json.conflict).toBe(true);
  });

  it("supports per-file and general comments", async () => {
    // Per-file comment
    const fileCommRes = await app.request(
      `/api/workspaces/${workspaceId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          fileId: createdFileId,
          content: "Great document! Looked over section 1.",
        }),
      },
    );
    expect(fileCommRes.status).toBe(200);

    // General workspace discussion comment
    const genCommRes = await app.request(
      `/api/workspaces/${workspaceId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          fileId: null,
          content: "Welcome to the team everyone!",
        }),
      },
    );
    expect(genCommRes.status).toBe(200);

    // Fetch file comments
    const getFileComms = await app.request(
      `/api/workspaces/${workspaceId}/comments?fileId=${createdFileId}`,
      {
        headers: { Authorization: `Bearer ${tokenA}` },
      },
    );
    const fileCommsJson = await getFileComms.json();
    expect(fileCommsJson.data.length).toBe(1);
    expect(fileCommsJson.data[0].content).toContain("Great document");

    // Fetch general discussion comments
    const getGenComms = await app.request(
      `/api/workspaces/${workspaceId}/comments?fileId=general`,
      {
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    const genCommsJson = await getGenComms.json();
    expect(genCommsJson.data.length).toBe(1);
    expect(genCommsJson.data[0].content).toContain("Welcome to the team");
  });

  it("records workspace activities", async () => {
    const actRes = await app.request(
      `/api/workspaces/${workspaceId}/activities`,
      {
        headers: { Authorization: `Bearer ${tokenA}` },
      },
    );
    expect(actRes.status).toBe(200);
    const actJson = await actRes.json();
    expect(actJson.data.length).toBeGreaterThanOrEqual(4);
  });

  it("deletes the workspace and cleans up", async () => {
    const delRes = await app.request(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(delRes.status).toBe(200);

    // Verify not found
    const getRes = await app.request(`/api/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(getRes.status).toBe(404);
  });
});
