/// <reference types="vitest" />
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  test: {
    testTimeout: 15000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.agents/**",
      "**/.git/**",
    ],
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    host: "::",
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: ["./client", "./shared", "index.html"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    target: "es2022",
    cssMinify: "lightningcss",
    outDir: "dist/spa",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id,
            )
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("node_modules/recharts")) {
            return "vendor-charts";
          }
          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules/@react-three")
          ) {
            return "vendor-three";
          }
          if (
            id.includes("node_modules/leaflet") ||
            id.includes("node_modules/react-leaflet")
          ) {
            return "vendor-leaflet";
          }
          if (
            id.includes("node_modules/chess.js") ||
            id.includes("node_modules/react-chessboard")
          ) {
            return "vendor-chess";
          }
          if (
            id.includes("node_modules/diff2html") ||
            id.includes("node_modules/diff")
          ) {
            return "vendor-diff";
          }
          if (
            id.includes("node_modules/react-syntax-highlighter") ||
            id.includes("node_modules/refractor") ||
            id.includes("node_modules/prismjs")
          ) {
            return "vendor-syntax";
          }
          if (
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/micromark") ||
            id.includes("node_modules/mdast-util-") ||
            id.includes("node_modules/unist-util-") ||
            id.includes("node_modules/remark-gfm")
          ) {
            return "vendor-markdown";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  // Do not mount the dev API proxy plugin during tests, as initializing the server
  // and its middleware hooks on Vitest's internal Vite dev servers prevents them from exiting.
  plugins: [
    react(),
    tailwindcss(),
    ...(mode !== "test" && !process.env.VITEST ? [expressPlugin()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./client"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "api-proxy-plugin",
    apply: "serve",
    async configureServer(server) {
      const { createServer } = await import("./server/index.ts");
      const app = createServer();

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "/";
        const accept = req.headers.accept || "";
        const isMarkdown = accept.includes("text/markdown");

        if (
          !url.startsWith("/api/") &&
          !url.startsWith("/health") &&
          !url.startsWith("/.well-known/") &&
          !url.startsWith("/agent/") &&
          url !== "/auth.md" &&
          url !== "/llms.txt" &&
          url !== "/robots.txt" &&
          url !== "/sitemap.xml" &&
          !isMarkdown
        ) {
          return next();
        }
        try {
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost";
          const fullUrl = `${protocol}://${host}${url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value)
              headers.set(key, Array.isArray(value) ? value[0] : value);
          }
          const method = req.method || "GET";
          const hasBody = method !== "GET" && method !== "HEAD";
          let body: Uint8Array | undefined;
          if (hasBody) {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              req.on("data", (chunk: Buffer) =>
                chunks.push(
                  Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                ),
              );
              req.on("end", () => resolve());
              req.on("error", (err) => reject(err));
            });
            body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
          }
          const honoReq = new Request(fullUrl, {
            method,
            headers,
            body: hasBody ? body : undefined,
            duplex: hasBody ? "half" : undefined,
          } as any);
          const honoRes = await app.fetch(honoReq);
          res.statusCode = honoRes.status;

          const contentType = honoRes.headers.get("content-type") || "";

          if (contentType.includes("text/event-stream") && honoRes.body) {
            // Stream SSE responses – never buffer them or the client will
            // receive nothing until the stream closes.
            honoRes.headers.forEach((value, key) => {
              const lk = key.toLowerCase();
              // Let Node.js manage these automatically for SSE
              if (lk === "content-length" || lk === "transfer-encoding") return;
              res.setHeader(key, value);
            });
            const reader = honoRes.body.getReader();
            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (!res.writableEnded) res.write(Buffer.from(value));
                }
              } catch {
                // Connection closed by client
              } finally {
                if (!res.writableEnded) res.end();
              }
            };
            req.on("close", () => reader.cancel().catch(() => {}));
            pump();
          } else {
            honoRes.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            const arrayBuf = await honoRes.arrayBuffer();
            res.end(Buffer.from(arrayBuf));
          }

        } catch (err: any) {
          if (url.startsWith("/api/")) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: err?.message || "Internal Server Error",
              }),
            );
            return;
          }
          next(err);
        }
      });
    },
  };
}
