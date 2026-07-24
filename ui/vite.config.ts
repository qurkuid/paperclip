import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig(({ mode }) => {
  const base = normalizeBasePath(process.env.PAPERCLIP_UI_BASE_PATH);
  const apiProxyPath = `${base === "/" ? "" : base.slice(0, -1)}/api`;

  return {
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
      proxy: {
        [apiProxyPath]: {
          target: "http://localhost:3100",
          ws: true,
          ...(base === "/" ? {} : { rewrite: (requestPath: string) => requestPath.slice(base.length - 1) }),
        },
      },
    },
  };
});
