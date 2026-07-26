import { describe, expect, it, vi } from "vitest";
import { createNaverSearchAdConfig } from "./config.js";
import { createNaverSearchAdClient, normalizeStats, signNaverSearchAdRequest } from "./naver-client.js";

describe("Naver Search Ads client", () => {
  it("creates the documented HMAC-SHA256 signature", () => {
    expect(signNaverSearchAdRequest("secret", "1700000000000", "GET", "/ncc/campaigns"))
      .toBe("9eQw3iPVTMIl3cgVonp2ltPK6kBGHuGeRLFPC4u7iOw=");
  });

  it("signs the path without the query string and maps stats", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ impCnt: 100, clkCnt: 5, salesAmt: 2500, ccnt: 1, avgRnk: 2.3, ctr: 5, cpc: 500 }],
    }), { status: 200 }));
    const config = createNaverSearchAdConfig({
      accessLicense: "access",
      secretKey: "secret",
      customerId: "customer",
    });
    const client = createNaverSearchAdClient(config, fetchMock);

    const stats = await client.getStats("cmp-1", "2026-07-01", "2026-07-25");

    expect(stats).toEqual({
      impCnt: 100,
      clkCnt: 5,
      salesAmt: 2500,
      ccnt: 1,
      avgRnk: 2.3,
      ctr: 5,
      cpc: 500,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/stats?id=cmp-1");
    expect(new Headers(init?.headers).get("X-Signature")).toBeTruthy();
  });

  it("normalizes empty stats to zero", () => {
    expect(normalizeStats({ data: [] })).toMatchObject({
      impCnt: 0,
      clkCnt: 0,
      salesAmt: 0,
      ccnt: 0,
    });
  });
});
