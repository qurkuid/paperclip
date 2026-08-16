import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";
import { createApiProxy } from "./src/lib/vite-api-proxy";

// Serving under a prefix (the Mac mini runs the app at https://intm.kr/af)
// needs vite's `base` set at build time so asset URLs carry the prefix.
function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

const base = normalizeBasePath(process.env.PAPERCLIP_UI_BASE_PATH);
const apiProxy = createApiProxy("http://localhost:3100", base);

export default defineConfig(({ mode }) => ({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    minify: "esbuild",
  },
  esbuild:
    mode === "production"
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/dist/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: apiProxy,
  },
  preview: {
    port: 3101,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
}));
