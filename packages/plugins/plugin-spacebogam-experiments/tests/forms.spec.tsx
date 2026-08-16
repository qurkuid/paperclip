// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CreateExperimentForm,
  CreateExperimentPanel,
  EntryDrawerPanel,
  EntryPanel,
  VariantSetup,
  VariantSetupForm,
} from "../src/ui/forms.js";
import type { BoardActionInput } from "../src/contracts/actions.js";
import type { ExperimentDetail, RefreshAll } from "../src/ui/types.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXPERIMENT_ID = "22222222-2222-4222-8222-222222222222";
const CONTROL_VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const CHALLENGER_VARIANT_ID = "44444444-4444-4444-8444-444444444444";

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

function experiment(overrides: Partial<ExperimentDetail["experiment"]> = {}) {
  return {
    id: EXPERIMENT_ID,
    companyId: "11111111-1111-4111-8111-111111111111",
    title: "상담 CTA 문구",
    hypothesis: "상담 문구가 개선됩니다",
    status: "draft" as const,
    minimumSamplePerVariant: 30,
    linkedIssueId: null,
    responsibleAgentId: null,
    version: 2,
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<ExperimentDetail> = {}): ExperimentDetail {
  return {
    experiment: experiment(),
    variants: [
      {
        id: CONTROL_VARIANT_ID,
        key: "control",
        name: "현재안",
        description: "",
        isControl: true,
        sortOrder: 0,
      },
      {
        id: CHALLENGER_VARIANT_ID,
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

function button(label: string) {
  const element = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent === label);
  if (element === undefined) throw new Error(`button not found: ${label}`);
  return element;
}

async function click(label: string) {
  const target = button(label);
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return target;
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

function check(selector: string, checked: boolean) {
  const target = container.querySelector<HTMLInputElement>(selector);
  if (target === null) throw new Error(`checkbox not found: ${selector}`);
  if (target.checked === checked) return;
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

describe("T11 form primitives", () => {
  it("exports the stable forms surface", () => {
    expect(CreateExperimentForm).toBeTypeOf("function");
    expect(CreateExperimentPanel).toBe(CreateExperimentForm);
    expect(VariantSetupForm).toBeTypeOf("function");
    expect(VariantSetup).toBe(VariantSetupForm);
    expect(EntryPanel).toBeTypeOf("function");
    expect(EntryDrawerPanel).toBeTypeOf("function");
  });

  it("blocks malformed create and variant submissions before board actions", async () => {
    render(
      <>
        <CreateExperimentForm refreshAll={refreshAll as RefreshAll} />
        <VariantSetupForm detail={detail()} refreshAll={refreshAll as RefreshAll} />
      </>,
    );

    expect(button("실험과 운영 이슈 생성").disabled).toBe(true);
    expect(button("실험 설계 저장").disabled).toBe(false);

    await submit("새 실험 만들기");
    expect(text()).toContain("실험 이름을 입력하세요");

    fill("#sbe-title", "상담 CTA");
    fill("#sbe-hypothesis", "전환 가설");
    fill("#sbe-sample", "100001");
    await submit("새 실험 만들기");

    fill("#sbe-sample", "30");
    fill("#sbe-control-name", "   ");
    await submit("실험 설계");

    expect(bridge.calls).toHaveLength(0);
    expect(text()).toContain("표본은 1 이상 100000 이하로 입력하세요");
    expect(text()).toContain("기준안 이름을 입력하세요");
  });

  it("records exact create and draft variant payloads", async () => {
    render(
      <>
        <CreateExperimentForm refreshAll={refreshAll as RefreshAll} />
        <VariantSetupForm detail={detail()} refreshAll={refreshAll as RefreshAll} />
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

    expect(bridge.calls).toHaveLength(2);
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
    expect(refreshCalls).toBe(2);
  });

  it("keeps script-like create and campaign input inert while preserving payload text", async () => {
    render(
      <>
        <CreateExperimentForm refreshAll={refreshAll as RefreshAll} />
        <EntryDrawerPanel
          detail={detail()}
          configured={true}
          refreshAll={refreshAll as RefreshAll}
          open={true}
          onClose={() => undefined}
        />
      </>,
    );

    fill("#sbe-title", "<script>alert(1)</script>");
    fill("#sbe-hypothesis", "문자열은 실행되지 않아야 한다");
    await submit("새 실험 만들기");
    fill("#sbe-entry-key", "lead-alpha");
    fill("#sbe-entry-campaign", "<script>alert(2)</script>");
    await submit("CRM 리드 ID");

    expect(container.querySelector("script")).toBeNull();
    expect(requireBoardActionCall(0).payload).toMatchObject({
      title: "<script>alert(1)</script>",
    });
    expect(requireBoardActionCall(1).payload).toMatchObject({
      utmCampaign: "<script>alert(2)</script>",
    });
  });

  it("warns on PII-looking lead keys and blocks submit until acknowledgement", async () => {
    const onClose = vi.fn();
    render(
      <EntryDrawerPanel
        detail={detail()}
        configured={true}
        refreshAll={refreshAll as RefreshAll}
        open={true}
        onClose={onClose}
      />,
    );

    fill("#sbe-entry-key", "lead@example.invalid");

    expect(text()).toContain("이메일/휴대폰 패턴");
    expect(field("#sbe-entry-outcome").disabled).toBe(true);
    expect(button("결과 반영").disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    check("#sbe-entry-pii-ack", true);
    expect(field("#sbe-entry-outcome").disabled).toBe(false);
    expect(button("결과 반영").disabled).toBe(false);
    await click("결과 반영");

    expect(bridge.calls).toHaveLength(1);
    expect(requireBoardActionCall(0)).toMatchObject({
      action: "create-entry",
      payload: {
        experimentId: EXPERIMENT_ID,
        variantId: CONTROL_VARIANT_ID,
        leadKey: "lead@example.invalid",
        outcome: "pending",
        outcomeAt: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        version: 2,
      },
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(refreshCalls).toBe(1);
  });

  it("does not render raw lead key from success or invalid action result display", async () => {
    bridge.action = async (input: unknown) => {
      bridge.calls.push(input);
      return {
        ok: true,
        requestId: "11111111-1111-4111-8111-111111111111",
        experimentId: EXPERIMENT_ID,
        version: 3,
        leadKey: "lead-sensitive-201",
      };
    };
    render(
      <EntryDrawerPanel
        detail={detail()}
        configured={true}
        refreshAll={refreshAll as RefreshAll}
        open={true}
        onClose={() => undefined}
      />,
    );

    fill("#sbe-entry-key", "lead-sensitive-201");
    await submit("CRM 리드 ID");

    expect(text()).toContain("작업 응답이 올바르지 않습니다.");
    expect(text()).not.toContain("lead-sensitive-201");
    expect(field("#sbe-entry-key").value).toBe("");
  });

  it("closes on successful drawer save, closes on cancel, and reopens without sensitive draft", async () => {
    function Host() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>다시 열기</button>
          <EntryDrawerPanel
            detail={detail()}
            configured={true}
            refreshAll={refreshAll as RefreshAll}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Host />);
    fill("#sbe-entry-key", "lead-sensitive-202");
    await click("닫기");
    expect(container.querySelector("#sbe-entry-key")).toBeNull();

    await click("다시 열기");
    expect(field("#sbe-entry-key").value).toBe("");

    fill("#sbe-entry-key", "lead-beta");
    await submit("CRM 리드 ID");
    expect(container.querySelector("#sbe-entry-key")).toBeNull();
    expect(bridge.calls).toHaveLength(1);
  });

  it("blocks entry actions when hashing is not configured or variants are missing", async () => {
    render(
      <>
        <EntryPanel detail={detail()} configured={false} refreshAll={refreshAll as RefreshAll} />
        <EntryDrawerPanel
          detail={detail({ variants: [] })}
          configured={true}
          refreshAll={refreshAll as RefreshAll}
          open={true}
          onClose={() => undefined}
        />
      </>,
    );

    fill("#sbe-entry-key", "lead-gamma");
    expect(button("결과 반영").disabled).toBe(true);
    await submit("CRM 리드 ID");

    expect(text()).toContain("리드 해시 비밀 설정 후 결과를 기록할 수 있습니다.");
    expect(text()).toContain("실험 설계를 먼저 저장하세요.");
    expect(bridge.calls).toHaveLength(0);
  });

  it("refreshes stale version conflicts without claiming success", async () => {
    bridge.action = async (input: unknown) => {
      bridge.calls.push(input);
      return {
        ok: false,
        code: "invalid_version",
        message: "Experiment version is stale",
        requestId: "11111111-1111-4111-8111-111111111111",
      };
    };
    render(<VariantSetupForm detail={detail()} refreshAll={refreshAll as RefreshAll} />);

    await submit("실험 설계");

    expect(text()).toContain("최신 내용을 다시 불러왔습니다.");
    expect(text()).toContain("다시 적용하세요");
    expect(text()).not.toContain("기준안과 비교안을 저장했습니다.");
    expect(bridge.calls).toHaveLength(1);
    expect(requireBoardActionCall(0).payload).toMatchObject({ version: 2 });
    expect(refreshCalls).toBe(1);
  });

  it("preserves a conflicted entry draft and reapplies it with the refreshed version", async () => {
    const onClose = vi.fn();
    bridge.action = async (input: unknown) => {
      bridge.calls.push(input);
      if (bridge.calls.length === 1) {
        return {
          ok: false,
          code: "invalid_version",
          message: "Experiment version is stale",
          requestId: "11111111-1111-4111-8111-111111111111",
        };
      }
      return {
        ok: true,
        requestId: "11111111-1111-4111-8111-111111111111",
        experimentId: EXPERIMENT_ID,
        version: 4,
      };
    };

    function Host() {
      const [version, setVersion] = React.useState(2);
      return (
        <EntryDrawerPanel
          detail={detail({ experiment: experiment({ version }) })}
          configured={true}
          refreshAll={() => setVersion(3)}
          open={true}
          onClose={onClose}
        />
      );
    }

    render(<Host />);
    fill("#sbe-entry-key", "010-1234-5678");
    fill("#sbe-entry-source", "naver");
    check("#sbe-entry-pii-ack", true);
    await submit("CRM 리드 ID");

    expect(field("#sbe-entry-key").value).toBe("010-1234-5678");
    expect(container.querySelector<HTMLInputElement>("#sbe-entry-pii-ack")?.checked).toBe(true);
    expect(text()).toContain("변경 요약");
    expect(text()).toContain("현재 화면 버전 3");
    expect(text()).not.toContain("010-1234-5678");
    expect(button("다시 적용")).toBeDefined();
    expect(requireBoardActionCall(0).payload).toMatchObject({ version: 2 });
    expect(onClose).not.toHaveBeenCalled();

    await click("다시 적용");

    expect(bridge.calls).toHaveLength(2);
    expect(requireBoardActionCall(1).payload).toMatchObject({
      version: 3,
      leadKey: "010-1234-5678",
      utmSource: "naver",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
