// @vitest-environment jsdom
import { Chart as ChartJS } from "chart.js";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExperimentCharts } from "../src/ui/charts.js";
import type {
  ExperimentDetail,
  Snapshot,
  Variant,
  VariantMetric,
} from "../src/ui/types.js";

function createCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = {
    addColorStop: () => undefined,
  } as CanvasGradient;
  const textMetrics = {
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
    width: 48,
  } as TextMetrics;
  const context = {
    canvas,
    fillStyle: "#000000",
    font: "12px sans-serif",
    lineCap: "butt",
    lineDashOffset: 0,
    lineJoin: "miter",
    lineWidth: 1,
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    arc: () => undefined,
    beginPath: () => undefined,
    bezierCurveTo: () => undefined,
    clearRect: () => undefined,
    clip: () => undefined,
    closePath: () => undefined,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fill: () => undefined,
    fillRect: () => undefined,
    fillText: () => undefined,
    getLineDash: () => [],
    lineTo: () => undefined,
    measureText: () => textMetrics,
    moveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    rect: () => undefined,
    resetTransform: () => undefined,
    restore: () => undefined,
    rotate: () => undefined,
    save: () => undefined,
    scale: () => undefined,
    setLineDash: () => undefined,
    setTransform: () => undefined,
    stroke: () => undefined,
    strokeRect: () => undefined,
    strokeText: () => undefined,
    translate: () => undefined,
  } as CanvasRenderingContext2D;

  return context;
}

function fixedVariantMetrics(): [Variant[], VariantMetric[]] {
  const variants: Variant[] = [
    {
      id: "variant-control",
      key: "control",
      name: "기존 문구",
      description: "",
      isControl: true,
      sortOrder: 0,
    },
    {
      id: "variant-clean",
      key: "clean",
      name: "개선 문구",
      description: "",
      isControl: false,
      sortOrder: 1,
    },
  ];

  const metrics: VariantMetric[] = [
    {
      variantId: "variant-control",
      key: "control",
      isControl: true,
      sample: 15,
      won: 2,
      lost: 5,
      pending: 2,
      disqualified: 1,
      resolved: 7,
      wonRate: 0.2857,
      absoluteDeltaFromControl: 0,
      relativeLiftFromControl: 0,
    },
    {
      variantId: "variant-clean",
      key: "clean",
      isControl: false,
      sample: 30,
      won: 10,
      lost: 8,
      pending: 12,
      disqualified: 0,
      resolved: 18,
      wonRate: 0.5556,
      absoluteDeltaFromControl: 0.27,
      relativeLiftFromControl: 0.94,
    },
  ];

  return [variants, metrics];
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const [, variantMetrics] = fixedVariantMetrics();

  return {
    id: "snapshot-1",
    recordedAt: "2026-07-27T12:00:00.000Z",
    variantMetrics,
    funnelDataThrough: null,
    funnelQuality: null,
    source: "manual",
    ...overrides,
  };
}

function detail(): ExperimentDetail {
  const [variants, variantMetrics] = fixedVariantMetrics();

  return {
    experiment: {
      id: "experiment-1",
      companyId: "company-1",
      title: "문구 테스트",
      hypothesis: "문구 변경으로 계약률이 올라간다",
      status: "running",
      minimumSamplePerVariant: 30,
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    variants,
    variantMetrics,
    snapshots: [
      snapshot({ id: "snapshot-early", recordedAt: "2026-07-26T12:00:00.000Z" }),
      snapshot({ id: "snapshot-late", recordedAt: "2026-07-27T12:00:00.000Z" }),
    ],
    recentObservations: [],
  };
}

describe("Chart.js runtime registry", () => {
  let container: HTMLDivElement;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let getContext: ReturnType<typeof vi.spyOn>;
  let root: ReturnType<typeof createRoot>;
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {
        return undefined;
      }

      observe() {
        return undefined;
      }

      unobserve() {
        return undefined;
      }
    };
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function getContextMock(contextId: string) {
        return contextId === "2d" ? createCanvasContext(this) : null;
      });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    globalThis.ResizeObserver = originalResizeObserver;
    consoleError.mockRestore();
    getContext.mockRestore();
  });

  it("registers every element, controller, and scale required by the rendered charts", () => {
    expect(ChartJS.registry.getElement("arc").id).toBe("arc");
    expect(ChartJS.registry.getElement("bar").id).toBe("bar");
    expect(ChartJS.registry.getElement("line").id).toBe("line");
    expect(ChartJS.registry.getElement("point").id).toBe("point");
    expect(ChartJS.registry.getController("bar").id).toBe("bar");
    expect(ChartJS.registry.getController("doughnut").id).toBe("doughnut");
    expect(ChartJS.registry.getController("line").id).toBe("line");
    expect(ChartJS.registry.getScale("category").id).toBe("category");
    expect(ChartJS.registry.getScale("linear").id).toBe("linear");
  });

  it("mounts comparison, overall mix, sample guardrail, and cumulative trend charts without registry errors", () => {
    act(() => {
      root.render(<ExperimentCharts detail={detail()} />);
    });

    const charts = Array.from(container.querySelectorAll(".sbe-canvas canvas"));
    const instances = Object.values(ChartJS.instances);
    const comparison = instances.find((instance) => instance.canvas === charts[0]);
    const doughnut = instances.find((instance) => instance.canvas === charts[1]);
    expect(charts).toHaveLength(4);
    expect(comparison?.data.datasets[0]?.backgroundColor).toBe("#176b4d");
    expect(doughnut?.config.type).toBe("doughnut");
    expect(Object.keys(doughnut?.config.options.scales ?? {})).toEqual([]);
    expect(Object.keys(doughnut?.scales ?? {})).toEqual([]);
    expect(getContext).toHaveReturned();
    expect(container.textContent).toContain("그룹 계약 전환 비교");
    expect(container.textContent).toContain("전체 결과 구성");
    expect(container.textContent).toContain("표본·guardrail 진행");
    expect(container.textContent).toContain("누적 전환 추세");
    expect(consoleError.mock.calls.flat().join("\n")).not.toMatch(
      /arc|element|controller|scale|not registered/i,
    );
  });
});
