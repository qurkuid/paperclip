import { createHmac } from "node:crypto";
import type { NaverSearchAdConfig } from "./config.js";

export interface NaverCampaign {
  nccCampaignId: string;
  name?: string;
  status?: string;
  statusReason?: string;
  userLock?: boolean;
  campaignTp?: string;
  dailyBudget?: number;
  useDailyBudget?: boolean;
  [key: string]: unknown;
}

export interface NaverAdGroup {
  nccAdgroupId: string;
  nccCampaignId?: string;
  name?: string;
  status?: string;
  statusReason?: string;
  userLock?: boolean;
  bidAmt?: number;
  [key: string]: unknown;
}

export interface NaverKeyword {
  nccKeywordId: string;
  nccAdgroupId?: string;
  keyword?: string;
  status?: string;
  statusReason?: string;
  userLock?: boolean;
  bidAmt?: number;
  [key: string]: unknown;
}

export interface NaverStats {
  impCnt: number;
  clkCnt: number;
  salesAmt: number;
  ccnt: number;
  avgRnk: number | null;
  ctr: number | null;
  cpc: number | null;
}

const STAT_FIELDS = ["impCnt", "clkCnt", "salesAmt", "ccnt", "avgRnk", "ctr", "cpc"] as const;

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function signNaverSearchAdRequest(secretKey: string, timestamp: string, method: string, path: string): string {
  return createHmac("sha256", secretKey)
    .update(`${timestamp}.${method.toUpperCase()}.${path}`)
    .digest("base64");
}

export function normalizeStats(payload: unknown): NaverStats {
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { data?: unknown }).data
    : undefined;
  const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as Record<string, unknown>
    : {};
  return {
    impCnt: asNumber(row.impCnt),
    clkCnt: asNumber(row.clkCnt),
    salesAmt: asNumber(row.salesAmt),
    ccnt: asNumber(row.ccnt),
    avgRnk: asNullableNumber(row.avgRnk),
    ctr: asNullableNumber(row.ctr),
    cpc: asNullableNumber(row.cpc),
  };
}

export interface NaverSearchAdClient {
  listCampaigns(): Promise<NaverCampaign[]>;
  listAdGroups(campaignId: string): Promise<NaverAdGroup[]>;
  listKeywords(adGroupId: string): Promise<NaverKeyword[]>;
  getStats(id: string, since: string, until: string): Promise<NaverStats>;
}

export function createNaverSearchAdClient(
  config: NaverSearchAdConfig,
  fetchImpl: typeof fetch = fetch,
): NaverSearchAdClient {
  async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const timestamp = String(Date.now());
    const url = new URL(path, config.baseUrl);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": config.accessLicense,
        "X-Customer": config.customerId,
        "X-Signature": signNaverSearchAdRequest(config.secretKey, timestamp, "GET", path),
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 1_000);
      throw new Error(`Naver Search Ads API ${response.status} ${response.statusText}: ${body}`);
    }
    return await response.json() as T;
  }

  return {
    listCampaigns: () => request<NaverCampaign[]>("/ncc/campaigns"),
    listAdGroups: (campaignId) => request<NaverAdGroup[]>("/ncc/adgroups", { nccCampaignId: campaignId }),
    listKeywords: (adGroupId) => request<NaverKeyword[]>("/ncc/keywords", { nccAdgroupId: adGroupId }),
    getStats: async (id, since, until) => normalizeStats(await request<unknown>("/stats", {
      id,
      fields: JSON.stringify(STAT_FIELDS),
      timeRange: JSON.stringify({ since, until }),
      timeIncrement: "allDays",
    })),
  };
}
