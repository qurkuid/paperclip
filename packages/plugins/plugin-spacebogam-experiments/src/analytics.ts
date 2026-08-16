import { z } from "zod";
import {
  FUNNEL_QUALITIES,
  experimentProjectionSchema,
  experimentSchema,
  observationSchema,
  persistedEntrySchema,
  variantMetricSchema,
  variantSchema,
  type Experiment,
  type ExperimentProjection,
  type Observation,
  type PersistedEntry,
  type ReadinessState,
  type Variant,
  type VariantMetric,
} from "./contracts/index.js";


const timestampSchema = z.string().datetime({ offset: true });
const funnelFreshnessSchema = z.object({
  quality: z.enum(FUNNEL_QUALITIES).nullable(),
  dataThrough: timestampSchema.nullable(),
  generatedAt: timestampSchema.nullable(),
}).strict();

type FunnelFreshness = Readonly<z.infer<typeof funnelFreshnessSchema>>;

type ProjectionInput = {
  readonly experiment: unknown;
  readonly variants: readonly unknown[];
  readonly entries: readonly unknown[];
  readonly observations: readonly unknown[];
  readonly currentTime: unknown;
  readonly funnel: unknown;
};

const STALE_RECORD_MS = 7 * 24 * 60 * 60 * 1000;

export function buildExperimentProjection(input: ProjectionInput): ExperimentProjection {
  const experiment = experimentSchema.parse(input.experiment);
  const variants = input.variants.map((variant) => variantSchema.parse(variant));
  const entries = input.entries.map((entry) => persistedEntrySchema.parse(entry));
  const observations = input.observations.map((observation) => observationSchema.parse(observation));
  const currentTime = timestampSchema.parse(input.currentTime);
  const funnel = funnelFreshnessSchema.parse(input.funnel);
  const variantMetrics = aggregateVariantMetrics(variants, entries);
  const readiness = determineReadiness({
    experiment,
    variantMetrics,
    funnelQuality: funnel.quality,
    currentTime,
  });

  const projection = {
    experiment,
    variants,
    variantMetrics,
    readiness,
    freshness: {
      experimentUpdatedAt: experiment.updatedAt,
      funnelDataThrough: funnel.dataThrough,
      funnelGeneratedAt: funnel.generatedAt,
      funnelQuality: funnel.quality,
    },
    recentObservations: observations,
  } satisfies ExperimentProjection;

  return experimentProjectionSchema.parse(projection);
}

export function aggregateVariantMetrics(
  variants: readonly Variant[],
  entries: readonly PersistedEntry[],
): VariantMetric[] {
  const control = variants.find((variant) => variant.isControl);
  const baseMetrics = variants.map((variant) => countVariant(variant, entries));
  const controlMetric = control ? baseMetrics.find((metric) => metric.variantId === control.id) : undefined;
  const controlRate = controlMetric?.wonRate ?? null;

  return baseMetrics.map((metric) =>
    variantMetricSchema.parse({
      ...metric,
      absoluteDeltaFromControl: deltaFromControl(metric.wonRate, controlRate),
      relativeLiftFromControl: liftFromControl(metric.wonRate, controlRate),
    }),
  );
}

function countVariant(variant: Variant, entries: readonly PersistedEntry[]): VariantMetric {
  const matchingEntries = entries.filter((entry) => entry.variantId === variant.id);
  const won = matchingEntries.filter((entry) => entry.outcome === "won").length;
  const lost = matchingEntries.filter((entry) => entry.outcome === "lost").length;
  const pending = matchingEntries.filter((entry) => entry.outcome === "pending").length;
  const disqualified = matchingEntries.filter((entry) => entry.outcome === "disqualified").length;
  const resolved = won + lost;

  return variantMetricSchema.parse({
    variantId: variant.id,
    key: variant.key,
    isControl: variant.isControl,
    sample: matchingEntries.length,
    won,
    lost,
    pending,
    disqualified,
    resolved,
    wonRate: resolved === 0 ? null : won / resolved,
    absoluteDeltaFromControl: null,
    relativeLiftFromControl: null,
  });
}

function deltaFromControl(wonRate: number | null, controlRate: number | null): number | null {
  if (wonRate === null || controlRate === null) return null;
  return wonRate - controlRate;
}

function liftFromControl(wonRate: number | null, controlRate: number | null): number | null {
  const delta = deltaFromControl(wonRate, controlRate);
  if (delta === null || controlRate === null || controlRate === 0) return null;
  return delta / controlRate;
}

function determineReadiness(input: {
  readonly experiment: Experiment;
  readonly variantMetrics: readonly VariantMetric[];
  readonly funnelQuality: FunnelFreshness["quality"];
  readonly currentTime: string;
}): ReadinessState {
  switch (input.experiment.status) {
    case "completed":
      return "recorded";
    case "draft":
    case "running":
    case "paused":
    case "cancelled":
      break;
    default:
      return assertNever(input.experiment.status);
  }

  if (input.variantMetrics.some((metric) => metric.sample < input.experiment.minimumSamplePerVariant)) {
    return "collecting";
  }
  if (input.funnelQuality === "empty" || input.funnelQuality === "stale" || input.funnelQuality === "invalid_sequence") {
    return "measurement_attention";
  }
  if (isRecordStale(input.experiment.updatedAt, input.currentTime)) {
    return "record_stale";
  }
  return "directional_review";
}

function isRecordStale(updatedAt: string, currentTime: string): boolean {
  return Date.parse(currentTime) - Date.parse(updatedAt) > STALE_RECORD_MS;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected experiment status: ${String(value)}`);
}
