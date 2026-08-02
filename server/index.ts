import Zen from "@aikidosec/firewall";
import ws from "ws";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";
import { handleDemo } from "./routes/demo.ts";
import { oauthAdminRouter } from "./routes/oauthAdmin.ts";
import {
  handleProxyAiRequest,
  handleGetLocalProviders,
  handleGetHordeStatus,
} from "./routes/ai.ts";
import { reposRouter } from "./routes/repos.ts";
import { gitRouter } from "./routes/git.ts";
import { proxyRouter } from "./routes/proxy.ts";
import { apiLimiter } from "./lib/limiter.ts";
import { aikidoUserMiddleware } from "./lib/aikido.ts";
import { auditMiddleware } from "./lib/auditLogger.ts";

if (typeof global !== "undefined" && !global.WebSocket) {
  (global as any).WebSocket = ws;
}

export function createServer() {
  const app = express();

  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "connect-src": [
            "'self'",
            "https://vqmukrmpgvavscsyefqd.supabase.co",
            "wss://vqmukrmpgvavscsyefqd.supabase.co",
            "https://api.pwnedpasswords.com",
            "https://api.github.com",
            "https://api.openai.com",
            "https://api.anthropic.com",
            "https://generativelanguage.googleapis.com",
            "https://openrouter.ai",
            "https://api.x.ai",
          ],
          "style-src": [
            "'self'",
            "https://fonts.googleapis.com",
            "'unsafe-inline'",
          ],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": [
            "'self'",
            "data:",
            "https://vqmukrmpgvavscsyefqd.supabase.co",
            "https://app.aikido.dev",
          ],
          "media-src": [
            "'self'",
            "https://vqmukrmpgvavscsyefqd.supabase.co",
            "blob:",
          ],
          "script-src":
            process.env.NODE_ENV === "production"
              ? ["'self'", "blob:", "https://keepandroidopen.org"]
              : [
                  "'self'",
                  "blob:",
                  "https://keepandroidopen.org",
                  "'unsafe-inline'",
                  "'unsafe-eval'",
                ],
          "worker-src": ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  app.use(
    session({
      secret:
        process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
      resave: false,
      saveUninitialized: false,
      name: "sessionId",
      genid: () => crypto.randomUUID(),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      },
    }),
  );

  // Aikido Zen Middleware
  app.use(aikidoUserMiddleware);
  app.use(auditMiddleware);
  Zen.addExpressMiddleware(app);

  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/ai/proxy", apiLimiter, handleProxyAiRequest);

  app.get("/api/ai/local-providers", apiLimiter, handleGetLocalProviders);
  app.get("/api/ai/horde-status", apiLimiter, handleGetHordeStatus);

  app.use("/api/repos", reposRouter);
  app.use("/api/git", gitRouter);
  app.use("/api/oauth-admin", oauthAdminRouter);
  app.use("/api/proxy", proxyRouter);

  return app;
}
