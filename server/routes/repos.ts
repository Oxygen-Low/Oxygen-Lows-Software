import { Router } from "express";
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest, authorizeRepoAccess } from "../lib/repoAuth";
import { getSupabaseAdmin, getAuthorProfile } from "../lib/supabase";
import { apiLimiter } from "../lib/limiter";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateId(id: string) { return UUID_REGEX.test(id); }

function getAuthenticatedClient(token: string) {
  const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
  const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

  if (token && token !== supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false }
    });
  }
  return getSupabaseAdmin();
}

async function getRepo(id: string, token: string) {
  const supabase = getAuthenticatedClient(token);
  const { data, error } = await supabase.from("repositories").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Repository not found or access denied");
  return data;
}

function isSafePath(filePath: string) {
  if (!filePath) return false;
  const normalized = path.normalize(filePath);
  // Prevent path traversal and absolute paths
  if (normalized.includes('..') || path.isAbsolute(normalized)) return false;
  // Further restrict to common safe characters if needed, but for now normalization is key
  return true;
}

router.get("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const repo = await getRepo(id, token);
    const repoPath = repo.storage_path ? await repoManager.ensureLoaded(id, repo.storage_path, token) : null;
    const git = repoPath ? repoManager.git(repoPath) : null;
    const branches = git ? await git.branchLocal() : { all: [], current: "" };
    res.json({ ...repo, branches: branches.all, currentBranch: branches.current });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/", authenticateRepoRequest, async (req, res) => {
    const token = (req as any).supabaseToken;
    const user = (req as any).user;
    try {
        const supabase = getAuthenticatedClient(token);
        const { data: ownedRepos, error: ownedError } = await supabase.from("repositories").select("*").eq("owner_id", user.id);
        const { data: collabRepos, error: collabError } = await supabase.from("repository_collaborators").select("repositories(*)").eq("user_id", user.id);

        if (ownedError || collabError) throw new Error(ownedError?.message || collabError?.message);

        const collabs = (collabRepos || []).map(c => (c as any).repositories).filter(Boolean);
        const allRepos = [...(ownedRepos || []), ...collabs];
        const uniqueRepos = Array.from(new Map(allRepos.map(r => [r.id, r])).values());

        res.json(uniqueRepos);
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
    const supabase = getSupabaseAdmin();

    let { size } = await repoManager.createRepo(repoId, user.id, name, token);

    if (initReadme) {
      const repoPath = repoManager.getRepoPath(repoId);
      const tempDir = repoManager.getSafeTmpPath(repoId, `-init-${crypto.randomBytes(4).toString('hex')}`);
      try {
        await fs.ensureDir(tempDir);
        await repoManager.git().clone(repoPath, tempDir);
        const tempGit = repoManager.git(tempDir);
        const profile = await getAuthorProfile(user.id);
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
        await supabase.storage.from("Repositories").remove([storagePath]);
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
    const supabase = getSupabaseAdmin();

    // Delete from DB first to ensure transactional integrity (sort of)
    const { error } = await supabase.from("repositories").delete().eq("id", id);
    if (error) throw error;

    // Cleanup artifacts best-effort
    await repoManager.deleteRepo(id);
    if (repo.storage_path) {
        await supabase.storage.from("Repositories").remove([repo.storage_path]);
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/files", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const branch = (req.query.branch as string) || "main";
  let folder = (req.query.path as string) || "";

  try {
    const repo = await getRepo(id, token);
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const git = repoManager.git(repoPath);

    // Normalize and trim trailing slashes to avoid root listing issues
    folder = folder.replace(/\/+$/, "");
    const pathspec = folder ? `${folder}/` : "";

    const args = ["ls-tree", "-r", "--name-only", branch];
    if (pathspec) args.push(pathspec);

    const filesString = await git.raw(args);
    const files = filesString.split("\n").filter(Boolean);
    res.json(files);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/file", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const filePath = req.query.path as string;
  const selectedBranch = (req.query.branch as string) || "main";
  if (!filePath) return res.status(400).json({ error: "Path is required" });
  try {
    const repo = await getRepo(id, token);
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const content = await repoManager.git(repoPath).show([`${selectedBranch}:${filePath}`]);
    res.send(content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/files", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { filePath, content, branch = "main", message = "Update file" } = req.body;
  const user = (req as any).user;

  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  if (!isSafePath(filePath)) return res.status(400).json({ error: "Invalid file path" });

  try {
    const repo = await getRepo(id, token);

    // Authorization check for protected branches (default branch)
    const defaultBranch = repo.default_branch || "main";
    if (branch === defaultBranch && repo.owner_id !== user.id && (req as any).repoPermission !== "admin") {
      return res.status(403).json({ error: `Only the repository owner or admin can push to the ${defaultBranch} branch.` });
    }

    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);

    const tempDir = repoManager.getSafeTmpPath(id, `-edit-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await repoManager.git().clone(repoPath, tempDir);
      const tempGit = repoManager.git(tempDir);

      // Explicitly checkout target branch
      try {
        await tempGit.checkout(branch);
      } catch (e) {
        await tempGit.checkoutLocalBranch(branch);
      }

      const profile = await getAuthorProfile(user.id);
      const authorName = profile?.username || user.user_metadata?.username || "Anonymous";
      const authorEmail = profile?.email || user.email || "anon@example.com";
      await tempGit.addConfig("user.name", authorName);
      await tempGit.addConfig("user.email", authorEmail);

      const fullPath = path.resolve(tempDir, filePath);
      // Strict path verification to prevent injection
      if (!fullPath.startsWith(path.resolve(tempDir) + path.sep)) {
          return res.status(400).json({ error: "Path injection detected" });
      }

      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
      await tempGit.add(filePath);
      await tempGit.commit(message);
      await tempGit.push("origin", branch);

      const { size } = await repoManager.uploadToStorage(id, repo.storage_path, token);
      const supabase = getSupabaseAdmin();
      await supabase.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
      res.json({ success: true });
    } finally {
      await fs.remove(tempDir);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/commits", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const branch = (req.query.branch as string) || "main";
  try {
    const repo = await getRepo(id, token);
    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const logs = await repoManager.git(repoPath).log([branch]);
    res.json(logs.all);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const supabase = getAuthenticatedClient(token);
    const { data, error } = await supabase.from("repository_pull_requests").select("*, user:profiles!author_id(username)").eq("repo_id", id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const prId = String(req.params.prId);
    if (!validateId(prId)) return res.status(400).json({ error: "Invalid PR ID" });
    try {
      const supabase = getAuthenticatedClient(token);
      // Scope PR lookup to repo_id
      const { data: pr, error } = await supabase.from("repository_pull_requests").select("*, user:profiles!author_id(username)").eq("id", prId).eq("repo_id", id).single();
      if (error || !pr) return res.status(404).json({ error: "PR not found in this repository" });

      const repo = await getRepo(id, token);
      const repoPath = await repoManager.ensureLoaded(id, repo.storage_path!, token);

      // Fix diff argument ordering: range before --
      const diff = await repoManager.git(repoPath).raw(["diff", pr.target_branch, pr.source_branch, "--"]);

      res.json({ ...pr, diff });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, apiLimiter, async (req, res) => {
  const id = String(req.params.id);
  const token = (req as any).supabaseToken;
  if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
  const { title, body, source_branch, target_branch } = req.body;
  const user = (req as any).user;
  try {
    const supabase = getSupabaseAdmin();

    // Rely on DB unique constraint and sequence for atomic PR number allocation
    const { data, error } = await supabase.from("repository_pull_requests").insert({
      repo_id: id, author_id: user.id, title, body, source_branch, target_branch, status: "open"
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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
    const supabase = getSupabaseAdmin();
    // Scope PR lookup to repo_id
    const { data: pr } = await supabase.from("repository_pull_requests").select("*").eq("id", prId).eq("repo_id", id).single();
    if (!pr || pr.status !== "open") return res.status(400).json({ error: "Not mergeable" });

    const defaultBranch = repo.default_branch || "main";
    if (pr.target_branch === defaultBranch && repo.owner_id !== user.id && (req as any).repoPermission !== "admin") {
        return res.status(403).json({ error: `Only the repository owner or admin can merge to the ${defaultBranch} branch.` });
    }

    if (!repo.storage_path) return res.status(400).json({ error: "Repository storage path is missing" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path, token);
    const tempDir = repoManager.getSafeTmpPath(id, `-merge-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.ensureDir(tempDir);
      await repoManager.git().clone(repoPath, tempDir);
      const tempGit = repoManager.git(tempDir);
      const profile = await getAuthorProfile(user.id);
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
    const supabase = getAuthenticatedClient(token);
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
    const supabase = getSupabaseAdmin();
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
    const supabase = getAuthenticatedClient(token);
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
    const supabase = getSupabaseAdmin();
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
    const supabase = getSupabaseAdmin();
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

    const supabase = getSupabaseAdmin();

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
