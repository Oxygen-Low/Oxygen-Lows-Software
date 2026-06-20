import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest } from "../lib/repoAuth";
import { createClient } from "@supabase/supabase-js";
import { apiLimiter } from "../lib/limiter";

const router = Router();
const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";

router.use(apiLimiter);
router.use(authenticateRepoRequest);

router.all(/^\/([a-z0-9_-]+)\/([a-z0-9_-]+)\.git\/(.*)/, async (req: any, res: any) => {
  const owner = req.params[0];
  const repoName = req.params[1];
  const gitPath = req.params[2];

  // Validate gitPath against allowlist
  const allowedPaths = ["info/refs", "git-upload-pack", "git-receive-pack", "HEAD", "objects/info/packs", "objects/info/alternates", "objects/info/http-alternates"];
  const isAllowed = allowedPaths.some(p => gitPath === p) ||
                    /^(objects\/[0-9a-f]{2}\/[0-9a-f]{38}|objects\/pack\/pack-[0-9a-f]{40}\.(pack|idx))$/.test(gitPath);

  if (!isAllowed) return res.status(403).json({ error: "Invalid git path" });

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

    gitBackend.on('error', (err) => {
        console.error('Git backend spawn error:', err);
        if (!res.headersSent) res.status(500).json({ error: "Git backend failed to start" });
    });

    let headerBuffer = Buffer.alloc(0);
    let headersParsed = false;
    let statusFound = false;

    gitBackend.stdout.on('data', (chunk) => {
        if (headersParsed) {
            res.write(chunk);
            return;
        }

        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const separator = headerBuffer.indexOf('\r\n\r\n');
        const altSeparator = headerBuffer.indexOf('\n\n');
        const index = separator !== -1 ? separator : altSeparator;
        const sepLen = separator !== -1 ? 4 : 2;

        if (index !== -1) {
            const headersPart = headerBuffer.slice(0, index).toString();
            const bodyPart = headerBuffer.slice(index + sepLen);

            headersPart.split(/\r?\n/).forEach(line => {
                const parts = line.split(': ', 2);
                if (parts.length === 2) {
                    if (parts[0].toLowerCase() === 'status') {
                        const statusCode = parseInt(parts[1].split(' ')[0]);
                        if (!isNaN(statusCode)) {
                            res.status(statusCode);
                            statusFound = true;
                        }
                    } else {
                        res.setHeader(parts[0], parts[1]);
                    }
                }
            });

            if (!statusFound) res.status(200);
            headersParsed = true;
            if (bodyPart.length > 0) res.write(bodyPart);
        }
    });

    gitBackend.stdout.on('end', () => {
        if (!headersParsed && !res.headersSent) {
            // git http-backend might have exited without output if something went wrong
            res.status(500).json({ error: "Git backend produced no output" });
        }
        res.end();
    });

    req.pipe(gitBackend.stdin);

    gitBackend.stderr.on('data', (data) => {
        console.error(`git http-backend stderr: ${data}`);
    });

  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export { router as gitRouter };
