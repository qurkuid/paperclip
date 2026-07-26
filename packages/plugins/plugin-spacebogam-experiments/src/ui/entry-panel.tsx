import { useEffect, useState, type FormEvent } from "react";

import { useBoardAction } from "./action-hook.js";
import type { ExperimentDetail, RefreshAll } from "./types.js";

export function EntryPanel({
  detail,
  configured,
  refreshAll,
}: {
  detail: ExperimentDetail;
  configured: boolean;
  refreshAll: RefreshAll;
}) {
  const [variantId, setVariantId] = useState(detail.variants[0]?.id ?? "");
  const [leadKey, setLeadKey] = useState("");
  const [outcome, setOutcome] = useState("pending");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const action = useBoardAction(refreshAll);

  useEffect(() => {
    setVariantId(detail.variants[0]?.id ?? "");
  }, [detail.experiment.id, detail.variants]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    const saved = await action.run({
      action: "create-entry",
      payload: {
        experimentId: detail.experiment.id,
        variantId,
        leadKey,
        outcome,
        enteredAt: now,
        outcomeAt: outcome === "pending" ? null : now,
        utmSource: utmSource || null,
        utmMedium: null,
        utmCampaign: utmCampaign || null,
        version: detail.experiment.version,
      },
    }, "상담 결과를 집계에 반영했습니다.");
    if (saved) setLeadKey("");
  }

  if (detail.variants.length < 2) return null;
  return (
    <form className="sbe-form" onSubmit={(event) => void submit(event)}>
      <h3>상담 결과 기록</h3>
      <p className="sbe-help">
        연락처가 아닌 CRM 리드 ID를 입력하세요. 저장 시 회사 전용 키로 해시됩니다.
      </p>
      <div className="sbe-form-row">
        <div className="sbe-field">
          <label htmlFor="sbe-entry-variant">변형</label>
          <select
            id="sbe-entry-variant"
            className="sbe-select"
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
          >
            {detail.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.name}</option>
            ))}
          </select>
        </div>
        <div className="sbe-field">
          <label htmlFor="sbe-entry-outcome">결과</label>
          <select
            id="sbe-entry-outcome"
            className="sbe-select"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="pending">진행 중</option>
            <option value="won">계약</option>
            <option value="lost">실패</option>
            <option value="disqualified">제외</option>
          </select>
        </div>
      </div>
      <div className="sbe-field">
        <label htmlFor="sbe-entry-key">CRM 리드 ID</label>
        <input
          id="sbe-entry-key"
          className="sbe-input"
          value={leadKey}
          onChange={(event) => setLeadKey(event.target.value)}
          placeholder="예: lead_20260727_104"
          maxLength={200}
          required
        />
      </div>
      <div className="sbe-form-row">
        <div className="sbe-field">
          <label htmlFor="sbe-entry-source">UTM source</label>
          <input
            id="sbe-entry-source"
            className="sbe-input"
            value={utmSource}
            onChange={(event) => setUtmSource(event.target.value)}
            placeholder="naver"
          />
        </div>
        <div className="sbe-field">
          <label htmlFor="sbe-entry-campaign">UTM campaign</label>
          <input
            id="sbe-entry-campaign"
            className="sbe-input"
            value={utmCampaign}
            onChange={(event) => setUtmCampaign(event.target.value)}
            placeholder="storage_consult"
          />
        </div>
      </div>
      <button
        className="sbe-button"
        type="submit"
        disabled={action.busy || !configured}
      >
        {action.busy ? "반영 중…" : "결과 반영"}
      </button>
      {!configured ? (
        <div className="sbe-error">리드 해시 비밀 설정 후 결과를 기록할 수 있습니다.</div>
      ) : null}
      {action.error ? <div className="sbe-error">{action.error}</div> : null}
      {action.message ? <div className="sbe-success">{action.message}</div> : null}
    </form>
  );
}
