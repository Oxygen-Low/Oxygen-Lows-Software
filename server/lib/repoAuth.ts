import { createClient } from "@supabase/supabase-js";
import { Request, Response, NextFunction } from "express";
import { getAnonClient, supabase as anonClient } from "./supabase";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

export async function authenticateRepoRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
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
    (req as any).user = null;
    (req as any).supabaseToken = supabaseAnonKey;
    return next();
  }

  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });

  // Try as JWT
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (user) {
    (req as any).user = user;
    (req as any).supabaseToken = token;
    return next();
  }

  // Git passwords are no longer supported, but we treat invalid tokens as anonymous
  (req as any).user = null;
  (req as any).supabaseToken = supabaseAnonKey;
  next();
}

export async function authorizeRepoAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const repoId = req.params.repoId || req.params.id;
  const user = (req as any).user;
  const token = (req as any).supabaseToken;

  if (!repoId) return res.status(401).json({ error: "Unauthorized" });

  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false },
  });

  const { data: repo, error } = await supabase
    .from("repositories")
    .select("owner_id")
    .eq("id", repoId)
    .single();

  if (error || !repo) {
    return res.status(404).json({ error: "Repository not found" });
  }

  if (user && repo.owner_id === user.id) {
    (req as any).repoPermission = "admin";
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
      (req as any).repoPermission = collab.permission;
      return next();
    }
  }

  // Everyone has read access
  (req as any).repoPermission = "read";
  next();
}
