import { describe, expect, it } from "vitest";

import { experimentStyles } from "../src/ui/theme.js";

describe("experiment board layout", () => {
  it("allows Chart.js grid items to shrink beside the operations rail", () => {
    expect(experimentStyles).toContain(
      "grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)",
    );
    expect(experimentStyles).toContain(
      ".sbe-chart{min-width:0;",
    );
  });

  it("keeps long observation kinds and summaries inside the operations log", () => {
    expect(experimentStyles).toContain(
      "grid-template-columns:minmax(0,72px) minmax(0,1fr) auto",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations li span{min-width:0;overflow-wrap:anywhere",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations li p{min-width:0;overflow-wrap:anywhere",
    );
  });
});
