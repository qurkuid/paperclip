// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { SpacebogamExperimentsPage } from "../src/ui/page.js";
import type {
  Experiment,
  ExperimentDetail,
  OperationsOptions,
  OverviewData,
  Snapshot,
} from "../src/ui/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";

type BridgeState = {
  data: unknown;
  loading: boolean;
  error: Error | null;
};
type ActionRunner = (input: unknown) => Promise<unknown>;

const bridge = vi.hoisted(() => ({
  states: new Map<string, BridgeState>(),
  refreshes: [] as string[],
  action: (async () => ({ ok: true })) as ActionRunner,
}));

vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  useHostNavigation: () => ({
    linkProps: (href: string) => ({ href }),
  }),
  usePluginAction: () => bridge.action,
  usePluginData: <T,>(name: string) => {
    const state = bridge.states.get(name) ?? {
      data: null,
      loading: false,
      error: null,
    };
    return {
      data: state.data as T | null,
      loading: state.loading,
      error: state.error,
      refresh: () => {
        bridge.refreshes.push(name);
      },
    };
  },
}));

vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-chart="bar" />,
  Doughnut: () => <div data-chart="doughnut" />,
  Line: () => <div data-chart="line" />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.states.clear();
  bridge.refreshes = [];
  bridge.action = async () => ({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderPage() {
  act(() => {
    root.render((
      <SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />
    ));
  });
}

function setBridgeState(name: string, state: BridgeState) {
  bridge.states.set(name, state);
}

function setReadyOverview(data: OverviewData) {
  setBridgeState("overview", { data, loading: false, error: null });
  setBridgeState("operations-options", { data: options(), loading: false, error: null });
}

function text() {
  return container.textContent ?? "";
}

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent === label);
  if (button === undefined) throw new Error(`button not found: ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: EXPERIMENT_ID,
    companyId: COMPANY_ID,
    title: "상담 CTA 문구",
    hypothesis: "상담 문구를 바꾸면 전환이 오른다",
    status: "draft",
    minimumSamplePerVariant: 30,
    linkedIssueId: null,
    responsibleAgentId: null,
    version: 2,
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function overview(overrides: Partial<OverviewData> = {}): OverviewData {
  return {
    pluginId: "paperclipai.plugin-spacebogam-experiments",
    companyId: COMPANY_ID,
    status: "ready",
    configured: true,
    experiments: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "snapshot-1",
    recordedAt: "2026-07-27T00:00:00.000Z",
    variantMetrics: [],
    funnelDataThrough: null,
    funnelQuality: null,
    source: "manual",
    ...overrides,
  };
}

function detail(overrides: Partial<ExperimentDetail> = {}): ExperimentDetail {
  return {
    experiment: experiment(),
    variants: [
      {
        id: "variant-control",
        key: "control",
        name: "현재안",
        description: "",
        isControl: true,
        sortOrder: 0,
      },
      {
        id: "variant-challenger",
        key: "challenger",
        name: "개선안",
        description: "",
        isControl: false,
        sortOrder: 1,
      },
    ],
    variantMetrics: [
      {
        variantId: "variant-control",
        key: "control",
        isControl: true,
        sample: 0,
        won: 0,
        lost: 0,
        pending: 0,
        disqualified: 0,
        resolved: 0,
        wonRate: null,
        absoluteDeltaFromControl: null,
        relativeLiftFromControl: null,
      },
      {
        variantId: "variant-challenger",
        key: "challenger",
        isControl: false,
        sample: 0,
        won: 0,
        lost: 0,
        pending: 0,
        disqualified: 0,
        resolved: 0,
        wonRate: null,
        absoluteDeltaFromControl: null,
        relativeLiftFromControl: null,
      },
    ],
    snapshots: [],
    recentObservations: [],
    ...overrides,
  };
}

function options(): OperationsOptions {
  return {
    agents: [],
    issues: [],
    routine: {
      resolutionStatus: "missing",
      id: null,
      status: "paused",
      assigneeAgentId: null,
    },
  };
}

describe("Spacebogam experiment page state integration", () => {
  it("pins the existing loading and empty-create states while updating refresh copy to five minutes", () => {
    setBridgeState("overview", { data: null, loading: true, error: null });
    setBridgeState("experiment", { data: null, loading: false, error: null });

    renderPage();

    expect(text()).toContain("실험 운영 데이터를 불러오는 중");

    setReadyOverview(overview());
    act(() => {
      root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />);
    });

    expect(text()).toContain("화면 데이터는 5분마다 자동 갱신됩니다.");
    expect(text()).toContain("첫 실험을 운영 대장에 등록하세요");
    expect(text()).toContain("실험과 운영 이슈 생성");
  });

  it("uses a five-minute polling timer and clears it on unmount", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    setReadyOverview(overview());
    setBridgeState("experiment", { data: null, loading: false, error: null });

    renderPage();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);

    act(() => root.unmount());

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("renders plugin-not-ready, invalid overview, and worker-error states distinctly", () => {
    setReadyOverview(overview({ configured: false }));
    setBridgeState("experiment", { data: null, loading: false, error: null });

    renderPage();

    expect(text()).toContain("Spacebogam 실험 플러그인 설정이 필요합니다");
    expect(text()).toContain("플러그인 설정");

    setBridgeState("overview", {
      data: { pluginId: "broken" },
      loading: false,
      error: null,
    });
    act(() => root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />));

    expect(text()).toContain("실험 운영 응답 형식이 올바르지 않습니다");

    setBridgeState("overview", {
      data: null,
      loading: false,
      error: new Error("worker timed out"),
    });
    act(() => root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />));

    expect(text()).toContain("작업자가 실험 운영 데이터를 보내지 못했습니다");
    expect(text()).toContain("worker timed out");
  });

  it("renders stale response and stale funnel measurement warnings separately", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T00:00:00.000Z"));
    setReadyOverview(overview({ experiments: [experiment()] }));
    setBridgeState("experiment", {
      data: detail({ snapshots: [snapshot({ funnelQuality: "stale" })] }),
      loading: false,
      error: null,
    });

    renderPage();

    expect(text()).toContain("퍼널 측정 데이터가 오래되었습니다.");

    vi.setSystemTime(new Date("2026-07-27T00:05:00.000Z"));
    act(() => {
      root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />);
    });

    expect(text()).toContain("마지막 응답이 5분을 지나 최신 상태가 아닐 수 있습니다.");
    expect(text()).toContain("지금 새로고침");
  });

  it("renders selected experiment chart region after detail loads", () => {
    setReadyOverview(overview({ experiments: [experiment({ status: "running" })] }));
    setBridgeState("experiment", {
      data: detail({
        variantMetrics: [
          {
            variantId: "variant-control",
            key: "control",
            isControl: true,
            sample: 20,
            won: 4,
            lost: 6,
            pending: 10,
            disqualified: 0,
            resolved: 10,
            wonRate: 0.4,
            absoluteDeltaFromControl: 0,
            relativeLiftFromControl: 0,
          },
          {
            variantId: "variant-challenger",
            key: "challenger",
            isControl: false,
            sample: 25,
            won: 7,
            lost: 5,
            pending: 13,
            disqualified: 0,
            resolved: 12,
            wonRate: 0.5833,
            absoluteDeltaFromControl: 0.18,
            relativeLiftFromControl: 0.46,
          },
        ],
      }),
      loading: false,
      error: null,
    });

    renderPage();

    expect(container.querySelector('section[aria-label="실험 성과 차트"]')).not.toBeNull();
  });

  it("opens and closes the consultation entry drawer from the operations rail", () => {
    setReadyOverview(overview({ experiments: [experiment({ status: "running" })] }));
    setBridgeState("experiment", {
      data: detail(),
      loading: false,
      error: null,
    });

    renderPage();

    expect(text()).toContain("상담 결과는 필요할 때 열어 기록합니다.");
    expect(container.querySelector(".sbe-drawer")).toBeNull();

    clickButton("상담 결과 기록 열기");

    expect(container.querySelector(".sbe-drawer")?.textContent).toContain("상담 결과 기록");

    clickButton("닫기");

    expect(container.querySelector(".sbe-drawer")).toBeNull();
  });

  it("renders an adjacent accessible table for the selected experiment metrics", () => {
    setReadyOverview(overview({ experiments: [experiment({ status: "running" })] }));
    setBridgeState("experiment", {
      data: detail({
        variantMetrics: [
          {
            variantId: "variant-control",
            key: "control",
            isControl: true,
            sample: 20,
            won: 4,
            lost: 6,
            pending: 10,
            disqualified: 0,
            resolved: 10,
            wonRate: 0.4,
            absoluteDeltaFromControl: 0,
            relativeLiftFromControl: 0,
          },
        ],
      }),
      loading: false,
      error: null,
    });

    renderPage();

    const tableSection = container.querySelector(
      'section[aria-labelledby="sbe-result-table-title"]',
    );
    expect(tableSection?.textContent).toContain("변형별 수치 비교");
    expect(tableSection?.querySelector("table")?.textContent).toContain("현재안");
  });

  it("does not render misleading chart canvases when selected experiment metrics are empty", () => {
    setReadyOverview(overview({ experiments: [experiment({ status: "running" })] }));
    setBridgeState("experiment", {
      data: detail({ variants: [], variantMetrics: [], snapshots: [] }),
      loading: false,
      error: null,
    });

    renderPage();

    expect(container.querySelector("[data-chart]")).toBeNull();
    expect(container.querySelector('[aria-label="표본이 없는 실험 결과"]')).not.toBeNull();
  });

  it("exposes Korean chart labels through screen-reader image text", () => {
    setReadyOverview(overview({ experiments: [experiment({ status: "running" })] }));
    const selectedDetail = detail();
    setBridgeState("experiment", {
      data: detail({
        snapshots: [
          snapshot({
            variantMetrics: selectedDetail.variantMetrics,
          }),
        ],
      }),
      loading: false,
      error: null,
    });

    renderPage();

    const chartLabels = Array.from(container.querySelectorAll('[role="img"]'))
      .map((element) => element.getAttribute("aria-label"));
    expect(chartLabels).toContain("그룹 계약 전환 비교 막대 차트");
    expect(chartLabels).toContain("표본 및 guardrail 진행 막대 차트");
    expect(chartLabels).toContain("누적 전환 추세 선 차트");
  });

  it("renders selected-missing, invalid detail, and detail worker-error states distinctly", () => {
    setReadyOverview(overview({ experiments: [experiment()] }));
    setBridgeState("experiment", { data: null, loading: false, error: null });

    renderPage();

    expect(text()).toContain("선택한 실험을 찾을 수 없습니다");

    setBridgeState("experiment", {
      data: { experiment: { id: EXPERIMENT_ID }, variants: [] },
      loading: false,
      error: null,
    });
    act(() => root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />));

    expect(text()).toContain("선택한 실험 응답 형식이 올바르지 않습니다");

    setBridgeState("experiment", {
      data: null,
      loading: false,
      error: new Error("detail worker failed"),
    });
    act(() => root.render(<SpacebogamExperimentsPage context={{ companyId: COMPANY_ID }} />));

    expect(text()).toContain("선택한 실험 집계를 불러오지 못했습니다");
    expect(text()).toContain("detail worker failed");
  });

  it("renders conflict recovery guidance on mutation surfaces without duplicating plugin state", async () => {
    setReadyOverview(overview({ experiments: [experiment()] }));
    setBridgeState("experiment", { data: detail(), loading: false, error: null });
    bridge.action = async () => ({
      ok: false,
      code: "invalid_version",
      message: "Experiment version is stale.",
      requestId: "11111111-1111-4111-8111-111111111111",
    });

    renderPage();

    await act(async () => {
      clickButton("실험 시작");
    });

    expect(text()).toContain("최신 내용을 다시 불러왔습니다.");
    expect(text()).toContain("다시 적용하세요.");
    expect(bridge.refreshes).toContain("overview");
    expect(bridge.refreshes).toContain("experiment");
  });
});
