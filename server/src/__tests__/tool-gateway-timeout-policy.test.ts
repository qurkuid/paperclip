import { describe, expect, it } from "vitest";
import { approvedExecutionTimeoutMs } from "../services/tool-gateway.js";

describe("approved tool execution timeout policy", () => {
  it("covers the supported five-minute remote video processing window", () => {
    expect(approvedExecutionTimeoutMs()).toBe(360_000);
  });
});
