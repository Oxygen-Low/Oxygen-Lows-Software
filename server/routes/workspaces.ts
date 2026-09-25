import { Hono } from "hono";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  STORAGE_DIR,
  MAX_USER_QUOTA,
  getUserTotalSize,
  getMimeType,
  sanitizePath,
  assertSafeStoragePath,
} from "../lib/storage.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getTableRows,
  saveTableRows,
  insertTable,
  updateTable,
  deleteTable,
  WorkspaceRecord,
  WorkspaceMemberRecord,
  WorkspaceFileRecord,
  WorkspaceCommentRecord,
  WorkspaceActivityRecord,
  getProfileByUserId,
} from "../lib/dataStore.ts";
import { scanImage } from "../lib/safety/csamGuard.ts";
import { executeZeroToleranceLockdown, extractClientIp } from "../lib/safety/enforcement.ts";
import {
  moderateImage,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";

export const workspacesRouter = new Hono<{
  Variables: { user: any; token: string };
}>();

const authMiddleware = async (c: any, next: any) => {
  let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) {
    token = c.req.query("token");
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("token", token);
  await next();
};

function getWorkspaceDir(workspaceId: string): string {
  const cleanId = sanitizePath(workspaceId);
  const dir = assertSafeStoragePath(STORAGE_DIR, "workspaces", cleanId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getWorkspaceAndMembership(workspaceId: string, userId: string): {
  workspace: WorkspaceRecord | null;
  member: WorkspaceMemberRecord | null;
} {
  const workspaces: WorkspaceRecord[] = getTableRows("workspaces");
  const workspace = workspaces.find((w) => w.id === workspaceId) || null;
  if (!workspace) {
    return { workspace: null, member: null };
  }

  const members: WorkspaceMemberRecord[] = getTableRows("workspace_members");
  const member =
    members.find(
      (m) => m.workspace_id === workspaceId && String(m.user_id) === String(userId),
    ) || null;

  return { workspace, member };
}

function logActivity(
  workspaceId: string,
  user: { id: string | number; username?: string },
  action: WorkspaceActivityRecord["action"],
  details?: string,
) {
  try {
    const activity: WorkspaceActivityRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: String(user.id),
      username: user.username || `User_${user.id}`,
      action,
      details,
      created_at: new Date().toISOString(),
    };
    insertTable("workspace_activities", activity, user.id);
  } catch (err) {
    console.error("Failed to log workspace activity:", err);
  }
}

// 1. List workspaces for current user
workspacesRouter.get("/", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);

    const members: WorkspaceMemberRecord[] = getTableRows("workspace_members");
    const userMemberships = members.filter((m) => String(m.user_id) === userId);
    const workspaceIds = new Set(userMemberships.map((m) => m.workspace_id));

    const allWorkspaces: WorkspaceRecord[] = getTableRows("workspaces");
    const userWorkspaces = allWorkspaces.filter((w) => workspaceIds.has(w.id));

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");

    const result = userWorkspaces.map((ws) => {
      const membership = userMemberships.find((m) => m.workspace_id === ws.id);
      const wsMembers = members.filter((m) => m.workspace_id === ws.id);
      const wsFiles = allFiles.filter((f) => f.workspace_id === ws.id);
      const ownerProfile = getProfileByUserId(ws.owner_id);

      return {
        ...ws,
        role: membership?.role || "collaborator",
        member_count: wsMembers.length,
        file_count: wsFiles.length,
        owner_name: ownerProfile?.username || `User_${ws.owner_id}`,
      };
    });

    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// 2. Create new workspace
workspacesRouter.post("/", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();

    if (!name) {
      return c.json({ error: "Workspace name is required" }, 400);
    }

    const now = new Date().toISOString();
    const workspaceId = crypto.randomUUID();
    const inviteCode = crypto.randomBytes(6).toString("hex");

    const newWorkspace: WorkspaceRecord = {
      id: workspaceId,
      name,
      description,
      owner_id: String(user.id),
      invite_code: inviteCode,
      created_at: now,
      updated_at: now,
    };

    insertTable("workspaces", newWorkspace, user.id);

    // Add creator as owner member
    const newMember: WorkspaceMemberRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: String(user.id),
      username: user.username || `User_${user.id}`,
      role: "owner",
      joined_at: now,
    };
    insertTable("workspace_members", newMember, user.id);

    // Ensure storage folder
    getWorkspaceDir(workspaceId);

    logActivity(workspaceId, user, "create_workspace", `Created workspace "${name}"`);

    return c.json({
      data: {
        ...newWorkspace,
        role: "owner",
        member_count: 1,
        file_count: 0,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Workspace Public Invite Preview (No auth strictly required, but provides auth details if logged in)
workspacesRouter.get("/invite/:code", async (c) => {
  try {
    const code = c.req.param("code");
    const allWorkspaces: WorkspaceRecord[] = getTableRows("workspaces");
    const ws = allWorkspaces.find((w) => w.invite_code === code);

    if (!ws) {
      return c.json({ error: "Invalid or expired invitation link" }, 404);
    }

    const members: WorkspaceMemberRecord[] = getTableRows("workspace_members");
    const wsMembers = members.filter((m) => m.workspace_id === ws.id);
    const ownerProfile = getProfileByUserId(ws.owner_id);

    return c.json({
      data: {
        id: ws.id,
        name: ws.name,
        description: ws.description,
        member_count: wsMembers.length,
        owner_name: ownerProfile?.username || `User_${ws.owner_id}`,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Join workspace via invite code (Auth required)
workspacesRouter.post("/invite/:code/join", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);
    const code = c.req.param("code");

    const allWorkspaces: WorkspaceRecord[] = getTableRows("workspaces");
    const ws = allWorkspaces.find((w) => w.invite_code === code);

    if (!ws) {
      return c.json({ error: "Invalid or expired invitation link" }, 404);
    }

    const members: WorkspaceMemberRecord[] = getTableRows("workspace_members");
    const existing = members.find(
      (m) => m.workspace_id === ws.id && String(m.user_id) === userId,
    );

    if (existing) {
      return c.json({
        data: { workspaceId: ws.id, alreadyMember: true },
        error: null,
      });
    }

    const newMember: WorkspaceMemberRecord = {
      id: crypto.randomUUID(),
      workspace_id: ws.id,
      user_id: userId,
      username: user.username || `User_${userId}`,
      role: "collaborator",
      joined_at: new Date().toISOString(),
    };

    insertTable("workspace_members", newMember, user.id);
    logActivity(ws.id, user, "join_workspace", `Joined the workspace`);

    return c.json({
      data: { workspaceId: ws.id, alreadyMember: false },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Get single workspace details
workspacesRouter.get("/:workspaceId", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Workspace not found or access denied" }, 404);
    }

    const members: WorkspaceMemberRecord[] = getTableRows("workspace_members");
    const wsMembers = members.filter((m) => m.workspace_id === workspaceId);

    const enrichedMembers = wsMembers.map((m) => {
      const p = getProfileByUserId(m.user_id);
      return {
        ...m,
        username: p?.username || m.username || `User_${m.user_id}`,
        avatar_url: p?.avatar_url || m.avatar_url || null,
      };
    });

    return c.json({
      data: {
        ...workspace,
        role: member.role,
        members: enrichedMembers,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. Delete workspace (Owner only)
workspacesRouter.delete("/:workspaceId", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace) {
      return c.json({ error: "Workspace not found" }, 404);
    }

    if (member?.role !== "owner" && user.role !== "admin") {
      return c.json({ error: "Only the workspace owner can delete the project" }, 403);
    }

    // Delete records from data tables
    deleteTable("workspaces", [{ field: "id", operator: "eq", value: workspaceId }]);
    deleteTable("workspace_members", [{ field: "workspace_id", operator: "eq", value: workspaceId }]);
    deleteTable("workspace_files", [{ field: "workspace_id", operator: "eq", value: workspaceId }]);
    deleteTable("workspace_comments", [{ field: "workspace_id", operator: "eq", value: workspaceId }]);
    deleteTable("workspace_activities", [{ field: "workspace_id", operator: "eq", value: workspaceId }]);

    // Remove disk folder
    try {
      const dir = assertSafeStoragePath(STORAGE_DIR, "workspaces", sanitizePath(workspaceId));
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Failed to delete workspace folder from disk:", e);
    }

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. Regenerate invite code (Owner only)
workspacesRouter.post("/:workspaceId/regenerate-invite", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace) {
      return c.json({ error: "Workspace not found" }, 404);
    }

    if (member?.role !== "owner" && user.role !== "admin") {
      return c.json({ error: "Only the workspace owner can regenerate invite links" }, 403);
    }

    const newCode = crypto.randomBytes(6).toString("hex");
    updateTable(
      "workspaces",
      [{ field: "id", operator: "eq", value: workspaceId }],
      { invite_code: newCode, updated_at: new Date().toISOString() },
    );

    return c.json({ data: { invite_code: newCode }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. Remove member / Leave workspace
workspacesRouter.post("/:workspaceId/members/remove", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const body = await c.req.json().catch(() => ({}));
    const targetUserId = String(body.userId || user.id);

    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));
    if (!workspace || !member) {
      return c.json({ error: "Workspace not found or access denied" }, 404);
    }

    // If removing someone else, must be owner
    if (targetUserId !== String(user.id) && member.role !== "owner" && user.role !== "admin") {
      return c.json({ error: "Only the owner can remove other collaborators" }, 403);
    }

    // Owner cannot leave without deleting
    if (targetUserId === workspace.owner_id) {
      return c.json({ error: "Workspace owner cannot leave the project; delete it instead" }, 400);
    }

    deleteTable("workspace_members", [
      { field: "workspace_id", operator: "eq", value: workspaceId },
      { field: "user_id", operator: "eq", value: targetUserId },
    ]);

    logActivity(
      workspaceId,
      user,
      "join_workspace",
      targetUserId === String(user.id) ? "Left the workspace" : `Removed user from workspace`,
    );

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. List workspace files
workspacesRouter.get("/:workspaceId/files", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");
    const files = allFiles.filter((f) => f.workspace_id === workspaceId);

    return c.json({ data: files, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 10. Import file from personal storage into workspace (Copies into workspace drive)
workspacesRouter.post("/:workspaceId/import-file", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, userId);

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const rawSourcePath = String(body.sourcePath || "").trim();
    if (!rawSourcePath) {
      return c.json({ error: "sourcePath is required" }, 400);
    }

    let cleanSource = sanitizePath(rawSourcePath);
    // If doesn't start with userId, prepend userId/
    if (!cleanSource.startsWith(userId + "/") && !cleanSource.startsWith("Storage/")) {
      cleanSource = `${userId}/${cleanSource}`;
    }

    const sourceFullPath = assertSafeStoragePath(STORAGE_DIR, "Storage", cleanSource);
    if (!fs.existsSync(sourceFullPath) || fs.statSync(sourceFullPath).isDirectory()) {
      return c.json({ error: "Source file not found in personal storage" }, 404);
    }

    const fileStats = fs.statSync(sourceFullPath);
    const fileSize = fileStats.size;

    // Check workspace owner's storage quota
    const ownerTotalSize = getUserTotalSize(workspace.owner_id);
    if (ownerTotalSize + fileSize > MAX_USER_QUOTA) {
      return c.json({ error: "Workspace owner's storage quota (500MB) exceeded" }, 400);
    }

    const originalName = path.basename(sourceFullPath);
    const baseName = sanitizePath(body.fileName || originalName);

    const wsDir = getWorkspaceDir(workspaceId);
    let targetFileName = baseName;
    let targetFullPath = assertSafeStoragePath(wsDir, targetFileName);

    // If filename exists in workspace, append timestamp
    if (fs.existsSync(targetFullPath)) {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      targetFileName = `${nameWithoutExt}_${Date.now()}${ext}`;
      targetFullPath = assertSafeStoragePath(wsDir, targetFileName);
    }

    // Copy file
    fs.copyFileSync(sourceFullPath, targetFullPath);

    const now = new Date().toISOString();
    const newFileRecord: WorkspaceFileRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: targetFileName,
      size: fileSize,
      mime_type: getMimeType(targetFileName),
      created_by: userId,
      created_by_username: user.username || `User_${userId}`,
      created_at: now,
      updated_at: now,
    };

    insertTable("workspace_files", newFileRecord, user.id);
    logActivity(workspaceId, user, "import_file", `Imported "${targetFileName}" from personal storage`);

    return c.json({ data: newFileRecord, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 11. Direct file upload into workspace
workspacesRouter.post("/:workspaceId/upload", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, userId);

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const body = await c.req.parseBody();
    const file = body["file"] as any;
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    let buffer: Buffer;
    if (typeof file === "object" && file !== null && typeof file.arrayBuffer === "function") {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf-8");
    } else {
      return c.json({ error: "Invalid file format" }, 400);
    }

    const fileSize = file.size ?? buffer.length;
    const ownerTotalSize = getUserTotalSize(workspace.owner_id);
    if (ownerTotalSize + fileSize > MAX_USER_QUOTA) {
      return c.json({ error: "Workspace owner's storage quota (500MB) exceeded" }, 400);
    }

    const rawName = file.name || "uploaded_file.bin";
    const cleanFileName = sanitizePath(rawName).replace(/[/\\]/g, "_");
    const mime = getMimeType(cleanFileName);

    // Media safety check
    if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(cleanFileName)) {
      const scanResult = await scanImage(buffer, mime);
      if (!scanResult.safe && scanResult.severity >= 2) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const lockdown = await executeZeroToleranceLockdown({
          ip,
          user,
          userAgent,
          surface: "workspace_upload",
          fileName: cleanFileName,
          fileHash: scanResult.details?.hash,
          mimeType: mime,
          severity: scanResult.severity,
          reason: scanResult.reason || "Uploaded image flagged by child safety scanner",
        });
        return c.json(lockdown.clientResponse, 400);
      }

      const openAiImgResult = await moderateImage(buffer, mime);
      if (!openAiImgResult.allowed) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const enforcement = await handleModerationEnforcement(openAiImgResult, {
          ip,
          user,
          userAgent,
          surface: "workspace_upload",
          fileName: cleanFileName,
          fileHash: scanResult.details?.hash,
          mimeType: mime,
        });
        if (enforcement) {
          return c.json(enforcement.clientResponse, 400);
        }
      }
    }

    const wsDir = getWorkspaceDir(workspaceId);
    let targetFileName = cleanFileName;
    let targetFullPath = assertSafeStoragePath(wsDir, targetFileName);

    if (fs.existsSync(targetFullPath)) {
      const ext = path.extname(cleanFileName);
      const nameWithoutExt = path.basename(cleanFileName, ext);
      targetFileName = `${nameWithoutExt}_${Date.now()}${ext}`;
      targetFullPath = assertSafeStoragePath(wsDir, targetFileName);
    }

    fs.writeFileSync(targetFullPath, buffer);

    const now = new Date().toISOString();
    const newFileRecord: WorkspaceFileRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: targetFileName,
      size: fileSize,
      mime_type: mime,
      created_by: userId,
      created_by_username: user.username || `User_${userId}`,
      created_at: now,
      updated_at: now,
    };

    insertTable("workspace_files", newFileRecord, user.id);
    logActivity(workspaceId, user, "upload_file", `Uploaded "${targetFileName}"`);

    return c.json({ data: newFileRecord, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 12. Read file content for in-browser editing
workspacesRouter.get("/:workspaceId/files/:fileId/content", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const fileId = c.req.param("fileId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");
    const fileRecord = allFiles.find((f) => f.id === fileId && f.workspace_id === workspaceId);
    if (!fileRecord) {
      return c.json({ error: "File not found" }, 404);
    }

    const wsDir = getWorkspaceDir(workspaceId);
    const filePath = assertSafeStoragePath(wsDir, fileRecord.name);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "File data not found on disk" }, 404);
    }

    // Limit text loading to 10MB to avoid freezing
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      return c.json({ error: "File too large to open in text editor" }, 400);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return c.json({
      data: {
        content,
        file: fileRecord,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 13. Update file content with conflict detection
workspacesRouter.put("/:workspaceId/files/:fileId/content", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const fileId = c.req.param("fileId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");
    const fileRecord = allFiles.find((f) => f.id === fileId && f.workspace_id === workspaceId);
    if (!fileRecord) {
      return c.json({ error: "File not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const newContent = typeof body.content === "string" ? body.content : "";
    const lastKnownUpdatedAt = body.lastKnownUpdatedAt;
    const force = Boolean(body.force);

    // Conflict detection
    if (
      !force &&
      lastKnownUpdatedAt &&
      new Date(fileRecord.updated_at).getTime() > new Date(lastKnownUpdatedAt).getTime()
    ) {
      return c.json(
        {
          error: "Conflict detected: another collaborator saved changes more recently.",
          conflict: true,
          currentUpdatedAt: fileRecord.updated_at,
        },
        409,
      );
    }

    const buffer = Buffer.from(newContent, "utf-8");
    const newSize = buffer.length;

    // Check quota difference
    const sizeDelta = newSize - fileRecord.size;
    if (sizeDelta > 0) {
      const ownerTotal = getUserTotalSize(workspace.owner_id);
      if (ownerTotal + sizeDelta > MAX_USER_QUOTA) {
        return c.json({ error: "Workspace owner quota exceeded" }, 400);
      }
    }

    const wsDir = getWorkspaceDir(workspaceId);
    const filePath = assertSafeStoragePath(wsDir, fileRecord.name);
    fs.writeFileSync(filePath, buffer);

    const now = new Date().toISOString();
    updateTable(
      "workspace_files",
      [{ field: "id", operator: "eq", value: fileId }],
      { size: newSize, updated_at: now },
    );

    logActivity(workspaceId, user, "edit_file", `Modified file "${fileRecord.name}"`);

    return c.json({
      data: {
        ...fileRecord,
        size: newSize,
        updated_at: now,
      },
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 14. Download file
workspacesRouter.get("/:workspaceId/files/:fileId/download", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const fileId = c.req.param("fileId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.text("Access denied", 403);
    }

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");
    const fileRecord = allFiles.find((f) => f.id === fileId && f.workspace_id === workspaceId);
    if (!fileRecord) {
      return c.text("File not found", 404);
    }

    const wsDir = getWorkspaceDir(workspaceId);
    const filePath = assertSafeStoragePath(wsDir, fileRecord.name);
    if (!fs.existsSync(filePath)) {
      return c.text("File not found on disk", 404);
    }

    const buffer = fs.readFileSync(filePath);
    const mime = fileRecord.mime_type || getMimeType(fileRecord.name);

    return c.body(buffer as any, 200, {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileRecord.name)}"`,
      "Content-Length": String(buffer.length),
    });
  } catch (err: any) {
    return c.text(err.message || "Download failed", 500);
  }
});

// 15. Delete file
workspacesRouter.delete("/:workspaceId/files/:fileId", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const fileId = c.req.param("fileId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allFiles: WorkspaceFileRecord[] = getTableRows("workspace_files");
    const fileRecord = allFiles.find((f) => f.id === fileId && f.workspace_id === workspaceId);
    if (!fileRecord) {
      return c.json({ error: "File not found" }, 404);
    }

    // Delete from disk
    try {
      const wsDir = getWorkspaceDir(workspaceId);
      const filePath = assertSafeStoragePath(wsDir, fileRecord.name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error("Error removing file from disk:", e);
    }

    // Delete records
    deleteTable("workspace_files", [{ field: "id", operator: "eq", value: fileId }]);
    deleteTable("workspace_comments", [{ field: "file_id", operator: "eq", value: fileId }]);

    logActivity(workspaceId, user, "delete_file", `Deleted "${fileRecord.name}"`);

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 16. Get comments
workspacesRouter.get("/:workspaceId/comments", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const fileId = c.req.query("fileId");
    const allComments: WorkspaceCommentRecord[] = getTableRows("workspace_comments");
    let comments = allComments.filter((comm) => comm.workspace_id === workspaceId);

    if (fileId !== undefined) {
      if (fileId === "general" || fileId === "" || fileId === "null") {
        comments = comments.filter((comm) => !comm.file_id);
      } else {
        comments = comments.filter((comm) => comm.file_id === fileId);
      }
    }

    // Enrich usernames and avatars
    const enriched = comments.map((comm) => {
      const profile = getProfileByUserId(comm.user_id);
      return {
        ...comm,
        username: profile?.username || comm.username || `User_${comm.user_id}`,
        avatar_url: profile?.avatar_url || comm.avatar_url || null,
      };
    });

    return c.json({ data: enriched, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 17. Add comment
workspacesRouter.post("/:workspaceId/comments", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, userId);

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const content = String(body.content || "").trim();
    if (!content) {
      return c.json({ error: "Comment content cannot be empty" }, 400);
    }

    const fileId = body.fileId ? String(body.fileId) : null;
    const profile = getProfileByUserId(userId);

    const newComment: WorkspaceCommentRecord = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      file_id: fileId,
      user_id: userId,
      username: profile?.username || user.username || `User_${userId}`,
      avatar_url: profile?.avatar_url || null,
      content,
      created_at: new Date().toISOString(),
    };

    insertTable("workspace_comments", newComment, user.id);
    logActivity(
      workspaceId,
      user,
      "comment",
      fileId ? `Commented on a file` : `Posted a message in workspace discussion`,
    );

    return c.json({ data: newComment, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 18. Delete comment
workspacesRouter.delete("/:workspaceId/comments/:commentId", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const userId = String(user.id);
    const workspaceId = c.req.param("workspaceId");
    const commentId = c.req.param("commentId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, userId);

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allComments: WorkspaceCommentRecord[] = getTableRows("workspace_comments");
    const comment = allComments.find((comm) => comm.id === commentId && comm.workspace_id === workspaceId);

    if (!comment) {
      return c.json({ error: "Comment not found" }, 404);
    }

    if (comment.user_id !== userId && member.role !== "owner" && user.role !== "admin") {
      return c.json({ error: "Not authorized to delete this comment" }, 403);
    }

    deleteTable("workspace_comments", [{ field: "id", operator: "eq", value: commentId }]);
    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 19. Get activity feed
workspacesRouter.get("/:workspaceId/activities", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { workspace, member } = getWorkspaceAndMembership(workspaceId, String(user.id));

    if (!workspace || !member) {
      return c.json({ error: "Access denied" }, 403);
    }

    const allActivities: WorkspaceActivityRecord[] = getTableRows("workspace_activities");
    const activities = allActivities
      .filter((a) => a.workspace_id === workspaceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    return c.json({ data: activities, error: null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
