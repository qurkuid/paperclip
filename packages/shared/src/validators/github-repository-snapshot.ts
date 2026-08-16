import { z } from "zod";

export const createGitHubRepositorySnapshotSchema = z.object({
  url: z.string().url().max(2_048),
}).strict().superRefine(({ url }, ctx) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.protocol !== "https:"
    || !["github.com", "www.github.com"].includes(parsed.hostname.toLowerCase())
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parts.length !== 2
    || !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part.replace(/\.git$/i, "")))
  ) {
    ctx.addIssue({ code: "custom", message: "A public GitHub repository URL is required", path: ["url"] });
  }
});

export type CreateGitHubRepositorySnapshot = z.infer<typeof createGitHubRepositorySnapshotSchema>;
