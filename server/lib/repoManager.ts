import { createClient } from "@supabase/supabase-js";
import simpleGit from "simple-git";
import { ZipArchive } from "archiver";
import extract from "extract-zip";
import fs from "fs-extra";
import path from "path";
import os from "os";

const REPOS_DATA_DIR = process.env.REPOS_DATA_DIR || path.join(os.tmpdir(), "oxygen-repos");
const IDLE_TIMEOUT = 10 * 60 * 1000;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

interface LoadedRepo {
  lastActivity: number;
  loading: Promise<void> | null;
  ownerToken?: string;
}

function validateId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

function getSafeRepoPath(repoId: string) {
  if (!validateId(repoId)) throw new Error("Invalid ID");
  const safeId = path.basename(repoId);
  return path.join(REPOS_DATA_DIR, `${safeId}.git`);
}

function getSafeTmpPath(repoId: string, suffix: string) {
    if (!validateId(repoId)) throw new Error("Invalid ID");
    const safeId = path.basename(repoId);
    return path.join(os.tmpdir(), `${safeId}${suffix}`);
}

class RepoManager {
  private loadedRepos = new Map<string, LoadedRepo>();

  private getSupabaseClient(token?: string) {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase config missing");
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false }
    });
  }

  constructor() {
    fs.ensureDirSync(REPOS_DATA_DIR);
    if (typeof setInterval !== 'undefined') setInterval(() => this.sweep(), 60000).unref();
  }

  getOwnerToken(repoId: string) {
    return this.loadedRepos.get(repoId)?.ownerToken;
  }

  async ensureLoaded(repoId: string, storagePath: string, token?: string): Promise<string> {
    if (!validateId(repoId)) throw new Error("Invalid repo ID");
    if (!/^[0-9a-f-]+\/repos\/[0-9a-f-]+\.zip$/.test(storagePath)) throw new Error("Invalid storage path");

    const repoPath = getSafeRepoPath(repoId);
    let info = this.loadedRepos.get(repoId);
    if (!info) { info = { lastActivity: Date.now(), loading: null }; this.loadedRepos.set(repoId, info); }
    info.lastActivity = Date.now();
    if (token) info.ownerToken = token;

    if (fs.existsSync(repoPath)) return repoPath;
    if (info.loading) { await info.loading; return repoPath; }

    info.loading = (async () => {
      try {
        const supabase = this.getSupabaseClient(token);
        const { data, error } = await supabase.storage.from("Storage").download(storagePath);
        if (error || !data) throw new Error(`Download failed: ${error?.message || 'No data'}`);

        const zipPath = getSafeTmpPath(repoId, ".zip");
        await fs.writeFile(zipPath, Buffer.from(await data.arrayBuffer()));
        const extractDir = getSafeTmpPath(repoId, "-extract");
        await fs.ensureDir(extractDir);
        const resolvedExtractDir = path.resolve(extractDir);
        await extract(zipPath, {
          dir: extractDir,
          onEntry: (entry) => {
            const entryPath = path.resolve(extractDir, entry.fileName);
            if (!entryPath.startsWith(resolvedExtractDir + path.sep) && entryPath !== resolvedExtractDir) {
              throw new Error("Invalid zip entry (Zip Slip detected)");
            }
          }
        });
        const gitDir = path.join(extractDir, ".git");
        if (await fs.pathExists(gitDir)) {
            await fs.move(gitDir, repoPath, { overwrite: true });
        } else {
            await fs.move(extractDir, repoPath, { overwrite: true });
        }
        await fs.remove(zipPath); await fs.remove(extractDir);
      } finally { info!.loading = null; }
    })();
    await info.loading; return repoPath;
  }

  async createRepo(repoId: string, ownerId: string, name: string, token: string) {
    if (!validateId(repoId) || !validateId(ownerId)) throw new Error("Invalid ID");
    if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("Invalid name");

    const repoPath = getSafeRepoPath(repoId);
    await fs.ensureDir(repoPath);
    await simpleGit(repoPath).init(true);
    const storagePath = `${ownerId}/repos/${repoId}.zip`;
    const { size } = await this.uploadToStorage(repoId, storagePath, token);
    this.loadedRepos.set(repoId, { lastActivity: Date.now(), loading: null, ownerToken: token });
    return { storagePath, size };
  }

  async uploadToStorage(repoId: string, storagePath: string, token: string) {
    if (!validateId(repoId)) throw new Error("Invalid ID");
    const repoPath = getSafeRepoPath(repoId);
    const zipPath = getSafeTmpPath(repoId, "-upload.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const archivePromise = new Promise((res, rej) => { output.on("close", res); archive.on("error", rej); });
    archive.pipe(output); archive.directory(repoPath, ".git"); await archive.finalize(); await archivePromise;

    const buffer = await fs.readFile(zipPath);
    const supabase = this.getSupabaseClient(token);
    const { error } = await supabase.storage.from("Storage").upload(storagePath, buffer, { contentType: "application/zip", upsert: true });
    if (error) throw error;
    await fs.remove(zipPath); return { size: buffer.length };
  }

  async forceUnload(repoId: string, storagePath: string, token?: string) {
    if (token) {
        try {
            await this.uploadToStorage(repoId, storagePath, token);
        } catch (err) {
            console.error(`Failed to sync repo ${repoId} to storage during unload:`, err);
            // Return early to prevent data loss - do not delete local copy if sync fails
            return;
        }
    }
    const repoPath = getSafeRepoPath(repoId);
    await fs.remove(repoPath);
    this.loadedRepos.delete(repoId);
  }

  touchActivity(repoId: string, token?: string) {
    const info = this.loadedRepos.get(repoId);
    if (info) {
        info.lastActivity = Date.now();
        if (token) info.ownerToken = token;
    }
  }

  private async sweep() {
    if (!supabaseUrl || !supabaseAnonKey) return;
    const now = Date.now();
    for (const [id, info] of this.loadedRepos.entries()) {
      try {
        if (now - info.lastActivity > IDLE_TIMEOUT && !info.loading) {
          const supabase = this.getSupabaseClient(info.ownerToken);

          // Check if token is valid (if provided)
          if (info.ownerToken && info.ownerToken !== supabaseAnonKey) {
              const { data: { user } } = await supabase.auth.getUser(info.ownerToken);
              if (!user) {
                  console.warn(`Token for repo ${id} is expired. Skipping unload to prevent data loss.`);
                  continue;
              }
          }

          const { data } = await supabase.from("repositories").select("storage_path").eq("id", id).single();
          if (data?.storage_path) {
            await this.forceUnload(id, data.storage_path, info.ownerToken);
            // Only update DB if it was successfully removed from memory
            if (!this.loadedRepos.has(id)) {
                await supabase.from("repositories").update({ is_loaded: false }).eq("id", id);
            }
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
}
export const repoManager = new RepoManager();
