// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OperationsPanel } from "../src/ui/operations-panel.js";
import type { BoardAction, ExperimentDetail, OperationsOptions, RefreshAll } from "../src/ui/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";

type PluginAction = (input: BoardAction) => Promise<unknown>;

const bridge = vi.hoisted(() => ({
  calls: [] as BoardAction[],
  action: (async (input: BoardAction) => {
    bridge.calls.push(input);
    return {
      ok: true,
      requestId: "11111111-1111-4111-8111-111111111111",
      experimentId: EXPERIMENT_ID,
      version: 3,
    };
  }) as PluginAction,
}));

vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  usePluginAction: () => bridge.action,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.calls = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderPanel(detailOverrides: Partial<ExperimentDetail> = {}) {
  act(() => {
    root.render((
      <OperationsPanel
        detail={detail(detailOverrides)}
        options={options()}
        refreshAll={vi.fn() as RefreshAll}
      />
    ));
  });
}

function buttons() {
  return Array.from(container.querySelectorAll("button"));
}

function clickButton(label: string) {
  const button = buttons().find((candidate) => candidate.textContent === label);
  if (button === undefined) throw new Error(`button not found: ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function detail(overrides: Partial<ExperimentDetail> = {}): ExperimentDetail {
  return {
    experiment: {
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
    },
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
    variantMetrics: [],
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

describe("OperationsPanel governance characterization", () => {
  it("pins draft lifecycle labels and the valid start board action payload", () => {
    renderPanel();

    expect(buttons().map((button) => button.textContent)).toEqual([
      "실험 시작",
      "담당 지정",
      "이슈 연결",
      "주기 검토 켜기",
      "전략 검토 요청",
    ]);

    clickButton("실험 시작");

    expect(bridge.calls).toEqual([
      {
        action: "start-experiment",
        payload: {
          experimentId: EXPERIMENT_ID,
          version: 2,
        },
      },
    ]);
  });
});
