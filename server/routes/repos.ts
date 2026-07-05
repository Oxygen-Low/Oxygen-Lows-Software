import { Router } from "express";
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest, authorizeRepoAccess } from "../lib/repoAuth";
import {
  getSupabaseAdmin,
  getAuthorProfile,
  getAuthenticatedClient,
} from "../lib/supabase";
import { apiLimiter } from "../lib/limiter";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateId(id: string) {
  return UUID_REGEX.test(id);
}

async function getRepo(id: string, token: string) {
  const supabase = getAuthenticatedClient(token);
  const { data, error } = await supabase
    .from("repositories")
    .select("*, profiles!owner_id(username)")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Repository not found or access denied");
  return data;
}

function isSafePath(filePath: string) {
  if (!filePath) return false;
  const normalized = path.normalize(filePath);
  if (normalized.includes("..") || path.isAbsolute(normalized)) return false;
  const segments = normalized.split(path.sep);
  if (segments.includes(".git")) return false;
  return true;
}

router.get(
  "/:id",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const git = repoManager.git(repoPath);
      const branches = await git.branchLocal();
      res.json({
        ...repo,
        branches: branches.all,
        currentBranch: branches.current,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get("/", authenticateRepoRequest, async (req, res) => {
  const token = (req as any).supabaseToken;
  try {
    const supabase = getAuthenticatedClient(token);
    const { data, error } = await supabase
      .from("repositories")
      .select("*, profiles!owner_id(username)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / is removed as we only support GitHub import now

router.delete(
  "/:id",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });

    if ((req as any).repoPermission !== "admin")
      return res.status(403).json({
        error: "Forbidden: Only repository owners can delete repositories.",
      });

    try {
      const supabase = getAuthenticatedClient(token);
      const { error } = await supabase
        .from("repositories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await repoManager.deleteRepo(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/files",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const branch =
      typeof req.query.branch === "string" ? req.query.branch : "main";
    let folder = typeof req.query.path === "string" ? req.query.path : "";

    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const git = repoManager.git(repoPath);

      while (folder.endsWith("/")) {
        folder = folder.slice(0, -1);
      }
      const pathspec = folder ? folder + "/" : "";

      const args = ["ls-tree", "-r", "--name-only", branch];
      if (pathspec) args.push(pathspec);

      const filesString = await git.raw(args);
      const files = filesString.split("\n").filter(Boolean);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/file",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const filePath = typeof req.query.path === "string" ? req.query.path : "";
    const selectedBranch =
      typeof req.query.branch === "string" ? req.query.branch : "main";
    if (!filePath) return res.status(400).json({ error: "Path is required" });
    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const content = await repoManager
        .git(repoPath)
        .show([selectedBranch + ":" + filePath]);
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/files",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    const githubToken = req.headers["x-github-token"] as string;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const {
      filePath,
      content,
      branch = "main",
      message = "Update file",
    } = req.body;
    const user = (req as any).user;

    if (!user)
      return res.status(401).json({ error: "Authentication required." });
    if ((req as any).repoPermission === "read")
      return res
        .status(403)
        .json({ error: "Forbidden: Write access required." });
    if (!isSafePath(filePath))
      return res.status(400).json({ error: "Invalid file path" });

    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const tempDir = repoManager.getSafeTmpPath(
        id,
        "-edit-" + crypto.randomBytes(8).toString("hex"),
      );
      try {
        await fs.ensureDir(tempDir);
        await repoManager.git().clone(repoPath, tempDir);
        const tempGit = repoManager.git(tempDir);
        const profile = await getAuthorProfile(user.id);
        const authorName =
          profile?.username || user.user_metadata?.username || "Anonymous";
        const authorEmail = profile?.email || user.email || "anon@example.com";
        await tempGit.addConfig("user.name", authorName);
        await tempGit.addConfig("user.email", authorEmail);

        try {
          await tempGit.checkout(branch);
        } catch (err) {
          await tempGit.checkoutLocalBranch(branch);
        }

        const base = path.resolve(tempDir);
        const target = path.resolve(base, filePath);
        const relative = path.relative(base, target);
        if (relative.startsWith("..") || path.isAbsolute(relative))
          return res.status(400).json({ error: "Invalid file path" });
        const fullPath = target;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content);
        await tempGit.add(filePath);
        await tempGit.commit(message);

        if (githubToken) {
          const remoteUrl = `https://x-access-token:${githubToken}@github.com/${repo.github_repo_full_name}.git`;
          await tempGit.addRemote("github", remoteUrl);
          await tempGit.push("github", branch);
          // Also push to our local bare repo to keep it in sync
          await tempGit.push("origin", branch);
        } else {
          // If no github token, we can only update the local bare repo.
          // This might be desired if the user just wants to "save" locally for now,
          // but our requirements say push back to GitHub.
          throw new Error("GitHub token is required to save changes.");
        }
        res.json({ success: true });
      } finally {
        await fs.remove(tempDir);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/commits",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const branch =
      typeof req.query.branch === "string" ? req.query.branch : "main";
    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const commits = await repoManager.git(repoPath).log([branch]);
      res.json(commits.all);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/issues",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_issues")
        .select("*, user:profiles!author_id(username)")
        .eq("repo_id", id)
        .order("number", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/issues",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const { title, body } = req.body;
    const user = (req as any).user;

    if (!user)
      return res.status(401).json({ error: "Authentication required." });

    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_issues")
        .insert({ repo_id: id, author_id: user.id, title, body })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/pulls",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_pull_requests")
        .select("*, user:profiles!author_id(username)")
        .eq("repo_id", id)
        .order("number", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/pulls",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const { title, body, source_branch, target_branch } = req.body;
    const user = (req as any).user;

    if (!user)
      return res.status(401).json({ error: "Authentication required." });

    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_pull_requests")
        .insert({
          repo_id: id,
          author_id: user.id,
          title,
          body,
          source_branch,
          target_branch,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/pulls/:prId/merge",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    const githubToken = req.headers["x-github-token"] as string;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const prId = String(req.params.prId);
    if (!validateId(prId))
      return res.status(400).json({ error: "Invalid PR ID" });
    const user = (req as any).user;

    if (!user)
      return res.status(401).json({ error: "Authentication required." });
    if ((req as any).repoPermission === "read")
      return res
        .status(403)
        .json({ error: "Forbidden: Write access required." });

    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });
      const supabase = getAuthenticatedClient(token);
      const { data: pr } = await supabase
        .from("repository_pull_requests")
        .select("*")
        .eq("id", prId)
        .eq("repo_id", id)
        .single();
      if (!pr || pr.status !== "open")
        return res.status(400).json({ error: "Not mergeable" });

      const defaultBranch = repo.default_branch || "main";
      if (
        pr.target_branch === defaultBranch &&
        repo.owner_id !== user.id &&
        (req as any).repoPermission !== "admin"
      ) {
        return res.status(403).json({
          error:
            "Only the repository owner or admin can merge to the " +
            defaultBranch +
            " branch.",
        });
      }

      const repoPath = await repoManager.ensureLoaded(
        id,
        repo.github_repo_full_name,
        token,
      );
      const tempDir = repoManager.getSafeTmpPath(
        id,
        "-merge-" + crypto.randomBytes(8).toString("hex"),
      );
      try {
        await fs.ensureDir(tempDir);
        await repoManager.git().clone(repoPath, tempDir);
        const tempGit = repoManager.git(tempDir);
        const profile = await getAuthorProfile(user.id);
        const authorName =
          profile?.username || user.user_metadata?.username || "Anonymous";
        const authorEmail = profile?.email || user.email || "anon@example.com";
        await tempGit.addConfig("user.name", authorName);
        await tempGit.addConfig("user.email", authorEmail);
        await tempGit.checkout(pr.target_branch);
        await tempGit.merge(["--", pr.source_branch]);

        if (githubToken) {
          const remoteUrl = `https://x-access-token:${githubToken}@github.com/${repo.github_repo_full_name}.git`;
          await tempGit.addRemote("github", remoteUrl);
          await tempGit.push("github", pr.target_branch);
          await tempGit.push("origin", pr.target_branch);
        } else {
          throw new Error(
            "GitHub token is required to merge changes to GitHub.",
          );
        }

        await supabase
          .from("repository_pull_requests")
          .update({
            status: "merged",
            merged_at: new Date().toISOString(),
            merged_by: user.id,
          })
          .eq("id", prId);
        res.json({ success: true });
      } finally {
        await fs.remove(tempDir);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/pulls/:prId/comments",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const prId = String(req.params.prId);
    if (!validateId(prId))
      return res.status(400).json({ error: "Invalid PR ID" });
    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_pull_request_comments")
        .select("*, user:profiles!user_id(username)")
        .eq("pr_id", prId)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/pulls/:prId/comments",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const prId = String(req.params.prId);
    if (!validateId(prId))
      return res.status(400).json({ error: "Invalid PR ID" });
    const { body } = req.body;
    const user = (req as any).user;

    if (!user)
      return res.status(401).json({ error: "Authentication required." });

    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_pull_request_comments")
        .insert({ pr_id: prId, user_id: user.id, body })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/collaborators",
  authenticateRepoRequest,
  authorizeRepoAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const supabase = getAuthenticatedClient(token);
      const { data, error } = await supabase
        .from("repository_collaborators")
        .select("*, user:profiles!user_id(username, display_name)")
        .eq("repo_id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/collaborators",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    if (!validateId(id)) return res.status(400).json({ error: "Invalid ID" });
    const { username, permission = "write" } = req.body;
    if ((req as any).repoPermission !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    try {
      const supabase = getAuthenticatedClient(token);
      const { error } = await supabase.rpc("add_repo_collaborator", {
        p_repo_id: id,
        p_username: username,
        p_permission: permission,
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/github/list",
  authenticateRepoRequest,
  apiLimiter,
  async (req, res) => {
    const githubToken = req.headers["x-github-token"];
    if (!githubToken)
      return res.status(400).json({ error: "GitHub token missing" });
    try {
      const response = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100",
        {
          headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );
      if (!response.ok)
        return res
          .status(response.status)
          .json({ error: "Failed to fetch GitHub repositories" });
      const repos = await response.json();
      res.json(repos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/github/import",
  authenticateRepoRequest,
  apiLimiter,
  async (req, res) => {
    const user = (req as any).user;
    const token = (req as any).supabaseToken;
    const githubToken = req.headers["x-github-token"] as string;
    const { fullName, name, description } = req.body;
    if (!user)
      return res.status(401).json({ error: "Authentication required." });
    if (!githubToken)
      return res.status(400).json({ error: "GitHub token missing" });
    if (!fullName || !name)
      return res.status(400).json({ error: "Missing required fields" });

    try {
      const supabase = getAuthenticatedClient(token);
      const repoId = crypto.randomUUID();

      // We don't need to call importGithubRepo anymore, ensureLoaded will handle it on first access
      const { data: repo, error } = await supabase
        .from("repositories")
        .insert({
          id: repoId,
          owner_id: user.id,
          name,
          description,
          github_repo_full_name: fullName,
          github_sync_at: new Date().toISOString(),
          is_loaded: false,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json(repo);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/:id/sync",
  authenticateRepoRequest,
  authorizeRepoAccess,
  apiLimiter,
  async (req, res) => {
    const id = String(req.params.id);
    const token = (req as any).supabaseToken;
    const githubToken = req.headers["x-github-token"] as string;
    if (!githubToken)
      return res.status(400).json({ error: "GitHub token missing" });

    try {
      const repo = await getRepo(id, token);
      if (!repo.github_repo_full_name)
        return res.status(400).json({ error: "Not a GitHub repository" });

      const supabase = getAuthenticatedClient(token);

      const issuesRes = await fetch(
        "https://api.github.com/repos/" +
          repo.github_repo_full_name +
          "/issues?state=all&per_page=100",
        {
          headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );
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
            status:
              issue.state === "open"
                ? "open"
                : isPR && issue.merged_at
                  ? "merged"
                  : "closed",
            github_id: issue.id,
            github_username: issue.user.login,
            updated_at: issue.updated_at,
          };

          if (isPR) {
            const prRes = await fetch(issue.pull_request.url, {
              headers: {
                Authorization: "Bearer " + githubToken,
                Accept: "application/vnd.github.v3+json",
              },
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

          await supabase
            .from(table)
            .upsert(payload, { onConflict: "repo_id, number" });
        }
      }

      await supabase
        .from("repositories")
        .update({ github_sync_at: new Date().toISOString() })
        .eq("id", id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

export { router as reposRouter };
