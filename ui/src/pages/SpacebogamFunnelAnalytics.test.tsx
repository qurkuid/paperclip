// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SpacebogamFunnelReport } from "@paperclipai/shared/validators/spacebogam-funnel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpacebogamFunnelAnalytics } from "./SpacebogamFunnelAnalytics";
import { SpacebogamFunnelApiError } from "../api/spacebogam-funnel";

interface MockFunnelState {
  data: SpacebogamFunnelReport | undefined;
  error: Error | null;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

interface HookCall {
  companyId: string | null;
  rangeDays: number;
}

interface ChartCall {
  label: string;
  data: unknown;
}

const companyState = vi.hoisted(() => ({ selectedCompanyId: "company-1" }));
const funnelState = vi.hoisted<MockFunnelState>(() => ({
  data: undefined,
  error: null,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
}));
const hookCalls = vi.hoisted<HookCall[]>(() => []);
const chartProps = vi.hoisted<ChartCall[]>(() => []);

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("../hooks/useSpacebogamFunnel", () => ({
  useSpacebogamFunnel: (companyId: string | null, rangeDays: number) => {
    hookCalls.push({ companyId, rangeDays });
    return funnelState;
  },
}));

vi.mock("react-chartjs-2", () => ({
  Chart: ({ "aria-label": ariaLabel, data }: { "aria-label": string; data: unknown }) => {
    chartProps.push({ label: ariaLabel, data });
    return <canvas aria-label={ariaLabel} data-testid="chart-canvas" />;
  },
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function report(overrides: Partial<SpacebogamFunnelReport> = {}): SpacebogamFunnelReport {
  const daily = Array.from({ length: 28 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    visits: 80 + index,
    submittedLeads: 8 + (index % 3),
    visitToLeadRate: 0.1 + index / 1_000,
  }));
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays: 28,
    generatedAt: "2026-07-25T12:00:00.000+09:00",
    dataThrough: "2026-07-25T11:30:00.000+09:00",
    collectionStartedAt: "2026-07-01T00:00:00.000+09:00",
    counts: {
      visits: 2_800,
      engagedVisits: 1_680,
      consultationClicks: 620,
      formStarts: 420,
      submittedLeads: 280,
    },
    stages: [
      { key: "visit", label: "방문", count: 2_800, previousCount: null, conversionFromPrevious: null, dropOffCount: null, dropOffRate: null },
      { key: "engaged", label: "참여", count: 1_680, previousCount: 2_800, conversionFromPrevious: 0.6, dropOffCount: 1_120, dropOffRate: 0.4 },
      { key: "consultation", label: "상담 클릭", count: 620, previousCount: 1_680, conversionFromPrevious: 0.369, dropOffCount: 1_060, dropOffRate: 0.631 },
      { key: "form_start", label: "폼 시작", count: 420, previousCount: 620, conversionFromPrevious: 0.677, dropOffCount: 200, dropOffRate: 0.323 },
      { key: "lead", label: "문의 제출", count: 280, previousCount: 420, conversionFromPrevious: 0.667, dropOffCount: 140, dropOffRate: 0.333 },
    ],
    daily,
    campaigns: [
      { source: "naver", medium: "search", campaign: "apt-main", visits: 900, submittedLeads: 120, visitToLeadRate: 0.133, sampleStatus: "usable" },
      { source: "google", medium: "cpc", campaign: "brand", visits: 500, submittedLeads: 40, visitToLeadRate: 0.08, sampleStatus: "usable" },
      { source: "instagram", medium: "social", campaign: "reels", visits: 300, submittedLeads: 15, visitToLeadRate: 0.05, sampleStatus: "usable" },
    ],
    quality: {
      status: "ready",
      sampleSessions: 2_800,
      minimumReadySessions: 50,
      newestEventAt: "2026-07-25T11:30:00.000+09:00",
      freshnessHours: 0.5,
      utmTaggedVisitRate: 0.87,
      missingDataDays: [],
      isMonotonic: true,
      warnings: [],
    },
    bottleneck: {
      fromStage: "참여",
      toStage: "상담 클릭",
      lostSessions: 1_060,
      lossRate: 0.631,
    },
    recommendations: [{ code: "consultation_cta", title: "상담 CTA를 첫 화면에 고정", reason: "참여 이후 상담 클릭 손실이 가장 큽니다.", action: "아파트 전문 상담 버튼을 상단에 고정하세요.", confidence: "directional" }],
    legacyBaseline: null,
    naverSearchAds: {
      status: "ready",
      since: "2026-06-28",
      until: "2026-07-25",
      generatedAt: "2026-07-25T12:00:00.000+09:00",
      campaignCount: 2,
      activeCampaignCount: 1,
      campaignsWithSpend: 2,
      totals: {
        impressions: 1_500,
        clicks: 50,
        spendKrw: 90_000,
        conversions: 0,
        ctr: 50 / 1_500,
        cpcKrw: 1_800,
        conversionRate: 0,
        costPerConversionKrw: null,
      },
      campaigns: [
        {
          name: "아파트 인테리어",
          type: "WEB_SITE",
          status: "ELIGIBLE",
          userLocked: false,
          dailyBudgetKrw: 30_000,
          impressions: 1_000,
          clicks: 40,
          spendKrw: 80_000,
          conversions: 0,
          ctr: 0.04,
          cpcKrw: 2_000,
          conversionRate: 0,
          costPerConversionKrw: null,
        },
        {
          name: "공간보감 플레이스",
          type: "PLACE",
          status: "PAUSED",
          userLocked: true,
          dailyBudgetKrw: 10_000,
          impressions: 500,
          clicks: 10,
          spendKrw: 10_000,
          conversions: 0,
          ctr: 0.02,
          cpcKrw: 1_000,
          conversionRate: 0,
          costPerConversionKrw: null,
        },
      ],
    },
    ...overrides,
  };
}

function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

function clearRender() {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

describe("SpacebogamFunnelAnalytics", () => {
  beforeEach(() => {
    funnelState.data = report();
    funnelState.error = null;
    funnelState.isError = false;
    funnelState.isFetching = false;
    funnelState.isLoading = false;
    funnelState.refetch.mockReset();
    hookCalls.splice(0);
    chartProps.splice(0);
  });

  afterEach(() => {
    clearRender();
  });

  it("G003 C001 renders the ready dashboard with funnel and Naver diagnosis, charts, and matching evidence tables", () => {
    render(<SpacebogamFunnelAnalytics />);

    expect(hookCalls.at(-1)).toEqual({ companyId: "company-1", rangeDays: 28 });
    expect(document.body.textContent).toContain("공간보감 퍼널·광고 분석");
    expect(document.body.textContent).toContain("네이버 검색광고");
    expect(document.body.textContent).toContain("사이트 문의와 네이버 전환 집계가 연결되지 않았습니다.");
    expect(document.body.textContent).toContain("90,000원");
    expect(document.body.textContent).toContain("현재 진단");
    expect(document.body.textContent).toContain("지금 한눈에 볼 결론");
    expect(document.body.textContent).toContain("광고 귀속 상태");
    expect(document.body.textContent).toContain("유입·문의 통합 비교");
    expect(document.body.textContent).toContain("문제 구간과 원인은 다릅니다.");
    expect(document.body.textContent).toContain("바꾸고, 측정하고, 판정하세요.");
    expect(document.body.textContent).toContain("상담 CTA 위치와 약속 실험");
    expect(document.body.textContent).toContain("최종 결론");
    expect(document.body.textContent).toContain("참여 → 상담 클릭 병목을 먼저 검증하고, 광고 성과 판단은 귀속 확인 뒤에 내리세요.");
    expect(document.body.textContent?.match(/테이블 인사이트/g)).toHaveLength(5);
    expect([...document.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["7일", "28일", "90일"]);
    expect(document.querySelectorAll("canvas[aria-label]")).toHaveLength(5);
    expect(document.querySelectorAll("table[aria-label]")).toHaveLength(5);
    expect(document.querySelector("table[aria-label='UTM 캠페인 볼륨 전환 표']")).toBeNull();
    expect(chartProps.map((props) => props.label)).toEqual(["네이버 캠페인 광고비 및 클릭 혼합 차트", "공간보감 단계별 퍼널 막대 차트", "공간보감 일별 방문 및 문의율 혼합 차트", "공간보감 UTM 캠페인 볼륨 전환 산점도", "공간보감 손실 파레토 혼합 차트"]);
    expect(document.body.textContent).toContain("apt-main");
    const comparisonRows = [...document.querySelectorAll("table[aria-label='유입 및 문의 통합 비교 표'] tbody tr")];
    const naverBlogRow = comparisonRows.find((row) => row.textContent?.includes("네이버 블로그"));
    expect(naverBlogRow?.textContent).toContain("blog/블로그 UTM 신호 없음");
    expect(naverBlogRow?.textContent?.match(/0/g)?.length).toBeGreaterThanOrEqual(2);
    expect(naverBlogRow?.textContent).toContain("추가 측정 필요");
    const unattributedRow = comparisonRows.find((row) => row.textContent?.includes("미분류"));
    expect(unattributedRow?.textContent).toContain("1,100");
    expect(unattributedRow?.textContent).toContain("105");
    expect(document.body.textContent).toContain("UTM 누락 여부를 확인하기 전까지 채널 귀속은 불확실합니다.");
    expect(document.body.textContent).toContain("손실 파레토");
    expect(document.body.textContent).toContain("참여 → 상담 클릭");
    expect(document.body.textContent).toContain("누적 비중");
    const lossPareto = chartProps.at(-1)?.data as { labels: string[]; datasets: Array<{ data: number[] }> };
    expect(lossPareto.labels).toEqual(["방문 → 참여", "참여 → 상담 클릭", "상담 클릭 → 폼 시작", "폼 시작 → 문의 제출"]);
    expect(lossPareto.datasets[0]?.data).toEqual([1_120, 1_060, 200, 140]);
    expect(lossPareto.datasets[1]?.data.at(-1)).toBe(100);
  });

  it("G003 visual keeps each chart table in a compact keyboard-focusable scroll region", () => {
    render(<SpacebogamFunnelAnalytics />);

    const regions = [...document.querySelectorAll("div[tabindex='0'][aria-label]")];
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "유입 및 문의 통합 비교 표 스크롤 영역", "네이버 캠페인 성과 표 스크롤 영역", "단계별 퍼널 표 스크롤 영역", "일별 방문 및 문의율 표 스크롤 영역", "손실 파레토 표 스크롤 영역",
    ]);
    const chartTableRegions = regions.filter((region) => region.getAttribute("aria-label") !== "유입 및 문의 통합 비교 표 스크롤 영역");
    expect(chartTableRegions.every((region) => region.className.includes("max-h-64"))).toBe(true);
    expect(regions.every((region) => (
      region.className.includes("overflow-auto") || region.className.includes("overflow-x-auto")
    ))).toBe(true);
    expect(document.querySelectorAll("details:not([open])")).toHaveLength(4);
    expect([...document.querySelectorAll("details table[aria-label]")].every((table) => {
      const className = table.className;
      return className.includes("table-fixed") && className.includes("text-xs") && className.includes("sm:text-sm") && !className.includes("min-w-");
    })).toBe(true);
    expect(regions.map((region) => region.querySelectorAll("tbody tr").length)).toEqual([6, 2, 5, 25, 4]);
  });

  it("keeps Naver Blog separate from Naver search and surfaces UTM over-attribution", () => {
    const base = report();
    funnelState.data = report({
      counts: { ...base.counts, visits: 1_000, submittedLeads: 100 },
      campaigns: [
        { source: "naver", medium: "search", campaign: "apt-main", visits: 900, submittedLeads: 80, visitToLeadRate: 0.089, sampleStatus: "usable" },
        { source: "naver", medium: "블로그", campaign: "interior-story", visits: 300, submittedLeads: 12, visitToLeadRate: 0.04, sampleStatus: "usable" },
        { source: "google", medium: "cpc", campaign: "brand-blog-retarget", visits: 100, submittedLeads: 3, visitToLeadRate: 0.03, sampleStatus: "usable" },
      ],
    });
    render(<SpacebogamFunnelAnalytics />);

    const comparisonRows = [...document.querySelectorAll("table[aria-label='유입 및 문의 통합 비교 표'] tbody tr")];
    const naverBlogRow = comparisonRows.find((row) => row.textContent?.includes("네이버 블로그"));
    expect(naverBlogRow?.textContent).toContain("300");
    expect(naverBlogRow?.textContent).toContain("12");
    expect(naverBlogRow?.textContent).toContain("4%");
    expect(naverBlogRow?.textContent).not.toContain("brand-blog-retarget");
    expect(document.body.textContent).toContain("네이버 UTM 유입에서 문의 80건이 보이지만 광고 플랫폼 전환은 0건입니다.");
    expect(document.body.textContent).toContain("UTM 합계가 전체보다 방문 300회, 문의 0건 많습니다.");
    const unattributedRow = comparisonRows.find((row) => row.textContent?.includes("미분류"));
    expect(unattributedRow?.textContent?.match(/0/g)?.length).toBeGreaterThanOrEqual(2);
    expect(unattributedRow?.textContent).toContain("추가 측정 필요");
  });

  it("G004 replaces Pareto when ready monotonic data still has a negative loss", () => {
    const base = report();
    funnelState.data = report({ stages: base.stages.map((stage) => stage.key === "consultation" ? { ...stage, dropOffCount: -120 } : stage), quality: { ...base.quality, status: "ready", isMonotonic: true } });
    render(<SpacebogamFunnelAnalytics />);
    expect(document.body.textContent).toContain("손실 파레토 데이터 점검 필요");
    expect([...document.querySelectorAll("canvas[aria-label]")].map((canvas) => canvas.getAttribute("aria-label"))).toEqual(["네이버 캠페인 광고비 및 클릭 혼합 차트", "공간보감 단계별 퍼널 막대 차트", "공간보감 일별 방문 및 문의율 혼합 차트", "공간보감 UTM 캠페인 볼륨 전환 산점도"]);
    expect(document.querySelector("canvas[aria-label='공간보감 손실 파레토 혼합 차트']")).toBeNull();
    expect(document.querySelector("table[aria-label='손실 파레토 표']")).toBeNull();
  });

  it("G003 C002 edge state behavior suppresses improvement action for measurement warnings and hides stale report data on errors", () => {
    const statusCases = [["empty", "아직 측정된 세션이 없어 개선안을 숨깁니다."], ["collecting", "측정 표본을 수집 중이라 개선안을 숨깁니다."], ["stale", "최근 이벤트가 오래되어 측정값을 확인해야 합니다."], ["invalid_sequence", "퍼널 단계 순서가 맞지 않아 측정값을 먼저 점검해야 합니다."]] satisfies Array<[SpacebogamFunnelReport["quality"]["status"], string]>;

    for (const [status, message] of statusCases) {
      const base = report();
      const stages = status === "invalid_sequence"
        ? base.stages.map((stage) => stage.key === "consultation" ? { ...stage, count: 1_800, dropOffCount: -120, dropOffRate: -0.071 } : stage)
        : base.stages;
      funnelState.data = report({ stages, quality: { ...base.quality, status, isMonotonic: status !== "invalid_sequence" } });
      render(<SpacebogamFunnelAnalytics />);
      expect(document.body.textContent).toContain(message);
      expect(document.body.textContent).toContain("손실 파레토 데이터 점검 필요");
      expect(document.body.textContent).toContain("단계별 손실이 음수이거나 측정 품질과 순서가 해석에 적합하지 않아");
      expect(document.body.textContent).not.toContain("상담 CTA를 첫 화면에 고정");
      expect([...document.querySelectorAll("canvas[aria-label]")].map((canvas) => canvas.getAttribute("aria-label"))).toEqual(["네이버 캠페인 광고비 및 클릭 혼합 차트", "공간보감 단계별 퍼널 막대 차트", "공간보감 일별 방문 및 문의율 혼합 차트", "공간보감 UTM 캠페인 볼륨 전환 산점도"]);
      expect(document.querySelector("canvas[aria-label='공간보감 손실 파레토 혼합 차트']")).toBeNull();
      expect(document.querySelector("table[aria-label='손실 파레토 표']")).toBeNull();
      clearRender();
    }

    const errorCases: Array<{ error: Error; copy: string }> = [
      { error: new SpacebogamFunnelApiError("disabled", 503, "spacebogam_funnel_disabled"), copy: "공간보감 퍼널 연동이 비활성화되어 있습니다." },
      { error: new SpacebogamFunnelApiError("not_configured", 404, "spacebogam_funnel_not_configured"), copy: "공간보감 퍼널 연동 설정이 필요합니다." },
      { error: new SpacebogamFunnelApiError("timeout", 504, "spacebogam_funnel_timeout"), copy: "공간보감 응답 시간이 초과되었습니다." },
      { error: new SpacebogamFunnelApiError("invalid_response", 502, "spacebogam_funnel_invalid_response"), copy: "공간보감 응답 형식이 올바르지 않습니다." },
      { error: new SpacebogamFunnelApiError("upstream_error", 502, "spacebogam_funnel_upstream_error"), copy: "공간보감 원본 데이터 요청에 실패했습니다." },
      { error: new Error("invalid credentials"), copy: "공간보감 퍼널 데이터를 불러오지 못했습니다." },
    ];

    for (const { error, copy } of errorCases) {
      funnelState.data = report();
      funnelState.error = error;
      funnelState.isError = true;
      render(<SpacebogamFunnelAnalytics />);
      expect(document.body.textContent).toContain(copy);
      expect(document.body.textContent).not.toContain("apt-main");
      expect(document.body.textContent).not.toContain("상담 CTA를 첫 화면에 고정");
      clearRender();
    }

    expect(document.body.textContent).not.toContain("공간보감 응답 형식이 올바르지 않습니다.");
  });
});
