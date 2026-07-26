import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@paperclipai/db";
import { errorHandler } from "../middleware/index.js";
import type { StorageService } from "../storage/types.js";
import type {
  SpacebogamFunnelUpstreamClient,
  SpacebogamFunnelUpstreamError,
} from "../services/spacebogam-funnel-upstream.js";
import {
  agentActor,
  boardActor,
  otherCompanyId,
  secretToken,
  spacebogamCompanyId,
  upstreamUrl,
  validSpacebogamReport,
} from "./spacebogam-funnel-fixtures.js";

const routePath = `/api/companies/${spacebogamCompanyId}/analytics/spacebogam-funnel`;
const mockPluginRegistry = vi.hoisted(() => ({
  getById: vi.fn(async () => null),
  getByKey: vi.fn(async () => ({ id: "kubernetes", status: "ready" })),
  listByStatus: vi.fn(async () => []),
}));
type UpstreamFailureCase = [SpacebogamFunnelUpstreamError["kind"], string];
const upstreamFailureCases: UpstreamFailureCase[] = [
  ["redirect", "spacebogam_funnel_upstream_error"],
  ["body_too_large", "spacebogam_funnel_upstream_error"],
  ["auth_failed", "spacebogam_funnel_upstream_error"],
  ["upstream_error", "spacebogam_funnel_upstream_error"],
  ["invalid_json", "spacebogam_funnel_invalid_response"],
  ["invalid_schema", "spacebogam_funnel_invalid_response"],
];

function client(result: Awaited<ReturnType<SpacebogamFunnelUpstreamClient["fetchReport"]>>) {
  return {
    fetchReport: vi.fn(async () => result),
  } satisfies SpacebogamFunnelUpstreamClient;
}

function expectNoSecretLeak(value: unknown) {
  const body = JSON.stringify(value);
  expect(body).not.toContain(secretToken);
  expect(body).not.toContain(upstreamUrl);
}

async function createRouteApp(input: {
  actor?: Express.Request["actor"];
  upstreamClient?: SpacebogamFunnelUpstreamClient;
}) {
  const { spacebogamFunnelRoutes } = await import("../routes/spacebogam-funnel.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = input.actor ?? boardActor();
    next();
  });
  app.use("/api", spacebogamFunnelRoutes(input.upstreamClient));
  app.use(errorHandler);
  return app;
}

describe.sequential("spacebogam funnel routes", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SPACEBOGAM_FUNNEL_UPSTREAM_URL;
    delete process.env.SPACEBOGAM_FUNNEL_UPSTREAM_TOKEN;
    delete process.env.SPACEBOGAM_FUNNEL_PAPERCLIP_COMPANY_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a validated report to a board member of the configured company", async () => {
    const report = validSpacebogamReport(28);
    const upstreamClient = client({ ok: true, report });
    const app = await createRouteApp({ upstreamClient });

    const res = await request(app).get(routePath);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(report);
    expect(upstreamClient.fetchReport).toHaveBeenCalledWith({
      companyId: spacebogamCompanyId,
      rangeDays: 28,
    });
  });

  it("hides an unmapped company", async () => {
    const upstreamClient = client({
      ok: false,
      error: { kind: "not_configured", message: "hidden" },
    });
    const app = await createRouteApp({
      actor: boardActor(otherCompanyId),
      upstreamClient,
    });

    const res = await request(app)
      .get(`/api/companies/${otherCompanyId}/analytics/spacebogam-funnel`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "spacebogam_funnel_not_configured" });
  });

  it("hides a configured company env mismatch without calling upstream", async () => {
    process.env.SPACEBOGAM_FUNNEL_UPSTREAM_URL = upstreamUrl;
    process.env.SPACEBOGAM_FUNNEL_UPSTREAM_TOKEN = secretToken;
    process.env.SPACEBOGAM_FUNNEL_PAPERCLIP_COMPANY_ID = otherCompanyId;
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const app = await createRouteApp({});

    const res = await request(app).get(routePath);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "spacebogam_funnel_not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an unsupported range", async () => {
    const upstreamClient = client({ ok: true, report: validSpacebogamReport() });
    const app = await createRouteApp({ upstreamClient });

    const res = await request(app).get(`${routePath}?rangeDays=14`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_range_days" });
    expect(upstreamClient.fetchReport).not.toHaveBeenCalled();
  });

  it("reports disabled configuration", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const app = await createRouteApp({});

    const res = await request(app).get(routePath);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "spacebogam_funnel_disabled" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out a hung upstream", async () => {
    const upstreamClient = client({
      ok: false,
      error: { kind: "timeout", message: `timed out ${secretToken} ${upstreamUrl}` },
    });
    const app = await createRouteApp({ upstreamClient });

    const res = await request(app).get(routePath);

    expect(res.status).toBe(504);
    expect(res.body).toEqual({ error: "spacebogam_funnel_timeout" });
    expectNoSecretLeak(res.body);
  });

  it("denies agent access before calling upstream", async () => {
    const upstreamClient = client({ ok: true, report: validSpacebogamReport() });
    const app = await createRouteApp({ actor: agentActor(), upstreamClient });

    const res = await request(app).get(routePath);

    expect(res.status).toBe(403);
    expect(upstreamClient.fetchReport).not.toHaveBeenCalled();
  });

  it("denies agent access before range validation", async () => {
    const upstreamClient = client({ ok: true, report: validSpacebogamReport() });
    const app = await createRouteApp({ actor: agentActor(), upstreamClient });

    const res = await request(app).get(`${routePath}?rangeDays=14`);

    expect(res.status).toBe(403);
    expect(upstreamClient.fetchReport).not.toHaveBeenCalled();
  });

  it.each(upstreamFailureCases)("maps %s upstream failures to sanitized 502", async (kind, error) => {
    const upstreamClient = client({
      ok: false,
      error: upstreamFailure(kind),
    });
    const app = await createRouteApp({ upstreamClient });

    const res = await request(app).get(routePath);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error });
    expectNoSecretLeak(res.body);
  });

  it("is mounted by createApp under /api", async () => {
    vi.doMock("../services/plugin-registry.js", () => ({
      pluginRegistryService: () => mockPluginRegistry,
    }));
    process.env.SPACEBOGAM_FUNNEL_UPSTREAM_URL = upstreamUrl;
    process.env.SPACEBOGAM_FUNNEL_UPSTREAM_TOKEN = secretToken;
    process.env.SPACEBOGAM_FUNNEL_PAPERCLIP_COMPANY_ID = spacebogamCompanyId;
    const report = validSpacebogamReport(7);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(report))));
    const { createApp } = await import("../app.js");
    const app = await createApp(createDb("postgres://paperclip-route-test"), {
      uiMode: "none",
      serverPort: 0,
      storageService: storageService(),
      deploymentMode: "local_trusted",
      deploymentExposure: "public",
      allowedHostnames: [],
      bindHost: "127.0.0.1",
      authReady: true,
      companyDeletionEnabled: false,
    });

    const res = await request(app).get(`${routePath}?rangeDays=7`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(report);
  });
});

function upstreamFailure(kind: SpacebogamFunnelUpstreamError["kind"]): SpacebogamFunnelUpstreamError {
  if (kind === "redirect") {
    return { kind, status: 302, message: `raw ${secretToken} ${upstreamUrl} payload` };
  }
  if (kind === "auth_failed") {
    return { kind, status: 401, message: `raw ${secretToken} ${upstreamUrl} payload` };
  }
  if (kind === "upstream_error") {
    return { kind, status: 500, message: `raw ${secretToken} ${upstreamUrl} payload` };
  }
  return { kind, message: `raw ${secretToken} ${upstreamUrl} payload` };
}

function storageService(): StorageService {
  return {
    provider: "filesystem",
    putFile: async () => { throw new Error("unused storage putFile"); },
    getObject: async () => { throw new Error("unused storage getObject"); },
    headObject: async () => ({ exists: false }),
    deleteObject: async () => { throw new Error("unused storage deleteObject"); },
  };
}
