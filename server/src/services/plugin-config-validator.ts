/**
 * @fileoverview Validates plugin instance configuration against its JSON Schema.
 *
 * Uses Ajv to validate `configJson` values against the `instanceConfigSchema`
 * declared in a plugin's manifest. This ensures that invalid configuration is
 * rejected at the API boundary, not discovered later at worker startup.
 *
 * @module server/services/plugin-config-validator
 */

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { JsonSchema } from "@paperclipai/shared";

export interface ConfigValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

const SECRET_REF_VALUE_SCHEMA = {
  type: "object",
  properties: {
    type: { const: "secret_ref" },
    secretId: { type: "string", format: "uuid" },
    version: {
      anyOf: [
        { const: "latest" },
        { type: "integer", minimum: 1 },
      ],
    },
    projectionClass: {
      enum: ["unclassified", "class_3_static_lease"],
    },
    projectionAllowlistKey: {
      type: ["string", "null"],
      minLength: 1,
      maxLength: 160,
    },
  },
  required: ["type", "secretId"],
  additionalProperties: false,
} satisfies JsonSchema;

function normalizeSecretRefSchemas(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSecretRefSchemas);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const node = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, normalizeSecretRefSchemas(child)]),
  );
  if (node.format !== "secret-ref") {
    return normalized;
  }

  const { type: _type, format: _format, ...annotations } = normalized;
  return {
    ...annotations,
    ...SECRET_REF_VALUE_SCHEMA,
  };
}

/**
 * Validate a config object against a JSON Schema.
 *
 * @param configJson - The configuration values to validate.
 * @param schema - The JSON Schema from the plugin manifest's `instanceConfigSchema`.
 * @returns Validation result with structured field errors on failure.
 */
export function validateInstanceConfig(
  configJson: Record<string, unknown>,
  schema: JsonSchema,
): ConfigValidationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AjvCtor = (Ajv as any).default ?? Ajv;
  const ajv = new AjvCtor({ allErrors: true });
  // ajv-formats v3 default export is a FormatsPlugin object; call it as a plugin.
  const applyFormats = (addFormats as any).default ?? addFormats;
  applyFormats(ajv);
  const validate = ajv.compile(normalizeSecretRefSchemas(schema));
  const valid = validate(configJson);

  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors ?? []).map((err: ErrorObject) => ({
    field: err.instancePath || "/",
    message: err.message ?? "validation failed",
  }));

  return { valid: false, errors };
}
