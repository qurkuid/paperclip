import { useState, type FormEvent } from "react";

import { useBoardAction } from "./action-hook.js";
import type { ExperimentDetail, RefreshAll } from "./types.js";

export function VariantSetup({
  detail,
  refreshAll,
}: {
  detail: ExperimentDetail;
  refreshAll: RefreshAll;
}) {
  const [controlName, setControlName] = useState("현재안");
  const [challengerName, setChallengerName] = useState("개선안");
  const [controlDescription, setControlDescription] = useState("");
  const [challengerDescription, setChallengerDescription] = useState("");
  const action = useBoardAction(refreshAll);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action.run({
      action: "replace-draft-variants",
      payload: {
        experimentId: detail.experiment.id,
        version: detail.experiment.version,
        variants: [
          {
            key: "control",
            name: controlName,
            description: controlDescription,
            isControl: true,
            sortOrder: 0,
          },
          {
            key: "challenger",
            name: challengerName,
            description: challengerDescription,
            isControl: false,
            sortOrder: 1,
          },
        ],
      },
    }, "기준안과 비교안을 저장했습니다.");
  }

  return (
    <form className="sbe-form" onSubmit={(event) => void submit(event)}>
      <h3>실험 설계</h3>
      <p className="sbe-help">한 번에 한 요소만 다르게 구성하세요.</p>
      <div className="sbe-form-row">
        <div className="sbe-field">
          <label htmlFor="sbe-control-name">기준안</label>
          <input
            id="sbe-control-name"
            className="sbe-input"
            value={controlName}
            onChange={(event) => setControlName(event.target.value)}
            required
          />
        </div>
        <div className="sbe-field">
          <label htmlFor="sbe-challenger-name">비교안</label>
          <input
            id="sbe-challenger-name"
            className="sbe-input"
            value={challengerName}
            onChange={(event) => setChallengerName(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="sbe-field">
        <label htmlFor="sbe-control-description">기준안 설명</label>
        <input
          id="sbe-control-description"
          className="sbe-input"
          value={controlDescription}
          onChange={(event) => setControlDescription(event.target.value)}
          placeholder="현재 노출 중인 문구나 구성"
        />
      </div>
      <div className="sbe-field">
        <label htmlFor="sbe-challenger-description">비교안 설명</label>
        <input
          id="sbe-challenger-description"
          className="sbe-input"
          value={challengerDescription}
          onChange={(event) => setChallengerDescription(event.target.value)}
          placeholder="달라지는 한 가지 요소"
        />
      </div>
      <button className="sbe-button primary" type="submit" disabled={action.busy}>
        {action.busy ? "저장 중…" : "실험 설계 저장"}
      </button>
      {action.error ? <div className="sbe-error">{action.error}</div> : null}
      {action.message ? <div className="sbe-success">{action.message}</div> : null}
    </form>
  );
}
