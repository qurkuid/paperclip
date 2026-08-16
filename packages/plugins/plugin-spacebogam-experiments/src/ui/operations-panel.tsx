import { useEffect, useState, type FormEvent } from "react";

import { ActionFeedback } from "./action-feedback.js";
import { useBoardAction } from "./action-hook.js";
import {
  DestructiveActionButton,
  LifecycleGovernanceControls,
  type GovernanceLifecycleAction,
} from "./governance.js";
import type {
  ExperimentDetail,
  OperationsOptions,
  RefreshAll,
} from "./types.js";

const lifecycleActionCodes: Record<GovernanceLifecycleAction, string> = {
  start: "start-experiment",
  pause: "pause-experiment",
  complete: "complete-experiment",
  cancel: "cancel-experiment",
  archive: "archive-experiment",
};

const lifecycleMessages: Record<GovernanceLifecycleAction, string> = {
  start: "실험 시작 상태로 변경했습니다.",
  pause: "실험을 일시 정지했습니다.",
  complete: "실험을 완료 처리했습니다.",
  cancel: "실험을 취소했습니다.",
  archive: "실험을 보관했습니다.",
};

function primaryLifecycleAction(status: ExperimentDetail["experiment"]["status"]): GovernanceLifecycleAction | null {
  if (status === "draft") return "start";
  if (status === "running") return "pause";
  if (status === "paused") return "start";
  if (status === "completed") return "start";
  return null;
}

function canComplete(status: ExperimentDetail["experiment"]["status"]) {
  return status === "running" || status === "paused";
}

function canCancel(status: ExperimentDetail["experiment"]["status"]) {
  return status === "running" || status === "paused";
}

export function OperationsPanel({
  detail,
  options,
  refreshAll,
}: {
  detail: ExperimentDetail;
  options: OperationsOptions | null;
  refreshAll: RefreshAll;
}) {
  const experiment = detail.experiment;
  const [agentId, setAgentId] = useState(experiment.responsibleAgentId ?? "");
  const [issueId, setIssueId] = useState("");
  const [request, setRequest] = useState(
    "현재 표본과 같은 기간의 퍼널·네이버 광고 근거를 함께 검토하고, 다음 한 가지 실험 전략을 제안해줘.",
  );
  const action = useBoardAction(refreshAll);
  const lifecycle = primaryLifecycleAction(experiment.status);
  const routineActive = options?.routine.status === "active";
  const issue = options?.issues.find((candidate) => candidate.id === experiment.linkedIssueId) ?? null;
  const strategyBlocked = !experiment.responsibleAgentId || !experiment.linkedIssueId;
  const approvalPending =
    options?.routine.resolutionStatus === "requested"
    && options.routine.id !== null
    && experiment.linkedIssueId !== null
    && experiment.linkedIssueId !== undefined;

  useEffect(() => {
    setAgentId(experiment.responsibleAgentId ?? "");
  }, [experiment.id, experiment.responsibleAgentId]);

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentId) return;
    await action.run({
      action: "select-responsible-agent",
      payload: {
        experimentId: experiment.id,
        responsibleAgentId: agentId,
        version: experiment.version,
      },
    }, "책임 에이전트를 지정했습니다.");
  }

  async function linkIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issueId) return;
    await action.run({
      action: "link-issue",
      payload: {
        experimentId: experiment.id,
        issueId,
        version: experiment.version,
      },
    }, "운영 이슈를 연결했습니다.");
  }

  async function requestStrategy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action.run({
      action: "request-strategy",
      payload: {
        experimentId: experiment.id,
        request,
        version: experiment.version,
      },
    }, "담당 에이전트에게 전략 검토를 요청했습니다.");
  }

  async function updateRoutine() {
    await action.run({
      action: "reconcile-managed-routine",
      payload: {
        experimentId: experiment.id,
        enabled: !routineActive,
        version: experiment.version,
      },
    }, routineActive ? "주기 검토를 일시 정지했습니다." : "주기 검토를 활성화했습니다.");
  }

  async function updateLifecycle(lifecycleAction: GovernanceLifecycleAction) {
    if (
      lifecycleAction === "complete"
      && !window.confirm("실험을 완료하면 되돌릴 수 없습니다.")
    ) {
      return;
    }
    await action.run({
      action: lifecycleActionCodes[lifecycleAction],
      payload: {
        experimentId: experiment.id,
        version: experiment.version,
      },
    }, lifecycleMessages[lifecycleAction]);
  }

  return (
    <div className="sbe-form">
      <h3>운영 설정</h3>
      {lifecycle ? (
        <LifecycleGovernanceControls
          status={experiment.status}
          requestedAction={lifecycle}
          busy={action.busy}
          variantCount={detail.variants.length}
          onAction={(requestedAction) => void updateLifecycle(requestedAction)}
        />
      ) : null}
      {canComplete(experiment.status) ? (
        <LifecycleGovernanceControls
          status={experiment.status}
          requestedAction="complete"
          busy={action.busy}
          variantCount={detail.variants.length}
          onAction={(requestedAction) => void updateLifecycle(requestedAction)}
        />
      ) : null}
      {canCancel(experiment.status) ? (
        <DestructiveActionButton
          action="cancel"
          disabled={action.busy}
          onConfirm={(requestedAction) => void updateLifecycle(requestedAction)}
        />
      ) : null}
      <form className="sbe-form" onSubmit={(event) => void saveAgent(event)}>
        <div className="sbe-field">
          <label htmlFor="sbe-agent">책임 에이전트</label>
          <select
            id="sbe-agent"
            className="sbe-select"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
          >
            <option value="">선택하세요</option>
            {options?.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}{agent.title ? ` · ${agent.title}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="sbe-button" type="submit" disabled={action.busy || !agentId}>
          담당 지정
        </button>
      </form>
      {!experiment.linkedIssueId ? (
        <form className="sbe-form" onSubmit={(event) => void linkIssue(event)}>
          <div className="sbe-field">
            <label htmlFor="sbe-issue">기존 이슈 연결</label>
            <select
              id="sbe-issue"
              className="sbe-select"
              value={issueId}
              onChange={(event) => setIssueId(event.target.value)}
            >
              <option value="">선택하세요</option>
              {options?.issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.identifier ? `${issue.identifier} · ` : ""}{issue.title}
                </option>
              ))}
            </select>
          </div>
          <button className="sbe-button" type="submit" disabled={action.busy || !issueId}>
            이슈 연결
          </button>
        </form>
      ) : null}
      <button
        className="sbe-button"
        type="button"
        disabled={action.busy || !experiment.responsibleAgentId}
        onClick={() => void updateRoutine()}
      >
        주기 검토 {routineActive ? "끄기" : "켜기"}
      </button>
      {approvalPending ? (
        <p className="sbe-help">
          <strong>승인 대기</strong>{" "}
          에이전트 승인 요청이 대기 중입니다.{" "}
          <a className="sbe-link" href={`/issues/${experiment.linkedIssueId}`}>
            {issue?.identifier ?? "연결 이슈"}
          </a>
          {" "}
          <a className="sbe-link" href={`/decisions#${options.routine.id}`}>
            {options.routine.id}
          </a>
        </p>
      ) : null}
      <form className="sbe-form" onSubmit={(event) => void requestStrategy(event)}>
        <div className="sbe-field">
          <label htmlFor="sbe-strategy-request">에이전트 전략 요청</label>
          <textarea
            id="sbe-strategy-request"
            className="sbe-textarea"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            maxLength={4000}
            required
          />
        </div>
        <button
          className="sbe-button primary"
          type="submit"
          disabled={action.busy || strategyBlocked}
        >
          전략 검토 요청
        </button>
        {strategyBlocked ? (
          <p className="sbe-help">책임 에이전트와 운영 이슈를 먼저 연결하세요.</p>
        ) : null}
        <p className="sbe-help">
          담당 에이전트가 실험 집계와 같은 기간의 INTM 퍼널·네이버 광고를 확인한 뒤,
          연결 이슈 문서와 의사결정 요청에 근거를 남깁니다.
        </p>
      </form>
      <ActionFeedback error={action.error} message={action.message} recovery={action.recovery} />
    </div>
  );
}
