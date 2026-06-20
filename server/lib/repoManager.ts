import { createClient } from "@supabase/supabase-js";
import simpleGit from "simple-git";
import * as archiverModule from "archiver";
const archiver = (archiverModule as any).default || archiverModule;
import extract from "extract-zip";
import fs from "fs-extra";
import path from "path";
import os from "os";

const REPOS_DATA_DIR = process.env.REPOS_DATA_DIR || path.join(os.tmpdir(), "oxygen-repos");
const IDLE_TIMEOUT = 10 * 60 * 1000;

interface LoadedRepo { lastActivity: number; loading: Promise<void> | null; }

function validateId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

class RepoManager {
  private loadedRepos = new Map<string, LoadedRepo>();
  private supabaseService: any;

  constructor() {
    const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) this.supabaseService = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    fs.ensureDirSync(REPOS_DATA_DIR);
    if (typeof setInterval !== 'undefined') setInterval(() => this.sweep(), 60000);
  }

  async ensureLoaded(repoId: string, storagePath: string): Promise<string> {
    if (!validateId(repoId)) throw new Error("Invalid repo ID");
    // Ensure storagePath is safe (e.g. starts with ownerId/repos/)
    if (!/^[0-9a-f-]+\/repos\/[0-9a-f-]+\.zip$/.test(storagePath)) throw new Error("Invalid storage path");

    const repoPath = path.join(REPOS_DATA_DIR, `${repoId}.git`);
    let info = this.loadedRepos.get(repoId);
    if (!info) { info = { lastActivity: Date.now(), loading: null }; this.loadedRepos.set(repoId, info); }
    info.lastActivity = Date.now();

    if (fs.existsSync(repoPath)) return repoPath;
    if (info.loading) { await info.loading; return repoPath; }

    info.loading = (async () => {
      try {
        const { data, error } = await this.supabaseService.storage.from("Storage").download(storagePath);
        if (error || !data) throw new Error("Download failed");
        const zipPath = path.join(os.tmpdir(), `${repoId}.zip`);
        await fs.writeFile(zipPath, Buffer.from(await data.arrayBuffer()));
        const extractDir = path.join(os.tmpdir(), `${repoId}-extract`);
        await fs.ensureDir(extractDir);
        await extract(zipPath, { dir: extractDir });
        await fs.move(path.join(extractDir, ".git"), repoPath, { overwrite: true });
        await fs.remove(zipPath); await fs.remove(extractDir);
      } finally { info!.loading = null; }
    })();
    await info.loading; return repoPath;
  }

  async createRepo(repoId: string, ownerId: string, name: string) {
    if (!validateId(repoId) || !validateId(ownerId)) throw new Error("Invalid ID");
    if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("Invalid name");

    const repoPath = path.join(REPOS_DATA_DIR, `${repoId}.git`);
    await fs.ensureDir(repoPath);
    await simpleGit(repoPath).init(true);
    const storagePath = `${ownerId}/repos/${repoId}.zip`;
    const { size } = await this.uploadToStorage(repoId, storagePath);
    this.loadedRepos.set(repoId, { lastActivity: Date.now(), loading: null });
    return { storagePath, size };
  }

  async uploadToStorage(repoId: string, storagePath: string) {
    if (!validateId(repoId)) throw new Error("Invalid ID");
    const repoPath = path.join(REPOS_DATA_DIR, `${repoId}.git`);
    const zipPath = path.join(os.tmpdir(), `${repoId}-upload.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const archivePromise = new Promise((res, rej) => { output.on("close", res); archive.on("error", rej); });
    archive.pipe(output); archive.directory(repoPath, ".git"); await archive.finalize(); await archivePromise;
    const buffer = await fs.readFile(zipPath);
    await this.supabaseService.storage.from("Storage").remove([storagePath]);
    const { error } = await this.supabaseService.storage.from("Storage").upload(storagePath, buffer, { contentType: "application/zip", upsert: false });
    if (error) throw error;
    await fs.remove(zipPath); return { size: buffer.length };
  }

  async forceUnload(repoId: string, storagePath: string) {
    await this.uploadToStorage(repoId, storagePath);
    await fs.remove(path.join(REPOS_DATA_DIR, `${repoId}.git`));
    this.loadedRepos.delete(repoId);
  }

  touchActivity(repoId: string) { const info = this.loadedRepos.get(repoId); if (info) info.lastActivity = Date.now(); }

  private async sweep() {
    const now = Date.now();
    for (const [id, info] of this.loadedRepos.entries()) {
      if (now - info.lastActivity > IDLE_TIMEOUT && !info.loading) {
        const { data } = await this.supabaseService.from("repositories").select("storage_path").eq("id", id).single();
        if (data?.storage_path) { await this.forceUnload(id, data.storage_path); await this.supabaseService.from("repositories").update({ is_loaded: false }).eq("id", id); }
      }
    }
  }

  getRepoPath(repoId: string) {
    if (!validateId(repoId)) throw new Error("Invalid ID");
    return path.join(REPOS_DATA_DIR, `${repoId}.git`);
  }
}
export const repoManager = new RepoManager();
