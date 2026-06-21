import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest } from "../lib/repoAuth";
import { createClient } from "@supabase/supabase-js";
import { apiLimiter } from "../lib/limiter";

const router = Router();
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

router.use(apiLimiter);
router.use(authenticateRepoRequest);

router.all(/^\/([a-z0-9_-]+)\/([a-z0-9_-]+)\.git\/(.*)/, async (req: any, res: any) => {
  const owner = req.params[0];
  const repoName = req.params[1];
  const gitPath = req.params[2];
  const token = (req as any).supabaseToken;

  const allowedPaths = ["info/refs", "git-upload-pack", "git-receive-pack", "HEAD", "objects/info/packs", "objects/info/alternates", "objects/info/http-alternates"];
  const isAllowed = allowedPaths.some(p => gitPath === p) ||
                    /^(objects\/[0-9a-f]{2}\/[0-9a-f]{38}|objects\/pack\/pack-[0-9a-f]{40}\.(pack|idx))$/.test(gitPath);

  if (!isAllowed) return res.status(403).json({ error: "Invalid git path" });

  const user = (req as any).user;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false }
  });

  const { data: ownerProfile } = await supabase.from("profiles").select("user_id").eq("username", owner).single();
  if (!ownerProfile) return res.status(404).json({ error: "Owner not found" });

  const { data: repo } = await supabase.from("repositories").select("*").eq("owner_id", ownerProfile.user_id).eq("name", repoName).single();
  if (!repo) return res.status(404).json({ error: "Repo not found" });

  const isOwner = repo.owner_id === user.id;
  const { data: collab } = await supabase.from("repository_collaborators").select("permission").eq("repo_id", repo.id).eq("user_id", user.id).single();

  const canWrite = isOwner || (collab && (collab.permission === 'admin' || collab.permission === 'write'));
  const isWriteOp = req.path.includes("git-receive-pack") || req.query.service === "git-receive-pack";

  if (isWriteOp && !canWrite) return res.status(403).json({ error: "Write access required." });

  try {
    const repoPath = await repoManager.ensureLoaded(repo.id, repo.storage_path, token);
    repoManager.touchActivity(repo.id, token);

    const gitBackend = spawn("git", ["http-backend"], {
        env: {
            GIT_PROJECT_ROOT: path.dirname(repoPath),
            GIT_HTTP_EXPORT_ALL: "1",
            PATH_INFO: "/" + gitPath,
            REMOTE_USER: user.id,
            REMOTE_ADDR: req.ip,
            CONTENT_TYPE: req.headers["content-type"] as string,
            QUERY_STRING: req.url.split("?")[1] || "",
            REQUEST_METHOD: req.method
        }
    });

    let headersParsed = false;
    gitBackend.stdout.on('data', (chunk) => {
        if (headersParsed) { res.write(chunk); return; }
        res.write(chunk);
    });

    gitBackend.stdout.on('end', async () => {
        if (isWriteOp && canWrite && token) {
            try {
                const { size } = await repoManager.uploadToStorage(repo.id, repo.storage_path, token);
                const sp = createClient(supabaseUrl, supabaseAnonKey, {
                    global: { headers: { Authorization: `Bearer ${token}` } },
                    auth: { persistSession: false }
                });
                await sp.from("repositories").update({ zip_size_bytes: size }).eq("id", repo.id);
            } catch (err) { console.error("Save error:", err); }
        }
        res.end();
    });

    req.pipe(gitBackend.stdin);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export { router as gitRouter };
