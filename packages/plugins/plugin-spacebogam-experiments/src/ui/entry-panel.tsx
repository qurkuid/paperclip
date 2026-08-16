import { useEffect, useMemo, useState, type FormEvent } from "react";

import { boardActionInputSchema } from "../contracts/actions.js";
import { ActionFeedback } from "./action-feedback.js";
import { useBoardAction } from "./action-hook.js";
import type { ExperimentDetail, RefreshAll } from "./types.js";

type EntryOutcome = "pending" | "won" | "lost" | "disqualified";

const outcomeLabels: Record<EntryOutcome, string> = {
  pending: "진행 중",
  won: "계약",
  lost: "실패",
  disqualified: "제외",
};

function isLikelyPII(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 0) return false;
  if (/\d{10,18}/.test(trimmed.replace(/\D/g, ""))) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(trimmed)) return true;
  return false;
}

function EntryForm({
  detail,
  configured,
  refreshAll,
  onSaved,
}: {
  detail: ExperimentDetail;
  configured: boolean;
  refreshAll: RefreshAll;
  onSaved?: () => void;
}) {
  const [variantId, setVariantId] = useState(detail.variants[0]?.id ?? "");
  const [leadKey, setLeadKey] = useState("");
  const [outcome, setOutcome] = useState<EntryOutcome>("pending");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [acceptPiiWarning, setAcceptPiiWarning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const action = useBoardAction(refreshAll);
  const firstVariantId = detail.variants[0]?.id ?? "";
  const variantIdentity = detail.variants.map((variant) => variant.id).join("\u0000");

  useEffect(() => {
    setVariantId(firstVariantId);
    setAcceptPiiWarning(false);
  }, [detail.experiment.id, firstVariantId, variantIdentity]);

  const leadLooksLikePII = useMemo(() => isLikelyPII(leadKey), [leadKey]);
  const piiBlocked = leadLooksLikePII && !acceptPiiWarning;
  const selectedVariantName = detail.variants.find((variant) => variant.id === variantId)?.name
    ?? "선택한 변형";

  async function saveEntry() {
    if (!configured) {
      setValidationError("리드 해시 비밀 설정 후 결과를 기록할 수 있습니다.");
      return;
    }
    if (variantId.length <= 0) {
      setValidationError("실험 설계를 먼저 저장하세요.");
      return;
    }
    if (leadKey.trim().length <= 0 || leadKey.length > 200) {
      setValidationError("CRM 리드 ID를 입력하세요.");
      return;
    }
    if (piiBlocked) {
      setValidationError("이메일/휴대폰 패턴 입력은 확인 후 반영할 수 있습니다.");
      return;
    }
    setValidationError(null);
    const now = new Date().toISOString();
    const input = {
      action: "create-entry",
      payload: {
        experimentId: detail.experiment.id,
        variantId,
        leadKey: leadKey.trim(),
        outcome,
        enteredAt: now,
        outcomeAt: outcome === "pending" ? null : now,
        utmSource: utmSource.trim() || null,
        utmMedium: null,
        utmCampaign: utmCampaign.trim() || null,
        version: detail.experiment.version,
      },
    };
    boardActionInputSchema.parse(input);
    let conflicted = false;
    const saved = await action.run(
      input,
      "상담 결과를 집계에 반영했습니다.",
      { onConflict: () => { conflicted = true; } },
    );
    if (saved) {
      setLeadKey("");
      setUtmCampaign("");
      setUtmSource("");
      setOutcome("pending");
      onSaved?.();
    } else if (!conflicted) {
      setLeadKey("");
      setAcceptPiiWarning(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveEntry();
  }

  if (detail.variants.length < 2) {
    return <div className="sbe-error">실험 설계를 먼저 저장하세요.</div>;
  }
  return (
    <form className="sbe-form" onSubmit={(event) => void submit(event)}>
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
            disabled={piiBlocked}
            onChange={(event) => setOutcome(event.target.value as EntryOutcome)}
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
          onChange={(event) => {
            setLeadKey(event.target.value);
            setAcceptPiiWarning(false);
          }}
          placeholder="예: lead_20260727_104"
          maxLength={200}
          required
        />
      </div>
      {leadLooksLikePII ? (
        <label className="sbe-field sbe-inline-field">
          <input
            id="sbe-entry-pii-ack"
            type="checkbox"
            checked={acceptPiiWarning}
            onChange={(event) => setAcceptPiiWarning(event.target.checked)}
          />
          <span>입력값은 이메일/휴대폰 패턴으로 보여지므로 직접 저장하지 않고 해시화 처리된 값인지 확인했습니다.</span>
        </label>
      ) : null}
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
        disabled={action.busy || !configured || variantId.length <= 0 || piiBlocked}
      >
        {action.busy ? "반영 중…" : "결과 반영"}
      </button>
      {!configured ? (
        <div className="sbe-error">리드 해시 비밀 설정 후 결과를 기록할 수 있습니다.</div>
      ) : null}
      {validationError ? <div className="sbe-error">{validationError}</div> : null}
      {action.recovery ? (
        <div className="sbe-help" aria-label="재적용 변경 요약">
          <strong>변경 요약</strong>
          <p>
            {selectedVariantName} · 결과 {outcomeLabels[outcome]} · UTM source{" "}
            {utmSource.trim() ? "입력됨" : "없음"} · campaign{" "}
            {utmCampaign.trim() ? "입력됨" : "없음"}
          </p>
          <p>현재 화면 버전 {detail.experiment.version}</p>
        </div>
      ) : null}
      <ActionFeedback
        error={action.error}
        message={action.message}
        recovery={action.recovery}
        onReapply={action.recovery ? () => { void saveEntry(); } : undefined}
      />
    </form>
  );
}

export function EntryPanel({
  detail,
  configured,
  refreshAll,
}: {
  detail: ExperimentDetail;
  configured: boolean;
  refreshAll: RefreshAll;
}) {
  return (
    <div className="sbe-form">
      <h3>상담 결과 기록</h3>
      <EntryForm detail={detail} configured={configured} refreshAll={refreshAll} />
    </div>
  );
}

export function EntryDrawerPanel({
  detail,
  configured,
  refreshAll,
  open,
  onClose,
}: {
  detail: ExperimentDetail;
  configured: boolean;
  refreshAll: RefreshAll;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="sbe-drawer-backdrop" onClick={onClose}>
      <aside
        aria-labelledby="sbe-entry-drawer-title"
        aria-modal="true"
        className="sbe-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sbe-drawer-header">
          <h3 id="sbe-entry-drawer-title">상담 결과 기록</h3>
          <button className="sbe-button" type="button" onClick={onClose}>닫기</button>
        </div>
        <EntryForm
          detail={detail}
          configured={configured}
          refreshAll={refreshAll}
          onSaved={onClose}
        />
      </aside>
    </div>
  );
}
