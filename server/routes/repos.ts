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
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase config missing");
}

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

function getSupabaseClient(token?: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false }
  });
}

async function getRepo(id: string, token?: string) {
  if (!validateId(id)) throw new Error("Invalid ID");
  const supabase = getSupabaseClient(token);
  const { data } = await supabase.from("repositories").select("*").eq("id", id).single();
  if (!data) throw new Error("Repo not found");
  return data;
}

router.get("/", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  try {
    const supabase = getSupabaseClient(token);
    const { data: repos, error } = await supabase.from("repositories").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const sorted = [...(repos || [])].sort((a, b) => {
        if (a.owner_id === user.id && b.owner_id !== user.id) return -1;
        if (a.owner_id !== user.id && b.owner_id === user.id) return 1;
        return 0;
    });

    res.json(sorted);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const { name, description } = req.body;
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  if (!name || !/^[a-z0-9_-]+$/.test(name)) return res.status(400).json({ error: "Invalid name" });

  try {
    const supabase = getSupabaseClient(token);
    const { data: repo, error } = await supabase.from("repositories").insert({ owner_id: user.id, name, description }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    const { storagePath, size } = await repoManager.createRepo(repo.id, user.id, name, token);
    const { error: updateError } = await supabase.from("repositories").update({ storage_path: storagePath, zip_size_bytes: size }).eq("id", repo.id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    res.json({ ...repo, storage_path: storagePath, zip_size_bytes: size });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/fork", authenticateRepoRequest, apiLimiter, async (req, res) => {
    const id = String(req.params.id);
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const user = (req as any).user;
    const token = (req as any).supabaseToken;

    try {
        const supabase = getSupabaseClient(token);
        const { data: newRepoId, error } = await supabase.rpc("fork_repository", { p_repo_id: id });
        if (error) return res.status(500).json({ error: error.message });

        const { data: newRepo } = await supabase.from("repositories").select("*").eq("id", newRepoId).single();
        if (!newRepo) throw new Error("Failed to create fork record");

        const originalRepo = await getRepo(id, token);
        const originalPath = await repoManager.ensureLoaded(id, originalRepo.storage_path, token);

        const forkPath = path.join(path.dirname(originalPath), `${newRepoId}.git`);
        await fs.ensureDir(forkPath);
        await simpleGit().clone(originalPath, forkPath, ["--bare"]);

        const storagePath = `${user.id}/repos/${newRepoId}.zip`;
        const { size } = await repoManager.uploadToStorage(newRepoId, storagePath, token);

        await supabase.from("repositories").update({ storage_path: storagePath, zip_size_bytes: size }).eq("id", newRepoId);

        res.json({ ...newRepo, storage_path: storagePath, zip_size_bytes: size });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  try {
    const repo = await getRepo(id, token);
    res.json(repo);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get(/^\/([0-9a-f-]+)\/tree\/([^\/]+)(?:\/(.*))?$/, authenticateRepoRequest, authorizeRepoAccess, async (req: any, res) => {
  const id = req.params[0];
  const branch = req.params[1];
  const subpath = req.params[2] || "";
  const token = (req as any).supabaseToken;

  if (!REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  if (subpath && !isSafePath(subpath)) return res.status(400).json({ error: "Invalid path" });

  try {
    const repo = await getRepo(id, token);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    repoManager.touchActivity(id, token);
    const git = simpleGit(repoPath);
    const tree = await git.raw(["ls-tree", "-l", `${branch}:${subpath}`]);
    const items = tree.split("\n").filter(Boolean).map(line => {
      const [info, file] = line.split("\t");
      const [mode, type, sha, size] = info.split(/\s+/);
      return { name: file, type, size: size === "-" ? 0 : parseInt(size), path: subpath ? `${subpath}/${file}` : file };
    });
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get(/^\/([0-9a-f-]+)\/blob\/([^\/]+)\/(.+)$/, authenticateRepoRequest, authorizeRepoAccess, async (req: any, res) => {
  const id = req.params[0];
  const branch = req.params[1];
  const filePath = req.params[2];
  const token = (req as any).supabaseToken;

  if (!REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  if (!isSafePath(filePath)) return res.status(400).json({ error: "Invalid path" });

  try {
    const repo = await getRepo(id, token);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const content = await simpleGit(repoPath).show([`${branch}:${filePath}`]);
    res.send(content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/files", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { filePath, content, branch, message } = req.body;
  if (!filePath || !isSafePath(filePath) || !branch || !REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid parameters" });

  const repo = await getRepo(id, token);
  const user = (req as any).user;
  if (branch === "main" && repo.owner_id !== user.id) {
      return res.status(403).json({ error: "Only the repository owner can push to the main branch. Please use a fork and Pull Request." });
  }

  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
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
      const { size } = await repoManager.uploadToStorage(id, repo.storage_path, token);
      const supabase = getSupabaseClient(token);
      await supabase.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
      res.json({ success: true });
    } finally {
      await fs.remove(tempDir);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_issues").select("*, author:profiles!repository_issues_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body } = req.body;
  const user = (req as any).user;
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_issues").insert({ repo_id: id, title, body, author_id: user.id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_pull_requests").select("*, author:profiles!repository_pull_requests_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body, source_branch, target_branch } = req.body;

  if (!REF_REGEX.test(source_branch) || !REF_REGEX.test(target_branch)) {
      return res.status(400).json({ error: "Invalid branch names" });
  }

  const user = (req as any).user;
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_pull_requests").insert({ repo_id: id, title, body, source_branch, target_branch, author_id: user.id }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId/diff", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  try {
    const repo = await getRepo(id, token);
    const supabase = getSupabaseClient(token);
    const { data: pr } = await supabase.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr) return res.status(404).json({ error: "PR not found" });
    await repoManager.ensureLoaded(id, repo.storage_path, token);
    const diff = await simpleGit(repoManager.getRepoPath(id)).raw(["diff", pr.target_branch, pr.source_branch]);
    res.send(diff);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls/:prId/merge", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  const user = (req as any).user;

  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });

  try {
    const repo = await getRepo(id, token);
    const supabase = getSupabaseClient(token);
    const { data: pr } = await supabase.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr || pr.status !== "open") return res.status(400).json({ error: "Not mergeable" });

    if (pr.target_branch === "main" && repo.owner_id !== user.id && (req as any).repoPermission !== "admin") {
        return res.status(403).json({ error: "Only the repository owner or admin can merge to the main branch." });
    }

    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const tempDir = path.resolve(path.dirname(repoPath), `${id}-merge-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      const tempGit = simpleGit(tempDir);
      await tempGit.checkout(pr.target_branch); await tempGit.merge([pr.source_branch]); await tempGit.push("origin", pr.target_branch);
      const { size } = await repoManager.uploadToStorage(id, repo.storage_path, token);
      await supabase.from("repository_pull_requests").update({ status: "merged", merged_at: new Date().toISOString(), merged_by: user.id }).eq("id", prId);
      await supabase.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
      res.json({ success: true });
    } finally {
      await fs.remove(tempDir);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_pull_request_comments").select("*, user:profiles!repository_pull_request_comments_user_id_fkey(username)").eq("pr_id", prId).order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const prId = String(req.params.prId);
  if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
  const { body } = req.body;
  const user = (req as any).user;
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_pull_request_comments").insert({ pr_id: prId, user_id: user.id, body }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_collaborators").select("*, user:profiles!repository_collaborators_user_id_fkey(username, display_name)").eq("repo_id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { username, permission = "write" } = req.body;
  if ((req as any).repoPermission !== "admin") return res.status(403).json({ error: "Forbidden" });
  try {
    const supabase = getSupabaseClient(token);
    const { error } = await supabase.rpc("add_repo_collaborator", { p_repo_id: id, p_username: username, p_permission: permission });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export { router as reposRouter };
