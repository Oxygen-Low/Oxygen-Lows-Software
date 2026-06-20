import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest, authorizeRepoAccess } from "../lib/repoAuth";
import { apiLimiter } from "../lib/limiter";
import fs from "fs-extra";
import path from "path";
import simpleGit from "simple-git";
import crypto from "crypto";

const router = Router();
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://vqmukrmpgvavscsyefqd.supabase.co";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_REGEX = /^[a-zA-Z0-9\._\-\/]+$/;
const SAFE_PATH_REGEX = /^[a-zA-Z0-9\._\-\/]*$/;

function validateId(id: string) {
  return UUID_REGEX.test(id);
}

function isSafePath(p: string) {
  if (typeof p !== 'string') return false;
  if (p.includes('..')) return false;
  if (path.isAbsolute(p)) return false;
  return SAFE_PATH_REGEX.test(p);
}

function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function getRepo(id: string) {
  if (!validateId(id)) throw new Error("Invalid ID");
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin.from("repositories").select("*").eq("id", id).single();
  if (!data) throw new Error("Repo not found");
  return data;
}

router.get("/", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: collabs } = await supabaseAdmin.from("repository_collaborators").select("repo_id, permission").eq("user_id", user.id);
    const collabMap = new Map(collabs?.map(c => [c.repo_id, c.permission]) || []);
    const collabIds = Array.from(collabMap.keys());

    const query = supabaseAdmin.from("repositories").select("*, profiles!repositories_owner_id_fkey(username)");
    if (collabIds.length > 0) {
        query.or(`owner_id.eq.${user.id},id.in.(${collabIds.map(id => `"${id}"`).join(",")})`);
    } else {
        query.eq("owner_id", user.id);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const enhancedData = data?.map(repo => ({
        ...repo,
        permission: repo.owner_id === user.id ? 'admin' : collabMap.get(repo.id)
    }));

    res.json(enhancedData);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const { name, description, initReadme } = req.body;
  if (!name || !/^[a-z0-9_-]+$/.test(name)) return res.status(400).json({ error: "Invalid name" });
  const user = (req as any).user;
  const repoId = crypto.randomUUID();
  try {
    const { storagePath, size: initialSize } = await repoManager.createRepo(repoId, user.id, name);
    let finalSize = initialSize;
    if (initReadme) {
      const repoPath = repoManager.getRepoPath(repoId);
      const tempDir = path.resolve(path.dirname(repoPath), `${repoId}-init-${crypto.randomBytes(4).toString('hex')}`);
      try {
        await fs.ensureDir(tempDir);
        await simpleGit().clone(repoPath, tempDir);
        await fs.writeFile(path.join(tempDir, "README.md"), `# ${name}\n\n${description || ""}`);
        const tempGit = simpleGit(tempDir);
        await tempGit.add("README.md"); await tempGit.commit("Initial commit"); await tempGit.push("origin", "main");
        const { size } = await repoManager.uploadToStorage(repoId, storagePath);
        finalSize = size;
      } finally {
        await fs.remove(tempDir);
      }
    }
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repositories").insert({ id: repoId, owner_id: user.id, name, description, storage_path: storagePath, zip_size_bytes: finalSize, is_loaded: true }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/user/git-password", authenticateRepoRequest, async (req, res) => {
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_passwords").select("password").eq("user_id", user.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    res.json({ hasPassword: !!data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/user/git-password", authenticateRepoRequest, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc("upsert_repository_password", { p_user_id: user.id, p_password: password });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  try {
    const repo = await getRepo(id);
    res.json(repo);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  if ((req as any).repoPermission !== "admin") return res.status(403).json({ error: "Forbidden" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: repo } = await supabaseAdmin.from("repositories").select("storage_path").eq("id", id).single();
    if (!repo) return res.status(404).json({ error: "Repo not found" });
    const { error } = await supabaseAdmin.from("repositories").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    await supabaseAdmin.storage.from("Storage").remove([repo.storage_path]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/files", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const ref = String(req.query.ref || "main");
  const p = String(req.query.path || "");
  if (!REF_REGEX.test(ref) || !isSafePath(p)) return res.status(400).json({ error: "Invalid parameters" });
  try {
    const repo = await getRepo(id);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const git = simpleGit(repoPath);
    const list = await git.raw(["ls-tree", "-r", "--name-only", ref, p]);
    const files = list.split("\n").filter(Boolean).map(f => {
        const parts = f.split("/");
        return { name: parts[parts.length - 1], path: f, type: 'file' };
    });
    res.json(files);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/content", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const ref = String(req.query.ref || "main");
  const p = String(req.query.path || "");
  if (!REF_REGEX.test(ref) || !isSafePath(p)) return res.status(400).json({ error: "Invalid parameters" });
  try {
    const repo = await getRepo(id);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const content = await simpleGit(repoPath).show([`${ref}:${p}`]);
    res.send(content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/edit", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const { filePath, content, branch, message } = req.body;
  if (!filePath || !isSafePath(filePath) || !branch || !REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid parameters" });
  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    const repo = await getRepo(id);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const tempDir = path.resolve(path.dirname(repoPath), `${id}-edit-${crypto.randomBytes(4).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      const tempGit = simpleGit(tempDir);
      await tempGit.checkout(branch);
      const fullPath = path.resolve(tempDir, filePath);
      if (!fullPath.startsWith(tempDir + path.sep) && fullPath !== tempDir) throw new Error("Invalid path (traversal detected)");
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      await tempGit.add(filePath); await tempGit.commit(message || "Web edit"); await tempGit.push("origin", branch);
      const { size } = await repoManager.uploadToStorage(id, repo.storage_path);
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
      res.json({ success: true });
    } finally {
      await fs.remove(tempDir);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_issues").select("*, author:profiles!repository_issues_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body } = req.body;
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_issues").insert({ repo_id: id, title, body, author_id: user.id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_pull_requests").select("*, author:profiles!repository_pull_requests_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body, source_branch, target_branch } = req.body;
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_pull_requests").insert({ repo_id: id, title, body, source_branch, target_branch, author_id: user.id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId/diff", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  try {
    const repo = await getRepo(id);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: pr } = await supabaseAdmin.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr) return res.status(404).json({ error: "PR not found" });
    await repoManager.ensureLoaded(id, repo.storage_path);
    const diff = await simpleGit(repoManager.getRepoPath(id)).raw(["diff", pr.target_branch, pr.source_branch]);
    res.send(diff);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls/:prId/merge", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  const user = (req as any).user;
  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    const repo = await getRepo(id);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: pr } = await supabaseAdmin.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr || pr.status !== "open") return res.status(400).json({ error: "Not mergeable" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const tempDir = path.resolve(path.dirname(repoPath), `${id}-merge-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      const tempGit = simpleGit(tempDir);
      await tempGit.checkout(pr.target_branch); await tempGit.merge([pr.source_branch]); await tempGit.push("origin", pr.target_branch);
      const { size } = await repoManager.uploadToStorage(id, repo.storage_path);
      await supabaseAdmin.from("repository_pull_requests").update({ status: "merged", merged_at: new Date().toISOString(), merged_by: user.id }).eq("id", prId);
      await supabaseAdmin.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
      res.json({ success: true });
    } finally {
      await fs.remove(tempDir);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_pull_request_comments").select("*, user:profiles!repository_pull_request_comments_user_id_fkey(username)").eq("pr_id", prId).order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  const { body } = req.body;
  const user = (req as any).user;
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_pull_request_comments").insert({ pr_id: prId, user_id: user.id, body }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.from("repository_collaborators").select("*, user:profiles!repository_collaborators_user_id_fkey(username, display_name)").eq("repo_id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { username, permission = "write" } = req.body;
  if ((req as any).repoPermission !== "admin") return res.status(403).json({ error: "Forbidden" });
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc("add_repo_collaborator", { p_repo_id: id, p_username: username, p_permission: permission });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export { router as reposRouter };
