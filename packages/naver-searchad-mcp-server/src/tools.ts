import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type {
  NaverAdGroup,
  NaverCampaign,
  NaverKeyword,
  NaverSearchAdClient,
  NaverStats,
} from "./naver-client.js";

export interface NaverSearchAdToolDefinition {
  name: string;
  description: string;
  schema: z.AnyZodObject;
  annotations: ToolAnnotations;
  execute: (input: Record<string, unknown>) => Promise<CallToolResult>;
}

interface ToolOptions {
  client: NaverSearchAdClient;
  secretRedactions?: string[];
}

const idSchema = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateRangeShape = {
  since: isoDateSchema.describe("Start date in YYYY-MM-DD; maximum inclusive range is 90 days."),
  until: isoDateSchema.describe("End date in YYYY-MM-DD; today or earlier."),
};

const campaignListSchema = z.object({
  activeOnly: z.boolean().optional().default(false),
});

const campaignPerformanceSchema = z.object({
  ...dateRangeShape,
  campaignIds: z.array(idSchema).max(100).optional(),
  activeOnly: z.boolean().optional().default(false),
});

const adGroupListSchema = z.object({
  campaignId: idSchema,
  activeOnly: z.boolean().optional().default(false),
});

const keywordPerformanceSchema = z.object({
  ...dateRangeShape,
  adGroupId: idSchema,
  limit: z.number().int().positive().max(100).optional().default(50),
});

function annotations(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
}

function textResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function redact(message: string, secrets: string[]): string {
  return secrets.reduce(
    (current, secret) => secret.length >= 4 ? current.split(secret).join("[REDACTED]") : current,
    message,
  );
}

function errorResult(error: unknown, secrets: string[]): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: redact(message, secrets) }],
  };
}

function isActive(row: { status?: string; userLock?: boolean }): boolean {
  return row.status === "ELIGIBLE" && row.userLock !== true;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_REPORTING_DAYS = 90;

function parseIsoDate(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year!, month! - 1, day!);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month! - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${value} must be a valid calendar date`);
  }
  return timestamp;
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function assertDateRange(since: string, until: string) {
  const sinceMs = parseIsoDate(since);
  const untilMs = parseIsoDate(until);
  if (sinceMs > untilMs) throw new Error("since must be on or before until");
  if (until > todayInSeoul()) throw new Error("until must not be in the future");
  const inclusiveDays = Math.floor((untilMs - sinceMs) / DAY_MS) + 1;
  if (inclusiveDays > MAX_REPORTING_DAYS) {
    throw new Error(`reporting range must be ${MAX_REPORTING_DAYS} days or fewer`);
  }
}

function derived(stats: NaverStats) {
  return {
    impressions: stats.impCnt,
    clicks: stats.clkCnt,
    spendKrw: stats.salesAmt,
    conversions: stats.ccnt,
    ctrPct: stats.impCnt > 0 ? Number(((stats.clkCnt / stats.impCnt) * 100).toFixed(2)) : 0,
    cpcKrw: stats.clkCnt > 0 ? Math.round(stats.salesAmt / stats.clkCnt) : 0,
    conversionRatePct: stats.clkCnt > 0 ? Number(((stats.ccnt / stats.clkCnt) * 100).toFixed(2)) : 0,
    costPerConversionKrw: stats.ccnt > 0 ? Math.round(stats.salesAmt / stats.ccnt) : null,
    averageRank: stats.avgRnk,
  };
}

function campaignSummary(campaign: NaverCampaign) {
  return {
    campaignId: campaign.nccCampaignId,
    name: campaign.name ?? null,
    type: campaign.campaignTp ?? null,
    status: campaign.status ?? null,
    statusReason: campaign.statusReason ?? null,
    userLocked: campaign.userLock ?? false,
    dailyBudgetKrw: campaign.dailyBudget ?? null,
    usesDailyBudget: campaign.useDailyBudget ?? null,
  };
}

function adGroupSummary(adGroup: NaverAdGroup) {
  return {
    adGroupId: adGroup.nccAdgroupId,
    campaignId: adGroup.nccCampaignId ?? null,
    name: adGroup.name ?? null,
    status: adGroup.status ?? null,
    statusReason: adGroup.statusReason ?? null,
    userLocked: adGroup.userLock ?? false,
    bidAmountKrw: adGroup.bidAmt ?? null,
  };
}

function keywordSummary(keyword: NaverKeyword, stats: NaverStats) {
  return {
    keywordId: keyword.nccKeywordId,
    keyword: keyword.keyword ?? null,
    status: keyword.status ?? null,
    statusReason: keyword.statusReason ?? null,
    userLocked: keyword.userLock ?? false,
    bidAmountKrw: keyword.bidAmt ?? null,
    ...derived(stats),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return output;
}

function makeTool<TSchema extends z.ZodRawShape>(
  options: ToolOptions,
  name: string,
  description: string,
  schema: z.ZodObject<TSchema>,
  execute: (input: z.infer<typeof schema>) => Promise<unknown>,
): NaverSearchAdToolDefinition {
  return {
    name,
    description,
    schema,
    annotations: annotations(description),
    execute: async (input) => {
      try {
        return textResult(await execute(schema.parse(input)));
      } catch (error) {
        return errorResult(error, options.secretRedactions ?? []);
      }
    },
  };
}

export function createToolDefinitions(options: ToolOptions): NaverSearchAdToolDefinition[] {
  return [
    makeTool(
      options,
      "naver_searchad_list_campaigns",
      "List Naver Search Ads campaigns and their current delivery and budget status. Read-only.",
      campaignListSchema,
      async ({ activeOnly }) => {
        const campaigns = await options.client.listCampaigns();
        const filtered = activeOnly ? campaigns.filter(isActive) : campaigns;
        return {
          campaignCount: filtered.length,
          activeOnly,
          campaigns: filtered.map(campaignSummary),
        };
      },
    ),
    makeTool(
      options,
      "naver_searchad_campaign_performance",
      "Analyze Naver Search Ads campaign performance for a date range with impressions, clicks, spend, conversions, CTR, CPC, CVR, and CPA. Read-only.",
      campaignPerformanceSchema,
      async ({ since, until, campaignIds, activeOnly }) => {
        assertDateRange(since, until);
        const requestedIds = new Set(campaignIds ?? []);
        const campaigns = (await options.client.listCampaigns()).filter((campaign) => (
          (requestedIds.size === 0 || requestedIds.has(campaign.nccCampaignId))
          && (!activeOnly || isActive(campaign))
        ));
        const rows = await mapWithConcurrency(campaigns, 5, async (campaign) => ({
          ...campaignSummary(campaign),
          ...derived(await options.client.getStats(campaign.nccCampaignId, since, until)),
        }));
        rows.sort((left, right) => right.spendKrw - left.spendKrw);
        const totals = rows.reduce((sum, row) => ({
          impressions: sum.impressions + row.impressions,
          clicks: sum.clicks + row.clicks,
          spendKrw: sum.spendKrw + row.spendKrw,
          conversions: sum.conversions + row.conversions,
        }), { impressions: 0, clicks: 0, spendKrw: 0, conversions: 0 });
        return {
          since,
          until,
          campaignCount: rows.length,
          totals: {
            ...totals,
            ctrPct: totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
            cpcKrw: totals.clicks > 0 ? Math.round(totals.spendKrw / totals.clicks) : 0,
            conversionRatePct: totals.clicks > 0
              ? Number(((totals.conversions / totals.clicks) * 100).toFixed(2))
              : 0,
            costPerConversionKrw: totals.conversions > 0
              ? Math.round(totals.spendKrw / totals.conversions)
              : null,
          },
          campaigns: rows,
          note: until === new Date().toISOString().slice(0, 10)
            ? "Current-day Naver statistics may still be provisional."
            : undefined,
        };
      },
    ),
    makeTool(
      options,
      "naver_searchad_list_adgroups",
      "List Naver Search Ads ad groups for one campaign, including delivery and bid status. Read-only.",
      adGroupListSchema,
      async ({ campaignId, activeOnly }) => {
        const adGroups = await options.client.listAdGroups(campaignId);
        const filtered = activeOnly ? adGroups.filter(isActive) : adGroups;
        return {
          campaignId,
          adGroupCount: filtered.length,
          activeOnly,
          adGroups: filtered.map(adGroupSummary),
        };
      },
    ),
    makeTool(
      options,
      "naver_searchad_keyword_performance",
      "Analyze a bounded API-order sample of Naver Search Ads keywords in one ad group, sorted by spend within the sample, with impressions, clicks, conversions, CTR, CPC, CVR, and CPA. Read-only and limited to 100 keywords per call.",
      keywordPerformanceSchema,
      async ({ adGroupId, since, until, limit }) => {
        assertDateRange(since, until);
        const allKeywords = await options.client.listKeywords(adGroupId);
        const scanned = allKeywords.slice(0, limit);
        const rows = await mapWithConcurrency(scanned, 5, async (keyword) => (
          keywordSummary(keyword, await options.client.getStats(keyword.nccKeywordId, since, until))
        ));
        rows.sort((left, right) => right.spendKrw - left.spendKrw);
        return {
          adGroupId,
          since,
          until,
          totalKeywordCount: allKeywords.length,
          scannedKeywordCount: scanned.length,
          truncated: allKeywords.length > scanned.length,
          rankingScope: `first ${scanned.length} keywords in Naver API order; sorted by spend within this sample`,
          keywords: rows,
        };
      },
    ),
  ];
}
