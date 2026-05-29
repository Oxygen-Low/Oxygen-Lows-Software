import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { storageRouter } from "./routes/storage";

export function createServer() {
  const app = express();

  // Middleware
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: { policy: "require-corp" },
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "connect-src": ["'self'", "https://vqmukrmpgvavscsyefqd.supabase.co", "https://api.pwnedpasswords.com", "https://unpkg.com"],
          "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "https://vqmukrmpgvavscsyefqd.supabase.co", "*"],
          "media-src": ["'self'", "https://vqmukrmpgvavscsyefqd.supabase.co", "blob:"],
          "script-src": ["'self'", "https://unpkg.com", "'unsafe-eval'", "'unsafe-inline'"],
          "worker-src": ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Storage routes
  app.use("/api/storage", storageRouter);

  return app;
}
