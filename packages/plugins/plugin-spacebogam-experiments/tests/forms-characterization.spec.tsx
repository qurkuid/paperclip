// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateExperimentForm } from "../src/ui/create-panel.js";
import { EntryDrawerPanel } from "../src/ui/entry-panel.js";
import { VariantSetupForm } from "../src/ui/variant-setup.js";
import type { BoardActionInput } from "../src/contracts/actions.js";
import type { ExperimentDetail, RefreshAll } from "../src/ui/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";

type PluginAction = (input: unknown) => Promise<unknown>;

const bridge = vi.hoisted(() => ({
  calls: [] as unknown[],
  action: (async () => ({
    ok: true,
    requestId: "11111111-1111-4111-8111-111111111111",
    experimentId: "22222222-2222-4222-8222-222222222222",
    version: 3,
  })) as PluginAction,
}));

vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  usePluginAction: () => bridge.action,
}));

let container: HTMLDivElement;
let root: Root;
let refreshCalls: number;

beforeEach(() => {
  bridge.calls = [];
  bridge.action = async (input: unknown) => {
    bridge.calls.push(input);
    return {
      ok: true,
      requestId: "11111111-1111-4111-8111-111111111111",
      experimentId: EXPERIMENT_ID,
      version: 3,
    };
  };
  refreshCalls = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function refreshAll(): void {
  refreshCalls += 1;
}

function detail(): ExperimentDetail {
  return {
    experiment: {
      id: EXPERIMENT_ID,
      companyId: "11111111-1111-4111-8111-111111111111",
      title: "상담 CTA 문구",
      hypothesis: "상담 문구가 개선됩니다",
      status: "draft",
      minimumSamplePerVariant: 30,
      linkedIssueId: null,
      responsibleAgentId: null,
      version: 2,
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    variants: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        key: "control",
        name: "현재안",
        description: "",
        isControl: true,
        sortOrder: 0,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
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
  };
}

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function text() {
  return container.textContent ?? "";
}

function field(selector: string) {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (element === null) throw new Error(`field not found: ${selector}`);
  return element;
}

function fill(selector: string, value: string) {
  const target = field(selector);
  const proto = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : target instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter === undefined) throw new Error(`value setter not found: ${selector}`);
  act(() => {
    setter.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit(formText: string) {
  const target = Array.from(container.querySelectorAll("form"))
    .find((candidate) => candidate.textContent?.includes(formText));
  if (target === undefined) throw new Error(`form not found: ${formText}`);
  await act(async () => {
    target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function requireBoardActionCall(index: number): BoardActionInput {
  const call = bridge.calls[index];
  const parsed = call as BoardActionInput;
  expect(parsed).toMatchObject({ action: expect.any(String), payload: expect.any(Object) });
  return parsed;
}

describe("T11 existing form characterization", () => {
  it("pins visible labels and required fields from direct form modules", () => {
    render(
      <>
        <CreateExperimentForm refreshAll={refreshAll as RefreshAll} />
        <VariantSetupForm detail={detail()} refreshAll={refreshAll as RefreshAll} />
        <EntryDrawerPanel
          detail={detail()}
          configured={true}
          refreshAll={refreshAll as RefreshAll}
          open={true}
          onClose={() => undefined}
        />
      </>,
    );

    expect(text()).toContain("새 실험 만들기");
    expect(text()).toContain("실험 이름");
    expect(text()).toContain("가설");
    expect(text()).toContain("변형별 최소 표본");
    expect(text()).toContain("실험 설계");
    expect(text()).toContain("기준안");
    expect(text()).toContain("비교안");
    expect(text()).toContain("상담 결과 기록");
    expect(text()).toContain("변형");
    expect(text()).toContain("결과");
    expect(text()).toContain("CRM 리드 ID");
    expect(text()).toContain("UTM source");
    expect(text()).toContain("UTM campaign");
    expect(field("#sbe-title").getAttribute("required")).toBe("");
    expect(field("#sbe-hypothesis").getAttribute("required")).toBe("");
    expect(field("#sbe-sample").getAttribute("required")).toBe("");
    expect(field("#sbe-control-name").getAttribute("required")).toBe("");
    expect(field("#sbe-challenger-name").getAttribute("required")).toBe("");
    expect(field("#sbe-entry-key").getAttribute("required")).toBe("");
  });

  it("pins direct create, variant, and entry board-action payloads", async () => {
    render(
      <>
        <CreateExperimentForm refreshAll={refreshAll as RefreshAll} />
        <VariantSetupForm detail={detail()} refreshAll={refreshAll as RefreshAll} />
        <EntryDrawerPanel
          detail={detail()}
          configured={true}
          refreshAll={refreshAll as RefreshAll}
          open={true}
          onClose={() => undefined}
        />
      </>,
    );

    fill("#sbe-title", "상담 CTA");
    fill("#sbe-hypothesis", "버튼 문구를 바꾸면 상담 전환이 오른다");
    fill("#sbe-sample", "44");
    await submit("새 실험 만들기");

    fill("#sbe-control-name", "현재 상담 버튼");
    fill("#sbe-challenger-name", "상담 예약 버튼");
    fill("#sbe-control-description", "현재 문구");
    fill("#sbe-challenger-description", "예약 강조 문구");
    await submit("실험 설계");

    fill("#sbe-entry-variant", "44444444-4444-4444-8444-444444444444");
    fill("#sbe-entry-outcome", "won");
    fill("#sbe-entry-key", "lead-alpha");
    fill("#sbe-entry-source", "naver");
    fill("#sbe-entry-campaign", "storage_consult");
    await submit("CRM 리드 ID");

    expect(bridge.calls).toHaveLength(3);
    expect(requireBoardActionCall(0)).toEqual({
      action: "create-experiment",
      payload: {
        title: "상담 CTA",
        hypothesis: "버튼 문구를 바꾸면 상담 전환이 오른다",
        minimumSamplePerVariant: 44,
      },
    });
    expect(requireBoardActionCall(1)).toEqual({
      action: "replace-draft-variants",
      payload: {
        experimentId: EXPERIMENT_ID,
        version: 2,
        variants: [
          {
            key: "control",
            name: "현재 상담 버튼",
            description: "현재 문구",
            isControl: true,
            sortOrder: 0,
          },
          {
            key: "challenger",
            name: "상담 예약 버튼",
            description: "예약 강조 문구",
            isControl: false,
            sortOrder: 1,
          },
        ],
      },
    });
    expect(requireBoardActionCall(2)).toMatchObject({
      action: "create-entry",
      payload: {
        experimentId: EXPERIMENT_ID,
        variantId: "44444444-4444-4444-8444-444444444444",
        leadKey: "lead-alpha",
        outcome: "won",
        outcomeAt: expect.any(String),
        utmSource: "naver",
        utmMedium: null,
        utmCampaign: "storage_consult",
        version: 2,
      },
    });
    expect(refreshCalls).toBe(3);
  });
});
