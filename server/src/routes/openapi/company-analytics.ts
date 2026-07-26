import { spacebogamFunnelReportSchema } from "@paperclipai/shared/validators/spacebogam-funnel";
import { z } from "zod";

export type CompanyAnalyticsOpenApiResponse = Record<string, unknown>;

export type CompanyAnalyticsOpenApiRoute = {
  method: string;
  path: string;
  tags: string[];
  summary: string;
  query?: z.ZodType<unknown>;
  body?: z.ZodType<unknown>;
  responses?: Record<string, CompanyAnalyticsOpenApiResponse>;
};

export type CompanyAnalyticsOpenApiRouteRegistrar = (route: CompanyAnalyticsOpenApiRoute) => void;

const errorResponseSchema = z.object({
  error: z.enum([
    "invalid_range_days",
    "spacebogam_funnel_disabled",
    "spacebogam_funnel_not_configured",
    "spacebogam_funnel_timeout",
    "spacebogam_funnel_invalid_response",
    "spacebogam_funnel_upstream_error",
  ]),
});

function jsonResponse(description: string, schema: z.ZodType<unknown>): CompanyAnalyticsOpenApiResponse {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

export function registerCompanyAnalyticsOpenApiRoutes(registerRoute: CompanyAnalyticsOpenApiRouteRegistrar) {
  registerRoute({
    method: "get",
    path: "/api/companies/{companyId}/analytics/spacebogam-funnel",
    tags: ["company-analytics"],
    summary: "Get Spacebogam funnel analytics",
    query: z.object({
      rangeDays: z.enum(["7", "28", "90"]).optional(),
    }),
    responses: {
      200: jsonResponse("Spacebogam funnel report", spacebogamFunnelReportSchema),
      400: jsonResponse("Invalid rangeDays query", errorResponseSchema),
      401: { description: "Unauthorized" },
      404: jsonResponse("Spacebogam funnel is not configured for this company", errorResponseSchema),
      502: jsonResponse("Spacebogam funnel upstream error", errorResponseSchema),
      503: jsonResponse("Spacebogam funnel upstream is disabled", errorResponseSchema),
      504: jsonResponse("Spacebogam funnel upstream timeout", errorResponseSchema),
    },
  });
}
