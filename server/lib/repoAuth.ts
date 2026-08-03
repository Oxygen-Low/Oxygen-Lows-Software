import { createClient } from "@supabase/supabase-js";
import { Context, Next } from "hono";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export async function authenticateRepoRequest(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  let token: string | null = null;
  let gitUsername: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.substring(6);
    const decoded = Buffer.from(base64, "base64").toString();
    const [username, password] = decoded.split(":");
    token = password;
    gitUsername = username;
  }

  if (!token) {
    c.set("user", null);
    c.set("supabaseToken", supabaseAnonKey);
    return next();
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  
  if (user) {
    c.set("user", user);
    c.set("supabaseToken", token);
    return next();
  }

  c.set("user", null);
  c.set("supabaseToken", supabaseAnonKey);
  await next();
}

export async function authorizeRepoAccess(c: Context, next: Next) {
  const repoId = c.req.param("id") || c.req.param("repoId");
  const user = c.get("user");
  const token = c.get("supabaseToken");

  if (!repoId) return c.json({ error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false },
  });

  const { data: repo, error } = await supabase
    .from("repositories")
    .select("owner_id")
    .eq("id", repoId)
    .single();

  if (error || !repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  if (user && repo.owner_id === user.id) {
    c.set("repoPermission", "admin");
    return next();
  }

  if (user) {
    const { data: collab } = await supabase
      .from("repository_collaborators")
      .select("permission")
      .eq("repo_id", repoId)
      .eq("user_id", user.id)
      .single();
    if (collab) {
      c.set("repoPermission", collab.permission);
      return next();
    }
  }

  c.set("repoPermission", "read");
  await next();
}
