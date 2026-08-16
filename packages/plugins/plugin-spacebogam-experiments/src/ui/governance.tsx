import { useMemo, useState } from "react";

import type { ExperimentStatus } from "./types.js";

export type GovernanceLifecycleAction = "start" | "pause" | "complete" | "cancel" | "archive";

type LifecycleGovernanceControlsProps = {
  readonly status: ExperimentStatus;
  readonly requestedAction: GovernanceLifecycleAction;
  readonly busy: boolean;
  readonly variantCount: number;
  readonly onAction: (action: GovernanceLifecycleAction) => void;
};

type LifecycleDecision = {
  readonly label: string;
  readonly disabled: boolean;
  readonly explanation: string | null;
};

const lifecycleLabels: Record<GovernanceLifecycleAction, string> = {
  start: "실험 시작",
  pause: "일시 정지",
  complete: "실험 완료",
  cancel: "실험 취소",
  archive: "보관",
};

const allowedTransitions = new Set([
  "draft:start",
  "draft:cancel",
  "running:pause",
  "running:complete",
  "running:cancel",
  "paused:start",
  "paused:complete",
  "paused:cancel",
  "completed:archive",
  "cancelled:archive",
]);

export function LifecycleGovernanceControls({
  status,
  requestedAction,
  busy,
  variantCount,
  onAction,
}: LifecycleGovernanceControlsProps) {
  const decision = useMemo(
    () => lifecycleDecision(status, requestedAction, variantCount, busy),
    [busy, requestedAction, status, variantCount],
  );
  const explanationId = `sbe-lifecycle-${status}-${requestedAction}`;

  return (
    <div className="sbe-governance-control" aria-label="실험 수명주기 제어">
      <button
        className="sbe-button primary"
        type="button"
        disabled={decision.disabled}
        aria-describedby={decision.explanation === null ? undefined : explanationId}
        onClick={decision.disabled ? undefined : () => onAction(requestedAction)}
      >
        {decision.label}
      </button>
      {decision.explanation === null ? null : (
        <p id={explanationId} className="sbe-help">
          {decision.explanation}
        </p>
      )}
    </div>
  );
}

function lifecycleDecision(
  status: ExperimentStatus,
  action: GovernanceLifecycleAction,
  variantCount: number,
  busy: boolean,
): LifecycleDecision {
  const label = lifecycleLabels[action];
  if (busy) return { label, disabled: true, explanation: "이전 작업을 처리하는 중입니다." };
  if (action === "start" && status === "completed") {
    return { label, disabled: true, explanation: "완료된 실험은 다시 시작할 수 없습니다." };
  }
  if (action === "start" && status === "draft" && variantCount < 2) {
    return { label, disabled: true, explanation: "실험 시작 전 기준안과 비교안을 먼저 준비하세요." };
  }
  if (!allowedTransitions.has(`${status}:${action}`)) {
    return { label, disabled: true, explanation: "현재 상태에서는 이 작업을 실행할 수 없습니다." };
  }
  return { label, disabled: false, explanation: null };
}

type DestructiveActionButtonProps = {
  readonly action: Extract<GovernanceLifecycleAction, "cancel">;
  readonly disabled: boolean;
  readonly onConfirm: (action: Extract<GovernanceLifecycleAction, "cancel">) => void;
};

export function DestructiveActionButton({ action, disabled, onConfirm }: DestructiveActionButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const canConfirm = confirmation === "취소";

  function closeConfirmation() {
    setConfirming(false);
    setConfirmation("");
  }

  function confirm() {
    if (!canConfirm) return;
    onConfirm(action);
    closeConfirmation();
  }

  if (!confirming) {
    return (
      <button
        className="sbe-button danger"
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        실험 취소
      </button>
    );
  }

  return (
    <div className="sbe-form" role="group" aria-label="실험 취소 확인">
      <p className="sbe-error">취소를 입력하면 실험을 취소합니다.</p>
      <div className="sbe-field">
        <label htmlFor="sbe-cancel-confirmation">확인 문구</label>
        <input
          id="sbe-cancel-confirmation"
          className="sbe-input"
          value={confirmation}
          onInput={(event) => setConfirmation(event.currentTarget.value)}
          autoComplete="off"
        />
      </div>
      <button className="sbe-button danger" type="button" disabled={!canConfirm} onClick={confirm}>
        취소 확정
      </button>
      <button className="sbe-button" type="button" onClick={closeConfirmation}>
        취소하지 않음
      </button>
    </div>
  );
}

type PendingApprovalStatusProps = {
  readonly approvalId: string;
  readonly href: string;
  readonly label?: string;
};

export function PendingApprovalStatus({ approvalId, href, label }: PendingApprovalStatusProps) {
  const displayLabel = label ?? approvalId;

  return (
    <p className="sbe-help">
      <strong>승인 대기</strong>{" "}
      <a className="sbe-link" href={href}>
        {displayLabel}
      </a>
      {" "}의사결정에서 검토하세요.
    </p>
  );
}

type ConflictResult = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly status?: number;
};

export function ConflictReapplyNotice({ result }: { readonly result: ConflictResult }) {
  if (result.code !== "invalid_version" && result.status !== 409) return null;

  return (
    <div className="sbe-error" role="status" aria-live="polite">
      <strong>최신 변경을 새로고침하세요.</strong>
      <p>방금 입력한 내용을 확인한 뒤 다시 적용하세요.</p>
      <small>요청 ID: {result.requestId}</small>
    </div>
  );
}
