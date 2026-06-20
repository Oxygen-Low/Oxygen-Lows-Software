import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { repoManager } from "../lib/repoManager";
import { authenticateRepoRequest, authorizeRepoAccess } from "../lib/repoAuth";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs-extra";
import rateLimit from "express-rate-limit";

const router = Router();
const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";

const repoApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests to repository API" }
});

router.use(repoApiLimiter);

async function getRepo(id: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data } = await supabaseAdmin.from("repositories").select("*").eq("id", id).single();
  if (!data) throw new Error("Repo not found");
  return data;
}

router.get("/", authenticateRepoRequest, async (req, res) => {
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data: collabs } = await supabaseAdmin.from("repository_collaborators").select("repo_id").eq("user_id", user.id);
  const collabIds = collabs?.map(c => c.repo_id) || [];
  const query = supabaseAdmin.from("repositories").select("*, profiles!repositories_owner_id_fkey(username)");
  if (collabIds.length > 0) query.or(`owner_id.eq.${user.id},id.in.(${collabIds.join(",")})`);
  else query.eq("owner_id", user.id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", authenticateRepoRequest, async (req, res) => {
  const { name, description, initReadme } = req.body;
  if (!name || !/^[a-z0-9_-]+$/.test(name)) return res.status(400).json({ error: "Invalid name" });
  const user = (req as any).user;
  const repoId = crypto.randomUUID();
  try {
    const { storagePath } = await repoManager.createRepo(repoId, user.id, name);
    if (initReadme) {
      const repoPath = repoManager.getRepoPath(repoId);
      const tempDir = path.join(path.dirname(repoPath), `${repoId}-init`);
      await fs.ensureDir(tempDir);
      await simpleGit().clone(repoPath, tempDir);
      await fs.writeFile(path.join(tempDir, "README.md"), `# ${name}\n\n${description || ""}`);
      const tempGit = simpleGit(tempDir);
      await tempGit.add("README.md"); await tempGit.commit("Initial commit"); await tempGit.push("origin", "main");
      await fs.remove(tempDir);
      await repoManager.uploadToStorage(repoId, storagePath);
    }
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
    const { data, error } = await supabaseAdmin.from("repositories").insert({ id: repoId, owner_id: user.id, name, description, storage_path: storagePath, zip_size_bytes: 0, is_loaded: true }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/user/git-password", authenticateRepoRequest, async (req, res) => {
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data } = await supabaseAdmin.from("repository_passwords").select("password").eq("user_id", user.id).single();
  res.json({ password: data?.password || null });
});

router.post("/user/git-password", authenticateRepoRequest, async (req, res) => {
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const newPassword = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
  await supabaseAdmin.rpc("upsert_repository_password", { p_password: newPassword });
  res.json({ password: newPassword });
});

router.get("/:id", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repositories").select("*, profiles!repositories_owner_id_fkey(username)").eq("id", id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, permission: (req as any).repoPermission });
});

router.delete("/:id", authenticateRepoRequest, async (req, res) => {
  const id = String(req.params.id);
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data: repo } = await supabaseAdmin.from("repositories").select("*").eq("id", id).single();
  if (!repo || repo.owner_id !== user.id) return res.status(403).json({ error: "Forbidden" });
  await repoManager.forceUnload(id, repo.storage_path);
  await supabaseAdmin.storage.from("Storage").remove([repo.storage_path]);
  const { error } = await supabaseAdmin.from("repositories").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.get("/:id/tree", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const ref = String(req.query.ref || "HEAD");
  const treePath = String(req.query.path || "");
  if (!/^[a-zA-Z0-9\._\-\/]*$/.test(treePath)) return res.status(400).json({ error: "Invalid path" });
  try {
    const repo = await getRepo(id);
    await repoManager.ensureLoaded(id, repo.storage_path);
    const result = await simpleGit(repoManager.getRepoPath(id)).raw(["ls-tree", "-l", `${ref}:${treePath}`]);
    res.json(result.split("\n").filter(Boolean).map(line => {
      const [meta, name] = line.split("\t");
      const [mode, type, sha, size] = meta.split(/ +/);
      return { mode, type, sha, size, name };
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/file", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const ref = String(req.query.ref || "HEAD");
  const filePath = String(req.query.path || "");
  if (!/^[a-zA-Z0-9\._\-\/]*$/.test(filePath)) return res.status(400).json({ error: "Invalid path" });
  try {
    const repo = await getRepo(id);
    await repoManager.ensureLoaded(id, repo.storage_path);
    const content = await simpleGit(repoManager.getRepoPath(id)).show([`${ref}:${filePath}`]);
    res.send(content);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/:id/file", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const { path: filePath, content, message, branch = "main" } = req.body;
  if (!/^[a-zA-Z0-9\._\-\/]+$/.test(filePath)) return res.status(400).json({ error: "Invalid path" });
  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    const repo = await getRepo(id);
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const tempDir = path.join(path.dirname(repoPath), `${id}-edit-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await simpleGit().clone(repoPath, tempDir);
    const tempGit = simpleGit(tempDir);
    await tempGit.checkout(branch);
    const fullPath = path.join(tempDir, filePath);
    if (!fullPath.startsWith(tempDir)) throw new Error("Invalid path");
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
    await tempGit.add(filePath); await tempGit.commit(message || "Web edit"); await tempGit.push("origin", branch);
    await fs.remove(tempDir);
    const { size } = await repoManager.uploadToStorage(id, repo.storage_path);
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
    await supabaseAdmin.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_issues").select("*, author:profiles!repository_issues_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/:id/issues", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const { title, body } = req.body;
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_issues").insert({ repo_id: id, title, body, author_id: user.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_pull_requests").select("*, author:profiles!repository_pull_requests_author_id_fkey(username)").eq("repo_id", id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/:id/pulls", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const { title, body, source_branch, target_branch } = req.body;
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_pull_requests").insert({ repo_id: id, title, body, source_branch, target_branch, author_id: user.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:id/pulls/:prId/diff", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const prId = String(req.params.prId);
  try {
    const repo = await getRepo(id);
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
    const { data: pr } = await supabaseAdmin.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr) return res.status(404).json({ error: "PR not found" });
    await repoManager.ensureLoaded(id, repo.storage_path);
    const diff = await simpleGit(repoManager.getRepoPath(id)).raw(["diff", pr.target_branch, pr.source_branch]);
    res.send(diff);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/pulls/:prId/merge", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const prId = String(req.params.prId);
  const user = (req as any).user;
  if ((req as any).repoPermission === "read") return res.status(403).json({ error: "Forbidden" });
  try {
    const repo = await getRepo(id);
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
    const { data: pr } = await supabaseAdmin.from("repository_pull_requests").select("*").eq("id", prId).single();
    if (!pr || pr.status !== "open") return res.status(400).json({ error: "Not mergeable" });
    const repoPath = await repoManager.ensureLoaded(id, repo.storage_path);
    const tempDir = path.join(path.dirname(repoPath), `${id}-merge-${prId}`);
    await fs.ensureDir(tempDir);
    await simpleGit().clone(repoPath, tempDir);
    const tempGit = simpleGit(tempDir);
    await tempGit.checkout(pr.target_branch); await tempGit.merge([pr.source_branch]); await tempGit.push("origin", pr.target_branch);
    await fs.remove(tempDir);
    const { size } = await repoManager.uploadToStorage(id, repo.storage_path);
    await supabaseAdmin.from("repository_pull_requests").update({ status: "merged", merged_at: new Date().toISOString(), merged_by: user.id }).eq("id", prId);
    await supabaseAdmin.from("repositories").update({ zip_size_bytes: size }).eq("id", id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const prId = String(req.params.prId);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_pull_request_comments").select("*, user:profiles!repository_pull_request_comments_user_id_fkey(username)").eq("pr_id", prId).order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/:id/pulls/:prId/comments", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const prId = String(req.params.prId);
  const { body } = req.body;
  const user = (req as any).user;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_pull_request_comments").insert({ pr_id: prId, user_id: user.id, body }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { data, error } = await supabaseAdmin.from("repository_collaborators").select("*, user:profiles!repository_collaborators_user_id_fkey(username, display_name)").eq("repo_id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/:id/collaborators", authenticateRepoRequest, authorizeRepoAccess, async (req, res) => {
  const id = String(req.params.id);
  const { username, permission = "write" } = req.body;
  if ((req as any).repoPermission !== "admin") return res.status(403).json({ error: "Forbidden" });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey!, { auth: { persistSession: false } });
  const { error } = await supabaseAdmin.rpc("add_repo_collaborator", { p_repo_id: id, p_username: username, p_permission: permission });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export { router as reposRouter };
