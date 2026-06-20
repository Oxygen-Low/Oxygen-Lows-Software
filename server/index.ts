import ws from "ws";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleProxyAiRequest, handleGetLocalProviders, handleGetChatStyles } from "./routes/ai";
import { reposRouter } from "./routes/repos";
import { gitRouter } from "./routes/git";
import { apiLimiter } from "./lib/limiter";

if (typeof global !== "undefined" && !global.WebSocket) {
  (global as any).WebSocket = ws;
}

/**
 * Creates and configures an Express application with security, CORS, and API route handlers.
 *
 * @returns The configured Express application.
 */
export function createServer() {
  const app = express();

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: { policy: "require-corp" },
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "connect-src": ["'self'", "https://vqmukrmpgvavscsyefqd.supabase.co", "https://api.pwnedpasswords.com", "https://unpkg.com", "https://api.openai.com", "https://api.anthropic.com", "https://generativelanguage.googleapis.com", "https://openrouter.ai", "https://api.x.ai"],
          "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "https://vqmukrmpgvavscsyefqd.supabase.co", "*"],
          "media-src": ["'self'", "https://vqmukrmpgvavscsyefqd.supabase.co", "blob:"],
          "script-src": ["'self'", "https://unpkg.com", "'unsafe-eval'", "'unsafe-inline'", "blob:"],
          "worker-src": ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/ai/proxy", apiLimiter, handleProxyAiRequest);
  app.get("/api/ai/local-providers", apiLimiter, handleGetLocalProviders);
  app.get("/api/ai/styles", apiLimiter, handleGetChatStyles);

  app.use("/api/repos", reposRouter);
  app.use("/api/git", gitRouter);

  return app;
}
