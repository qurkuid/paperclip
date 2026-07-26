import { describe, expect, it, vi } from "vitest";
import type { NaverSearchAdClient } from "./naver-client.js";
import { createToolDefinitions } from "./tools.js";

function makeClient(overrides: Partial<NaverSearchAdClient> = {}): NaverSearchAdClient {
  return {
    listCampaigns: vi.fn().mockResolvedValue([]),
    listAdGroups: vi.fn().mockResolvedValue([]),
    listKeywords: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      impCnt: 0,
      clkCnt: 0,
      salesAmt: 0,
      ccnt: 0,
      avgRnk: null,
      ctr: null,
      cpc: null,
    }),
    ...overrides,
  };
}

function resultText(result: Awaited<ReturnType<ReturnType<typeof createToolDefinitions>[number]["execute"]>>) {
  const content = result.content.find((entry) => entry.type === "text");
  return content?.type === "text" ? content.text : "";
}

describe("Naver Search Ads tools", () => {
  it.each([
    { since: "2026-02-30", until: "2026-03-01", message: "valid calendar date" },
    { since: "2025-01-01", until: "2025-04-01", message: "90 days" },
    { since: "9999-01-01", until: "9999-01-02", message: "future" },
  ])("rejects unsafe reporting ranges: $message", async ({ since, until, message }) => {
    const tool = createToolDefinitions({ client: makeClient() })
      .find((candidate) => candidate.name === "naver_searchad_campaign_performance")!;
    const result = await tool.execute({ since, until });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(message);
  });

  it("labels keyword ranking as a bounded API-order sample when truncated", async () => {
    const keywords = Array.from({ length: 3 }, (_, index) => ({
      nccKeywordId: `kw-${index + 1}`,
      keyword: `키워드 ${index + 1}`,
    }));
    const client = makeClient({
      listKeywords: vi.fn().mockResolvedValue(keywords),
      getStats: vi.fn().mockImplementation(async (id: string) => ({
        impCnt: 10,
        clkCnt: 1,
        salesAmt: id === "kw-1" ? 100 : 200,
        ccnt: 0,
        avgRnk: null,
        ctr: 10,
        cpc: 100,
      })),
    });
    const tool = createToolDefinitions({ client })
      .find((candidate) => candidate.name === "naver_searchad_keyword_performance")!;
    const result = await tool.execute({
      adGroupId: "group-1",
      since: "2026-07-01",
      until: "2026-07-25",
      limit: 2,
    });
    const parsed = JSON.parse(resultText(result)) as {
      truncated: boolean;
      rankingScope: string;
      keywords: Array<{ keywordId: string }>;
    };

    expect(parsed.truncated).toBe(true);
    expect(parsed.rankingScope).toBe("first 2 keywords in Naver API order; sorted by spend within this sample");
    expect(parsed.keywords.map((keyword) => keyword.keywordId)).toEqual(["kw-2", "kw-1"]);
  });
});
