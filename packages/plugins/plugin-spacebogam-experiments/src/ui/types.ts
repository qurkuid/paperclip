export type ExperimentStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export type Experiment = {
  id: string;
  companyId: string;
  title: string;
  hypothesis: string;
  status: ExperimentStatus;
  minimumSamplePerVariant: number;
  targetLift?: number | null;
  linkedIssueId?: string | null;
  responsibleAgentId?: string | null;
  version: number;
  updatedAt: string;
};

export type Variant = {
  id: string;
  key: string;
  name: string;
  description: string;
  isControl: boolean;
  sortOrder: number;
};

export type VariantMetric = {
  variantId: string;
  key: string;
  isControl: boolean;
  sample: number;
  won: number;
  lost: number;
  pending: number;
  disqualified: number;
  resolved: number;
  wonRate: number | null;
  absoluteDeltaFromControl: number | null;
  relativeLiftFromControl: number | null;
};

export type Snapshot = {
  id: string;
  recordedAt: string;
  variantMetrics: VariantMetric[];
  funnelDataThrough: string | null;
  funnelQuality: string | null;
  source: string;
};

export type Observation = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
};

export type ExperimentDetail = {
  experiment: Experiment;
  variants: Variant[];
  variantMetrics: VariantMetric[];
  snapshots: Snapshot[];
  recentObservations: Observation[];
};

export type OverviewData = {
  pluginId: string;
  companyId: string;
  status: string;
  configured: boolean;
  experiments: Experiment[];
};

export type OperationsOptions = {
  agents: Array<{
    id: string;
    name: string;
    title: string | null;
    status: string;
  }>;
  issues: Array<{
    id: string;
    identifier: string | null;
    title: string;
    status: string;
  }>;
  routine: {
    resolutionStatus: string;
    id: string | null;
    status: string;
    assigneeAgentId: string | null;
  };
};

export type BoardAction = {
  action: string;
  payload: Record<string, unknown>;
};

export type RefreshAll = () => void;
