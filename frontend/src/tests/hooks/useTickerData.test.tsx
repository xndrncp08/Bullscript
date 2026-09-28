import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTickerData } from "@/hooks/useTickerData";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { chart: vi.fn(), prediction: vi.fn(), sentiment: vi.fn(), diagnostics: vi.fn() },
  };
});

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const chartFor = (symbol: string) => ({ symbol, candles: [], indicators: [] });

describe("useTickerData", () => {
  beforeEach(() => {
    vi.mocked(api.prediction).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.sentiment).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.diagnostics).mockReturnValue(new Promise(() => {}));
  });

  it("loads each resource independently", async () => {
    vi.mocked(api.chart).mockResolvedValue(chartFor("AAPL"));

    const { result } = renderHook(() => useTickerData("AAPL"));

    await waitFor(() => expect(result.current.chart.status).toBe("success"));
    expect(result.current.chart.data?.symbol).toBe("AAPL");
    // the forecast is still training - it must not hold the chart back
    expect(result.current.prediction.status).toBe("loading");
  });

  it("ignores a slow response for a symbol the user already left", async () => {
    const slowAapl = deferred<ReturnType<typeof chartFor>>();
    const fastTsla = deferred<ReturnType<typeof chartFor>>();
    vi.mocked(api.chart).mockImplementation((symbol: string) =>
      symbol === "AAPL" ? slowAapl.promise : fastTsla.promise
    );

    const { result, rerender } = renderHook(({ symbol }) => useTickerData(symbol), {
      initialProps: { symbol: "AAPL" },
    });
    rerender({ symbol: "TSLA" });

    await act(async () => fastTsla.resolve(chartFor("TSLA")));
    await act(async () => slowAapl.resolve(chartFor("AAPL")));

    expect(result.current.chart.data?.symbol).toBe("TSLA");
    expect(result.current.chart.symbol).toBe("TSLA");
  });

  it("aborts the previous symbol's requests when switching", () => {
    const signals: AbortSignal[] = [];
    vi.mocked(api.chart).mockImplementation((_symbol: string, signal?: AbortSignal) => {
      if (signal) signals.push(signal);
      return new Promise(() => {});
    });

    const { rerender } = renderHook(({ symbol }) => useTickerData(symbol), {
      initialProps: { symbol: "AAPL" },
    });
    rerender({ symbol: "MSFT" });

    expect(signals.at(-2)?.aborted).toBe(true);
    expect(signals.at(-1)?.aborted).toBe(false);
  });

  it("keeps the previous frame while the next symbol loads", async () => {
    const msft = deferred<ReturnType<typeof chartFor>>();
    vi.mocked(api.chart).mockImplementation((symbol: string) =>
      symbol === "AAPL" ? Promise.resolve(chartFor("AAPL")) : msft.promise
    );

    const { result, rerender } = renderHook(({ symbol }) => useTickerData(symbol), {
      initialProps: { symbol: "AAPL" },
    });
    await waitFor(() => expect(result.current.chart.status).toBe("success"));

    rerender({ symbol: "MSFT" });

    expect(result.current.chart.status).toBe("loading");
    expect(result.current.chart.data?.symbol).toBe("AAPL");
  });

  it("reports API errors on the failing resource only", async () => {
    vi.mocked(api.chart).mockRejectedValue(new ApiError("No price history", 404, "/ticker/ZZZZ/chart"));

    const { result } = renderHook(() => useTickerData("ZZZZ"));

    await waitFor(() => expect(result.current.chart.status).toBe("error"));
    expect(result.current.chart.error?.isNotFound).toBe(true);
    expect(result.current.sentiment.status).toBe("loading");
  });

  it("reloads only the model-backed resources on demand", async () => {
    vi.mocked(api.chart).mockResolvedValue(chartFor("AAPL"));
    const { result } = renderHook(() => useTickerData("AAPL"));
    await waitFor(() => expect(result.current.chart.status).toBe("success"));

    vi.mocked(api.chart).mockClear();
    vi.mocked(api.prediction).mockClear();
    vi.mocked(api.diagnostics).mockClear();

    act(() => result.current.reloadModel());

    expect(api.prediction).toHaveBeenCalledTimes(1);
    expect(api.diagnostics).toHaveBeenCalledTimes(1);
    expect(api.chart).not.toHaveBeenCalled();
  });
});
