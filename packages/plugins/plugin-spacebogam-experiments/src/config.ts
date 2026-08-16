import type { EnvSecretRefBinding, PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";

const secretRefSchema = z.object({
  type: z.literal("secret_ref"),
  secretId: z.string().min(1),
  version: z.union([z.number().int().positive(), z.literal("latest")]).optional(),
  projectionClass: z.enum(["unclassified", "class_3_static_lease"]).optional(),
  projectionAllowlistKey: z.string().nullable().optional(),
}).strict();

const companyConfigSchema = z.object({
  leadHashSecret: secretRefSchema,
  linkedProjectId: z.string().uuid().optional(),
  legacyIssueId: z.string().uuid().optional(),
}).passthrough();

export type ExperimentPluginConfig = {
  readonly leadHashSecret: EnvSecretRefBinding;
  readonly linkedProjectId: string | null;
  readonly legacyIssueId: string | null;
};

export async function readExperimentPluginConfig(
  ctx: PluginContext,
  companyId: string,
): Promise<ExperimentPluginConfig | null> {
  const parsed = companyConfigSchema.safeParse(await ctx.config.get(companyId));
  if (!parsed.success) return null;
  return {
    leadHashSecret: parsed.data.leadHashSecret,
    linkedProjectId: parsed.data.linkedProjectId ?? null,
    legacyIssueId: parsed.data.legacyIssueId ?? null,
  };
}

export async function isConfiguredLegacyIssue(
  ctx: PluginContext,
  companyId: string,
  issueId: string,
): Promise<boolean> {
  const config = await readExperimentPluginConfig(ctx, companyId);
  if (config?.legacyIssueId !== issueId) return false;
  return await ctx.issues.get(issueId, companyId) !== null;
}
