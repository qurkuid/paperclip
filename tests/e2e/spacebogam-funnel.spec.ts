import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { SpacebogamFunnelQualityStatus, SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";

const EVIDENCE_DIR = ".omo/ulw-loop/019f96e9-2a77-7163-9536-a7fcee273396/evidence";
const COMPANY_PREFIX = "E2E-Spacebogam";
const endpoint = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/analytics/spacebogam-funnel`;
type RangeDays = 7 | 28 | 90;
type ErrorMode = "disabled" | "timeout" | "malformed";
type MockMode = { status: SpacebogamFunnelQualityStatus } | { error: ErrorMode };
type Seed = { id: string; prefix: string };
type Watch = { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] };

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field : null;
}

async function seedCompany(request: APIRequestContext): Promise<Seed> {
  const res = await request.post("/api/companies", { data: { name: `${COMPANY_PREFIX}-${Date.now()}` } });
  expect(res.ok(), `create company failed ${res.status()}: ${await res.text()}`).toBe(true);
  const body: unknown = await res.json();
  const id = readString(body, "id");
  const prefix = readString(body, "issuePrefix") ?? readString(body, "prefix") ?? readString(body, "urlKey");
  expect(id).not.toBeNull();
  expect(prefix).not.toBeNull();
  return { id: id ?? "", prefix: prefix ?? "" };
}

function attachWatch(page: Page): Watch {
  const watch: Watch = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource:.*status of (502|503|504)/.test(msg.text())) watch.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => watch.pageErrors.push(err.message));
  page.on("requestfailed", (req) => watch.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`));
  return watch;
}

function expectClean(watch: Watch) {
  expect(watch.consoleErrors, watch.consoleErrors.join("\n")).toHaveLength(0);
  expect(watch.pageErrors, watch.pageErrors.join("\n")).toHaveLength(0);
  expect(watch.failedRequests, watch.failedRequests.join("\n")).toHaveLength(0);
}

function parseRange(value: string | null): RangeDays | null {
  if (value === "7") return 7;
  if (value === "28") return 28;
  if (value === "90") return 90;
  return null;
}

async function mockFunnel(page: Page, companyId: string) {
  let mode: MockMode = { status: "ready" };
  const ranges: RangeDays[] = [];
  await page.route("**/api/companies/*/analytics/spacebogam-funnel**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(req.url());
    const range = parseRange(url.searchParams.get("rangeDays"));
    if (url.pathname !== endpoint(companyId) || range === null) {
      await route.fulfill({ status: 400, json: { error: "unexpected_funnel_request" } });
      return;
    }
    ranges.push(range);
    if ("error" in mode) {
      if (mode.error === "malformed") {
        await route.fulfill({ status: 502, json: { error: "spacebogam_funnel_invalid_response" } });
        return;
      }
      const status = mode.error === "disabled" ? 503 : 504;
      await route.fulfill({ status, json: { error: `spacebogam_funnel_${mode.error}` } });
      return;
    }
    await route.fulfill({ status: 200, json: report(range, mode.status) });
  });
  return {
    ranges,
    setStatus: (status: SpacebogamFunnelQualityStatus) => {
      mode = { status };
    },
    setError: (error: ErrorMode) => {
      mode = { error };
    },
  };
}

function day(index: number): string {
  const date = new Date(Date.UTC(2026, 6, index + 1));
  return date.toISOString().slice(0, 10);
}

function stage(key: SpacebogamFunnelReport["stages"][number]["key"], label: string, count: number, previousCount: number | null): SpacebogamFunnelReport["stages"][number] {
  return {
    key,
    label,
    count,
    previousCount,
    conversionFromPrevious: previousCount === null ? null : count / previousCount,
    dropOffCount: previousCount === null ? null : previousCount - count,
    dropOffRate: previousCount === null ? null : (previousCount - count) / previousCount,
  };
}

function report(rangeDays: RangeDays, status: SpacebogamFunnelQualityStatus): SpacebogamFunnelReport {
  const ready = status === "ready";
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays,
    generatedAt: "2026-07-25T12:00:00.000+09:00",
    dataThrough: "2026-07-25T11:30:00.000+09:00",
    collectionStartedAt: "2026-07-01T00:00:00.000+09:00",
    counts: { visits: 120, engagedVisits: 90, consultationClicks: 36, formStarts: 20, submittedLeads: 8 },
    stages: status === "invalid_sequence" ? [stage("visit", "방문", 120, null), stage("engaged", "10초 이상 참여", 90, 120), stage("consultation", "상담 CTA 클릭", 130, 90), stage("form_start", "상담 작성 시작", 20, 130), stage("lead", "상담 제출 완료", 8, 20)] : [stage("visit", "방문", 120, null), stage("engaged", "10초 이상 참여", 90, 120), stage("consultation", "상담 CTA 클릭", 36, 90), stage("form_start", "상담 작성 시작", 20, 36), stage("lead", "상담 제출 완료", 8, 20)],
    daily: Array.from({ length: rangeDays }, (_, index) => ({
      date: day(index),
      visits: index + 1,
      submittedLeads: index % 3 === 0 ? 1 : 0,
      visitToLeadRate: index % 3 === 0 ? 0.1 : null,
    })),
    campaigns: [
      { source: "naver", medium: "cpc", campaign: "apt-main", visits: 64, submittedLeads: 6, visitToLeadRate: 0.0938, sampleStatus: "usable" },
      { source: "google", medium: "search", campaign: "brand", visits: 24, submittedLeads: 1, visitToLeadRate: 0.0417, sampleStatus: "usable" },
    ],
    quality: {
      status,
      sampleSessions: ready ? 120 : 12,
      minimumReadySessions: 50,
      newestEventAt: status === "empty" ? null : "2026-07-25T11:30:00.000+09:00",
      freshnessHours: status === "stale" ? 96 : ready ? 0.5 : null,
      utmTaggedVisitRate: ready ? 0.68 : null,
      missingDataDays: status === "stale" ? ["2026-07-20"] : [],
      isMonotonic: status !== "invalid_sequence",
      warnings: status === "ready" ? [] : ["측정 품질 확인 필요"],
    },
    bottleneck: ready ? { fromStage: "참여", toStage: "상담 CTA 클릭", lostSessions: 54, lossRate: 0.6 } : null,
    recommendations: ready ? [{ code: "improve_cta", title: "상담 CTA 실험", reason: "상담 CTA 클릭 손실이 가장 큽니다.", action: "포트폴리오 근처 CTA를 실험합니다.", confidence: "directional" }] : [],
    legacyBaseline: { source: "ga4" },
  };
}

async function expectReadySurface(page: Page) {
  await expect(page.getByRole("heading", { name: "공간보감 퍼널 분석", exact: true })).toBeVisible();
  await expect(page.getByText("현재 진단", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "문제 구간과 원인은 다릅니다.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "바꾸고, 측정하고, 판정하세요.", exact: true })).toBeVisible();
  const canvases = page.locator("canvas[aria-label]");
  await expect(canvases).toHaveCount(4);
  const labels = await canvases.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
  expect(new Set(labels).size).toBe(4);
  expect(labels).toEqual(["공간보감 단계별 퍼널 막대 차트", "공간보감 일별 방문 및 문의율 혼합 차트", "공간보감 UTM 캠페인 볼륨 전환 산점도", "공간보감 손실 파레토 혼합 차트"]);
  const pairs = await canvases.evaluateAll((nodes) => nodes.map((canvas) => {
    const shell = canvas.closest("[data-funnel-chart-shell]");
    const tables = Array.from(shell?.querySelectorAll("table[aria-label]") ?? []);
    return { canvas: canvas.getAttribute("aria-label") ?? "", tables: tables.map((table) => table.getAttribute("aria-label") ?? "") };
  }));
  expect(pairs).toEqual([{ canvas: "공간보감 단계별 퍼널 막대 차트", tables: ["단계별 퍼널 표"] }, { canvas: "공간보감 일별 방문 및 문의율 혼합 차트", tables: ["일별 방문 및 문의율 표"] }, { canvas: "공간보감 UTM 캠페인 볼륨 전환 산점도", tables: ["UTM 캠페인 볼륨 전환 표"] }, { canvas: "공간보감 손실 파레토 혼합 차트", tables: ["손실 파레토 표"] }]);
}

test.describe.serial("Spacebogam funnel analytics", () => {
  let seed: Seed;

  test.beforeAll(async ({ request }) => {
    const flags = await request.patch("/api/instance/settings/experimental", { data: { enableBuiltInAgents: true } });
    expect(flags.ok(), `enable built-in agents failed ${flags.status()}: ${await flags.text()}`).toBe(true);
    seed = await seedCompany(request);
  });

  test.afterAll(async ({ request }) => {
    if (seed?.id) await request.delete(`/api/companies/${seed.id}`);
  });

  test("G003 C001 direct route, sidebar nav, range requests, reload, and desktop screenshot", async ({ page }) => {
    const watch = attachWatch(page);
    const mock = await mockFunnel(page, seed.id);
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.goto(`/${seed.prefix}/analytics/funnel`);
    await expectReadySurface(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/G003-C001-desktop.png`, fullPage: true });
    await page.getByRole("button", { name: "7일" }).click();
    await page.getByRole("button", { name: "90일" }).click();
    await page.getByRole("button", { name: "28일" }).click();
    await expect.poll(() => mock.ranges.join(",")).toBe("28,7,90");

    await page.goto(`/${seed.prefix}/dashboard`);
    await page.getByRole("link", { name: "퍼널 분석" }).click();
    await expect(page).toHaveURL(new RegExp(`/${seed.prefix}/analytics/funnel$`));
    await expectReadySurface(page);
    await page.reload();
    await expectReadySurface(page);
    await expect.poll(() => mock.ranges.join(",")).toBe("28,7,90,28,28");
    expectClean(watch);
  });

  test("G003 C002 edge states suppress action and errors hide stale ready data", async ({ page }) => {
    const watch = attachWatch(page);
    const mock = await mockFunnel(page, seed.id);
    const warningCases: Array<{ status: SpacebogamFunnelQualityStatus; copy: string }> = [{ status: "empty", copy: "아직 측정된 세션이 없어 개선안을 숨깁니다." }, { status: "collecting", copy: "측정 표본을 수집 중이라 개선안을 숨깁니다." }, { status: "stale", copy: "최근 이벤트가 오래되어 측정값을 확인해야 합니다." }, { status: "invalid_sequence", copy: "퍼널 단계 순서가 맞지 않아 측정값을 먼저 점검해야 합니다." }];
    for (const item of warningCases) {
      mock.setStatus(item.status);
      await page.goto(`/${seed.prefix}/analytics/funnel`);
      await expect(page.getByText(item.copy)).toBeVisible(); await expect(page.getByText("손실 파레토 데이터 점검 필요")).toBeVisible();
      await expect(page.getByText("상담 CTA 실험")).toHaveCount(0); await expect(page.getByRole("table", { name: "손실 파레토 표" })).toHaveCount(0);
    }

    mock.setStatus("ready");
    await page.goto(`/${seed.prefix}/analytics/funnel`);
    await page.locator("summary").filter({ hasText: "원본 표 보기" }).nth(2).click();
    await expect(page.getByRole("table", { name: "UTM 캠페인 볼륨 전환 표" }).getByText("apt-main", { exact: true })).toBeVisible();
    const errors: Array<{ mode: ErrorMode; button: string; copy: string }> = [{ mode: "disabled", button: "7일", copy: "공간보감 퍼널 연동이 비활성화되어 있습니다." }, { mode: "timeout", button: "90일", copy: "공간보감 응답 시간이 초과되었습니다." }, { mode: "malformed", button: "다시 시도", copy: "공간보감 응답 형식이 올바르지 않습니다." }];
    for (const item of errors) {
      mock.setError(item.mode);
      await page.getByRole("button", { name: item.button }).click();
      await expect(page.getByText(item.copy)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("apt-main")).toHaveCount(0);
      await expect(page.locator("canvas[aria-label]")).toHaveCount(0);
      if (item.mode === "malformed") await page.screenshot({ path: `${EVIDENCE_DIR}/G003-C002-browser.png`, fullPage: true });
    }
    expectClean(watch);
  });

  test("G003 C003 mobile has no horizontal overflow and captures screenshot", async ({ page }) => {
    const watch = attachWatch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockFunnel(page, seed.id);
    await page.goto(`/${seed.prefix}/analytics/funnel`);
    await expectReadySurface(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    for (const summary of await page.locator("summary").all()) await summary.click();
    const tableMetrics = await page.locator("div[aria-label$='표 스크롤 영역']").evaluateAll((wrappers) => wrappers.map((wrapper) => {
      const table = wrapper.querySelector("table");
      const last = table?.querySelector("thead th:last-child");
      const viewportWidth = document.documentElement.clientWidth;
      const wrapperRect = wrapper.getBoundingClientRect();
      const lastRect = last?.getBoundingClientRect();
      return { label: wrapper.getAttribute("aria-label") ?? "", wrapperRightOverflow: Math.ceil(wrapperRect.right - viewportWidth), wrapperLeftOverflow: Math.ceil(-wrapperRect.left), tableOverflow: wrapper.scrollWidth - wrapper.clientWidth, headerOverflow: Math.ceil((lastRect?.right ?? 0) - wrapperRect.right) };
    }));
    expect(tableMetrics, JSON.stringify(tableMetrics)).toHaveLength(4);
    for (const item of tableMetrics) {
      expect(item.wrapperRightOverflow, JSON.stringify(tableMetrics)).toBeLessThanOrEqual(1);
      expect(item.wrapperLeftOverflow, JSON.stringify(tableMetrics)).toBeLessThanOrEqual(1);
      expect(item.tableOverflow, JSON.stringify(tableMetrics)).toBeLessThanOrEqual(1);
      expect(item.headerOverflow, JSON.stringify(tableMetrics)).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.getByRole("navigation", { name: "Mobile navigation" }).evaluate((nav) => Math.floor(nav.getBoundingClientRect().top - window.innerHeight))).toBeGreaterThanOrEqual(-1);
    await page.screenshot({ path: `${EVIDENCE_DIR}/G003-C003-mobile.png`, fullPage: true });
    expectClean(watch);
  });
});
