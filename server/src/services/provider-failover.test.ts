import { describe, expect, it } from "vitest";
import { withoutClaudeCredentials } from "./provider-failover.js";

describe("Claude quota provider failover", () => {
  it("preserves execution settings while removing Claude credentials", () => {
    expect(withoutClaudeCredentials({
      cwd: "/workspace",
      instructionsPath: "AGENTS.md",
      claudeApiKey: "secret",
      env: { ANTHROPIC_API_KEY: "secret", KEEP: "yes" },
    })).toEqual({ cwd: "/workspace", instructionsPath: "AGENTS.md", env: { KEEP: "yes" } });
  });
});
