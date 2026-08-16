import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createNaverSearchAdConfig } from "./config.js";
import { createNaverSearchAdMcpServer } from "./index.js";
import type { NaverSearchAdClient } from "./naver-client.js";

function makeClient(): NaverSearchAdClient {
  return {
    listCampaigns: vi.fn().mockResolvedValue([{
      nccCampaignId: "cmp-1",
      name: "검색 캠페인",
      status: "ELIGIBLE",
      userLock: false,
    }]),
    listAdGroups: vi.fn().mockResolvedValue([]),
    listKeywords: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      impCnt: 100,
      clkCnt: 10,
      salesAmt: 5_000,
      ccnt: 2,
      avgRnk: 2,
      ctr: 10,
      cpc: 500,
    }),
  };
}

describe("Naver Search Ads MCP server", () => {
  it("lists only read-only tools and calls campaign performance", async () => {
    const config = createNaverSearchAdConfig({
      accessLicense: "access",
      secretKey: "secret",
      customerId: "customer",
    });
    const upstream = makeClient();
    const { server } = createNaverSearchAdMcpServer(config, { client: upstream });
    const client = new Client({ name: "test", version: "0.1.0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "naver_searchad_list_campaigns",
        "naver_searchad_campaign_performance",
        "naver_searchad_list_adgroups",
        "naver_searchad_keyword_performance",
      ]);
      expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

      const result = await client.callTool({
        name: "naver_searchad_campaign_performance",
        arguments: { since: "2026-07-01", until: "2026-07-25" },
      }, CallToolResultSchema) as CallToolResult;
      const text = result.content.find((entry) => entry.type === "text");
      expect(text?.type === "text" ? text.text : "").toContain('"costPerConversionKrw": 2500');
      expect(upstream.getStats).toHaveBeenCalledWith("cmp-1", "2026-07-01", "2026-07-25");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
