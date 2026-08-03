import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { demoRouter } from "./routes/demo.ts";
import { proxyRouter } from "./routes/proxy.ts";
import { oauthAdminRouter } from "./routes/oauthAdmin.ts";
import { adminSupportRouter } from "./routes/adminSupport.ts";
import { reposRouter } from "./routes/repos.ts";
import { aiRouter } from "./routes/ai.ts";

const app = new Hono();

app.use(secureHeaders());
app.use(cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-github-token"]
}));

app.get("/health", (c) => c.text("OK"));
app.get("/api/ping", (c) => c.json({ message: "ping" }));

app.route("/api/demo", demoRouter);
app.route("/api/proxy", proxyRouter);
app.route("/api/oauth-admin", oauthAdminRouter);
app.route("/api/admin/support", adminSupportRouter);
app.route("/api/repos", reposRouter);
app.route("/api/ai", aiRouter);

export default app;
