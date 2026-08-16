import { deriveInsights } from "./insights.js";
import type { ExperimentDetail } from "./types.js";

export function InsightPanel({ detail }: { detail: ExperimentDetail }) {
  const insights = deriveInsights(detail);
  return (
    <section className="sbe-panel sbe-rail-section">
      <h3>지금 봐야 할 것</h3>
      {insights.map((insight) => (
        <article
          className={`sbe-insight ${insight.tone}`}
          key={`${insight.label}-${insight.title}`}
        >
          <span className="sbe-insight-label">{insight.label}</span>
          <h4>{insight.title}</h4>
          <p>{insight.detail}</p>
          <b>{insight.action}</b>
        </article>
      ))}
    </section>
  );
}
