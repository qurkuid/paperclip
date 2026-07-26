import type { Experiment } from "./types.js";

export function selectOperationalExperiments(
  experiments: readonly Experiment[],
): readonly Experiment[] {
  return experiments.filter((experiment) => experiment.status !== "cancelled");
}
