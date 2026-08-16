import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "../src/contracts/index.js",
        replacement: new URL("./src/contracts/index.ts", import.meta.url).pathname,
      },
    ],
  },
  test: {
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    environment: "node",
  },
});
