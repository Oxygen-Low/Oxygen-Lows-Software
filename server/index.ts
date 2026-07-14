import Zen from "@aikidosec/firewall";
import ws from "ws";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { oauthAdminRouter } from "./routes/oauthAdmin";
import {
  handleProxyAiRequest,
  handleGetLocalProviders,
  handleGetChatStyles,
} from "./routes/ai";
import { reposRouter } from "./routes/repos";
import { gitRouter } from "./routes/git";
import { apiLimiter } from "./lib/limiter";
import { aikidoUserMiddleware } from "./lib/aikido";

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
            process.env.VITE_SUPABASE_URL!,
            process.env.VITE_SUPABASE_URL!.replace("http", "ws"),
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
            process.env.VITE_SUPABASE_URL!,
            "https://app.aikido.dev",
          ],
          "media-src": ["'self'", process.env.VITE_SUPABASE_URL!, "blob:"],
          "script-src": ["'self'", "blob:"],
          "worker-src": ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  // Aikido Zen Middleware
  app.use(aikidoUserMiddleware);
  Zen.addExpressMiddleware(app);

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
  app.use("/api/oauth-admin", oauthAdminRouter);

  return app;
}
