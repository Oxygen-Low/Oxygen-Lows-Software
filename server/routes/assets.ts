import { Hono } from "hono";
import crypto from "node:crypto";
import { serverStorage } from "../lib/storage.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  queryTable,
  insertTable,
  updateTable,
  deleteTable,
} from "../lib/dataStore.ts";

export const assetsRouter = new Hono();

// Middleware to authenticate user
assetsRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
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

  c.set("user" as any, user);
  c.set("token" as any, token);
  await next();
});

// GET /api/assets/verifications/my - Fetch current user's submitted verification requests
assetsRouter.get("/verifications/my", async (c) => {
  try {
    const user = c.get("user" as any);
    const verifications = queryTable({
      table: "asset_verifications",
      userId: user.id,
      filters: [{ field: "user_id", operator: "eq", value: user.id }],
      order: { column: "created_at", ascending: false },
    });

    return c.json({ verifications: verifications || [] });
  } catch (error: any) {
    console.error("Error fetching my verifications:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/assets/verifications/submit - Submit a verification request
assetsRouter.post("/verifications/submit", async (c) => {
  try {
    const user = c.get("user" as any);
    const body = await c.req.json().catch(() => ({}));
    const {
      asset_type,
      target_type = "public_asset",
      title,
      description = "",
      original_id = null,
      original_file_path = null,
      file_size = 0,
      mime_type = null,
      metadata = {},
      public_asset_id = null,
      public_character_id = null,
    } = body;

    if (
      !asset_type ||
      !["file", "character", "universe", "race"].includes(asset_type)
    ) {
      return c.json({ error: "Invalid asset type" }, 400);
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ error: "Title is required" }, 400);
    }

    // Enforce 1 verification per file/asset for the user by deleting previous verification requests
    if (asset_type === "file" && original_file_path) {
      deleteTable(
        "asset_verifications",
        [
          { field: "user_id", operator: "eq", value: user.id },
          {
            field: "original_file_path",
            operator: "eq",
            value: original_file_path,
          },
        ],
        user.id,
      );
    } else if (original_id) {
      deleteTable(
        "asset_verifications",
        [
          { field: "user_id", operator: "eq", value: user.id },
          { field: "original_id", operator: "eq", value: original_id },
        ],
        user.id,
      );
    }

    const payload = {
      id: crypto.randomUUID(),
      user_id: user.id,
      asset_type,
      target_type,
      status: "pending",
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      original_id,
      original_file_path,
      file_size,
      mime_type,
      public_asset_id,
      public_character_id,
      metadata,
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const inserted = insertTable("asset_verifications", payload, user.id);
    const verification = Array.isArray(inserted) ? inserted[0] : inserted;

    return c.json({ success: true, verification });
  } catch (error: any) {
    console.error("Error submitting verification request:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// DELETE /api/assets/verifications/:id - Delete own verification request (pending, approved, or rejected)
assetsRouter.delete("/verifications/:id", async (c) => {
  try {
    const user = c.get("user" as any);
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Verification ID is required" }, 400);
    }

    const isAdmin = user.role === "admin" || String(user.id) === "1";

    const verifs = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }],
    });
    const verif = verifs && verifs[0];

    if (!verif) {
      return c.json({ error: "Verification request not found" }, 404);
    }

    if (verif.user_id !== user.id && !isAdmin) {
      return c.json(
        { error: "Forbidden: You do not own this verification request" },
        403,
      );
    }

    // If it was an approved public_usage verification on a character, reset is_verified_public
    if (verif.status === "approved" && verif.target_type === "public_usage") {
      if (verif.asset_type === "character" && verif.original_id) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: verif.original_id }],
          { is_verified_public: false },
          verif.user_id,
        );
      }
    }

    // If it was an approved public_asset verification, also remove published asset if present
    if (verif.status === "approved" && verif.target_type === "public_asset") {
      if (verif.asset_type === "file" && verif.public_asset_id) {
        const assets = queryTable({
          table: "public_assets",
          filters: [
            { field: "id", operator: "eq", value: verif.public_asset_id },
          ],
        });
        const asset = assets && assets[0];
        if (asset) {
          if (asset.file_path) {
            await serverStorage.remove("public-assets", [asset.file_path]);
          }
          deleteTable("public_asset_likes", [
            {
              field: "public_asset_id",
              operator: "eq",
              value: verif.public_asset_id,
            },
          ]);
          deleteTable(
            "public_assets",
            [{ field: "id", operator: "eq", value: verif.public_asset_id }],
            verif.user_id,
          );
        }
      } else if (
        (verif.asset_type === "character" ||
          verif.asset_type === "universe" ||
          verif.asset_type === "race") &&
        verif.public_character_id
      ) {
        deleteTable("public_character_likes", [
          {
            field: "public_character_id",
            operator: "eq",
            value: verif.public_character_id,
          },
        ]);
        deleteTable(
          "public_characters",
          [{ field: "id", operator: "eq", value: verif.public_character_id }],
          verif.user_id,
        );
      }
    }

    // Delete the verification record
    deleteTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      verif.user_id,
    );

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting verification request:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// POST /api/assets/verifications/invalidate - Invalidate/reset verification status when an asset is edited
assetsRouter.post("/verifications/invalidate", async (c) => {
  try {
    const user = c.get("user" as any);
    const body = await c.req.json().catch(() => ({}));
    const { asset_type, original_id, original_file_path } = body;

    if (
      asset_type === "character" ||
      asset_type === "universe" ||
      asset_type === "race"
    ) {
      if (original_id) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: original_id }],
          { is_verified_public: false },
          user.id,
        );

        deleteTable(
          "asset_verifications",
          [
            { field: "user_id", operator: "eq", value: user.id },
            { field: "original_id", operator: "eq", value: original_id },
            { field: "target_type", operator: "eq", value: "public_usage" },
          ],
          user.id,
        );
      }
    } else if (asset_type === "file") {
      if (original_file_path) {
        deleteTable(
          "asset_verifications",
          [
            { field: "user_id", operator: "eq", value: user.id },
            {
              field: "original_file_path",
              operator: "eq",
              value: original_file_path,
            },
            { field: "target_type", operator: "eq", value: "public_usage" },
          ],
          user.id,
        );
      }
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error invalidating verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// POST /api/assets/unpublish - Delete/Unpublish public asset or character to make private again
assetsRouter.post("/unpublish", async (c) => {
  try {
    const user = c.get("user" as any);
    const body = await c.req.json().catch(() => ({}));
    const { type, id } = body;

    if (
      !type ||
      !["file", "character", "universe", "race"].includes(type) ||
      !id
    ) {
      return c.json({ error: "Invalid parameters" }, 400);
    }

    const isAdmin = user.role === "admin" || String(user.id) === "1";

    if (type === "file") {
      const assets = queryTable({
        table: "public_assets",
        filters: [{ field: "id", operator: "eq", value: id }],
      });
      const asset = assets && assets[0];

      if (!asset) {
        return c.json({ error: "Public asset not found" }, 404);
      }

      if (
        asset.uploader_id !== user.id &&
        asset.user_id !== user.id &&
        !isAdmin
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Remove from public-assets storage bucket if path exists
      if (asset.file_path) {
        await serverStorage.remove("public-assets", [asset.file_path]);
      }

      // Delete likes and public asset record
      deleteTable("public_asset_likes", [
        { field: "public_asset_id", operator: "eq", value: id },
      ]);
      deleteTable(
        "public_assets",
        [{ field: "id", operator: "eq", value: id }],
        asset.user_id || asset.uploader_id,
      );
    } else {
      // character or universe
      const chars = queryTable({
        table: "public_characters",
        filters: [{ field: "id", operator: "eq", value: id }],
      });
      const char = chars && chars[0];

      if (!char) {
        return c.json({ error: "Public character not found" }, 404);
      }

      if (
        char.uploader_id !== user.id &&
        char.user_id !== user.id &&
        !isAdmin
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Delete likes and public character record
      deleteTable("public_character_likes", [
        { field: "public_character_id", operator: "eq", value: id },
      ]);
      deleteTable(
        "public_characters",
        [{ field: "id", operator: "eq", value: id }],
        char.user_id || char.uploader_id,
      );
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error unpublishing asset:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
