import { createClient } from "@supabase/supabase-js";
import { Request, Response, NextFunction } from "express";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";

export async function authenticateRepoRequest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.substring(6);
    const decoded = Buffer.from(base64, "base64").toString();
    const [_, password] = decoded.split(":");
    token = password;
  }
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const supabase = createClient(supabaseUrl, "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q", { auth: { persistSession: false } });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) { (req as any).user = user; return next(); }
  if (token.length === 64) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data } = await supabaseAdmin.from("repository_passwords").select("user_id").eq("password", token).single();
      if (data) {
        const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
        if (authUser) { (req as any).user = authUser; return next(); }
      }
    }
  }
  res.status(401).json({ error: "Invalid token" });
}

export async function authorizeRepoAccess(req: Request, res: Response, next: NextFunction) {
  const repoId = req.params.repoId || req.params.id;
  const user = (req as any).user;
  if (!user || !repoId) return res.status(401).json({ error: "Unauthorized" });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return res.status(500).json({ error: "Config error" });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: repo } = await supabaseAdmin.from("repositories").select("owner_id").eq("id", repoId).single();
  if (repo?.owner_id === user.id) { (req as any).repoPermission = "admin"; return next(); }
  const { data: collab } = await supabaseAdmin.from("repository_collaborators").select("permission").eq("repo_id", repoId).eq("user_id", user.id).single();
  if (collab) { (req as any).repoPermission = collab.permission; return next(); }
  res.status(403).json({ error: "Forbidden" });
}
