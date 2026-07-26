import { describe, expect, it } from "vitest";
import { z } from "zod";

import { normalizeError } from "../src/service/errors.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

describe("Spacebogam service error normalization", () => {
  it.each([
    ["idempotency_conflict", "idempotency_conflict"],
    ["invalid_version", "invalid_version"],
    ["variant_conflict", "variant_conflict"],
    ["running_experiment_exists", "invalid_status_transition"],
    ["issue_company_mismatch", "company_isolation_violation"],
    ["unsafe_strategy_content", "pii_payload_rejected"],
    ["issue_document_invalid", "unknown_action"],
  ] as const)("normalizes %s failures", (source, expected) => {
    expect(normalizeError({ code: source, message: source }, REQUEST_ID)).toMatchObject({
      ok: false,
      code: expected,
      requestId: REQUEST_ID,
    });
  });

  it("normalizes an Error carrying a repository code", () => {
    expect(normalizeError(new Error("invalid_version"), REQUEST_ID)).toMatchObject({
      ok: false,
      code: "invalid_version",
    });
  });

  it("keeps the first validation path in board-facing errors", () => {
    const parsed = z.object({
      title: z.string().min(1),
    }).safeParse({ title: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(normalizeError(parsed.error, REQUEST_ID)).toMatchObject({
      code: "unknown_action",
      message: expect.stringContaining("title:"),
    });
  });
});
