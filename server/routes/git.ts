import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest } from "../lib/repoAuth";
import { createClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";

const router = Router();
const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";

const gitApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many requests to git service" }
});

router.use(gitApiLimiter);
router.use(authenticateRepoRequest);

router.all(/^\/([a-z0-9_-]+)\/([a-z0-9_-]+)\.git\/(.*)/, async (req: any, res: any) => {
  const owner = req.params[0];
  const repoName = req.params[1];
  const gitPath = req.params[2];

  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return res.status(500).json({ error: "Config error" });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownerProfile } = await supabaseAdmin.from("profiles").select("user_id").eq("username", owner).single();
  if (!ownerProfile) return res.status(404).json({ error: "Owner not found" });

  const { data: repo } = await supabaseAdmin.from("repositories").select("*").eq("owner_id", ownerProfile.user_id).eq("name", repoName).single();
  if (!repo) return res.status(404).json({ error: "Repo not found" });

  const isOwner = repo.owner_id === user.id;
  const { data: collab } = await supabaseAdmin.from("repository_collaborators").select("permission").eq("repo_id", repo.id).eq("user_id", user.id).single();
  if (!isOwner && !collab) return res.status(403).json({ error: "Forbidden" });

  if ((req.path.includes("git-receive-pack") || req.query.service === "git-receive-pack") && !isOwner && collab?.permission === "read") return res.status(403).json({ error: "Write access required" });

  try {
    const repoPath = await repoManager.ensureLoaded(repo.id, repo.storage_path);
    repoManager.touchActivity(repo.id);
    const gitBackend = spawn("git", ["http-backend"], { env: { GIT_PROJECT_ROOT: path.dirname(repoPath), GIT_HTTP_EXPORT_ALL: "1", PATH_INFO: "/" + gitPath, REMOTE_USER: user.id, REMOTE_ADDR: req.ip, CONTENT_TYPE: req.headers["content-type"] as string, QUERY_STRING: req.url.split("?")[1] || "", REQUEST_METHOD: req.method } });
    req.pipe(gitBackend.stdin); gitBackend.stdout.pipe(res);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export { router as gitRouter };
