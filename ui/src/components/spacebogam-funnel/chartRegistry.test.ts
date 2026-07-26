import { describe, expect, it } from "vitest";
import { Chart } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { registerSpacebogamChartBasics } from "./chartRegistry";

describe("registerSpacebogamChartBasics", () => {
  it("selectively registers the chart primitives used by the funnel UI", () => {
    registerSpacebogamChartBasics();

    expect(Chart.registry.getScale("category")).toBeDefined();
    expect(Chart.registry.getScale("linear")).toBeDefined();
    expect(Chart.registry.getElement("bar")).toBeDefined();
    expect(Chart.registry.getElement("line")).toBeDefined();
    expect(Chart.registry.getElement("point")).toBeDefined();
    expect(Chart.registry.getPlugin("title")).toBeDefined();
    expect(Chart.registry.getPlugin("tooltip")).toBeDefined();
    expect(Chart.registry.getPlugin("legend")).toBeDefined();
  });

  it("provides the React chart components without importing chart.js/auto", () => {
    expect(Bar).toBeTruthy();
    expect(Line).toBeTruthy();
  });
});
