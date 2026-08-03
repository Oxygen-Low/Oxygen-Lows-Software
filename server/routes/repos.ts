import { Hono } from "hono";
import { getAnonClient, getAuthorProfile, getAuthenticatedClient } from "../lib/supabase.ts";
import { authenticateRepoRequest, authorizeRepoAccess } from "../lib/repoAuth.ts";

export const reposRouter = new Hono();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

// Dummy limiter middleware
const apiLimiter = async (c: any, next: any) => {
  await next();
};

reposRouter.use("*", authenticateRepoRequest);

reposRouter.get("/", async (c) => {
  const token = c.get("supabaseToken");
  try {
    const supabase = getAuthenticatedClient(token);
    const { data, error } = await supabase
      .from("repositories")
      .select("*, profiles!owner_id(username)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return c.json(data || []);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.get("/github/list", apiLimiter, async (c) => {
  const githubToken = c.req.header("x-github-token");
  if (!githubToken)
    return c.json({ error: "GitHub token missing" }, 400);
  try {
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: "Bearer " + githubToken,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Oxygen-Lows-Software"
        },
      },
    );
    if (!response.ok)
      return c.json({ error: "Failed to fetch GitHub repositories" }, response.status as any);
    const repos = await response.json();
    return c.json(repos);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.post("/github/import", apiLimiter, async (c) => {
  const user = c.get("user");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  const { fullName, name, description } = await c.req.json();
  
  if (!user) return c.json({ error: "Authentication required." }, 401);
  if (!githubToken) return c.json({ error: "GitHub token missing" }, 400);
  if (!fullName || !name) return c.json({ error: "Missing required fields" }, 400);

  try {
    const supabase = getAuthenticatedClient(token);
    const repoId = crypto.randomUUID();

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
      return c.json({ error: error.message }, 500);
    }
    return c.json(repo);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.use("/:id/*", authorizeRepoAccess);
reposRouter.use("/:id", authorizeRepoAccess);

reposRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);
      
    // Fetch branches from GitHub API
    let branches: string[] = ["main"];
    let currentBranch = "main";
    
    if (githubToken) {
        const response = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/branches`, {
            headers: {
                Authorization: "Bearer " + githubToken,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "Oxygen-Lows-Software"
            }
        });
        if (response.ok) {
            const data = await response.json();
            branches = data.map((b: any) => b.name);
            currentBranch = repo.default_branch || "main";
            if (!branches.includes(currentBranch) && branches.length > 0) {
                currentBranch = branches[0];
            }
        }
    }

    return c.json({
      ...repo,
      branches,
      currentBranch,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);

  if (c.get("repoPermission") !== "admin")
    return c.json({
      error: "Forbidden: Only repository owners can delete repositories.",
    }, 403);

  try {
    const supabase = getAuthenticatedClient(token);
    const { error } = await supabase
      .from("repositories")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.get("/:id/files", async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);
  if (!githubToken) return c.json({ error: "GitHub token missing" }, 400);

  const branch = c.req.query("branch") || "main";
  let folder = c.req.query("path") || "";

  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);
      
    // Use GitHub Trees API to get all files recursively if folder is empty, 
    // otherwise just get contents of the folder
    
    // For simplicity, just use the git trees API recursive
    const response = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/git/trees/${branch}?recursive=1`, {
        headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Oxygen-Lows-Software"
        }
    });
    
    if (!response.ok) {
        throw new Error("Failed to fetch tree from GitHub");
    }
    
    const treeData = await response.json();
    let files = treeData.tree
        .filter((item: any) => item.type === "blob")
        .map((item: any) => item.path);
        
    if (folder) {
        while (folder.endsWith("/")) folder = folder.slice(0, -1);
        files = files.filter((f: string) => f.startsWith(folder + "/"));
    }

    return c.json(files);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.get("/:id/file", async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);
  if (!githubToken) return c.json({ error: "GitHub token missing" }, 400);
  
  const filePath = c.req.query("path") || "";
  const branch = c.req.query("branch") || "main";
  if (!filePath) return c.json({ error: "Path is required" }, 400);
  
  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);
      
    const response = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/contents/${filePath}?ref=${branch}`, {
        headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Oxygen-Lows-Software"
        }
    });
    
    if (!response.ok) {
        throw new Error("Failed to fetch file from GitHub");
    }
    
    const data = await response.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return c.text(content);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.post("/:id/files", apiLimiter, async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);
  if (!githubToken) return c.json({ error: "GitHub token missing" }, 400);
  
  const body = await c.req.json();
  const { filePath, content, branch = "main", message = "Update file" } = body;
  const user = c.get("user");

  if (!user)
    return c.json({ error: "Authentication required." }, 401);
  if (c.get("repoPermission") === "read")
    return c.json({ error: "Forbidden: Write access required." }, 403);
    
  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);

    // Get file SHA first
    const getFileResponse = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/contents/${filePath}?ref=${branch}`, {
        headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Oxygen-Lows-Software"
        }
    });
    
    let sha = undefined;
    if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        sha = fileData.sha;
    }
    
    // Update or create file
    const putResponse = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/contents/${filePath}`, {
        method: "PUT",
        headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Oxygen-Lows-Software",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message,
            content: Buffer.from(content).toString("base64"),
            branch,
            sha
        })
    });
    
    if (!putResponse.ok) {
        const errData = await putResponse.json();
        throw new Error(errData.message || "Failed to push to GitHub");
    }
    
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.get("/:id/commits", async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  if (!validateId(id)) return c.json({ error: "Invalid ID" }, 400);
  if (!githubToken) return c.json({ error: "GitHub token missing" }, 400);
  
  const branch = c.req.query("branch") || "main";
  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);
      
    const response = await fetch(`https://api.github.com/repos/${repo.github_repo_full_name}/commits?sha=${branch}`, {
        headers: {
            Authorization: "Bearer " + githubToken,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Oxygen-Lows-Software"
        }
    });
    
    if (!response.ok) throw new Error("Failed to fetch commits");
    const commits = await response.json();
    
    const formattedCommits = commits.map((commit: any) => ({
        hash: commit.sha,
        date: commit.commit.author.date,
        message: commit.commit.message,
        author_name: commit.commit.author.name,
        author_email: commit.commit.author.email
    }));
    
    return c.json(formattedCommits);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

reposRouter.post("/:id/sync", apiLimiter, async (c) => {
  const id = c.req.param("id");
  const token = c.get("supabaseToken");
  const githubToken = c.req.header("x-github-token");
  if (!githubToken)
    return c.json({ error: "GitHub token missing" }, 400);

  try {
    const repo = await getRepo(id, token);
    if (!repo.github_repo_full_name)
      return c.json({ error: "Not a GitHub repository" }, 400);

    const supabase = getAuthenticatedClient(token);

    const issuesRes = await fetch(
      "https://api.github.com/repos/" +
        repo.github_repo_full_name +
        "/issues?state=all&per_page=100",
      {
        headers: {
          Authorization: "Bearer " + githubToken,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Oxygen-Lows-Software"
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
              "User-Agent": "Oxygen-Lows-Software"
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
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
