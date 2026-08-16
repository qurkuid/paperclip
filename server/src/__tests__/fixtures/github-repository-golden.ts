export const GOLDEN_REPOSITORY_URL = "https://github.com/eisenjimmy/autoTHREADS";
export const GOLDEN_REPOSITORY_COMMIT = "3dd347e506040fbf614cd5af0dd739cbc77b8b2b";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Metadata-only pinned input for the repository-adoption workflow golden case. */
export async function fetchGoldenRepository(url: string) {
  if (url.endsWith("/repos/eisenjimmy/autoTHREADS")) return response({ default_branch: "main", size: 5_583, license: { spdx_id: "MIT" } });
  if (url.includes("/commits/main")) return response({ sha: GOLDEN_REPOSITORY_COMMIT });
  if (url.includes(`/contents?ref=${GOLDEN_REPOSITORY_COMMIT}`)) return response([
    { name: "package.json", path: "package.json" },
    { name: ".env.example", path: ".env.example" },
  ]);
  if (url.includes(`/git/trees/${GOLDEN_REPOSITORY_COMMIT}?recursive=1`)) return response({ tree: [
    { path: "package-lock.json" },
    { path: "src/App.tsx" },
    { path: "electron/main.ts" },
  ] });
  if (url.includes(`/contents/package.json?ref=${GOLDEN_REPOSITORY_COMMIT}`)) return response({ name: "package.json", content: Buffer.from(JSON.stringify({ dependencies: { react: "1", "react-dom": "1", zustand: "1" }, devDependencies: { electron: "1", "electron-builder": "1", typescript: "1", vite: "1" } })).toString("base64") });
  if (url.includes(`/contents/.env.example?ref=${GOLDEN_REPOSITORY_COMMIT}`)) return response({ name: ".env.example", content: Buffer.from("GITHUB_TOKEN=golden-secret-value\nPUBLIC_FLAG=yes").toString("base64") });
  throw new Error(`unexpected URL ${url}`);
}
