// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import manifest, { ROUTE_PATH } from "../src/manifest.js";
import { SpacebogamExperimentsSidebar } from "../src/ui/index.js";
import { SpacebogamExperimentsPage } from "../src/ui/page.js";
import type {
  Experiment,
  ExperimentDetail,
  OperationsOptions,
  OverviewData,
} from "../src/ui/types.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

type PluginDataCall = {
  readonly name: string;
  readonly params: Record<string, unknown>;
};

const bridge = vi.hoisted(() => ({
  overviewByCompany: new Map<string, OverviewData>(),
  dataByNameAndCompany: new Map<string, unknown>(),
  calls: [] as PluginDataCall[],
}));

vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  useHostNavigation: () => ({
    linkProps: (href: string) => ({ href }),
  }),
  usePluginAction: () => async () => ({ ok: true }),
  usePluginData: <T,>(name: string, params: Record<string, unknown>) => {
    bridge.calls.push({ name, params });
    const companyId = typeof params.companyId === "string" ? params.companyId : "";
    const experimentId = typeof params.experimentId === "string" ? params.experimentId : "";
    const data = name === "overview"
      ? bridge.overviewByCompany.get(companyId)
      : name === "experiment" && experimentId !== ""
        ? bridge.dataByNameAndCompany.get(`${name}:${companyId}:${experimentId}`)
      : bridge.dataByNameAndCompany.get(`${name}:${companyId}`);
    return {
      data: data as T | undefined,
      loading: false,
      error: null,
      refresh: () => undefined,
    };
  },
}));

vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-chart="bar" />,
  Doughnut: () => <div data-chart="doughnut" />,
  Line: () => <div data-chart="line" />,
}));

const baseContext = {
  companyId: COMPANY_A,
  companyPrefix: "CMP",
  projectId: null,
  entityId: null,
  entityType: null,
  userId: "user-1",
};

function overview(companyId: string, configured = true): OverviewData {
  return {
    pluginId: "paperclipai.plugin-spacebogam-experiments",
    companyId,
    status: "ready",
    configured,
    experiments: [
      {
        id: "draft-experiment",
        companyId,
        title: "상담 CTA 문구",
        hypothesis: "상담 문구 변경으로 전환을 올린다",
        status: "draft",
        minimumSamplePerVariant: 30,
        version: 1,
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
      {
        id: "history-experiment",
        companyId,
        title: "완료된 메시지 실험",
        hypothesis: "완료 이력을 남긴다",
        status: "completed",
        minimumSamplePerVariant: 30,
        version: 4,
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
      {
        id: "cancelled-experiment",
        companyId,
        title: "취소된 실험",
        hypothesis: "운영 표면에서 숨긴다",
        status: "cancelled",
        minimumSamplePerVariant: 30,
        version: 2,
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
    ],
  };
}

function staticRender(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

function experiment(companyId: string, id: string, title: string): Experiment {
  return {
    id,
    companyId,
    title,
    hypothesis: "상담 문구 변경으로 전환을 올린다",
    status: "running",
    minimumSamplePerVariant: 30,
    version: 1,
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function detail(value: Experiment): ExperimentDetail {
  return {
    experiment: value,
    variants: [],
    variantMetrics: [],
    snapshots: [],
    recentObservations: [],
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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.calls = [];
  bridge.overviewByCompany.clear();
  bridge.dataByNameAndCompany.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", window.location.pathname);
  vi.restoreAllMocks();
});

describe("Spacebogam experiment navigation slots", () => {
  it("declares the main sidebar and direct page without a duplicate route sidebar", () => {
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "sidebar",
        exportName: "SpacebogamExperimentsSidebar",
      }),
      expect.objectContaining({
        type: "page",
        exportName: "SpacebogamExperimentsPage",
        routePath: ROUTE_PATH,
      }),
    ]));
    expect(manifest.ui?.slots).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "routeSidebar",
        routePath: ROUTE_PATH,
      }),
    ]));
  });

  it("renders only the overview link in the main sidebar company context", () => {
    const html = staticRender(<SpacebogamExperimentsSidebar context={baseContext} />);

    expect(html).toContain(`href="/${ROUTE_PATH}"`);
    expect(html).toContain("전체 현황");
    expect(html).not.toContain("퍼널 분석");
    expect(html).not.toContain("의사결정");
    expect(staticRender(<SpacebogamExperimentsSidebar context={{ ...baseContext, companyId: null }} />))
      .toBe("");
  });

  it("does not query experiment data while rendering the main sidebar link", () => {
    bridge.calls = [];
    staticRender(<SpacebogamExperimentsSidebar context={baseContext} />);

    expect(bridge.calls).toEqual([]);
  });

  it("clears the selected experiment data key before loading another company page", () => {
    const companyAExperiment = experiment(COMPANY_A, "experiment-a", "A 회사 실험");
    const companyBExperiment = experiment(COMPANY_B, "experiment-b", "B 회사 실험");
    bridge.overviewByCompany.set(COMPANY_A, {
      ...overview(COMPANY_A),
      experiments: [companyAExperiment],
    });
    bridge.overviewByCompany.set(COMPANY_B, {
      ...overview(COMPANY_B),
      experiments: [companyBExperiment],
    });
    bridge.dataByNameAndCompany.set(`experiment:${COMPANY_A}`, detail(companyAExperiment));
    bridge.dataByNameAndCompany.set(`experiment:${COMPANY_B}`, detail(companyBExperiment));
    bridge.dataByNameAndCompany.set(`operations-options:${COMPANY_A}`, options());
    bridge.dataByNameAndCompany.set(`operations-options:${COMPANY_B}`, options());

    act(() => {
      root.render(<SpacebogamExperimentsPage context={baseContext} />);
    });
    bridge.calls = [];

    act(() => {
      root.render((
        <SpacebogamExperimentsPage
          context={{ ...baseContext, companyId: COMPANY_B, companyPrefix: "OTHER" }}
        />
      ));
    });

    expect(bridge.calls).toContainEqual({
      name: "experiment",
      params: { companyId: COMPANY_B, experimentId: undefined },
    });
    expect(bridge.calls).not.toContainEqual({
      name: "experiment",
      params: { companyId: COMPANY_B, experimentId: companyAExperiment.id },
    });
  });

  it("selects the matching experiment on direct hash load", () => {
    const defaultExperiment = experiment(COMPANY_A, "default-experiment", "기본 실험");
    const hashExperiment = experiment(COMPANY_A, "hash-target", "해시 선택 실험");
    bridge.overviewByCompany.set(COMPANY_A, {
      ...overview(COMPANY_A),
      experiments: [defaultExperiment, hashExperiment],
    });
    bridge.dataByNameAndCompany.set(
      `experiment:${COMPANY_A}:${defaultExperiment.id}`,
      detail(defaultExperiment),
    );
    bridge.dataByNameAndCompany.set(
      `experiment:${COMPANY_A}:${hashExperiment.id}`,
      detail(hashExperiment),
    );
    bridge.dataByNameAndCompany.set(`operations-options:${COMPANY_A}`, options());
    window.history.replaceState(null, "", `#experiment-${hashExperiment.id}`);

    act(() => {
      root.render(<SpacebogamExperimentsPage context={baseContext} />);
    });

    expect(bridge.calls).toContainEqual({
      name: "experiment",
      params: { companyId: COMPANY_A, experimentId: hashExperiment.id },
    });
    expect(container.querySelector(`#experiment-${hashExperiment.id}`))
      .toHaveProperty("ariaSelected", "true");
    expect(container.textContent).toContain("해시 선택 실험");
  });

  it("updates selection on hashchange without retaining the prior experiment", () => {
    const priorExperiment = experiment(COMPANY_A, "prior-experiment", "기존 선택 실험");
    const hashExperiment = experiment(COMPANY_A, "hash-change-target", "해시 변경 실험");
    bridge.overviewByCompany.set(COMPANY_A, {
      ...overview(COMPANY_A),
      experiments: [priorExperiment, hashExperiment],
    });
    bridge.dataByNameAndCompany.set(
      `experiment:${COMPANY_A}:${priorExperiment.id}`,
      detail(priorExperiment),
    );
    bridge.dataByNameAndCompany.set(
      `experiment:${COMPANY_A}:${hashExperiment.id}`,
      detail(hashExperiment),
    );
    bridge.dataByNameAndCompany.set(`operations-options:${COMPANY_A}`, options());

    act(() => {
      root.render(<SpacebogamExperimentsPage context={baseContext} />);
    });

    expect(container.querySelector(`#experiment-${priorExperiment.id}`))
      .toHaveProperty("ariaSelected", "true");

    bridge.calls = [];
    window.history.replaceState(null, "", `#experiment-${hashExperiment.id}`);
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(bridge.calls).toContainEqual({
      name: "experiment",
      params: { companyId: COMPANY_A, experimentId: hashExperiment.id },
    });
    expect(container.querySelector(`#experiment-${priorExperiment.id}`))
      .toHaveProperty("ariaSelected", "false");
    expect(container.querySelector(`#experiment-${hashExperiment.id}`))
      .toHaveProperty("ariaSelected", "true");
    expect(container.textContent).toContain("해시 변경 실험");
  });

  it("ignores malformed experiment hashes and keeps the overview usable", () => {
    const defaultExperiment = experiment(COMPANY_A, "default-experiment", "기본 실험");
    bridge.overviewByCompany.set(COMPANY_A, {
      ...overview(COMPANY_A),
      experiments: [defaultExperiment],
    });
    bridge.dataByNameAndCompany.set(
      `experiment:${COMPANY_A}:${defaultExperiment.id}`,
      detail(defaultExperiment),
    );
    bridge.dataByNameAndCompany.set(`operations-options:${COMPANY_A}`, options());
    window.history.replaceState(null, "", "#experiment-../../other");

    act(() => {
      root.render(<SpacebogamExperimentsPage context={baseContext} />);
    });

    expect(container.querySelector(`#experiment-${defaultExperiment.id}`))
      .toHaveProperty("ariaSelected", "true");
    expect(container.textContent).toContain("기본 실험");
  });
});
