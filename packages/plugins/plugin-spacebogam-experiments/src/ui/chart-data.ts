import type { ExperimentDetail } from "./types.js";

export type VariantResultRow = {
  variantId: string;
  key: string;
  name: string;
  isControl: boolean;
  sample: number;
  won: number;
  lost: number;
  pending: number;
  disqualified: number;
  resolved: number;
  wonRate: number | null;
  progressPercent: number;
};

export function buildVariantResultRows(
  detail: ExperimentDetail,
): readonly VariantResultRow[] {
  const target = detail.experiment.minimumSamplePerVariant;
  return detail.variantMetrics.map((metric) => ({
    variantId: metric.variantId,
    key: metric.key,
    name:
      detail.variants.find((variant) => variant.id === metric.variantId)?.name ??
      metric.key,
    isControl: metric.isControl,
    sample: metric.sample,
    won: metric.won,
    lost: metric.lost,
    pending: metric.pending,
    disqualified: metric.disqualified,
    resolved: metric.resolved,
    wonRate: metric.wonRate,
    progressPercent: Math.min((metric.sample / target) * 100, 100),
  }));
}
