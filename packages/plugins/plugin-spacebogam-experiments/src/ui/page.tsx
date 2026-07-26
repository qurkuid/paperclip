import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useHostNavigation,
  usePluginData,
  type PluginPageProps,
} from "@paperclipai/plugin-sdk/ui";

import { CreateExperimentPanel } from "./create-panel.js";
import { EntryPanel } from "./entry-panel.js";
import { ExperimentSummary } from "./experiment-summary.js";
import { InsightPanel } from "./insight-panel.js";
import { OperationsPanel } from "./operations-panel.js";
import { experimentStyles } from "./theme.js";
import type {
  ExperimentDetail,
  OperationsOptions,
  OverviewData,
} from "./types.js";
import { VariantSetup } from "./variant-setup.js";

function EmptyState({ refreshAll }: { refreshAll: () => void }) {
  return (
    <section className="sbe-panel sbe-empty">
      <div className="sbe-empty-mark" aria-hidden="true">◎</div>
      <h2>첫 실험을 운영 대장에 등록하세요</h2>
      <p>
        실험을 만들면 Paperclip 이슈가 함께 생성되고, 표본·결과·관찰·전략 승인이
        한 흐름으로 누적됩니다.
      </p>
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
        <CreateExperimentPanel refreshAll={refreshAll} />
      </div>
    </section>
  );
}

function CompanyExperimentPage({ companyId }: { companyId: string }) {
  const navigation = useHostNavigation();
  const overview = usePluginData<OverviewData>("overview", { companyId });
  const options = usePluginData<OperationsOptions>("operations-options", {
    companyId,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const experiment = usePluginData<ExperimentDetail | null>("experiment", {
    companyId,
    experimentId: selectedId ?? undefined,
  });

  const refreshAll = useCallback(() => {
    overview.refresh();
    options.refresh();
    experiment.refresh();
  }, [experiment, options, overview]);

  useEffect(() => {
    const experiments = overview.data?.experiments ?? [];
    if (
      selectedId === null
      || !experiments.some((candidate) => candidate.id === selectedId)
    ) {
      setSelectedId(experiments[0]?.id ?? null);
    }
  }, [overview.data, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(refreshAll, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const updatedLabel = useMemo(() => {
    const updatedAt = experiment.data?.experiment.updatedAt;
    if (!updatedAt) return "데이터 대기 중";
    return `${new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(updatedAt))} 기준`;
  }, [experiment.data]);

  if (overview.loading && overview.data === null) {
    return <main className="sbe-main">실험 운영 데이터를 불러오는 중…</main>;
  }
  if (overview.error) {
    return (
      <main className="sbe-main">
        <section className="sbe-panel sbe-empty">
          <h2>실험 운영 데이터를 불러오지 못했습니다</h2>
          <p>{overview.error.message}</p>
          <button className="sbe-button" type="button" onClick={refreshAll}>다시 불러오기</button>
        </section>
      </main>
    );
  }

  const experiments = overview.data?.experiments ?? [];
  const detail = experiment.data;
  return (
    <main className="sbe-main">
      <header className="sbe-header">
        <div>
          <p className="sbe-eyebrow">Spacebogam · Experiment operations</p>
          <h1 className="sbe-title">실험 운영 대장</h1>
          <p className="sbe-subtitle">
            가설부터 상담 결과, 병목 진단, 에이전트 전략과 승인까지 한 페이지에서
            관리합니다. 화면 데이터는 60초마다 자동 갱신됩니다.
          </p>
        </div>
        <div className="sbe-header-actions">
          <span className="sbe-status"><span className="sbe-dot" />{updatedLabel}</span>
          <a className="sbe-link" {...navigation.linkProps("/analytics/funnel")}>퍼널 분석</a>
          <a className="sbe-link" {...navigation.linkProps("/decisions")}>의사결정</a>
          {detail?.experiment.linkedIssueId ? (
            <a
              className="sbe-link"
              {...navigation.linkProps(`/issues/${detail.experiment.linkedIssueId}`)}
            >
              운영 이슈
            </a>
          ) : null}
        </div>
      </header>
      {!overview.data?.configured ? (
        <div className="sbe-banner">
          <span>리드 결과 기록을 사용하려면 플러그인 설정에서 회사 전용 해시 비밀을 연결해야 합니다.</span>
          <a className="sbe-link" {...navigation.linkProps("/company/settings/instance/plugins")}>플러그인 설정</a>
        </div>
      ) : null}
      {experiments.length === 0 ? (
        <EmptyState refreshAll={refreshAll} />
      ) : (
        <div className="sbe-workspace">
          <section className="sbe-panel">
            <div className="sbe-selector" role="tablist" aria-label="실험 선택">
              {experiments.map((item) => (
                <button
                  className={`sbe-tab ${item.id === selectedId ? "active" : ""}`}
                  id={`experiment-${item.id}`}
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            {detail ? (
              <ExperimentSummary detail={detail} />
            ) : (
              <div className="sbe-empty">선택한 실험의 집계를 불러오는 중…</div>
            )}
          </section>
          {detail ? (
            <aside className="sbe-rail" aria-label="실험 운영 도구">
              <InsightPanel detail={detail} />
              {detail.variants.length < 2 ? (
                <section className="sbe-panel sbe-rail-section">
                  <VariantSetup detail={detail} refreshAll={refreshAll} />
                </section>
              ) : null}
              <section className="sbe-panel sbe-rail-section">
                <OperationsPanel
                  detail={detail}
                  options={options.data}
                  refreshAll={refreshAll}
                />
              </section>
              <section className="sbe-panel sbe-rail-section">
                <EntryPanel
                  detail={detail}
                  configured={overview.data?.configured ?? false}
                  refreshAll={refreshAll}
                />
              </section>
              <section className="sbe-panel sbe-rail-section">
                <CreateExperimentPanel refreshAll={refreshAll} compact />
              </section>
            </aside>
          ) : null}
        </div>
      )}
    </main>
  );
}

export function SpacebogamExperimentsPage({ context }: PluginPageProps) {
  if (!context.companyId) {
    return <div className="sbe-shell"><style>{experimentStyles}</style><main className="sbe-main">회사를 선택하세요.</main></div>;
  }
  return (
    <div className="sbe-shell">
      <style>{experimentStyles}</style>
      <CompanyExperimentPage companyId={context.companyId} />
    </div>
  );
}
