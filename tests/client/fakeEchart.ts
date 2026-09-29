import { vi } from "vitest";
import * as echarts from "echarts/core";

type Handler = (event: unknown) => void;

/** Stand-in for an ECharts instance; test files must `vi.mock("echarts/core")` with `init` as a `vi.fn()`. */
export function createFakeChart() {
  const handlers: Record<string, Handler> = {};
  const zrHandlers: Record<string, Handler> = {};
  const zr = {
    on: vi.fn((name: string, handler: Handler) => {
      zrHandlers[name] = handler;
    }),
    off: vi.fn(),
  };
  const chart = {
    setOption: vi.fn(),
    on: vi.fn((name: string, handler: Handler) => {
      handlers[name] = handler;
    }),
    off: vi.fn(),
    dispatchAction: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getZr: () => zr,
  };
  vi.mocked(echarts.init).mockReturnValue(chart as unknown as echarts.ECharts);
  return { chart, zr, handlers, zrHandlers };
}

/** jsdom has no canvas 2D context or ResizeObserver; stub both so chart effects run. */
export function enableChartRendering(): void {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({} as CanvasRenderingContext2D);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
}

/** Restores the no-canvas default from tests/setup.ts. */
export function disableChartRendering(): void {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  vi.unstubAllGlobals();
}
