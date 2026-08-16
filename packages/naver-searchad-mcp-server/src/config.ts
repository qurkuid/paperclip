import { readFileSync } from "node:fs";
import { z } from "zod";

const configSchema = z.object({
  accessLicense: z.string().trim().min(1),
  secretKey: z.string().trim().min(1),
  customerId: z.string().trim().min(1),
  baseUrl: z.literal("https://api.searchad.naver.com")
    .default("https://api.searchad.naver.com"),
  timeoutMs: z.number().int().positive().max(60_000).default(20_000),
});

export type NaverSearchAdConfig = z.infer<typeof configSchema> & {
  secretRedactions: string[];
};

export interface NaverSearchAdConfigInput {
  accessLicense?: string | null;
  secretKey?: string | null;
  customerId?: string | null;
  timeoutMs?: number | null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function readNaverCredentialsFile(path: string): Partial<NodeJS.ProcessEnv> {
  const selected: Partial<NodeJS.ProcessEnv> = {};
  const allowed = new Set([
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
  ]);
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/g)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!allowed.has(key)) continue;
    selected[key] = unquote(line.slice(separator + 1));
  }
  return selected;
}

export function createNaverSearchAdConfig(input: NaverSearchAdConfigInput): NaverSearchAdConfig {
  const parsed = configSchema.parse({
    accessLicense: input.accessLicense,
    secretKey: input.secretKey,
    customerId: input.customerId,
    timeoutMs: input.timeoutMs ?? undefined,
  });
  return {
    ...parsed,
    secretRedactions: [parsed.accessLicense, parsed.secretKey, parsed.customerId]
      .filter((value) => value.length >= 4),
  };
}

export function readConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NaverSearchAdConfig {
  const credentialsPath = env.NAVER_SEARCH_AD_CREDENTIALS_PATH?.trim();
  const fileEnv = credentialsPath ? readNaverCredentialsFile(credentialsPath) : {};
  return createNaverSearchAdConfig({
    accessLicense: env.NAVER_SEARCH_AD_ACCESS_LICENSE ?? fileEnv.NAVER_SEARCH_AD_ACCESS_LICENSE,
    secretKey: env.NAVER_SEARCH_AD_SECRET_KEY ?? fileEnv.NAVER_SEARCH_AD_SECRET_KEY,
    customerId: env.NAVER_SEARCH_AD_CUSTOMER_ID ?? fileEnv.NAVER_SEARCH_AD_CUSTOMER_ID,
    timeoutMs: env.NAVER_SEARCH_AD_TIMEOUT_MS
      ? Number.parseInt(env.NAVER_SEARCH_AD_TIMEOUT_MS, 10)
      : undefined,
  });
}
