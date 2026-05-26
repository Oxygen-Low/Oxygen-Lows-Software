import { RequestHandler, Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { LocalFilesResponse, UploadResponse } from "../../shared/api";
import { createClient } from "@supabase/supabase-js";

const UPLOADS_DIR = path.resolve("uploads");

// Authentication middleware to verify Supabase JWT
const authenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "No authorization header" });
  }

  const token = authHeader.split(" ")[1];
  const supabase = createClient(
    process.env.SUPABASE_URL || "https://vqmukrmpgvavscsyefqd.supabase.co",
    process.env.SUPABASE_ANON_KEY || "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q"
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  (req as any).user = user;
  next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = (req as any).user.id;
    const userDir = path.join(UPLOADS_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage });

export const storageRouter = Router();

// Upload a file locally
storageRouter.post("/upload", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const response: UploadResponse = {
    message: "File uploaded successfully",
    file: {
      name: req.file.filename,
      size: req.file.size,
      type: req.file.mimetype,
      createdAt: new Date().toISOString(),
      url: `/api/storage/files/${req.file.filename}`,
    },
  };
  res.status(200).json(response);
});

// List local files
storageRouter.get("/files", authenticate, (req, res) => {
  const userId = (req as any).user.id;
  const userDir = path.join(UPLOADS_DIR, userId);

  if (!fs.existsSync(userDir)) {
    return res.json({ files: [] });
  }

  const files = fs.readdirSync(userDir).map((filename) => {
    const filePath = path.join(userDir, filename);
    const stats = fs.statSync(filePath);
    return {
      name: filename,
      size: stats.size,
      type: "application/octet-stream", // Simple approach, can be improved with 'mime-types' package
      createdAt: stats.birthtime.toISOString(),
      url: `/api/storage/files/${filename}`,
    };
  });

  const response: LocalFilesResponse = { files };
  res.json(response);
});

// Serve/Download a local file
storageRouter.get("/files/:filename", authenticate, (req, res) => {
  const userId = (req as any).user.id;
  const { filename } = req.params;
  const filePath = path.join(UPLOADS_DIR, userId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  res.sendFile(filePath);
});

// Delete a local file
storageRouter.delete("/files/:filename", authenticate, (req, res) => {
  const userId = (req as any).user.id;
  const { filename } = req.params;
  const filePath = path.join(UPLOADS_DIR, userId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  fs.unlinkSync(filePath);
  res.json({ message: "File deleted successfully" });
});
