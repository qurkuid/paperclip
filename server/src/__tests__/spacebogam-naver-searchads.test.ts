import type { NaverSearchAdClient } from "@paperclipai/naver-searchad-mcp-server";
import { describe, expect, it, vi } from "vitest";
import { createSpacebogamNaverSearchAdsClient } from "../services/spacebogam-naver-searchads.js";

const companyId = "87645fb5-de7f-4c65-a416-7106f1222ee1";
const credentialsPath = "/protected/naver-searchads.env";

function naverClient(): NaverSearchAdClient {
  return {
    listCampaigns: vi.fn(async () => [
      {
        nccCampaignId: "campaign-a",
        name: "아파트 인테리어",
        status: "ELIGIBLE",
        userLock: false,
        campaignTp: "WEB_SITE",
        dailyBudget: 30_000,
      },
      {
        nccCampaignId: "campaign-b",
        name: "공간보감 플레이스",
        status: "PAUSED",
        userLock: true,
        campaignTp: "PLACE",
        dailyBudget: 10_000,
      },
    ]),
    listAdGroups: vi.fn(async () => []),
    listKeywords: vi.fn(async () => []),
    getStats: vi.fn(async (id) => id === "campaign-a"
      ? {
          impCnt: 1_000,
          clkCnt: 40,
          salesAmt: 80_000,
          ccnt: 4,
          avgRnk: 1.5,
          ctr: 4,
          cpc: 2_000,
        }
      : {
          impCnt: 500,
          clkCnt: 10,
          salesAmt: 10_000,
          ccnt: 0,
          avgRnk: 2.1,
          ctr: 2,
          cpc: 1_000,
        }),
  };
}

describe("spacebogam Naver Search Ads client", () => {
  it("aligns the API window to the funnel report and caches the normalized snapshot", async () => {
    const upstream = naverClient();
    const client = createSpacebogamNaverSearchAdsClient({
      credentialsPath,
      paperclipCompanyId: companyId,
      now: () => new Date("2026-07-26T03:00:00.000Z"),
      clientFactory: () => upstream,
    });

    const input = {
      companyId,
      rangeDays: 28 as const,
      dataThrough: "2026-07-25T11:30:00.000+09:00",
    };
    const first = await client.fetchSnapshot(input);
    const second = await client.fetchSnapshot(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "ready",
      since: "2026-06-28",
      until: "2026-07-25",
      campaignCount: 2,
      activeCampaignCount: 1,
      campaignsWithSpend: 2,
      totals: {
        impressions: 1_500,
        clicks: 50,
        spendKrw: 90_000,
        conversions: 4,
        ctr: 50 / 1_500,
        cpcKrw: 1_800,
        conversionRate: 4 / 50,
        costPerConversionKrw: 22_500,
      },
    });
    expect(first?.status === "ready" ? first.campaigns.map((row) => row.name) : []).toEqual([
      "아파트 인테리어",
      "공간보감 플레이스",
    ]);
    expect(upstream.listCampaigns).toHaveBeenCalledTimes(1);
    expect(upstream.getStats).toHaveBeenCalledTimes(2);
    expect(upstream.getStats).toHaveBeenNthCalledWith(1, "campaign-a", "2026-06-28", "2026-07-25");
    expect(upstream.getStats).toHaveBeenNthCalledWith(2, "campaign-b", "2026-06-28", "2026-07-25");
  });

  it("keeps the funnel usable with a sanitized Naver error snapshot", async () => {
    const upstream = naverClient();
    vi.mocked(upstream.listCampaigns).mockRejectedValueOnce(
      new Error("secret-key-from-upstream"),
    );
    const client = createSpacebogamNaverSearchAdsClient({
      credentialsPath,
      paperclipCompanyId: companyId,
      now: () => new Date("2026-07-26T03:00:00.000Z"),
      clientFactory: () => upstream,
    });

    const snapshot = await client.fetchSnapshot({
      companyId,
      rangeDays: 7,
      dataThrough: null,
    });

    expect(snapshot).toEqual({
      status: "error",
      since: "2026-07-20",
      until: "2026-07-26",
      generatedAt: "2026-07-26T03:00:00.000Z",
      message: "네이버 검색광고 데이터를 불러오지 못했습니다. 잠시 후 다시 확인하세요.",
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret-key-from-upstream");
  });

  it("does not call Naver for another company or an unconfigured server", async () => {
    const upstream = naverClient();
    const configured = createSpacebogamNaverSearchAdsClient({
      credentialsPath,
      paperclipCompanyId: companyId,
      clientFactory: () => upstream,
    });
    const disabled = createSpacebogamNaverSearchAdsClient({
      credentialsPath: null,
      paperclipCompanyId: companyId,
      clientFactory: () => upstream,
    });

    await expect(configured.fetchSnapshot({
      companyId: "another-company",
      rangeDays: 28,
      dataThrough: null,
    })).resolves.toBeNull();
    await expect(disabled.fetchSnapshot({
      companyId,
      rangeDays: 28,
      dataThrough: null,
    })).resolves.toBeNull();
    expect(upstream.listCampaigns).not.toHaveBeenCalled();
  });
});
