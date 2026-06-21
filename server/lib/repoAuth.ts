import { createClient } from "@supabase/supabase-js";
import { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.");
}

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

  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, { auth: { persistSession: false } });

  // Try as JWT
  const { data: { user } } = await supabase.auth.getUser(token);
  if (user) {
    (req as any).user = user;
    (req as any).supabaseToken = token;
    return next();
  }

  // Try as Git Password
  if (token.length === 64) {
    const { data: passwordData } = await supabase.rpc("verify_repository_password", { p_password: token });
    if (passwordData && passwordData.length > 0) {
      const userId = passwordData[0].user_id;
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
      if (profile) {
        (req as any).user = { id: userId, email: profile.email };
        // We don't have a valid Supabase JWT for this user.
        // We use the anon key for downstream operations, but we've verified their identity.
        (req as any).supabaseToken = supabaseAnonKey;
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

  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false }
  });

  const { data: repo, error } = await supabase.from("repositories").select("owner_id").eq("id", repoId).single();

  if (error || !repo) {
      return res.status(404).json({ error: "Repository not found" });
  }

  if (repo.owner_id === user.id) {
    (req as any).repoPermission = "admin";
    return next();
  }

  const { data: collab } = await supabase.from("repository_collaborators").select("permission").eq("repo_id", repoId).eq("user_id", user.id).single();
  if (collab) {
    (req as any).repoPermission = collab.permission;
    return next();
  }

  // Public repos: everyone has read access
  (req as any).repoPermission = "read";
  next();
}
