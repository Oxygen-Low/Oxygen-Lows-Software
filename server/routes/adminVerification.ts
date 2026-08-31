import { Hono } from "hono";
import crypto from "node:crypto";
import { serverStorage } from "../lib/storage.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  queryTable,
  insertTable,
  updateTable,
  deleteTable,
  getProfileByUserId,
} from "../lib/dataStore.ts";

export const adminVerificationRouter = new Hono();

adminVerificationRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  // Set user on context
  c.set("user" as any, user);
  await next();
});

// GET /api/admin/verifications - List verifications with filters
adminVerificationRouter.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const assetType = c.req.query("asset_type");
    const targetType = c.req.query("target_type");

    const filters: any[] = [];
    if (status && status !== "all") {
      filters.push({ field: "status", operator: "eq", value: status });
    }
    if (assetType && assetType !== "all") {
      filters.push({ field: "asset_type", operator: "eq", value: assetType });
    }
    if (targetType && targetType !== "all") {
      filters.push({ field: "target_type", operator: "eq", value: targetType });
    }

    const verifications = queryTable({
      table: "asset_verifications",
      filters,
      order: { column: "created_at", ascending: false },
    });

    const listWithProfiles = (verifications || []).map((v: any) => {
      const p = v.user_id ? getProfileByUserId(v.user_id) : null;
      return {
        ...v,
        profiles: p
          ? {
              user_id: p.user_id || p.id,
              username: p.username,
              email: p.email,
              avatar_url: p.avatar_url,
            }
          : null,
      };
    });

    return c.json({ verifications: listWithProfiles });
  } catch (error: any) {
    console.error("Error fetching verifications:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/admin/verifications/:id/approve - Approve a verification request
adminVerificationRouter.post("/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    const adminUser = c.get("user" as any);

    const verifications = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }],
    });
    const verification = verifications && verifications[0];

    if (!verification) {
      return c.json({ error: "Verification request not found" }, 404);
    }

    let publicAssetId = verification.public_asset_id;
    let publicCharacterId = verification.public_character_id;

    if (verification.target_type === "public_asset") {
      if (verification.asset_type === "file") {
        // Copy file from private Storage bucket to public-assets bucket if filePath present
        if (verification.original_file_path) {
          const { data: fileData, error: downloadErr } =
            await serverStorage.download(
              "Storage",
              verification.original_file_path,
            );

          if (!downloadErr && fileData) {
            await serverStorage.upload(
              "public-assets",
              verification.original_file_path,
              fileData,
            );
          }
        }

        // Upsert into public_assets
        if (publicAssetId) {
          const updated = updateTable(
            "public_assets",
            [{ field: "id", operator: "eq", value: publicAssetId }],
            {
              name: verification.title,
              display_name:
                verification.metadata?.display_name || verification.title,
              category: verification.metadata?.category || "other",
              description: verification.description || "",
              file_path: verification.original_file_path || "",
              file_size: verification.file_size || 0,
              mime_type: verification.mime_type || "",
              updated_at: new Date().toISOString(),
            },
            verification.user_id,
          );
          if (updated && updated[0]) publicAssetId = updated[0].id;
        } else {
          const newAsset = {
            id: crypto.randomUUID(),
            uploader_id: verification.user_id,
            user_id: verification.user_id,
            name: verification.title,
            display_name:
              verification.metadata?.display_name || verification.title,
            category: verification.metadata?.category || "other",
            description: verification.description || "",
            file_path: verification.original_file_path || "",
            file_size: verification.file_size || 0,
            mime_type: verification.mime_type || "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const inserted = insertTable("public_assets", newAsset, verification.user_id);
          const insObj = Array.isArray(inserted) ? inserted[0] : inserted;
          if (insObj) publicAssetId = insObj.id;
        }
      } else if (
        verification.asset_type === "character" ||
        verification.asset_type === "universe" ||
        verification.asset_type === "race"
      ) {
        // Publish/Update Character Snapshot in public_characters
        const meta = verification.metadata || {};
        const isUniverse =
          verification.asset_type === "universe" || Boolean(meta.is_universe);
        const isRace =
          verification.asset_type === "race" || Boolean(meta.is_race);
        const payload: any = {
          uploader_id: verification.user_id,
          user_id: verification.user_id,
          original_character_id: verification.original_id || null,
          name: meta.name || verification.title,
          display_name: meta.display_name || null,
          short_description:
            meta.short_description || verification.description || null,
          appearance: meta.appearance || null,
          personality: meta.personality || null,
          backstory: meta.backstory || null,
          hidden_description: meta.hidden_description || null,
          image_path: meta.image_path || null,
          image_url: meta.image_url || null,
          is_universe: isUniverse,
          is_race: isRace,
          race_id: meta.race_id || null,
          universe_id: meta.universe_id || null,
          updated_at: new Date().toISOString(),
        };

        if (publicCharacterId) {
          const updated = updateTable(
            "public_characters",
            [{ field: "id", operator: "eq", value: publicCharacterId }],
            payload,
            verification.user_id,
          );
          if (updated && updated[0]) publicCharacterId = updated[0].id;
        } else {
          payload.id = crypto.randomUUID();
          payload.created_at = new Date().toISOString();
          const inserted = insertTable("public_characters", payload, verification.user_id);
          const insObj = Array.isArray(inserted) ? inserted[0] : inserted;
          if (insObj) publicCharacterId = insObj.id;
        }
      }
    } else if (verification.target_type === "public_usage") {
      if (
        (verification.asset_type === "character" ||
          verification.asset_type === "universe" ||
          verification.asset_type === "race") &&
        verification.original_id
      ) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: verification.original_id }],
          { is_verified_public: true },
          verification.user_id,
        );
      }
    }

    const updated = updateTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      {
        status: "approved",
        public_asset_id: publicAssetId || null,
        public_character_id: publicCharacterId || null,
        rejection_reason: null,
        reviewed_by: adminUser?.id || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      verification.user_id,
    );

    return c.json({ success: true, verification: updated && updated[0] });
  } catch (error: any) {
    console.error("Error approving verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// POST /api/admin/verifications/:id/reject - Reject a verification request (Reason is MANDATORY)
adminVerificationRouter.post("/:id/reject", async (c) => {
  try {
    const id = c.req.param("id");
    const adminUser = c.get("user" as any);
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return c.json(
        { error: "Denial reason is required to reject a submission." },
        400,
      );
    }

    const verifications = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }],
    });
    const verification = verifications && verifications[0];

    if (!verification) {
      return c.json({ error: "Verification request not found" }, 404);
    }

    const updated = updateTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      {
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: adminUser?.id || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      verification.user_id,
    );

    return c.json({ success: true, verification: updated && updated[0] });
  } catch (error: any) {
    console.error("Error rejecting verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// DELETE /api/admin/verifications/:id
adminVerificationRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    deleteTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
    );

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
