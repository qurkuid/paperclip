import { buildVariantResultRows } from "./chart-data.js";
import type { ExperimentDetail } from "./types.js";

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function VariantResultsTable({
  detail,
}: {
  detail: ExperimentDetail;
}) {
  const rows = buildVariantResultRows(detail);
  const target = detail.experiment.minimumSamplePerVariant;

  if (rows.length === 0) return null;
  return (
    <section className="sbe-result-table" aria-labelledby="sbe-result-table-title">
      <div className="sbe-result-table-heading">
        <div>
          <h3 id="sbe-result-table-title">변형별 수치 비교</h3>
          <p>차트와 같은 데이터를 정확한 수치로 확인합니다.</p>
        </div>
        <span>목표 {target}명 / 변형</span>
      </div>
      <div className="sbe-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">변형</th>
              <th scope="col">표본</th>
              <th scope="col">계약</th>
              <th scope="col">실패</th>
              <th scope="col">진행 중</th>
              <th scope="col">제외</th>
              <th scope="col">계약률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.variantId}>
                <th scope="row">
                  {row.name}
                  {row.isControl ? <small>기준안</small> : null}
                </th>
                <td>
                  <strong>{row.sample}</strong> / {target}
                </td>
                <td>{row.won}</td>
                <td>{row.lost}</td>
                <td>{row.pending}</td>
                <td>{row.disqualified}</td>
                <td>{formatPercent(row.wonRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
