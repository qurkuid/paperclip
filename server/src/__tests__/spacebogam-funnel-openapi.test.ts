import { describe, expect, it } from "vitest";
import { registerCompanyAnalyticsOpenApiRoutes } from "../routes/openapi/company-analytics.js";
import { buildOpenApiSpec } from "../routes/openapi.js";

const spacebogamOpenApiPath = "/api/companies/{companyId}/analytics/spacebogam-funnel";

describe("spacebogam funnel OpenAPI", () => {
  it("documents the board-only Spacebogam funnel analytics endpoint", () => {
    const spec = buildOpenApiSpec();
    const operation = spec.paths[spacebogamOpenApiPath]?.get;

    expect(registerCompanyAnalyticsOpenApiRoutes).toBeTypeOf("function");
    expect(Object.keys(spec.paths).filter((routePath) => routePath.includes("/api/companies/{companyId}/analytics"))).toEqual([
      spacebogamOpenApiPath,
    ]);
    expect(operation).toBeDefined();
    if (!operation) {
      throw new Error("Spacebogam OpenAPI operation is missing");
    }

    expect(operation.summary).toBe("Get Spacebogam funnel analytics");
    expect(operation.security).toEqual([{ BoardSessionAuth: [] }, { BoardApiKeyAuth: [] }]);
    expect(operation["x-paperclip-authorization"]).toEqual({ actor: "board" });
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "companyId", in: "path", required: true }),
        expect.objectContaining({ name: "rangeDays", in: "query", required: false }),
      ]),
    );
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "403", "404", "502", "503", "504"]);
    expect(JSON.stringify(operation.responses["502"])).toContain("spacebogam_funnel_invalid_response");
    expect(JSON.stringify(operation)).not.toMatch(
      /SPACEBOGAM_FUNNEL_UPSTREAM_URL|SPACEBOGAM_FUNNEL_UPSTREAM_TOKEN|Bearer|X-Paperclip-Company-Id|https?:\/\/|intm\./i,
    );
  });
});
