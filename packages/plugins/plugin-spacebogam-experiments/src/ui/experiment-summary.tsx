import { ExperimentCharts } from "./charts.js";
import type { ExperimentDetail } from "./types.js";

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function ExperimentSummary({ detail }: { detail: ExperimentDetail }) {
  const totalSample = detail.variantMetrics.reduce(
    (sum, metric) => sum + metric.sample,
    0,
  );
  const totalWon = detail.variantMetrics.reduce(
    (sum, metric) => sum + metric.won,
    0,
  );
  const totalResolved = detail.variantMetrics.reduce(
    (sum, metric) => sum + metric.resolved,
    0,
  );
  const bestLift = detail.variantMetrics
    .filter((metric) => !metric.isControl)
    .map((metric) => metric.relativeLiftFromControl)
    .filter((value) => value !== null)
    .sort((left, right) => right - left)[0] ?? null;

  return (
    <div className="sbe-summary">
      <div className="sbe-summary-top">
        <div>
          <h2>{detail.experiment.title}</h2>
          <p className="sbe-hypothesis">{detail.experiment.hypothesis}</p>
        </div>
        <span className="sbe-status">
          <span className="sbe-dot" />
          {detail.experiment.status}
        </span>
      </div>
      <section className="sbe-kpis" aria-label="핵심 지표">
        <article className="sbe-kpi">
          <span>총 표본</span>
          <strong>{totalSample}</strong>
          <small>변형별 목표 {detail.experiment.minimumSamplePerVariant}</small>
        </article>
        <article className="sbe-kpi">
          <span>계약</span>
          <strong>{totalWon}</strong>
          <small>확정 결과 {totalResolved}</small>
        </article>
        <article className="sbe-kpi">
          <span>전체 계약률</span>
          <strong>{percent(totalResolved === 0 ? null : totalWon / totalResolved)}</strong>
          <small>계약 ÷ 계약·실패</small>
        </article>
        <article className="sbe-kpi">
          <span>최고 상대 개선</span>
          <strong>{bestLift === null ? "—" : `${bestLift >= 0 ? "+" : ""}${percent(bestLift)}`}</strong>
          <small>기준안 대비 비교안</small>
        </article>
      </section>
      <ExperimentCharts detail={detail} />
      {detail.recentObservations.length > 0 ? (
        <section className="sbe-observations" aria-label="최근 운영 기록">
          <div>
            <h3>최근 운영 기록</h3>
            <p>에이전트와 운영자가 남긴 append-only 관찰입니다.</p>
          </div>
          <ol>
            {detail.recentObservations.slice(0, 5).map((observation) => (
              <li key={observation.id}>
                <span>{observation.kind}</span>
                <p>{observation.summary}</p>
                <time dateTime={observation.createdAt}>
                  {new Intl.DateTimeFormat("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(observation.createdAt))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
