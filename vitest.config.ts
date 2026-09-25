import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./client"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
  test: {
    testTimeout: 15000,
    css: false,
    pool: "threads",
    isolate: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.agents/**",
      "**/.git/**",
      "**/Android/**",
      "**/uploads/**",
      "**/OS/**",
    ],
  },
});
