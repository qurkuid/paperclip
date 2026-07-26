import {
  useHostNavigation,
  usePluginData,
  type PluginRouteSidebarProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";

import { ROUTE_PATH } from "../manifest.js";
import { selectOperationalExperiments } from "./experiment-visibility.js";
import type { OverviewData } from "./types.js";

function TargetIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
    </svg>
  );
}

export function SpacebogamExperimentsSidebar({ context }: PluginSidebarProps) {
  const navigation = useHostNavigation();
  if (!context.companyId) return null;
  return (
    <a
      {...navigation.linkProps(`/${ROUTE_PATH}`)}
      className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
      style={{ textDecoration: "none" }}
    >
      <TargetIcon />
      <span className="flex-1 truncate">실험 운영</span>
    </a>
  );
}

function CompanyRouteSidebar({ companyId }: { companyId: string }) {
  const navigation = useHostNavigation();
  const overview = usePluginData<OverviewData>("overview", { companyId });
  const experiments = selectOperationalExperiments(
    overview.data?.experiments ?? [],
  );
  return (
    <nav className="sbe-nav" aria-label="실험 운영 탐색">
      <div className="sbe-nav-title">실험 운영</div>
      <a className="sbe-nav-link" {...navigation.linkProps(`/${ROUTE_PATH}`)}>
        <TargetIcon />
        전체 현황
      </a>
      <a className="sbe-nav-link" {...navigation.linkProps("/analytics/funnel")}>
        퍼널 분석
      </a>
      <a className="sbe-nav-link" {...navigation.linkProps("/decisions")}>
        의사결정
      </a>
      {experiments.map((experiment) => (
        <a
          className="sbe-nav-item"
          key={experiment.id}
          href={`#experiment-${experiment.id}`}
        >
          {experiment.title} · {experiment.status}
        </a>
      ))}
    </nav>
  );
}

export function SpacebogamExperimentsRouteSidebar({
  context,
}: PluginRouteSidebarProps) {
  if (!context.companyId) return null;
  return <CompanyRouteSidebar companyId={context.companyId} />;
}
