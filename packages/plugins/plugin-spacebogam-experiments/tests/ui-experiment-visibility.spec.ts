import { describe, expect, it } from "vitest";

import { selectOperationalExperiments } from "../src/ui/experiment-visibility.js";
import type { Experiment, ExperimentStatus } from "../src/ui/types.js";

function experiment(id: string, status: ExperimentStatus): Experiment {
  return {
    id,
    companyId: "company-1",
    title: `실험 ${id}`,
    hypothesis: "가설",
    status,
    minimumSamplePerVariant: 30,
    version: 1,
    updatedAt: "2026-07-27T03:00:00.000Z",
  };
}

describe("operational experiment visibility", () => {
  it("hides cancelled experiments from the primary operating surface", () => {
    // Given
    const experiments = [
      experiment("draft", "draft"),
      experiment("cancelled", "cancelled"),
      experiment("running", "running"),
    ];

    // When
    const visible = selectOperationalExperiments(experiments);

    // Then
    expect(visible.map((item) => item.id)).toEqual(["draft", "running"]);
  });

  it("keeps completed experiments available as operating history", () => {
    // Given
    const experiments = [
      experiment("completed", "completed"),
      experiment("cancelled", "cancelled"),
    ];

    // When
    const visible = selectOperationalExperiments(experiments);

    // Then
    expect(visible.map((item) => item.id)).toEqual(["completed"]);
  });
});
