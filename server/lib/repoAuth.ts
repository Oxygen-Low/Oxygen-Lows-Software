import { createClient } from "@supabase/supabase-js";
import { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) {
    (req as any).user = user;
    (req as any).supabaseToken = token;
    return next();
  }

  if (token.length === 64) {
    const { data: passwordData } = await supabase.rpc("verify_repository_password", { p_password: token });
    if (passwordData && passwordData.length > 0) {
      const userId = passwordData[0].user_id;
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
      if (profile) {
        (req as any).user = { id: userId, email: profile.email };
        return next();
      }
    }
  }
  res.status(401).json({ error: "Invalid token" });
}

export async function authorizeRepoAccess(req: Request, res: Response, next: NextFunction) {
  const repoId = req.params.repoId || req.params.id;
  const user = (req as any).user;
  const token = (req as any).supabaseToken;

  if (!user || !repoId) return res.status(401).json({ error: "Unauthorized" });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false }
  });

  const { data: repo } = await supabase.from("repositories").select("owner_id").eq("id", repoId).single();
  if (repo?.owner_id === user.id) {
    (req as any).repoPermission = "admin";
    return next();
  }

  const { data: collab } = await supabase.from("repository_collaborators").select("permission").eq("repo_id", repoId).eq("user_id", user.id).single();
  if (collab) {
    (req as any).repoPermission = collab.permission;
    return next();
  }

  (req as any).repoPermission = "read";
  next();
}
