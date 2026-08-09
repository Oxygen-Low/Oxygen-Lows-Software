import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
    outDir: "dist/spa",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router-dom")
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
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  plugins: [react(), tailwindcss(), expressPlugin()],
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
        if (!url.startsWith("/api/") && !url.startsWith("/health")) {
          return next();
        }
        try {
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost";
          const fullUrl = `${protocol}://${host}${url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
          }
          const method = req.method || "GET";
          const hasBody = method !== "GET" && method !== "HEAD";
          let body: string | undefined;
          if (hasBody) {
            body = await new Promise<string>((resolve) => {
              let data = "";
              req.on("data", (chunk: any) => (data += chunk));
              req.on("end", () => resolve(data));
            });
          }
          const honoReq = new Request(fullUrl, {
            method,
            headers,
            body: hasBody ? body : undefined,
          });
          const honoRes = await app.fetch(honoReq);
          res.statusCode = honoRes.status;
          honoRes.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          const arrayBuf = await honoRes.arrayBuffer();
          res.end(Buffer.from(arrayBuf));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
