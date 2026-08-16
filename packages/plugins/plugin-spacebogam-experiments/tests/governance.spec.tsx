// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictReapplyNotice,
  DestructiveActionButton,
  LifecycleGovernanceControls,
  PendingApprovalStatus,
} from "../src/ui/governance.js";
import { OperationsPanel } from "../src/ui/operations-panel.js";
import type { BoardAction, ExperimentDetail, OperationsOptions, RefreshAll } from "../src/ui/types.js";

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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.restoreAllMocks();
});

function text() {
  return container.textContent ?? "";
}

function buttons() {
  return Array.from(container.querySelectorAll("button"));
}

function buttonByLabel(label: string) {
  const button = buttons().find((candidate) => candidate.textContent === label);
  if (button === undefined) throw new Error(`button not found: ${label}`);
  return button;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function inputByLabelText(labelText: string) {
  const label = Array.from(container.querySelectorAll("label"))
    .find((candidate) => candidate.textContent === labelText);
  if (label === undefined) throw new Error(`label not found: ${labelText}`);
  const htmlFor = label.getAttribute("for");
  if (htmlFor === null) throw new Error(`label missing htmlFor: ${labelText}`);
  const input = container.querySelector<HTMLInputElement>(`#${htmlFor}`);
  if (input === null) throw new Error(`input not found: ${htmlFor}`);
  return input;
}

function changeInput(input: HTMLInputElement, value: string) {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  act(() => {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function renderOperationsPanel({
  detail: detailValue = detail(),
  options: optionsValue = options(),
}: {
  readonly detail?: ExperimentDetail;
  readonly options?: OperationsOptions;
} = {}) {
  act(() => {
    root.render((
      <OperationsPanel
        detail={detailValue}
        options={optionsValue}
        refreshAll={vi.fn() as RefreshAll}
      />
    ));
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

function options(overrides: Partial<OperationsOptions> = {}): OperationsOptions {
  return {
    agents: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "운영 에이전트",
        title: "마케팅 검토",
        status: "active",
      },
    ],
    issues: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        identifier: "PAP-123",
        title: "상담 CTA 검토",
        status: "open",
      },
    ],
    routine: {
      resolutionStatus: "missing",
      id: null,
      status: "paused",
      assigneeAgentId: null,
    },
    ...overrides,
  };
}

describe("board governance UI controls", () => {
  it("disables and explains an invalid completed to start lifecycle transition", () => {
    const onAction = vi.fn();

    act(() => {
      root.render((
        <LifecycleGovernanceControls
          status="completed"
          requestedAction="start"
          busy={false}
          variantCount={2}
          onAction={onAction}
        />
      ));
    });

    const startButton = buttonByLabel("실험 시작");
    expect(startButton.disabled).toBe(true);
    expect(text()).toContain("완료된 실험은 다시 시작할 수 없습니다.");

    click(startButton);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("requires explicit typed confirmation before cancel callback fires", () => {
    const onConfirm = vi.fn();

    act(() => {
      root.render((
        <DestructiveActionButton
          action="cancel"
          disabled={false}
          onConfirm={onConfirm}
        />
      ));
    });

    click(buttonByLabel("실험 취소"));
    expect(text()).toContain("취소를 입력하면 실험을 취소합니다.");
    expect(buttonByLabel("취소 확정").disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    changeInput(inputByLabelText("확인 문구"), "취소");
    const confirmButton = buttonByLabel("취소 확정");
    expect(confirmButton.disabled).toBe(false);
    click(confirmButton);

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith("cancel");
  });

  it("can abort a cancel confirmation before confirming once", () => {
    const onConfirm = vi.fn();

    act(() => {
      root.render((
        <DestructiveActionButton
          action="cancel"
          disabled={false}
          onConfirm={onConfirm}
        />
      ));
    });

    click(buttonByLabel("실험 취소"));
    click(buttonByLabel("취소하지 않음"));
    expect(text()).not.toContain("취소를 입력하면 실험을 취소합니다.");

    click(buttonByLabel("실험 취소"));
    changeInput(inputByLabelText("확인 문구"), "취소");
    click(buttonByLabel("취소 확정"));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders pending agent approval as a direct inert Paperclip issue interaction link", () => {
    const markup = renderToStaticMarkup((
      <PendingApprovalStatus
        approvalId="interaction-abc"
        href="/PAP/issues/PAP-123#interaction-abc"
        label="<script>alert(1)</script>"
      />
    ));

    expect(markup).toContain('href="/PAP/issues/PAP-123#interaction-abc"');
    expect(markup).toContain("승인 대기");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).not.toContain("승인 완료");
  });

  it("renders invalid_version recovery with refresh and reapply instructions without success text", () => {
    const markup = renderToStaticMarkup((
      <ConflictReapplyNotice
        result={{
          ok: false,
          code: "invalid_version",
          message: "Experiment version is stale",
          requestId: "req-123",
          status: 409,
        }}
      />
    ));

    expect(markup).toContain("최신 변경을 새로고침하세요.");
    expect(markup).toContain("방금 입력한 내용을 확인한 뒤 다시 적용하세요.");
    expect(markup).not.toContain("성공");
    expect(markup).not.toContain("완료");
  });

  it("keeps invalid lifecycle transitions disabled with an explanation in the operations panel", () => {
    renderOperationsPanel({
      detail: detail({
        experiment: {
          ...detail().experiment,
          status: "completed",
        },
      }),
    });

    const startButton = buttonByLabel("실험 시작");
    expect(startButton.disabled).toBe(true);
    expect(text()).toContain("완료된 실험은 다시 시작할 수 없습니다.");

    click(startButton);

    expect(bridge.calls).toHaveLength(0);
  });

  it("fires cancel exactly once from operations after typed confirmation", () => {
    renderOperationsPanel({
      detail: detail({
        experiment: {
          ...detail().experiment,
          status: "running",
          version: 7,
        },
      }),
    });

    click(buttonByLabel("실험 취소"));
    expect(bridge.calls).toHaveLength(0);

    changeInput(inputByLabelText("확인 문구"), "취소");
    click(buttonByLabel("취소 확정"));

    expect(bridge.calls).toEqual([
      {
        action: "cancel-experiment",
        payload: {
          experimentId: EXPERIMENT_ID,
          version: 7,
        },
      },
    ]);
  });

  it("requires browser confirmation before completing a running experiment", () => {
    const confirm = vi.spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderOperationsPanel({
      detail: detail({
        experiment: {
          ...detail().experiment,
          status: "running",
          version: 8,
        },
      }),
    });

    click(buttonByLabel("실험 완료"));

    expect(confirm).toHaveBeenCalledWith("실험을 완료하면 되돌릴 수 없습니다.");
    expect(bridge.calls).toHaveLength(0);

    click(buttonByLabel("실험 완료"));

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(bridge.calls).toEqual([
      {
        action: "complete-experiment",
        payload: {
          experimentId: EXPERIMENT_ID,
          version: 8,
        },
      },
    ]);
  });

  it("shows pending agent approval with direct inert issue and decision links", () => {
    renderOperationsPanel({
      detail: detail({
        experiment: {
          ...detail().experiment,
          status: "running",
          linkedIssueId: "44444444-4444-4444-8444-444444444444",
          responsibleAgentId: "33333333-3333-4333-8333-333333333333",
        },
      }),
      options: options({
        routine: {
          resolutionStatus: "requested",
          id: "interaction-abc",
          status: "active",
          assigneeAgentId: "33333333-3333-4333-8333-333333333333",
        },
      }),
    });

    const links = Array.from(container.querySelectorAll("a"));
    expect(text()).toContain("승인 대기");
    expect(links.find((link) => link.textContent === "PAP-123")?.getAttribute("href"))
      .toBe("/issues/44444444-4444-4444-8444-444444444444");
    expect(links.find((link) => link.textContent === "interaction-abc")?.getAttribute("href"))
      .toBe("/decisions#interaction-abc");
  });

  it("keeps strategy requests disabled until both responsible agent and issue are connected", () => {
    renderOperationsPanel();

    const requestButton = buttonByLabel("전략 검토 요청");
    expect(requestButton.disabled).toBe(true);
    expect(text()).toContain("책임 에이전트와 운영 이슈를 먼저 연결하세요.");

    const requestInput = container.querySelector<HTMLTextAreaElement>("#sbe-strategy-request");
    if (requestInput === null) throw new Error("strategy textarea not found");
    changeTextarea(requestInput, "전략 제안해줘");
    click(requestButton);

    expect(bridge.calls).toHaveLength(0);
  });
});
