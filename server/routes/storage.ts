import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ADMIN_USER_IDS = new Set(["3cb76293-8c6c-49b9-b431-1ff5fce471ee"]);

export const storageRouter = new Hono();
const STORAGE_DIR = path.join(process.cwd(), "uploads");
const MAX_QUOTA = 300 * 1024 * 1024; // 300 MB

const authMiddleware = async (c: any, next: any) => {
  let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) {
    token = c.req.query("token");
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("token", token);
  await next();
};

const getFolderSize = (folderPath: string): number => {
  let size = 0;
  if (!fs.existsSync(folderPath)) return 0;
  const files = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(folderPath, file.name);
    if (file.isDirectory()) {
      size += getFolderSize(filePath);
    } else {
      size += fs.statSync(filePath).size;
    }
  }
  return size;
};

const getUserTotalSize = (userId: string) => {
  const sizeStorage = getFolderSize(path.join(STORAGE_DIR, "Storage", userId));
  const sizePublic = getFolderSize(path.join(STORAGE_DIR, "public-assets", userId));
  return sizeStorage + sizePublic;
};

storageRouter.post("/upload/:bucket/*", authMiddleware, async (c) => {
  const bucket = c.req.param("bucket");
  let filePath = c.req.param("*") || c.req.param("path") || (c.req.path.split(`/upload/${bucket}/`)[1]);
  if (filePath) {
    filePath = decodeURIComponent(filePath);
    if (filePath.startsWith("/")) filePath = filePath.substring(1);
    if (filePath.includes("..")) return c.json({ error: "Invalid path" }, 400);
  }
  const user = c.get("user" as any) as any;
  console.log(`[UPLOAD DEBUG] bucket=${bucket} param*=${c.req.param("*")} filePath=${filePath} user.id=${user.id}`);

  if (!filePath.startsWith(user.id + "/") && !ADMIN_USER_IDS.has(user.id)) {
     return c.json({ error: "Cannot upload to other user's directory" }, 400);
  }

  const body = await c.req.parseBody();
  const file = body["file"] as any;
  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  const newFileSize = file.size;
  const currentSize = getUserTotalSize(user.id);
  
  if (currentSize + newFileSize > MAX_QUOTA) {
    return c.json({ error: "Quota exceeded. Maximum 300MB allowed per user." }, 400);
  }

  const targetDir = path.join(STORAGE_DIR, bucket, path.dirname(filePath));
  fs.mkdirSync(targetDir, { recursive: true });
  
  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(path.join(STORAGE_DIR, bucket, filePath), Buffer.from(arrayBuffer));
  
  return c.json({ data: { path: filePath }, error: null });
});

storageRouter.post("/list/:bucket", authMiddleware, async (c) => {
  const bucket = c.req.param("bucket");
  const body = await c.req.json().catch(() => ({}));
  const prefixPath = body.path || "";
  
  const targetDir = path.join(STORAGE_DIR, bucket, prefixPath);
  if (!fs.existsSync(targetDir)) {
    return c.json({ data: [], error: null });
  }
  
  try {
      const files = fs.readdirSync(targetDir, { withFileTypes: true });
      const result = files.map(f => {
        const fullPath = path.join(targetDir, f.name);
        const stats = fs.statSync(fullPath);
        return {
          name: f.name,
          metadata: { size: stats.size, mimetype: "application/octet-stream" },
          created_at: stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString(),
        };
      });
      return c.json({ data: result, error: null });
  } catch (err: any) {
      return c.json({ data: [], error: err.message });
  }
});

storageRouter.delete("/remove/:bucket", authMiddleware, async (c) => {
  const bucket = c.req.param("bucket");
  const body = await c.req.json().catch(() => ({}));
  const paths = body.paths || [];
  const user = c.get("user" as any) as any;
  
  for (const p of paths) {
      if (!p.startsWith(user.id + "/") && !ADMIN_USER_IDS.has(user.id)) {
         continue; 
      }
      const fullPath = path.join(STORAGE_DIR, bucket, p);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
  }
  return c.json({ data: paths, error: null });
});

storageRouter.get("/download/:bucket/*", authMiddleware, async (c) => {
  const bucket = c.req.param("bucket");
  let filePath = c.req.param("*") || (c.req.path.split(`/download/${bucket}/`)[1]);
  if (filePath) {
    filePath = decodeURIComponent(filePath);
    if (filePath.startsWith("/")) filePath = filePath.substring(1);
    if (filePath.includes("..")) return c.json({ error: "Invalid path" }, 400);
  }
  const fullPath = path.join(STORAGE_DIR, bucket, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return c.text("Not found", 404);
  }
  
  const buffer = fs.readFileSync(fullPath);
  return c.body(buffer, 200, {
      "Content-Type": "application/octet-stream",
  });
});

storageRouter.get("/public/:bucket/*", async (c) => {
  const bucket = c.req.param("bucket");
  let filePath = c.req.param("*") || (c.req.path.split(`/public/${bucket}/`)[1]);
  if (filePath) {
    filePath = decodeURIComponent(filePath);
    if (filePath.startsWith("/")) filePath = filePath.substring(1);
    if (filePath.includes("..")) return c.json({ error: "Invalid path" }, 400);
  }
  const fullPath = path.join(STORAGE_DIR, bucket, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return c.text("Not found", 404);
  }
  
  const buffer = fs.readFileSync(fullPath);
  let mimeType = "application/octet-stream";
  if (filePath.match(/\.(png|jpe?g|gif|webp)$/i)) {
    mimeType = "image/" + filePath.split('.').pop()?.toLowerCase();
    if (mimeType === "image/jpg") mimeType = "image/jpeg";
  } else if (filePath.match(/\.(mp3|wav|ogg)$/i)) {
    mimeType = "audio/" + filePath.split('.').pop()?.toLowerCase();
    if (mimeType === "audio/mp3") mimeType = "audio/mpeg";
  }

  return c.body(buffer, 200, {
      "Content-Type": mimeType,
  });
});

storageRouter.post("/signed-urls/:bucket", authMiddleware, async (c) => {
  const bucket = c.req.param("bucket");
  const body = await c.req.json().catch(() => ({}));
  const paths = body.paths || [];
  const token = c.get("token" as any);
  
  const result = paths.map((p: string) => ({
      error: null,
      signedUrl: `/api/storage/download/${bucket}/${p}?token=${token}`
  }));
  
  return c.json({ data: result, error: null });
});
