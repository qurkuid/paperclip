import { useEffect, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  SpacebogamFunnelQualityStatus,
  SpacebogamFunnelRangeDays,
  SpacebogamFunnelReport,
} from "@paperclipai/shared/validators/spacebogam-funnel";
import { spacebogamFunnelQueryKey } from "@/api/spacebogam-funnel";
import { SpacebogamFunnelAnalytics } from "@/pages/SpacebogamFunnelAnalytics";

const COMPANY = "company-storybook";
const RANGES: SpacebogamFunnelRangeDays[] = [7, 28, 90];

type ErrorFixture = "disabled" | "timeout";

let storyOriginalFetch: typeof fetch | null = null;

function rangeFromUrl(url: URL): SpacebogamFunnelRangeDays {
  const value = url.searchParams.get("rangeDays");
  if (value === "7") return 7;
  if (value === "90") return 90;
  return 28;
}

function installFunnelFixture(status: SpacebogamFunnelQualityStatus, error?: ErrorFixture) {
  if (typeof window === "undefined") return;
  if (!storyOriginalFetch) {
    storyOriginalFetch = window.fetch.bind(window);
  }
  const originalFetch = storyOriginalFetch;
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl, window.location.origin);
    if (url.pathname === `/api/companies/${COMPANY}/analytics/spacebogam-funnel`) {
      if (!error) return Response.json(report(rangeFromUrl(url), status));
      const httpStatus = error === "disabled" ? 503 : 504;
      const code = error === "disabled" ? "spacebogam_funnel_disabled" : "spacebogam_funnel_timeout";
      return Response.json({ error: code }, { status: httpStatus });
    }
    return originalFetch(input, init);
  };
}

function restoreFetchFixture() {
  if (typeof window === "undefined" || !storyOriginalFetch) return;
  window.fetch = storyOriginalFetch;
  storyOriginalFetch = null;
}

function stage(
  key: SpacebogamFunnelReport["stages"][number]["key"],
  label: string,
  count: number,
  previousCount: number | null,
): SpacebogamFunnelReport["stages"][number] {
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

function report(rangeDays: SpacebogamFunnelRangeDays, status: SpacebogamFunnelQualityStatus): SpacebogamFunnelReport {
  const ready = status === "ready";
  const collecting = status === "collecting";
  const stale = status === "stale";
  const invalidSequence = status === "invalid_sequence";
  const visits = collecting ? 38 : 2_640;
  const engagedVisits = invalidSequence ? 2_780 : collecting ? 24 : 1_650;
  const consultationClicks = collecting ? 9 : 620;
  const formStarts = collecting ? 4 : 410;
  const submittedLeads = collecting ? 1 : 276;
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    rangeDays,
    generatedAt: "2026-07-25T12:00:00.000+09:00",
    dataThrough: stale ? "2026-07-21T09:30:00.000+09:00" : "2026-07-25T11:30:00.000+09:00",
    collectionStartedAt: "2026-07-01T00:00:00.000+09:00",
    counts: { visits, engagedVisits, consultationClicks, formStarts, submittedLeads },
    stages: [
      stage("visit", "방문", visits, null),
      stage("engaged", "10초 이상 참여", engagedVisits, visits),
      stage("consultation", "상담 CTA 클릭", consultationClicks, engagedVisits),
      stage("form_start", "상담 작성 시작", formStarts, consultationClicks),
      stage("lead", "상담 제출 완료", submittedLeads, formStarts),
    ],
    daily: Array.from({ length: rangeDays }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      visits: collecting ? index + 1 : 72 + index,
      submittedLeads: collecting ? (index === 0 ? 1 : 0) : 7 + (index % 5),
      visitToLeadRate: collecting ? null : 0.09 + index / 1_000,
    })),
    campaigns: [
      { source: "naver", medium: "search", campaign: "apt-main", visits: 920, submittedLeads: 124, visitToLeadRate: 0.135, sampleStatus: "usable" },
      { source: "google", medium: "cpc", campaign: "brand-protect", visits: 510, submittedLeads: 46, visitToLeadRate: 0.09, sampleStatus: "usable" },
      { source: "instagram", medium: "social", campaign: "portfolio-reels", visits: 280, submittedLeads: 14, visitToLeadRate: 0.05, sampleStatus: "usable" },
    ],
    quality: {
      status,
      sampleSessions: visits,
      minimumReadySessions: 50,
      newestEventAt: stale ? "2026-07-21T09:30:00.000+09:00" : "2026-07-25T11:30:00.000+09:00",
      freshnessHours: stale ? 98.5 : 0.5,
      utmTaggedVisitRate: collecting ? 0.42 : 0.86,
      missingDataDays: stale ? ["2026-07-23", "2026-07-24"] : [],
      isMonotonic: !invalidSequence,
      warnings: invalidSequence ? ["참여 세션이 방문 세션보다 크게 집계되었습니다."] : [],
    },
    bottleneck: ready ? { fromStage: "10초 이상 참여", toStage: "상담 CTA 클릭", lostSessions: 1_030, lossRate: 0.624 } : null,
    recommendations: ready
      ? [{
          code: "consultation_cta",
          title: "상담 CTA를 첫 화면에 고정",
          reason: "참여 이후 상담 CTA 클릭 손실이 가장 큽니다.",
          action: "아파트 전문 상담 버튼을 상단에 고정하세요.",
          confidence: "directional",
        }]
      : [],
    legacyBaseline: { source: "spacebogam-v1-fixture" },
  };
}

function makeClient(status: SpacebogamFunnelQualityStatus, error?: ErrorFixture) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY } },
  });
  if (!error) {
    for (const rangeDays of RANGES) {
      client.setQueryData(spacebogamFunnelQueryKey(COMPANY, rangeDays), report(rangeDays, status));
    }
  }
  return client;
}

function Scenario({ status, error }: { status: SpacebogamFunnelQualityStatus; error?: ErrorFixture }) {
  installFunnelFixture(status, error);
  const client = useMemo(() => makeClient(status, error), [error, status]);
  useEffect(() => () => {
    client.clear();
    restoreFetchFixture();
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <SpacebogamFunnelAnalytics />
    </QueryClientProvider>
  );
}

const meta: Meta = {
  title: "Analytics/Spacebogam Funnel",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const Ready: Story = {
  render: () => <Scenario status="ready" />,
};

export const Collecting: Story = {
  render: () => <Scenario status="collecting" />,
};

export const Stale: Story = {
  render: () => <Scenario status="stale" />,
};

export const InvalidSequence: Story = {
  name: "Invalid sequence",
  render: () => <Scenario status="invalid_sequence" />,
};

export const Disabled: Story = {
  render: () => <Scenario status="ready" error="disabled" />,
};

export const Error: Story = {
  name: "Timeout error",
  render: () => <Scenario status="ready" error="timeout" />,
};
