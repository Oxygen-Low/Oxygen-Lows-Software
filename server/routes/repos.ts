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
const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_REF_REGEX = /^(?!-)[a-zA-Z0-9\._\-\/]+$/;
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

async function parseGitTree(repoPath: string, branch: string, subpath: string) {
  const git = simpleGit(repoPath);
  const tree = await git.raw(["ls-tree", "-l", `${branch}:${subpath}`]);
  return tree.split("\n").filter(Boolean).map(line => {
    const [info, file] = line.split("\t");
    const [mode, type, sha, size] = info.split(/\s+/);
    return { name: file, type, size: size === "-" ? 0 : parseInt(size), path: subpath ? `${subpath}/${file}` : file };
  });
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

async function getAuthorProfile(userId: string, token?: string) {
  const supabase = getSupabaseClient(token);
  const { data: profile } = await supabase.from("profiles").select("username, email").eq("user_id", userId).single();
  return profile;
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

router.get("/user/git-password", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  try {
    const supabase = getSupabaseClient(token);
    const { data, error } = await supabase.from("repository_passwords").select("user_id").eq("user_id", user.id).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    res.json({ password: data ? "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••" : null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/user/git-password", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  try {
    const password = crypto.randomBytes(32).toString("hex");
    const supabase = getSupabaseClient(token);
    const { error } = await supabase.rpc("upsert_repository_password", { p_user_id: user.id, p_password: password });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ password });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const { name, description, initReadme } = req.body;
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  if (!name || !/^[a-z0-9_-]+$/.test(name)) return res.status(400).json({ error: "Invalid name" });

  const repoId = crypto.randomUUID();
  const storagePath = `${user.id}/repos/${repoId}.zip`;

  try {
    const supabase = getSupabaseClient(token);

    // Create local repo first
    let { size } = await repoManager.createRepo(repoId, user.id, name, token);

    // Optionally init readme
    if (initReadme) {
      const repoPath = repoManager.getRepoPath(repoId);
      const tempDir = path.resolve(path.dirname(repoPath), `${repoId}-init-${crypto.randomBytes(4).toString('hex')}`);
      try {
        await fs.ensureDir(tempDir);
        await simpleGit().clone(repoPath, tempDir);
        const tempGit = simpleGit(tempDir);
        const profile = await getAuthorProfile(user.id, token);
        const authorName = profile?.username || user.user_metadata?.username || "Anonymous";
        const authorEmail = profile?.email || user.email || "anon@example.com";
        await tempGit.addConfig("user.name", authorName);
        await tempGit.addConfig("user.email", authorEmail);
        await fs.writeFile(path.join(tempDir, "README.md"), `# ${name}\n\n${description || ""}`);
        await tempGit.add("README.md");
        await tempGit.commit("Initial commit");
        await tempGit.push("origin", "main");
        const { size: newSize } = await repoManager.uploadToStorage(repoId, storagePath, token);
        size = newSize;
      } finally {
        await fs.remove(tempDir);
      }
    }

    const { data, error } = await supabase.from("repositories").insert({ id: repoId, owner_id: user.id, name, description, storage_path: storagePath, zip_size_bytes: size }).select().single();
    if (error) {
        await repoManager.deleteRepo(repoId);
        await supabase.storage.from("Storage").remove([storagePath]);
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err: any) {
    await repoManager.deleteRepo(repoId);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const repo = await getRepo(id, token);
    const supabase = getSupabaseClient(token);
    const { error: dbError } = await supabase.from("repositories").delete().eq("id", id);
    if (dbError) return res.status(500).json({ error: dbError.message });

    if (repo.storage_path) {
        await supabase.storage.from("Storage").remove([repo.storage_path]);
    }

    await repoManager.deleteRepo(id);

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const repo = await getRepo(id, token);
    res.json(repo);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/tree", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const subpath = String(req.query.path || "");
  const branch = String(req.query.branch || "");
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  if (subpath && !isSafePath(subpath)) return res.status(400).json({ error: "Invalid path" });
  if (branch && !SAFE_REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  try {
    const repo = await getRepo(id, token);
    const selectedBranch = branch || repo.default_branch || "main";
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    repoManager.touchActivity(id, token);
    const items = await parseGitTree(repoPath, selectedBranch, subpath);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/file", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const filePath = String(req.query.path || "");
  const branch = String(req.query.branch || "");
  const token = (req as any).supabaseToken;
  if (!filePath) return res.status(400).json({ error: "File path is required" });
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  if (!isSafePath(filePath)) return res.status(400).json({ error: "Invalid path" });
  if (branch && !SAFE_REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  try {
    const repo = await getRepo(id, token);
    const selectedBranch = branch || repo.default_branch || "main";
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const content = await simpleGit(repoPath).show([`${selectedBranch}:${filePath}`]);
    res.send(content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get(/^\/([0-9a-f-]+)\/tree\/([^\/]+)(?:\/(.*))?$/, authenticateRepoRequest, authorizeRepoAccess, async (req: any, res) => {
  const id = req.params[0];
  const branch = req.params[1];
  const subpath = req.params[2] || "";
  const token = (req as any).supabaseToken;
  if (!SAFE_REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  if (subpath && !isSafePath(subpath)) return res.status(400).json({ error: "Invalid path" });
  try {
    const repo = await getRepo(id, token);
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    repoManager.touchActivity(id, token);
    const items = await parseGitTree(repoPath, branch, subpath);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get(/^\/([0-9a-f-]+)\/blob\/([^\/]+)\/(.+)$/, authenticateRepoRequest, authorizeRepoAccess, async (req: any, res) => {
  const id = req.params[0];
  const branch = req.params[1];
  const filePath = req.params[2];
  const token = (req as any).supabaseToken;
  if (!SAFE_REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid branch" });
  if (!isSafePath(filePath)) return res.status(400).json({ error: "Invalid path" });
  try {
    const repo = await getRepo(id, token);
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
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
  if (!filePath || !isSafePath(filePath) || !branch || !SAFE_REF_REGEX.test(branch)) return res.status(400).json({ error: "Invalid parameters" });

  const repo = await getRepo(id, token);
  const user = (req as any).user;
  if (branch === "main" && repo.owner_id !== user.id) {
      return res.status(403).json({ error: "Only the repository owner can push to the main branch. Please use a fork and Pull Request." });
  }

  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const tempDir = path.resolve(path.dirname(repoPath), `${id}-edit-${crypto.randomBytes(4).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      const tempGit = simpleGit(tempDir);
      const profile = await getAuthorProfile(user.id, token);
      const authorName = profile?.username || user.user_metadata?.username || "Anonymous";
      const authorEmail = profile?.email || user.email || "anon@example.com";
      await tempGit.addConfig("user.name", authorName);
      await tempGit.addConfig("user.email", authorEmail);
      await tempGit.checkout(branch);
      const fullPath = path.join(tempDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      await tempGit.add(filePath);
      await tempGit.commit(message || `Edit ${filePath}`);
      await tempGit.push("origin", branch);
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
    const { data, error } = await supabase.from("repository_issues").select("*, author:profiles!author_id(username)").eq("repo_id", id).order("created_at", { ascending: false });
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
    const { data, error } = await supabase.from("repository_pull_requests").select("*, author:profiles!author_id(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body, source_branch, target_branch } = req.body;

  if (!SAFE_REF_REGEX.test(source_branch) || !SAFE_REF_REGEX.test(target_branch)) {
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
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    await repoManager.ensureLoaded(id, repo.storage_path, token);
    const diff = await simpleGit(repoManager.getRepoPath(id)).raw(["diff", "--", pr.target_branch, pr.source_branch]);
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

    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const tempDir = path.resolve(path.dirname(repoPath), `${id}-merge-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      const tempGit = simpleGit(tempDir);
      const profile = await getAuthorProfile(user.id, token);
      const authorName = profile?.username || user.user_metadata?.username || "Anonymous";
      const authorEmail = profile?.email || user.email || "anon@example.com";
      await tempGit.addConfig("user.name", authorName);
      await tempGit.addConfig("user.email", authorEmail);
      await tempGit.checkout(pr.target_branch); await tempGit.merge(["--", pr.source_branch]); await tempGit.push("origin", pr.target_branch);
      if (!repo.storage_path) throw new Error("Repository storage path is missing");
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
    const { data, error } = await supabase.from("repository_pull_request_comments").select("*, user:profiles!user_id(username)").eq("pr_id", prId).order("created_at", { ascending: true });
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
    const { data, error } = await supabase.from("repository_collaborators").select("*, user:profiles!user_id(username, display_name)").eq("repo_id", id);
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



router.get("/github/list", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const githubToken = req.headers["x-github-token"];
  if (!githubToken) return res.status(400).json({ error: "GitHub token missing" });
  try {
    const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: { Authorization: `Bearer ${githubToken}`, "Accept": "application/vnd.github.v3+json" }
    });
    if (!response.ok) return res.status(response.status).json({ error: "Failed to fetch GitHub repositories" });
    const repos = await response.json();
    res.json(repos);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/github/import", authenticateRepoRequest, apiLimiter, async (req, res) => {
  const user = (req as any).user;
  const token = (req as any).supabaseToken;
  const githubToken = req.headers["x-github-token"] as string;
  const { fullName, name, description } = req.body;
  if (!githubToken) return res.status(400).json({ error: "GitHub token missing" });
  if (!fullName || !name) return res.status(400).json({ error: "Missing required fields" });

  try {
    const supabase = getSupabaseClient(token);
    const repoId = crypto.randomUUID();
    const { storagePath, size } = await repoManager.importGithubRepo(repoId, user.id, fullName, githubToken, token);

    const { data: repo, error } = await supabase.from("repositories").insert({
      id: repoId,
      owner_id: user.id,
      name,
      description,
      storage_path: storagePath,
      zip_size_bytes: size,
      github_repo_full_name: fullName,
      github_sync_at: new Date().toISOString(),
      is_loaded: true
    }).select().single();

    if (error) {
      await repoManager.deleteRepo(repoId);
      return res.status(500).json({ error: error.message });
    }
    res.json(repo);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/sync", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  const githubToken = req.headers["x-github-token"] as string;
  if (!githubToken) return res.status(400).json({ error: "GitHub token missing" });

  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name) return res.status(400).json({ error: "Not a GitHub repository" });

    const supabase = getSupabaseClient(token);

    // Sync Issues
    const issuesRes = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/issues?state=all&per_page=100`, {
      headers: { Authorization: `Bearer ${githubToken}`, "Accept": "application/vnd.github.v3+json" }
    });
    if (issuesRes.ok) {
      const githubIssues = await issuesRes.json();
      for (const issue of githubIssues) {
        const isPR = !!issue.pull_request;
        const table = isPR ? "repository_pull_requests" : "repository_issues";

        const payload: any = {
          repo_id: id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          status: issue.state === "open" ? "open" : (isPR && issue.merged_at ? "merged" : "closed"),
          github_id: issue.id,
          github_username: issue.user.login,
          updated_at: issue.updated_at
        };

        if (isPR) {
          // Fetch PR details for branches
          const prRes = await fetch(issue.pull_request.url, {
            headers: { Authorization: `Bearer ${githubToken}`, "Accept": "application/vnd.github.v3+json" }
          });
          if (prRes.ok) {
            const prDetails = await prRes.json();
            payload.source_branch = prDetails.head.ref;
            payload.target_branch = prDetails.base.ref;
            payload.merged_at = prDetails.merged_at;
          } else {
            payload.source_branch = "unknown";
            payload.target_branch = "unknown";
          }
        }

        await supabase.from(table).upsert(payload, { onConflict: "repo_id, number" });
      }
    }

    await supabase.from("repositories").update({ github_sync_at: new Date().toISOString() }).eq("id", id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
export { router as reposRouter };
