import { Router } from "express";
import { HttpError } from "../errors.js";
import {
  createSpacebogamFunnelUpstreamClient,
  type SpacebogamFunnelUpstreamClient,
  type SpacebogamFunnelUpstreamError,
} from "../services/spacebogam-funnel-upstream.js";
import {
  createSpacebogamNaverSearchAdsClient,
  type SpacebogamNaverSearchAdsClient,
} from "../services/spacebogam-naver-searchads.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

function getCompanyId(params: Record<string, string | undefined>): string | null {
  const companyId = params.companyId;
  return typeof companyId === "string" && companyId.length > 0 ? companyId : null;
}

function parseRangeDays(value: unknown): 7 | 28 | 90 | null {
  if (value == null) return 28;
  if (value === "7") return 7;
  if (value === "28") return 28;
  if (value === "90") return 90;
  return null;
}

function envClient(): SpacebogamFunnelUpstreamClient {
  return createSpacebogamFunnelUpstreamClient({
    upstreamUrl: process.env.SPACEBOGAM_FUNNEL_UPSTREAM_URL,
    upstreamToken: process.env.SPACEBOGAM_FUNNEL_UPSTREAM_TOKEN,
    paperclipCompanyId: process.env.SPACEBOGAM_FUNNEL_PAPERCLIP_COMPANY_ID,
  });
}

function envNaverClient(): SpacebogamNaverSearchAdsClient {
  return createSpacebogamNaverSearchAdsClient({
    credentialsPath: process.env.SPACEBOGAM_NAVER_SEARCH_AD_CREDENTIALS_PATH,
    paperclipCompanyId: process.env.SPACEBOGAM_FUNNEL_PAPERCLIP_COMPANY_ID,
  });
}

function routeError(error: SpacebogamFunnelUpstreamError): HttpError {
  if (error.kind === "disabled") {
    return new HttpError(503, "spacebogam_funnel_disabled");
  }
  if (error.kind === "not_configured") {
    return new HttpError(404, "spacebogam_funnel_not_configured");
  }
  if (error.kind === "timeout") {
    return new HttpError(504, "spacebogam_funnel_timeout");
  }
  if (error.kind === "invalid_json" || error.kind === "invalid_schema") {
    return new HttpError(502, "spacebogam_funnel_invalid_response");
  }
  return new HttpError(502, "spacebogam_funnel_upstream_error");
}

export function spacebogamFunnelRoutes(
  client?: SpacebogamFunnelUpstreamClient,
  naverClient: SpacebogamNaverSearchAdsClient = envNaverClient(),
) {
  const router = Router();

  router.get("/companies/:companyId/analytics/spacebogam-funnel", async (req, res) => {
    const companyId = getCompanyId(req.params);
    if (companyId == null) {
      res.status(400).json({ error: "invalid_company_id" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const rangeDays = parseRangeDays(req.query.rangeDays);
    if (rangeDays == null) {
      res.status(400).json({ error: "invalid_range_days" });
      return;
    }

    const upstream = client ?? envClient();
    const result = await upstream.fetchReport({ companyId, rangeDays });
    if (result.ok === false) {
      throw routeError(result.error);
    }

    const naverSearchAds = await naverClient.fetchSnapshot({
      companyId,
      rangeDays,
      dataThrough: result.report.dataThrough,
    });
    res.json(naverSearchAds ? { ...result.report, naverSearchAds } : result.report);
  });

  return router;
}
