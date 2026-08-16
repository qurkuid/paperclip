import { useState, type FormEvent } from "react";

import { boardActionInputSchema } from "../contracts/actions.js";
import { ActionFeedback } from "./action-feedback.js";
import { useBoardAction } from "./action-hook.js";
import type { RefreshAll } from "./types.js";

export function CreateExperimentForm({
  refreshAll,
  compact = false,
}: {
  refreshAll: RefreshAll;
  compact?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [minimumSample, setMinimumSample] = useState(30);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const action = useBoardAction(refreshAll);
  const canSubmit = title.trim().length > 0
    && hypothesis.trim().length > 0
    && Number.isInteger(minimumSample)
    && minimumSample >= 1
    && minimumSample <= 100000;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: string[] = [];
    if (title.trim().length <= 0) nextErrors.push("실험 이름을 입력하세요.");
    if (hypothesis.trim().length <= 0) nextErrors.push("가설을 입력하세요.");
    if (!Number.isInteger(minimumSample) || minimumSample < 1 || minimumSample > 100000) {
      nextErrors.push("표본은 1 이상 100000 이하로 입력하세요.");
    }
    if (nextErrors.length > 0) {
      setValidationErrors(nextErrors);
      return;
    }
    setValidationErrors([]);
    const input = {
      action: "create-experiment",
      payload: {
        title: title.trim(),
        hypothesis: hypothesis.trim(),
        minimumSamplePerVariant: minimumSample,
      },
    };
    boardActionInputSchema.parse(input);
    const created = await action.run(input, "새 실험과 Paperclip 운영 이슈를 만들었습니다.");
    if (created) {
      setTitle("");
      setHypothesis("");
    }
  }

  return (
    <form className="sbe-form" onSubmit={(event) => void submit(event)}>
      {!compact ? <h3>새 실험 만들기</h3> : null}
      <div className="sbe-field">
        <label htmlFor="sbe-title">실험 이름</label>
        <input
          id="sbe-title"
          className="sbe-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 상담 CTA 문구 실험"
          maxLength={120}
          required
        />
      </div>
      <div className="sbe-field">
        <label htmlFor="sbe-hypothesis">가설</label>
        <textarea
          id="sbe-hypothesis"
          className="sbe-textarea"
          value={hypothesis}
          onChange={(event) => setHypothesis(event.target.value)}
          placeholder="무엇을 바꾸면 왜 계약 전환이 개선되는지 적으세요."
          maxLength={2000}
          required
        />
      </div>
      <div className="sbe-field">
        <label htmlFor="sbe-sample">변형별 최소 표본</label>
        <input
          id="sbe-sample"
          className="sbe-input"
          type="number"
          min={1}
          max={100000}
          value={minimumSample}
          onChange={(event) => setMinimumSample(Number(event.target.value))}
          required
        />
      </div>
      <button className="sbe-button primary" type="submit" disabled={action.busy || !canSubmit}>
        {action.busy ? "생성 중…" : "실험과 운영 이슈 생성"}
      </button>
      {validationErrors.length > 0 ? (
        <div className="sbe-error">
          {validationErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
      <ActionFeedback error={action.error} message={action.message} recovery={action.recovery} />
    </form>
  );
}

export const CreateExperimentPanel = CreateExperimentForm;
