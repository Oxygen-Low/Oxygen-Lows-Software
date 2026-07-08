import { createClient } from "@supabase/supabase-js";
import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";

const REPOS_DATA_DIR =
  process.env.REPOS_DATA_DIR || path.join(os.tmpdir(), "oxygen-repos");
const IDLE_TIMEOUT = 10 * 60 * 1000;
const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const GIT_BINARY = process.env.GIT_PATH || "git";

interface LoadedRepo {
  lastActivity: number;
  loading: Promise<void> | null;
  ownerToken?: string;
}

function validateId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    id,
  );
}

function getSafeRepoPath(repoId: string) {
  if (!validateId(repoId)) throw new Error("Invalid ID");
  const safeId = path.basename(repoId);
  return path.join(REPOS_DATA_DIR, `${safeId}.git`);
}

function getSafeTmpPath(repoId: string, suffix: string) {
  if (!validateId(repoId)) throw new Error("Invalid ID");
  const base = path.resolve(os.tmpdir());
  const target = path.resolve(base, `${crypto.randomUUID()}${suffix}`);
  const relative = path.relative(base, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Invalid path");
  return target;
}

class RepoManager {
  private loadedRepos = new Map<string, LoadedRepo>();

  private getSupabaseClient(token?: string) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false },
    });
  }

  constructor() {
    fs.ensureDirSync(REPOS_DATA_DIR);
    if (typeof setInterval !== "undefined")
      setInterval(() => this.sweep(), 60000).unref();
    this.checkGit();
  }

  private async checkGit() {
    try {
      await simpleGit({ binary: GIT_BINARY }).version();
    } catch (err) {
      console.error(
        `Git check failed: Could not find or execute git at "${GIT_BINARY}". Please ensure git is installed and in your PATH, or set the GIT_PATH environment variable.`,
      );
    }
  }

  public git(baseDir?: string): SimpleGit {
    return simpleGit({
      baseDir,
      binary: GIT_BINARY,
    });
  }

  getOwnerToken(repoId: string) {
    return this.loadedRepos.get(repoId)?.ownerToken;
  }

  async ensureLoaded(
    repoId: string,
    githubFullName: string,
    token?: string,
  ): Promise<string> {
    if (!validateId(repoId)) throw new Error("Invalid repo ID");
    if (!githubFullName) throw new Error("GitHub full name is required");

    const repoPath = getSafeRepoPath(repoId);
    let info = this.loadedRepos.get(repoId);
    if (!info) {
      info = { lastActivity: Date.now(), loading: null };
      this.loadedRepos.set(repoId, info);
    }
    info.lastActivity = Date.now();
    if (token) info.ownerToken = token;

    if (fs.existsSync(repoPath)) return repoPath;
    if (info.loading) {
      await info.loading;
      return repoPath;
    }

    info.loading = (async () => {
      try {
        await fs.ensureDir(repoPath);
        const git = this.git();
        const remoteUrl = `https://github.com/${githubFullName}.git`;
        // Clone as a bare repository to act as our "origin" server-side
        await git.clone(remoteUrl, repoPath, ["--mirror"]);
      } catch (err) {
        await fs.remove(repoPath);
        throw err;
      } finally {
        info!.loading = null;
      }
    })();
    await info.loading;
    return repoPath;
  }

  touchActivity(repoId: string, token?: string) {
    const info = this.loadedRepos.get(repoId);
    if (info) {
      info.lastActivity = Date.now();
      if (token) info.ownerToken = token;
    }
  }

  private async sweep() {
    const now = Date.now();
    for (const [id, info] of this.loadedRepos.entries()) {
      try {
        if (now - info.lastActivity > IDLE_TIMEOUT && !info.loading) {
          const repoPath = getSafeRepoPath(id);
          await fs.remove(repoPath);
          this.loadedRepos.delete(id);

          if (info.ownerToken) {
            const supabase = this.getSupabaseClient(info.ownerToken);
            await supabase
              .from("repositories")
              .update({ is_loaded: false })
              .eq("id", id);
          }
        }
      } catch (err) {
        console.error(`Error sweeping repository ${id}:`, err);
      }
    }
  }

  getRepoPath(repoId: string) {
    return getSafeRepoPath(repoId);
  }

  getSafeTmpPath(repoId: string, suffix: string) {
    return getSafeTmpPath(repoId, suffix);
  }

  async deleteRepo(repoId: string) {
    if (!validateId(repoId)) throw new Error("Invalid ID");
    const repoPath = getSafeRepoPath(repoId);
    await fs.remove(repoPath);
    this.loadedRepos.delete(repoId);
  }
}
export const repoManager = new RepoManager();
