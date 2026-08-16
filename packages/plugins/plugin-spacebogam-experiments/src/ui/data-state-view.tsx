import type { AnchorHTMLAttributes, ReactNode } from "react";

import { CreateExperimentForm } from "./create-panel.js";
import type { ExperimentDetail, RefreshAll } from "./types.js";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function PageHeader({
  detail,
  linkProps,
  readinessLabel,
  configurationLabel,
  updatedLabel,
}: {
  detail: ExperimentDetail | null;
  linkProps: (href: string) => LinkProps;
  readinessLabel: string;
  configurationLabel: string;
  updatedLabel: string;
}) {
  return (
    <header className="sbe-header">
      <div>
        <p className="sbe-eyebrow">Spacebogam · Experiment operations</p>
        <h1 className="sbe-title">실험 운영 대장</h1>
        <p className="sbe-subtitle">
          가설부터 상담 결과, 병목 진단, 에이전트 전략과 승인까지 한 페이지에서
          관리합니다. 화면 데이터는 5분마다 자동 갱신됩니다.
        </p>
      </div>
      <div className="sbe-header-actions">
        <span className="sbe-status"><span className="sbe-dot" />{readinessLabel}</span>
        <span className="sbe-status">{configurationLabel}</span>
        <span className="sbe-status"><span className="sbe-dot" />{updatedLabel}</span>
        <a className="sbe-link" {...linkProps("/analytics/funnel")}>퍼널 분석 보기</a>
        <a className="sbe-link" {...linkProps("/decisions")}>의사결정</a>
        {detail?.experiment.linkedIssueId ? (
          <a className="sbe-link" {...linkProps(`/issues/${detail.experiment.linkedIssueId}`)}>
            운영 이슈
          </a>
        ) : null}
      </div>
    </header>
  );
}

export function DataNotice({
  title,
  children,
  refreshAll,
}: {
  title: string;
  children: ReactNode;
  refreshAll: () => void;
}) {
  return (
    <section className="sbe-panel sbe-empty">
      <h2>{title}</h2>
      <p>{children}</p>
      <button className="sbe-button" type="button" onClick={refreshAll}>다시 불러오기</button>
    </section>
  );
}

export function EmptyExperimentState({ refreshAll }: { refreshAll: RefreshAll }) {
  return (
    <section className="sbe-panel sbe-empty">
      <div className="sbe-empty-mark" aria-hidden="true">◎</div>
      <h2>첫 실험을 운영 대장에 등록하세요</h2>
      <p>
        실험을 만들면 Paperclip 이슈가 함께 생성되고, 표본·결과·관찰·전략 승인이
        한 흐름으로 누적됩니다.
      </p>
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
        <CreateExperimentForm refreshAll={refreshAll} />
      </div>
    </section>
  );
}

export function StaleDataBanner({ refreshAll }: { refreshAll: () => void }) {
  return (
    <div className="sbe-banner" role="status">
      <span>마지막 응답이 5분을 지나 최신 상태가 아닐 수 있습니다.</span>
      <button className="sbe-button" type="button" onClick={refreshAll}>지금 새로고침</button>
    </div>
  );
}

export function MeasurementWarning({ detail }: { detail: ExperimentDetail }) {
  const quality = detail.snapshots[0]?.funnelQuality;
  if (
    quality !== "stale"
    && quality !== "empty"
    && quality !== "invalid_sequence"
  ) {
    return null;
  }
  const label = quality === "stale"
    ? "퍼널 측정 데이터가 오래되었습니다."
    : quality === "empty"
      ? "같은 기간의 퍼널 측정 데이터가 비어 있습니다."
      : "퍼널 측정 데이터 순서가 올바르지 않습니다.";
  return (
    <div className="sbe-banner" role="status">
      <span>{label} 표본 해석 전 측정 기준을 먼저 확인하세요.</span>
    </div>
  );
}
