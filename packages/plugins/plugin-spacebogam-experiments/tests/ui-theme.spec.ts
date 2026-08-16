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

  it("keeps observation metadata, summary, and timestamp in distinct columns", () => {
    expect(experimentStyles).toContain(
      "grid-template-columns:72px minmax(0,1fr) auto;",
    );
  });

  it("wraps long observation summaries without widening the main content column", () => {
    expect(experimentStyles).toContain(
      ".sbe-panel{min-width:0;",
    );
    expect(experimentStyles).toContain(
      ".sbe-summary{min-width:0;",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations{min-width:0;display:grid;grid-template-columns:180px minmax(0,1fr);",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations ol{min-width:0;",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations li{min-width:0;display:grid;grid-template-columns:72px minmax(0,1fr) auto;",
    );
    expect(experimentStyles).toContain(
      ".sbe-observations li p{min-width:0;overflow-wrap:anywhere;",
    );
  });
});
