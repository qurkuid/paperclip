import {
  spacebogamNaverSearchAdsSnapshotSchema,
  type SpacebogamNaverSearchAdsSnapshot,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import {
  createNaverSearchAdClient,
  readConfigFromEnv,
  type NaverCampaign,
  type NaverSearchAdClient,
  type NaverStats,
} from "@paperclipai/naver-searchad-mcp-server";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface SpacebogamNaverSearchAdsClient {
  fetchSnapshot(input: {
    companyId: string;
    rangeDays: 7 | 28 | 90;
    dataThrough: string | null;
  }): Promise<SpacebogamNaverSearchAdsSnapshot | null>;
}

export interface SpacebogamNaverSearchAdsClientConfig {
  credentialsPath?: string | null;
  paperclipCompanyId?: string | null;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => Date;
  clientFactory?: () => NaverSearchAdClient;
}

interface CacheEntry {
  expiresAt: number;
  snapshot: Promise<SpacebogamNaverSearchAdsSnapshot>;
}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function seoulDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function reportUntil(dataThrough: string | null, now: Date): string {
  const candidate = dataThrough?.slice(0, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? candidate
    : seoulDate(now);
}

function subtractDays(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return new Date(timestamp - days * DAY_MS).toISOString().slice(0, 10);
}

function isActive(campaign: NaverCampaign) {
  return campaign.status === "ELIGIBLE" && campaign.userLock !== true;
}

function metrics(stats: NaverStats) {
  return {
    impressions: stats.impCnt,
    clicks: stats.clkCnt,
    spendKrw: stats.salesAmt,
    conversions: stats.ccnt,
    ctr: stats.impCnt > 0 ? stats.clkCnt / stats.impCnt : 0,
    cpcKrw: stats.clkCnt > 0 ? Math.round(stats.salesAmt / stats.clkCnt) : 0,
    conversionRate: stats.clkCnt > 0 ? stats.ccnt / stats.clkCnt : 0,
    costPerConversionKrw: stats.ccnt > 0 ? Math.round(stats.salesAmt / stats.ccnt) : null,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      output[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, values.length) }, () => worker()),
  );
  return output;
}

function createClient(config: SpacebogamNaverSearchAdsClientConfig): NaverSearchAdClient {
  if (config.clientFactory) return config.clientFactory();
  return createNaverSearchAdClient(readConfigFromEnv({
    NAVER_SEARCH_AD_CREDENTIALS_PATH: config.credentialsPath ?? undefined,
    NAVER_SEARCH_AD_TIMEOUT_MS: String(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  }));
}

async function loadSnapshot(input: {
  client: NaverSearchAdClient;
  since: string;
  until: string;
  generatedAt: string;
}): Promise<SpacebogamNaverSearchAdsSnapshot> {
  const campaigns = await input.client.listCampaigns();
  const rows = await mapWithConcurrency(campaigns, async (campaign) => ({
    name: campaign.name ?? null,
    type: campaign.campaignTp ?? null,
    status: campaign.status ?? null,
    userLocked: campaign.userLock ?? false,
    dailyBudgetKrw: campaign.dailyBudget ?? null,
    ...metrics(await input.client.getStats(campaign.nccCampaignId, input.since, input.until)),
  }));
  rows.sort((left, right) => right.spendKrw - left.spendKrw || right.clicks - left.clicks);
  const totals = rows.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    spendKrw: sum.spendKrw + row.spendKrw,
    conversions: sum.conversions + row.conversions,
  }), { impressions: 0, clicks: 0, spendKrw: 0, conversions: 0 });

  return {
    status: "ready",
    since: input.since,
    until: input.until,
    generatedAt: input.generatedAt,
    campaignCount: rows.length,
    activeCampaignCount: campaigns.filter(isActive).length,
    campaignsWithSpend: rows.filter((row) => row.spendKrw > 0).length,
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      cpcKrw: totals.clicks > 0 ? Math.round(totals.spendKrw / totals.clicks) : 0,
      conversionRate: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
      costPerConversionKrw: totals.conversions > 0
        ? Math.round(totals.spendKrw / totals.conversions)
        : null,
    },
    campaigns: rows,
  };
}

export function createSpacebogamNaverSearchAdsClient(
  config: SpacebogamNaverSearchAdsClientConfig,
): SpacebogamNaverSearchAdsClient {
  const credentialsPath = clean(config.credentialsPath);
  const paperclipCompanyId = clean(config.paperclipCompanyId);
  const cache = new Map<string, CacheEntry>();
  const now = config.now ?? (() => new Date());

  return {
    async fetchSnapshot(input) {
      if (!credentialsPath || !paperclipCompanyId || input.companyId !== paperclipCompanyId) {
        return null;
      }

      const generatedAt = now();
      const until = reportUntil(input.dataThrough, generatedAt);
      const since = subtractDays(until, input.rangeDays - 1);
      const cacheKey = `${input.companyId}:${input.rangeDays}:${until}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > generatedAt.getTime()) return cached.snapshot;

      const snapshot = loadSnapshot({
        client: createClient({ ...config, credentialsPath }),
        since,
        until,
        generatedAt: generatedAt.toISOString(),
      }).then((value) => spacebogamNaverSearchAdsSnapshotSchema.parse(value))
        .catch((): SpacebogamNaverSearchAdsSnapshot => ({
          status: "error",
          since,
          until,
          generatedAt: generatedAt.toISOString(),
          message: "네이버 검색광고 데이터를 불러오지 못했습니다. 잠시 후 다시 확인하세요.",
        }));
      cache.set(cacheKey, {
        expiresAt: generatedAt.getTime() + (config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
        snapshot,
      });
      return snapshot;
    },
  };
}
