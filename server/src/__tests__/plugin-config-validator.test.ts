import { describe, expect, it } from "vitest";
import { validateInstanceConfig } from "../services/plugin-config-validator.ts";

const schema = {
  type: "object",
  properties: {
    leadHashSecret: {
      type: "string",
      format: "secret-ref",
      title: "Lead hash secret",
    },
  },
  required: ["leadHashSecret"],
  additionalProperties: false,
};

describe("validateInstanceConfig", () => {
  it("accepts the structured secret binding rendered by JsonSchemaForm", () => {
    expect(validateInstanceConfig({
      leadHashSecret: {
        type: "secret_ref",
        secretId: "11111111-1111-4111-8111-111111111111",
        version: "latest",
      },
    }, schema)).toEqual({ valid: true });
  });

  it("rejects raw and malformed values for secret-ref fields", () => {
    expect(validateInstanceConfig({
      leadHashSecret: "11111111-1111-4111-8111-111111111111",
    }, schema).valid).toBe(false);
    expect(validateInstanceConfig({
      leadHashSecret: {
        type: "secret_ref",
        secretId: "not-a-secret-id",
      },
    }, schema).valid).toBe(false);
  });
});
