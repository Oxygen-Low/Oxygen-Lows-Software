import { Hono } from "hono";
import { getAdminClient } from "../lib/supabase.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ADMIN_USER_IDS = new Set(["3cb76293-8c6c-49b9-b431-1ff5fce471ee"]);

export const assetsRouter = new Hono();

function getServiceRoleKey(c: any) {
  const rawEnv = (c.env || {}) as any;
  const procEnv = typeof process !== "undefined" ? process.env : ({} as any);
  return rawEnv.SUPABASE_SECRET || procEnv.SUPABASE_SECRET;
}

// Middleware to authenticate user
assetsRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: verifications, error } = await supabase
      .from("asset_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

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

    if (!asset_type || !["file", "character", "universe"].includes(asset_type)) {
      return c.json({ error: "Invalid asset type" }, 400);
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ error: "Title is required" }, 400);
    }

    const supabase = getAdminClient(getServiceRoleKey(c));

    const payload = {
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

    const { data: verification, error } = await supabase
      .from("asset_verifications")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return c.json({ success: true, verification });
  } catch (error: any) {
    console.error("Error submitting verification request:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// POST /api/assets/verifications/invalidate - Invalidate/reset verification status when an asset is edited
assetsRouter.post("/verifications/invalidate", async (c) => {
  try {
    const user = c.get("user" as any);
    const body = await c.req.json().catch(() => ({}));
    const { asset_type, original_id, original_file_path } = body;

    const supabase = getAdminClient(getServiceRoleKey(c));

    if (asset_type === "character" || asset_type === "universe") {
      if (original_id) {
        await supabase
          .from("characters")
          .update({ is_verified_public: false })
          .eq("id", original_id)
          .eq("user_id", user.id);

        await supabase
          .from("asset_verifications")
          .delete()
          .eq("user_id", user.id)
          .eq("original_id", original_id)
          .eq("target_type", "public_usage");
      }
    } else if (asset_type === "file") {
      if (original_file_path) {
        await supabase
          .from("asset_verifications")
          .delete()
          .eq("user_id", user.id)
          .eq("original_file_path", original_file_path)
          .eq("target_type", "public_usage");
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

    if (!type || !["file", "character", "universe"].includes(type) || !id) {
      return c.json({ error: "Invalid parameters" }, 400);
    }

    const supabase = getAdminClient(getServiceRoleKey(c));
    const isAdmin = ADMIN_USER_IDS.has(user.id);

    if (type === "file") {
      const { data: asset, error: fetchErr } = await supabase
        .from("public_assets")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !asset) {
        return c.json({ error: "Public asset not found" }, 404);
      }

      if (asset.uploader_id !== user.id && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Remove from public-assets storage bucket if path exists
      if (asset.file_path) {
        await supabase.storage.from("public-assets").remove([asset.file_path]);
      }

      // Delete likes and public asset record
      await supabase.from("public_asset_likes").delete().eq("public_asset_id", id);
      await supabase.from("public_assets").delete().eq("id", id);
    } else {
      // character or universe
      const { data: char, error: fetchErr } = await supabase
        .from("public_characters")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !char) {
        return c.json({ error: "Public character not found" }, 404);
      }

      if (char.uploader_id !== user.id && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Delete likes and public character record
      await supabase
        .from("public_character_likes")
        .delete()
        .eq("public_character_id", id);
      await supabase.from("public_characters").delete().eq("id", id);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error unpublishing asset:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
