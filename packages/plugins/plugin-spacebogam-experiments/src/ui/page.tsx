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
import { ActionFeedback } from "./action-feedback.js";
import { useBoardAction } from "./action-hook.js";
import {
  SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
  normalizeBridgeError,
  normalizeExperimentDetailResponse,
  normalizeOverviewResponse,
} from "./api.js";
import {
  DataNotice,
  EmptyExperimentState,
  MeasurementWarning,
  PageHeader,
  StaleDataBanner,
} from "./data-state-view.js";
import { EntryDrawerPanel } from "./entry-panel.js";
import { ExperimentSummary } from "./experiment-summary.js";
import { selectOperationalExperiments } from "./experiment-visibility.js";
import { InsightPanel } from "./insight-panel.js";
import { LegacyHistoryBanner } from "./legacy-history-banner.js";
import { OperationsPanel } from "./operations-panel.js";
import { experimentStyles } from "./theme.js";
import type {
  OverviewData,
  OperationsOptions,
} from "./types.js";
import { VariantSetup } from "./variant-setup.js";

type SelectedExperiment = {
  readonly companyId: string;
  readonly experimentId: string | null;
};

const EXPERIMENT_HASH_PREFIX = "#experiment-";
const EXPERIMENT_HASH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function readExperimentHash() {
  if (typeof window === "undefined") return null;
  const rawHash = window.location.hash;
  if (!rawHash.startsWith(EXPERIMENT_HASH_PREFIX)) return null;
  const encodedId = rawHash.slice(EXPERIMENT_HASH_PREFIX.length);
  try {
    const experimentId = decodeURIComponent(encodedId);
    return EXPERIMENT_HASH_ID_PATTERN.test(experimentId) ? experimentId : null;
  } catch {
    return null;
  }
}

function useLoadedAt(data: unknown) {
  const [loadedAtMs, setLoadedAtMs] = useState<number | null>(() => (
    data === null || data === undefined ? null : Date.now()
  ));
  useEffect(() => {
    if (data !== null && data !== undefined) setLoadedAtMs(Date.now());
  }, [data]);
  return loadedAtMs;
}

function CompanyExperimentPage({ companyId }: { companyId: string }) {
  const navigation = useHostNavigation();
  const overview = usePluginData<unknown>("overview", { companyId });
  const options = usePluginData<OperationsOptions>("operations-options", {
    companyId,
  });
  const [selection, setSelection] = useState<SelectedExperiment>(() => ({
    companyId,
    experimentId: readExperimentHash(),
  }));
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const selectedId = selection.companyId === companyId ? selection.experimentId : null;
  const experiment = usePluginData<unknown>("experiment", {
    companyId,
    experimentId: selectedId ?? undefined,
  });
  const overviewLoadedAtMs = useLoadedAt(overview.data);
  const experimentLoadedAtMs = useLoadedAt(experiment.data);

  const refreshAll = useCallback(() => {
    overview.refresh();
    options.refresh();
    experiment.refresh();
  }, [experiment, options, overview]);
  const legacyAction = useBoardAction(refreshAll);

  const nowMs = Date.now();
  const overviewState = normalizeOverviewResponse(overview.data, {
    loadedAtMs: overviewLoadedAtMs ?? nowMs,
    nowMs,
  });
  const experimentState = normalizeExperimentDetailResponse(experiment.data, {
    loadedAtMs: experimentLoadedAtMs ?? nowMs,
    nowMs,
  });
  const overviewData = overviewState.kind === "ready"
    || overviewState.kind === "empty"
    || overviewState.kind === "stale"
    || overviewState.kind === "plugin-not-ready"
    ? overviewState.data
    : null;
  const detail = experimentState.kind === "ready" || experimentState.kind === "stale"
    ? experimentState.data
    : null;
  const experiments = useMemo(
    () => selectOperationalExperiments(overviewData?.experiments ?? []),
    [overviewData],
  );

  useEffect(() => {
    if (selection.companyId !== companyId) {
      setSelection({ companyId, experimentId: readExperimentHash() });
    }
  }, [companyId, selection.companyId]);

  useEffect(() => {
    setEntryDrawerOpen(false);
  }, [companyId, selectedId]);

  useEffect(() => {
    const selectHashExperiment = () => {
      const experimentId = readExperimentHash();
      if (experimentId === null) return;
      setSelection({ companyId, experimentId });
    };
    window.addEventListener("hashchange", selectHashExperiment);
    selectHashExperiment();
    return () => window.removeEventListener("hashchange", selectHashExperiment);
  }, [companyId]);

  useEffect(() => {
    if (selection.companyId !== companyId) return;
    if (
      selectedId === null
      || !experiments.some((candidate) => candidate.id === selectedId)
    ) {
      setSelection({
        companyId,
        experimentId: experiments[0]?.id ?? null,
      });
    }
  }, [companyId, experiments, selectedId, selection.companyId]);

  useEffect(() => {
    const timer = window.setInterval(
      refreshAll,
      SPACEBOGAM_EXPERIMENTS_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const updatedLabel = useMemo(() => {
    const updatedAt = detail?.experiment.updatedAt;
    if (!updatedAt) return "데이터 대기 중";
    return `${new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(updatedAt))} 기준`;
  }, [detail]);

  if (overview.loading && overview.data === null) {
    return <main className="sbe-main">실험 운영 데이터를 불러오는 중…</main>;
  }
  if (overview.error) {
    const error = normalizeBridgeError(overview.error);
    return (
      <main className="sbe-main">
        <DataNotice title="작업자가 실험 운영 데이터를 보내지 못했습니다" refreshAll={refreshAll}>
          {error.message}
        </DataNotice>
      </main>
    );
  }
  if (overviewState.kind === "invalid-response") {
    return (
      <main className="sbe-main">
        <DataNotice title="실험 운영 응답 형식이 올바르지 않습니다" refreshAll={refreshAll}>
          {overviewState.message}
        </DataNotice>
      </main>
    );
  }
  if (overviewState.kind === "plugin-not-ready") {
    return (
      <main className="sbe-main">
        <DataNotice title="Spacebogam 실험 플러그인 설정이 필요합니다" refreshAll={refreshAll}>
          회사 전용 리드 해시 비밀이 연결되지 않았습니다. 플러그인 설정을 마친 뒤 다시 불러오세요.
        </DataNotice>
        <a className="sbe-link" {...navigation.linkProps("/company/settings/instance/plugins")}>플러그인 설정</a>
      </main>
    );
  }

  const detailInvalid = experimentState.kind === "invalid-response";
  const detailWorkerError = experiment.error ? normalizeBridgeError(experiment.error) : null;
  const selectedExperimentMissing = selectedId !== null && experimentState.kind === "no-experiment";

  return (
    <main className="sbe-main">
      <PageHeader
        detail={detail}
        linkProps={navigation.linkProps}
        readinessLabel={readinessLabel(overviewData)}
        configurationLabel={configurationLabel(overviewData)}
        updatedLabel={updatedLabel}
      />
      {overviewData?.legacySource ? (
        <LegacyHistoryBanner
          legacySource={overviewData.legacySource}
          linkProps={navigation.linkProps}
          busy={legacyAction.busy}
          onLink={detail ? () => {
            void legacyAction.run({
              action: "link-legacy-source",
              payload: {
                experimentId: detail.experiment.id,
                legacyIssueId: overviewData.legacySource?.issueId,
                version: detail.experiment.version,
              },
            }, "기존 운영 문서 참조를 실험 이력에 기록했습니다.");
          } : undefined}
          feedback={(
            <ActionFeedback
              error={legacyAction.error}
              message={legacyAction.message}
              recovery={legacyAction.recovery}
            />
          )}
        />
      ) : null}
      {overviewData?.legacySourceStatus === "invalid" ? (
        <div className="sbe-banner" role="alert">
          설정한 기존 운영 문서가 현재 회사에 없거나 접근할 수 없습니다. 플러그인 설정에서 같은 회사의 이슈를 선택하세요.
        </div>
      ) : null}
      {overviewState.kind === "stale" || experimentState.kind === "stale" ? (
        <StaleDataBanner refreshAll={refreshAll} />
      ) : null}
      {detail ? <MeasurementWarning detail={detail} /> : null}
      {overviewState.kind === "empty" ? (
        <EmptyExperimentState refreshAll={refreshAll} />
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
                  onClick={() => setSelection({ companyId, experimentId: item.id })}
                >
                  {item.title}
                </button>
              ))}
            </div>
            {detail ? (
              <ExperimentSummary detail={detail} />
            ) : detailWorkerError ? (
              <DataNotice title="선택한 실험 집계를 불러오지 못했습니다" refreshAll={refreshAll}>
                {detailWorkerError.message}
              </DataNotice>
            ) : detailInvalid ? (
              <DataNotice title="선택한 실험 응답 형식이 올바르지 않습니다" refreshAll={refreshAll}>
                {experimentState.message}
              </DataNotice>
            ) : selectedExperimentMissing ? (
              <DataNotice title="선택한 실험을 찾을 수 없습니다" refreshAll={refreshAll}>
                실험 목록을 다시 불러온 뒤 운영할 실험을 다시 선택하세요.
              </DataNotice>
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
                <div className="sbe-form">
                  <h3>상담 결과 기록</h3>
                  <p className="sbe-help">상담 결과는 필요할 때 열어 기록합니다.</p>
                  <button
                    className="sbe-button"
                    type="button"
                    onClick={() => setEntryDrawerOpen(true)}
                  >
                    상담 결과 기록 열기
                  </button>
                </div>
              </section>
              <section className="sbe-panel sbe-rail-section">
                <CreateExperimentPanel refreshAll={refreshAll} compact />
              </section>
            </aside>
          ) : null}
        </div>
      )}
      {detail ? (
        <EntryDrawerPanel
          detail={detail}
          configured={overviewData?.configured ?? false}
          refreshAll={refreshAll}
          open={entryDrawerOpen}
          onClose={() => setEntryDrawerOpen(false)}
        />
      ) : null}
    </main>
  );
}

function readinessLabel(overviewData: OverviewData | null) {
  return overviewData?.status === "ready" ? "준비됨" : "준비 확인 중";
}

function configurationLabel(overviewData: OverviewData | null) {
  return overviewData?.configured ? "설정 완료" : "설정 필요";
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
