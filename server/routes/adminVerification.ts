import { Hono } from "hono";
import { getAdminClient } from "../lib/supabase.ts";
import { createClient } from "@supabase/supabase-js";
import { serverStorage } from "../lib/storage.ts";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ADMIN_USER_IDS = new Set(["3cb76293-8c6c-49b9-b431-1ff5fce471ee"]);

export const adminVerificationRouter = new Hono();

function getServiceRoleKey(c: any) {
  const rawEnv = (c.env || {}) as any;
  const procEnv = typeof process !== "undefined" ? process.env : ({} as any);
  return rawEnv.SUPABASE_SECRET || procEnv.SUPABASE_SECRET;
}

adminVerificationRouter.use("*", async (c, next) => {
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

  if (!ADMIN_USER_IDS.has(user.id)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  // Set user on context
  c.set("user" as any, user);
  await next();
});

// GET /api/admin/verifications - List verifications with filters
adminVerificationRouter.get("/", async (c) => {
  try {
    const supabase = getAdminClient(getServiceRoleKey(c));
    const status = c.req.query("status");
    const assetType = c.req.query("asset_type");
    const targetType = c.req.query("target_type");

    let query = supabase
      .from("asset_verifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (assetType && assetType !== "all") {
      query = query.eq("asset_type", assetType);
    }
    if (targetType && targetType !== "all") {
      query = query.eq("target_type", targetType);
    }

    const { data: verifications, error } = await query;
    if (error) throw error;

    const userIds = [
      ...new Set(
        (verifications || []).map((v: any) => v.user_id).filter(Boolean),
      ),
    ];

    let profiles: any[] = [];
    if (userIds.length > 0) {
      const { data: profData } = await supabase
        .from("profiles")
        .select("user_id, username, email, avatar_url")
        .in("user_id", userIds);
      if (profData) profiles = profData;
    }

    const listWithProfiles = (verifications || []).map((v: any) => ({
      ...v,
      profiles: profiles.find((p: any) => p.user_id === v.user_id) || null,
    }));

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
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: verification, error: fetchErr } = await supabase
      .from("asset_verifications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !verification) {
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
          const { data: updatedAsset } = await supabase
            .from("public_assets")
            .update({
              name: verification.title,
              display_name:
                verification.metadata?.display_name || verification.title,
              category: verification.metadata?.category || "other",
              description: verification.description || "",
              file_path: verification.original_file_path || "",
              file_size: verification.file_size || 0,
              mime_type: verification.mime_type || "",
              updated_at: new Date().toISOString(),
            })
            .eq("id", publicAssetId)
            .select()
            .single();

          if (updatedAsset) publicAssetId = updatedAsset.id;
        } else {
          const { data: newAsset, error: insertErr } = await supabase
            .from("public_assets")
            .insert({
              uploader_id: verification.user_id,
              name: verification.title,
              display_name:
                verification.metadata?.display_name || verification.title,
              category: verification.metadata?.category || "other",
              description: verification.description || "",
              file_path: verification.original_file_path || "",
              file_size: verification.file_size || 0,
              mime_type: verification.mime_type || "",
            })
            .select()
            .single();

          if (!insertErr && newAsset) {
            publicAssetId = newAsset.id;
          }
        }
      } else if (
        verification.asset_type === "character" ||
        verification.asset_type === "universe"
      ) {
        // Publish/Update Character Snapshot in public_characters
        const meta = verification.metadata || {};
        const isUniverse =
          verification.asset_type === "universe" || Boolean(meta.is_universe);
        const payload: any = {
          uploader_id: verification.user_id,
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
          updated_at: new Date().toISOString(),
        };

        if (publicCharacterId) {
          const { data: updatedChar } = await supabase
            .from("public_characters")
            .update(payload)
            .eq("id", publicCharacterId)
            .select()
            .single();

          if (updatedChar) publicCharacterId = updatedChar.id;
        } else {
          const { data: newChar, error: insertErr } = await supabase
            .from("public_characters")
            .insert(payload)
            .select()
            .single();

          if (!insertErr && newChar) {
            publicCharacterId = newChar.id;
          }
        }
      }
    } else if (verification.target_type === "public_usage") {
      if (
        (verification.asset_type === "character" ||
          verification.asset_type === "universe") &&
        verification.original_id
      ) {
        await supabase
          .from("characters")
          .update({ is_verified_public: true })
          .eq("id", verification.original_id);
      }
    }

    const { data: updatedVerification, error: updateErr } = await supabase
      .from("asset_verifications")
      .update({
        status: "approved",
        public_asset_id: publicAssetId || null,
        public_character_id: publicCharacterId || null,
        rejection_reason: null,
        reviewed_by: adminUser?.id || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return c.json({ success: true, verification: updatedVerification });
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

    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: verification, error: fetchErr } = await supabase
      .from("asset_verifications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !verification) {
      return c.json({ error: "Verification request not found" }, 404);
    }

    const { data: updatedVerification, error: updateErr } = await supabase
      .from("asset_verifications")
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: adminUser?.id || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return c.json({ success: true, verification: updatedVerification });
  } catch (error: any) {
    console.error("Error rejecting verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// DELETE /api/admin/verifications/:id
adminVerificationRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { error } = await supabase
      .from("asset_verifications")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
