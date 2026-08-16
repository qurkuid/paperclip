import { describe, expect, it } from "vitest";
import { connectionHealthSweepAction } from "../services/tool-access.js";

describe("tool connection health sweep policy", () => {
  it("refreshes remote catalogs instead of discarding tools/list schema changes", () => {
    expect(connectionHealthSweepAction("mcp_remote")).toBe("refresh_catalog");
    expect(connectionHealthSweepAction("local_stdio")).toBe("health_check");
  });
});
