import { useEffect, useState, type FormEvent } from "react";

import { useBoardAction } from "./action-hook.js";
import type {
  ExperimentDetail,
  OperationsOptions,
  RefreshAll,
} from "./types.js";

function nextLifecycleAction(status: ExperimentDetail["experiment"]["status"]) {
  if (status === "draft") return { action: "start-experiment", label: "실험 시작" };
  if (status === "running") return { action: "pause-experiment", label: "일시 정지" };
  if (status === "paused") return { action: "start-experiment", label: "실험 재개" };
  return null;
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
  const lifecycle = nextLifecycleAction(experiment.status);
  const routineActive = options?.routine.status === "active";

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

  async function updateLifecycle(actionName: string, message: string) {
    await action.run({
      action: actionName,
      payload: {
        experimentId: experiment.id,
        version: experiment.version,
      },
    }, message);
  }

  return (
    <div className="sbe-form">
      <h3>운영 설정</h3>
      {lifecycle ? (
        <button
          className="sbe-button primary"
          type="button"
          disabled={action.busy || detail.variants.length < 2}
          onClick={() => void updateLifecycle(lifecycle.action, `${lifecycle.label} 상태로 변경했습니다.`)}
        >
          {lifecycle.label}
        </button>
      ) : null}
      {experiment.status === "running" || experiment.status === "paused" ? (
        <button
          className="sbe-button"
          type="button"
          disabled={action.busy}
          onClick={() => void updateLifecycle("complete-experiment", "실험을 완료 처리했습니다.")}
        >
          실험 완료
        </button>
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
          disabled={
            action.busy
            || !experiment.responsibleAgentId
            || !experiment.linkedIssueId
          }
        >
          전략 검토 요청
        </button>
        <p className="sbe-help">
          담당 에이전트가 실험 집계와 같은 기간의 INTM 퍼널·네이버 광고를 확인한 뒤,
          연결 이슈 문서와 의사결정 요청에 근거를 남깁니다.
        </p>
      </form>
      {action.error ? <div className="sbe-error">{action.error}</div> : null}
      {action.message ? <div className="sbe-success">{action.message}</div> : null}
    </div>
  );
}
